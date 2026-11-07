begin;
create or replace function public.class_subject_note_teacher(p_teacher uuid, p_units jsonb, p_note text)
returns uuid language plpgsql immutable as $$
declare idx int; chosen text;
begin
  if p_note is null or p_note !~ '^unit:[01]$' or jsonb_typeof(p_units) is distinct from 'array' then return p_teacher; end if;
  idx := substring(p_note from 6)::int;
  if idx < 0 or idx >= jsonb_array_length(p_units) then return p_teacher; end if;
  if coalesce((p_units->idx->>'use_main')::boolean, false) then return p_teacher; end if;
  chosen := nullif(p_units->idx->>'teacher_id','');
  if chosen is null or chosen !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return p_teacher; end if;
  return chosen::uuid;
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
    cross join lateral jsonb_to_record(raw) as r(classroom_id uuid,academic_year_id uuid,day_of_week int,period int,class_subject_id uuid,activity_id uuid,note text)
    left join classrooms c on c.id=r.classroom_id
    left join class_subjects cs on cs.id=r.class_subject_id
    left join subjects sub on sub.id=cs.subject_id
    left join class_schedule_activities a on a.id=r.activity_id
    left join evaluation_settings e on e.id=a.evaluation_setting_id
    left join users t on t.id=coalesce(public.class_subject_note_teacher(cs.teacher_id,cs.content_units,r.note),a.teacher_id)
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
    cross join lateral jsonb_to_record(raw) as r(day_of_week int,period int,class_subject_id uuid,activity_id uuid,note text)
    left join class_subjects cs on cs.id=r.class_subject_id
    left join class_schedule_activities a on a.id=r.activity_id
    left join previous on previous.signature=proposed.signature
    where coalesce(public.class_subject_note_teacher(cs.teacher_id,cs.content_units,r.note),a.teacher_id) is not null
    group by coalesce(public.class_subject_note_teacher(cs.teacher_id,cs.content_units,r.note),a.teacher_id),r.day_of_week,r.period having count(distinct coalesce(events->>(r.class_subject_id::text||':'||r.day_of_week||':'||r.period),events->>(r.class_subject_id::text||':*'),r.class_subject_id::text,r.activity_id::text))>1
      and bool_or(previous.signature is null)
  ) then raise exception 'ครูมีคาบสอนชนกัน กรุณาเลือกคาบอื่นหรือจัดตารางใหม่ทั้งโรงเรียน'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) r(activity_id uuid) join class_schedule_activities a on a.id=r.activity_id where a.evaluation_setting_id is null group by a.id having count(*)>1) then raise exception 'กิจกรรมพัฒนาผู้เรียนจัดได้ 1 คาบต่อสัปดาห์'; end if;
  if exists (
    select 1 from jsonb_array_elements(actual) old where (old->>'locked')::boolean
    and not exists (select 1 from jsonb_array_elements(p_rows) n where
      case when p_allow_unlock then n - 'locked' = old - 'locked' else n=old end)
  ) then raise exception 'ไม่สามารถแก้ไขคาบที่ล็อก กรุณาปลดล็อกก่อน'; end if;
  if not exists(select 1 from school_period_times where school_id=p_school_id and profiles is not null and profiles<>'{}'::jsonb) and exists(select 1 from jsonb_to_recordset(p_rows) r(class_subject_id uuid,activity_id uuid,day_of_week int,period int,note text)
    left join class_subjects cs on cs.id=r.class_subject_id left join class_schedule_activities a on a.id=r.activity_id
    join schedule_teacher_blocks b on b.teacher_id=coalesce(public.class_subject_note_teacher(cs.teacher_id,cs.content_units,r.note),a.teacher_id) and b.school_id=p_school_id
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


create or replace function public.schedule_profile_cells(p_school uuid,p_year uuid,p_term int,p_rows jsonb)
returns table(room_id uuid,day int,period int,teacher uuid,event text,venue text,start_clock time,end_clock time)
language sql stable set search_path=public as $$
 with cfg as(select config,public.schedule_joint_event_map(config) events from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term),
 cells as(select s.*,public.class_subject_note_teacher(cs.teacher_id,cs.content_units,s.note) subject_teacher,a.teacher_id activity_teacher,cs.classroom_id subject_room,
 coalesce((select events from cfg)->>(s.class_subject_id::text||':'||s.day_of_week||':'||s.period),(select events from cfg)->>(s.class_subject_id::text||':*'),s.class_subject_id::text,s.activity_id::text) lesson_event,
 (select g from cfg cross join lateral jsonb_array_elements(coalesce(config->'activityGroups','[]')) g where g->>'settingId'=a.evaluation_setting_id::text and g->'roomIds' @> to_jsonb(s.classroom_id::text) limit 1) activity_group,
 (select config->'rules'->s.class_subject_id::text->>'roomId' from cfg) venue
 from jsonb_to_recordset(p_rows) s(classroom_id uuid,day_of_week int,period int,class_subject_id uuid,activity_id uuid,note text)
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

create or replace function public.activity_team_teaching(p_school uuid,p_year uuid,p_term int,p_rows jsonb)
returns table(teacher_id uuid,day_of_week int,period int,event_id text) language sql stable security definer set search_path=public as $$
 with config as materialized(select sp.config,public.schedule_joint_event_map(sp.config) as events from schedule_plans sp where sp.school_id=p_school and sp.academic_year_id=p_year and sp.semester=p_term),
 groups as(select g from config cross join lateral jsonb_array_elements(coalesce(config->'activityGroups','[]')) g),
 slots as(select * from jsonb_to_recordset(p_rows) s(classroom_id uuid,activity_id uuid,class_subject_id uuid,day_of_week int,period int,note text)),
 staffed as(select s.*,g from slots s join class_schedule_activities a on a.id=s.activity_id join groups on g->>'settingId'=a.evaluation_setting_id::text and g->'roomIds' @> to_jsonb(s.classroom_id::text))
 select distinct t::uuid,s.day_of_week,s.period,(s.g->>'id')||case when s.g->>'mode'='joint' then '' else ':'||s.classroom_id::text end
 from staffed s cross join lateral jsonb_array_elements_text(case when s.g->>'mode'='joint' then s.g->'teacherIds' else s.g->'roomTeachers'->s.classroom_id::text end) t
 union all
 select coalesce(public.class_subject_note_teacher(cs.teacher_id,cs.content_units,s.note),a.teacher_id),s.day_of_week,s.period,coalesce((select events from config)->>(s.class_subject_id::text||':'||s.day_of_week||':'||s.period),(select events from config)->>(s.class_subject_id::text||':*'),s.class_subject_id::text,s.activity_id::text) from slots s
 left join class_subjects cs on cs.id=s.class_subject_id left join class_schedule_activities a on a.id=s.activity_id
 where coalesce(public.class_subject_note_teacher(cs.teacher_id,cs.content_units,s.note),a.teacher_id) is not null and not exists(select 1 from staffed x where x.classroom_id=s.classroom_id and x.day_of_week=s.day_of_week and x.period=s.period)
$$;

revoke all on function public.class_subject_note_teacher(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.class_subject_note_teacher(uuid,jsonb,text) to service_role;
notify pgrst, 'reload schema';
commit;
