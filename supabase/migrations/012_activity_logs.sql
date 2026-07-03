-- Activity logs: บันทึกประวัติการเปลี่ยนแปลงข้อมูลรายโรงเรียน
create table if not exists activity_logs (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid references schools(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  actor_name text,
  actor_role text,
  action text not null,
  module text not null,
  target_type text,
  target_id text,
  target_label text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_school_created_idx on activity_logs (school_id, created_at desc);
create index if not exists activity_logs_actor_created_idx on activity_logs (actor_id, created_at desc);
create index if not exists activity_logs_module_created_idx on activity_logs (module, created_at desc);
create index if not exists activity_logs_action_created_idx on activity_logs (action, created_at desc);

alter table activity_logs enable row level security;

drop policy if exists "Service role can manage activity logs" on activity_logs;
create policy "Service role can manage activity logs" on activity_logs
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
