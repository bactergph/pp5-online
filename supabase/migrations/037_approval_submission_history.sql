-- ประวัติการเสนอเซ็น (รองรับเสนอซ้ำหลังอนุมัติ/ส่งกลับ)

create table if not exists document_approval_submissions (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  doc_kind text not null check (doc_kind in ('pp5_subject', 'pp5_class', 'pp6', 'classroom_admin')),
  class_subject_id uuid references class_subjects(id) on delete cascade,
  classroom_id uuid references classrooms(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  submitted_at timestamptz not null,
  completed_at timestamptz,
  status text not null default 'in_review' check (status in ('in_review', 'approved', 'rejected')),
  rejection_note text,
  submitted_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_doc_approval_submissions_lookup
  on document_approval_submissions (school_id, doc_kind, term, class_subject_id, classroom_id, submitted_at desc);

alter table document_approval_submissions enable row level security;

create policy "document_approval_submissions_all" on document_approval_submissions for all
  using (school_id = get_my_school_id() or get_my_role() = 'district')
  with check (school_id = get_my_school_id() or get_my_role() = 'district');
