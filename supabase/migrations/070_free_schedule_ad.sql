-- โฆษณาบนหน้าจัดตารางฟรี ตั้งได้เฉพาะ Super Admin
create table if not exists public.free_schedule_ads (
  id text primary key,
  title text not null default '',
  href text not null default '',
  image_url text not null default '',
  start_date date,
  end_date date,
  updated_at timestamptz not null default now()
);

insert into public.free_schedule_ads (id)
values ('current')
on conflict (id) do nothing;

alter table public.free_schedule_ads enable row level security;

drop policy if exists free_schedule_ads_district on public.free_schedule_ads;
create policy free_schedule_ads_district on public.free_schedule_ads
  for all
  using (get_my_role() = 'district')
  with check (get_my_role() = 'district');

comment on table public.free_schedule_ads is 'Advertisement shown on the free local timetable during its date range';
notify pgrst, 'reload schema';
