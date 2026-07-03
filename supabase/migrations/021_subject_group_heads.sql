-- หัวหน้ากลุ่มสาระการเรียนรู้ (ใช้ลงนาม ปพ.5 รายวิชา)
create table if not exists subject_group_heads (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  subject_group text not null,
  head_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(school_id, subject_group),
  check (subject_group in (
    'ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี',
    'สังคมศึกษา ศาสนา และวัฒนธรรม', 'สุขศึกษาและพลศึกษา',
    'ศิลปะ', 'การงานอาชีพ', 'ภาษาต่างประเทศ'
  ))
);

create index if not exists idx_subject_group_heads_school on subject_group_heads(school_id);

alter table subject_group_heads enable row level security;

create policy "subject_group_heads_select" on subject_group_heads for select
  using (
    get_my_role() = 'superadmin' or
    school_id = get_my_school_id()
  );

create policy "subject_group_heads_insert" on subject_group_heads for insert
  with check (
    get_my_role() = 'superadmin' or
    (get_my_role() in ('admin', 'principal', 'academic_head') and school_id = get_my_school_id())
  );

create policy "subject_group_heads_update" on subject_group_heads for update
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() in ('admin', 'principal', 'academic_head') and school_id = get_my_school_id())
  );

create policy "subject_group_heads_delete" on subject_group_heads for delete
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() in ('admin', 'principal', 'academic_head') and school_id = get_my_school_id())
  );
