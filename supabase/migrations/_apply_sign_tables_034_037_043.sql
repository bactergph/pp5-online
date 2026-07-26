-- ติดตั้งตารางลงนาม: 034 + 037 + 043 (idempotent — รันซ้ำได้)
-- วิธีใช้: Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run

-- ========== 034_document_approvals.sql ==========
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

drop policy if exists "class_document_approvals_all" on class_document_approvals;
create policy "class_document_approvals_all" on class_document_approvals for all
  using (school_id = get_my_school_id() or get_my_role() = 'district')
  with check (school_id = get_my_school_id() or get_my_role() = 'district');

-- ========== 037_approval_submission_history.sql (043 ต้องใช้) ==========
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

drop policy if exists "document_approval_submissions_all" on document_approval_submissions;
create policy "document_approval_submissions_all" on document_approval_submissions for all
  using (school_id = get_my_school_id() or get_my_role() = 'district')
  with check (school_id = get_my_school_id() or get_my_role() = 'district');

-- ========== 043_classroom_admin_month_approvals.sql ==========
alter table class_document_approvals
  add column if not exists month integer
  check (month is null or (month >= 1 and month <= 12));

alter table class_document_approvals
  drop constraint if exists class_document_approvals_classroom_id_doc_type_academic_year_id_term_key;

create unique index if not exists uq_class_document_approvals_period
  on class_document_approvals (
    classroom_id,
    doc_type,
    academic_year_id,
    term,
    (coalesce(month, 0))
  );

create index if not exists idx_class_doc_approvals_month
  on class_document_approvals (classroom_id, doc_type, term, month);

alter table document_approval_submissions
  add column if not exists month integer
  check (month is null or (month >= 1 and month <= 12));

-- ตรวจผล
select
  to_regclass('public.class_document_approvals') as class_document_approvals,
  to_regclass('public.document_approval_submissions') as document_approval_submissions,
  (
    select count(*) > 0
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'class_document_approvals'
      and column_name = 'month'
  ) as has_month_column;
