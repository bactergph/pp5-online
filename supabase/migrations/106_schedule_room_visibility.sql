-- A closed timetable room is archived, never deleted. Academic records stay intact.
begin;
alter table public.classrooms add column if not exists schedule_enabled boolean not null default true;

create or replace function public.schedule_active_rows(p_school uuid,p_year uuid,p_rows jsonb)
returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(r order by ord),'[]') from jsonb_array_elements(p_rows) with ordinality x(r,ord)
 where not exists(select 1 from classrooms c where c.id::text=r->>'classroom_id' and c.school_id=p_school and c.academic_year_id=p_year and not c.schedule_enabled)
$$;

create or replace function public.schedule_effective_plan(p_school uuid,p_year uuid,p_config jsonb)
returns jsonb language plpgsql stable set search_path=public as $$
declare cfg jsonb=p_config; hidden jsonb; lessons jsonb; groups jsonb; g jsonb; ids jsonb;
begin
 if cfg is null then return null; end if;
 select coalesce(jsonb_agg(id::text),'[]') into hidden from classrooms where school_id=p_school and academic_year_id=p_year and not schedule_enabled;
 if hidden='[]'::jsonb then return cfg; end if;
 select coalesce(jsonb_agg(cs.id::text),'[]') into lessons from class_subjects cs where hidden @> to_jsonb(cs.classroom_id::text);
 cfg=jsonb_set(cfg,'{rules}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(cfg->'rules','{}')) where not lessons @> to_jsonb(key)),'{}'));
 if cfg ? 'activityGroups' then
 groups='[]';
 for g in select value from jsonb_array_elements(cfg->'activityGroups') loop
  select coalesce(jsonb_agg(value),'[]') into ids from jsonb_array_elements(g->'roomIds') where not hidden @> value;
  if ids='[]'::jsonb then continue; end if;
  g=jsonb_set(g,'{roomIds}',ids);
  g=jsonb_set(g,'{roomTeachers}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(g->'roomTeachers','{}')) where not hidden @> to_jsonb(key)),'{}'));
  groups=groups||jsonb_build_array(g);
 end loop;cfg=jsonb_set(cfg,'{activityGroups}',groups);end if;
 if cfg ? 'teachingGroups' then
 groups='[]';
 for g in select value from jsonb_array_elements(cfg->'teachingGroups') loop
  select coalesce(jsonb_agg(value),'[]') into ids from jsonb_array_elements(g->'lessonIds') where not lessons @> value;
  if jsonb_array_length(ids)<2 then continue; end if;
  groups=groups||jsonb_build_array(jsonb_set(g,'{lessonIds}',ids));
 end loop;cfg=jsonb_set(cfg,'{teachingGroups}',groups);end if;
 return cfg;
end $$;

-- Readers inside every existing validator see only enabled rooms. Storage retains
-- the complete config. Unknown/foreign IDs remain visible so tenancy guards reject them.
create or replace view public.schedule_room_plans as
 select school_id,academic_year_id,semester,public.schedule_effective_plan(school_id,academic_year_id,config) config from public.schedule_plans;
revoke all on public.schedule_room_plans from public,anon,authenticated;
grant select on public.schedule_room_plans to service_role;

create or replace function public.schedule_merge_archived_plan(p_school uuid,p_year uuid,p_stored jsonb,p_next jsonb)
returns jsonb language plpgsql stable set search_path=public as $$
declare hidden jsonb; lessons jsonb; cfg jsonb=p_next; oldg jsonb; nextg jsonb; archived jsonb; groups jsonb; merged jsonb; active_count int; k text;
begin
 select coalesce(jsonb_agg(id::text),'[]') into hidden from classrooms where school_id=p_school and academic_year_id=p_year and not schedule_enabled;
 if hidden='[]'::jsonb or p_stored is null then return cfg; end if;
 select coalesce(jsonb_agg(cs.id::text),'[]') into lessons from class_subjects cs where hidden @> to_jsonb(cs.classroom_id::text);
 if exists(select 1 from jsonb_each(coalesce(p_stored->'rules','{}')) r where lessons @> to_jsonb(r.key) and exists(select 1 from jsonb_array_elements(coalesce(p_stored->'rooms','[]')) v where v->>'id'=r.value->>'roomId') and not exists(select 1 from jsonb_array_elements(coalesce(cfg->'rooms','[]')) v where v->>'id'=r.value->>'roomId')) then raise exception 'สถานที่นี้ยังใช้กับห้องที่ปิดอยู่ เปิดห้องแล้วเปลี่ยนสถานที่ก่อนลบ';end if;
 cfg=jsonb_set(cfg,'{roomLabels}',coalesce(p_stored->'roomLabels','{}')||coalesce(cfg->'roomLabels','{}'));
 cfg=jsonb_set(cfg,'{rules}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(p_stored->'rules','{}')) where lessons @> to_jsonb(key)),'{}')||coalesce(cfg->'rules','{}'));
 groups=coalesce(cfg->'activityGroups','[]');
 for oldg in select value from jsonb_array_elements(coalesce(p_stored->'activityGroups','[]')) loop
  select coalesce(jsonb_agg(value),'[]') into archived from jsonb_array_elements(oldg->'roomIds') where hidden @> value;
  if archived='[]'::jsonb then continue; end if;
  select value into nextg from jsonb_array_elements(groups) where value->>'id'=oldg->>'id';
  if nextg is not null then
   foreach k in array array['settingId','mode','weeklyPeriods','cells'] loop
    if oldg->k is distinct from nextg->k then raise exception 'กิจกรรมนี้มีห้องที่ปิดอยู่ เปิดห้องในกลุ่มให้ครบก่อนเปลี่ยนเวลาหรือรูปแบบ'; end if;
   end loop;
   if oldg->>'mode'='joint' and oldg->'teacherIds' is distinct from nextg->'teacherIds' then raise exception 'กิจกรรมนี้มีห้องที่ปิดอยู่ เปิดห้องในกลุ่มให้ครบก่อนเปลี่ยนทีมครูร่วม'; end if;
   select coalesce(jsonb_agg(value order by value),'[]') into merged from (select distinct value from jsonb_array_elements(nextg->'roomIds'||archived)) x;
   nextg=jsonb_set(nextg,'{roomIds}',merged);
   nextg=jsonb_set(nextg,'{roomTeachers}',coalesce(nextg->'roomTeachers','{}')||coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(oldg->'roomTeachers','{}')) where hidden @> to_jsonb(key)),'{}'));
  else
   nextg=jsonb_set(oldg,'{roomIds}',archived);
   nextg=jsonb_set(nextg,'{roomTeachers}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(oldg->'roomTeachers','{}')) where hidden @> to_jsonb(key)),'{}'));
  end if;
  select coalesce(jsonb_agg(value),'[]') into groups from jsonb_array_elements(groups) where value->>'id'<>oldg->>'id';groups=groups||jsonb_build_array(nextg);
 end loop;
 if p_stored ? 'activityGroups' or cfg ? 'activityGroups' then cfg=jsonb_set(cfg,'{activityGroups}',groups);end if;
 groups=coalesce(cfg->'teachingGroups','[]');
 for oldg in select value from jsonb_array_elements(coalesce(p_stored->'teachingGroups','[]')) loop
  select coalesce(jsonb_agg(value),'[]') into archived from jsonb_array_elements(oldg->'lessonIds') where lessons @> value;
  if archived='[]'::jsonb then continue; end if;
  active_count=jsonb_array_length(oldg->'lessonIds')-jsonb_array_length(archived);
  select value into nextg from jsonb_array_elements(groups) where value->>'id'=oldg->>'id';
  if nextg is not null then
   if oldg->'cells' is distinct from nextg->'cells' then raise exception 'กลุ่มสอนรวมมีห้องที่ปิดอยู่ เปิดห้องในกลุ่มให้ครบก่อนเปลี่ยนคาบ'; end if;
   select coalesce(jsonb_agg(value order by value),'[]') into merged from (select distinct value from jsonb_array_elements(nextg->'lessonIds'||archived)) x;
   nextg=jsonb_set(nextg,'{lessonIds}',merged);
  else nextg=case when active_count<2 then oldg else jsonb_set(oldg,'{lessonIds}',archived) end;end if;
  select coalesce(jsonb_agg(value),'[]') into groups from jsonb_array_elements(groups) where value->>'id'<>oldg->>'id';groups=groups||jsonb_build_array(nextg);
 end loop;
 if p_stored ? 'teachingGroups' or cfg ? 'teachingGroups' then cfg=jsonb_set(cfg,'{teachingGroups}',groups);end if;
 return cfg;
end $$;

create or replace function public.preserve_closed_schedule_plan() returns trigger language plpgsql security definer set search_path=public as $$
declare stored jsonb;
begin
 select config into stored from schedule_plans where school_id=new.school_id and academic_year_id=new.academic_year_id and semester=new.semester;
 new.config=schedule_merge_archived_plan(new.school_id,new.academic_year_id,stored,new.config);return new;
end $$;
drop trigger if exists schedule_preserve_closed_rooms on public.schedule_plans;
create trigger schedule_preserve_closed_rooms before insert or update of config on public.schedule_plans for each row execute function public.preserve_closed_schedule_plan();

-- Update the established validator/writer chain without changing its tenancy,
-- lock, CAS, lesson pattern or actual-clock checks. This is a schema-only change.
do $patch$
declare f record; body text;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
 'save_school_schedule_term_before_063','save_school_schedule_term_before_065',
 'save_schedule_plan_before_065','save_schedule_plan_before_105',
 'validate_activity_teams','validate_joint_teaching','validate_current_schedule_plan',
 'activity_team_teaching','joint_teaching_event','check_joint_teaching_plan','check_joint_teaching_offering',
 'schedule_profile_cells','validate_profile_schedule','validate_teacher_schedule_activities',
 'save_schedule_activity_team','save_schedule_joint_session','clear_schedule_placements',
 'set_schedule_teacher_block','set_schedule_teacher_block_before_065',
 'save_schedule_joint_lock','check_scheduled_subject_teacher','check_schedule_activity']) loop
  body=pg_get_functiondef(f.oid);
  if position('/* room visibility 106 */' in body)>0 then continue;end if;
  body=replace(body,'from schedule_plans','from schedule_room_plans');
  body=replace(body,'FROM schedule_plans','FROM schedule_room_plans');
  body=replace(body,'join classrooms c on c.id=s.classroom_id','join classrooms c on c.id=s.classroom_id and c.schedule_enabled');
  body=replace(body,'join classrooms cr on cr.id=s.classroom_id','join classrooms cr on cr.id=s.classroom_id and cr.schedule_enabled');
  body=replace(body,'where c.id=s.classroom_id and c.school_id=','where c.id=s.classroom_id and c.schedule_enabled and c.school_id=');
  body=replace(body,'where c.school_id=p_school_id and c.id=s.classroom_id','where c.school_id=p_school_id and c.schedule_enabled and c.id=s.classroom_id');
  if f.proname='save_school_schedule_term_before_063' then
   body=replace(body,'where c.id=s.classroom_id','where c.schedule_enabled and c.id=s.classroom_id');
   body=replace(body,'where s.classroom_id=c.id and c.school_id=','where s.classroom_id=c.id and c.schedule_enabled and c.school_id=');
  end if;
  if f.proname='check_joint_teaching_plan' then
   body=regexp_replace(body,'begin','begin if TG_OP=''UPDATE'' and old.config-''roomLabels'' is not distinct from new.config-''roomLabels'' then return new;end if;', 'i');
  end if;
  body=regexp_replace(body,'AS \$function\$','AS $function$ /* room visibility 106 */');
  execute body;
 end loop;
 if position('s.classroom_id=c.id and c.schedule_enabled' in pg_get_functiondef('public.save_school_schedule_term_before_063(uuid,uuid,jsonb,jsonb,boolean,int)'::regprocedure))=0 then raise exception '106: active-room delete guard was not installed';end if;
 if position('from schedule_room_plans' in pg_get_functiondef('public.validate_joint_teaching(uuid,uuid,int,jsonb)'::regprocedure))=0 then raise exception '106: joint validation projection was not installed';end if;
end $patch$;

do $$ begin
 if to_regprocedure('public.schedule_snapshot_before_106(uuid,uuid,integer)') is null then alter function public.schedule_snapshot(uuid,uuid,int) rename to schedule_snapshot_before_106;end if;
 if to_regprocedure('public.save_school_schedule_term_before_106(uuid,uuid,jsonb,jsonb,boolean,integer)') is null then alter function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,int) rename to save_school_schedule_term_before_106;end if;
end $$;
create or replace function public.schedule_snapshot(p_school uuid,p_year uuid,p_term int) returns text language sql stable security definer set search_path=public as $$
 select md5(schedule_snapshot_before_106(p_school,p_year,p_term)||coalesce((select jsonb_agg(jsonb_build_array(id,schedule_enabled) order by id)::text from classrooms where school_id=p_school and academic_year_id=p_year),'[]'))
$$;
create or replace function public.save_school_schedule_term(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false,p_semester int default 1)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 if exists(select 1 from jsonb_array_elements(p_rows) r join classrooms c on c.id::text=r->>'classroom_id' and c.school_id=p_school_id and c.academic_year_id=p_year_id and not c.schedule_enabled
 where not exists(select 1 from class_schedule_slots s where s.classroom_id=c.id and s.academic_year_id=p_year_id and s.semester=p_semester and
 (to_jsonb(s)-'id'-'created_at'-'updated_at'-'semester')=(r-'id'-'created_at'-'updated_at'-'semester'))) then raise exception 'ห้องนี้ปิดอยู่ เปิดห้องก่อนแก้ตาราง'; end if;
 perform save_school_schedule_term_before_106(p_school_id,p_year_id,schedule_active_rows(p_school_id,p_year_id,p_expected),schedule_active_rows(p_school_id,p_year_id,p_rows),p_allow_unlock,p_semester);
end $$;

create or replace function public.save_timetable_classrooms(p_school uuid,p_year uuid,p_term int,p_hash text,p_levels jsonb,p_limit int default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare row jsonb; name text; i int; rid uuid; created int=0; labels jsonb='{}'; cfg jsonb; t int; quota int;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table classrooms in share row exclusive mode;
 if p_term not in(1,2) or p_term is null or not exists(select 1 from academic_years where id=p_year and school_id=p_school) or p_hash is distinct from schedule_snapshot(p_school,p_year,p_term) then raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด';end if;
 if jsonb_typeof(p_levels) is distinct from 'array' or jsonb_array_length(p_levels) not between 1 and 15 then raise exception 'ข้อมูลชั้นเรียนไม่ถูกต้อง';end if;
 if exists(select 1 from jsonb_array_elements(p_levels) r group by r->>'level' having count(*)>1) then raise exception 'ระดับชั้นซ้ำ';end if;
 for row in select value from jsonb_array_elements(p_levels) loop
  if coalesce(row->>'level','') !~ '^(อ\.[1-3]|ป\.[1-6]|ม\.[1-6])$' or jsonb_typeof(row->'names') is distinct from 'array' or jsonb_array_length(row->'names')>30 then raise exception 'ระดับชั้นหรือจำนวนห้องไม่ถูกต้อง';end if;
  if exists(select 1 from jsonb_array_elements(row->'names') n where jsonb_typeof(n)<>'string' or length(trim(n#>>'{}')) not between 1 and 20 or (n#>>'{}') ~ '[/\\]') or exists(select 1 from jsonb_array_elements_text(row->'names') n group by lower(trim(n)) having count(*)>1) then raise exception 'ชื่อห้องซ้ำหรือไม่ถูกต้อง';end if;
  update classrooms set schedule_enabled=false where school_id=p_school and academic_year_id=p_year and level=row->>'level' and room>jsonb_array_length(row->'names');
  i=0;
  for name in select value from jsonb_array_elements_text(row->'names') loop
   i=i+1;select id into rid from classrooms where school_id=p_school and academic_year_id=p_year and level=row->>'level' and room=i;
   if rid is null then insert into classrooms(school_id,academic_year_id,level,room,schedule_enabled) values(p_school,p_year,row->>'level',i,true) returning id into rid;created=created+1;
   else update classrooms set schedule_enabled=true where id=rid;end if;
   labels=labels||jsonb_build_object(rid::text,trim(name));
  end loop;
 end loop;
 select count(*) into quota from (select distinct trim(level),room from classrooms where school_id=p_school and schedule_enabled) q;
 if p_limit is not null and (p_limit<0 or quota>p_limit) then raise exception 'แพ็กเกจนี้เปิดจัดตารางได้ไม่เกิน % ห้องต่อบัญชี',p_limit;end if;
 for t in 1..2 loop
  select config into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=t;
  cfg=coalesce(cfg,'{"days":[1,2,3,4,5],"rooms":[],"rules":{},"reduceGaps":false,"maxContinuous":0}');
  cfg=jsonb_set(cfg,'{roomLabels}',coalesce(cfg->'roomLabels','{}')||labels);
  insert into schedule_plans(school_id,academic_year_id,semester,config) values(p_school,p_year,t,cfg) on conflict(school_id,academic_year_id,semester) do update set config=excluded.config;
 end loop;
 return jsonb_build_object('created',created,'deleted',0);
end $$;
revoke all on function public.schedule_active_rows(uuid,uuid,jsonb),public.schedule_effective_plan(uuid,uuid,jsonb),public.schedule_merge_archived_plan(uuid,uuid,jsonb,jsonb),public.preserve_closed_schedule_plan(),public.schedule_snapshot_before_106(uuid,uuid,int),public.save_school_schedule_term_before_106(uuid,uuid,jsonb,jsonb,boolean,int),public.save_timetable_classrooms(uuid,uuid,int,text,jsonb,int) from public,anon,authenticated;
grant execute on function public.save_timetable_classrooms(uuid,uuid,int,text,jsonb,int),public.schedule_active_rows(uuid,uuid,jsonb),public.schedule_effective_plan(uuid,uuid,jsonb) to service_role;
revoke all on function public.schedule_snapshot(uuid,uuid,int),public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,int) from public,anon,authenticated;
grant execute on function public.schedule_snapshot(uuid,uuid,int),public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,int) to service_role;
notify pgrst,'reload schema';
commit;
