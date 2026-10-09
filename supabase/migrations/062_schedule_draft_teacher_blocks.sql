begin;
create or replace function public.set_schedule_teacher_block(p_school_id uuid,p_year_id uuid,p_semester integer,p_teacher_id uuid,p_day integer,p_period integer,p_blocked boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || ':periods',0));
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || p_year_id::text,0));
  if p_blocked is null or p_semester is null or p_semester not in(1,2) or p_day is null or p_day not between 1 and 5 or p_period is null or p_period not between 1 and 8
    or not exists(select 1 from academic_years where id=p_year_id and school_id=p_school_id)
    or not exists(select 1 from users where id=p_teacher_id and school_id=p_school_id and (is_active or email like 'pending-%') and role in('teacher','academic_head','deputy_principal','principal','admin'))
    then raise exception 'ข้อมูลครู ปีการศึกษา หรือคาบไม่ถูกต้อง'; end if;
  if p_period>coalesce((select max(period) from school_period_times where school_id=p_school_id and not is_break),6) then raise exception 'คาบนี้ยังไม่ได้ตั้งเวลาเรียน'; end if;
  if p_blocked then
    if exists(select 1 from class_schedule_slots s join classrooms c on c.id=s.classroom_id
      left join class_subjects cs on cs.id=s.class_subject_id left join class_schedule_activities a on a.id=s.activity_id
      where c.school_id=p_school_id and s.academic_year_id=p_year_id and s.semester=p_semester and s.day_of_week=p_day and s.period=p_period and coalesce(cs.teacher_id,a.teacher_id)=p_teacher_id)
      or exists(select 1 from schedule_substitute_entries e join schedule_substitute_days d on d.id=e.substitute_day_id
        where d.school_id=p_school_id and d.academic_year_id=p_year_id and d.semester=p_semester and d.day_of_week=p_day and e.period=p_period and e.substitute_teacher_id=p_teacher_id)
      then raise exception 'คาบนี้มีสอนหรือสอนแทนอยู่ กรุณาย้ายคาบก่อนล็อก'; end if;
    insert into schedule_teacher_blocks(school_id,academic_year_id,semester,teacher_id,day_of_week,period)
      values(p_school_id,p_year_id,p_semester,p_teacher_id,p_day,p_period) on conflict do nothing;
  else
    delete from schedule_teacher_blocks where school_id=p_school_id and academic_year_id=p_year_id and semester=p_semester and teacher_id=p_teacher_id and day_of_week=p_day and period=p_period;
  end if;
end; $$;
revoke all on function public.set_schedule_teacher_block(uuid,uuid,integer,uuid,integer,integer,boolean) from public,anon,authenticated;
g
notify pgrst, 'reload schema';
commit;

