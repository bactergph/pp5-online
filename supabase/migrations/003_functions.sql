-- ============================================================
-- 003_functions.sql
-- Functions และ Triggers สำหรับระบบ
-- ============================================================

-- ============================================================
-- Function: คำนวณเกรด 8 ระดับ อัตโนมัติ
-- ============================================================
create or replace function calculate_grade(total_score numeric)
returns numeric language plpgsql as $$
begin
  if total_score is null then return null; end if;
  if total_score >= 80 then return 4.0;
  elsif total_score >= 75 then return 3.5;
  elsif total_score >= 70 then return 3.0;
  elsif total_score >= 65 then return 2.5;
  elsif total_score >= 60 then return 2.0;
  elsif total_score >= 55 then return 1.5;
  elsif total_score >= 50 then return 1.0;
  else return 0.0;
  end if;
end;
$$;

-- ============================================================
-- Function: อัปเดต updated_at อัตโนมัติ
-- ============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scores_updated_at
  before update on scores
  for each row execute function update_updated_at();

create trigger approval_signatures_updated_at
  before update on approval_signatures
  for each row execute function update_updated_at();

-- ============================================================
-- Function: สร้าง user profile อัตโนมัติเมื่อสมัคร Supabase Auth
-- ============================================================
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  -- สร้าง record ใน users table เมื่อมี user ใหม่จาก Supabase Auth
  insert into users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'teacher')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ============================================================
-- Function: ตรวจสอบ role ของ user
-- ============================================================
create or replace function is_admin_or_higher()
returns boolean language sql security definer stable as $$
  select get_my_role() in ('superadmin', 'admin')
$$;

-- ============================================================
-- Function: ดึงสรุปการมาเรียนของนักเรียนรายเดือน
-- ============================================================
create or replace function get_attendance_summary(
  p_classroom_id uuid,
  p_year_be integer,
  p_term integer
)
returns table (
  student_id uuid,
  student_number integer,
  first_name text,
  last_name text,
  total_days integer,
  present integer,
  sick_leave integer,
  personal_leave integer,
  absent integer
) language sql security definer stable as $$
  with term_dates as (
    select
      case when p_term = 1 then ay.term1_start_date else ay.term2_start_date end as start_date,
      case when p_term = 1 then ay.term1_end_date else ay.term2_end_date end as end_date
    from academic_years ay
      join classrooms c on c.academic_year_id = ay.id
    where c.id = p_classroom_id and ay.year_be = p_year_be
    limit 1
  )
  select
    s.id,
    s.student_number,
    s.first_name,
    s.last_name,
    count(da.id)::integer as total_days,
    count(case when da.status = 'ม' then 1 end)::integer as present,
    count(case when da.status = 'ป' then 1 end)::integer as sick_leave,
    count(case when da.status = 'ล' then 1 end)::integer as personal_leave,
    count(case when da.status = 'ข' then 1 end)::integer as absent
  from students s
    left join daily_attendance da on da.student_id = s.id
      and da.date between (select start_date from term_dates)
                      and (select end_date from term_dates)
  where s.classroom_id = p_classroom_id
  group by s.id, s.student_number, s.first_name, s.last_name
  order by s.student_number;
$$;
