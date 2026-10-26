-- Atomic manual joint-cell edits use the same snapshot and writer as drafts.
begin;
create or replace function public.save_schedule_joint_lock(p_school uuid,p_year uuid,p_term int,p_hash text,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare expected_rows jsonb=p_expected; old_cell jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 if p_hash is distinct from schedule_snapshot(p_school,p_year,p_term) then raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดคาบล่าสุดก่อนล็อกสอนรวม'; end if;
 -- The established writer permits toggling a lock, but deleting a locked cell
 -- first requires an explicit unlock. Keep that unlock and removal atomic,
 -- and limit it to offerings in an explicitly configured joint group.
 if p_allow_unlock then
   for old_cell in select old from jsonb_array_elements(p_expected) old where (old->>'locked')::boolean
     and not exists(select 1 from jsonb_array_elements(p_rows) n where n-'locked'=old-'locked') loop
     if coalesce(joint_teaching_event(p_school,p_year,p_term,(old_cell->>'class_subject_id')::uuid),'') not like 'teaching:%' then raise exception 'ปลดล็อกได้เฉพาะคาบสอนรวมที่ยืนยัน'; end if;
     update class_schedule_slots s set locked=false from classrooms c where c.id=s.classroom_id and c.school_id=p_school and s.academic_year_id=p_year and s.semester=p_term
       and s.classroom_id=(old_cell->>'classroom_id')::uuid and s.day_of_week=(old_cell->>'day_of_week')::int and s.period=(old_cell->>'period')::int;
     select jsonb_agg(case when row=old_cell then jsonb_set(row,'{locked}','false'::jsonb) else row end) into expected_rows from jsonb_array_elements(expected_rows) row;
   end loop;
 end if;
 perform save_school_schedule_term(p_school,p_year,expected_rows,p_rows,p_allow_unlock,p_term);
end $$;
revoke all on function public.save_schedule_joint_lock(uuid,uuid,int,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_schedule_joint_lock(uuid,uuid,int,text,jsonb,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
