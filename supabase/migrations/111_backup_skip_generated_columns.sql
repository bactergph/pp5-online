-- activity_key is generated. Inserting the exported value raises
-- "cannot insert a non-DEFAULT value into column activity_key".

create or replace function public.backup_insert_rows(p_table text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
  cols text;
  allowed text[] := array[
    'classrooms','period_config','holidays','students','class_subjects','teacher_permissions',
    'score_configs','scores','daily_attendance','hourly_attendance','daily_activities',
    'student_health','health_inspection','character_traits','reading_evaluation',
    'activities_evaluation','competency_evaluation','evaluation_custom_scores','teacher_comments',
    'student_club_assignments','class_schedule_activities','class_schedule_slots','schedule_plans',
    'schedule_drafts','schedule_teacher_blocks','schedule_substitute_days','schedule_substitute_entries',
    'substitute_documents','class_document_approvals','document_approval_submissions',
    'approval_signatures','approved_document_exports','document_references','personal_homeroom_rooms',
    'subjects','subject_group_heads','school_subject_groups','school_period_times',
    'evaluation_settings','clubs','device_schedule_uploads','weekend_school_days'
  ];
begin
  if p_table <> all (allowed) then
    raise exception 'ตาราง % ไม่รองรับการนำเข้า', p_table;
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  if p_table = 'weekend_school_days' and to_regclass('public.weekend_school_days') is null then
    return 0;
  end if;
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into cols
  from pg_attribute a
  where a.attrelid = format('public.%I', p_table)::regclass
    and a.attnum > 0
    and not a.attisdropped
    and a.attgenerated = '';
  if cols is null then
    raise exception 'ตาราง % ไม่มีคอลัมน์สำหรับนำเข้า', p_table;
  end if;
  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
    p_table, cols, cols, p_table
  ) using p_rows;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.backup_insert_rows(text, jsonb) from public, anon, authenticated;
grant execute on function public.backup_insert_rows(text, jsonb) to service_role;
