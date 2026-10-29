-- Substitute records are printable documents. They read availability, but never
-- reserve a teacher, invalidate a timetable draft, or constrain schedule edits.
begin;
lock table public.schedule_substitute_days,public.schedule_substitute_entries in access exclusive mode;
create table if not exists public.substitute_documents(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references schools(id) on delete cascade,
 academic_year_id uuid not null references academic_years(id) on delete cascade,
 semester integer not null check(semester in(1,2)),date date not null,day_of_week integer not null check(day_of_week between 1 and 7),
 note text,entries jsonb not null default '[]'::jsonb check(jsonb_typeof(entries)='array'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(school_id,academic_year_id,semester,date)
);
create index if not exists substitute_documents_history on public.substitute_documents(school_id,academic_year_id,semester,date desc);
alter table public.substitute_documents enable row level security;
revoke all on public.substitute_documents from anon,authenticated;
grant select,insert,update,delete on public.substitute_documents to service_role;

-- Copy every original ID, label, conflict acknowledgement and timestamp. Names
-- are snapshots, so deleting a teacher or course later cannot erase a document.
insert into public.substitute_documents(id,school_id,academic_year_id,semester,date,day_of_week,note,entries,created_at)
select d.id,d.school_id,d.academic_year_id,d.semester,d.date,d.day_of_week,to_jsonb(d)->>'note',
 coalesce((select jsonb_agg((to_jsonb(e)-'substitute_day_id')||jsonb_build_object(
   'absent_teacher_name',concat(coalesce(a.prefix,''),a.full_name),
   'substitute_teacher_name',case when e.substitute_teacher_id is not null then concat(coalesce(t.prefix,''),t.full_name) end) order by e.period,e.id)
 from schedule_substitute_entries e left join users a on a.id=e.absent_teacher_id left join users t on t.id=e.substitute_teacher_id where e.substitute_day_id=d.id),'[]'::jsonb),
 coalesce((to_jsonb(d)->>'created_at')::timestamptz,now()) from schedule_substitute_days d on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from schedule_substitute_days old left join substitute_documents n on n.id=old.id where n.id is null)
 or exists(select 1 from schedule_substitute_entries e left join substitute_documents d on d.id=e.substitute_day_id where d.id is null or not exists(select 1 from jsonb_array_elements(d.entries) r where r->>'id'=e.id::text))
 then raise exception 'ย้ายเอกสารสอนแทนไม่ครบ ยกเลิกการเปลี่ยนฐานข้อมูล'; end if;
end $$;
-- The legacy tables remain for old SQL dependencies, but no live document is
-- stored there. This removes their old teacher/course foreign-key side effects.
delete from public.schedule_substitute_entries;
delete from public.schedule_substitute_days;
revoke insert,update,delete on public.schedule_substitute_entries,public.schedule_substitute_days from service_role;
revoke execute on function public.save_substitute_roster(uuid,uuid,jsonb,jsonb,text,uuid),public.save_substitute_day(uuid,uuid,jsonb,jsonb),public.delete_substitute_roster_entries(uuid,uuid,jsonb,uuid[],uuid),public.delete_substitute_entries(uuid,uuid,jsonb,uuid[]) from service_role;

create or replace function public.schedule_snapshot(p_school uuid,p_year uuid,p_term int)
returns text language sql stable security definer set search_path=public as $$ select schedule_snapshot_before_081(p_school,p_year,p_term) $$;
create or replace function public.save_school_schedule_term(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false,p_semester int default 1)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 perform validate_joint_teaching(p_school_id,p_year_id,p_semester,p_rows);
 perform validate_activity_teams(p_school_id,p_year_id,p_semester,p_rows);
 perform save_school_schedule_term_before_081(p_school_id,p_year_id,p_expected,p_rows,p_allow_unlock,p_semester);
end $$;
create or replace function public.set_schedule_teacher_block_before_065(p_school_id uuid,p_year_id uuid,p_semester integer,p_teacher_id uuid,p_day integer,p_period integer,p_blocked boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 if p_blocked is null or p_semester is null or p_day is null or p_period is null or p_semester not in(1,2) or p_day not between 1 and 5 or p_period not between 1 and 8
 or not exists(select 1 from academic_years where id=p_year_id and school_id=p_school_id)
 or not exists(select 1 from users where id=p_teacher_id and school_id=p_school_id and (is_active or email like 'pending-%') and role in('teacher','academic_head','deputy_principal','principal','admin')) then raise exception 'ข้อมูลครู ปีการศึกษา หรือคาบไม่ถูกต้อง'; end if;
 if p_period>coalesce((select max(period) from school_period_times where school_id=p_school_id and not is_break),6) then raise exception 'คาบนี้ยังไม่ได้ตั้งเวลาเรียน'; end if;
 if p_blocked then
   if exists(select 1 from class_schedule_slots s join classrooms c on c.id=s.classroom_id left join class_subjects cs on cs.id=s.class_subject_id left join class_schedule_activities a on a.id=s.activity_id where c.school_id=p_school_id and s.academic_year_id=p_year_id and s.semester=p_semester and s.day_of_week=p_day and s.period=p_period and coalesce(cs.teacher_id,a.teacher_id)=p_teacher_id) then raise exception 'คาบนี้มีสอนอยู่ กรุณาย้ายคาบก่อนล็อก'; end if;
   insert into schedule_teacher_blocks(school_id,academic_year_id,semester,teacher_id,day_of_week,period) values(p_school_id,p_year_id,p_semester,p_teacher_id,p_day,p_period) on conflict do nothing;
 else delete from schedule_teacher_blocks where school_id=p_school_id and academic_year_id=p_year_id and semester=p_semester and teacher_id=p_teacher_id and day_of_week=p_day and period=p_period;end if;
end $$;

create or replace function public.substitute_document_snapshot(p_entries jsonb) returns jsonb language sql immutable set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r->>'id','absent_teacher_id',r->>'absent_teacher_id','period',(r->>'period')::int,
 'class_subject_id',nullif(r->>'class_subject_id',''),'classroom_id',nullif(r->>'classroom_id',''),'subject_label',nullif(r->>'subject_label',''),'room_label',nullif(r->>'room_label',''),
 'substitute_teacher_id',nullif(r->>'substitute_teacher_id',''),'leave_type',r->>'leave_type','note',nullif(r->>'note',''),'override_conflicts',coalesce((r->>'override_conflicts')::boolean,false),'conflict_details',coalesce(r->'conflict_details','[]'::jsonb)) order by r->>'id'),'[]'::jsonb) from jsonb_array_elements(p_entries) r
$$;
create or replace function public.save_substitute_document(p_school uuid,p_document uuid,p_actor uuid,p_expected jsonb,p_rows jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare d substitute_documents%rowtype;
begin
 select * into d from substitute_documents where id=p_document and school_id=p_school for update;
 if not found or not exists(select 1 from users where id=p_actor and school_id=p_school) then raise exception 'ไม่พบเอกสารหรือผู้ใช้ของโรงเรียนนี้'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_typeof(p_expected) is distinct from 'array' or jsonb_array_length(p_rows)>2000 or octet_length(p_rows::text)>8388608 then raise exception 'ข้อมูลเอกสารไม่ถูกต้อง'; end if;
 if substitute_document_snapshot(d.entries) is distinct from substitute_document_snapshot(p_expected) then raise exception 'เอกสารถูกแก้ไขแล้ว กรุณาโหลดรายการล่าสุด'; end if;
 if (select count(distinct r->>'id') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows)
 or exists(select 1 from jsonb_array_elements(p_rows) r where coalesce(r->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or coalesce(r->>'absent_teacher_id','')='' or r->>'period' is null or (r->>'period')::int not between 1 and 8 or coalesce(trim(r->>'subject_label'),'')='' or coalesce(trim(r->>'leave_type'),'')='' or length(r->>'subject_label')>300 or length(r->>'note')>1000) then raise exception 'กรุณาตรวจรายการเอกสารสอนแทน'; end if;
 update substitute_documents set entries=p_rows,updated_at=now() where id=p_document;
end $$;
create or replace function public.delete_substitute_document_entries(p_school uuid,p_document uuid,p_actor uuid,p_expected jsonb,p_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare d substitute_documents%rowtype; kept jsonb;
begin
 select * into d from substitute_documents where id=p_document and school_id=p_school for update;
 if not found then raise exception 'ไม่พบเอกสารของโรงเรียนนี้'; end if;
 if p_ids is null or cardinality(p_ids)=0 or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids) or exists(select 1 from unnest(p_ids) id where not exists(select 1 from jsonb_array_elements(d.entries) r where r->>'id'=id::text)) then raise exception 'ไม่พบรายการที่ต้องการลบ'; end if;
 select coalesce(jsonb_agg(r),'[]') into kept from jsonb_array_elements(d.entries) r where not ((r->>'id')::uuid=any(p_ids));
 perform save_substitute_document(p_school,p_document,p_actor,p_expected,kept);
end $$;
revoke all on function public.substitute_document_snapshot(jsonb),public.save_substitute_document(uuid,uuid,uuid,jsonb,jsonb),public.delete_substitute_document_entries(uuid,uuid,uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.save_substitute_document(uuid,uuid,uuid,jsonb,jsonb),public.delete_substitute_document_entries(uuid,uuid,uuid,jsonb,uuid[]) to service_role;
comment on table public.substitute_documents is 'Standalone printable substitute reports; normal timetable data is read only for availability suggestions.';
notify pgrst,'reload schema';
commit;
