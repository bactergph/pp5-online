-- Activity offerings are separate from academic subjects and score records.
create table if not exists public.class_schedule_activities (
  id uuid primary key default uuid_generate_v4(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  evaluation_setting_id uuid not null references public.evaluation_settings(id),
  teacher_id uuid not null references public.users(id),
  weekly_periods integer not null check (weekly_periods between 0 and 30),
  unique (classroom_id, academic_year_id, evaluation_setting_id)
);
alter table public.class_schedule_activities enable row level security;
alter table public.class_schedule_slots add column if not exists activity_id uuid references public.class_schedule_activities(id);
alter table public.class_schedule_slots drop constraint if exists schedule_one_lesson;
alter table public.class_schedule_slots add constraint schedule_one_lesson check (class_subject_id is null or activity_id is null);

-- Service-only, optimistic concurrency + one transaction: a failed validation leaves all rooms intact.
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
      or (r.activity_id is not null and (a.id is null or a.classroom_id<>r.classroom_id or a.academic_year_id<>p_year_id or e.school_id<>p_school_id or e.kind<>'activities'))
      or (r.class_subject_id is not null and r.activity_id is not null)
      or ((r.class_subject_id is not null or r.activity_id is not null) and (t.id is null or t.school_id<>p_school_id)))
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

create or replace function public.check_schedule_activity() returns trigger
language plpgsql set search_path=public as $$
declare sid uuid;
begin
  select school_id into sid from classrooms where id=new.classroom_id and academic_year_id=new.academic_year_id;
  if sid is null or not exists(select 1 from evaluation_settings where id=new.evaluation_setting_id and school_id=sid and kind='activities')
    or not exists(select 1 from users where id=new.teacher_id and school_id=sid) then
    raise exception 'กิจกรรมหรือครูไม่อยู่ในโรงเรียนและปีการศึกษานี้';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(sid::text || new.academic_year_id::text,0));
  if tg_op='UPDATE' and new is distinct from old and exists(select 1 from class_schedule_slots where activity_id=old.id) then
    raise exception 'กรุณานำกิจกรรมออกจากตารางก่อนเปลี่ยนการตั้งค่า';
  end if;
  return new;
end;
$$;
drop trigger if exists check_schedule_activity on public.class_schedule_activities;
create trigger check_schedule_activity before insert or update on public.class_schedule_activities for each row execute function public.check_schedule_activity();

-- Lunch uses period zero in the existing UI.
alter table public.school_period_times drop constraint if exists school_period_times_period_check;
alter table public.school_period_times add constraint school_period_times_period_check check (period between 0 and 12);
create or replace function public.save_school_period_times(p_school_id uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || ':periods',0));
  if jsonb_array_length(p_rows)<>7 or
     (select count(*) from jsonb_to_recordset(p_rows) r(period int,is_break boolean) where not is_break and period between 1 and 6)<>6 or
     (select count(distinct period) from jsonb_to_recordset(p_rows) r(period int,is_break boolean) where not is_break)<>6 or
     (select count(*) from jsonb_to_recordset(p_rows) r(period int,is_break boolean) where is_break and period=0)<>1 then
    raise exception 'ต้องมีคาบเรียน 1–6 และพักเที่ยงหนึ่งช่วง';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) r(label text,start_time text,end_time text)
    where label is null or btrim(label)='' or start_time is null or end_time is null
      or start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or start_time>=end_time)
    or exists(select 1 from jsonb_to_recordset(p_rows) a(period int,start_time text,end_time text),jsonb_to_recordset(p_rows) b(period int,start_time text,end_time text)
      where a.period<>b.period and a.start_time<b.end_time and b.start_time<a.end_time)
    or exists(select 1 from jsonb_to_recordset(p_rows) a(period int,start_time text),jsonb_to_recordset(p_rows) b(period int,start_time text)
      where (case when a.period=0 then 3.5 else a.period end)<(case when b.period=0 then 3.5 else b.period end) and a.start_time>=b.start_time)
    then raise exception 'เวลาแต่ละคาบต้องเรียงตามลำดับและไม่ทับซ้อนกัน'; end if;
  delete from school_period_times where school_id=p_school_id;
  insert into school_period_times(school_id,period,label,start_time,end_time,is_break,sort_order)
    select p_school_id,period,label,start_time,end_time,is_break,
      case when period=0 then 4 when period>3 then period+1 else period end
    from jsonb_to_recordset(p_rows) r(period int,label text,start_time text,end_time text,is_break boolean);
end;
$$;
revoke all on function public.save_school_period_times(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_school_period_times(uuid,jsonb) to service_role;

create or replace function public.check_substitute_schedule() returns trigger
language plpgsql set search_path=public as $$
declare d schedule_substitute_days%rowtype;
begin
  select * into d from schedule_substitute_days where id=new.substitute_day_id;
  if not found then raise exception 'ไม่พบวันสอนแทน'; end if;
  perform pg_advisory_xact_lock(hashtextextended(d.school_id::text || d.academic_year_id::text,0));
  if new.period not between 1 and 6
    or not exists(select 1 from users where id=new.absent_teacher_id and school_id=d.school_id)
    or not exists(select 1 from classrooms where id=new.classroom_id and school_id=d.school_id and academic_year_id=d.academic_year_id)
    then raise exception 'ข้อมูลคาบสอนแทนไม่ตรงกับโรงเรียน'; end if;
  if new.substitute_teacher_id is not null then
    if new.substitute_teacher_id=new.absent_teacher_id
      or not exists(select 1 from users where id=new.substitute_teacher_id and school_id=d.school_id)
      or exists(select 1 from schedule_substitute_entries where substitute_day_id=d.id and absent_teacher_id=new.substitute_teacher_id)
      then raise exception 'ครูสอนแทนไม่ถูกต้องหรือเป็นครูที่ลาในวันนี้'; end if;
    if exists(select 1 from class_schedule_slots s
      left join class_subjects cs on cs.id=s.class_subject_id
      left join class_schedule_activities a on a.id=s.activity_id
      where s.academic_year_id=d.academic_year_id and s.day_of_week=d.day_of_week and s.period=new.period
        and coalesce(cs.teacher_id,a.teacher_id)=new.substitute_teacher_id)
      or exists(select 1 from schedule_substitute_entries where substitute_day_id=d.id and period=new.period and substitute_teacher_id=new.substitute_teacher_id and id<>new.id)
      then raise exception 'ครูมีคาบสอนหรือคาบสอนแทนชนกัน'; end if;
  end if;
  if exists(select 1 from schedule_substitute_entries where substitute_day_id=d.id and substitute_teacher_id=new.absent_teacher_id and id<>new.id) then
    raise exception 'ครูที่ลายังถูกกำหนดให้สอนแทน กรุณานำออกก่อน';
  end if;
  return new;
end;
$$;
drop trigger if exists check_substitute_schedule on public.schedule_substitute_entries;
create trigger check_substitute_schedule before insert or update on public.schedule_substitute_entries for each row execute function public.check_substitute_schedule();

create or replace function public.replace_substitute_slots(p_school_id uuid,p_day_id uuid,p_teacher_id uuid,p_leave_type text,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare y uuid;
begin
  select academic_year_id into y from schedule_substitute_days where id=p_day_id and school_id=p_school_id;
  if y is null then raise exception 'ไม่พบตารางสอนแทน'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || y::text,0));
  delete from schedule_substitute_entries where substitute_day_id=p_day_id and absent_teacher_id=p_teacher_id;
  insert into schedule_substitute_entries(substitute_day_id,absent_teacher_id,period,class_subject_id,classroom_id,subject_label,room_label,leave_type)
    select p_day_id,p_teacher_id,period,class_subject_id,classroom_id,subject_label,room_label,p_leave_type
    from jsonb_to_recordset(p_rows) r(period int,class_subject_id uuid,classroom_id uuid,subject_label text,room_label text);
end;
$$;
revoke all on function public.replace_substitute_slots(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.replace_substitute_slots(uuid,uuid,uuid,text,jsonb) to service_role;

-- Changing the teacher assignment later must not introduce a collision into a saved timetable.
create or replace function public.check_scheduled_subject_teacher() returns trigger
language plpgsql set search_path=public as $$
declare sid uuid;
begin
  select school_id into sid from classrooms where id=old.classroom_id;
  perform pg_advisory_xact_lock(hashtextextended(sid::text || old.academic_year_id::text,0));
  if not exists(select 1 from class_schedule_slots where class_subject_id=old.id) then return new; end if;
  if new.classroom_id<>old.classroom_id or new.academic_year_id<>old.academic_year_id then
    raise exception 'กรุณานำรายวิชาออกจากตารางก่อนย้ายห้องหรือปีการศึกษา';
  end if;
  if new.teacher_id is distinct from old.teacher_id then
    if not exists(select 1 from users where id=new.teacher_id and school_id=sid) then raise exception 'ครูผู้สอนไม่ถูกต้อง'; end if;
    if exists(select 1 from class_schedule_slots mine join class_schedule_slots other
      on other.academic_year_id=mine.academic_year_id and other.day_of_week=mine.day_of_week and other.period=mine.period and other.id<>mine.id
      left join class_subjects cs on cs.id=other.class_subject_id
      left join class_schedule_activities a on a.id=other.activity_id
      where mine.class_subject_id=old.id and coalesce(cs.teacher_id,a.teacher_id)=new.teacher_id)
      then raise exception 'ครูใหม่มีคาบสอนชนกับตารางเดิม กรุณาปรับตารางก่อน'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists check_scheduled_subject_teacher on public.class_subjects;
create trigger check_scheduled_subject_teacher before update of teacher_id,classroom_id,academic_year_id on public.class_subjects
  for each row execute function public.check_scheduled_subject_teacher();
