-- Explicit whole-week joint instruction. Separate offerings and grades remain intact.
-- No existing timetable or academic record is changed by this migration.
begin;
create or replace function public.joint_teaching_event(p_school uuid,p_year uuid,p_term int,p_lesson uuid)
returns text language sql stable security definer set search_path=public as $$
 select coalesce((select 'teaching:'||(g->>'id') from schedule_plans sp
 cross join lateral jsonb_array_elements(coalesce(sp.config->'teachingGroups','[]'::jsonb)) g
 where sp.school_id=p_school and sp.academic_year_id=p_year and sp.semester=p_term
 and g->'lessonIds' @> to_jsonb(p_lesson::text) limit 1),p_lesson::text)
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
     if signature is null then signature=member_signature; elsif signature<>member_signature then raise exception 'สอนรวมต้องมีจำนวนคาบ รูปแบบคาบ สถานที่ และช่วงเวลาตรงกัน'; end if;
     select coalesce(jsonb_agg(jsonb_build_array(s->>'day_of_week',s->>'period') order by (s->>'day_of_week')::int,(s->>'period')::int),'[]'::jsonb) into member_positions
       from jsonb_array_elements(p_rows) s where s->>'class_subject_id'=member and s->>'classroom_id'=row_data.classroom_id::text;
     if positions is null then positions=member_positions; elsif positions<>member_positions then raise exception 'วิชาสอนรวมต้องอยู่วันและคาบเดียวกันครบทุกห้อง กรุณาล้างหรือจัดกลุ่มนี้ใหม่พร้อมกัน'; end if;
   end loop;
 end loop;
end $$;

create or replace function public.save_school_schedule_term(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false,p_semester int default 1)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 perform validate_joint_teaching(p_school_id,p_year_id,p_semester,p_rows);
 perform validate_activity_teams(p_school_id,p_year_id,p_semester,p_rows);
 perform save_school_schedule_term_before_081(p_school_id,p_year_id,p_expected,p_rows,p_allow_unlock,p_semester);
 if exists(select 1 from activity_team_teaching(p_school_id,p_year_id,p_semester,p_rows) t
 join schedule_substitute_entries e on e.substitute_teacher_id=t.teacher_id and e.period=t.period
 join schedule_substitute_days d on d.id=e.substitute_day_id
 where d.school_id=p_school_id and d.academic_year_id=p_year_id and d.semester=p_semester and d.day_of_week=t.day_of_week)
 then raise exception 'ครูมีคาบสอนแทนในช่วงนี้ กรุณาตรวจตารางสอนแทนก่อนบันทึก'; end if;
end $$;

create or replace function public.check_joint_teaching_plan() returns trigger
language plpgsql security definer set search_path=public as $$
declare rows jsonb;
begin
 if TG_OP='UPDATE' and old.config->'teachingGroups' is not distinct from new.config->'teachingGroups' and coalesce(jsonb_array_length(new.config->'teachingGroups'),0)=0 then return new; end if;
 if TG_OP='INSERT' and new.config->'teachingGroups' is null then return new; end if;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into rows from class_schedule_slots s join classrooms c on c.id=s.classroom_id
 where c.school_id=new.school_id and s.academic_year_id=new.academic_year_id and s.semester=new.semester;
 perform validate_joint_teaching(new.school_id,new.academic_year_id,new.semester,rows);
 if exists(select 1 from activity_team_teaching(new.school_id,new.academic_year_id,new.semester,rows) group by teacher_id,day_of_week,period having count(distinct event_id)>1) then raise exception 'ยกเลิก/แก้กลุ่มไม่ได้ เพราะมีคาบครูชนกัน กรุณาล้างคาบกลุ่มก่อน'; end if;
 return new;
end $$;
drop trigger if exists joint_teaching_plan_guard on schedule_plans;
create trigger joint_teaching_plan_guard after insert or update of config on schedule_plans for each row execute function check_joint_teaching_plan();

create or replace function public.check_joint_teaching_offering() returns trigger
language plpgsql security definer set search_path=public as $$
declare p record; rows jsonb;
begin
 for p in select * from schedule_plans sp where exists(select 1 from jsonb_array_elements(coalesce(sp.config->'teachingGroups','[]'::jsonb)) g where g->'lessonIds' @> to_jsonb(old.id::text)) loop
   select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into rows from class_schedule_slots s join classrooms c on c.id=s.classroom_id
   where c.school_id=p.school_id and s.academic_year_id=p.academic_year_id and s.semester=p.semester;
   perform validate_joint_teaching(p.school_id,p.academic_year_id,p.semester,rows);
 end loop;
 return null;
end $$;
drop trigger if exists joint_teaching_offering_guard on class_subjects;
create constraint trigger joint_teaching_offering_guard after update or delete on class_subjects deferrable initially deferred for each row execute function check_joint_teaching_offering();

-- The original CAS, lock, quota, teacher-block and substitute guards are retained below.

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
    group by coalesce(cs.teacher_id,a.teacher_id),r.day_of_week,r.period having count(distinct coalesce(joint_teaching_event(p_school_id,p_year_id,p_semester,r.class_subject_id),r.activity_id::text))>1
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
 if exists(select 1 from jsonb_array_elements(p_rows) s where nullif(cfg->'rules'->(s->>'class_subject_id')->>'roomId','') is not null group by cfg->'rules'->(s->>'class_subject_id')->>'roomId',s->>'day_of_week',s->>'period' having count(distinct joint_teaching_event(p_school_id,p_year_id,p_semester,(s->>'class_subject_id')::uuid))>1) then raise exception 'ห้องสถานที่ชนกัน'; end if;
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
 select coalesce(cs.teacher_id,a.teacher_id),s.day_of_week,s.period,coalesce(joint_teaching_event(p_school,p_year,p_term,s.class_subject_id),s.activity_id::text) from slots s
 left join class_subjects cs on cs.id=s.class_subject_id left join class_schedule_activities a on a.id=s.activity_id
 where coalesce(cs.teacher_id,a.teacher_id) is not null and not exists(select 1 from staffed x where x.classroom_id=s.classroom_id and x.day_of_week=s.day_of_week and x.period=s.period)
$$;
revoke all on function joint_teaching_event(uuid,uuid,int,uuid),validate_joint_teaching(uuid,uuid,int,jsonb),check_joint_teaching_plan(),check_joint_teaching_offering(),save_school_schedule_term_before_063(uuid,uuid,jsonb,jsonb,boolean,int),save_school_schedule_term_before_065(uuid,uuid,jsonb,jsonb,boolean,int) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
