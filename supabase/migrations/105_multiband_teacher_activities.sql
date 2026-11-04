-- Three independent bell profiles, multiple breaks and term-scoped teacher activities.
-- Existing schedules/configuration remain unchanged until an authorized save.
begin;
alter table public.school_period_times drop constraint if exists school_period_times_period_check;
alter table public.school_period_times add constraint school_period_times_period_check check(period between -23 and 12);


create or replace function public.schedule_room_times(p_school uuid,p_room uuid)
returns jsonb language sql stable set search_path=public as $$
 with bell as(select coalesce(jsonb_agg(to_jsonb(t)-'profiles' order by sort_order),'[{"period": 1, "label": "คาบที่ 1", "start_time": "08:30", "end_time": "09:30", "is_break": false, "sort_order": 1}, {"period": 2, "label": "คาบที่ 2", "start_time": "09:30", "end_time": "10:30", "is_break": false, "sort_order": 2}, {"period": 3, "label": "คาบที่ 3", "start_time": "10:30", "end_time": "11:30", "is_break": false, "sort_order": 3}, {"period": 0, "label": "พักเที่ยง", "start_time": "11:30", "end_time": "12:30", "is_break": true, "sort_order": 4}, {"period": 4, "label": "คาบที่ 4", "start_time": "12:30", "end_time": "13:30", "is_break": false, "sort_order": 5}, {"period": 5, "label": "คาบที่ 5", "start_time": "13:30", "end_time": "14:30", "is_break": false, "sort_order": 6}, {"period": 6, "label": "คาบที่ 6", "start_time": "14:30", "end_time": "15:30", "is_break": false, "sort_order": 7}]'::jsonb) base,
 (select profiles from school_period_times where school_id=p_school and profiles is not null limit 1) profiles
 from school_period_times t where school_id=p_school), room as(select case
 when level ~ '^(อ\.?\s*[1-3]|อนุบาล)' then 'kindergarten'
 when level ~ '^(ป\.?\s*[1-6]|ประถม)' then 'primary'
 when level ~ '^(ม\.?\s*[1-6]|มัธยม)' then 'secondary' end band from classrooms where id=p_room and school_id=p_school)
 select coalesce(bell.profiles->(select band from room),bell.base) from bell
$$;

create or replace function public.validate_profile_clock(p_rows jsonb,p_count int)
returns void language plpgsql set search_path=public as $$
declare n int;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'รูปแบบเวลาเรียนไม่ถูกต้อง'; end if;
 select count(*) into n from jsonb_to_recordset(p_rows) r(is_break boolean) where not is_break;
 if n not between 1 and 8 or jsonb_array_length(p_rows)>24
 or exists(select 1 from jsonb_array_elements(p_rows) r where r ? 'profiles' or r ? 'teacherActivities')
 or (select count(distinct period) from jsonb_to_recordset(p_rows) r(period int))<>jsonb_array_length(p_rows)
 or exists(select 1 from jsonb_to_recordset(p_rows) r(period int,is_break boolean) where period is null or (is_break and period not between -23 and 0) or (not is_break and period not between 1 and n))
 or exists(select 1 from jsonb_to_recordset(p_rows) r(is_break boolean,label text,start_time text,end_time text) where is_break is null or coalesce(trim(label),'')='' or length(label)>150 or coalesce(start_time,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(end_time,'') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or start_time>=end_time)
 or exists(select 1 from jsonb_array_elements(p_rows) with ordinality a(r,i),jsonb_array_elements(p_rows) with ordinality b(r,i) where a.i<b.i and a.r->>'end_time'>b.r->>'start_time')
 or exists(select 1 from (select (r->>'period')::int p,row_number() over(order by i) seq from jsonb_array_elements(p_rows) with ordinality t(r,i) where not (r->>'is_break')::boolean) teaching where p<>seq)
 then raise exception 'คาบเรียนต้องเรียงจาก 1 สูงสุด 8 คาบ ช่วงพักใช้หมายเลขแยก และเวลาไม่ทับซ้อนกัน'; end if;
end $$;

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
      or not exists(select 1 from jsonb_array_elements(schedule_room_times(p_school_id,r.classroom_id)) t where not (t->>'is_break')::boolean and (t->>'period')::int=r.period)
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
      if not exists(select 1 from classrooms where id=v_room_id::uuid and school_id=p_school and academic_year_id=p_year) then raise exception 'ห้องกิจกรรมไม่อยู่ในโรงเรียนนี้'; end if;
      team=coalesce(case when g->>'mode'='joint' then g->'teacherIds' else g->'roomTeachers'->v_room_id end,'[]'::jsonb);
      if jsonb_typeof(team) is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(team) t where not exists(select 1 from users where id=t::uuid and school_id=p_school and (is_active or email like 'pending-%') and role in('teacher','academic_head','deputy_principal','principal','admin'))) then raise exception 'ครูผู้รับผิดชอบไม่ถูกต้อง'; end if;
      if exists(select 1 from jsonb_array_elements_text(team) t group by t having count(*)>1) then raise exception 'ครูกิจกรรมซ้ำ'; end if;
      for c in select value from jsonb_array_elements(g->'cells') loop
        if not cfg->'days' @> to_jsonb((c->>'day')::int) or not exists(select 1 from jsonb_array_elements(schedule_room_times(p_school,v_room_id::uuid)) t where (t->>'period')::int=(c->>'period')::int and not (t->>'is_break')::boolean) then raise exception 'กิจกรรมอยู่นอกวันเรียนหรือใช้คาบพัก'; end if;
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

create or replace function public.validate_teacher_activity_config(p_school uuid,p_activities jsonb)
returns void language plpgsql set search_path=public as $$
declare a jsonb;
begin
 if p_activities is null then return; end if;
 if jsonb_typeof(p_activities) is distinct from 'array' then raise exception 'รูปแบบกิจกรรมครูไม่ถูกต้อง'; end if;
 if jsonb_array_length(p_activities)>200 or exists(select 1 from jsonb_array_elements(p_activities) g group by g->>'id' having count(*)>1) then raise exception 'กิจกรรมครูซ้ำหรือเกินจำนวน'; end if;
 for a in select value from jsonb_array_elements(p_activities) loop
 if jsonb_typeof(a)<>'object' or coalesce(a->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or length(trim(coalesce(a->>'name',''))) not between 1 and 150
 or coalesce(a->>'start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(a->>'end_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or a->>'start_time'>=a->>'end_time'
 then raise exception 'ชื่อหรือเวลากิจกรรมครูไม่ถูกต้อง'; end if;
 if jsonb_typeof(a->'days') is distinct from 'array' or jsonb_typeof(a->'teacherIds') is distinct from 'array' then raise exception 'เลือกวันและครูผู้เข้าร่วมกิจกรรม'; end if;
 if jsonb_array_length(a->'days') not between 1 and 5 or jsonb_array_length(a->'teacherIds') not between 1 and 1000
 or exists(select 1 from jsonb_array_elements(a->'days') d where d not in('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb))
 or exists(select 1 from jsonb_array_elements(a->'days') d group by d having count(*)>1)
 or exists(select 1 from jsonb_array_elements_text(a->'teacherIds') t group by t having count(*)>1)
 or exists(select 1 from jsonb_array_elements_text(a->'teacherIds') t where t is null or not exists(select 1 from users u where u.id::text=t and u.school_id=p_school and (u.is_active or u.email like 'pending-%') and u.role in('teacher','academic_head','deputy_principal','principal','admin')))
 then raise exception 'วันหรือครูผู้เข้าร่วมกิจกรรมไม่ถูกต้อง'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_activities) with ordinality a(g,i) join jsonb_array_elements(p_activities) with ordinality b(g,i) on a.i<b.i and a.g->>'start_time'<b.g->>'end_time' and b.g->>'start_time'<a.g->>'end_time'
 where exists(select 1 from jsonb_array_elements(a.g->'days') d where b.g->'days' @> jsonb_build_array(d)) and exists(select 1 from jsonb_array_elements(a.g->'teacherIds') t where b.g->'teacherIds' @> jsonb_build_array(t))) then raise exception 'กิจกรรมครูมีวันและเวลาทับซ้อนกัน'; end if;
end $$;

create or replace function public.validate_teacher_schedule_activities(p_school uuid,p_year uuid,p_term int,p_rows jsonb)
returns void language plpgsql set search_path=public as $$
declare activities jsonb; clash record;
begin
 select config->'teacherActivities' into activities from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
 perform validate_teacher_activity_config(p_school,activities);
 select c.teacher,c.day,a->>'name' name,a->>'start_time' start_time,a->>'end_time' end_time into clash
 from schedule_profile_cells(p_school,p_year,p_term,p_rows) c cross join lateral jsonb_array_elements(coalesce(activities,'[]')) a
 where a->'teacherIds' @> jsonb_build_array(c.teacher::text) and a->'days' @> jsonb_build_array(c.day) and c.start_clock<(a->>'end_time')::time and (a->>'start_time')::time<c.end_clock limit 1;
 if found then raise exception 'ครูมีกิจกรรม % วัน % เวลา %–% ทับกับคาบสอน กรุณาย้ายคาบหรือแก้กิจกรรมครู',clash.name,clash.day,clash.start_time,clash.end_time; end if;
end $$;

-- Wrap the current writers; retain all existing CAS, tenancy, row and lock guards.
do $$ begin
 if to_regprocedure('public.save_school_schedule_term_before_105(uuid,uuid,jsonb,jsonb,boolean,integer)') is null then alter function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,int) rename to save_school_schedule_term_before_105; end if;
 if to_regprocedure('public.save_schedule_plan_before_105(uuid,uuid,integer,text,jsonb)') is null then alter function public.save_schedule_plan(uuid,uuid,int,text,jsonb) rename to save_schedule_plan_before_105; end if;
end $$;
create or replace function public.save_school_schedule_term(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false,p_semester int default 1)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 perform validate_teacher_schedule_activities(p_school_id,p_year_id,p_semester,p_rows);
 perform save_school_schedule_term_before_105(p_school_id,p_year_id,p_expected,p_rows,p_allow_unlock,p_semester);
end $$;
create or replace function public.save_schedule_plan(p_school uuid,p_year uuid,p_term int,p_hash text,p_config jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table users in share mode;
 perform validate_teacher_activity_config(p_school,p_config->'teacherActivities');
 perform save_schedule_plan_before_105(p_school,p_year,p_term,p_hash,p_config);
end $$;

create or replace function public.save_school_period_times(p_school_id uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare profiles jsonb; base jsonb; item record; current_rows jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 if not exists(select 1 from schools where id=p_school_id) then raise exception 'ไม่พบโรงเรียน'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'รูปแบบเวลาเรียนไม่ถูกต้อง'; end if;
 profiles=p_rows->0->'profiles';
 if profiles is not null and (jsonb_typeof(profiles)<>'object' or exists(select 1 from jsonb_object_keys(profiles) k where k not in('kindergarten','primary','secondary'))) then raise exception 'ช่วงชั้นของเวลาเรียนไม่ถูกต้อง'; end if;
 select jsonb_agg(r-'profiles' order by i) into base from jsonb_array_elements(p_rows) with ordinality t(r,i);
 perform validate_profile_clock(base,0);
 if exists(select 1 from jsonb_array_elements(p_rows) with ordinality t(r,i) where i>1 and r ? 'profiles') then raise exception 'กำหนดชุดเวลาได้ที่แถวแรกเท่านั้น'; end if;
 if profiles is not null then for item in select value from jsonb_each(profiles) loop perform validate_profile_clock(item.value,0); end loop; end if;
 if exists(select 1 from schedule_teacher_blocks b where b.school_id=p_school_id and not exists(select 1 from jsonb_array_elements(base) r where not (r->>'is_break')::boolean and (r->>'period')::int=b.period)) then raise exception 'มีครูล็อกคาบในชุดเวลาหลักที่กำลังจะลบ กรุณาปลดล็อกก่อน'; end if;
 delete from school_period_times where school_id=p_school_id;
 insert into school_period_times(school_id,period,label,start_time,end_time,is_break,sort_order,profiles)
 select p_school_id,(r->>'period')::int,trim(r->>'label'),r->>'start_time',r->>'end_time',(r->>'is_break')::boolean,i,case when i=1 then profiles else null end
 from jsonb_array_elements(base) with ordinality t(r,i);
 for item in select distinct c.academic_year_id,s.semester from classrooms c join class_schedule_slots s on s.classroom_id=c.id where c.school_id=p_school_id
 union select academic_year_id,semester from schedule_plans where school_id=p_school_id order by 1,2 loop
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into current_rows from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=p_school_id and s.academic_year_id=item.academic_year_id and s.semester=item.semester;
 perform validate_profile_schedule(p_school_id,item.academic_year_id,item.semester,current_rows);
 perform validate_current_schedule_plan(p_school_id,item.academic_year_id,item.semester);
 end loop;
end $$;


create or replace function public.activity_plan_teacher_ids(p_config jsonb)
returns table(teacher_id text) language sql immutable set search_path=public as $$
 select distinct id from (
 select value id from jsonb_array_elements_text(coalesce(p_config->'teacherIds','[]'::jsonb))
 union all select t.value from jsonb_array_elements(coalesce(p_config->'activityGroups','[]')) g cross join lateral jsonb_array_elements_text(coalesce(g->'teacherIds','[]')) t
 union all select t.value from jsonb_array_elements(coalesce(p_config->'activityGroups','[]')) g cross join lateral jsonb_each(coalesce(g->'roomTeachers','{}')) r cross join lateral jsonb_array_elements_text(r.value) t
 union all select t.value from jsonb_array_elements(coalesce(p_config->'teacherActivities','[]')) g cross join lateral jsonb_array_elements_text(coalesce(g->'teacherIds','[]')) t
 ) ids
$$;

create or replace function public.remove_activity_teacher_refs(p_config jsonb,p_removed text[])
returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb:=p_config; groups jsonb:='[]'; g jsonb; room record; team jsonb; room_teams jsonb;
begin
 if coalesce(cardinality(p_removed),0)=0 then return result; end if;
 if result ? 'teacherIds' then
 select coalesce(jsonb_agg(to_jsonb(t.value) order by t.ord),'[]') into team from jsonb_array_elements_text(result->'teacherIds') with ordinality t(value,ord) where t.value is not null and not coalesce(t.value=any(p_removed),false);
 if team='[]'::jsonb and jsonb_array_length(result->'teacherIds')>0 then result=result-'teacherIds';else result=jsonb_set(result,'{teacherIds}',team);end if;
 end if;
 if result ? 'activityGroups' then
 for g in select value from jsonb_array_elements(result->'activityGroups') with ordinality t(value,ord) order by ord loop
 if g ? 'teacherIds' then
 select coalesce(jsonb_agg(to_jsonb(t.value) order by t.ord),'[]') into team from jsonb_array_elements_text(g->'teacherIds') with ordinality t(value,ord) where t.value is not null and not coalesce(t.value=any(p_removed),false);
 g=jsonb_set(g,'{teacherIds}',team);
 end if;
 if g ? 'roomTeachers' then
 room_teams='{}';
 for room in select key,value from jsonb_each(g->'roomTeachers') loop
 select coalesce(jsonb_agg(to_jsonb(t.value) order by t.ord),'[]') into team from jsonb_array_elements_text(room.value) with ordinality t(value,ord) where t.value is not null and not coalesce(t.value=any(p_removed),false);
 room_teams=room_teams||jsonb_build_object(room.key,team);
 end loop;
 g=jsonb_set(g,'{roomTeachers}',room_teams);
 end if;
 groups=groups||jsonb_build_array(g);
 end loop;
 result=jsonb_set(result,'{activityGroups}',groups);
 end if;
 if result ? 'teacherActivities' then
 groups='[]';
 for g in select value from jsonb_array_elements(result->'teacherActivities') loop
 select coalesce(jsonb_agg(to_jsonb(t.value) order by t.ord),'[]') into team from jsonb_array_elements_text(g->'teacherIds') with ordinality t(value,ord) where t.value is not null and not coalesce(t.value=any(p_removed),false);
 if jsonb_array_length(team)>0 then groups=groups||jsonb_build_array(jsonb_set(g,'{teacherIds}',team));end if;
 end loop;
 result=jsonb_set(result,'{teacherActivities}',groups);
 end if;
 return result;
end $$;



revoke all on function public.validate_teacher_activity_config(uuid,jsonb),public.validate_teacher_schedule_activities(uuid,uuid,int,jsonb),public.save_school_schedule_term_before_105(uuid,uuid,jsonb,jsonb,boolean,int),public.save_schedule_plan_before_105(uuid,uuid,int,text,jsonb) from public,anon,authenticated;
revoke all on function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,int),public.save_schedule_plan(uuid,uuid,int,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,int),public.save_schedule_plan(uuid,uuid,int,text,jsonb) to service_role;
create or replace function public.validate_joint_teaching(p_school uuid,p_year uuid,p_term int,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare cfg jsonb; groups jsonb; g jsonb; member text; seen text[]='{}'; gids text[]='{}'; rooms uuid[]; row_data record;
 teacher uuid; signature jsonb; member_signature jsonb; positions jsonb; member_positions jsonb; rule jsonb; n int;
begin
 select config into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
 groups=cfg->'teachingGroups'; if groups is null then return; end if;
 if jsonb_typeof(groups)<>'array' or jsonb_array_length(groups)>500 then raise exception 'รายการสอนรวมไม่ถูกต้อง'; end if;
 for g in select value from jsonb_array_elements(groups) loop
   if coalesce(g->>'id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or g->>'id'=any(gids) then raise exception 'รหัสกลุ่มสอนรวมไม่ถูกต้องหรือซ้ำ'; end if;
   gids=array_append(gids,g->>'id');
   if jsonb_typeof(g->'lessonIds') is distinct from 'array' then raise exception 'รายการวิชาสอนรวมไม่ถูกต้อง'; end if;
   if jsonb_array_length(g->'lessonIds')<2 or jsonb_array_length(g->'lessonIds')>500 then raise exception 'สอนรวมต้องมีอย่างน้อย 2 ห้อง'; end if;
   if g ? 'cells' then
     if jsonb_typeof(g->'cells') is distinct from 'array' then raise exception 'คาบสอนรวมไม่ถูกต้อง'; end if;
     if jsonb_array_length(g->'cells')<1 or jsonb_array_length(g->'cells')>40 then raise exception 'คาบสอนรวมไม่ถูกต้อง'; end if;
     if exists(select 1 from jsonb_array_elements(g->'cells') v where coalesce(v->>'day','') !~ '^[1-5]$' or coalesce(v->>'period','') !~ '^[1-8]$') then raise exception 'วันหรือคาบสอนรวมไม่ถูกต้อง'; end if;
     if (select count(distinct jsonb_build_array(v->>'day',v->>'period')) from jsonb_array_elements(g->'cells') v)<>jsonb_array_length(g->'cells') then raise exception 'คาบสอนรวมซ้ำ'; end if;
     if exists(select 1 from jsonb_array_elements(g->'cells') v where not cfg->'days' @> to_jsonb((v->>'day')::int) or exists(select 1 from jsonb_array_elements_text(g->'lessonIds') l join class_subjects cs on cs.id=l::uuid where not exists(select 1 from jsonb_array_elements(schedule_room_times(p_school,cs.classroom_id)) t where not (t->>'is_break')::boolean and (t->>'period')::int=(v->>'period')::int))) then raise exception 'คาบสอนรวมอยู่นอกเวลาเรียนหรือเป็นช่วงพัก'; end if;
   end if;
   rooms='{}'; teacher=null; signature=null; positions=null;
   for member in select jsonb_array_elements_text(g->'lessonIds') loop
     if member !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or member=any(seen) then raise exception 'วิชาสอนรวมไม่ถูกต้องหรืออยู่ในหลายกลุ่ม'; end if;
     seen=array_append(seen,member);
     select cs.classroom_id,cs.teacher_id into row_data from class_subjects cs
       join classrooms c on c.id=cs.classroom_id join subjects sub on sub.id=cs.subject_id
       join users t on t.id=cs.teacher_id
       where cs.id=member::uuid and c.school_id=p_school and sub.school_id=p_school and t.school_id=p_school
       and cs.academic_year_id=p_year and c.academic_year_id=p_year and coalesce((to_jsonb(cs)->>'semester')::int,0) in(0,p_term) and (t.is_active or t.email like 'pending-%')
       and t.role in('teacher','academic_head','deputy_principal','principal','admin');
     if not found then raise exception 'วิชาหรือครูในกลุ่มสอนรวมไม่อยู่ในโรงเรียน/ปีการศึกษานี้'; end if;
     if row_data.classroom_id=any(rooms) then raise exception 'สอนรวมต้องเลือกวิชาจากคนละห้อง'; end if;
     rooms=array_append(rooms,row_data.classroom_id);
     if teacher is null then teacher=row_data.teacher_id; elsif teacher<>row_data.teacher_id then raise exception 'สอนรวมต้องเป็นครูคนเดียวกันทุกห้อง'; end if;
     rule=cfg->'rules'->member;
     if rule is null or coalesce(rule->>'count','') !~ '^[0-9]{1,2}$' then raise exception 'กำหนดภาระสอนก่อนสร้างกลุ่มสอนรวม'; end if;
     n=(rule->>'count')::int;
     if n<1 or n>40 or jsonb_typeof(rule->'pattern') is distinct from 'array' then raise exception 'รูปแบบคาบสอนรวมไม่ถูกต้อง'; end if;
     if exists(select 1 from jsonb_array_elements_text(rule->'pattern') v where v !~ '^[1-8]$') then raise exception 'รูปแบบคาบสอนรวมไม่ถูกต้อง'; end if;
     if (select coalesce(sum(v::int),0) from jsonb_array_elements_text(rule->'pattern') v)<>n then raise exception 'รูปแบบคาบสอนรวมไม่ตรงจำนวนคาบ'; end if;
     if nullif(rule->>'roomId','') is not null and not exists(select 1 from jsonb_array_elements(cfg->'rooms') r where r->>'id'=rule->>'roomId') then raise exception 'ไม่พบสถานที่สอนรวม'; end if;
     member_signature=jsonb_build_array(n,(select jsonb_agg(v::int order by v::int) from jsonb_array_elements_text(rule->'pattern') v),nullif(rule->>'roomId',''),coalesce(rule->>'timePreference',case when rule->>'morning'='true' then 'morning' else 'any' end));
     if g ? 'cells' then
       if jsonb_array_length(g->'cells')>n then raise exception 'คาบสอนรวมเกินภาระสอน'; end if;
       if exists(select 1 from jsonb_array_elements(g->'cells') v where not exists(select 1 from jsonb_array_elements(p_rows) s where s->>'class_subject_id'=member and s->>'classroom_id'=row_data.classroom_id::text and s->>'day_of_week'=v->>'day' and s->>'period'=v->>'period' and s->>'locked'='true')) then raise exception 'ต้องล็อกคาบสอนรวมให้ตรงกันครบทุกห้อง'; end if;
     else
       if signature is null then signature=member_signature; elsif signature<>member_signature then raise exception 'สอนรวมต้องมีจำนวนคาบ รูปแบบคาบ สถานที่ และช่วงเวลาตรงกัน'; end if;
     end if;
     select coalesce(jsonb_agg(jsonb_build_array(s->>'day_of_week',s->>'period') order by (s->>'day_of_week')::int,(s->>'period')::int),'[]'::jsonb) into member_positions
       from jsonb_array_elements(p_rows) s where s->>'class_subject_id'=member and s->>'classroom_id'=row_data.classroom_id::text;
     if not (g ? 'cells') then if positions is null then positions=member_positions; elsif positions<>member_positions then raise exception 'วิชาสอนรวมต้องอยู่วันและคาบเดียวกันครบทุกห้อง กรุณาล้างหรือจัดกลุ่มนี้ใหม่พร้อมกัน'; end if; end if;
   end loop;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
