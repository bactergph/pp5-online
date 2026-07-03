-- Phase 1 (base): ตารางเรียน — สร้างก่อนถ้ายังไม่มี (รันไฟล์นี้ไฟล์เดียวได้)
create table if not exists class_schedule_slots (
  id uuid primary key default uuid_generate_v4(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  period smallint not null check (period between 1 and 12),
  class_subject_id uuid references class_subjects(id) on delete set null,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (classroom_id, academic_year_id, day_of_week, period)
);

create index if not exists idx_class_schedule_slots_lookup
  on class_schedule_slots (classroom_id, academic_year_id);

alter table class_schedule_slots enable row level security;

drop policy if exists "class_schedule_slots_select" on class_schedule_slots;
create policy "class_schedule_slots_select" on class_schedule_slots for select
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from classrooms c
      where c.id = classroom_id and c.school_id = get_my_school_id()
    )
  );

drop policy if exists "class_schedule_slots_write" on class_schedule_slots;
create policy "class_schedule_slots_write" on class_schedule_slots for all
  using (
    get_my_role() in ('superadmin', 'admin', 'academic_head')
  );

-- Phase 2-4: ล็อกคาบ, เวลาคาบ, ตารางสอนแทน
alter table class_schedule_slots
  add column if not exists locked boolean not null default false;

create table if not exists school_period_times (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  period smallint not null check (period between 1 and 12),
  label text not null,
  start_time text not null,
  end_time text not null,
  is_break boolean not null default false,
  sort_order smallint not null default 0,
  unique (school_id, period, is_break)
);

create table if not exists schedule_substitute_days (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  date date not null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  note text,
  created_at timestamptz default now(),
  unique (school_id, date)
);

create table if not exists schedule_substitute_entries (
  id uuid primary key default uuid_generate_v4(),
  substitute_day_id uuid not null references schedule_substitute_days(id) on delete cascade,
  absent_teacher_id uuid not null references users(id) on delete cascade,
  period smallint not null check (period between 1 and 12),
  class_subject_id uuid references class_subjects(id) on delete set null,
  classroom_id uuid references classrooms(id) on delete set null,
  subject_label text,
  room_label text,
  substitute_teacher_id uuid references users(id) on delete set null,
  leave_type text not null default 'ลาป่วย',
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_substitute_entries_day on schedule_substitute_entries(substitute_day_id);

alter table school_period_times enable row level security;
alter table schedule_substitute_days enable row level security;
alter table schedule_substitute_entries enable row level security;

drop policy if exists "school_period_times_school" on school_period_times;
create policy "school_period_times_school" on school_period_times for all
  using (school_id = get_my_school_id() or get_my_role() = 'superadmin');

drop policy if exists "schedule_substitute_days_school" on schedule_substitute_days;
create policy "schedule_substitute_days_school" on schedule_substitute_days for all
  using (school_id = get_my_school_id() or get_my_role() = 'superadmin');

drop policy if exists "schedule_substitute_entries_school" on schedule_substitute_entries;
create policy "schedule_substitute_entries_school" on schedule_substitute_entries for all
  using (
    exists (
      select 1 from schedule_substitute_days d
      where d.id = substitute_day_id and d.school_id = get_my_school_id()
    ) or get_my_role() = 'superadmin'
  );
