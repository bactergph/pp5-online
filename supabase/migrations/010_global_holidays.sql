-- Global holiday templates managed by Super Admin.
-- School admins can sync these into their own academic-year holidays.

create table if not exists global_holidays (
  id uuid primary key default uuid_generate_v4(),
  year_be integer not null,
  date date not null,
  name text not null,
  created_at timestamptz default now(),
  unique (year_be, date, name)
);

alter table global_holidays enable row level security;

drop policy if exists global_holidays_select on global_holidays;
drop policy if exists global_holidays_insert on global_holidays;
drop policy if exists global_holidays_update on global_holidays;
drop policy if exists global_holidays_delete on global_holidays;

create policy global_holidays_select on global_holidays for select using (
  get_my_role() in ('district', 'admin')
);

create policy global_holidays_insert on global_holidays for insert with check (
  get_my_role() = 'district'
);

create policy global_holidays_update on global_holidays for update using (
  get_my_role() = 'district'
);

create policy global_holidays_delete on global_holidays for delete using (
  get_my_role() = 'district'
);
