begin;
create or replace function public.delete_school_subjects(p_school_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  if p_school_id is null then raise exception 'กรุณาเลือกโรงเรียน'; end if;
  -- Lock parents before checking children: concurrent FK inserts must wait.
  perform id from public.subjects where school_id = p_school_id for update;
  if exists (select 1 from public.class_subjects c join public.subjects s on s.id = c.subject_id where s.school_id = p_school_id) then
    raise exception 'ลบทั้งหมดไม่ได้ มีรายวิชาที่เปิดสอนอยู่ กรุณาจัดการวิชาที่เปิดสอนก่อน ข้อมูลยังไม่ถูกลบ';
  end if;
  if exists (select 1 from public.teacher_permissions t join public.subjects s on s.id = t.subject_id where s.school_id = p_school_id) then
    raise exception 'ลบทั้งหมดไม่ได้ มีรายวิชาที่กำหนดสิทธิ์ครูอยู่ กรุณาจัดการสิทธิ์ครูก่อน ข้อมูลยังไม่ถูกลบ';
  end if;
  delete from public.subjects where school_id = p_school_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.delete_school_subjects(uuid) from public, anon, authenticated;
grant execute on function public.delete_school_subjects(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
