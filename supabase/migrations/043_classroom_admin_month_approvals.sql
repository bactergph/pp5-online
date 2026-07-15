-- ธุรการชั้นเรียน: รองรับลายเซ็น/เสนอเซ็นรายเดือน
-- doc อื่น (pp5_class / pp6) ยังใช้ month = null ตามเดิม

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
