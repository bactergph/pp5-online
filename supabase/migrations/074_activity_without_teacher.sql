-- An activity room may have no responsible teacher. An empty team is valid;
-- any teacher id that is present must still belong to the school.
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
 if jsonb_typeof(team) is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(team) t where not exists(select 1 from users where id=t::uuid and school_id=p_school and (is_active or email like 'pending-%') and role in('teacher','academic_head','deputy_principal','principal','admin'))) then raise exception 'ครูผู้รับผิดชอบไม่ถูกต้อง'; end if;
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
notify pgrst,'reload schema';
commit;
