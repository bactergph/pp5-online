-- Apply after 062. Additive; no existing timetable is rewritten.
begin;
create table if not exists public.schedule_plans (
 school_id uuid not null references schools(id), academic_year_id uuid not null references academic_years(id), semester int not null check(semester in(1,2)),
 config jsonb not null, primary key(school_id,academic_year_id,semester)
);
create table if not exists public.schedule_drafts (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id), academic_year_id uuid not null references academic_years(id), semester int not null check(semester in(1,2)),
 actor_id uuid not null, base_hash text not null, before_rows jsonb not null, after_rows jsonb not null,
 offerings jsonb not null default '[]', unlock_cells jsonb not null default '[]',
 created_at timestamptz not null default now(), committed_at timestamptz, cancelled_at timestamptz
);
alter table schedule_plans enable row level security;
alter table schedule_drafts enable row level security;
revoke all on schedule_plans,schedule_drafts from public,anon,authenticated;
grant all on schedule_plans,schedule_drafts to service_role;
-- Stable snapshot includes both live slots and all inputs used by the solver.
create or replace function public.schedule_snapshot(p_school uuid,p_year uuid,p_term int) returns text language sql stable security definer set search_path=public as $$
 select md5(jsonb_build_array(
 (select jsonb_agg(to_jsonb(x) order by id) from academic_years x where id=p_year and school_id=p_school),
 (select jsonb_agg(to_jsonb(x) order by id) from classrooms x where school_id=p_school and academic_year_id=p_year),
 (select jsonb_agg(to_jsonb(x) order by id) from users x where school_id=p_school),
 (select jsonb_agg(to_jsonb(x) order by id) from subjects x where school_id=p_school),
 (select jsonb_agg(to_jsonb(x) order by id) from evaluation_settings x where school_id=p_school),
 (select jsonb_agg(to_jsonb(x) order by id) from class_subjects x where academic_year_id=p_year and classroom_id in(select id from classrooms where school_id=p_school)),
 (select jsonb_agg(to_jsonb(x) order by id) from class_schedule_activities x where academic_year_id=p_year and classroom_id in(select id from classrooms where school_id=p_school)),
 (select jsonb_agg(to_jsonb(x) order by id) from class_schedule_slots x where academic_year_id=p_year and semester=p_term and classroom_id in(select id from classrooms where school_id=p_school)),
 (select jsonb_agg(to_jsonb(x) order by period,is_break) from school_period_times x where school_id=p_school),
 (select jsonb_agg(to_jsonb(x) order by teacher_id,day_of_week,period) from schedule_teacher_blocks x where school_id=p_school and academic_year_id=p_year and semester=p_term),
 (select config from schedule_plans where school_id=p_school and academic_year_id=p_year and semester=p_term)
 )::text)
$$;
create or replace function public.save_schedule_plan(p_school uuid,p_year uuid,p_term int,p_hash text,p_config jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||p_year::text,0));
 lock table classrooms,class_subjects,subjects,users,evaluation_settings,class_schedule_activities in share mode;
 if not exists(select 1 from academic_years where id=p_year and school_id=p_school) then raise exception 'ไม่พบปีการศึกษา'; end if;
 if schedule_snapshot(p_school,p_year,p_term)<>p_hash then raise exception 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก'; end if;
 if exists(select 1 from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=p_school and s.academic_year_id=p_year and s.semester=p_term and not p_config->'days' @> to_jsonb(s.day_of_week)) then raise exception 'มีคาบเดิมอยู่ในวันที่จะปิด กรุณาย้ายหรือล้างคาบก่อน'; end if;
 insert into schedule_plans values(p_school,p_year,p_term,p_config) on conflict(school_id,academic_year_id,semester) do update set config=excluded.config;
 perform validate_current_schedule_plan(p_school,p_year,p_term);
end; $$;
create or replace function public.commit_schedule_draft(p_id uuid,p_school uuid,p_actor uuid,p_unlock boolean default false) returns boolean language plpgsql security definer set search_path=public as $$
declare d schedule_drafts; x jsonb; before_unlocked jsonb;
begin
 select * into d from schedule_drafts where id=p_id and school_id=p_school and actor_id=p_actor for update;
 if not found then raise exception 'ไม่พบฉบับร่างของผู้ใช้นี้'; end if;
 if d.committed_at is not null then return false; end if;
 if d.cancelled_at is not null or d.created_at < now()-interval '24 hours' then raise exception 'ฉบับร่างถูกยกเลิกหรือหมดอายุ กรุณาสร้างใหม่'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school::text||d.academic_year_id::text,0));
 -- Freeze metadata until the atomic commit ends; slot writers use the same advisory locks.
 lock table classrooms,class_subjects,subjects,users,evaluation_settings,class_schedule_activities in share row exclusive mode;
 if schedule_snapshot(p_school,d.academic_year_id,d.semester)<>d.base_hash then raise exception 'ข้อมูลเปลี่ยนระหว่างตรวจร่าง กรุณาสร้างฉบับร่างใหม่'; end if;
 if jsonb_array_length(d.unlock_cells)>0 and not p_unlock then raise exception 'ต้องยืนยันแทนที่คาบที่ล็อกโดยเฉพาะ'; end if;
 for x in select value from jsonb_array_elements(d.offerings) loop
   insert into class_schedule_activities(id,classroom_id,academic_year_id,evaluation_setting_id,teacher_id,weekly_periods)
   values((x->>'id')::uuid,(x->>'classroom_id')::uuid,d.academic_year_id,(x->>'evaluation_setting_id')::uuid,null,1);
 end loop;
 -- Explicit unlock and replacement are in one transaction. Failure restores both.
 before_unlocked=d.before_rows;
 for x in select value from jsonb_array_elements(d.unlock_cells) loop
   update class_schedule_slots set locked=false where classroom_id=(x->>'classroom_id')::uuid and academic_year_id=d.academic_year_id and semester=d.semester and day_of_week=(x->>'day_of_week')::int and period=(x->>'period')::int;
   select jsonb_agg(case when r->>'classroom_id'=x->>'classroom_id' and r->>'day_of_week'=x->>'day_of_week' and r->>'period'=x->>'period' then jsonb_set(r,'{locked}','false') else r end) into before_unlocked from jsonb_array_elements(before_unlocked) r;
 end loop;
 perform save_school_schedule_term(p_school,d.academic_year_id,before_unlocked,d.after_rows,false,d.semester);
 update schedule_drafts set committed_at=now() where id=p_id;
 return true;
end; $$;
revoke all on function schedule_snapshot(uuid,uuid,int),save_schedule_plan(uuid,uuid,int,text,jsonb),commit_schedule_draft(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function schedule_snapshot(uuid,uuid,int),save_schedule_plan(uuid,uuid,int,text,jsonb),commit_schedule_draft(uuid,uuid,uuid,boolean) to service_role;

-- Preserve the established collision/CAS validator and add plan constraints to ALL writers.
do $$ begin
 if to_regprocedure('public.save_school_schedule_term_before_063(uuid,uuid,jsonb,jsonb,boolean,integer)') is null then
 alter function public.save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,integer) rename to save_school_schedule_term_before_063;
 end if;
end $$;
revoke all on function save_school_schedule_term_before_063(uuid,uuid,jsonb,jsonb,boolean,integer) from public,anon,authenticated;
create or replace function public.schedule_pattern_fits(p_slots jsonb,p_pattern jsonb,p_times jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare first_slot jsonb; n int; idx int; chosen jsonb; rest jsonb; pattern_rest jsonb;
begin
 if jsonb_array_length(p_slots)=0 then return jsonb_array_length(p_pattern)=0; end if;
 select value into first_slot from jsonb_array_elements(p_slots) order by (value->>'day_of_week')::int,(value->>'period')::int limit 1;
 for n,idx in select value::text::int,ordinality::int from jsonb_array_elements(p_pattern) with ordinality loop
   select jsonb_agg(value order by (value->>'period')::int) into chosen from (select value from jsonb_array_elements(p_slots) where value->>'day_of_week'=first_slot->>'day_of_week' and (value->>'period')::int >= (first_slot->>'period')::int order by (value->>'period')::int limit n) q;
   if jsonb_array_length(chosen)<>n then continue; end if;
   if exists(select 1 from jsonb_array_elements(chosen) with ordinality c(v,i) left join jsonb_array_elements(p_times) t on t->>'period'=c.v->>'period' and not (t->>'is_break')::boolean where t is null) then continue; end if;
   if exists(select 1 from jsonb_array_elements(chosen) with ordinality a(v,i) join jsonb_array_elements(chosen) with ordinality b(v,i) on b.i=a.i+1 join jsonb_array_elements(p_times) ta on ta->>'period'=a.v->>'period' and not (ta->>'is_break')::boolean join jsonb_array_elements(p_times) tb on tb->>'period'=b.v->>'period' and not (tb->>'is_break')::boolean where (tb->>'sort_order')::int<>(ta->>'sort_order')::int+1 or ta->>'end_time'<>tb->>'start_time') then continue; end if;
   select coalesce(jsonb_agg(value),'[]') into rest from jsonb_array_elements(p_slots) where not chosen @> jsonb_build_array(value);
   select coalesce(jsonb_agg(value order by ordinality),'[]') into pattern_rest from jsonb_array_elements(p_pattern) with ordinality where ordinality<>idx;
   if schedule_pattern_fits(rest,pattern_rest,p_times) then return true; end if;
 end loop;
 return false;
end $$;
create or replace function public.save_school_schedule_term(p_school_id uuid,p_year_id uuid,p_expected jsonb,p_rows jsonb,p_allow_unlock boolean default false,p_semester integer default 1) returns void language plpgsql security definer set search_path=public as $$
declare cfg jsonb; r record; used_slots jsonb; times jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':periods',0));
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||p_year_id::text,0));
 select config into cfg from schedule_plans where school_id=p_school_id and academic_year_id=p_year_id and semester=p_semester;
 if cfg is not null then
 if exists(select 1 from jsonb_array_elements(p_rows) s where not cfg->'days' @> to_jsonb((s->>'day_of_week')::int)) then raise exception 'คาบอยู่นอกวันเรียนที่กำหนด'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) s where nullif(cfg->'rules'->(s->>'class_subject_id')->>'roomId','') is not null group by cfg->'rules'->(s->>'class_subject_id')->>'roomId',s->>'day_of_week',s->>'period' having count(*)>1) then raise exception 'ห้องสถานที่ชนกัน'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by sort_order),'[]') into times from school_period_times t where school_id=p_school_id;
 for r in select key,value from jsonb_each(cfg->'rules') loop
 select coalesce(jsonb_agg(s),'[]') into used_slots from jsonb_array_elements(p_rows) s where s->>'class_subject_id'=r.key;
 if jsonb_array_length(used_slots)>(r.value->>'count')::int then raise exception 'จำนวนคาบเกินภาระสอนที่กำหนด'; end if;
 if jsonb_array_length(used_slots)=(r.value->>'count')::int and not schedule_pattern_fits(used_slots,r.value->'pattern',times) then raise exception 'รูปแบบคาบไม่ตรงหรือคาบคู่ข้ามช่วงพัก'; end if;
 end loop;
 end if;
 perform save_school_schedule_term_before_063(p_school_id,p_year_id,p_expected,p_rows,p_allow_unlock,p_semester);
end $$;
revoke all on function save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,integer),schedule_pattern_fits(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function save_school_schedule_term(uuid,uuid,jsonb,jsonb,boolean,integer) to service_role;

create or replace function public.validate_current_schedule_plan(p_school uuid,p_year uuid,p_term int) returns void language plpgsql security definer set search_path=public as $$
declare rows jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('classroom_id',s.classroom_id,'academic_year_id',s.academic_year_id,'day_of_week',s.day_of_week,'period',s.period,'class_subject_id',s.class_subject_id,'activity_id',s.activity_id,'note',s.note,'locked',s.locked)),'[]') into rows from class_schedule_slots s join classrooms c on c.id=s.classroom_id where c.school_id=p_school and s.academic_year_id=p_year and s.semester=p_term;
 perform save_school_schedule_term(p_school,p_year,rows,rows,false,p_term);
end $$;
revoke all on function validate_current_schedule_plan(uuid,uuid,int) from public,anon,authenticated;
-- Changing bell times must not split a previously valid double period.
do $$ begin
 if to_regprocedure('public.save_school_period_times_before_063(uuid,jsonb)') is null then
 alter function public.save_school_period_times(uuid,jsonb) rename to save_school_period_times_before_063;
 end if;
end $$;
revoke all on function save_school_period_times_before_063(uuid,jsonb) from public,anon,authenticated;
create or replace function public.save_school_period_times(p_school_id uuid,p_rows jsonb) returns void language plpgsql security definer set search_path=public as $$
declare p record;
begin
 perform save_school_period_times_before_063(p_school_id,p_rows);
 for p in select academic_year_id,semester from schedule_plans where school_id=p_school_id order by academic_year_id,semester loop
 perform validate_current_schedule_plan(p_school_id,p.academic_year_id,p.semester);
 end loop;
end $$;
revoke all on function save_school_period_times(uuid,jsonb) from public,anon,authenticated;
grant execute on function save_school_period_times(uuid,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
