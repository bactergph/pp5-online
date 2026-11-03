-- Switching the active year must not leave a school with no active year if a write fails.
begin;
create or replace function public.set_school_active_year(p_school uuid,p_year uuid)
returns void language plpgsql set search_path=public as $$
begin
  if p_school is null or p_year is null then raise exception 'กรุณาเลือกโรงเรียนและปีการศึกษา'; end if;
  perform pg_advisory_xact_lock(hashtextextended('academic-year:'||p_school::text,0));
  if not exists(select 1 from public.academic_years y where y.id=p_year and y.school_id=p_school) then
    raise exception 'ไม่พบปีการศึกษาในโรงเรียนนี้';
  end if;
  update public.academic_years set is_active=false where school_id=p_school and id<>p_year and is_active=true;
  update public.academic_years set is_active=true where school_id=p_school and id=p_year;
end $$;
revoke all on function public.set_school_active_year(uuid,uuid) from public,anon,authenticated;
grant execute on function public.set_school_active_year(uuid,uuid) to service_role;
commit;
