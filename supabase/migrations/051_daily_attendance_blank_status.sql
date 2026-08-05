-- Allow explicit blank cells in daily_attendance (distinct from no-row = present).
-- status '-' = ช่องว่างที่บันทึกแล้ว (ไม่นับเป็นมา)
-- ไม่มีแถว = มา (sparse default)

-- Drop any CHECK constraint on daily_attendance.status (name may vary by DB)
do $$
declare
  cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'daily_attendance'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.daily_attendance drop constraint %I', cname);
  end loop;
end $$;

alter table public.daily_attendance
  add constraint daily_attendance_status_check
  check (status in ('ม', 'ป', 'ล', 'ข', '-'));
