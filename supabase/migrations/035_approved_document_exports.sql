-- เอกสารที่อนุมัติแล้ว: PDF + Google Drive

alter table schools
  add column if not exists google_drive_folder_id text;

create table if not exists approved_document_exports (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  doc_kind text not null check (doc_kind in ('pp5_subject', 'pp5_class', 'pp6', 'classroom_admin')),
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  class_subject_id uuid references class_subjects(id) on delete set null,
  classroom_id uuid references classrooms(id) on delete set null,
  approval_signature_id uuid references approval_signatures(id) on delete set null,
  class_document_approval_id uuid references class_document_approvals(id) on delete set null,
  owner_user_id uuid references users(id) on delete set null,
  title text not null,
  file_name text not null,
  storage_path text,
  drive_file_id text,
  drive_web_view_link text,
  drive_folder_path text,
  approved_at timestamptz not null,
  generated_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_approved_exports_pp5_subject
  on approved_document_exports(approval_signature_id)
  where approval_signature_id is not null;

create unique index if not exists idx_approved_exports_class_doc
  on approved_document_exports(class_document_approval_id)
  where class_document_approval_id is not null;

create index if not exists idx_approved_exports_school_kind
  on approved_document_exports(school_id, doc_kind, approved_at desc);

create index if not exists idx_approved_exports_owner
  on approved_document_exports(owner_user_id, doc_kind);

alter table approved_document_exports enable row level security;

drop policy if exists "approved_document_exports_all" on approved_document_exports;
create policy "approved_document_exports_all" on approved_document_exports for all
  using (school_id = get_my_school_id() or get_my_role() = 'district')
  with check (school_id = get_my_school_id() or get_my_role() = 'district');

insert into storage.buckets (id, name, public)
values ('approved-documents', 'approved-documents', false)
on conflict (id) do nothing;
