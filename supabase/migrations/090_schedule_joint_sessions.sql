-- Explicit shared teaching at selected periods; existing data is not modified.
begin;
create or replace function public.joint_teaching_event(p_school uuid,p_year uuid,p_term int,p_lesson uuid,p_day int,p_period int)
returns text language sql stable security definer set search_path=public as $$
 select coalesce((select 'teaching:'||(g->>'id') from schedule_plans sp
 cross join lateral jsonb_array_elements(coalesce(sp.config->'teachingGroups','[]'::jsonb)) g
 where sp.school_id=p_school and sp.academic_year_id=p_year and sp.semester=p_term
 and g->'lessonIds' @> to_jsonb(p_lesson::text)
 and (not (g ? 'cells') or exists(select 1 from jsonb_array_elements(g->'cells') v where (v->>'day')::int=p_day and (v->>'period')::int=p_period)) limit 1),p_lesson::text)
$$;

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
     if exists(select 1 from jsonb_array_elements(g->'cells') v where not cfg->'days' @> to_jsonb((v->>'day')::int) or not exists(select 1 from school_period_times t where t.school_id=p_school and not t.is_break and t.period=(v->>'period')::int)) then raise exception 'คาบสอนรวมอยู่นอกเวลาเรียนหรือเป็นช่วงพัก'; end if;
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

create or replace function public.save_school_schedule_term_before_063(
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
    group by coalesce(cs.teacher_id,a.teacher_id),r.day_of_week,r.period having count(distinct coalesce(joint_teaching_event(p_school_id,p_year_id,p_semester,r.class_subject_id,r.day_of_week,r.period),r.activity_id::text))>1
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

create or replace function public.save_school_schedule_term_before_065(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false,p_semester integer default 1) returns void language plpgsql security definer set search_path=public as $$
declare cfg jsonb; r record; used_slots jsonb; times jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 select config into cfg from schedule_plans where school_id=p_school_id and academic_year_id=p_year_id and semester=p_semester;
 if cfg is not null then
 if exists(select 1 from jsonb_array_elements(p_rows) s where not cfg->'days' @> to_jsonb((s->>'day_of_week')::int)) then raise exception 'คาบอยู่นอกวันเรียนที่กำหนด'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) s where nullif(cfg->'rules'->(s->>'class_subject_id')->>'roomId','') is not null group by cfg->'rules'->(s->>'class_subject_id')->>'roomId',s->>'day_of_week',s->>'period' having count(distinct joint_teaching_event(p_school_id,p_year_id,p_semester,(s->>'class_subject_id')::uuid,(s->>'day_of_week')::int,(s->>'period')::int))>1) then raise exception 'ห้องสถานที่ชนกัน'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by sort_order),'[]') into times from school_period_times t where school_id=p_school_id;
 for r in select key,value from jsonb_each(cfg->'rules') loop
 select coalesce(jsonb_agg(s),'[]') into used_slots from jsonb_array_elements(p_rows) s where s->>'class_subject_id'=r.key;
 if jsonb_array_length(used_slots)>(r.value->>'count')::int then raise exception 'จำนวนคาบเกินภาระสอนที่กำหนด'; end if;
 if jsonb_array_length(used_slots)=(r.value->>'count')::int and not schedule_pattern_fits(used_slots,r.value->'pattern',times) then raise exception 'รูปแบบคาบไม่ตรงหรือคาบคู่ข้ามช่วงพัก'; end if;
 end loop;
 end if;
 perform save_school_schedule_term_before_063(p_school_id,p_year_id,p_expected,p_rows,p_allow_unlock,p_semester);
end $$;

create or replace function public.activity_team_teaching(p_school uuid,p_year uuid,p_term int,p_rows jsonb)
returns table(teacher_id uuid,day_of_week int,period int,event_id text) language sql stable security definer set search_path=public as $$
 with groups as(select g from schedule_plans sp cross join lateral jsonb_array_elements(coalesce(sp.config->'activityGroups','[]')) g where sp.school_id=p_school and sp.academic_year_id=p_year and sp.semester=p_term),
 slots as(select * from jsonb_to_recordset(p_rows) s(classroom_id uuid,activity_id uuid,class_subject_id uuid,day_of_week int,period int)),
 staffed as(select s.*,g from slots s join class_schedule_activities a on a.id=s.activity_id join groups on g->>'settingId'=a.evaluation_setting_id::text and g->'roomIds' @> to_jsonb(s.classroom_id::text))
 select distinct t::uuid,s.day_of_week,s.period,(s.g->>'id')||case when s.g->>'mode'='joint' then '' else ':'||s.classroom_id::text end
 from staffed s cross join lateral jsonb_array_elements_text(case when s.g->>'mode'='joint' then s.g->'teacherIds' else s.g->'roomTeachers'->s.classroom_id::text end) t
 union all
 select coalesce(cs.teacher_id,a.teacher_id),s.day_of_week,s.period,coalesce(joint_teaching_event(p_school,p_year,p_term,s.class_subject_id,s.day_of_week,s.period),s.activity_id::text) from slots s
 left join class_subjects cs on cs.id=s.class_subject_id left join class_schedule_activities a on a.id=s.activity_id
 where coalesce(cs.teacher_id,a.teacher_id) is not null and not exists(select 1 from staffed x where x.classroom_id=s.classroom_id and x.day_of_week=s.day_of_week and x.period=s.period)
$$;

-- Defer the plan guard until the end of the transaction, after both the plan
-- and its explicitly chosen cells have been saved. All final constraints remain.
drop trigger if exists joint_teaching_plan_guard on schedule_plans;
create constraint trigger joint_teaching_plan_guard after insert or update on schedule_plans deferrable initially deferred for each row execute function check_joint_teaching_plan();

create or replace function public.save_schedule_joint_session(p_school uuid,p_year uuid,p_term int,p_hash text,p_expected jsonb,p_rows jsonb,p_config jsonb,p_replace boolean,p_lesson_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare cfg jsonb; expected_rows jsonb=p_expected; old_cell jsonb; lesson text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 if p_hash is distinct from schedule_snapshot(p_school,p_year,p_term) then raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดคาบล่าสุดก่อนล็อกสอนรวม'; end if;
 if coalesce(array_length(p_lesson_ids,1),0)<2 or array_length(p_lesson_ids,1)>500 then raise exception 'เลือกวิชาอย่างน้อย 2 ห้อง'; end if;
 select config into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
 if cfg is not null and cfg-'teachingGroups'-'rules' is distinct from p_config-'teachingGroups'-'rules' then raise exception 'แก้ได้เฉพาะคาบสอนรวมที่เลือก'; end if;
 if (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(cfg->'rules','{}')) where not key=any(p_lesson_ids::text[])) is distinct from
    (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(coalesce(p_config->'rules','{}')) where not key=any(p_lesson_ids::text[])) then raise exception 'ห้ามเปลี่ยนภาระสอนวิชาอื่น'; end if;
 if (select coalesce(jsonb_agg(g order by g->>'id'),'[]') from jsonb_array_elements(coalesce(cfg->'teachingGroups','[]')) g where not exists(select 1 from jsonb_array_elements_text(g->'lessonIds') x where x=any(p_lesson_ids::text[]))) is distinct from
    (select coalesce(jsonb_agg(g order by g->>'id'),'[]') from jsonb_array_elements(coalesce(p_config->'teachingGroups','[]')) g where not exists(select 1 from jsonb_array_elements_text(g->'lessonIds') x where x=any(p_lesson_ids::text[]))) then raise exception 'ห้ามแก้กลุ่มสอนรวมอื่น'; end if;
 -- No unrelated lesson, reservation, activity or note can be changed.
 if exists(select 1 from jsonb_array_elements(p_expected) old where not coalesce(old->>'class_subject_id','')=any(p_lesson_ids::text[]) and not exists(select 1 from jsonb_array_elements(p_rows) n where n=old))
 or exists(select 1 from jsonb_array_elements(p_rows) n where not coalesce(n->>'class_subject_id','')=any(p_lesson_ids::text[]) and not exists(select 1 from jsonb_array_elements(p_expected) old where old=n)) then raise exception 'ห้ามเปลี่ยนคาบหรือกิจกรรมอื่น'; end if;
 if p_term is null or p_term not in(1,2) or not exists(select 1 from academic_years where id=p_year and school_id=p_school) then raise exception 'ปีหรือภาคเรียนไม่ถูกต้อง'; end if;
 lock table classrooms,class_subjects,subjects,users,evaluation_settings,class_schedule_activities in share mode;
 insert into schedule_plans(school_id,academic_year_id,semester,config) values(p_school,p_year,p_term,p_config)
 on conflict(school_id,academic_year_id,semester) do update set config=excluded.config;
 for old_cell in select old from jsonb_array_elements(p_expected) old where old->>'locked'='true' and not exists(select 1 from jsonb_array_elements(p_rows) n where n-'locked'=old-'locked') loop
   if not p_replace or not coalesce(old_cell->>'class_subject_id','')=any(p_lesson_ids::text[]) then raise exception 'ต้องยืนยันย้ายคาบล็อกของวิชาที่เลือกก่อน'; end if;
   update class_schedule_slots s set locked=false from classrooms c where c.id=s.classroom_id and c.school_id=p_school and s.academic_year_id=p_year and s.semester=p_term and s.classroom_id=(old_cell->>'classroom_id')::uuid and s.day_of_week=(old_cell->>'day_of_week')::int and s.period=(old_cell->>'period')::int;
   select jsonb_agg(case when row=old_cell then jsonb_set(row,'{locked}','false'::jsonb) else row end) into expected_rows from jsonb_array_elements(expected_rows) row;
 end loop;
 perform save_school_schedule_term(p_school,p_year,expected_rows,p_rows,true,p_term);
end $$;
revoke all on function public.joint_teaching_event(uuid,uuid,int,uuid,int,int),public.save_schedule_joint_session(uuid,uuid,int,text,jsonb,jsonb,jsonb,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.save_schedule_joint_session(uuid,uuid,int,text,jsonb,jsonb,jsonb,boolean,uuid[]) to service_role;
notify pgrst,'reload schema';
commit;
