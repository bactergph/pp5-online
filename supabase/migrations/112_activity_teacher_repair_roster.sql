-- Match the teaching roster used by schedule preparation, including the pending staff rule.
begin;

create or replace function public.repair_schedule_activity_teachers(p_school uuid,p_year uuid,p_term int,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  cfg jsonb;
  removed text[];
begin
  perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
  perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
  lock table users in share mode;

  if p_term is null or p_term not in (1,2)
    or not exists(select 1 from academic_years where id=p_year and school_id=p_school)
    or p_hash is null or schedule_snapshot(p_school,p_year,p_term) is distinct from p_hash then
    raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนปรับปรุงรายชื่อ';
  end if;

  select config into cfg from schedule_plans
  where school_id=p_school and academic_year_id=p_year and semester=p_term
  for update;
  if not found then
    raise exception 'ไม่พบข้อมูลกิจกรรมในปีและภาคเรียนนี้';
  end if;

  select array_agg(r.teacher_id) into removed
  from activity_plan_teacher_ids(cfg) r
  where not exists (
    select 1 from users u
    where u.id::text=r.teacher_id and u.school_id=p_school
      and (u.is_active or u.email like 'pending-%')
      and u.role in ('teacher','academic_head','deputy_principal','principal')
  );
  if coalesce(cardinality(removed),0)>0 then
    update schedule_plans set config=remove_activity_teacher_refs(cfg,removed)
    where school_id=p_school and academic_year_id=p_year and semester=p_term;
  end if;
  return jsonb_build_object('removed',coalesce(cardinality(removed),0));
end $$;

revoke all on function public.repair_schedule_activity_teachers(uuid,uuid,int,text) from public,anon,authenticated;
grant execute on function public.repair_schedule_activity_teachers(uuid,uuid,int,text) to service_role;
notify pgrst,'reload schema';
commit;
