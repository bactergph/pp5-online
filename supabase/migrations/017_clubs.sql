-- Club master data and per-student club assignment.

create table if not exists clubs (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  code text not null,
  name text not null,
  short_name text,
  description text,
  advisor_name text,
  max_students integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, code)
);

create table if not exists student_club_assignments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  club_id uuid references clubs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, academic_year_id)
);

create index if not exists clubs_school_active_idx on clubs(school_id, is_active, code);
create index if not exists student_club_assignments_year_idx on student_club_assignments(academic_year_id, club_id);

alter table clubs enable row level security;
alter table student_club_assignments enable row level security;

drop policy if exists "clubs_all" on clubs;
create policy "clubs_all" on clubs for all
  using (
    get_my_role() = 'superadmin' or school_id = get_my_school_id()
  )
  with check (
    get_my_role() = 'superadmin' or school_id = get_my_school_id()
  );

drop policy if exists "student_club_assignments_all" on student_club_assignments;
create policy "student_club_assignments_all" on student_club_assignments for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1
      from students s
      join classrooms c on c.id = s.classroom_id
      where s.id = student_club_assignments.student_id
      and c.school_id = get_my_school_id()
    )
  )
  with check (
    get_my_role() = 'superadmin' or
    exists (
      select 1
      from students s
      join classrooms c on c.id = s.classroom_id
      where s.id = student_club_assignments.student_id
      and c.school_id = get_my_school_id()
    )
  );
