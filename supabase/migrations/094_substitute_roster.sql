-- Daily roster CRUD and explicit, recorded conflict overrides. No timetable,
-- attendance, scores, or existing substitute assignment is rewritten here.
begin;
alter table public.schedule_substitute_entries
  add column if not exists override_conflicts boolean not null default false,
  add column if not exists conflict_details jsonb not null default '[]'::jsonb,
  add column if not exists conflict_confirmed_by uuid,
  add column if not exists conflict_confirmed_at timestamptz;

create or replace function public.check_substitute_schedule() returns trigger
language plpgsql set search_path=public as $$
declare d schedule_substitute_days%rowtype; clash boolean;
begin
  select * into d from schedule_substitute_days where id=new.substitute_day_id;
  if not found then raise exception 'ไม่พบวันสอนแทน'; end if;
  perform pg_advisory_xact_lock(hashtextextended(d.school_id::text||d.academic_year_id::text,0));
  if new.period is null or new.period not between 1 and 8
    or not exists(select 1 from users where id=new.absent_teacher_id and school_id=d.school_id)
    or not exists(select 1 from classrooms where id=new.classroom_id and school_id=d.school_id and academic_year_id=d.academic_year_id)
    then raise exception 'ข้อมูลคาบสอนแทนไม่ตรงกับโรงเรียน'; end if;
  if new.class_subject_id is not null and not exists(
    select 1 from class_subjects cs where cs.id=new.class_subject_id and cs.classroom_id=new.classroom_id
      and cs.academic_year_id=d.academic_year_id and coalesce(cs.semester,0) in(0,d.semester)
      and cs.teacher_id=new.absent_teacher_id
  ) then raise exception 'รายวิชาไม่ตรงกับครู ห้อง หรือภาคเรียน'; end if;
  if tg_op='UPDATE' and new.substitute_teacher_id is distinct from old.substitute_teacher_id
    and new.conflict_confirmed_at is not distinct from old.conflict_confirmed_at then
    new.override_conflicts=false;
  end if;
  if new.substitute_teacher_id is null or not new.override_conflicts then
    new.override_conflicts=false; new.conflict_details='[]';
    new.conflict_confirmed_by=null; new.conflict_confirmed_at=null;
  elsif jsonb_typeof(new.conflict_details)<>'array' or jsonb_array_length(new.conflict_details)=0
    or new.conflict_confirmed_by is null or new.conflict_confirmed_at is null then
    raise exception 'กรุณายืนยันรายละเอียดคาบที่ไม่ว่างก่อนบันทึก';
  end if;
  if new.substitute_teacher_id is not null then
    if new.substitute_teacher_id=new.absent_teacher_id or not exists(select 1 from users where id=new.substitute_teacher_id and school_id=d.school_id)
      then raise exception 'ครูสอนแทนไม่ถูกต้องหรือสอนแทนตนเอง'; end if;
    select exists(select 1 from schedule_teacher_blocks where school_id=d.school_id and academic_year_id=d.academic_year_id and semester=d.semester and teacher_id=new.substitute_teacher_id and day_of_week=d.day_of_week and period=new.period)
      or exists(select 1 from schedule_substitute_entries where substitute_day_id=d.id and absent_teacher_id=new.substitute_teacher_id)
      or exists(select 1 from schedule_substitute_entries where substitute_day_id=d.id and period=new.period and substitute_teacher_id=new.substitute_teacher_id and id<>new.id)
      or exists(select 1 from activity_team_teaching(d.school_id,d.academic_year_id,d.semester,
        (select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from class_schedule_slots s join classrooms c on c.id=s.classroom_id
          where c.school_id=d.school_id and s.academic_year_id=d.academic_year_id and s.semester=d.semester and s.day_of_week=d.day_of_week and s.period=new.period)) t
        where t.teacher_id=new.substitute_teacher_id and t.day_of_week=d.day_of_week and t.period=new.period)
      into clash;
    if clash and not new.override_conflicts then raise exception 'ครูไม่ว่าง กรุณาตรวจรายละเอียดและยืนยันการสอนแทนทั้งที่ไม่ว่าง'; end if;
  end if;
  if exists(select 1 from schedule_substitute_entries where substitute_day_id=d.id and substitute_teacher_id=new.absent_teacher_id and id<>new.id and not override_conflicts)
    then raise exception 'ครูที่ลาถูกกำหนดให้สอนแทนโดยยังไม่ยืนยันข้อขัดกัน'; end if;
  return new;
end; $$;

create or replace function public.save_substitute_roster(p_school_id uuid,p_day_id uuid,p_expected jsonb,p_rows jsonb,p_snapshot text,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare d schedule_substitute_days%rowtype; actual jsonb; created_times jsonb; item record;
begin
  select * into d from schedule_substitute_days where id=p_day_id and school_id=p_school_id;
  if not found or p_actor is null then raise exception 'ไม่พบตารางสอนแทนของโรงเรียนนี้'; end if;
  perform pg_advisory_xact_lock(hashtextextended(d.school_id::text||d.academic_year_id::text,0));
  if p_snapshot is distinct from schedule_snapshot(d.school_id,d.academic_year_id,d.semester) then
    raise exception 'ข้อมูลตารางเรียนหรือสอนแทนเปลี่ยนแล้ว กรุณาโหลดล่าสุดก่อนบันทึก'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_expected) is distinct from 'array' or jsonb_array_length(p_rows)>2000 then raise exception 'รายการสอนแทนไม่ถูกต้อง'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'absent_teacher_id',absent_teacher_id,'period',period,
    'class_subject_id',class_subject_id,'classroom_id',classroom_id,'subject_label',nullif(subject_label,''),'room_label',nullif(room_label,''),
    'substitute_teacher_id',substitute_teacher_id,'leave_type',leave_type,'note',nullif(note,''),
    'override_conflicts',override_conflicts,'conflict_details',conflict_details) order by id),'[]'::jsonb)
    into actual from schedule_substitute_entries where substitute_day_id=p_day_id;
  if actual<>p_expected then raise exception 'มีการแก้ไขตารางสอนแทน กรุณาโหลดล่าสุดก่อนบันทึก'; end if;
  select coalesce(jsonb_object_agg(id::text,created_at),'{}'::jsonb) into created_times
    from schedule_substitute_entries where substitute_day_id=p_day_id;
  if (select count(distinct id) from jsonb_to_recordset(p_rows) r(id uuid))<>jsonb_array_length(p_rows)
    or exists(select 1 from jsonb_to_recordset(p_rows) r(id uuid) join schedule_substitute_entries e on e.id=r.id where e.substitute_day_id<>p_day_id)
    or exists(select 1 from jsonb_to_recordset(p_rows) r(absent_teacher_id uuid,period int,classroom_id uuid) group by absent_teacher_id,period,classroom_id having count(*)>1)
    then raise exception 'รายการสอนแทนซ้ำหรือไม่ตรงกับวันที่เลือก'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) r(subject_label text,leave_type text,note text,conflict_details jsonb)
    where coalesce(trim(subject_label),'')='' or length(subject_label)>300 or coalesce(trim(leave_type),'')='' or length(leave_type)>100 or length(note)>1000
      or jsonb_typeof(coalesce(conflict_details,'[]'))<>'array' or jsonb_array_length(coalesce(conflict_details,'[]'))>1000)
    then raise exception 'กรุณาตรวจชื่อวิชา ประเภทการลา และหมายเหตุ'; end if;
  -- Insert the complete absence roster first, then assign substitutes. A later
  -- row cannot hide an absence/duplicate from an earlier row's validation.
  delete from schedule_substitute_entries where substitute_day_id=p_day_id;
  insert into schedule_substitute_entries(id,substitute_day_id,absent_teacher_id,period,class_subject_id,classroom_id,subject_label,room_label,leave_type,note,created_at)
    select id,p_day_id,absent_teacher_id,period,class_subject_id,classroom_id,subject_label,room_label,leave_type,note,coalesce((created_times->>id::text)::timestamptz,now())
    from jsonb_to_recordset(p_rows) r(id uuid,absent_teacher_id uuid,period int,class_subject_id uuid,classroom_id uuid,subject_label text,room_label text,leave_type text,note text);
  for item in select * from jsonb_to_recordset(p_rows) r(id uuid,substitute_teacher_id uuid,override_conflicts boolean,conflict_details jsonb) loop
    update schedule_substitute_entries set substitute_teacher_id=item.substitute_teacher_id,
      override_conflicts=coalesce(item.override_conflicts,false),conflict_details=coalesce(item.conflict_details,'[]'),
      conflict_confirmed_by=case when item.override_conflicts then p_actor end,
      conflict_confirmed_at=case when item.override_conflicts then now() end where id=item.id and substitute_day_id=p_day_id;
  end loop;
  update schedule_substitute_entries set note=note where substitute_day_id=p_day_id;
end; $$;
revoke insert,update,delete on public.schedule_substitute_entries from anon,authenticated;
revoke all on function public.save_substitute_roster(uuid,uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.save_substitute_roster(uuid,uuid,jsonb,jsonb,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
