begin;
create or replace function public.save_substitute_day(p_school_id uuid,p_day_id uuid,p_expected jsonb,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare y uuid; actual jsonb; item record;
begin
  select academic_year_id into y from schedule_substitute_days where id=p_day_id and school_id=p_school_id;
  if y is null then raise exception 'ไม่พบตารางสอนแทนของโรงเรียนนี้'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || y::text,0));
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'substitute_teacher_id',substitute_teacher_id,'leave_type',leave_type,'note',note)),'[]'::jsonb)
    into actual from schedule_substitute_entries where substitute_day_id=p_day_id;
  if not(actual @> p_expected and p_expected @> actual and jsonb_array_length(actual)=jsonb_array_length(p_expected)) then
    raise exception 'มีการแก้ไขตารางสอนแทน กรุณาโหลดใหม่ก่อนบันทึก';
  end if;
  if jsonb_array_length(p_rows)<>jsonb_array_length(actual)
    or (select count(distinct id) from jsonb_to_recordset(p_rows) r(id uuid))<>jsonb_array_length(actual)
    or exists(select 1 from jsonb_to_recordset(p_rows) r(id uuid) where not exists(select 1 from schedule_substitute_entries e where e.id=r.id and e.substitute_day_id=p_day_id)) then
    raise exception 'รายการคาบสอนแทนไม่ตรงกัน กรุณาโหลดใหม่';
  end if;
  -- Clear assignments inside this transaction so swapping two teachers is valid.
  update schedule_substitute_entries set substitute_teacher_id=null where substitute_day_id=p_day_id;
  for item in select * from jsonb_to_recordset(p_rows) r(id uuid,substitute_teacher_id uuid,leave_type text,note text) loop
    if item.leave_type is null or length(item.leave_type)>100 or length(item.note)>1000 then raise exception 'ข้อมูลการลาไม่ถูกต้อง'; end if;
    update schedule_substitute_entries set substitute_teacher_id=item.substitute_teacher_id,leave_type=item.leave_type,note=item.note
      where id=item.id and substitute_day_id=p_day_id;
  end loop;
end; $$;
revoke all on function public.save_substitute_day(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_substitute_day(uuid,uuid,jsonb,jsonb) to service_role;
commit;
