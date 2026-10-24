begin;
alter table public.schools add column if not exists free_schedule_teacher_limit integer not null default 25;
alter table public.schools drop constraint if exists schools_free_teacher_limit_check;
alter table public.schools add constraint schools_free_teacher_limit_check check(free_schedule_teacher_limit>=25);
create or replace function public.protect_free_teacher_limit() returns trigger language plpgsql set search_path=public as $$
begin
 if coalesce(current_setting('app.membership_admin',true),'')<>'allowed' then
  if tg_op='INSERT' then
   if new.free_schedule_teacher_limit<>25 then raise exception 'กำหนดโควต้าครูฟรีผ่าน Super Admin เท่านั้น'; end if;
  elsif new.free_schedule_teacher_limit is distinct from old.free_schedule_teacher_limit then
   raise exception 'กำหนดโควต้าครูฟรีผ่าน Super Admin เท่านั้น';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists protect_free_teacher_limit on public.schools;
create trigger protect_free_teacher_limit before insert or update on public.schools for each row execute function public.protect_free_teacher_limit();
create or replace function public.set_free_teacher_limit(p_actor uuid,p_school uuid,p_version integer,p_limit integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous schools%rowtype; pack text;
begin
 if not exists(select 1 from users where id=p_actor and role='district' and is_active=true) then raise exception 'ไม่มีสิทธิ์กำหนดโควต้าครูฟรี'; end if;
 if p_limit is null or p_limit<25 then raise exception 'ระบุจำนวนครูตั้งแต่ 25 คนขึ้นไป'; end if;
 perform pg_advisory_xact_lock(hashtextextended('membership:'||p_school::text,0));
 select * into previous from schools where id=p_school and (is_catalog=false or exists(select 1 from users where school_id=p_school and role='admin')) for update;
 if not found then raise exception 'ไม่พบพื้นที่สมาชิก'; end if;
 if previous.membership_version is distinct from p_version then raise exception 'ข้อมูลสมาชิกเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนบันทึก'; end if;
 perform set_config('app.membership_admin','allowed',true);
 update schools set free_schedule_teacher_limit=p_limit,membership_version=membership_version+1 where id=p_school;
 pack=case when previous.membership_kind='individual' then coalesce(previous.member_plan,'free') else 'school' end;
 insert into membership_history(school_id,actor_id,previous_package,package,starts_on,expires_on,note)
 values(p_school,p_actor,pack,pack,previous.membership_started_on,previous.membership_expires_on,
  'โควต้าครูตัวฟรี: '||previous.free_schedule_teacher_limit::text||' → '||p_limit::text||' คน');
 return jsonb_build_object('teacherLimit',p_limit,'version',previous.membership_version+1);
end $$;
revoke all on function public.set_free_teacher_limit(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.set_free_teacher_limit(uuid,uuid,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
