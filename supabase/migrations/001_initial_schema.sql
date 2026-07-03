-- ============================================================
-- 001_initial_schema.sql
-- สร้างตารางหลักทั้งหมดสำหรับระบบ ปพ.5 ออนไลน์
-- ============================================================

-- เปิดใช้งาน extension uuid
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. โรงเรียน
-- ============================================================
create table schools (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  department text,              -- สังกัดกระทรวง
  area_office text,             -- สำนักงานเขตพื้นที่การศึกษา
  district text,                -- อำเภอ
  province text,                -- จังหวัด
  address text,
  phone text,
  document_prefix text,         -- คำนำหน้าเลขหนังสือ เช่น ศธ 04153/
  director_name text,           -- ผู้อำนวยการ
  vice_director_name text,      -- รองผู้อำนวยการ
  acting_director text,         -- ผู้รักษาการ
  academic_head_name text,      -- หัวหน้าฝ่ายวิชาการ
  measurement_head_name text,   -- หัวหน้างานวัดและประเมินผล
  logo_url text,
  stamp_url text,
  created_at timestamptz default now()
);

-- ============================================================
-- 2. ปีการศึกษา
-- ============================================================
create table academic_years (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  year_be integer not null,       -- ปีการศึกษา พ.ศ. เช่น 2567
  term1_start_date date,          -- เปิดเรียนเทอม 1
  term1_end_date date,            -- ปิดเรียนเทอม 1
  term2_start_date date,          -- เปิดเรียนเทอม 2
  term2_end_date date,            -- ปิดเรียนเทอม 2
  is_active boolean default false, -- ปีการศึกษาที่ใช้งานอยู่
  created_at timestamptz default now()
);

-- ============================================================
-- 3. วันหยุด
-- ============================================================
create table holidays (
  id uuid primary key default uuid_generate_v4(),
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  date date not null,
  name text not null,   -- ชื่อวันหยุด เช่น "วันวิสาขบูชา"
  created_at timestamptz default now()
);

-- ============================================================
-- 4. ผู้ใช้งาน (เชื่อมกับ Supabase Auth)
-- ============================================================
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid references schools(id) on delete set null,
  username text unique,
  email text,
  prefix text,          -- นาย/นาง/นางสาว
  full_name text not null,
  position text,        -- ตำแหน่ง
  role text not null default 'teacher',  -- superadmin/admin/teacher/homeroom
  signature_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ชื่อ role ที่อนุญาต
alter table users add constraint users_role_check
  check (role in ('superadmin', 'admin', 'teacher', 'homeroom'));

-- ============================================================
-- 5. ชั้นเรียน
-- ============================================================
create table classrooms (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  level text not null,                -- ป.1 - ป.6
  room integer not null default 1,    -- ห้อง 1, 2, 3, ...
  homeroom_teacher_id uuid references users(id) on delete set null,
  homeroom_teacher2_id uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  unique(academic_year_id, level, room)
);

-- ============================================================
-- 6. คาบสอนต่อสัปดาห์ (กำหนดต่อห้องเรียน)
-- ============================================================
create table period_config (
  id uuid primary key default uuid_generate_v4(),
  classroom_id uuid not null references classrooms(id) on delete cascade unique,
  mon_hours integer default 0,
  tue_hours integer default 0,
  wed_hours integer default 0,
  thu_hours integer default 0,
  fri_hours integer default 0,
  sat_hours integer default 0,
  sun_hours integer default 0
);

-- ============================================================
-- 7. รายวิชา
-- ============================================================
create table subjects (
  id uuid primary key default uuid_generate_v4(),
  school_id uuid not null references schools(id) on delete cascade,
  code text not null,           -- รหัสวิชา 6 หลัก เช่น ท12101
  name text not null,           -- ชื่อวิชา
  short_name text,              -- ชื่อย่อ
  subject_group text not null,  -- กลุ่มสาระ 8 กลุ่ม
  type text not null default 'พื้นฐาน',  -- พื้นฐาน/เพิ่มเติม
  hours_per_year integer default 0,
  credits numeric(4,1) default 0,
  max_score integer default 100,
  created_at timestamptz default now(),
  unique(school_id, code)
);

-- กลุ่มสาระที่อนุญาต
alter table subjects add constraint subjects_group_check
  check (subject_group in (
    'ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี',
    'สังคมศึกษา ศาสนา และวัฒนธรรม', 'สุขศึกษาและพลศึกษา',
    'ศิลปะ', 'การงานอาชีพ', 'ภาษาต่างประเทศ'
  ));

-- ============================================================
-- 8. สิทธิ์ครูสอนวิชาใด
-- ============================================================
create table teacher_permissions (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references users(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  subject_id uuid references subjects(id) on delete cascade,
  created_at timestamptz default now(),
  unique(teacher_id, classroom_id, subject_id)
);

-- ============================================================
-- 9. นักเรียน
-- ============================================================
create table students (
  id uuid primary key default uuid_generate_v4(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  student_number integer not null,   -- เลขที่ในห้อง
  student_code text,                 -- เลขประจำตัวนักเรียน
  national_id text,                  -- เลขบัตรประชาชน 13 หลัก
  prefix text,                       -- เด็กชาย/เด็กหญิง/นาย/นางสาว
  first_name text not null,
  last_name text not null,
  gender text not null check (gender in ('M', 'F')),
  birth_date date,
  address text,
  google_maps_url text,
  photo_url text,
  status text not null default 'เรียน'
    check (status in ('เรียน', 'ย้ายเข้า', 'ย้ายออก', 'ไม่เลื่อนชั้น')),
  transfer_in_date date,
  transfer_out_date date,
  created_at timestamptz default now(),
  unique(classroom_id, student_number)
);

-- ============================================================
-- 10. วิชาที่เปิดสอนในแต่ละห้อง
-- ============================================================
create table class_subjects (
  id uuid primary key default uuid_generate_v4(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid references users(id) on delete set null,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  order_number integer default 0,    -- ลำดับการแสดง
  created_at timestamptz default now(),
  unique(classroom_id, subject_id, academic_year_id)
);

-- ============================================================
-- 11. สัดส่วนคะแนน
-- ============================================================
create table score_configs (
  id uuid primary key default uuid_generate_v4(),
  class_subject_id uuid not null references class_subjects(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  unit_count integer default 1,          -- จำนวนหน่วยระหว่างเรียน
  between_scores jsonb default '[]',     -- array ของคะแนนเต็มระหว่างเรียนแต่ละหน่วย
  midterm_max integer default 30,        -- คะแนนเต็มกลางภาค
  final_max integer default 30,          -- คะแนนเต็มปลายภาค
  total_max integer default 100,         -- คะแนนเต็มรวม (50 หรือ 100)
  created_at timestamptz default now(),
  unique(class_subject_id, term)
);

-- ============================================================
-- 12. คะแนนนักเรียน
-- ============================================================
create table scores (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  class_subject_id uuid not null references class_subjects(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  unit_scores jsonb default '{}',       -- {"1": 18, "2": 20, ...}
  between_total numeric(6,2) default 0, -- คะแนนรวมระหว่างเรียน
  midterm_score numeric(6,2),           -- คะแนนกลางภาค
  final_score numeric(6,2),             -- คะแนนปลายภาค
  term_total numeric(6,2) default 0,    -- คะแนนรวมรายเทอม
  year_total numeric(6,2) default 0,    -- คะแนนรวมทั้งปี
  grade numeric(3,1),                   -- เกรด 0/1/1.5/2/2.5/3/3.5/4
  result text default 'เรียน',          -- เรียน/ร/มส/มผ
  locked boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, class_subject_id, term)
);

-- ============================================================
-- 13. เวลาเรียนรายวัน (ธุรการชั้นเรียน)
-- ============================================================
create table daily_attendance (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  date date not null,
  status text not null check (status in ('ม', 'ป', 'ล', 'ข')),
  -- ม=มา, ป=ลาป่วย, ล=ลากิจ, ข=ขาด
  recorded_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  unique(student_id, date)
);

-- ============================================================
-- 14. เวลาเรียนรายชั่วโมง (ปพ.5 รายวิชา)
-- ============================================================
create table hourly_attendance (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  class_subject_id uuid not null references class_subjects(id) on delete cascade,
  date date not null,
  hour_number integer not null,    -- คาบที่
  week_number integer not null,    -- สัปดาห์ที่ (1-23)
  term integer not null check (term in (1, 2)),
  status text not null check (status in ('/', 'ข', 'ล', 'ป')),
  -- /=มา, ข=ขาด, ล=ลากิจ, ป=ลาป่วย
  recorded_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  unique(student_id, class_subject_id, date, hour_number)
);

-- ============================================================
-- 15. สุขภาพนักเรียน (น้ำหนัก/ส่วนสูง รายเดือน 12 เดือน)
-- ============================================================
create table student_health (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  month integer not null check (month between 1 and 12),   -- 1=ม.ค., 5=พ.ค., ...
  measured_date date,
  weight numeric(5,2),        -- น้ำหนัก กก.
  height numeric(5,2),        -- ส่วนสูง ซม.
  bmi numeric(5,2),           -- ดัชนีมวลกาย
  bmi_result text,            -- ผอมมาก/ผอม/สมส่วน/ท้วม/อ้วน
  height_result text,         -- เตี้ย/ค่อนข้างเตี้ย/ตามเกณฑ์/ค่อนข้างสูง/สูง
  created_at timestamptz default now(),
  unique(student_id, academic_year_id, month)
);

-- ============================================================
-- 15.1 ตรวจสุขภาพรายเดือน 7 รายการ
-- ============================================================
create table health_inspection (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  month integer not null check (month between 1 and 12),
  nails text default 'ผ่าน',    -- เล็บ
  hair text default 'ผ่าน',     -- ผม
  ears text default 'ผ่าน',     -- หู
  nose text default 'ผ่าน',     -- จมูก
  teeth text default 'ผ่าน',    -- ฟัน
  skin text default 'ผ่าน',     -- ผิวหนัง
  clothes text default 'ผ่าน',  -- เสื้อผ้า
  inspected_date date,
  created_at timestamptz default now(),
  unique(student_id, academic_year_id, term, month)
);

-- ============================================================
-- 15.2 กิจวัตรประจำวัน 5 ประเภท
-- ============================================================
create table daily_activities (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  date date not null,
  term integer not null check (term in (1, 2)),
  activity_type text not null check (activity_type in (
    'saving', 'milk', 'cleaning', 'brushing', 'lunch'
  )),
  value numeric(10,2) default 0,  -- 1=ทำ, 0=ไม่ทำ, จำนวนเงิน (กรณีออม)
  recorded_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  unique(student_id, date, activity_type)
);

-- ============================================================
-- 16. คุณลักษณะอันพึงประสงค์ 8 ข้อ
-- ============================================================
create table character_traits (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  trait1_score integer default 0 check (trait1_score between 0 and 3),  -- รักชาติ ศาสน์ กษัตริย์
  trait2_score integer default 0 check (trait2_score between 0 and 3),  -- ซื่อสัตย์สุจริต
  trait3_score integer default 0 check (trait3_score between 0 and 3),  -- มีวินัย
  trait4_score integer default 0 check (trait4_score between 0 and 3),  -- ใฝ่เรียนรู้
  trait5_score integer default 0 check (trait5_score between 0 and 3),  -- อยู่อย่างพอเพียง
  trait6_score integer default 0 check (trait6_score between 0 and 3),  -- มุ่งมั่นในการทำงาน
  trait7_score integer default 0 check (trait7_score between 0 and 3),  -- รักความเป็นไทย
  trait8_score integer default 0 check (trait8_score between 0 and 3),  -- มีจิตสาธารณะ
  total_score integer default 0,
  percentage numeric(5,2) default 0,
  result_level text,   -- ไม่ผ่าน/ผ่าน/ดี/ดีเยี่ยม
  created_at timestamptz default now(),
  unique(student_id, academic_year_id, term)
);

-- ============================================================
-- 17. การอ่าน คิด วิเคราะห์ และเขียน
-- ============================================================
create table reading_evaluation (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  evaluation_level text,        -- "1-3" หรือ "4-6" (ชั้น ป.)
  reading_1_1 integer default 0 check (reading_1_1 between 0 and 3),
  reading_1_2 integer default 0 check (reading_1_2 between 0 and 3),
  thinking_2_1 integer default 0 check (thinking_2_1 between 0 and 3),
  thinking_2_2 integer default 0 check (thinking_2_2 between 0 and 3),
  writing_3_1 integer default 0 check (writing_3_1 between 0 and 3),
  total_score integer default 0,
  result_level text,            -- ไม่ผ่าน/ผ่าน/ดี/ดีเยี่ยม
  created_at timestamptz default now(),
  unique(student_id, academic_year_id, term)
);

-- ============================================================
-- 18. กิจกรรมพัฒนาผู้เรียน
-- ============================================================
create table activities_evaluation (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  guidance_result text,         -- แนะแนว: ผ่าน/ไม่ผ่าน
  scout_result text,            -- ลูกเสือ/ยุวกาชาด: ผ่าน/ไม่ผ่าน
  club_result text,             -- ชุมนุม/ชมรม: ผ่าน/ไม่ผ่าน
  club_name text,               -- ชื่อชุมนุม
  public_service_result text,   -- จิตอาสา/บำเพ็ญประโยชน์: ผ่าน/ไม่ผ่าน
  overall_result text,          -- สรุปผล: ผ่าน/ไม่ผ่าน
  created_at timestamptz default now(),
  unique(student_id, academic_year_id)
);

-- ============================================================
-- 19. การลงนามอนุมัติ 6 ระดับ
-- ============================================================
create table approval_signatures (
  id uuid primary key default uuid_generate_v4(),
  class_subject_id uuid not null references class_subjects(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  -- ระดับที่ 1: ครูผู้สอน
  teacher_signed_at timestamptz,
  teacher_id uuid references users(id) on delete set null,
  -- ระดับที่ 2: หัวหน้ากลุ่มสาระ
  subject_head_signed_at timestamptz,
  subject_head_id uuid references users(id) on delete set null,
  -- ระดับที่ 3: หัวหน้างานวัดผล
  measurement_head_signed_at timestamptz,
  measurement_head_id uuid references users(id) on delete set null,
  -- ระดับที่ 4: หัวหน้าฝ่ายวิชาการ
  academic_head_signed_at timestamptz,
  academic_head_id uuid references users(id) on delete set null,
  -- ระดับที่ 5: รองผู้อำนวยการ
  vice_director_signed_at timestamptz,
  vice_director_id uuid references users(id) on delete set null,
  -- ระดับที่ 6: ผู้อำนวยการ
  director_signed_at timestamptz,
  director_id uuid references users(id) on delete set null,
  director_decision text,       -- อนุมัติ/ไม่อนุมัติ
  status text not null default 'draft',  -- draft/submitted/approved/rejected
  rejection_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(class_subject_id, term)
);

-- ============================================================
-- 20. ความเห็นครูประจำชั้น (ปพ.6)
-- ============================================================
create table teacher_comments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  comment_text text,
  homeroom_teacher_id uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  unique(student_id, academic_year_id, term)
);

-- ============================================================
-- 21. เกณฑ์ BMI (Seed data)
-- ============================================================
create table bmi_criteria (
  id uuid primary key default uuid_generate_v4(),
  age integer not null,
  gender text not null check (gender in ('M', 'F')),
  too_thin_max numeric(5,2),    -- ผอมมาก ≤ ค่านี้
  thin_max numeric(5,2),        -- ผอม ≤ ค่านี้
  normal_max numeric(5,2),      -- สมส่วน ≤ ค่านี้
  chubby_max numeric(5,2),      -- ท้วม ≤ ค่านี้
  fat_min numeric(5,2),         -- อ้วน > ค่านี้
  unique(age, gender)
);

-- ============================================================
-- 22. เกณฑ์ส่วนสูง (Seed data)
-- ============================================================
create table height_criteria (
  id uuid primary key default uuid_generate_v4(),
  age integer not null,
  gender text not null check (gender in ('M', 'F')),
  short_max numeric(5,2),           -- เตี้ย ≤ ค่านี้
  somewhat_short_max numeric(5,2),  -- ค่อนข้างเตี้ย ≤ ค่านี้
  normal_max numeric(5,2),          -- ตามเกณฑ์ ≤ ค่านี้
  somewhat_tall_max numeric(5,2),   -- ค่อนข้างสูง ≤ ค่านี้
  tall_min numeric(5,2),            -- สูง > ค่านี้
  unique(age, gender)
);

-- ============================================================
-- 23. ตัวชี้วัดตามหลักสูตร (Seed data)
-- ============================================================
create table curriculum_indicators (
  id uuid primary key default uuid_generate_v4(),
  subject_group text not null,
  level text not null,           -- ป.1-ป.6
  indicator_code text not null,  -- เช่น ท 1.1.1
  standard text,                 -- มาตรฐานการเรียนรู้
  description text,              -- ตัวชี้วัด
  unique(subject_group, level, indicator_code)
);

-- ============================================================
-- 24. การแจ้งเตือน
-- ============================================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  type text,
  title text not null,
  message text,
  link text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- Indexes สำหรับประสิทธิภาพ
-- ============================================================
create index idx_students_classroom on students(classroom_id);
create index idx_scores_student on scores(student_id);
create index idx_scores_class_subject on scores(class_subject_id);
create index idx_daily_attendance_student on daily_attendance(student_id, date);
create index idx_hourly_attendance_student on hourly_attendance(student_id);
create index idx_notifications_user on notifications(user_id, is_read);
create index idx_classrooms_school_year on classrooms(school_id, academic_year_id);
