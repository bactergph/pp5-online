-- Taking a subject off the timetable must stay possible when term 2 already
-- contains a clock clash. Clearing compares stored columns only, so a
-- display field such as content_unit is not treated as a new period.
begin;

create or replace function public.schedule_slot_unchanged(
  p_year uuid, p_term int, p_room uuid, p_day int, p_period int, p_subject uuid, p_activity uuid, p_note text
) returns boolean language sql stable set search_path=public as $$
  select exists(
    select 1 from class_schedule_slots s
    where s.academic_year_id=p_year and s.semester=p_term and s.classroom_id=p_room
      and s.day_of_week=p_day and s.period=p_period
      and s.class_subject_id is not distinct from p_subject
      and s.activity_id is not distinct from p_activity
      and s.note is not distinct from p_note
  )
$$;

create or replace function public.validate_profile_schedule(p_school uuid,p_year uuid,p_term int,p_rows jsonb)
returns void language plpgsql set search_path=public as $$
declare repair boolean := current_setting('schedule.profile_only_new', true)='on'
  and not exists(
    select 1 from jsonb_to_recordset(p_rows) n(classroom_id uuid,day_of_week int,period int,class_subject_id uuid,activity_id uuid,note text)
    where not schedule_slot_unchanged(p_year,p_term,n.classroom_id,n.day_of_week,n.period,n.class_subject_id,n.activity_id,n.note)
  );
begin
 if repair then return; end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) s(classroom_id uuid,period int)
 where not exists(select 1 from jsonb_array_elements(schedule_room_times(p_school,s.classroom_id)) t where not (t->>'is_break')::boolean and (t->>'period')::int=s.period)) then raise exception 'คาบอยู่นอกเวลาเรียนของระดับชั้น'; end if;
 if exists(with cells as materialized(select * from schedule_profile_cells(p_school,p_year,p_term,p_rows))
 select 1 from cells a join cells b on a.day=b.day and a.room_id<>b.room_id and a.start_clock<b.end_clock and b.start_clock<a.end_clock
 where ((a.teacher is not null and a.teacher=b.teacher) or (a.venue is not null and a.venue=b.venue))
 and not (a.event=b.event and a.start_clock=b.start_clock and a.end_clock=b.end_clock)) then raise exception 'ครูหรือสถานที่ชนกันเมื่อเทียบเวลาเรียนจริงของแต่ละระดับ'; end if;
 if exists(select 1 from schedule_profile_cells(p_school,p_year,p_term,p_rows) c join schedule_teacher_blocks b on b.school_id=p_school and b.academic_year_id=p_year and b.semester=p_term and b.teacher_id=c.teacher and b.day_of_week=c.day
 join school_period_times t on t.school_id=p_school and t.period=b.period and not t.is_break and c.start_clock<t.end_time::time and t.start_time::time<c.end_clock) then raise exception 'ครูล็อกเวลาว่างนี้ไว้ เมื่อเทียบเวลาจริง'; end if;
 if exists(select 1 from schedule_profile_cells(p_school,p_year,p_term,p_rows) where event is not null group by event,day,period having min(start_clock)<>max(start_clock) or min(end_clock)<>max(end_clock)) then raise exception 'คาบสอนรวมหรือกิจกรรมรวมต้องมีเวลาเริ่มและสิ้นสุดตรงกันทุกระดับ'; end if;
end $$;

create or replace function public.save_school_schedule_term(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false,p_semester int default 1)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform set_config('schedule.profile_only_new','on',true);
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 if exists(select 1 from jsonb_array_elements(p_rows) r join classrooms c on c.id::text=r->>'classroom_id' and c.school_id=p_school_id and c.academic_year_id=p_year_id and not c.schedule_enabled
 where not exists(select 1 from class_schedule_slots s where s.classroom_id=c.id and s.academic_year_id=p_year_id and s.semester=p_semester and
 (to_jsonb(s)-'id'-'created_at'-'updated_at'-'semester')=(r-'id'-'created_at'-'updated_at'-'semester'))) then raise exception 'ห้องนี้ปิดอยู่ เปิดห้องก่อนแก้ตาราง'; end if;
 perform save_school_schedule_term_before_106(p_school_id,p_year_id,schedule_active_rows(p_school_id,p_year_id,p_expected),schedule_active_rows(p_school_id,p_year_id,p_rows),p_allow_unlock,p_semester);
end $$;

create or replace function public.clear_schedule_placements(
 p_school uuid,p_year uuid,p_term int,p_hash text,p_rows jsonb,p_config jsonb,p_unlock boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare actual jsonb; unlocked jsonb; clean jsonb; cfg jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table classrooms,class_subjects,subjects,users,evaluation_settings,class_schedule_activities in share row exclusive mode;
 if p_term is null or p_term not in(1,2) or p_unlock is null or not exists(select 1 from academic_years where id=p_year and school_id=p_school)
   or p_hash is null or schedule_snapshot(p_school,p_year,p_term) is distinct from p_hash then
   raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาเปิดหน้าต่างล้างตารางและตรวจสอบใหม่';
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_config) is distinct from 'object' then raise exception 'ข้อมูลการล้างตารางไม่ถูกต้อง'; end if;
 select coalesce(config,'{}') into cfg from schedule_room_plans where school_id=p_school and academic_year_id=p_year and semester=p_term;
 cfg=coalesce(cfg,'{"days":[1,2,3,4,5],"rooms":[],"rules":{},"reduceGaps":false,"maxContinuous":0}'::jsonb);
 if cfg-'activityGroups'-'teachingGroups' is distinct from p_config-'activityGroups'-'teachingGroups' then raise exception 'การล้างตารางต้องไม่เปลี่ยนภาระสอนหรือการตั้งค่าอื่น'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('classroom_id',s.classroom_id,'academic_year_id',s.academic_year_id,
   'day_of_week',s.day_of_week,'period',s.period,'class_subject_id',s.class_subject_id,'activity_id',s.activity_id,'note',s.note,'locked',s.locked)),'[]')
 into actual from class_schedule_slots s join classrooms c on c.id=s.classroom_id and c.schedule_enabled where c.school_id=p_school and s.academic_year_id=p_year and s.semester=p_term;
 select coalesce(jsonb_agg(jsonb_build_object('classroom_id',r.classroom_id,'academic_year_id',r.academic_year_id,
   'day_of_week',r.day_of_week,'period',r.period,'class_subject_id',r.class_subject_id,'activity_id',r.activity_id,'note',r.note,'locked',r.locked)),'[]')
 into clean from jsonb_to_recordset(p_rows) r(classroom_id uuid,academic_year_id uuid,day_of_week int,period int,class_subject_id uuid,activity_id uuid,note text,locked boolean);
 if exists(with previous as materialized(select value from jsonb_array_elements(actual)) select 1 from jsonb_array_elements(clean) n left join previous on previous.value=n.value where previous.value is null) then raise exception 'การล้างตารางเพิ่มหรือแก้ไขคาบไม่ได้'; end if;
 if not p_unlock and exists(with proposed as materialized(select value from jsonb_array_elements(clean)) select 1 from jsonb_array_elements(actual) r left join proposed on proposed.value=r.value where (r.value->>'locked')::boolean and proposed.value is null) then raise exception 'กรุณาติ๊กยืนยันล้างคาบที่ล็อกไว้ด้วย'; end if;
 update class_schedule_slots s set locked=false where s.academic_year_id=p_year and s.semester=p_term and s.locked
   and exists(select 1 from classrooms c where c.id=s.classroom_id and c.schedule_enabled and c.school_id=p_school)
   and not exists(select 1 from jsonb_to_recordset(clean) n(classroom_id uuid,day_of_week int,period int) where n.classroom_id=s.classroom_id and n.day_of_week=s.day_of_week and n.period=s.period);
 with proposed as materialized(select value from jsonb_array_elements(clean))
 select coalesce(jsonb_agg(case when (r.value->>'locked')::boolean and proposed.value is null then jsonb_set(r.value,'{locked}','false') else r.value end),'[]') into unlocked from jsonb_array_elements(actual) r left join proposed on proposed.value=r.value;
 insert into schedule_plans(school_id,academic_year_id,semester,config) values(p_school,p_year,p_term,p_config)
 on conflict(school_id,academic_year_id,semester) do update set config=excluded.config;
 perform save_school_schedule_term(p_school,p_year,unlocked,clean,false,p_term);
end $$;

revoke all on function public.schedule_slot_unchanged(uuid,int,uuid,int,int,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.schedule_slot_unchanged(uuid,int,uuid,int,int,uuid,uuid,text) to service_role;
revoke all on function public.clear_schedule_placements(uuid,uuid,int,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.clear_schedule_placements(uuid,uuid,int,text,jsonb,jsonb,boolean) to service_role;
revoke all on function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,int) from public,anon,authenticated;
grant execute on function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,int) to service_role;

notify pgrst, 'reload schema';
commit;
