begin;
alter table public.class_subjects add column if not exists room_name text;
comment on column public.class_subjects.room_name is 'สถานที่เรียนเริ่มต้นของรายวิชาที่เปิดสอนในชั้นเรียน';
notify pgrst, 'reload schema';
commit;
