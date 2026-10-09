begin;
alter table public.schools add column if not exists education_type text;
alter table public.schools drop constraint if exists schools_education_type_check;
alter table public.schools add constraint schools_education_type_check
  check (education_type in ('primary', 'secondary'));
comment on column public.schools.education_type is 'School menu profile: primary (อ.2–ม.3), secondary (ม.1–ม.6)';
notify pgrst, 'reload schema';
commit;
