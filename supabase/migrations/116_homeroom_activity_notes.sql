-- Daily homeroom activity topics used by the weekly Homeroom report.
create table if not exists public.homeroom_activity_notes (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  activity_date date not null,
  topics text[] not null default '{}',
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (classroom_id, activity_date),
  constraint homeroom_activity_notes_topics_len check (cardinality(topics) between 0 and 2)
);

create index if not exists idx_homeroom_activity_notes_room_date
  on public.homeroom_activity_notes (classroom_id, activity_date);

alter table public.homeroom_activity_notes enable row level security;

drop policy if exists "homeroom_activity_notes_all" on public.homeroom_activity_notes;
create policy "homeroom_activity_notes_all" on public.homeroom_activity_notes
  for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from public.classrooms c
      where c.id = classroom_id and c.school_id = get_my_school_id()
    )
  );
