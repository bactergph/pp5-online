-- Extend the existing atomic editor with per-offering teacher and block-pattern changes.
begin;
create or replace function public.save_schedule_subject_details(p_school uuid,p_year uuid,p_term int,p_hash text,p_lesson uuid,p_details jsonb,p_rule jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare target class_subjects; catalog subjects; cfg jsonb; previous jsonb; used_slots jsonb; times jsonb; quota int; next_teacher uuid; mode text; expected_pattern jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table classrooms,users,evaluation_settings,class_schedule_activities in share mode;
 lock table class_subjects,subjects,class_schedule_slots,schedule_plans in share row exclusive mode;
 if p_term is null or p_term not in(1,2) or not exists(select 1 from academic_years where id=p_year and school_id=p_school) then raise exception 'ปีหรือภาคเรียนไม่ถูกต้อง'; end if;
 if p_hash is distinct from schedule_snapshot(p_school,p_year,p_term) then raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก'; end if;
 select cs.* into target from class_subjects cs join classrooms c on c.id=cs.classroom_id where cs.id=p_lesson and cs.academic_year_id=p_year and cs.semester in(0,p_term) and c.school_id=p_school and c.academic_year_id=p_year;
 if not found then raise exception 'ไม่พบรายวิชาในห้องและปีการศึกษานี้'; end if;
 select * into catalog from subjects where id=target.subject_id and school_id=p_school;
 if not found then raise exception 'ไม่พบข้อมูลรายวิชาของโรงเรียนนี้'; end if;
 if jsonb_typeof(p_details) is distinct from 'object' or jsonb_typeof(p_rule) is distinct from 'object' then raise exception 'รายละเอียดรายวิชาไม่ถูกต้อง'; end if;
 if exists(select 1 from unnest(array['code','name','shortName','group','type']) k where jsonb_typeof(p_details->k) is distinct from 'string')
 or length(btrim(p_details->>'code')) not between 1 and 40 or length(btrim(p_details->>'name')) not between 1 and 200
 or length(btrim(p_details->>'shortName'))>200 or length(btrim(p_details->>'group'))>80
 or p_details->>'type' not in('พื้นฐาน','เพิ่มเติม') or jsonb_typeof(p_details->'count') is distinct from 'number'
 or (p_details->>'count')!~'^[0-9]+$' then raise exception 'กรอกรหัส ชื่อ ประเภท และจำนวนคาบให้ถูกต้อง'; end if;
 quota=(p_details->>'count')::int;
 if quota not between 1 and 40 or p_rule->'count' is distinct from p_details->'count' or jsonb_typeof(p_rule->'pattern') is distinct from 'array' then raise exception 'จำนวนคาบต้องเป็น 1–40 และตรงกับรูปแบบคาบ'; end if;
 if exists(select 1 from jsonb_array_elements(p_rule->'pattern') n where jsonb_typeof(n)<>'number' or n::text!~'^[1-8]$')
 or (select coalesce(sum(n::text::int),0) from jsonb_array_elements(p_rule->'pattern') n)<>quota then raise exception 'รูปแบบคาบรวมไม่ตรงจำนวนคาบ'; end if;
 if p_details ? 'periodMode' then
   if jsonb_typeof(p_details->'periodMode') is distinct from 'string' or p_details->>'periodMode' not in('single','double') then raise exception 'รูปแบบคาบไม่ถูกต้อง'; end if;
   mode=p_details->>'periodMode';
   select coalesce(jsonb_agg(n order by ordinal),'[]') into expected_pattern from (
     select case when mode='single' then 1 else 2 end n,g ordinal from generate_series(1,case when mode='single' then quota else quota/2 end) g
     union all select 1,quota where mode='double' and quota%2=1
   ) p;
   if p_rule->'pattern' is distinct from expected_pattern then raise exception 'รูปแบบคาบไม่ตรงกับตัวเลือกคาบเดี่ยวหรือคาบคู่'; end if;
 end if;
 next_teacher=target.teacher_id;
 if p_details ? 'teacherId' then
   if p_details->'teacherId'='null'::jsonb then next_teacher=null;
   elsif jsonb_typeof(p_details->'teacherId')='string' and (p_details->>'teacherId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then next_teacher=(p_details->>'teacherId')::uuid;
   else raise exception 'ครูผู้สอนไม่ถูกต้อง'; end if;
   if next_teacher is not null and not exists(select 1 from users where id=next_teacher and school_id=p_school and (is_active or email like 'pending-%') and role in('teacher','academic_head','deputy_principal','principal','admin')) then raise exception 'ไม่พบครูผู้สอนในโรงเรียนนี้'; end if;
   if next_teacher is null and exists(select 1 from class_schedule_slots where class_subject_id=p_lesson) then raise exception 'มีคาบในตารางแล้ว กรุณานำคาบออกก่อนยกเลิกครูผู้สอน'; end if;
 end if;
 if btrim(p_details->>'group')<>'' and not exists(select 1 from school_subject_groups where school_id=p_school and name=btrim(p_details->>'group')) then raise exception 'กลุ่มสาระนี้ไม่มีในรายการของโรงเรียน'; end if;
 if exists(select 1 from subjects s where s.school_id=p_school and s.id<>catalog.id and lower(btrim(s.code))=lower(btrim(p_details->>'code')) and s.level is not distinct from catalog.level) then raise exception 'รหัสวิชานี้มีในชั้นเดียวกันแล้ว กรุณาใช้รหัสอื่น'; end if;
 select config into cfg from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
 cfg=coalesce(cfg,'{"days":[1,2,3,4,5],"rooms":[],"rules":{},"reduceGaps":false,"maxContinuous":0}'::jsonb);
 previous=cfg->'rules'->p_lesson::text;
 if next_teacher is distinct from target.teacher_id and next_teacher is not null and jsonb_typeof(cfg->'teacherIds')='array' and jsonb_array_length(cfg->'teacherIds')>0 and not (cfg->'teacherIds' ? next_teacher::text) then raise exception 'กรุณาเลือกครูคนนี้ในขั้นกำหนดครูก่อน'; end if;
 if previous is not null then
   if previous-'count'-'pattern' is distinct from p_rule-'count'-'pattern' then raise exception 'แก้ได้เฉพาะข้อมูลรายวิชาและจำนวนคาบ'; end if;
 else
   if jsonb_typeof(p_rule->'morning') is distinct from 'boolean' or jsonb_typeof(p_rule->'spread') is distinct from 'boolean'
   or coalesce(p_rule->>'timePreference','any') not in('any','morning','afternoon') or nullif(p_rule->>'roomId','') is not null
   or p_rule-array['count','pattern','roomId','morning','spread','timePreference'] is distinct from '{}'::jsonb then raise exception 'เงื่อนไขคาบเดิมไม่ถูกต้อง'; end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('classroom_id',s.classroom_id,'academic_year_id',s.academic_year_id,'day_of_week',s.day_of_week,'period',s.period,'class_subject_id',s.class_subject_id,'activity_id',s.activity_id,'note',s.note,'locked',s.locked)),'[]') into used_slots from class_schedule_slots s where s.class_subject_id=p_lesson and s.academic_year_id=p_year and s.semester=p_term;
 if jsonb_array_length(used_slots)>quota then raise exception 'มีคาบในตารางมากกว่าจำนวนใหม่ กรุณานำคาบส่วนเกินออกก่อน'; end if;
 if jsonb_array_length(used_slots)=quota and not exists(select 1 from jsonb_array_elements(used_slots) r where coalesce((r->>'locked')::boolean,false)=false) then
   select coalesce(jsonb_agg(to_jsonb(t) order by sort_order),'[]') into times from school_period_times t where school_id=p_school;
   if not schedule_pattern_fits(used_slots,p_rule->'pattern',times)
   or (select jsonb_agg(n order by n) from (select count(*)::int n from jsonb_array_elements(used_slots) r group by (r->>'day_of_week')::int) d)
      is distinct from (select jsonb_agg(n::text::int order by n::text::int) from jsonb_array_elements(p_rule->'pattern') n)
   then raise exception 'รูปแบบคาบใหม่ไม่ตรงคาบเดิม คาบเดี่ยวต้องแยกวันและคาบคู่ต้องติดกัน กรุณาปรับตารางก่อน'; end if;
 end if;
 update subjects set code=btrim(p_details->>'code'),name=btrim(p_details->>'name'),short_name=nullif(btrim(p_details->>'shortName'),''),subject_group=btrim(p_details->>'group'),type=p_details->>'type' where id=catalog.id and school_id=p_school;
 cfg=jsonb_set(cfg,'{rules}',coalesce(cfg->'rules','{}')||jsonb_build_object(p_lesson::text,p_rule));
 insert into schedule_plans(school_id,academic_year_id,semester,config) values(p_school,p_year,p_term,cfg) on conflict(school_id,academic_year_id,semester) do update set config=excluded.config;
 if next_teacher is distinct from target.teacher_id then update class_subjects set teacher_id=next_teacher where id=p_lesson; end if;
 -- Existing teacher-collision and deferred joint-teaching guards validate all affected terms.
end $$;
revoke all on function public.save_schedule_subject_details(uuid,uuid,int,text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_schedule_subject_details(uuid,uuid,int,text,uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
