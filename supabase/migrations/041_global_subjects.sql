-- โครงสร้างรายวิชากลาง (จัดการโดย Super Admin / district)
-- โรงเรียนสามารถ sync ไปยัง subjects ของตนเองได้

create table if not exists global_subjects (
  id uuid primary key default uuid_generate_v4(),
  code text not null,
  name text not null,
  short_name text,
  subject_group text not null,
  type text not null default 'พื้นฐาน',
  hours_per_year integer default 0,
  credits numeric(4,1) default 0,
  max_score integer default 100,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (code)
);

alter table global_subjects drop constraint if exists global_subjects_group_check;
alter table global_subjects add constraint global_subjects_group_check
  check (subject_group in (
    'ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี',
    'สังคมศึกษา ศาสนา และวัฒนธรรม', 'สุขศึกษาและพลศึกษา',
    'ศิลปะ', 'การงานอาชีพ', 'ภาษาต่างประเทศ'
  ));

create index if not exists global_subjects_group_idx on global_subjects (subject_group, sort_order, code);

alter table global_subjects enable row level security;

drop policy if exists global_subjects_select on global_subjects;
drop policy if exists global_subjects_insert on global_subjects;
drop policy if exists global_subjects_update on global_subjects;
drop policy if exists global_subjects_delete on global_subjects;

create policy global_subjects_select on global_subjects for select using (
  get_my_role() in ('district', 'admin', 'principal', 'academic_head', 'deputy_principal')
);

create policy global_subjects_insert on global_subjects for insert with check (
  get_my_role() = 'district'
);

create policy global_subjects_update on global_subjects for update using (
  get_my_role() = 'district'
);

create policy global_subjects_delete on global_subjects for delete using (
  get_my_role() = 'district'
);
