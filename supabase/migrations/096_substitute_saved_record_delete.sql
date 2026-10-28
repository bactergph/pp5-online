-- Delete a reviewed saved record with a full optimistic snapshot. Remaining
-- assignments and their original conflict confirmations are not rewritten.
begin;
create or replace function public.delete_substitute_roster_entries(p_school_id uuid,p_day_id uuid,p_expected jsonb,p_ids uuid[],p_actor uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare y uuid; actual jsonb; deleted integer;
begin
  select academic_year_id into y from schedule_substitute_days where id=p_day_id and school_id=p_school_id;
  if y is null or not exists(select 1 from users where id=p_actor and school_id=p_school_id) then raise exception 'ไม่พบตารางสอนแทนหรือผู้ใช้ของโรงเรียนนี้'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||y::text,0));
  perform 1 from schedule_substitute_days where id=p_day_id and school_id=p_school_id for update;
  if not found then raise exception 'ไม่พบตารางสอนแทนของโรงเรียนนี้'; end if;
  if p_expected is null or jsonb_typeof(p_expected)<>'array' or jsonb_array_length(p_expected)>2000 then raise exception 'ข้อมูลเดิมไม่ถูกต้อง'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'absent_teacher_id',absent_teacher_id,'period',period,'class_subject_id',class_subject_id,'classroom_id',classroom_id,
    'subject_label',nullif(subject_label,''),'room_label',nullif(room_label,''),'substitute_teacher_id',substitute_teacher_id,
    'leave_type',leave_type,'note',nullif(note,''),'override_conflicts',override_conflicts,'conflict_details',conflict_details
  ) order by id),'[]'::jsonb) into actual from schedule_substitute_entries where substitute_day_id=p_day_id;
  if actual is distinct from (select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(p_expected)) then raise exception 'รายการสอนแทนเปลี่ยนแล้ว กรุณาโหลดรายการล่าสุดก่อนลบ'; end if;
  if coalesce(cardinality(p_ids),0)=0 or cardinality(p_ids)>2000
    or (select count(distinct id) from unnest(p_ids) r(id))<>cardinality(p_ids)
    or exists(select 1 from unnest(p_ids) r(id) where not exists(select 1 from schedule_substitute_entries e where e.id=r.id and e.substitute_day_id=p_day_id))
    then raise exception 'ไม่พบรายการสอนแทนที่ต้องการลบ'; end if;
  delete from schedule_substitute_entries where substitute_day_id=p_day_id and id=any(p_ids);
  get diagnostics deleted=row_count;
  return deleted;
end $$;
revoke all on function public.delete_substitute_roster_entries(uuid,uuid,jsonb,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.delete_substitute_roster_entries(uuid,uuid,jsonb,uuid[],uuid) to service_role;
notify pgrst,'reload schema';
commit;
