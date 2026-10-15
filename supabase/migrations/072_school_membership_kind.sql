-- school = สมาชิกรายโรงเรียน ใช้ระบบเดิมทั้งก้อน
-- individual = สมาชิกเดี่ยว ใช้ member_plan เป็น free หรือ pro
alter table public.schools add column if not exists membership_kind text;
alter table public.schools drop constraint if exists schools_membership_kind_check;
alter table public.schools add constraint schools_membership_kind_check
  check (membership_kind in ('school', 'individual'));
comment on column public.schools.membership_kind is 'school = full school member · individual = solo free or pro account';
notify pgrst, 'reload schema';
