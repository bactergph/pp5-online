-- Annual subscriptions are tenant entitlements, separate from staff roles.
-- Legacy school tenants keep their current access until Super Admin sets dates.
alter table public.schools add column if not exists membership_started_on date;
alter table public.schools add column if not exists membership_expires_on date;
alter table public.schools add column if not exists membership_version integer not null default 0;
alter table public.schools add column if not exists membership_owner_id uuid;
-- Defaults affect new tenants only; existing legacy school rows are unchanged.
alter table public.schools alter column membership_kind set default 'individual';
alter table public.schools alter column member_plan set default 'free';
create unique index if not exists schools_membership_owner_uidx on public.schools(membership_owner_id) where membership_owner_id is not null;
alter table public.schools drop constraint if exists schools_membership_dates_check;
alter table public.schools add constraint schools_membership_dates_check check (
  (membership_started_on is null and membership_expires_on is null) or
  (membership_started_on is not null and membership_expires_on is not null and membership_expires_on >= membership_started_on)
);

create table if not exists public.membership_history (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
 actor_id uuid, previous_package text not null, package text not null,
 starts_on date, expires_on date, note text not null default '', created_at timestamptz not null default now()
);
alter table public.membership_history enable row level security;
drop policy if exists membership_history_admin on public.membership_history;
create policy membership_history_admin on public.membership_history for select using (public.get_my_role()='district');

create or replace function public.protect_membership_fields() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.membership_kind,new.member_plan,new.membership_started_on,new.membership_expires_on,new.membership_owner_id,new.membership_version)
 is distinct from row(old.membership_kind,old.member_plan,old.membership_started_on,old.membership_expires_on,old.membership_owner_id,old.membership_version)
 and coalesce(current_setting('app.membership_admin',true),'')<>'allowed' then
  raise exception 'เปลี่ยนประเภทสมาชิกผ่าน Super Admin เท่านั้น';
 end if;
 return new;
end $$;
drop trigger if exists protect_membership_fields on public.schools;
create trigger protect_membership_fields before update on public.schools for each row execute function public.protect_membership_fields();
create or replace function public.protect_new_membership() returns trigger language plpgsql set search_path=public as $$
begin
 if (new.membership_kind is distinct from 'individual' or new.member_plan is distinct from 'free'
 or new.membership_started_on is not null or new.membership_expires_on is not null or new.membership_version<>0)
 and coalesce(current_setting('app.membership_admin',true),'')<>'allowed' then
  raise exception 'พื้นที่สมาชิกใหม่ต้องเริ่มจากฟรี เปลี่ยนแพ็กเกจผ่าน Super Admin เท่านั้น';
 end if;
 return new;
end $$;
drop trigger if exists protect_new_membership on public.schools;
create trigger protect_new_membership before insert on public.schools for each row execute function public.protect_new_membership();

create or replace function public.register_free_member(p_user uuid,p_email text,p_name text,p_prefix text,p_position text)
returns uuid language plpgsql security definer set search_path=public as $$
declare workspace uuid;
begin
 if p_user is null or length(trim(p_email))<3 or length(trim(p_name))<1 or length(trim(p_name))>200 then raise exception 'ข้อมูลสมาชิกไม่ถูกต้อง'; end if;
 perform pg_advisory_xact_lock(hashtextextended('membership-owner:'||p_user::text,0));
 select id into workspace from schools where membership_owner_id=p_user;
 if workspace is not null then raise exception 'บัญชีนี้มีพื้นที่สมาชิกแล้ว'; end if;
 insert into schools(name,is_catalog,member_code,membership_kind,member_plan,membership_owner_id)
 values('สมาชิก '||trim(p_name),false,'MS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),'individual','free',p_user) returning id into workspace;
 insert into users(id,email,full_name,prefix,position,role,is_homeroom,school_id,is_active)
 values(p_user,lower(trim(p_email)),trim(p_name),trim(p_prefix),trim(p_position),'admin',false,workspace,true)
 on conflict(id) do update set email=excluded.email,full_name=excluded.full_name,prefix=excluded.prefix,position=excluded.position,role='admin',school_id=workspace,is_active=true;
 return workspace;
end $$;

create or replace function public.set_annual_membership(p_actor uuid,p_school uuid,p_version integer,p_package text,p_start date,p_renew boolean,p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous schools%rowtype; old_package text; begins date; ends date; anchor date; today date=(now() at time zone 'Asia/Bangkok')::date;
begin
 if not exists(select 1 from users where id=p_actor and role='district' and is_active=true) then raise exception 'ไม่มีสิทธิ์เปลี่ยนประเภทสมาชิก'; end if;
 if p_package is null or p_package not in ('free','pro','school') or length(coalesce(p_note,''))>500 then raise exception 'แพ็กเกจหรือหมายเหตุไม่ถูกต้อง'; end if;
 perform pg_advisory_xact_lock(hashtextextended('membership:'||p_school::text,0));
 select * into previous from schools where id=p_school and is_catalog=false for update;
 if not found then raise exception 'ไม่พบพื้นที่สมาชิก'; end if;
 if previous.membership_version is distinct from p_version then raise exception 'ข้อมูลสมาชิกเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก'; end if;
 if p_package<>'school' and (select count(*) from users where school_id=p_school and not (email like 'pending-%' and is_active=false))>1 then raise exception 'พื้นที่นี้มีหลายบัญชี กรุณาใช้สมาชิกโรงเรียน หรือจัดการบัญชีก่อนเปลี่ยนเป็นสมาชิกบุคคล'; end if;
 old_package=case when previous.membership_kind='individual' then coalesce(previous.member_plan,'free') else 'school' end;
 if p_package<>'free' then
  begins=coalesce(p_start,today);
  if p_renew and old_package=p_package and previous.membership_expires_on>=today then
   anchor=previous.membership_expires_on+1; begins=coalesce(previous.membership_started_on,today);
  else anchor=begins; end if;
  -- A calendar year, inclusive of its last day; Feb 29 ends on Feb 28.
  ends=((anchor+interval '1 year')::date-1);
  if extract(month from anchor)=2 and extract(day from anchor)=29 then ends=make_date(extract(year from anchor)::integer+1,2,28); end if;
 end if;
 perform set_config('app.membership_admin','allowed',true);
 update schools set membership_kind=case when p_package='school' then 'school' else 'individual' end,
 member_plan=case when p_package='school' then null else p_package end,
 membership_started_on=begins,membership_expires_on=ends,membership_version=membership_version+1 where id=p_school;
 insert into membership_history(school_id,actor_id,previous_package,package,starts_on,expires_on,note)
 values(p_school,p_actor,old_package,p_package,begins,ends,trim(coalesce(p_note,'')));
 return jsonb_build_object('startsOn',begins,'expiresOn',ends,'version',previous.membership_version+1);
end $$;

-- A room identity is level + room number, reused across academic-year snapshots.
-- Changing year/semester never grants another ten room identities.
create or replace function public.enforce_membership_room_quota() returns trigger language plpgsql set search_path=public as $$
declare tenant schools%rowtype; used integer; old_used integer; today date=(now() at time zone 'Asia/Bangkok')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended('membership:'||new.school_id::text,0));
 select * into tenant from schools where id=new.school_id;
 if tenant.membership_kind is distinct from 'individual' and (tenant.membership_expires_on is null or tenant.membership_expires_on>=today) and (tenant.membership_started_on is null or tenant.membership_started_on<=today) then return new; end if;
 if tenant.member_plan is distinct from 'pro' or (tenant.membership_expires_on is not null and tenant.membership_expires_on<today) or (tenant.membership_started_on is not null and tenant.membership_started_on>today) then raise exception 'สมาชิกฟรีใช้ได้เฉพาะจัดตารางบนอุปกรณ์ กรุณาสมัครหรือต่ออายุสมาชิกโปร'; end if;
 if exists(select 1 from classrooms where school_id=new.school_id and trim(level)=trim(new.level) and room=new.room) then return new; end if;
 select count(*) into old_used from (select distinct trim(level),room from classrooms where school_id=new.school_id) r;
 select count(*) into used from (select distinct trim(level),room from classrooms where school_id=new.school_id and (tg_op='INSERT' or id<>new.id)) r;
 if used+1>10 and (tg_op='INSERT' or used+1>old_used) then raise exception 'สมาชิกโปรมีโควตารวมสูงสุด 10 ห้องต่อบัญชี ไม่เพิ่มตามปีการศึกษา'; end if;
 return new;
end $$;
drop trigger if exists membership_room_quota on public.classrooms;
create trigger membership_room_quota before insert or update on public.classrooms for each row execute function public.enforce_membership_room_quota();

create or replace function public.enforce_individual_account() returns trigger language plpgsql set search_path=public as $$
declare tenant schools%rowtype;
begin
 if new.school_id is null or (new.email like 'pending-%' and new.is_active=false) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('membership:'||new.school_id::text,0));
 select * into tenant from schools where id=new.school_id;
 if tenant.membership_kind='individual' and exists(select 1 from users where school_id=new.school_id and id<>new.id and not (email like 'pending-%' and is_active=false)) then raise exception 'สมาชิกบุคคลใช้ได้ 1 บัญชี หากต้องการหลายบัญชีให้สมัครแบบโรงเรียน'; end if;
 return new;
end $$;
drop trigger if exists individual_account_limit on public.users;
create trigger individual_account_limit before insert or update of school_id,email,is_active on public.users for each row execute function public.enforce_individual_account();

alter table public.free_schedule_ads add column if not exists enabled boolean not null default true;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('membership-ads','membership-ads',true,3145728,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
-- Uploads use the district-only server endpoint; no public write policy.
revoke all on function public.register_free_member(uuid,text,text,text,text),public.set_annual_membership(uuid,uuid,integer,text,date,boolean,text) from public,anon,authenticated;
grant execute on function public.register_free_member(uuid,text,text,text,text),public.set_annual_membership(uuid,uuid,integer,text,date,boolean,text) to service_role;
notify pgrst,'reload schema';
