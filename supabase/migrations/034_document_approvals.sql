-- ระบบลงนาม: ปพ.5 รายห้อง / ปพ.6 / ธุรการชั้นเรียน + ปรับปรุง approval_signatures

alter table approval_signatures
  add column if not exists submitted_at timestamptz;

create table if not exists class_document_approvals (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  doc_type text not null check (doc_type in ('pp5_class', 'pp6', 'classroom_admin')),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  homeroom_signed_at timestamptz,
  homeroom_id uuid references users(id) on delete set null,
  academic_head_signed_at timestamptz,
  academic_head_id uuid references users(id) on delete set null,
  vice_director_signed_at timestamptz,
  vice_director_id uuid references users(id) on delete set null,
  director_signed_at timestamptz,
  director_id uuid references users(id) on delete set null,
  director_decision text,
  status text not null default 'draft',
  rejection_note text,
  submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(classroom_id, doc_type, academic_year_id, term)
);

create index if not exists idx_class_doc_approvals_school on class_document_approvals(school_id, status);
create index if not exists idx_class_doc_approvals_classroom on class_document_approvals(classroom_id, doc_type, term);

alter table class_document_approvals enable row level security;

create policy "class_document_approvals_all" on class_document_approvals for all
  using (school_id = get_my_school_id() or get_my_role() = 'district')
  with check (school_id = get_my_school_id() or get_my_role() = 'district');
