-- A subject sheet only names the room, code, title, weekly count, group, and type.
-- Teacher, period pattern, and venue stay on the workload step, so a blank teacher
-- is stored as null and a blank venue keeps the place already saved on the plan.
begin;

create or replace function public.save_schedule_input_subjects(p_school uuid,p_year uuid,p_term int,p_hash text,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare r jsonb; v_subject_id uuid; offering_id uuid; venue_id uuid; config jsonb; rule jsonb; v_semester int; v_teacher uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table classrooms,class_subjects,subjects,users,evaluation_settings,class_schedule_activities in share row exclusive mode;
 if p_term is null or p_term not in(1,2) or not exists(select 1 from academic_years where id=p_year and school_id=p_school) then raise exception 'ปีหรือภาคเรียนไม่ถูกต้อง'; end if;
 if p_hash is null or schedule_snapshot(p_school,p_year,p_term) is distinct from p_hash then raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'บันทึกได้ครั้งละ 1–500 รายการ'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'classroomId',lower(trim(x->>'code')) having count(*)>1) then raise exception 'ห้องและรหัสวิชาซ้ำ'; end if;
 select sp.config into config from schedule_plans sp where school_id=p_school and academic_year_id=p_year and semester=p_term;
 config=coalesce(config,'{"days":[1,2,3,4,5],"rooms":[],"rules":{},"reduceGaps":false,"maxContinuous":0}'::jsonb);
 for r in select value from jsonb_array_elements(p_rows) loop
   if not exists(select 1 from classrooms where id=(r->>'classroomId')::uuid and school_id=p_school and academic_year_id=p_year) then raise exception 'ห้องไม่ได้อยู่ในโรงเรียนนี้'; end if;
   v_teacher := nullif(trim(coalesce(r->>'teacherId','')), '')::uuid;
   if v_teacher is not null and not exists(select 1 from users where id=v_teacher and school_id=p_school and (is_active or email like 'pending-%') and role in('teacher','academic_head','deputy_principal','principal','admin')) then raise exception 'ครูไม่ได้อยู่ในโรงเรียนนี้'; end if;
   if coalesce(length(trim(r->>'code')),0) not between 1 and 40 or coalesce(length(trim(r->>'name')),0) not between 1 and 200
      or coalesce(length(r->>'venue'),0)>100 or (r->>'count')::numeric is null or (r->>'count')::numeric<>trunc((r->>'count')::numeric) or (r->>'count')::int not between 1 and 40
      or coalesce(r->>'group','') not in('ภาษาไทย','คณิตศาสตร์','วิทยาศาสตร์และเทคโนโลยี','สังคมศึกษา ศาสนา และวัฒนธรรม','สุขศึกษาและพลศึกษา','ศิลปะ','การงานอาชีพ','ภาษาต่างประเทศ')
      or coalesce(r->>'type','') not in('พื้นฐาน','เพิ่มเติม') then raise exception 'ข้อมูลรายวิชาไม่ถูกต้อง'; end if;
   if jsonb_typeof(r->'pattern') is distinct from 'array' then raise exception 'รูปแบบคาบไม่ถูกต้อง'; end if;
   if jsonb_array_length(r->'pattern')=0 or exists(select 1 from jsonb_array_elements_text(r->'pattern') n where n::numeric<>trunc(n::numeric) or n::int not between 1 and 8)
      or (select sum(n::int) from jsonb_array_elements_text(r->'pattern') n) is distinct from (r->>'count')::bigint then raise exception 'รูปแบบคาบรวมไม่ตรงภาระสอน'; end if;
   select id into v_subject_id from subjects where school_id=p_school and lower(code)=lower(trim(r->>'code'));
   if v_subject_id is null then
     insert into subjects(school_id,code,name,subject_group,type,hours_per_year) values(p_school,trim(r->>'code'),trim(r->>'name'),r->>'group',r->>'type',0) returning id into v_subject_id;
   else
     if not exists(select 1 from subjects where id=v_subject_id and name=trim(r->>'name')) then raise exception 'รหัสวิชา % มีชื่อเดิมต่างจากข้อมูลนำเข้า กรุณาใช้ชื่อเดิมหรือแก้ที่ข้อมูลรายวิชา',r->>'code'; end if;
   end if;
   select case when level ~ '^(ม\.|มัธยม)' then p_term else 0 end into v_semester from classrooms where id=(r->>'classroomId')::uuid;
   select id into offering_id from class_subjects
    where classroom_id=(r->>'classroomId')::uuid and subject_id=v_subject_id and academic_year_id=p_year and semester in (v_semester, 0)
    order by case when semester=v_semester then 0 else 1 end limit 1;
   if offering_id is null then
     insert into class_subjects(classroom_id,subject_id,teacher_id,academic_year_id,semester) values((r->>'classroomId')::uuid,v_subject_id,v_teacher,p_year,v_semester) returning id into offering_id;
   elsif v_teacher is not null then
     if exists(select 1 from class_subjects cs join class_schedule_slots s on s.class_subject_id=cs.id and s.semester=p_term where cs.id=offering_id and cs.teacher_id is distinct from v_teacher) then raise exception 'วิชา % มีคาบสอนแล้ว กรุณานำคาบออกก่อนเปลี่ยนครู',r->>'code'; end if;
     update class_subjects set teacher_id=v_teacher where id=offering_id;
   end if;
   venue_id := nullif(config #>> array['rules', offering_id::text, 'roomId'], '')::uuid;
   if length(trim(coalesce(r->>'venue','')))>0 then
     select (x->>'id')::uuid into venue_id from jsonb_array_elements(config->'rooms') x where x->>'name'=trim(r->>'venue') limit 1;
     if venue_id is null then venue_id=gen_random_uuid(); config=jsonb_set(config,'{rooms}',(config->'rooms')||jsonb_build_array(jsonb_build_object('id',venue_id,'name',trim(r->>'venue')))); end if;
   end if;
   rule=coalesce(config->'rules'->offering_id::text,'{"morning":false,"spread":true}'::jsonb)||jsonb_build_object('count',(r->>'count')::int,'pattern',r->'pattern','roomId',venue_id);
   config=jsonb_set(config,'{rules}',(config->'rules')||jsonb_build_object(offering_id::text,rule));
 end loop;
 insert into schedule_plans values(p_school,p_year,p_term,config) on conflict(school_id,academic_year_id,semester) do update set config=excluded.config;
 perform validate_current_schedule_plan(p_school,p_year,p_term);
end; $$;
revoke all on function public.save_schedule_input_subjects(uuid,uuid,int,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_schedule_input_subjects(uuid,uuid,int,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
