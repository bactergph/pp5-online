begin;

alter table public.class_subjects add column if not exists content_units jsonb not null default '[]'::jsonb;
alter table public.class_subjects add column if not exists co_teacher_ids uuid[] not null default '{}';
alter table public.class_subjects add column if not exists score_terms smallint[] not null default '{1,2}';

alter table public.class_subjects drop constraint if exists class_subjects_content_units_check;
alter table public.class_subjects add constraint class_subjects_content_units_check
  check (jsonb_typeof(content_units) = 'array' and jsonb_array_length(content_units) <= 2);

alter table public.class_subjects drop constraint if exists class_subjects_score_terms_check;
alter table public.class_subjects add constraint class_subjects_score_terms_check
  check (score_terms <@ array[1,2]::smallint[] and cardinality(score_terms) between 1 and 2);

comment on column public.class_subjects.content_units is 'ชื่อเนื้อหาย่อยไม่เกิน 2 ชื่อ อยู่ภายใต้รหัสวิชาเดิม';
comment on column public.class_subjects.co_teacher_ids is 'ครูผู้สอนร่วม นอกจาก teacher_id';
comment on column public.class_subjects.score_terms is 'ภาคเรียนที่เปิดบันทึกคะแนน ของรายวิชาที่ใช้ร่วมทั้งปี';

notify pgrst, 'reload schema';
commit;
