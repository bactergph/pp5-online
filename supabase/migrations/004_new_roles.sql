-- ============================================================
-- Migration 004: New Role System
-- superadmin → district | homeroom → teacher + is_homeroom=true
-- + add principal, academic_head roles
-- ============================================================

-- 1. Add is_homeroom column
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_homeroom BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Migrate existing role values BEFORE changing constraint
UPDATE users SET role = 'district'                      WHERE role = 'superadmin';
UPDATE users SET role = 'teacher', is_homeroom = TRUE   WHERE role = 'homeroom';

-- 3. Drop old role constraint, add new one
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('district', 'admin', 'principal', 'academic_head', 'teacher'));

-- ============================================================
-- 4. Update helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_school_id()
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT school_id FROM public.users WHERE id = auth.uid()
$$;

-- ฟังก์ชันตรวจ role hierarchy (district > admin > principal > academic_head > teacher)
CREATE OR REPLACE FUNCTION has_role_at_least(min_role TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT CASE get_my_role()
    WHEN 'district'       THEN true
    WHEN 'admin'          THEN min_role IN ('admin','principal','academic_head','teacher')
    WHEN 'principal'      THEN min_role IN ('principal','academic_head','teacher')
    WHEN 'academic_head'  THEN min_role IN ('academic_head','teacher')
    WHEN 'teacher'        THEN min_role = 'teacher'
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION is_homeroom_teacher()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(is_homeroom, FALSE) FROM public.users WHERE id = auth.uid()
$$;

-- ============================================================
-- 5. Re-create RLS Policies (drop old ones first)
-- ============================================================

-- ---- users table ----
DROP POLICY IF EXISTS users_select ON users;
DROP POLICY IF EXISTS users_insert ON users;
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS users_delete ON users;

CREATE POLICY users_select ON users FOR SELECT USING (
  get_my_role() IN ('district')
  OR (get_my_role() IN ('admin','principal','academic_head') AND school_id = get_my_school_id())
  OR id = auth.uid()
);

CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (
  get_my_role() IN ('district', 'admin')
);

CREATE POLICY users_update ON users FOR UPDATE USING (
  get_my_role() = 'district'
  OR (get_my_role() = 'admin' AND school_id = get_my_school_id())
  OR (id = auth.uid() AND get_my_role() = 'teacher')  -- ครูแก้ข้อมูลตัวเองได้บางส่วน
);

-- ---- schools table ----
DROP POLICY IF EXISTS schools_select ON schools;
DROP POLICY IF EXISTS schools_insert ON schools;
DROP POLICY IF EXISTS schools_update ON schools;
DROP POLICY IF EXISTS schools_delete ON schools;

CREATE POLICY schools_select ON schools FOR SELECT USING (
  get_my_role() = 'district'
  OR id = get_my_school_id()
);

CREATE POLICY schools_insert ON schools FOR INSERT WITH CHECK (
  get_my_role() = 'district'
);

CREATE POLICY schools_update ON schools FOR UPDATE USING (
  get_my_role() = 'district'
  OR (get_my_role() = 'admin' AND id = get_my_school_id())
);

-- ---- academic_years table ----
DROP POLICY IF EXISTS academic_years_select ON academic_years;
DROP POLICY IF EXISTS academic_years_insert ON academic_years;
DROP POLICY IF EXISTS academic_years_update ON academic_years;

CREATE POLICY academic_years_select ON academic_years FOR SELECT USING (
  school_id = get_my_school_id() OR get_my_role() = 'district'
);
CREATE POLICY academic_years_insert ON academic_years FOR INSERT WITH CHECK (
  get_my_role() IN ('district','admin') AND school_id = get_my_school_id()
);
CREATE POLICY academic_years_update ON academic_years FOR UPDATE USING (
  get_my_role() IN ('district','admin')
);

-- ---- holidays table ----
DROP POLICY IF EXISTS holidays_select ON holidays;
DROP POLICY IF EXISTS holidays_insert ON holidays;
DROP POLICY IF EXISTS holidays_delete ON holidays;

CREATE POLICY holidays_select ON holidays FOR SELECT USING (
  EXISTS (SELECT 1 FROM academic_years ay WHERE ay.id = academic_year_id AND (ay.school_id = get_my_school_id() OR get_my_role() = 'district'))
);
CREATE POLICY holidays_insert ON holidays FOR INSERT WITH CHECK (
  get_my_role() IN ('district','admin')
);
CREATE POLICY holidays_delete ON holidays FOR DELETE USING (
  get_my_role() IN ('district','admin')
);

-- ---- classrooms table ----
DROP POLICY IF EXISTS classrooms_select ON classrooms;
DROP POLICY IF EXISTS classrooms_insert ON classrooms;
DROP POLICY IF EXISTS classrooms_update ON classrooms;
DROP POLICY IF EXISTS classrooms_delete ON classrooms;

CREATE POLICY classrooms_select ON classrooms FOR SELECT USING (
  get_my_role() = 'district'
  OR school_id = get_my_school_id()
);
CREATE POLICY classrooms_insert ON classrooms FOR INSERT WITH CHECK (
  get_my_role() IN ('district','admin') AND school_id = get_my_school_id()
);
CREATE POLICY classrooms_update ON classrooms FOR UPDATE USING (
  get_my_role() IN ('district','admin')
);
CREATE POLICY classrooms_delete ON classrooms FOR DELETE USING (
  get_my_role() IN ('district','admin')
);

-- ---- subjects table ----
DROP POLICY IF EXISTS subjects_select ON subjects;
DROP POLICY IF EXISTS subjects_insert ON subjects;
DROP POLICY IF EXISTS subjects_update ON subjects;

CREATE POLICY subjects_select ON subjects FOR SELECT USING (
  get_my_role() = 'district' OR school_id = get_my_school_id()
);
CREATE POLICY subjects_insert ON subjects FOR INSERT WITH CHECK (
  get_my_role() IN ('district','admin')
);
CREATE POLICY subjects_update ON subjects FOR UPDATE USING (
  get_my_role() IN ('district','admin')
);

-- ---- teacher_permissions table ----
DROP POLICY IF EXISTS teacher_permissions_select ON teacher_permissions;
DROP POLICY IF EXISTS teacher_permissions_insert ON teacher_permissions;
DROP POLICY IF EXISTS teacher_permissions_delete ON teacher_permissions;

CREATE POLICY teacher_permissions_select ON teacher_permissions FOR SELECT USING (
  get_my_role() IN ('district','admin','principal','academic_head')
  OR teacher_id = auth.uid()
);
CREATE POLICY teacher_permissions_insert ON teacher_permissions FOR INSERT WITH CHECK (
  get_my_role() IN ('district','admin')
);
CREATE POLICY teacher_permissions_delete ON teacher_permissions FOR DELETE USING (
  get_my_role() IN ('district','admin')
);

-- ---- students table ----
DROP POLICY IF EXISTS students_select ON students;
DROP POLICY IF EXISTS students_insert ON students;
DROP POLICY IF EXISTS students_update ON students;

CREATE POLICY students_select ON students FOR SELECT USING (
  get_my_role() IN ('district','admin','principal','academic_head')
  OR is_homeroom_teacher()
  OR EXISTS (
    SELECT 1 FROM teacher_permissions tp
    WHERE tp.teacher_id = auth.uid() AND tp.classroom_id = students.classroom_id
  )
);
CREATE POLICY students_insert ON students FOR INSERT WITH CHECK (
  get_my_role() IN ('district','admin')
);
CREATE POLICY students_update ON students FOR UPDATE USING (
  get_my_role() IN ('district','admin')
);

-- ---- scores table ----
DROP POLICY IF EXISTS scores_select ON scores;
DROP POLICY IF EXISTS scores_insert ON scores;
DROP POLICY IF EXISTS scores_update ON scores;
DROP POLICY IF EXISTS scores_delete ON scores;

-- ดูคะแนน: admin/principal/academic_head ดูทั้งโรงเรียน, ครูดูเฉพาะวิชาตัวเอง
CREATE POLICY scores_select ON scores FOR SELECT USING (
  get_my_role() IN ('district')
  OR (get_my_role() IN ('admin','principal','academic_head') AND EXISTS (
    SELECT 1 FROM class_subjects cs JOIN classrooms c ON cs.classroom_id = c.id
    WHERE cs.id = scores.class_subject_id AND c.school_id = get_my_school_id()
  ))
  OR EXISTS (
    SELECT 1 FROM teacher_permissions tp
    JOIN class_subjects cs ON tp.classroom_id = cs.classroom_id AND tp.subject_id = cs.subject_id
    WHERE tp.teacher_id = auth.uid() AND cs.id = scores.class_subject_id
  )
);

-- แก้คะแนน: admin และ academic_head แก้ได้ทั้งโรงเรียน, ครูแก้ได้เฉพาะวิชาตัวเอง
CREATE POLICY scores_insert ON scores FOR INSERT WITH CHECK (
  get_my_role() IN ('district','admin','academic_head')
  OR (get_my_role() = 'teacher' AND EXISTS (
    SELECT 1 FROM teacher_permissions tp
    JOIN class_subjects cs ON tp.classroom_id = cs.classroom_id AND tp.subject_id = cs.subject_id
    WHERE tp.teacher_id = auth.uid() AND cs.id = scores.class_subject_id
  ))
);

CREATE POLICY scores_update ON scores FOR UPDATE USING (
  get_my_role() IN ('district','admin','academic_head')
  OR (get_my_role() = 'teacher' AND EXISTS (
    SELECT 1 FROM teacher_permissions tp
    JOIN class_subjects cs ON tp.classroom_id = cs.classroom_id AND tp.subject_id = cs.subject_id
    WHERE tp.teacher_id = auth.uid() AND cs.id = scores.class_subject_id
  ))
);

CREATE POLICY scores_delete ON scores FOR DELETE USING (
  get_my_role() IN ('district','admin','academic_head')
);
