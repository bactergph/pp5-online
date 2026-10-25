begin;
-- Expand personal plans without expiring or rewriting existing subscriptions.
alter table public.schools drop constraint if exists schools_member_plan_check;
alter table public.schools add constraint schools_member_plan_check check(member_plan in ('free','pro','pro_plus'));
alter table public.schools add column if not exists membership_student_count integer;
alter table public.schools add column if not exists membership_annual_price integer;
alter table public.schools drop constraint if exists schools_membership_quote_check;
alter table public.schools add constraint schools_membership_quote_check check(
 (membership_student_count is null or membership_student_count between 1 and 1000000)
 and (membership_annual_price is null or membership_annual_price>=0));
alter table public.membership_history add column if not exists student_count integer;
alter table public.membership_history add column if not exists annual_price integer;

create or replace function public.protect_membership_quote() returns trigger language plpgsql set search_path=public as $$
begin
 if coalesce(current_setting('app.membership_admin',true),'')<>'allowed' then
  if tg_op='INSERT' then
   if new.membership_student_count is not null or new.membership_annual_price is not null then raise exception 'กำหนดราคาสมาชิกผ่าน Super Admin เท่านั้น'; end if;
  elsif row(new.membership_student_count,new.membership_annual_price) is distinct from row(old.membership_student_count,old.membership_annual_price) then
   raise exception 'กำหนดราคาสมาชิกผ่าน Super Admin เท่านั้น';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists protect_membership_quote on public.schools;
create trigger protect_membership_quote before insert or update on public.schools for each row execute function public.protect_membership_quote();

create or replace function public.set_annual_membership_v2(p_actor uuid,p_school uuid,p_version integer,p_package text,p_start date,p_renew boolean,p_note text,p_student_count integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous schools%rowtype; old_package text; begins date; ends date; anchor date; bill integer; student_count integer;
 today date=(now() at time zone 'Asia/Bangkok')::date;
begin
 if not exists(select 1 from users where id=p_actor and role='district' and is_active=true) then raise exception 'ไม่มีสิทธิ์เปลี่ยนประเภทสมาชิก'; end if;
 if p_package is null or p_package not in ('free','pro','pro_plus','school') or length(coalesce(p_note,''))>500 then raise exception 'แพ็กเกจหรือหมายเหตุไม่ถูกต้อง'; end if;
 if p_package='school' then
  if p_student_count is null or p_student_count<1 or p_student_count>1000000 then raise exception 'กรุณาระบุจำนวนนักเรียน 1–1,000,000 คนเพื่อคำนวณราคา School'; end if;
  student_count=p_student_count;bill=greatest(2990,p_student_count*10);
 else bill=case p_package when 'pro' then 499 when 'pro_plus' then 799 else 0 end;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('membership:'||p_school::text,0));
 select * into previous from schools where id=p_school and (is_catalog=false or exists(select 1 from users where school_id=p_school and role='admin')) for update;
 if not found then raise exception 'ไม่พบพื้นที่สมาชิก'; end if;
 if previous.membership_version is distinct from p_version then raise exception 'ข้อมูลสมาชิกเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก'; end if;
 if p_package<>'school' and (select count(*) from users where school_id=p_school and not(email like 'pending-%' and is_active=false))>1 then raise exception 'พื้นที่นี้มีหลายบัญชี กรุณาใช้สมาชิกโรงเรียน หรือจัดการบัญชีก่อนเปลี่ยนเป็นสมาชิกบุคคล'; end if;
 old_package=case when previous.membership_kind='individual' then coalesce(previous.member_plan,'free') else 'school' end;
 if p_package<>'free' then
  begins=coalesce(p_start,today);
  if p_renew and old_package=p_package and previous.membership_expires_on>=today then
   anchor=previous.membership_expires_on+1;begins=coalesce(previous.membership_started_on,today);
  else anchor=begins;end if;
  ends=((anchor+interval '1 year')::date-1);
  if extract(month from anchor)=2 and extract(day from anchor)=29 then ends=make_date(extract(year from anchor)::integer+1,2,28);end if;
 end if;
 perform set_config('app.membership_admin','allowed',true);
 update schools set membership_kind=case when p_package='school' then 'school' else 'individual' end,
 member_plan=case when p_package='school' then null else p_package end,
 membership_started_on=begins,membership_expires_on=ends,membership_version=membership_version+1,
 membership_student_count=student_count,membership_annual_price=bill where id=p_school;
 insert into membership_history(school_id,actor_id,previous_package,package,starts_on,expires_on,note,student_count,annual_price)
 values(p_school,p_actor,old_package,p_package,begins,ends,trim(coalesce(p_note,'')),student_count,bill);
 return jsonb_build_object('startsOn',begins,'expiresOn',ends,'version',previous.membership_version+1,'annualPrice',bill,'studentCount',student_count);
end $$;

-- Keep the 082 RPC unchanged for already-open admin pages during deployment.
-- Updated code uses v2, which validates and records the agreed price/count.

create or replace function public.enforce_membership_room_quota() returns trigger language plpgsql set search_path=public as $$
declare tenant schools%rowtype;used integer;old_used integer;room_limit integer;today date=(now() at time zone 'Asia/Bangkok')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended('membership:'||new.school_id::text,0));
 select * into tenant from schools where id=new.school_id;
 if tenant.membership_kind is distinct from 'individual' and(tenant.membership_expires_on is null or tenant.membership_expires_on>=today)and(tenant.membership_started_on is null or tenant.membership_started_on<=today)then return new;end if;
 if tenant.member_plan is null or tenant.member_plan not in('pro','pro_plus')or(tenant.membership_expires_on is not null and tenant.membership_expires_on<today)or(tenant.membership_started_on is not null and tenant.membership_started_on>today)then raise exception 'สมาชิกฟรีใช้ได้เฉพาะจัดตารางบนอุปกรณ์ กรุณาสมัครหรือต่ออายุสมาชิกโปร';end if;
 room_limit=case when tenant.member_plan='pro_plus' then 50 else 20 end;
 if exists(select 1 from classrooms where school_id=new.school_id and trim(level)=trim(new.level)and room=new.room)then return new;end if;
 select count(*)into old_used from(select distinct trim(level),room from classrooms where school_id=new.school_id)r;
 select count(*)into used from(select distinct trim(level),room from classrooms where school_id=new.school_id and(tg_op='INSERT' or id<>new.id))r;
 if used+1>room_limit and(tg_op='INSERT' or used+1>old_used)then raise exception 'สมาชิก % มีโควตารวมสูงสุด % ห้องต่อบัญชี ไม่เพิ่มตามปีการศึกษา',case when tenant.member_plan='pro_plus' then 'Pro Plus' else 'Pro' end,room_limit;end if;
 return new;
end $$;

revoke all on function public.set_annual_membership_v2(uuid,uuid,integer,text,date,boolean,text,integer),public.set_annual_membership(uuid,uuid,integer,text,date,boolean,text) from public,anon,authenticated;
grant execute on function public.set_annual_membership_v2(uuid,uuid,integer,text,date,boolean,text,integer),public.set_annual_membership(uuid,uuid,integer,text,date,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
