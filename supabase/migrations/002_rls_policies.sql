-- ============================================================
-- 002_rls_policies.sql
-- Row Level Security policies สำหรับทุกตาราง
-- ============================================================

-- เปิดใช้งาน RLS ทุกตาราง
alter table schools enable row level security;
alter table academic_years enable row level security;
alter table holidays enable row level security;
alter table users enable row level security;
alter table classrooms enable row level security;
alter table period_config enable row level security;
alter table subjects enable row level security;
alter table teacher_permissions enable row level security;
alter table students enable row level security;
alter table class_subjects enable row level security;
alter table score_configs enable row level security;
alter table scores enable row level security;
alter table daily_attendance enable row level security;
alter table hourly_attendance enable row level security;
alter table student_health enable row level security;
alter table health_inspection enable row level security;
alter table daily_activities enable row level security;
alter table character_traits enable row level security;
alter table reading_evaluation enable row level security;
alter table activities_evaluation enable row level security;
alter table approval_signatures enable row level security;
alter table teacher_comments enable row level security;
alter table bmi_criteria enable row level security;
alter table height_criteria enable row level security;
alter table curriculum_indicators enable row level security;
alter table notifications enable row level security;

-- ============================================================
-- Helper Functions
-- ============================================================

-- ดึง school_id ของ user ที่ login
create or replace function get_my_school_id()
returns uuid language sql security definer stable as $$
  select school_id from users where id = auth.uid()
$$;

-- ดึง role ของ user ที่ login
create or replace function get_my_role()
returns text language sql security definer stable as $$
  select role from users where id = auth.uid()
$$;

-- ============================================================
-- SCHOOLS policies
-- ============================================================
-- superadmin เห็นทั้งหมด, คนอื่นเห็นเฉพาะโรงเรียนตัวเอง
create policy "schools_select" on schools for select
  using (
    get_my_role() = 'superadmin' or
    id = get_my_school_id()
  );

create policy "schools_insert" on schools for insert
  with check (get_my_role() = 'superadmin');

create policy "schools_update" on schools for update
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and id = get_my_school_id())
  );

-- ============================================================
-- ACADEMIC_YEARS policies
-- ============================================================
create policy "academic_years_select" on academic_years for select
  using (
    get_my_role() = 'superadmin' or
    school_id = get_my_school_id()
  );

create policy "academic_years_insert" on academic_years for insert
  with check (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

create policy "academic_years_update" on academic_years for update
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

create policy "academic_years_delete" on academic_years for delete
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

-- ============================================================
-- HOLIDAYS policies
-- ============================================================
create policy "holidays_select" on holidays for select
  using (
    exists (
      select 1 from academic_years ay
      where ay.id = academic_year_id
        and (get_my_role() = 'superadmin' or ay.school_id = get_my_school_id())
    )
  );

create policy "holidays_insert" on holidays for insert
  with check (
    exists (
      select 1 from academic_years ay
      where ay.id = academic_year_id
        and (get_my_role() = 'superadmin' or
             (get_my_role() = 'admin' and ay.school_id = get_my_school_id()))
    )
  );

create policy "holidays_update" on holidays for update
  using (
    exists (
      select 1 from academic_years ay
      where ay.id = academic_year_id
        and (get_my_role() = 'superadmin' or
             (get_my_role() = 'admin' and ay.school_id = get_my_school_id()))
    )
  );

create policy "holidays_delete" on holidays for delete
  using (
    exists (
      select 1 from academic_years ay
      where ay.id = academic_year_id
        and (get_my_role() = 'superadmin' or
             (get_my_role() = 'admin' and ay.school_id = get_my_school_id()))
    )
  );

-- ============================================================
-- USERS policies
-- ============================================================
-- ทุกคนเห็นข้อมูลตัวเอง, admin เห็นในโรงเรียนตัวเอง
create policy "users_select" on users for select
  using (
    id = auth.uid() or
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

create policy "users_insert" on users for insert
  with check (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

create policy "users_update" on users for update
  using (
    id = auth.uid() or
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

-- ============================================================
-- CLASSROOMS policies
-- ============================================================
create policy "classrooms_select" on classrooms for select
  using (
    get_my_role() = 'superadmin' or
    school_id = get_my_school_id()
  );

create policy "classrooms_insert" on classrooms for insert
  with check (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

create policy "classrooms_update" on classrooms for update
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

create policy "classrooms_delete" on classrooms for delete
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

-- ============================================================
-- SUBJECTS policies
-- ============================================================
create policy "subjects_select" on subjects for select
  using (
    get_my_role() = 'superadmin' or
    school_id = get_my_school_id()
  );

create policy "subjects_insert" on subjects for insert
  with check (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

create policy "subjects_update" on subjects for update
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

create policy "subjects_delete" on subjects for delete
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and school_id = get_my_school_id())
  );

-- ============================================================
-- TEACHER_PERMISSIONS policies
-- ============================================================
create policy "teacher_permissions_select" on teacher_permissions for select
  using (
    teacher_id = auth.uid() or
    get_my_role() = 'superadmin' or
    get_my_role() = 'admin'
  );

create policy "teacher_permissions_insert" on teacher_permissions for insert
  with check (
    get_my_role() = 'superadmin' or
    get_my_role() = 'admin'
  );

create policy "teacher_permissions_delete" on teacher_permissions for delete
  using (
    get_my_role() = 'superadmin' or
    get_my_role() = 'admin'
  );

-- ============================================================
-- STUDENTS policies
-- ============================================================
create policy "students_select" on students for select
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from classrooms c
      where c.id = classroom_id
        and c.school_id = get_my_school_id()
        and (
          get_my_role() = 'admin' or
          get_my_role() = 'homeroom' or
          exists (
            select 1 from teacher_permissions tp
            where tp.teacher_id = auth.uid()
              and tp.classroom_id = c.id
          )
        )
    )
  );

create policy "students_insert" on students for insert
  with check (
    get_my_role() = 'superadmin' or
    (get_my_role() = 'admin' and
     exists (
       select 1 from classrooms c
       where c.id = classroom_id and c.school_id = get_my_school_id()
     ))
  );

create policy "students_update" on students for update
  using (
    get_my_role() = 'superadmin' or
    (get_my_role() in ('admin', 'homeroom') and
     exists (
       select 1 from classrooms c
       where c.id = classroom_id and c.school_id = get_my_school_id()
     ))
  );

-- ============================================================
-- SCORES policies - ครูแก้ไขได้เฉพาะวิชาที่ตัวเองสอน
-- ============================================================
create policy "scores_select" on scores for select
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from class_subjects cs
        join classrooms c on c.id = cs.classroom_id
      where cs.id = class_subject_id
        and c.school_id = get_my_school_id()
    )
  );

create policy "scores_insert_update" on scores for insert
  with check (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from class_subjects cs
      where cs.id = class_subject_id
        and (cs.teacher_id = auth.uid() or get_my_role() = 'admin')
    )
  );

create policy "scores_update" on scores for update
  using (
    get_my_role() = 'superadmin' or
    (not locked and exists (
      select 1 from class_subjects cs
      where cs.id = class_subject_id
        and (cs.teacher_id = auth.uid() or get_my_role() = 'admin')
    ))
  );

-- ============================================================
-- Seed data tables: อ่านได้ทุกคน
-- ============================================================
create policy "bmi_criteria_select" on bmi_criteria for select using (true);
create policy "height_criteria_select" on height_criteria for select using (true);
create policy "curriculum_indicators_select" on curriculum_indicators for select using (true);

-- เฉพาะ superadmin แก้ไข seed data
create policy "bmi_criteria_insert" on bmi_criteria for insert with check (get_my_role() = 'superadmin');
create policy "height_criteria_insert" on height_criteria for insert with check (get_my_role() = 'superadmin');
create policy "curriculum_indicators_insert" on curriculum_indicators for insert with check (get_my_role() = 'superadmin');

-- ============================================================
-- NOTIFICATIONS policies
-- ============================================================
create policy "notifications_select" on notifications for select
  using (user_id = auth.uid());

create policy "notifications_update" on notifications for update
  using (user_id = auth.uid());

-- ============================================================
-- Policies อื่นๆ (ให้ school members ใช้งานได้)
-- ============================================================
-- class_subjects, score_configs, daily_attendance, hourly_attendance
-- student_health, health_inspection, daily_activities, character_traits
-- reading_evaluation, activities_evaluation, approval_signatures, teacher_comments
-- ใช้ pattern เดียวกัน: school_id match

create policy "class_subjects_select" on class_subjects for select
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from classrooms c
      where c.id = classroom_id and c.school_id = get_my_school_id()
    )
  );

create policy "class_subjects_insert" on class_subjects for insert
  with check (
    get_my_role() in ('superadmin', 'admin')
  );

create policy "class_subjects_update" on class_subjects for update
  using (get_my_role() in ('superadmin', 'admin'));

create policy "class_subjects_delete" on class_subjects for delete
  using (get_my_role() in ('superadmin', 'admin'));

-- score_configs
create policy "score_configs_all" on score_configs for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from class_subjects cs
        join classrooms c on c.id = cs.classroom_id
      where cs.id = class_subject_id and c.school_id = get_my_school_id()
    )
  );

-- daily_attendance
create policy "daily_attendance_all" on daily_attendance for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from classrooms c
      where c.id = classroom_id and c.school_id = get_my_school_id()
    )
  );

-- hourly_attendance
create policy "hourly_attendance_all" on hourly_attendance for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from classrooms c
      where c.id = classroom_id and c.school_id = get_my_school_id()
    )
  );

-- student_health, health_inspection, daily_activities, character_traits, reading_evaluation, activities_evaluation
create policy "student_health_all" on student_health for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from students s
        join classrooms c on c.id = s.classroom_id
      where s.id = student_id and c.school_id = get_my_school_id()
    )
  );

create policy "health_inspection_all" on health_inspection for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from students s
        join classrooms c on c.id = s.classroom_id
      where s.id = student_id and c.school_id = get_my_school_id()
    )
  );

create policy "daily_activities_all" on daily_activities for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from classrooms c
      where c.id = classroom_id and c.school_id = get_my_school_id()
    )
  );

create policy "character_traits_all" on character_traits for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from students s
        join classrooms c on c.id = s.classroom_id
      where s.id = student_id and c.school_id = get_my_school_id()
    )
  );

create policy "reading_evaluation_all" on reading_evaluation for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from students s
        join classrooms c on c.id = s.classroom_id
      where s.id = student_id and c.school_id = get_my_school_id()
    )
  );

create policy "activities_evaluation_all" on activities_evaluation for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from students s
        join classrooms c on c.id = s.classroom_id
      where s.id = student_id and c.school_id = get_my_school_id()
    )
  );

create policy "approval_signatures_all" on approval_signatures for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from class_subjects cs
        join classrooms c on c.id = cs.classroom_id
      where cs.id = class_subject_id and c.school_id = get_my_school_id()
    )
  );

create policy "teacher_comments_all" on teacher_comments for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from students s
        join classrooms c on c.id = s.classroom_id
      where s.id = student_id and c.school_id = get_my_school_id()
    )
  );

create policy "period_config_all" on period_config for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1 from classrooms c
      where c.id = classroom_id and c.school_id = get_my_school_id()
    )
  );
