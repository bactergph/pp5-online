-- Match the filters used by classroom administration and PP.5 checklist pages.
-- Existing unique constraints start with student_id, so they cannot efficiently
-- serve classroom/month and class-subject/term reads as data grows.

create index if not exists idx_daily_attendance_classroom_date
  on daily_attendance (classroom_id, date);

create index if not exists idx_daily_activities_classroom_type_date
  on daily_activities (classroom_id, activity_type, date);

create index if not exists idx_hourly_attendance_subject_term
  on hourly_attendance (class_subject_id, term);

create index if not exists idx_student_health_year_month_student
  on student_health (academic_year_id, month, student_id);

create index if not exists idx_health_inspection_year_term_month_student
  on health_inspection (academic_year_id, term, month, student_id);

create index if not exists idx_holidays_year_date
  on holidays (academic_year_id, date);
