-- Precompute shared teaching events once per batch instead of rereading the plan
-- for every lesson cell. No timetable, draft, lock or plan is rewritten.
begin;
create or replace function public.schedule_joint_event_map(p_config jsonb)
returns jsonb language sql immutable set search_path=public as $$
 select coalesce(jsonb_object_agg(member||':'||cell_key,'teaching:'||(g->>'id')),'{}'::jsonb)
 from jsonb_array_elements(coalesce(p_config->'teachingGroups','[]'::jsonb)) g
 cross join lateral jsonb_array_elements_text(g->'lessonIds') member
 cross join lateral (
   select '*' as cell_key where not (g ? 'cells')
   union all
   select (v->>'day')||':'||(v->>'period') from jsonb_array_elements(g->'cells') v
 ) cells
$$;

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
  if exists (
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
 if exists(select 1 from jsonb_array_elements(p_rows) s where nullif(cfg->'rules'->(s->>'class_subject_id')->>'roomId','') is not null group by cfg->'rules'->(s->>'class_subject_id')->>'roomId',s->>'day_of_week',s->>'period' having count(distinct coalesce(events->>((s->>'class_subject_id')||':'||(s->>'day_of_week')||':'||(s->>'period')),events->>((s->>'class_subject_id')||':*'),s->>'class_subject_id'))>1) then raise exception 'ห้องสถานที่ชนกัน'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by sort_order),'[]') into times from school_period_times t where school_id=p_school_id;
 select coalesce(jsonb_object_agg(lesson,slots),'{}'::jsonb) into slots_by_lesson from (select s->>'class_subject_id' as lesson,jsonb_agg(s) as slots from jsonb_array_elements(p_rows) s where s->>'class_subject_id' is not null group by s->>'class_subject_id') grouped;
 for r in select key,value from jsonb_each(cfg->'rules') loop
 used_slots=coalesce(slots_by_lesson->r.key,'[]'::jsonb);
 if jsonb_array_length(used_slots)>(r.value->>'count')::int then raise exception 'จำนวนคาบเกินภาระสอนที่กำหนด'; end if;
 if jsonb_array_length(used_slots)=(r.value->>'count')::int and not schedule_pattern_fits(used_slots,r.value->'pattern',times) then raise exception 'รูปแบบคาบไม่ตรงหรือคาบคู่ข้ามช่วงพัก'; end if;
 end loop;
 end if;
 perform save_school_schedule_term_before_063(p_school_id,p_year_id,p_expected,p_rows,p_allow_unlock,p_semester);
end $$;

create or replace function public.activity_team_teaching(p_school uuid,p_year uuid,p_term int,p_rows jsonb)
returns table(teacher_id uuid,day_of_week int,period int,event_id text) language sql stable security definer set search_path=public as $$
 with config as materialized(select sp.config,public.schedule_joint_event_map(sp.config) as events from schedule_plans sp where sp.school_id=p_school and sp.academic_year_id=p_year and sp.semester=p_term),
 groups as(select g from config cross join lateral jsonb_array_elements(coalesce(config->'activityGroups','[]')) g),
 slots as(select * from jsonb_to_recordset(p_rows) s(classroom_id uuid,activity_id uuid,class_subject_id uuid,day_of_week int,period int)),
 staffed as(select s.*,g from slots s join class_schedule_activities a on a.id=s.activity_id join groups on g->>'settingId'=a.evaluation_setting_id::text and g->'roomIds' @> to_jsonb(s.classroom_id::text))
 select distinct t::uuid,s.day_of_week,s.period,(s.g->>'id')||case when s.g->>'mode'='joint' then '' else ':'||s.classroom_id::text end
 from staffed s cross join lateral jsonb_array_elements_text(case when s.g->>'mode'='joint' then s.g->'teacherIds' else s.g->'roomTeachers'->s.classroom_id::text end) t
 union all
 select coalesce(cs.teacher_id,a.teacher_id),s.day_of_week,s.period,coalesce((select events from config)->>(s.class_subject_id::text||':'||s.day_of_week||':'||s.period),(select events from config)->>(s.class_subject_id::text||':*'),s.class_subject_id::text,s.activity_id::text) from slots s
 left join class_subjects cs on cs.id=s.class_subject_id left join class_schedule_activities a on a.id=s.activity_id
 where coalesce(cs.teacher_id,a.teacher_id) is not null and not exists(select 1 from staffed x where x.classroom_id=s.classroom_id and x.day_of_week=s.day_of_week and x.period=s.period)
$$;

revoke all on function public.schedule_joint_event_map(jsonb) from public,anon,authenticated;
grant execute on function public.schedule_joint_event_map(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
