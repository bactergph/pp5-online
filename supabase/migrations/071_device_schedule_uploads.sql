-- สำเนาตารางจากเครื่องสมาชิกฟรี เมื่อโรงเรียนเปลี่ยนเป็นโปร
create table if not exists public.device_schedule_uploads (
  school_id uuid primary key references public.schools(id) on delete cascade,
  payload jsonb not null,
  content_hash text not null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);

alter table public.device_schedule_uploads enable row level security;

drop policy if exists device_schedule_uploads_school on public.device_schedule_uploads;
create policy device_schedule_uploads_school on public.device_schedule_uploads
  for all
  using (school_id = get_my_school_id() or get_my_role() = 'district')
  with check (school_id = get_my_school_id() or get_my_role() = 'district');

comment on table public.device_schedule_uploads is 'Local free timetable copied to the server when a school becomes pro';
notify pgrst, 'reload schema';
