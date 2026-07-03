-- Global academic term calendars managed by Super Admin.
-- School admins can sync these dates into their own academic_years rows.

create table if not exists global_term_calendars (
  id uuid primary key default uuid_generate_v4(),
  year_be integer not null unique,
  term1_start_date date,
  term1_end_date date,
  term2_start_date date,
  term2_end_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table global_term_calendars enable row level security;

drop policy if exists global_term_calendars_select on global_term_calendars;
drop policy if exists global_term_calendars_insert on global_term_calendars;
drop policy if exists global_term_calendars_update on global_term_calendars;
drop policy if exists global_term_calendars_delete on global_term_calendars;

create policy global_term_calendars_select on global_term_calendars for select using (
  get_my_role() in ('district', 'admin')
);

create policy global_term_calendars_insert on global_term_calendars for insert with check (
  get_my_role() = 'district'
);

create policy global_term_calendars_update on global_term_calendars for update using (
  get_my_role() = 'district'
);

create policy global_term_calendars_delete on global_term_calendars for delete using (
  get_my_role() = 'district'
);
