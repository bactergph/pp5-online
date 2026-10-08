-- Requires migrations 053–057. Does not change existing schedules or period times.
begin;
create table if not exists public.schedule_teacher_blocks (
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  semester integer not null check(semester in (1,2)),
  teacher_id uuid not null references public.users(id) on delete cascade,
  day_of_week integer not null check(day_of_week between 1 and 5),
  period integer not null check(period between 1 and 8),
  created_at timestamptz not null default now(),
  primary key(school_id,academic_year_id,semester,teacher_id,day_of_week,period)
);
alter table public.schedule_teacher_blocks enable row level security;
-- Server actions authenticate roles and school membership. Browser access is intentionally disabled.
revoke all on public.schedule_teacher_blocks from anon,authenticated;
grant all on public.schedule_teacher_blocks to service_role;
create or replace function public.set_schedule_teacher_block(p_school_id uuid,p_year_id uuid,p_semester integer,p_teacher_id uuid,p_day integer,p_period integer,p_blocked boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || ':periods',0));
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || p_year_id::text,0));
  if p_blocked is null or p_semester is null or p_semester not in(1,2) or p_day is null or p_day not between 1 and 5 or p_period is null or p_period not between 1 and 8
    or not exists(select 1 from academic_years where id=p_year_id and school_id=p_school_id)
    or not exists(select 1 from users where id=p_teacher_id and school_id=p_school_id and is_active and role in('teacher','academic_head','deputy_principal','principal','admin'))
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
grant execute on function public.set_schedule_teacher_block(uuid,uuid,integer,uuid,integer,integer,boolean) to service_role;
create or replace function public.save_school_schedule_term(
  p_school_id uuid, p_year_id uuid, p_expected jsonb, p_rows jsonb, p_allow_unlock boolean default false, p_semester integer default 1
) returns void language plpgsql security definer set search_path = public as $$
declare actual jsonb;
begin
  if p_semester is null or p_semester not in (1,2) then raise exception 'ภาคเรียนไม่ถูกต้อง'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || ':periods',0));
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || p_year_id::text, 0));
  perform 1 from academic_years where id=p_year_id and school_id=p_school_id for update;
  if not found then raise exception 'ไม่พบปีการศึกษาในโรงเรียนนี้'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'classroom_id',s.classroom_id,'academic_year_id',s.academic_year_id,'day_of_week',s.day_of_week,'period',s.period,
    'class_subject_id',s.class_subject_id,'activity_id',s.activity_id,'note',s.note,'locked',s.locked)), '[]'::jsonb)
    into actual from class_schedule_slots s join classrooms c on c.id=s.classroom_id
    where c.school_id=p_school_id and s.academic_year_id=p_year_id and s.semester=p_semester;
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
      or r.day_of_week not between 1 and 5 or r.period not between 1 and 8
      or r.period>coalesce((select max(period) from school_period_times where school_id=p_school_id and not is_break),6)
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
  if exists(select 1 from jsonb_to_recordset(p_rows) r(class_subject_id uuid,activity_id uuid,day_of_week int,period int)
    left join class_subjects cs on cs.id=r.class_subject_id left join class_schedule_activities a on a.id=r.activity_id
    join schedule_teacher_blocks b on b.teacher_id=coalesce(cs.teacher_id,a.teacher_id) and b.school_id=p_school_id
      and b.academic_year_id=p_year_id and b.semester=p_semester and b.day_of_week=r.day_of_week and b.period=r.period)
    then raise exception 'ครูล็อกคาบว่างนี้ไว้ กรุณาเลือกคาบอื่น'; end if;
  delete from class_schedule_slots s using classrooms c
    where s.classroom_id=c.id and c.school_id=p_school_id and s.academic_year_id=p_year_id and s.semester=p_semester
    and not exists (select 1 from jsonb_to_recordset(p_rows) as r(classroom_id uuid,day_of_week int,period int)
      where r.classroom_id=s.classroom_id and r.day_of_week=s.day_of_week and r.period=s.period);
  insert into class_schedule_slots(semester,classroom_id,academic_year_id,day_of_week,period,class_subject_id,activity_id,note,locked)
    select p_semester,classroom_id,academic_year_id,day_of_week,period,class_subject_id,activity_id,note,coalesce(locked,false)
    from jsonb_to_recordset(p_rows) as r(classroom_id uuid,academic_year_id uuid,day_of_week int,period int,class_subject_id uuid,activity_id uuid,note text,locked boolean)
    on conflict(classroom_id,academic_year_id,semester,day_of_week,period) do update set
      class_subject_id=excluded.class_subject_id,activity_id=excluded.activity_id,note=excluded.note,locked=excluded.locked,updated_at=now();
end;
$$;
revoke all on function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,integer) from public,anon,authenticated;
grant execute on function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,integer) to service_role;
-- Old deployed clients remain scoped to semester 1 during rollout.
create or replace function public.save_school_schedule(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false)
returns void language plpgsql security definer set search_path=public as $$
begin perform save_school_schedule_term(p_school_id,p_year_id,p_expected,p_rows,p_allow_unlock,1); end; $$;
create or replace function public.check_substitute_schedule() returns trigger
language plpgsql set search_path=public as $$
declare d schedule_substitute_days%rowtype;
begin
  select * into d from schedule_substitute_days where id=new.substitute_day_id;
  if not found then raise exception 'ไม่พบวันสอนแทน'; end if;
  perform pg_advisory_xact_lock(hashtextextended(d.school_id::text || d.academic_year_id::text,0));
  if new.period not between 1 and 8
    or not exists(select 1 from users where id=new.absent_teacher_id and school_id=d.school_id)
    or not exists(select 1 from classrooms where id=new.classroom_id and school_id=d.school_id and academic_year_id=d.academic_year_id)
    then raise exception 'ข้อมูลคาบสอนแทนไม่ตรงกับโรงเรียน'; end if;
  if new.substitute_teacher_id is not null then
    if new.substitute_teacher_id=new.absent_teacher_id
      or not exists(select 1 from users where id=new.substitute_teacher_id and school_id=d.school_id)
      or exists(select 1 from schedule_substitute_entries where substitute_day_id=d.id and absent_teacher_id=new.substitute_teacher_id)
      then raise exception 'ครูสอนแทนไม่ถูกต้องหรือเป็นครูที่ลาในวันนี้'; end if;
    if exists(select 1 from schedule_teacher_blocks where school_id=d.school_id and academic_year_id=d.academic_year_id and semester=d.semester
      and teacher_id=new.substitute_teacher_id and day_of_week=d.day_of_week and period=new.period)
      then raise exception 'ครูล็อกคาบว่างนี้ไว้ ไม่สามารถสอนแทนได้'; end if;
    if exists(select 1 from class_schedule_slots s
      left join class_subjects cs on cs.id=s.class_subject_id
      left join class_schedule_activities a on a.id=s.activity_id
      where s.academic_year_id=d.academic_year_id and s.semester=d.semester and s.day_of_week=d.day_of_week and s.period=new.period
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

create or replace function public.save_school_period_times(p_school_id uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || ':periods',0));
  select count(*) into n from jsonb_to_recordset(p_rows) r(is_break boolean) where not is_break;
  if n not between 1 and 8 or jsonb_array_length(p_rows)<>n+1
    or (select count(distinct period) from jsonb_to_recordset(p_rows) r(period int,is_break boolean) where not is_break and period between 1 and n)<>n
    or (select count(*) from jsonb_to_recordset(p_rows) r(period int,is_break boolean) where is_break and period=0)<>1
    or exists(select 1 from jsonb_to_recordset(p_rows) r(is_break boolean) where is_break is null)
    then raise exception 'ต้องมีคาบเรียนเรียงจาก 1 สูงสุด 8 คาบ และพักเที่ยงหนึ่งช่วง'; end if;
  if exists(select 1 from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=p_school_id and s.period>n)
    or exists(select 1 from schedule_teacher_blocks where school_id=p_school_id and period>n)
    or exists(select 1 from schedule_substitute_entries e join schedule_substitute_days d on d.id=e.substitute_day_id where d.school_id=p_school_id and e.period>n)
    then raise exception 'คาบที่ต้องการลบยังมีตารางเรียน สอนแทน หรือคาบครูที่ล็อกอยู่ กรุณานำออกก่อน'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) r(label text,start_time text,end_time text)
    where label is null or btrim(label)='' or start_time is null or end_time is null
      or start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or start_time>=end_time)
    or exists(select 1 from jsonb_to_recordset(p_rows) a(period int,start_time text,end_time text),jsonb_to_recordset(p_rows) b(period int,start_time text,end_time text)
      where a.period<>b.period and a.start_time<b.end_time and b.start_time<a.end_time)
    or exists(select 1 from jsonb_array_elements(p_rows) with ordinality a(row,idx),jsonb_array_elements(p_rows) with ordinality b(row,idx)
      where a.idx<b.idx and a.row->>'start_time'>=b.row->>'start_time')
    then raise exception 'เวลาแต่ละคาบต้องเรียงตามลำดับและไม่ทับซ้อนกัน'; end if;
  delete from school_period_times where school_id=p_school_id;
  insert into school_period_times(school_id,period,label,start_time,end_time,is_break,sort_order)
    select p_school_id,(row->>'period')::int,row->>'label',row->>'start_time',row->>'end_time',(row->>'is_break')::boolean,idx::int
    from jsonb_array_elements(p_rows) with ordinality x(row,idx);
end;
$$;
revoke all on function public.save_school_period_times(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_school_period_times(uuid,jsonb) to service_role;


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
    if exists(select 1 from class_schedule_slots s join schedule_teacher_blocks b on b.school_id=sid and b.academic_year_id=s.academic_year_id and b.semester=s.semester and b.day_of_week=s.day_of_week and b.period=s.period
      where s.class_subject_id=old.id and b.teacher_id=new.teacher_id) then raise exception 'ครูใหม่ล็อกคาบว่างตรงกับตารางเดิม กรุณาปรับตารางก่อน'; end if;
    if exists(select 1 from class_schedule_slots mine join class_schedule_slots other
      on other.academic_year_id=mine.academic_year_id and other.semester=mine.semester and other.day_of_week=mine.day_of_week and other.period=mine.period and other.id<>mine.id
      left join class_subjects cs on cs.id=other.class_subject_id
      left join class_schedule_activities a on a.id=other.activity_id
      where mine.class_subject_id=old.id and coalesce(cs.teacher_id,a.teacher_id)=new.teacher_id)
      then raise exception 'ครูใหม่มีคาบสอนชนกับตารางเดิม กรุณาปรับตารางก่อน'; end if;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
