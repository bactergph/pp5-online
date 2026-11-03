-- Fix the PL/pgSQL variable collision with class_subjects.subject_id.
-- Preserve every existing membership, ownership, year and homeroom guard.
begin;

create or replace function public.guard_personal_academic_data() returns trigger
language plpgsql set search_path=public as $$
declare payload jsonb;payloads jsonb[];room_id uuid;v_class_subject_id uuid;school uuid;yr uuid;owner_id uuid;subject_teacher uuid;lim integer;subject_scope boolean;
begin
 if tg_op='DELETE' and pg_trigger_depth()>1 then return old;end if; -- FK cleanup of an explicitly deleted parent.
 if tg_table_name='approved_document_exports' and tg_op='UPDATE' and pg_trigger_depth()>1 then return new;end if; -- Preserve archives when their FK parent is removed.
 payloads=case when tg_op='DELETE' then array[to_jsonb(old)] when tg_op='UPDATE' then array[to_jsonb(old),to_jsonb(new)] else array[to_jsonb(new)] end;
 subject_scope=tg_table_name in('scores','score_configs','hourly_attendance','approval_signatures');
 foreach payload in array payloads loop
 room_id=null;subject_teacher=null;
 v_class_subject_id=nullif(payload->>'class_subject_id','')::uuid;
 room_id=nullif(payload->>'classroom_id','')::uuid;
 if v_class_subject_id is not null then select cs.classroom_id,cs.teacher_id into room_id,subject_teacher from public.class_subjects cs where cs.id=v_class_subject_id;end if;
 if room_id is null and payload->>'student_id' is not null then select classroom_id into room_id from students where id=(payload->>'student_id')::uuid;end if;
 if room_id is null then
   if tg_table_name in('approved_document_exports','document_approval_submissions') and public.personal_homeroom_limit((payload->>'school_id')::uuid) is null then continue;end if;
   raise exception 'ไม่พบห้องเรียนของข้อมูล';
 end if;
 select c.school_id,c.academic_year_id,s.membership_owner_id into school,yr,owner_id from classrooms c join schools s on s.id=c.school_id where c.id=room_id;
 if not found then raise exception 'ไม่พบห้องเรียน';end if;
 lim=public.personal_homeroom_limit(school);
 if lim is null then continue;end if;
 perform pg_advisory_xact_lock(hashtextextended('membership:'||school::text,0));
 lim=public.personal_homeroom_limit(school);
 if lim is null then continue;end if;
 if lim=0 or owner_id is null then raise exception 'สมาชิกปัจจุบันไม่มีสิทธิ์บันทึกข้อมูลออนไลน์นี้';end if;
 if payload->>'school_id' is not null and (payload->>'school_id')::uuid<>school then raise exception 'โรงเรียนไม่ตรงกับห้องเรียน';end if;
 if payload->>'classroom_id' is not null and (payload->>'classroom_id')::uuid<>room_id then raise exception 'ห้องเรียนไม่ตรงกับรายวิชา';end if;
 if payload->>'student_id' is not null and not exists(select 1 from students where id=(payload->>'student_id')::uuid and classroom_id=room_id) then raise exception 'นักเรียนไม่ตรงกับห้องเรียน';end if;
 if payload->>'academic_year_id' is not null and (payload->>'academic_year_id')::uuid<>yr then raise exception 'ปีการศึกษาไม่ตรงกับห้องเรียน';end if;
 if subject_scope or (v_class_subject_id is not null and tg_table_name in('approved_document_exports','document_approval_submissions')) then
   if subject_teacher is distinct from owner_id then raise exception 'สมาชิกส่วนตัวบันทึกได้เฉพาะรายวิชาที่ตนรับผิดชอบ';end if;
 else
   if not exists(select 1 from personal_homeroom_rooms where school_id=school and academic_year_id=yr and classroom_id=room_id)
     or (select count(*) from personal_homeroom_rooms where school_id=school and academic_year_id=yr)>lim then
     raise exception 'แพ็กเกจนี้ทำงานประจำชั้นได้ % ห้อง กรุณาเลือกห้องใน “ห้องประจำชั้นของฉัน”',lim;
   end if;
 end if;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;

commit;
