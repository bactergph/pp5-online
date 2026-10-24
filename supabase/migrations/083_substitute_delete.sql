begin;
-- Delete only substitute records. Timetables, subjects and teachers are untouched.
create or replace function public.delete_substitute_entries(p_school_id uuid,p_day_id uuid,p_expected jsonb,p_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare y uuid; actual jsonb;
begin
  select academic_year_id into y from schedule_substitute_days where id=p_day_id and school_id=p_school_id;
  if y is null then raise exception 'ไม่พบตารางสอนแทนของโรงเรียนนี้'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || y::text,0));
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'substitute_teacher_id',substitute_teacher_id,'leave_type',leave_type,'note',note)),'[]'::jsonb)
    into actual from schedule_substitute_entries where substitute_day_id=p_day_id;
  if p_expected is null or jsonb_typeof(p_expected)<>'array' then raise exception 'ข้อมูลเดิมไม่ถูกต้อง'; end if;
  if not(actual @> p_expected and p_expected @> actual and jsonb_array_length(actual)=jsonb_array_length(p_expected)) then
    raise exception 'มีการแก้ไขตารางสอนแทน กรุณาโหลดใหม่ก่อนลบ';
  end if;
  if coalesce(cardinality(p_ids),0)=0
    or (select count(distinct id) from unnest(p_ids) r(id))<>cardinality(p_ids)
    or exists(select 1 from unnest(p_ids) r(id) where not exists(select 1 from schedule_substitute_entries e where e.id=r.id and e.substitute_day_id=p_day_id)) then
    raise exception 'ไม่พบรายการสอนแทนที่ต้องการลบ';
  end if;
  delete from schedule_substitute_entries where substitute_day_id=p_day_id and id=any(p_ids);
end; $$;
revoke all on function public.delete_substitute_entries(uuid,uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.delete_substitute_entries(uuid,uuid,jsonb,uuid[]) to service_role;
notify pgrst, 'reload schema';
commit;
