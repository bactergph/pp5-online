-- ฟรี = จัดตารางบนเครื่องสมาชิก · โปร = ใช้ตัวจัดตารางออนไลน์
alter table public.schools add column if not exists member_plan text;
alter table public.schools drop constraint if exists schools_member_plan_check;
alter table public.schools add constraint schools_member_plan_check
  check (member_plan in ('free', 'pro'));
comment on column public.schools.member_plan is 'free = local timetable for members · pro = online timetable';
notify pgrst, 'reload schema';
