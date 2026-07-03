-- ตารางเรียน: กำหนดวิชาต่อคาบ/วัน ต่อห้องเรียน
create table class_schedule_slots (
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

create index idx_class_schedule_slots_lookup
  on class_schedule_slots (classroom_id, academic_year_id);

alter table class_schedule_slots enable row level security;

create policy "class_schedule_slots_select" on class_schedule_slots for select
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from classrooms c
      where c.id = classroom_id and c.school_id = get_my_school_id()
    )
  );

create policy "class_schedule_slots_write" on class_schedule_slots for all
  using (
    get_my_role() in ('superadmin', 'admin', 'academic_head')
  );
