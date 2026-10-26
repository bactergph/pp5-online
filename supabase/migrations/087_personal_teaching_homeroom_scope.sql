begin;

-- Seed legacy owner assignments only on the first installation, never on reapply.
create temporary table personal_homeroom_initial_install on commit drop as
 select to_regclass('public.personal_homeroom_rooms') is null as seed;

create table if not exists public.personal_homeroom_rooms (
 school_id uuid not null references public.schools(id) on delete cascade,
 academic_year_id uuid not null references public.academic_years(id) on delete cascade,
 classroom_id uuid not null references public.classrooms(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(school_id,classroom_id)
);
create index if not exists personal_homeroom_year_idx on public.personal_homeroom_rooms(school_id,academic_year_id);
alter table public.personal_homeroom_rooms enable row level security;
drop policy if exists personal_homeroom_read on public.personal_homeroom_rooms;
create policy personal_homeroom_read on public.personal_homeroom_rooms for select using (
 school_id=public.get_my_school_id() or public.get_my_role()='district'
);
revoke all on public.personal_homeroom_rooms from anon,authenticated;
grant select on public.personal_homeroom_rooms to authenticated;
grant all on public.personal_homeroom_rooms to service_role;

create or replace function public.personal_homeroom_limit(p_school uuid) returns integer
language sql stable set search_path=public as $$
 select case
 when membership_kind is distinct from 'individual' and (membership_expires_on is null or membership_expires_on>=(now() at time zone 'Asia/Bangkok')::date) and (membership_started_on is null or membership_started_on<=(now() at time zone 'Asia/Bangkok')::date) then null
 when (membership_expires_on is not null and membership_expires_on<(now() at time zone 'Asia/Bangkok')::date) or (membership_started_on is not null and membership_started_on>(now() at time zone 'Asia/Bangkok')::date) then 0
 when member_plan='pro_plus' then 3 when member_plan='pro' then 1 else 0 end
 from schools where id=p_school;
$$;

create or replace function public.set_personal_homeroom_rooms(p_school uuid,p_actor uuid,p_year uuid,p_rooms uuid[]) returns void
language plpgsql set search_path=public as $$
declare lim integer;tenant schools%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('membership:'||p_school::text,0));
 select * into tenant from schools where id=p_school for update;
 if not found or tenant.membership_owner_id is distinct from p_actor or not exists(select 1 from users where id=p_actor and school_id=p_school and is_active=true) then raise exception 'บัญชีส่วนตัวใช้ได้เฉพาะเจ้าของสมาชิก';end if;
 lim=public.personal_homeroom_limit(p_school);
 if lim is null or lim=0 then raise exception 'ใช้ได้เฉพาะสมาชิก Pro / Pro Plus ส่วนตัวที่ยังใช้งานได้';end if;
 if p_rooms is null or cardinality(p_rooms)>lim or cardinality(p_rooms)<>(select count(distinct id) from unnest(p_rooms)id) or array_position(p_rooms,null) is not null then raise exception 'เลือกห้องประจำชั้นได้ไม่เกิน % ห้อง',lim;end if;
 if not exists(select 1 from academic_years where id=p_year and school_id=p_school) then raise exception 'ปีการศึกษาไม่ตรงกับบัญชี';end if;
 if (select count(*) from classrooms where id=any(p_rooms) and school_id=p_school and academic_year_id=p_year)<>cardinality(p_rooms) then raise exception 'ห้องเรียนไม่ตรงกับบัญชีหรือปีการศึกษา';end if;
 delete from personal_homeroom_rooms where school_id=p_school and academic_year_id=p_year;
 insert into personal_homeroom_rooms(school_id,academic_year_id,classroom_id) select p_school,p_year,id from unnest(p_rooms)id;
end $$;
revoke all on function public.set_personal_homeroom_rooms(uuid,uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.set_personal_homeroom_rooms(uuid,uuid,uuid,uuid[]) to service_role;

-- Preserve existing data. Initialize only unambiguous owner assignments that fit.
insert into personal_homeroom_rooms(school_id,academic_year_id,classroom_id)
select c.school_id,c.academic_year_id,c.id from classrooms c join schools s on s.id=c.school_id
where s.membership_kind='individual' and public.personal_homeroom_limit(s.id)>0
 and (select seed from personal_homeroom_initial_install)
 and s.membership_owner_id in(c.homeroom_teacher_id,c.homeroom_teacher2_id)
 and (select count(*) from classrooms x where x.school_id=c.school_id and x.academic_year_id=c.academic_year_id and s.membership_owner_id in(x.homeroom_teacher_id,x.homeroom_teacher2_id))<=public.personal_homeroom_limit(s.id)
on conflict do nothing;

create or replace function public.guard_personal_homeroom_selection() returns trigger
language plpgsql set search_path=public as $$
declare lim integer;actual_school uuid;actual_year uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('membership:'||new.school_id::text,0));
 select school_id,academic_year_id into actual_school,actual_year from classrooms where id=new.classroom_id;
 if actual_school is distinct from new.school_id or actual_year is distinct from new.academic_year_id then raise exception 'ห้องเรียนไม่ตรงกับบัญชีหรือปีการศึกษา';end if;
 lim=public.personal_homeroom_limit(new.school_id);
 if lim is null or lim=0 then raise exception 'ใช้ได้เฉพาะสมาชิก Pro / Pro Plus ส่วนตัว';end if;
 if (select count(*) from personal_homeroom_rooms where school_id=new.school_id and academic_year_id=new.academic_year_id and classroom_id<>new.classroom_id)>=lim then raise exception 'เลือกห้องประจำชั้นได้ไม่เกิน % ห้อง',lim;end if;
 return new;
end $$;
drop trigger if exists guard_personal_homeroom_selection on public.personal_homeroom_rooms;
create trigger guard_personal_homeroom_selection before insert or update on public.personal_homeroom_rooms for each row execute function public.guard_personal_homeroom_selection();

-- Apply to data writes even when a server route uses service_role. No JWT plan claims.
create or replace function public.guard_personal_academic_data() returns trigger
language plpgsql set search_path=public as $$
declare payload jsonb;payloads jsonb[];room_id uuid;subject_id uuid;school uuid;yr uuid;owner_id uuid;subject_teacher uuid;lim integer;subject_scope boolean;
begin
 if tg_op='DELETE' and pg_trigger_depth()>1 then return old;end if; -- FK cleanup of an explicitly deleted parent.
 if tg_table_name='approved_document_exports' and tg_op='UPDATE' and pg_trigger_depth()>1 then return new;end if; -- Preserve archives when their FK parent is removed.
 payloads=case when tg_op='DELETE' then array[to_jsonb(old)] when tg_op='UPDATE' then array[to_jsonb(old),to_jsonb(new)] else array[to_jsonb(new)] end;
 subject_scope=tg_table_name in('scores','score_configs','hourly_attendance','approval_signatures');
 foreach payload in array payloads loop
 room_id=null;subject_teacher=null;
 subject_id=nullif(payload->>'class_subject_id','')::uuid;
 room_id=nullif(payload->>'classroom_id','')::uuid;
 if subject_id is not null then select classroom_id,teacher_id into room_id,subject_teacher from class_subjects where id=subject_id;end if;
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
 if subject_scope or (subject_id is not null and tg_table_name in('approved_document_exports','document_approval_submissions')) then
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

do $$ declare tbl text;begin
 foreach tbl in array array['scores','score_configs','hourly_attendance','approval_signatures','daily_attendance','daily_activities','student_health','health_inspection','character_traits','reading_evaluation','activities_evaluation','competency_evaluation','evaluation_custom_scores','teacher_comments','student_club_assignments','class_document_approvals','approved_document_exports','document_approval_submissions'] loop
  if to_regclass('public.'||tbl) is not null then
   execute format('drop trigger if exists guard_personal_academic_data on public.%I',tbl);
   execute format('create trigger guard_personal_academic_data before insert or update or delete on public.%I for each row execute function public.guard_personal_academic_data()',tbl);
  end if;
 end loop;
end $$;
revoke all on function public.personal_homeroom_limit(uuid) from public,anon,authenticated;
grant execute on function public.personal_homeroom_limit(uuid) to service_role;
notify pgrst,'reload schema';
commit;
