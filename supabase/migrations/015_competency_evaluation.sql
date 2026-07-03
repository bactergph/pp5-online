-- 19. สมรรถนะสำคัญของผู้เรียน 5 ด้าน
create table if not exists competency_evaluation (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references students(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  term integer not null check (term in (1, 2)),
  competency1_score integer default 0 check (competency1_score between 0 and 3), -- ความสามารถในการสื่อสาร
  competency2_score integer default 0 check (competency2_score between 0 and 3), -- ความสามารถในการคิด
  competency3_score integer default 0 check (competency3_score between 0 and 3), -- ความสามารถในการแก้ปัญหา
  competency4_score integer default 0 check (competency4_score between 0 and 3), -- ความสามารถในการใช้ทักษะชีวิต
  competency5_score integer default 0 check (competency5_score between 0 and 3), -- ความสามารถในการใช้เทคโนโลยี
  total_score integer default 0,
  result_level text,
  created_at timestamptz default now(),
  unique(student_id, academic_year_id, term)
);

alter table competency_evaluation enable row level security;

drop policy if exists "competency_evaluation_all" on competency_evaluation;
create policy "competency_evaluation_all" on competency_evaluation for all
  using (
    get_my_role() = 'superadmin' or
    exists (
      select 1
      from students s
      join classrooms c on c.id = s.classroom_id
      where s.id = competency_evaluation.student_id
      and c.school_id = get_my_school_id()
    )
  )
  with check (
    get_my_role() = 'superadmin' or
    exists (
      select 1
      from students s
      join classrooms c on c.id = s.classroom_id
      where s.id = competency_evaluation.student_id
      and c.school_id = get_my_school_id()
    )
  );
