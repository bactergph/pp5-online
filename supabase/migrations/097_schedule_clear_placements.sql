-- Explicit clearing is deletion only, with a complete snapshot check. Release
-- only removed locks, and update fixed activity/shared-session times atomically.
begin;
create or replace function public.clear_schedule_placements(
 p_school uuid,p_year uuid,p_term int,p_hash text,p_rows jsonb,p_config jsonb,p_unlock boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare actual jsonb; unlocked jsonb; cfg jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table classrooms,class_subjects,subjects,users,evaluation_settings,class_schedule_activities in share row exclusive mode;
 if p_term is null or p_term not in(1,2) or p_unlock is null or not exists(select 1 from academic_years where id=p_year and school_id=p_school)
   or p_hash is null or schedule_snapshot(p_school,p_year,p_term) is distinct from p_hash then
   raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาเปิดหน้าต่างล้างตารางและตรวจสอบใหม่';
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_config) is distinct from 'object' then raise exception 'ข้อมูลการล้างตารางไม่ถูกต้อง'; end if;
 select coalesce(config,'{}') into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
 cfg=coalesce(cfg,'{"days":[1,2,3,4,5],"rooms":[],"rules":{},"reduceGaps":false,"maxContinuous":0}'::jsonb);
 if cfg-'activityGroups'-'teachingGroups' is distinct from p_config-'activityGroups'-'teachingGroups' then raise exception 'การล้างตารางต้องไม่เปลี่ยนภาระสอนหรือการตั้งค่าอื่น'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('classroom_id',s.classroom_id,'academic_year_id',s.academic_year_id,
   'day_of_week',s.day_of_week,'period',s.period,'class_subject_id',s.class_subject_id,'activity_id',s.activity_id,'note',s.note,'locked',s.locked)),'[]')
 into actual from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=p_school and s.academic_year_id=p_year and s.semester=p_term;
 if exists(with previous as materialized(select value from jsonb_array_elements(actual)) select 1 from jsonb_array_elements(p_rows) n left join previous on previous.value=n.value where previous.value is null) then raise exception 'การล้างตารางเพิ่มหรือแก้ไขคาบไม่ได้'; end if;
 if not p_unlock and exists(with proposed as materialized(select value from jsonb_array_elements(p_rows)) select 1 from jsonb_array_elements(actual) r left join proposed on proposed.value=r.value where (r.value->>'locked')::boolean and proposed.value is null) then raise exception 'กรุณาติ๊กยืนยันล้างคาบที่ล็อกไว้ด้วย'; end if;
 -- save_school_schedule_term permits toggling locks, but intentionally refuses
 -- deleting locked rows. Unlock just the explicitly removed rows inside this
 -- transaction, then use its existing validation and optimistic write path.
 update class_schedule_slots s set locked=false where s.academic_year_id=p_year and s.semester=p_term and s.locked
   and exists(select 1 from classrooms c where c.id=s.classroom_id and c.school_id=p_school)
   and not exists(select 1 from jsonb_to_recordset(p_rows) n(classroom_id uuid,day_of_week int,period int) where n.classroom_id=s.classroom_id and n.day_of_week=s.day_of_week and n.period=s.period);
 with proposed as materialized(select value from jsonb_array_elements(p_rows))
 select coalesce(jsonb_agg(case when (r.value->>'locked')::boolean and proposed.value is null then jsonb_set(r.value,'{locked}','false') else r.value end),'[]') into unlocked from jsonb_array_elements(actual) r left join proposed on proposed.value=r.value;
 insert into schedule_plans(school_id,academic_year_id,semester,config) values(p_school,p_year,p_term,p_config)
 on conflict(school_id,academic_year_id,semester) do update set config=excluded.config;
 perform save_school_schedule_term(p_school,p_year,unlocked,p_rows,false,p_term);
end $$;
revoke all on function public.clear_schedule_placements(uuid,uuid,int,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.clear_schedule_placements(uuid,uuid,int,text,jsonb,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
