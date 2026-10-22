-- Optional catalog grade. Codes such as ว20222 do not encode a grade.
alter table public.subjects add column if not exists level text;
alter table public.subjects drop constraint if exists subjects_level_check;
alter table public.subjects add constraint subjects_level_check
  check (
    level is null
    or level in (
      'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6',
      'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'
    )
  );
notify pgrst, 'reload schema';
