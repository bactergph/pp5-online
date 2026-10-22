-- Catalog semester is independent of existing classroom offerings and student records.
-- Keep old rows null so their existing class_subjects semesters remain the fallback.
begin;
alter table public.subjects add column if not exists semester smallint;
alter table public.subjects drop constraint if exists subjects_semester_check;
alter table public.subjects add constraint subjects_semester_check check (semester in (0, 1, 2));
comment on column public.subjects.semester is 'ภาคเรียนของข้อมูลรายวิชา: 0 = ทั้งสองภาคเรียน, 1/2 = ภาคเรียน, null = อิงวิชาที่เปิดสอน';

-- Explicit, school-scoped backfill. Existing offerings and their records are untouched.
create or replace function public.set_missing_subject_semester_to_second(p_school_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  if p_school_id is null then raise exception 'กรุณาเลือกโรงเรียน'; end if;
  update public.subjects s set semester = 2
  where s.school_id = p_school_id and s.semester is null
    and not exists (select 1 from public.class_subjects cs where cs.subject_id = s.id and cs.semester in (0, 1, 2));
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.set_missing_subject_semester_to_second(uuid) from public, anon, authenticated;
grant execute on function public.set_missing_subject_semester_to_second(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
