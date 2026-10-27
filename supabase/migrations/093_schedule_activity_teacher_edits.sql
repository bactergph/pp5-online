-- Preserve timetable slots when changing only activity teachers.
-- Use null-safe activity matching so ordinary course cells are never deleted accidentally.
-- Schema-only migration: no existing timetable or team data is rewritten.
begin;

create or replace function public.save_schedule_activity_team(
 p_school uuid,p_year uuid,p_term int,p_hash text,p_group jsonb,
 p_remove boolean default false,p_unlock boolean default false,p_overwrite boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare
 cfg jsonb; old_group jsonb; before_rows jsonb; rows jsonb; v_room_id text; c jsonb;
 aid uuid; gid uuid; affected jsonb; unlocked jsonb; x jsonb; kept_rooms jsonb;
 kept_teachers jsonb; preserve_placement boolean; rebuilt_groups jsonb:='[]'::jsonb; target_setting uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table classrooms,class_subjects,subjects,users,evaluation_settings,class_schedule_activities in share row exclusive mode;
 if p_term is null or p_term not in(1,2) or not exists(select 1 from academic_years where id=p_year and school_id=p_school)
    or p_hash is null or schedule_snapshot(p_school,p_year,p_term) is distinct from p_hash then
   raise exception 'ข้อมูลเปลี่ยนแล้ว หรือปีการศึกษาไม่ถูกต้อง กรุณาโหลดใหม่';
 end if;
 if p_remove is null or p_unlock is null or p_overwrite is null then raise exception 'ข้อมูลทีมกิจกรรมไม่ถูกต้อง'; end if;
 if not p_remove and (p_group is null or p_group->>'id' is null or p_group->>'settingId' is null or jsonb_typeof(p_group->'roomIds') is distinct from 'array') then
   raise exception 'ข้อมูลทีมกิจกรรมไม่ถูกต้อง';
 end if;
 gid=nullif(p_group->>'id','')::uuid;
 target_setting=nullif(p_group->>'settingId','')::uuid;
 select config into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
 cfg=coalesce(cfg,'{"days":[1,2,3,4,5],"rooms":[],"rules":{},"reduceGaps":false,"maxContinuous":0}'::jsonb);
 select value into old_group from jsonb_array_elements(coalesce(cfg->'activityGroups','[]')) where value->>'id'=gid::text;
 if p_remove and old_group is null then raise exception 'ไม่พบทีมกิจกรรม'; end if;
 if not p_remove and not p_overwrite and exists(
   select 1 from jsonb_array_elements(coalesce(cfg->'activityGroups','[]')) g
   cross join lateral jsonb_array_elements_text(g->'roomIds') r
   where g->>'id'<>gid::text and g->>'settingId'=target_setting::text and p_group->'roomIds' @> to_jsonb(r.value)
 ) then raise exception 'กิจกรรมนี้มีทีมครูในห้องที่เลือก กรุณาตรวจรายละเอียดและยืนยันบันทึกทับ'; end if;

 select coalesce(jsonb_agg(jsonb_build_object(
   'classroom_id',s.classroom_id,'academic_year_id',s.academic_year_id,'day_of_week',s.day_of_week,'period',s.period,
   'class_subject_id',s.class_subject_id,'activity_id',s.activity_id,'note',s.note,'locked',s.locked
 )),'[]') into before_rows
 from class_schedule_slots s join classrooms cr on cr.id=s.classroom_id
 where cr.school_id=p_school and s.academic_year_id=p_year and s.semester=p_term;
 rows=before_rows;
 preserve_placement=not p_remove and old_group is not null
   and old_group->>'settingId'=p_group->>'settingId'
   and (old_group->>'mode'=p_group->>'mode' or (jsonb_array_length(old_group->'roomIds')=1 and jsonb_array_length(p_group->'roomIds')=1))
   and old_group->>'weeklyPeriods'=p_group->>'weeklyPeriods'
   and (old_group->'roomIds') @> (p_group->'roomIds') and (p_group->'roomIds') @> (old_group->'roomIds')
   and (old_group->'cells') @> (p_group->'cells') and (p_group->'cells') @> (old_group->'cells');
 if not coalesce(preserve_placement,false) then

 -- Remove the edited group's old activity cells.
 if old_group is not null then
   select coalesce(jsonb_agg(r),'[]') into rows from jsonb_array_elements(rows) r
   where not exists(select 1 from class_schedule_activities a
     where a.id=nullif(r->>'activity_id','')::uuid and a.evaluation_setting_id=(old_group->>'settingId')::uuid
       and old_group->'roomIds' @> to_jsonb(r->>'classroom_id'));
 end if;

 if not p_remove then
   -- Replace all old cells for this activity in the confirmed overlapping rooms.
   for v_room_id in select value from jsonb_array_elements_text(p_group->'roomIds') loop
     if not exists(select 1 from classrooms where id=v_room_id::uuid and school_id=p_school and academic_year_id=p_year) then raise exception 'ห้องไม่อยู่ในโรงเรียนนี้'; end if;
     select id into aid from class_schedule_activities where classroom_id=v_room_id::uuid and academic_year_id=p_year and evaluation_setting_id=target_setting;
     if aid is null then
       insert into class_schedule_activities(classroom_id,academic_year_id,evaluation_setting_id,teacher_id,weekly_periods)
       values(v_room_id::uuid,p_year,target_setting,null,1) returning id into aid;
     elsif exists(select 1 from class_schedule_activities where id=aid and teacher_id is not null) then
       raise exception 'กิจกรรมเดิมมีครูรายคน กรุณานำคาบออกก่อนย้ายมาใช้ทีมครู';
     end if;
     select coalesce(jsonb_agg(r),'[]') into rows from jsonb_array_elements(rows) r
       where (r->>'classroom_id') is distinct from v_room_id or (r->>'activity_id') is distinct from aid::text;
     for c in select value from jsonb_array_elements(p_group->'cells') loop
       select coalesce(jsonb_agg(r),'[]') into rows from jsonb_array_elements(rows) r
         where not(r->>'classroom_id'=v_room_id and r->>'day_of_week'=c->>'day' and r->>'period'=c->>'period');
       rows=rows||jsonb_build_array(jsonb_build_object('classroom_id',v_room_id,'academic_year_id',p_year,
         'day_of_week',(c->>'day')::int,'period',(c->>'period')::int,'class_subject_id',null,
         'activity_id',aid,'note',null,'locked',false));
     end loop;
   end loop;
 end if;

 end if; -- placement edits; teacher-only edits retain all original cells and locks

 select coalesce(jsonb_agg(r),'[]') into affected from jsonb_array_elements(before_rows) r
 where (r->>'locked')::boolean and not exists(select 1 from jsonb_array_elements(rows) n where n-'locked'=r-'locked');
 if jsonb_array_length(affected)>0 and not p_unlock then raise exception 'ต้องยืนยันแทนที่คาบล็อกโดยเฉพาะ'; end if;
 unlocked=before_rows;
 for c in select value from jsonb_array_elements(affected) loop
   update class_schedule_slots set locked=false where classroom_id=(c->>'classroom_id')::uuid and academic_year_id=p_year
     and semester=p_term and day_of_week=(c->>'day_of_week')::int and period=(c->>'period')::int;
   select jsonb_agg(case when r-'locked'=c-'locked' then jsonb_set(r,'{locked}','false') else r end)
     into unlocked from jsonb_array_elements(unlocked) r;
 end loop;
 select coalesce(jsonb_agg(case when exists(select 1 from jsonb_array_elements(before_rows) b where b-'locked'=r-'locked' and (b->>'locked')::boolean)
   then jsonb_set(r,'{locked}','true') else r end),'[]') into rows from jsonb_array_elements(rows) r;

 -- Remove the edited group, and when overwrite is confirmed prune only the selected
 -- rooms from other groups for this same activity. Preserve all their other rooms.
 for x in select value from jsonb_array_elements(coalesce(cfg->'activityGroups','[]')) loop
   if x->>'id'=gid::text then continue; end if;
   if not p_remove and p_overwrite and x->>'settingId'=target_setting::text then
     select coalesce(jsonb_agg(to_jsonb(r.value)),'[]') into kept_rooms
       from jsonb_array_elements_text(x->'roomIds') r
       where not (p_group->'roomIds' @> to_jsonb(r.value));
     if jsonb_array_length(kept_rooms)=0 then continue; end if;
     x=jsonb_set(x,'{roomIds}',kept_rooms);
     if x->>'mode'='separate' then
       select coalesce(jsonb_object_agg(k.key,v.value),'{}'::jsonb) into kept_teachers
         from jsonb_each(coalesce(x->'roomTeachers','{}'::jsonb)) k
         join jsonb_each(coalesce(x->'roomTeachers','{}'::jsonb)) v on v.key=k.key
         where kept_rooms @> to_jsonb(k.key);
       x=jsonb_set(x,'{roomTeachers}',kept_teachers);
     end if;
   end if;
   rebuilt_groups=rebuilt_groups||jsonb_build_array(x);
 end loop;
 if not p_remove then rebuilt_groups=rebuilt_groups||jsonb_build_array(p_group); end if;
 cfg=jsonb_set(cfg,'{activityGroups}',rebuilt_groups,true);
 insert into schedule_plans(school_id,academic_year_id,semester,config) values(p_school,p_year,p_term,cfg)
 on conflict(school_id,academic_year_id,semester) do update set config=excluded.config;
 perform save_school_schedule_term(p_school,p_year,unlocked,rows,false,p_term);
end $$;

revoke all on function public.save_schedule_activity_team(uuid,uuid,integer,text,jsonb,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function public.save_schedule_activity_team(uuid,uuid,integer,text,jsonb,boolean,boolean,boolean) to service_role;
notify pgrst,'reload schema';
commit;
