-- School-managed subject groups. Existing canonical groups are copied per school.
create table if not exists public.school_subject_groups (
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_id, name),
  check (length(btrim(name)) between 1 and 80)
);

create unique index if not exists school_subject_groups_name_ci
  on public.school_subject_groups (school_id, lower(name));

alter table public.subjects drop constraint if exists subjects_group_check;
alter table public.subject_group_heads drop constraint if exists subject_group_heads_subject_group_check;

insert into public.school_subject_groups (school_id, name)
select s.id, g.name
from public.schools s
cross join (values
  ('ภาษาไทย'), ('คณิตศาสตร์'), ('วิทยาศาสตร์และเทคโนโลยี'),
  ('สังคมศึกษา ศาสนา และวัฒนธรรม'), ('สุขศึกษาและพลศึกษา'),
  ('ศิลปะ'), ('การงานอาชีพ'), ('ภาษาต่างประเทศ')
) as g(name)
on conflict (school_id, name) do nothing;

create or replace function public.seed_school_subject_groups()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.school_subject_groups (school_id, name)
  values
    (new.id, 'ภาษาไทย'), (new.id, 'คณิตศาสตร์'),
    (new.id, 'วิทยาศาสตร์และเทคโนโลยี'), (new.id, 'สังคมศึกษา ศาสนา และวัฒนธรรม'),
    (new.id, 'สุขศึกษาและพลศึกษา'), (new.id, 'ศิลปะ'),
    (new.id, 'การงานอาชีพ'), (new.id, 'ภาษาต่างประเทศ')
  on conflict (school_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists schools_seed_subject_groups on public.schools;
create trigger schools_seed_subject_groups after insert on public.schools
for each row execute function public.seed_school_subject_groups();

create or replace function public.validate_subject_school_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(btrim(new.subject_group), '') <> '' and not exists (
    select 1 from public.school_subject_groups
    where school_id = new.school_id and name = btrim(new.subject_group)
    for key share
  ) then
    raise exception 'กลุ่มสาระนี้ไม่มีในรายการของโรงเรียน กรุณาเลือกกลุ่มสาระที่ตั้งค่าไว้';
  end if;
  return new;
end;
$$;

drop trigger if exists subjects_validate_school_group on public.subjects;
create trigger subjects_validate_school_group before insert or update of school_id, subject_group on public.subjects
for each row execute function public.validate_subject_school_group();

alter table public.school_subject_groups enable row level security;
drop policy if exists school_subject_groups_select on public.school_subject_groups;
create policy school_subject_groups_select on public.school_subject_groups for select
  using (school_id = public.get_my_school_id() or public.get_my_role() = 'superadmin');

create or replace function public.manage_school_subject_group(
  p_school_id uuid,
  p_action text,
  p_name text,
  p_new_name text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  old_name text := btrim(coalesce(p_name, ''));
  new_name text := btrim(coalesce(p_new_name, p_name, ''));
  used_count integer := 0;
begin
  if p_school_id is null or p_action is null or p_action not in ('add', 'rename', 'delete') then
    return jsonb_build_object('error', 'ข้อมูลกลุ่มสาระไม่ถูกต้อง');
  end if;
  if old_name = '' or length(old_name) > 80 then
    return jsonb_build_object('error', 'ชื่อกลุ่มสาระต้องมี 1–80 ตัวอักษร');
  end if;
  if p_action in ('add', 'rename') and (new_name = '' or length(new_name) > 80) then
    return jsonb_build_object('error', 'ชื่อกลุ่มสาระต้องมี 1–80 ตัวอักษร');
  end if;
  if not exists (select 1 from public.schools where id = p_school_id) then
    return jsonb_build_object('error', 'ไม่พบโรงเรียน');
  end if;

  if p_action = 'add' then
    if exists (select 1 from public.school_subject_groups where school_id = p_school_id and lower(name) = lower(new_name)) then
      return jsonb_build_object('error', 'มีกลุ่มสาระชื่อนี้แล้ว');
    end if;
    insert into public.school_subject_groups (school_id, name) values (p_school_id, new_name);
    return jsonb_build_object('ok', true, 'name', new_name);
  end if;

  perform 1 from public.school_subject_groups where school_id = p_school_id and name = old_name for update;
  if not found then
    return jsonb_build_object('error', 'ไม่พบกลุ่มสาระนี้ กรุณาโหลดหน้าใหม่');
  end if;

  if p_action = 'rename' then
    if exists (select 1 from public.school_subject_groups where school_id = p_school_id and lower(name) = lower(new_name) and name <> old_name) then
      return jsonb_build_object('error', 'มีกลุ่มสาระชื่อนี้แล้ว');
    end if;
    update public.school_subject_groups set name = new_name, updated_at = now()
      where school_id = p_school_id and name = old_name;
    update public.subjects set subject_group = new_name where school_id = p_school_id and subject_group = old_name;
    update public.subject_group_heads set subject_group = new_name, updated_at = now()
      where school_id = p_school_id and subject_group = old_name;
    return jsonb_build_object('ok', true, 'name', new_name);
  end if;

  select count(*) into used_count from public.subjects where school_id = p_school_id and subject_group = old_name;
  if used_count > 0 then
    return jsonb_build_object('error', format('ลบไม่ได้: มีกลุ่มสาระนี้ในรายวิชา %s รายการ กรุณาย้ายรายวิชาไปกลุ่มอื่นก่อน', used_count), 'used_count', used_count);
  end if;
  delete from public.subject_group_heads where school_id = p_school_id and subject_group = old_name;
  delete from public.school_subject_groups where school_id = p_school_id and name = old_name;
  return jsonb_build_object('ok', true, 'name', old_name);
end;
$$;

revoke all on function public.manage_school_subject_group(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.manage_school_subject_group(uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
