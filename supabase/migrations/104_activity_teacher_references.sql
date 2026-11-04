-- Activity teams are JSON references. Deleted personnel must not poison later team edits.
-- Existing plans are repaired only after the user confirms the explicit repair action.
begin;
create or replace function public.activity_plan_teacher_ids(p_config jsonb)
returns table(teacher_id text) language sql immutable set search_path=public as $$
 select distinct id from (
 select value id from jsonb_array_elements_text(coalesce(p_config->'teacherIds','[]'::jsonb))
 union all select t.value from jsonb_array_elements(coalesce(p_config->'activityGroups','[]')) g cross join lateral jsonb_array_elements_text(coalesce(g->'teacherIds','[]')) t
 union all select t.value from jsonb_array_elements(coalesce(p_config->'activityGroups','[]')) g cross join lateral jsonb_each(coalesce(g->'roomTeachers','{}')) r cross join lateral jsonb_array_elements_text(r.value) t
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
 return result;
end $$;

create or replace function public.repair_schedule_activity_teachers(p_school uuid,p_year uuid,p_term int,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cfg jsonb; removed text[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table users in share mode;
 if p_term is null or p_term not in(1,2) or not exists(select 1 from academic_years where id=p_year and school_id=p_school) or p_hash is null or schedule_snapshot(p_school,p_year,p_term) is distinct from p_hash then raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนปรับปรุงรายชื่อ'; end if;
 select config into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term for update;
 if not found then raise exception 'ไม่พบข้อมูลกิจกรรมในปีและภาคเรียนนี้'; end if;
 select array_agg(teacher_id) into removed from activity_plan_teacher_ids(cfg) r
 where not exists(select 1 from users u where u.id::text=r.teacher_id and u.school_id=p_school and (u.is_active or u.email like 'pending-%') and u.role in('teacher','academic_head','deputy_principal','principal','admin'));
 if coalesce(cardinality(removed),0)>0 then
 update schedule_plans set config=remove_activity_teacher_refs(cfg,removed) where school_id=p_school and academic_year_id=p_year and semester=p_term;
 end if;
 return jsonb_build_object('removed',coalesce(cardinality(removed),0));
end $$;

create or replace function public.cleanup_deleted_activity_teacher()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 update schedule_plans p set config=remove_activity_teacher_refs(p.config,array[old.id::text])
 where p.school_id=old.school_id and exists(select 1 from activity_plan_teacher_ids(p.config) r where r.teacher_id=old.id::text);
 return old;
end $$;
drop trigger if exists cleanup_deleted_activity_teacher on public.users;
create trigger cleanup_deleted_activity_teacher after delete on public.users for each row execute function public.cleanup_deleted_activity_teacher();
revoke all on function public.activity_plan_teacher_ids(jsonb),public.remove_activity_teacher_refs(jsonb,text[]),public.repair_schedule_activity_teachers(uuid,uuid,int,text),public.cleanup_deleted_activity_teacher() from public,anon,authenticated;
grant execute on function public.activity_plan_teacher_ids(jsonb),public.remove_activity_teacher_refs(jsonb,text[]),public.repair_schedule_activity_teachers(uuid,uuid,int,text) to service_role;
notify pgrst,'reload schema';
commit;
