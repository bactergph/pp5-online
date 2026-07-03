-- ผูกหัวหน้ากลุ่มสาระกับ users (เลือกจากระบบได้)

alter table subject_group_heads
  add column if not exists head_user_id uuid references users(id) on delete set null;

create index if not exists idx_subject_group_heads_user on subject_group_heads(head_user_id);
