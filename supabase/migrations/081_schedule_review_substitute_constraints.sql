-- Readiness and commit must use the same substitute-teacher constraints.
-- No existing schedule, plan, score or draft is rewritten.
begin;
do $$ begin
  if to_regprocedure('public.schedule_snapshot_before_081(uuid,uuid,integer)') is null then
    alter function public.schedule_snapshot(uuid,uuid,integer) rename to schedule_snapshot_before_081;
  end if;
  if to_regprocedure('public.save_school_schedule_term_before_081(uuid,uuid,jsonb,jsonb,boolean,integer)') is null then
    alter function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,integer) rename to save_school_schedule_term_before_081;
  end if;
end $$;

create or replace function public.schedule_snapshot(p_school uuid,p_year uuid,p_term int)
returns text language sql stable security definer set search_path=public as $$
  select md5(jsonb_build_array(
    schedule_snapshot_before_081(p_school,p_year,p_term),
    (select jsonb_agg(to_jsonb(d) order by d.id) from schedule_substitute_days d
      where d.school_id=p_school and d.academic_year_id=p_year and d.semester=p_term),
    (select jsonb_agg(to_jsonb(e) order by e.id) from schedule_substitute_entries e
      join schedule_substitute_days d on d.id=e.substitute_day_id
      where d.school_id=p_school and d.academic_year_id=p_year and d.semester=p_term)
  )::text)
$$;

create or replace function public.save_school_schedule_term(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false,p_semester integer default 1)
returns void language plpgsql security definer set search_path=public as $$
begin
  -- The established writer acquires school/year locks and validates scope,
  -- snapshots, locks, room/teacher collisions, activities and lesson patterns.
  perform save_school_schedule_term_before_081(p_school_id,p_year_id,p_expected,p_rows,p_allow_unlock,p_semester);
  if exists (
    select 1 from activity_team_teaching(p_school_id,p_year_id,p_semester,p_rows) t
      join schedule_substitute_entries e on e.substitute_teacher_id=t.teacher_id and e.period=t.period
      join schedule_substitute_days d on d.id=e.substitute_day_id
    where d.school_id=p_school_id and d.academic_year_id=p_year_id and d.semester=p_semester
      and d.day_of_week=t.day_of_week
  ) then raise exception 'ครูมีคาบสอนแทนในช่วงนี้ กรุณาตรวจตารางสอนแทนก่อนบันทึก'; end if;
end $$;

revoke all on function public.schedule_snapshot_before_081(uuid,uuid,integer),public.save_school_schedule_term_before_081(uuid,uuid,jsonb,jsonb,boolean,integer) from public,anon,authenticated;
revoke all on function public.schedule_snapshot(uuid,uuid,integer),public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,integer) from public,anon,authenticated;
grant execute on function public.schedule_snapshot(uuid,uuid,integer),public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,integer) to service_role;
notify pgrst,'reload schema';
commit;
