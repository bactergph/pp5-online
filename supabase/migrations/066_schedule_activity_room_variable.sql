-- Fix the room-column ambiguity in 065. Replaces functions only; no data is rewritten.
begin;
create or replace function public.validate_activity_teams(p_school uuid,p_year uuid,p_term int,p_rows jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare cfg jsonb; g jsonb; v_room_id text; team jsonb; c jsonb;
begin
 select config into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
 if cfg is null or cfg->'activityGroups' is null then return; end if;
 if jsonb_typeof(cfg->'activityGroups')<>'array' or jsonb_array_length(cfg->'activityGroups')>500 then raise exception 'ทีมกิจกรรมไม่ถูกต้อง'; end if;
 if exists(select 1 from jsonb_array_elements(cfg->'activityGroups') x group by x->>'id' having count(*)>1) then raise exception 'ทีมกิจกรรมซ้ำ'; end if;
 if exists(select 1 from jsonb_array_elements(cfg->'activityGroups') x cross join lateral jsonb_array_elements_text(x->'roomIds') r group by x->>'settingId',r having count(*)>1) then raise exception 'กิจกรรมเดียวกันในห้องนี้มีทีมครูแล้ว'; end if;
 for g in select value from jsonb_array_elements(cfg->'activityGroups') loop
 if g->>'id' is null or g->>'mode' not in('joint','separate') or not exists(select 1 from evaluation_settings where id=(g->>'settingId')::uuid and school_id=p_school and kind='activities' and is_active)
 or jsonb_typeof(g->'roomIds') is distinct from 'array' or jsonb_array_length(g->'roomIds')<1
 or (g->>'weeklyPeriods')::int not between 1 and 8 or jsonb_array_length(g->'cells') is distinct from (g->>'weeklyPeriods')::int then raise exception 'ข้อมูลกิจกรรมหรือจำนวนคาบไม่ถูกต้อง'; end if;
 if exists(select 1 from jsonb_array_elements(g->'cells') x group by x->>'day',x->>'period' having count(*)>1) then raise exception 'คาบกิจกรรมซ้ำ'; end if;
 for v_room_id in select value from jsonb_array_elements_text(g->'roomIds') loop
 if not exists(select 1 from classrooms where id=v_room_id::uuid and school_id=p_school and academic_year_id=p_year and level !~ '^(อ\.?\s*[1-3]$|อนุบาล)') then raise exception 'ห้องกิจกรรมไม่อยู่ในโรงเรียนนี้'; end if;
 team=case when g->>'mode'='joint' then g->'teacherIds' else g->'roomTeachers'->v_room_id end;
 if jsonb_typeof(team) is distinct from 'array' or jsonb_array_length(team)<1 or exists(select 1 from jsonb_array_elements_text(team) t where not exists(select 1 from users where id=t::uuid and school_id=p_school and (is_active or email like 'pending-%') and role in('teacher','academic_head','deputy_principal','principal','admin'))) then raise exception 'ครูผู้รับผิดชอบไม่ถูกต้อง'; end if;
 if exists(select 1 from jsonb_array_elements_text(team) t group by t having count(*)>1) then raise exception 'ครูกิจกรรมซ้ำ'; end if;
 for c in select value from jsonb_array_elements(g->'cells') loop
 if not cfg->'days' @> to_jsonb((c->>'day')::int) or not exists(select 1 from school_period_times where school_id=p_school and period=(c->>'period')::int and not is_break) then raise exception 'กิจกรรมอยู่นอกวันเรียนหรือใช้คาบพัก'; end if;
 if not exists(select 1 from jsonb_to_recordset(p_rows) s(classroom_id uuid,activity_id uuid,day_of_week int,period int) join class_schedule_activities a on a.id=s.activity_id where s.classroom_id=v_room_id::uuid and a.evaluation_setting_id=(g->>'settingId')::uuid and s.day_of_week=(c->>'day')::int and s.period=(c->>'period')::int) then raise exception 'กิจกรรมกำหนดตายตัว กรุณาแก้ในเมนูกิจกรรมและครูผู้รับผิดชอบ'; end if;
 end loop;
 if (select count(*) from jsonb_to_recordset(p_rows) s(classroom_id uuid,activity_id uuid) join class_schedule_activities a on a.id=s.activity_id where s.classroom_id=v_room_id::uuid and a.evaluation_setting_id=(g->>'settingId')::uuid)<>(g->>'weeklyPeriods')::int then raise exception 'จำนวนคาบกิจกรรมไม่ตรงกับทีมครู'; end if;
 end loop;
 end loop;
 if exists(select 1 from activity_team_teaching(p_school,p_year,p_term,p_rows) group by teacher_id,day_of_week,period having count(distinct event_id)>1) then raise exception 'ครูผู้รับผิดชอบกิจกรรมมีคาบสอนชนกัน'; end if;
 if exists(select 1 from activity_team_teaching(p_school,p_year,p_term,p_rows) t join schedule_teacher_blocks b on b.school_id=p_school and b.academic_year_id=p_year and b.semester=p_term and b.teacher_id=t.teacher_id and b.day_of_week=t.day_of_week and b.period=t.period) then raise exception 'ครูผู้รับผิดชอบกิจกรรมล็อกคาบว่างนี้ไว้'; end if;
 if exists(select 1 from activity_team_teaching(p_school,p_year,p_term,p_rows) t join schedule_substitute_entries e on e.substitute_teacher_id=t.teacher_id and e.period=t.period join schedule_substitute_days d on d.id=e.substitute_day_id and d.school_id=p_school and d.academic_year_id=p_year and d.semester=p_term and d.day_of_week=t.day_of_week) then raise exception 'ครูผู้รับผิดชอบกิจกรรมมีสอนแทนในคาบนี้'; end if;
end $$;

create or replace function public.save_schedule_activity_team(p_school uuid,p_year uuid,p_term int,p_hash text,p_group jsonb,p_remove boolean default false,p_unlock boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare cfg jsonb; old_group jsonb; before_rows jsonb; rows jsonb; v_room_id text; c jsonb; aid uuid; gid uuid; affected jsonb; unlocked jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table classrooms,class_subjects,subjects,users,evaluation_settings,class_schedule_activities in share row exclusive mode;
 if p_term is null or p_term not in(1,2) or not exists(select 1 from academic_years where id=p_year and school_id=p_school) or p_hash is null or schedule_snapshot(p_school,p_year,p_term) is distinct from p_hash then raise exception 'ข้อมูลเปลี่ยนแล้ว หรือปีการศึกษาไม่ถูกต้อง กรุณาโหลดใหม่'; end if;
 gid=(p_group->>'id')::uuid;
 if gid is null or p_remove is null or p_unlock is null then raise exception 'ข้อมูลทีมกิจกรรมไม่ถูกต้อง'; end if;
 select config into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
 cfg=coalesce(cfg,'{"days":[1,2,3,4,5],"rooms":[],"rules":{},"reduceGaps":false,"maxContinuous":0}'::jsonb);
 select value into old_group from jsonb_array_elements(coalesce(cfg->'activityGroups','[]')) where value->>'id'=gid::text;
 if p_remove and old_group is null then raise exception 'ไม่พบทีมกิจกรรม'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('classroom_id',s.classroom_id,'academic_year_id',s.academic_year_id,'day_of_week',s.day_of_week,'period',s.period,'class_subject_id',s.class_subject_id,'activity_id',s.activity_id,'note',s.note,'locked',s.locked)),'[]') into before_rows from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=p_school and s.academic_year_id=p_year and s.semester=p_term;
 rows=before_rows;
 -- Remove only the previous group's own activity cells, never unrelated lessons.
 if old_group is not null then
 select coalesce(jsonb_agg(x),'[]') into rows from jsonb_array_elements(rows) x where not exists(select 1 from class_schedule_activities a where a.id=nullif(x->>'activity_id','')::uuid and a.evaluation_setting_id=(old_group->>'settingId')::uuid and old_group->'roomIds' @> to_jsonb(x->>'classroom_id'));
 end if;
 if not p_remove then
 for v_room_id in select value from jsonb_array_elements_text(p_group->'roomIds') loop
 if not exists(select 1 from classrooms where id=v_room_id::uuid and school_id=p_school and academic_year_id=p_year) then raise exception 'ห้องไม่อยู่ในโรงเรียนนี้'; end if;
 select id into aid from class_schedule_activities where classroom_id=v_room_id::uuid and academic_year_id=p_year and evaluation_setting_id=(p_group->>'settingId')::uuid;
 if aid is null then insert into class_schedule_activities(classroom_id,academic_year_id,evaluation_setting_id,teacher_id,weekly_periods) values(v_room_id::uuid,p_year,(p_group->>'settingId')::uuid,null,1) returning id into aid;
 elsif exists(select 1 from class_schedule_activities where id=aid and teacher_id is not null) then raise exception 'กิจกรรมเดิมมีครูรายคน กรุณานำคาบออกก่อนย้ายมาใช้ทีมครู'; end if;
 select coalesce(jsonb_agg(x),'[]') into rows from jsonb_array_elements(rows) x where not(x->>'classroom_id'=v_room_id and x->>'activity_id'=aid::text);
 for c in select value from jsonb_array_elements(p_group->'cells') loop
 select coalesce(jsonb_agg(x),'[]') into rows from jsonb_array_elements(rows) x where not(x->>'classroom_id'=v_room_id and x->>'day_of_week'=c->>'day' and x->>'period'=c->>'period');
 rows=rows||jsonb_build_array(jsonb_build_object('classroom_id',v_room_id,'academic_year_id',p_year,'day_of_week',(c->>'day')::int,'period',(c->>'period')::int,'class_subject_id',null,'activity_id',aid,'note',null,'locked',false));
 end loop;
 end loop;
 end if;
 select coalesce(jsonb_agg(x),'[]') into affected from jsonb_array_elements(before_rows) x where (x->>'locked')::boolean and not exists(select 1 from jsonb_array_elements(rows) y where y-'locked'=x-'locked');
 if jsonb_array_length(affected)>0 and not p_unlock then raise exception 'ต้องยืนยันแทนที่คาบล็อกโดยเฉพาะ'; end if;
 unlocked=before_rows;
 for c in select value from jsonb_array_elements(affected) loop
 update class_schedule_slots set locked=false where classroom_id=(c->>'classroom_id')::uuid and academic_year_id=p_year and semester=p_term and day_of_week=(c->>'day_of_week')::int and period=(c->>'period')::int;
 select jsonb_agg(case when x-'locked'=c-'locked' then jsonb_set(x,'{locked}','false') else x end) into unlocked from jsonb_array_elements(unlocked) x;
 end loop;
 -- Retain locks on unchanged cells.
 select coalesce(jsonb_agg(case when exists(select 1 from jsonb_array_elements(before_rows) b where b-'locked'=x-'locked' and (b->>'locked')::boolean) then jsonb_set(x,'{locked}','true') else x end),'[]') into rows from jsonb_array_elements(rows) x;
 cfg=jsonb_set(cfg,'{activityGroups}',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(coalesce(cfg->'activityGroups','[]')) x where x->>'id'<>gid::text)||case when p_remove then '[]'::jsonb else jsonb_build_array(p_group) end);
 insert into schedule_plans values(p_school,p_year,p_term,cfg) on conflict(school_id,academic_year_id,semester) do update set config=excluded.config;
 perform save_school_schedule_term(p_school,p_year,unlocked,rows,false,p_term);
end $$;
notify pgrst,'reload schema';
commit;
