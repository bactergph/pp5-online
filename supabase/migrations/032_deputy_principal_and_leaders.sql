-- บทบาทรองผู้อำนวยการ + ผูกผู้บริหารกับ users + ผู้รักษาการแบบ user id

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('district', 'admin', 'principal', 'deputy_principal', 'academic_head', 'teacher'));

alter table schools add column if not exists director_user_id uuid references users(id) on delete set null;
alter table schools add column if not exists vice_director_user_id uuid references users(id) on delete set null;
alter table schools add column if not exists acting_director_user_id uuid references users(id) on delete set null;
alter table schools add column if not exists academic_head_user_id uuid references users(id) on delete set null;
alter table schools add column if not exists measurement_head_user_id uuid references users(id) on delete set null;

create or replace function has_role_at_least(min_role text)
returns boolean language sql security definer stable as $$
  select case get_my_role()
    when 'district' then true
    when 'admin' then min_role in ('admin', 'principal', 'deputy_principal', 'academic_head', 'teacher')
    when 'principal' then min_role in ('principal', 'deputy_principal', 'academic_head', 'teacher')
    when 'deputy_principal' then min_role in ('deputy_principal', 'academic_head', 'teacher')
    when 'academic_head' then min_role in ('academic_head', 'deputy_principal', 'teacher')
    when 'teacher' then min_role = 'teacher'
    else false
  end
$$;

-- ทดสอบ: สร้างบุคลากร role deputy_principal ผ่านเมนูข้อมูลบุคลากร
-- ตั้ง username เช่น rongporo รหัสผ่านตั้งผ่าน admin (แนะนำ Test@1234)
