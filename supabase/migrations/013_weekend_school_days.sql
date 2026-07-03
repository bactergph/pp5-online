-- School-defined weekend dates that are treated as teaching days.
-- These are separate from holidays: holidays close a date, weekend_school_days open a Saturday/Sunday.

create table if not exists weekend_school_days (
  id uuid primary key default uuid_generate_v4(),
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  date date not null,
  name text not null default 'เปิดสอนเสาร์-อาทิตย์',
  created_at timestamptz default now(),
  unique (academic_year_id, date)
);

alter table weekend_school_days enable row level security;

drop policy if exists weekend_school_days_select on weekend_school_days;
drop policy if exists weekend_school_days_insert on weekend_school_days;
drop policy if exists weekend_school_days_update on weekend_school_days;
drop policy if exists weekend_school_days_delete on weekend_school_days;

create policy weekend_school_days_select on weekend_school_days for select using (
  exists (
    select 1 from academic_years ay
    where ay.id = academic_year_id
      and (ay.school_id = get_my_school_id() or get_my_role() = 'district')
  )
);

create policy weekend_school_days_insert on weekend_school_days for insert with check (
  get_my_role() in ('district', 'admin')
);

create policy weekend_school_days_update on weekend_school_days for update using (
  get_my_role() in ('district', 'admin')
);

create policy weekend_school_days_delete on weekend_school_days for delete using (
  get_my_role() in ('district', 'admin')
);
