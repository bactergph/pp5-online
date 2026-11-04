-- Distinct primary/secondary bell times. Period numbers remain local to a grade.
begin;
alter table public.school_period_times add column if not exists profiles jsonb;

create or replace function public.schedule_room_times(p_school uuid,p_room uuid)
returns jsonb language sql stable set search_path=public as $$
 with bell as(select coalesce(jsonb_agg(to_jsonb(t)-'profiles' order by sort_order),'[]'::jsonb) base,
 (select profiles from school_period_times where school_id=p_school and profiles is not null limit 1) profiles
 from school_period_times t where school_id=p_school), room as(select case
 when level ~ '^(ป\.?\s*[1-6]|ประถม)' then 'primary'
 when level ~ '^(ม\.?\s*[1-6]|มัธยม)' then 'secondary' end band from classrooms where id=p_room and school_id=p_school)
 select coalesce(bell.profiles->(select band from room),bell.base) from bell
$$;

create or replace function public.schedule_profile_cells(p_school uuid,p_year uuid,p_term int,p_rows jsonb)
returns table(room_id uuid,day int,period int,teacher uuid,event text,venue text,start_clock time,end_clock time)
language sql stable set search_path=public as $$
 with cfg as(select config,public.schedule_joint_event_map(config) events from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term),
 cells as(select s.*,cs.teacher_id subject_teacher,a.teacher_id activity_teacher,cs.classroom_id subject_room,
 coalesce((select events from cfg)->>(s.class_subject_id::text||':'||s.day_of_week||':'||s.period),(select events from cfg)->>(s.class_subject_id::text||':*'),s.class_subject_id::text,s.activity_id::text) lesson_event,
 (select g from cfg cross join lateral jsonb_array_elements(coalesce(config->'activityGroups','[]')) g where g->>'settingId'=a.evaluation_setting_id::text and g->'roomIds' @> to_jsonb(s.classroom_id::text) limit 1) activity_group,
 (select config->'rules'->s.class_subject_id::text->>'roomId' from cfg) venue
 from jsonb_to_recordset(p_rows) s(classroom_id uuid,day_of_week int,period int,class_subject_id uuid,activity_id uuid)
 left join class_subjects cs on cs.id=s.class_subject_id left join class_schedule_activities a on a.id=s.activity_id),
 staffed as(select *,case when activity_group is not null then coalesce(case when activity_group->>'mode'='joint' then activity_group->'teacherIds' else activity_group->'roomTeachers'->classroom_id::text end,'[]'::jsonb)
 else case when coalesce(subject_teacher,activity_teacher) is not null then jsonb_build_array(coalesce(subject_teacher,activity_teacher)) else '[]'::jsonb end end teachers from cells)
 select s.classroom_id,s.day_of_week,s.period,t::uuid,
 case when s.activity_group is not null then s.activity_group->>'id'||case when s.activity_group->>'mode'='joint' then '' else ':'||s.classroom_id::text end else s.lesson_event end,
 nullif(s.venue,''),(clock->>'start_time')::time,(clock->>'end_time')::time
 from staffed s cross join lateral jsonb_array_elements(public.schedule_room_times(p_school,s.classroom_id)) clock
 cross join lateral jsonb_array_elements_text(case when s.teachers='[]'::jsonb then '[null]'::jsonb else s.teachers end) t
 where not (clock->>'is_break')::boolean and (clock->>'period')::int=s.period
$$;

create or replace function public.validate_profile_schedule(p_school uuid,p_year uuid,p_term int,p_rows jsonb)
returns void language plpgsql set search_path=public as $$
begin
 if exists(select 1 from jsonb_to_recordset(p_rows) s(classroom_id uuid,period int)
 where not exists(select 1 from jsonb_array_elements(schedule_room_times(p_school,s.classroom_id)) t where not (t->>'is_break')::boolean and (t->>'period')::int=s.period)) then raise exception 'คาบอยู่นอกเวลาเรียนของระดับชั้น'; end if;
 if exists(with cells as materialized(select * from schedule_profile_cells(p_school,p_year,p_term,p_rows))
 select 1 from cells a join cells b on a.day=b.day and a.room_id<>b.room_id and a.start_clock<b.end_clock and b.start_clock<a.end_clock
 where ((a.teacher is not null and a.teacher=b.teacher) or (a.venue is not null and a.venue=b.venue))
 and not (a.event=b.event and a.start_clock=b.start_clock and a.end_clock=b.end_clock)) then raise exception 'ครูหรือสถานที่ชนกันเมื่อเทียบเวลาเรียนจริงของแต่ละระดับ'; end if;
 if exists(select 1 from schedule_profile_cells(p_school,p_year,p_term,p_rows) c join schedule_teacher_blocks b on b.school_id=p_school and b.academic_year_id=p_year and b.semester=p_term and b.teacher_id=c.teacher and b.day_of_week=c.day
 join school_period_times t on t.school_id=p_school and t.period=b.period and not t.is_break and c.start_clock<t.end_time::time and t.start_time::time<c.end_clock) then raise exception 'ครูล็อกเวลาว่างนี้ไว้ เมื่อเทียบเวลาจริง'; end if;
 if exists(select 1 from schedule_profile_cells(p_school,p_year,p_term,p_rows) where event is not null group by event,day,period having min(start_clock)<>max(start_clock) or min(end_clock)<>max(end_clock)) then raise exception 'คาบสอนรวมหรือกิจกรรมรวมต้องมีเวลาเริ่มและสิ้นสุดตรงกันทุกระดับ'; end if;
end $$;

create or replace function public.validate_profile_clock(p_rows jsonb,p_count int)
returns void language plpgsql set search_path=public as $$
begin
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'รูปแบบเวลาเรียนไม่ถูกต้อง'; end if;
 if jsonb_array_length(p_rows)<>p_count+1 or exists(select 1 from jsonb_array_elements(p_rows) r where r ? 'profiles')
 or (select count(*) from jsonb_to_recordset(p_rows) r(period int,is_break boolean) where is_break and period=0)<>1
 or (select count(distinct period) from jsonb_to_recordset(p_rows) r(period int,is_break boolean) where not is_break and period between 1 and p_count)<>p_count
 or exists(select 1 from jsonb_to_recordset(p_rows) r(is_break boolean,label text,start_time text,end_time text) where is_break is null or coalesce(trim(label),'')='' or coalesce(start_time,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(end_time,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or start_time>=end_time)
 or exists(select 1 from jsonb_array_elements(p_rows) with ordinality a(r,i),jsonb_array_elements(p_rows) with ordinality b(r,i) where a.i<b.i and a.r->>'end_time'>b.r->>'start_time') then raise exception 'เวลาแต่ละระดับต้องมีคาบเท่ากัน เรียงเวลา และไม่ทับซ้อนกัน'; end if;
end $$;

create or replace function public.save_school_period_times(p_school_id uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare config jsonb; item record; n int; current_rows jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 config=p_rows->0->'profiles';
 if config is not null and (jsonb_typeof(config)<>'object' or exists(select 1 from jsonb_object_keys(config) k where k not in('primary','secondary'))) then raise exception 'ระดับชั้นของเวลาเรียนไม่ถูกต้อง'; end if;
 select count(*) into n from jsonb_to_recordset(p_rows) r(is_break boolean) where not is_break;
 if config is not null then for item in select value from jsonb_each(config) loop perform validate_profile_clock(item.value,n); end loop; end if;
 perform save_school_period_times_before_063(p_school_id,p_rows);
 if config is not null and config<>'{}'::jsonb then update school_period_times set profiles=config where school_id=p_school_id and sort_order=1; end if;
 for item in select distinct c.academic_year_id,s.semester from classrooms c join class_schedule_slots s on s.classroom_id=c.id where c.school_id=p_school_id
 union select academic_year_id,semester from schedule_plans where school_id=p_school_id order by 1,2 loop
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into current_rows from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=p_school_id and s.academic_year_id=item.academic_year_id and s.semester=item.semester;
 perform validate_profile_schedule(p_school_id,item.academic_year_id,item.semester,current_rows);
 perform validate_current_schedule_plan(p_school_id,item.academic_year_id,item.semester);
 end loop;
end $$;

-- Existing atomic writes and lock guards are retained; only resource clocks change.
create or replace function public.save_school_schedule_term_before_063(
  p_school_id uuid, p_year_id uuid, p_expected jsonb, p_rows jsonb, p_allow_unlock boolean default false, p_semester integer default 1
) returns void language plpgsql security definer set search_path = public as $$
declare actual jsonb; events jsonb;
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
  -- Exact multiset equality without quadratic JSON containment on a full school.
  if (select coalesce(jsonb_agg(value order by value),'[]'::jsonb) from jsonb_array_elements(actual))
     is distinct from (select coalesce(jsonb_agg(value order by value),'[]'::jsonb) from jsonb_array_elements(p_expected)) then
    raise exception 'ตารางถูกแก้ไขโดยผู้อื่น กรุณาโหลดใหม่แล้วลองอีกครั้ง';
  end if;
  if exists (
    with previous as materialized (select value-'locked' as signature from jsonb_array_elements(actual)),
    proposed as materialized (select value as raw,value-'locked' as signature from jsonb_array_elements(p_rows))
    select 1 from proposed
    cross join lateral jsonb_to_record(raw) as r(classroom_id uuid,academic_year_id uuid,day_of_week int,period int,class_subject_id uuid,activity_id uuid)
    left join classrooms c on c.id=r.classroom_id
    left join class_subjects cs on cs.id=r.class_subject_id
    left join subjects sub on sub.id=cs.subject_id
    left join class_schedule_activities a on a.id=r.activity_id
    left join evaluation_settings e on e.id=a.evaluation_setting_id
    left join users t on t.id=coalesce(cs.teacher_id,a.teacher_id)
    left join previous on previous.signature=proposed.signature
    where previous.signature is null and (
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
  select public.schedule_joint_event_map(config) into events from schedule_plans where school_id=p_school_id and academic_year_id=p_year_id and semester=p_semester;
  if exists(select 1 from school_period_times where school_id=p_school_id and profiles is not null and profiles<>'{}'::jsonb) then perform validate_profile_schedule(p_school_id,p_year_id,p_semester,p_rows); end if;
  if not exists(select 1 from school_period_times where school_id=p_school_id and profiles is not null and profiles<>'{}'::jsonb) and exists (
    with previous as materialized (select value-'locked' as signature from jsonb_array_elements(actual)),
    proposed as materialized (select value as raw,value-'locked' as signature from jsonb_array_elements(p_rows))
    select 1 from proposed
    cross join lateral jsonb_to_record(raw) as r(day_of_week int,period int,class_subject_id uuid,activity_id uuid)
    left join class_subjects cs on cs.id=r.class_subject_id
    left join class_schedule_activities a on a.id=r.activity_id
    left join previous on previous.signature=proposed.signature
    where coalesce(cs.teacher_id,a.teacher_id) is not null
    group by coalesce(cs.teacher_id,a.teacher_id),r.day_of_week,r.period having count(distinct coalesce(events->>(r.class_subject_id::text||':'||r.day_of_week||':'||r.period),events->>(r.class_subject_id::text||':*'),r.class_subject_id::text,r.activity_id::text))>1
      and bool_or(previous.signature is null)
  ) then raise exception 'ครูมีคาบสอนชนกัน กรุณาเลือกคาบอื่นหรือจัดตารางใหม่ทั้งโรงเรียน'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) r(activity_id uuid) join class_schedule_activities a on a.id=r.activity_id where a.evaluation_setting_id is null group by a.id having count(*)>1) then raise exception 'กิจกรรมพัฒนาผู้เรียนจัดได้ 1 คาบต่อสัปดาห์'; end if;
  if exists (
    select 1 from jsonb_array_elements(actual) old where (old->>'locked')::boolean
    and not exists (select 1 from jsonb_array_elements(p_rows) n where
      case when p_allow_unlock then n - 'locked' = old - 'locked' else n=old end)
  ) then raise exception 'ไม่สามารถแก้ไขคาบที่ล็อก กรุณาปลดล็อกก่อน'; end if;
  if not exists(select 1 from school_period_times where school_id=p_school_id and profiles is not null and profiles<>'{}'::jsonb) and exists(select 1 from jsonb_to_recordset(p_rows) r(class_subject_id uuid,activity_id uuid,day_of_week int,period int)
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
      class_subject_id=excluded.class_subject_id,activity_id=excluded.activity_id,note=excluded.note,locked=excluded.locked,updated_at=now()
    where (class_schedule_slots.class_subject_id,class_schedule_slots.activity_id,class_schedule_slots.note,class_schedule_slots.locked)
      is distinct from (excluded.class_subject_id,excluded.activity_id,excluded.note,excluded.locked);
end;
$$;

create or replace function public.save_school_schedule_term_before_065(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false,p_semester integer default 1) returns void language plpgsql security definer set search_path=public as $$
declare cfg jsonb; r record; used_slots jsonb; times jsonb; events jsonb; slots_by_lesson jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 select config into cfg from schedule_plans where school_id=p_school_id and academic_year_id=p_year_id and semester=p_semester;
 if cfg is not null then
 events=public.schedule_joint_event_map(cfg);
 if exists(select 1 from jsonb_array_elements(p_rows) s where not cfg->'days' @> to_jsonb((s->>'day_of_week')::int)) then raise exception 'คาบอยู่นอกวันเรียนที่กำหนด'; end if;
 if not exists(select 1 from school_period_times where school_id=p_school_id and profiles is not null and profiles<>'{}'::jsonb) and exists(select 1 from jsonb_array_elements(p_rows) s where nullif(cfg->'rules'->(s->>'class_subject_id')->>'roomId','') is not null group by cfg->'rules'->(s->>'class_subject_id')->>'roomId',s->>'day_of_week',s->>'period' having count(distinct coalesce(events->>((s->>'class_subject_id')||':'||(s->>'day_of_week')||':'||(s->>'period')),events->>((s->>'class_subject_id')||':*'),s->>'class_subject_id'))>1) then raise exception 'ห้องสถานที่ชนกัน'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by sort_order),'[]') into times from school_period_times t where school_id=p_school_id;
 select coalesce(jsonb_object_agg(lesson,slots),'{}'::jsonb) into slots_by_lesson from (select s->>'class_subject_id' as lesson,jsonb_agg(s) as slots from jsonb_array_elements(p_rows) s where s->>'class_subject_id' is not null group by s->>'class_subject_id') grouped;
 for r in select key,value from jsonb_each(cfg->'rules') loop
 used_slots=coalesce(slots_by_lesson->r.key,'[]'::jsonb);
 if jsonb_array_length(used_slots)>(r.value->>'count')::int then raise exception 'จำนวนคาบเกินภาระสอนที่กำหนด'; end if;
 select schedule_room_times(p_school_id,classroom_id) into times from class_subjects where id=r.key::uuid;
 if jsonb_array_length(used_slots)=(r.value->>'count')::int and not schedule_pattern_fits(used_slots,r.value->'pattern',times) then raise exception 'รูปแบบคาบไม่ตรงหรือคาบคู่ข้ามช่วงพัก'; end if;
 end loop;
 end if;
 perform save_school_schedule_term_before_063(p_school_id,p_year_id,p_expected,p_rows,p_allow_unlock,p_semester);
end $$;

create or replace function public.validate_activity_teams(p_school uuid,p_year uuid,p_term int,p_rows jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare
  cfg jsonb; g jsonb; v_room_id text; team jsonb; c jsonb;
  weekly integer; pinned integer; placed integer; room_cells jsonb; joint_cells jsonb;
begin
  select config into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
  if cfg is null or cfg->'activityGroups' is null then return; end if;
  if jsonb_typeof(cfg->'activityGroups') is distinct from 'array' or jsonb_array_length(cfg->'activityGroups')>500 then raise exception 'ทีมกิจกรรมไม่ถูกต้อง'; end if;
  if exists(select 1 from jsonb_array_elements(cfg->'activityGroups') x group by x->>'id' having count(*)>1) then raise exception 'ทีมกิจกรรมซ้ำ'; end if;
  if exists(select 1 from jsonb_array_elements(cfg->'activityGroups') x cross join lateral jsonb_array_elements_text(x->'roomIds') r group by x->>'settingId',r having count(*)>1) then raise exception 'กิจกรรมเดียวกันในห้องนี้มีทีมครูแล้ว'; end if;
  for g in select value from jsonb_array_elements(cfg->'activityGroups') loop
    weekly=(g->>'weeklyPeriods')::int;
    pinned=jsonb_array_length(g->'cells');
    if g->>'id' is null or g->>'mode' is null or g->>'mode' not in('joint','separate')
      or not exists(select 1 from evaluation_settings where id=(g->>'settingId')::uuid and school_id=p_school and kind='activities' and is_active)
      or jsonb_typeof(g->'roomIds') is distinct from 'array' or jsonb_array_length(g->'roomIds')<1
      or weekly is null or weekly not between 1 and 8
      or jsonb_typeof(g->'cells') is distinct from 'array' or pinned not in (0,weekly)
      then raise exception 'ข้อมูลกิจกรรมหรือจำนวนคาบไม่ถูกต้อง'; end if;
    if exists(select 1 from jsonb_array_elements_text(g->'roomIds') x group by x having count(*)>1) then raise exception 'ห้องกิจกรรมซ้ำ'; end if;
    if exists(select 1 from jsonb_array_elements(g->'cells') x group by x->>'day',x->>'period' having count(*)>1) then raise exception 'คาบกิจกรรมซ้ำ'; end if;
    joint_cells=null;
    for v_room_id in select value from jsonb_array_elements_text(g->'roomIds') loop
      if not exists(select 1 from classrooms where id=v_room_id::uuid and school_id=p_school and academic_year_id=p_year and level !~ '^(อ\.?\s*[1-3]$|อนุบาล)') then raise exception 'ห้องกิจกรรมไม่อยู่ในโรงเรียนนี้'; end if;
      team=coalesce(case when g->>'mode'='joint' then g->'teacherIds' else g->'roomTeachers'->v_room_id end,'[]'::jsonb);
      if jsonb_typeof(team) is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(team) t where not exists(select 1 from users where id=t::uuid and school_id=p_school and (is_active or email like 'pending-%') and role in('teacher','academic_head','deputy_principal','principal','admin'))) then raise exception 'ครูผู้รับผิดชอบไม่ถูกต้อง'; end if;
      if exists(select 1 from jsonb_array_elements_text(team) t group by t having count(*)>1) then raise exception 'ครูกิจกรรมซ้ำ'; end if;
      for c in select value from jsonb_array_elements(g->'cells') loop
        if not cfg->'days' @> to_jsonb((c->>'day')::int) or not exists(select 1 from school_period_times where school_id=p_school and period=(c->>'period')::int and not is_break) then raise exception 'กิจกรรมอยู่นอกวันเรียนหรือใช้คาบพัก'; end if;
        if not exists(select 1 from jsonb_to_recordset(p_rows) s(classroom_id uuid,activity_id uuid,day_of_week int,period int) join class_schedule_activities a on a.id=s.activity_id where s.classroom_id=v_room_id::uuid and a.evaluation_setting_id=(g->>'settingId')::uuid and s.day_of_week=(c->>'day')::int and s.period=(c->>'period')::int) then raise exception 'กิจกรรมกำหนดตายตัว กรุณาแก้ในเมนูกิจกรรมและครูผู้รับผิดชอบ'; end if;
      end loop;
      select count(*),coalesce(jsonb_agg(jsonb_build_array(s.day_of_week,s.period) order by s.day_of_week,s.period),'[]'::jsonb)
      into placed,room_cells from jsonb_to_recordset(p_rows) s(classroom_id uuid,activity_id uuid,day_of_week int,period int)
        join class_schedule_activities a on a.id=s.activity_id
      where s.classroom_id=v_room_id::uuid and a.evaluation_setting_id=(g->>'settingId')::uuid;
      -- Flexible groups may await generation or be partially entered manually;
      -- pinned groups must always contain every declared cell.
      if placed>weekly or (pinned>0 and placed<>weekly) then raise exception 'จำนวนคาบกิจกรรมไม่ตรงกับทีมครู'; end if;
      if g->>'mode'='joint' then
        if joint_cells is null then joint_cells=room_cells;
        elsif joint_cells is distinct from room_cells then raise exception 'กิจกรรมครูชุดเดียวกันต้องจัดพร้อมกันทุกห้องในกลุ่ม'; end if;
      end if;
    end loop;
  end loop;
  if not exists(select 1 from school_period_times where school_id=p_school and profiles is not null and profiles<>'{}'::jsonb) and exists(select 1 from activity_team_teaching(p_school,p_year,p_term,p_rows) group by teacher_id,day_of_week,period having count(distinct event_id)>1) then raise exception 'ครูผู้รับผิดชอบกิจกรรมมีคาบสอนชนกัน'; end if;
  if not exists(select 1 from school_period_times where school_id=p_school and profiles is not null and profiles<>'{}'::jsonb) and exists(select 1 from activity_team_teaching(p_school,p_year,p_term,p_rows) t join schedule_teacher_blocks b on b.school_id=p_school and b.academic_year_id=p_year and b.semester=p_term and b.teacher_id=t.teacher_id and b.day_of_week=t.day_of_week and b.period=t.period) then raise exception 'ครูผู้รับผิดชอบกิจกรรมล็อกคาบว่างนี้ไว้'; end if;

  if exists(select 1 from school_period_times where school_id=p_school and profiles is not null and profiles<>'{}'::jsonb) then perform validate_profile_schedule(p_school,p_year,p_term,p_rows); end if;
end $$;

create or replace function public.set_schedule_teacher_block(p_school_id uuid,p_year_id uuid,p_semester integer,p_teacher_id uuid,p_day integer,p_period integer,p_blocked boolean)
returns void language plpgsql security definer set search_path=public as $$
declare rows jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 if not exists(select 1 from school_period_times where school_id=p_school_id and profiles is not null and profiles<>'{}'::jsonb) then
   select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into rows from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=p_school_id and s.academic_year_id=p_year_id and s.semester=p_semester;
   if p_blocked and exists(select 1 from activity_team_teaching(p_school_id,p_year_id,p_semester,rows) t where t.teacher_id=p_teacher_id and t.day_of_week=p_day and t.period=p_period) then raise exception 'คาบนี้มีสอนกิจกรรมอยู่'; end if;
   perform set_schedule_teacher_block_before_065(p_school_id,p_year_id,p_semester,p_teacher_id,p_day,p_period,p_blocked);return;
 end if;
 if p_blocked is null or p_semester is null or p_day is null or p_period is null or p_semester not in(1,2) or p_day not between 1 and 5 or p_period not between 1 and 8
 or not exists(select 1 from academic_years where id=p_year_id and school_id=p_school_id)
 or not exists(select 1 from users where id=p_teacher_id and school_id=p_school_id and (is_active or email like 'pending-%') and role in('teacher','academic_head','deputy_principal','principal','admin'))
 or not exists(select 1 from school_period_times where school_id=p_school_id and not is_break and period=p_period) then raise exception 'ข้อมูลครู ปีการศึกษา หรือคาบไม่ถูกต้อง'; end if;
 if not p_blocked then delete from schedule_teacher_blocks where school_id=p_school_id and academic_year_id=p_year_id and semester=p_semester and teacher_id=p_teacher_id and day_of_week=p_day and period=p_period;return;end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into rows from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=p_school_id and s.academic_year_id=p_year_id and s.semester=p_semester;
 if exists(select 1 from schedule_profile_cells(p_school_id,p_year_id,p_semester,rows) c join school_period_times t on t.school_id=p_school_id and not t.is_break and t.period=p_period and c.start_clock<t.end_time::time and t.start_time::time<c.end_clock where c.teacher=p_teacher_id and c.day=p_day) then raise exception 'ครูมีสอนในช่วงเวลานี้ กรุณาย้ายคาบก่อนล็อก'; end if;
 insert into schedule_teacher_blocks(school_id,academic_year_id,semester,teacher_id,day_of_week,period) values(p_school_id,p_year_id,p_semester,p_teacher_id,p_day,p_period) on conflict do nothing;
end $$;
revoke all on function public.set_schedule_teacher_block(uuid,uuid,int,uuid,int,int,boolean) from public,anon,authenticated;
grant execute on function public.set_schedule_teacher_block(uuid,uuid,int,uuid,int,int,boolean) to service_role;
revoke all on function public.schedule_room_times(uuid,uuid),public.schedule_profile_cells(uuid,uuid,int,jsonb),public.validate_profile_schedule(uuid,uuid,int,jsonb),public.validate_profile_clock(jsonb,int) from public,anon,authenticated;
grant execute on function public.schedule_room_times(uuid,uuid),public.schedule_profile_cells(uuid,uuid,int,jsonb),public.validate_profile_schedule(uuid,uuid,int,jsonb),public.validate_profile_clock(jsonb,int) to service_role;
revoke all on function public.save_school_period_times(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_school_period_times(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
