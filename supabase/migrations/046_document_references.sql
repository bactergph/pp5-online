-- Digital Reference: รหัสอ้างอิงสาธารณะสำหรับเอกสารที่อนุมัติแล้ว (QR → /v/{code})

create table if not exists document_references (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  export_id uuid not null references approved_document_exports(id) on delete cascade,
  code text not null,
  created_at timestamptz default now(),
  unique (code),
  unique (export_id)
);

create index if not exists idx_document_references_school
  on document_references(school_id, created_at desc);

alter table document_references enable row level security;

drop policy if exists "document_references_school" on document_references;
create policy "document_references_school" on document_references for all
  using (school_id = get_my_school_id() or get_my_role() = 'district')
  with check (school_id = get_my_school_id() or get_my_role() = 'district');
