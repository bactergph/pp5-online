-- Settings activities are manual timetable options. Existing slots are preserved.
begin;
create or replace function public.check_schedule_activity() returns trigger
language plpgsql set search_path=public as $$
declare sid uuid;
begin
  select school_id into sid from classrooms where id=new.classroom_id and academic_year_id=new.academic_year_id;
  if sid is null
    or (new.evaluation_setting_id is not null and not exists(
      select 1 from evaluation_settings where id=new.evaluation_setting_id and school_id=sid and kind='activities'))
    or (new.teacher_id is not null and not exists(select 1 from users where id=new.teacher_id and school_id=sid))
    or (new.evaluation_setting_id is null and (new.teacher_id is not null or new.weekly_periods<>1)) then
    raise exception 'กิจกรรมหรือครูไม่อยู่ในโรงเรียนและปีการศึกษานี้';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(sid::text || new.academic_year_id::text,0));
  if tg_op='UPDATE' and (
      new.classroom_id is distinct from old.classroom_id
      or new.academic_year_id is distinct from old.academic_year_id
      or new.evaluation_setting_id is distinct from old.evaluation_setting_id
      or new.teacher_id is distinct from old.teacher_id
      or new.weekly_periods is distinct from old.weekly_periods
    ) and exists(select 1 from class_schedule_slots where activity_id=old.id) then
    raise exception 'กรุณานำกิจกรรมออกจากตารางก่อนเปลี่ยนการตั้งค่า';
  end if;
  return new;
end;
$$;


create or replace function public.save_school_schedule(
  p_school_id uuid, p_year_id uuid, p_expected jsonb, p_rows jsonb, p_allow_unlock boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare actual jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || p_year_id::text, 0));
  perform 1 from academic_years where id=p_year_id and school_id=p_school_id for update;
  if not found then raise exception 'ไม่พบปีการศึกษาในโรงเรียนนี้'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'classroom_id',s.classroom_id,'academic_year_id',s.academic_year_id,'day_of_week',s.day_of_week,'period',s.period,
    'class_subject_id',s.class_subject_id,'activity_id',s.activity_id,'note',s.note,'locked',s.locked)), '[]'::jsonb)
    into actual from class_schedule_slots s join classrooms c on c.id=s.classroom_id
    where c.school_id=p_school_id and s.academic_year_id=p_year_id;
  if not (actual @> p_expected and p_expected @> actual and jsonb_array_length(actual)=jsonb_array_length(p_expected)) then
    raise exception 'ตารางถูกแก้ไขโดยผู้อื่น กรุณาโหลดใหม่แล้วลองอีกครั้ง';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) raw
    cross join lateral jsonb_to_record(raw) as r(classroom_id uuid,academic_year_id uuid,day_of_week int,period int,class_subject_id uuid,activity_id uuid)
    left join classrooms c on c.id=r.classroom_id
    left join class_subjects cs on cs.id=r.class_subject_id
    left join subjects sub on sub.id=cs.subject_id
    left join class_schedule_activities a on a.id=r.activity_id
    left join evaluation_settings e on e.id=a.evaluation_setting_id
    left join users t on t.id=coalesce(cs.teacher_id,a.teacher_id)
    where not exists(select 1 from jsonb_array_elements(actual) old where old-'locked'=raw-'locked') and (
      c.id is null or c.school_id<>p_school_id or c.academic_year_id<>p_year_id or r.academic_year_id<>p_year_id
      or r.academic_year_id is null or r.day_of_week is null or r.period is null
      or r.day_of_week not between 1 and 5 or r.period not between 1 and 6
      or (r.class_subject_id is not null and (cs.id is null or cs.classroom_id<>r.classroom_id or cs.academic_year_id<>p_year_id or sub.school_id<>p_school_id))
      or (r.activity_id is not null and (a.id is null or a.classroom_id<>r.classroom_id or a.academic_year_id<>p_year_id or (a.evaluation_setting_id is not null and (e.id is null or e.school_id<>p_school_id or e.kind<>'activities' or not e.is_active))))
      or (r.class_subject_id is not null and r.activity_id is not null)
      or ((r.class_subject_id is not null or (r.activity_id is not null and a.teacher_id is not null)) and (t.id is null or t.school_id<>p_school_id)))
  ) then raise exception 'ห้องเรียน รายวิชา กิจกรรม หรือครูผู้สอนไม่ถูกต้อง กรุณาตรวจข้อมูล'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(classroom_id uuid,day_of_week int,period int)
    group by classroom_id,day_of_week,period having count(*)>1
  ) then raise exception 'พบคาบซ้ำในห้องเรียน'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) raw
    cross join lateral jsonb_to_record(raw) as r(day_of_week int,period int,class_subject_id uuid,activity_id uuid)
    left join class_subjects cs on cs.id=r.class_subject_id
    left join class_schedule_activities a on a.id=r.activity_id
    where coalesce(cs.teacher_id,a.teacher_id) is not null
    group by coalesce(cs.teacher_id,a.teacher_id),r.day_of_week,r.period having count(*)>1
      and bool_or(not exists(select 1 from jsonb_array_elements(actual) old where old-'locked'=raw-'locked'))
  ) then raise exception 'ครูมีคาบสอนชนกัน กรุณาเลือกคาบอื่นหรือจัดตารางใหม่ทั้งโรงเรียน'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) r(activity_id uuid) join class_schedule_activities a on a.id=r.activity_id where a.evaluation_setting_id is null group by a.id having count(*)>1) then raise exception 'กิจกรรมพัฒนาผู้เรียนจัดได้ 1 คาบต่อสัปดาห์'; end if;
  if exists (
    select 1 from jsonb_array_elements(actual) old where (old->>'locked')::boolean
    and not exists (select 1 from jsonb_array_elements(p_rows) n where
      case when p_allow_unlock then n - 'locked' = old - 'locked' else n=old end)
  ) then raise exception 'ไม่สามารถแก้ไขคาบที่ล็อก กรุณาปลดล็อกก่อน'; end if;
  delete from class_schedule_slots s using classrooms c
    where s.classroom_id=c.id and c.school_id=p_school_id and s.academic_year_id=p_year_id
    and not exists (select 1 from jsonb_to_recordset(p_rows) as r(classroom_id uuid,day_of_week int,period int)
      where r.classroom_id=s.classroom_id and r.day_of_week=s.day_of_week and r.period=s.period);
  insert into class_schedule_slots(classroom_id,academic_year_id,day_of_week,period,class_subject_id,activity_id,note,locked)
    select classroom_id,academic_year_id,day_of_week,period,class_subject_id,activity_id,note,coalesce(locked,false)
    from jsonb_to_recordset(p_rows) as r(classroom_id uuid,academic_year_id uuid,day_of_week int,period int,class_subject_id uuid,activity_id uuid,note text,locked boolean)
    on conflict(classroom_id,academic_year_id,day_of_week,period) do update set
      class_subject_id=excluded.class_subject_id,activity_id=excluded.activity_id,note=excluded.note,locked=excluded.locked,updated_at=now();
end;
$$;
revoke all on function public.save_school_schedule(uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_school_schedule(uuid,uuid,jsonb,jsonb,boolean) to service_role;



insert into public.class_schedule_activities(classroom_id,academic_year_id,evaluation_setting_id,teacher_id,weekly_periods)
select c.id,c.academic_year_id,e.id,null,0 from public.classrooms c
join public.academic_years y on y.id=c.academic_year_id and y.school_id=c.school_id
join public.evaluation_settings e on e.school_id=c.school_id and e.kind='activities' and e.is_active
on conflict(classroom_id,academic_year_id,activity_key) do nothing;

create or replace function public.add_class_learner_development() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into class_schedule_activities(classroom_id,academic_year_id,evaluation_setting_id,teacher_id,weekly_periods)
  select new.id,new.academic_year_id,e.id,null,0 from evaluation_settings e
  where e.school_id=new.school_id and e.kind='activities' and e.is_active
  on conflict(classroom_id,academic_year_id,activity_key) do nothing;
  return new;
end; $$;
create or replace function public.sync_manual_schedule_activity() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.kind='activities' and new.is_active then
    insert into class_schedule_activities(classroom_id,academic_year_id,evaluation_setting_id,teacher_id,weekly_periods)
    select c.id,c.academic_year_id,new.id,null,0 from classrooms c join academic_years y on y.id=c.academic_year_id and y.school_id=c.school_id
    where c.school_id=new.school_id
    on conflict(classroom_id,academic_year_id,activity_key) do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists sync_manual_schedule_activity on public.evaluation_settings;
create trigger sync_manual_schedule_activity after insert or update of is_active,kind on public.evaluation_settings
for each row execute function public.sync_manual_schedule_activity();
commit;
