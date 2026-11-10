-- Import a school backup in short statements so PostgREST does not cancel the job.

create or replace function public.backup_set_restore_triggers(p_enable boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  verb text := case when p_enable then 'enable' else 'disable' end;
begin
  for rec in
    select c.relname as table_name, g.tgname as trigger_name
    from pg_trigger g
    join pg_class c on c.oid = g.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not g.tgisinternal
      and g.tgname in (
        'add_class_learner_development',
        'sync_manual_schedule_activity',
        'guard_score_entry_period',
        'schedule_preserve_closed_rooms',
        'joint_teaching_plan_guard',
        'joint_teaching_offering_guard',
        'guard_personal_homeroom_selection',
        'guard_personal_academic_data'
      )
  loop
    execute format('alter table public.%I %s trigger %I', rec.table_name, verb, rec.trigger_name);
  end loop;
end;
$$;

create or replace function public.backup_restore_prepare(p_school_id uuid, p_actor_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year uuid;
  v_year_be integer;
  v_rows jsonb;
begin
  if p_payload->>'format' is distinct from 'jarnsek-school-backup' or (p_payload->>'version')::int is distinct from 1 then
    raise exception 'ไฟล์นี้ไม่ใช่ข้อมูลสำรองของจารย์เสก';
  end if;
  if (p_payload#>>'{school,id}')::uuid is distinct from p_school_id then
    raise exception 'ไฟล์นี้เป็นของโรงเรียนอื่น';
  end if;
  if not exists (select 1 from schools where id = p_school_id) then
    raise exception 'ไม่พบโรงเรียน';
  end if;
  if not exists (select 1 from users where id = p_actor_id and school_id = p_school_id) then
    raise exception 'ไม่พบบัญชีผู้ทำรายการในโรงเรียนนี้';
  end if;
  v_year := (p_payload#>>'{academicYear,id}')::uuid;
  v_year_be := (p_payload#>>'{academicYear,yearBe}')::int;
  if v_year is null or (p_payload#>>'{data,academicYear,id}')::uuid is distinct from v_year
     or (p_payload#>>'{data,academicYear,year_be}')::int is distinct from v_year_be then
    raise exception 'รายละเอียดปีการศึกษาในไฟล์ไม่ตรงกัน';
  end if;
  if exists (select 1 from academic_years where id = v_year and school_id <> p_school_id) then
    raise exception 'รหัสปีการศึกษาเป็นของโรงเรียนอื่น';
  end if;
  if exists (select 1 from academic_years where school_id = p_school_id and year_be = v_year_be and id <> v_year) then
    raise exception 'ปีการศึกษานี้มีอยู่ในโรงเรียนแล้ว แต่เป็นคนละชุดข้อมูล';
  end if;

  perform public.backup_set_restore_triggers(false);
  v_rows := coalesce(p_payload#>'{data,users}', '[]'::jsonb);
  if exists (
    select 1 from jsonb_populate_recordset(null::users, v_rows) r
    join users u on u.id = r.id
    where u.school_id is distinct from p_school_id
  ) then
    raise exception 'มีบุคลากรในไฟล์ที่เป็นของโรงเรียนอื่น';
  end if;
  if exists (
    select 1 from jsonb_populate_recordset(null::users, v_rows) r
    where r.id is null or not exists (select 1 from users u where u.id = r.id and u.school_id = p_school_id)
  ) then
    raise exception 'มีบุคลากรในไฟล์ที่ยังไม่มีบัญชีในโรงเรียนนี้';
  end if;
  update users u set username = null
  from jsonb_populate_recordset(null::users, v_rows) r
  where u.id = r.id and u.school_id = p_school_id and u.id <> p_actor_id;
  update users u set
    prefix = r.prefix,
    full_name = r.full_name,
    position = r.position,
    role = case when u.id = p_actor_id then u.role else r.role end,
    username = case when u.id = p_actor_id then u.username else r.username end,
    email = case when u.id = p_actor_id then u.email else r.email end,
    signature_url = r.signature_url,
    is_active = case when u.id = p_actor_id then true else coalesce(r.is_active, false) end,
    is_homeroom = coalesce(r.is_homeroom, false),
    must_change_password = case when u.id = p_actor_id then u.must_change_password else coalesce(r.must_change_password, false) end
  from jsonb_populate_recordset(null::users, v_rows) r
  where u.id = r.id and u.school_id = p_school_id;

  update schools s set
    name = coalesce(nullif(btrim(p_payload#>>'{data,school,name}'), ''), s.name),
    department = p_payload#>>'{data,school,department}',
    area_office = p_payload#>>'{data,school,area_office}',
    district = p_payload#>>'{data,school,district}',
    province = p_payload#>>'{data,school,province}',
    address = p_payload#>>'{data,school,address}',
    phone = p_payload#>>'{data,school,phone}',
    document_prefix = p_payload#>>'{data,school,document_prefix}',
    director_name = p_payload#>>'{data,school,director_name}',
    vice_director_name = p_payload#>>'{data,school,vice_director_name}',
    acting_director = p_payload#>>'{data,school,acting_director}',
    academic_head_name = p_payload#>>'{data,school,academic_head_name}',
    measurement_head_name = p_payload#>>'{data,school,measurement_head_name}',
    logo_url = p_payload#>>'{data,school,logo_url}',
    stamp_url = p_payload#>>'{data,school,stamp_url}',
    program_name = p_payload#>>'{data,school,program_name}',
    acting_director_position = p_payload#>>'{data,school,acting_director_position}',
    education_type = coalesce(p_payload#>>'{data,school,education_type}', s.education_type),
    layout_tuner_enabled = coalesce((p_payload#>>'{data,school,layout_tuner_enabled}')::boolean, s.layout_tuner_enabled),
    director_user_id = (p_payload#>>'{data,school,director_user_id}')::uuid,
    vice_director_user_id = (p_payload#>>'{data,school,vice_director_user_id}')::uuid,
    acting_director_user_id = (p_payload#>>'{data,school,acting_director_user_id}')::uuid,
    academic_head_user_id = (p_payload#>>'{data,school,academic_head_user_id}')::uuid,
    measurement_head_user_id = (p_payload#>>'{data,school,measurement_head_user_id}')::uuid
  where s.id = p_school_id;
  if exists (
    select 1 from schools s
    where s.id = p_school_id and (
      (s.director_user_id is not null and not exists (select 1 from users u where u.id = s.director_user_id and u.school_id = p_school_id))
      or (s.vice_director_user_id is not null and not exists (select 1 from users u where u.id = s.vice_director_user_id and u.school_id = p_school_id))
      or (s.acting_director_user_id is not null and not exists (select 1 from users u where u.id = s.acting_director_user_id and u.school_id = p_school_id))
      or (s.academic_head_user_id is not null and not exists (select 1 from users u where u.id = s.academic_head_user_id and u.school_id = p_school_id))
      or (s.measurement_head_user_id is not null and not exists (select 1 from users u where u.id = s.measurement_head_user_id and u.school_id = p_school_id))
    )
  ) then
    raise exception 'ผู้บริหารในไฟล์ไม่ใช่บุคลากรของโรงเรียนนี้';
  end if;

  insert into academic_years (
    id, school_id, year_be, term1_start_date, term1_end_date, term2_start_date, term2_end_date,
    is_active, created_at, term1_scores_open, term2_scores_open
  )
  select
    r.id, p_school_id, r.year_be, r.term1_start_date, r.term1_end_date, r.term2_start_date, r.term2_end_date,
    false, coalesce(r.created_at, now()), coalesce(r.term1_scores_open, true), coalesce(r.term2_scores_open, true)
  from jsonb_populate_recordset(null::academic_years, jsonb_build_array(p_payload#>'{data,academicYear}')) r
  on conflict (id) do update set
    year_be = excluded.year_be,
    term1_start_date = excluded.term1_start_date,
    term1_end_date = excluded.term1_end_date,
    term2_start_date = excluded.term2_start_date,
    term2_end_date = excluded.term2_end_date,
    term1_scores_open = excluded.term1_scores_open,
    term2_scores_open = excluded.term2_scores_open
  where academic_years.school_id = p_school_id;

  if exists (
    select 1 from jsonb_populate_recordset(null::school_subject_groups, coalesce(p_payload#>'{data,school_subject_groups}', '[]'::jsonb)) r
    where r.school_id is distinct from p_school_id
  ) then
    raise exception 'กลุ่มสาระในไฟล์ไม่ใช่ของโรงเรียนนี้';
  end if;
  insert into school_subject_groups
  select * from jsonb_populate_recordset(null::school_subject_groups, coalesce(p_payload#>'{data,school_subject_groups}', '[]'::jsonb))
  on conflict (school_id, name) do update set updated_at = excluded.updated_at;

  delete from subject_group_heads where school_id = p_school_id;
  if exists (
    select 1 from jsonb_populate_recordset(null::subject_group_heads, coalesce(p_payload#>'{data,subject_group_heads}', '[]'::jsonb)) r
    where r.school_id is distinct from p_school_id
      or (r.head_user_id is not null and not exists (select 1 from users u where u.id = r.head_user_id and u.school_id = p_school_id))
  ) then
    raise exception 'หัวหน้ากลุ่มสาระในไฟล์ไม่ใช่บุคลากรของโรงเรียนนี้';
  end if;
  perform public.backup_insert_rows('subject_group_heads', p_payload#>'{data,subject_group_heads}');

  delete from school_period_times where school_id = p_school_id;
  if exists (
    select 1 from jsonb_populate_recordset(null::school_period_times, coalesce(p_payload#>'{data,school_period_times}', '[]'::jsonb)) r
    where r.school_id is distinct from p_school_id
  ) then
    raise exception 'เวลาคาบในไฟล์ไม่ใช่ของโรงเรียนนี้';
  end if;
  perform public.backup_insert_rows('school_period_times', p_payload#>'{data,school_period_times}');

  v_rows := coalesce(p_payload#>'{data,device_schedule_uploads}', '[]'::jsonb);
  if jsonb_array_length(v_rows) > 0 then
    if exists (
      select 1 from jsonb_populate_recordset(null::device_schedule_uploads, v_rows) r
      where r.school_id is distinct from p_school_id
    ) then
      raise exception 'ไฟล์ตารางบนอุปกรณ์ไม่ใช่ของโรงเรียนนี้';
    end if;
    delete from device_schedule_uploads where school_id = p_school_id;
    perform public.backup_insert_rows('device_schedule_uploads', v_rows);
  end if;
  perform public.backup_set_restore_triggers(true);
  return v_year;
exception when others then
  perform public.backup_set_restore_triggers(true);
  raise;
end;
$$;

create or replace function public.backup_restore_upsert_batch(p_school_id uuid, p_target text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  if jsonb_array_length(p_rows) > 400 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 400 แถว';
  end if;
  perform public.backup_set_restore_triggers(false);
  if p_target = 'subjects' then
    if exists (select 1 from jsonb_populate_recordset(null::subjects, p_rows) r where r.school_id is distinct from p_school_id) then
      raise exception 'รายวิชาในไฟล์ไม่ใช่ของโรงเรียนนี้';
    end if;
    insert into subjects select * from jsonb_populate_recordset(null::subjects, p_rows)
    on conflict (id) do update set
      code = excluded.code, name = excluded.name, short_name = excluded.short_name,
      subject_group = excluded.subject_group, type = excluded.type, hours_per_year = excluded.hours_per_year,
      credits = excluded.credits, max_score = excluded.max_score, level = excluded.level, semester = excluded.semester
    where subjects.school_id = p_school_id;
  elsif p_target = 'evaluation_settings' then
    if exists (select 1 from jsonb_populate_recordset(null::evaluation_settings, p_rows) r where r.school_id is distinct from p_school_id) then
      raise exception 'เกณฑ์การประเมินในไฟล์ไม่ใช่ของโรงเรียนนี้';
    end if;
    insert into evaluation_settings select * from jsonb_populate_recordset(null::evaluation_settings, p_rows)
    on conflict (id) do update set
      kind = excluded.kind, field_key = excluded.field_key, label = excluded.label, short_label = excluded.short_label,
      description = excluded.description, group_label = excluded.group_label, sort_order = excluded.sort_order,
      is_active = excluded.is_active, score_type = excluded.score_type, max_score = excluded.max_score,
      is_required = excluded.is_required, hours_per_year = excluded.hours_per_year, rubric_levels = excluded.rubric_levels,
      education_band = excluded.education_band, schedule_weekly_periods = excluded.schedule_weekly_periods, updated_at = excluded.updated_at
    where evaluation_settings.school_id = p_school_id;
  elsif p_target = 'clubs' then
    if exists (select 1 from jsonb_populate_recordset(null::clubs, p_rows) r where r.school_id is distinct from p_school_id) then
      raise exception 'ชุมนุมในไฟล์ไม่ใช่ของโรงเรียนนี้';
    end if;
    insert into clubs select * from jsonb_populate_recordset(null::clubs, p_rows)
    on conflict (id) do update set
      code = excluded.code, name = excluded.name, short_name = excluded.short_name, description = excluded.description,
      advisor_name = excluded.advisor_name, max_students = excluded.max_students, is_active = excluded.is_active, updated_at = excluded.updated_at
    where clubs.school_id = p_school_id;
  else
    raise exception 'ตาราง % ไม่รองรับการอัปเดต', p_target;
  end if;
  get diagnostics n = row_count;
  perform public.backup_set_restore_triggers(true);
  return n;
exception when others then
  perform public.backup_set_restore_triggers(true);
  raise;
end;
$$;

create or replace function public.backup_restore_clear_batch(
  p_school_id uuid, p_year uuid, p_target text, p_limit integer default 800
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  v_sql text;
begin
  if p_limit < 1 or p_limit > 800 then
    raise exception 'ขนาดชุดที่ลบไม่ถูกต้อง';
  end if;
  if not exists (select 1 from academic_years where id = p_year and school_id = p_school_id) then
    raise exception 'ปีการศึกษาไม่ใช่ของโรงเรียนนี้';
  end if;
  v_sql := case p_target
    when 'schedule_substitute_entries' then 'delete from schedule_substitute_entries where id in (select e.id from schedule_substitute_entries e join schedule_substitute_days d on d.id = e.substitute_day_id where d.school_id = $1 and d.academic_year_id = $2 limit $3)'
    when 'hourly_attendance' then 'delete from hourly_attendance where id in (select a.id from hourly_attendance a join classrooms c on c.id = a.classroom_id where c.school_id = $1 and c.academic_year_id = $2 limit $3)'
    when 'daily_attendance' then 'delete from daily_attendance where id in (select a.id from daily_attendance a join classrooms c on c.id = a.classroom_id where c.school_id = $1 and c.academic_year_id = $2 limit $3)'
    when 'daily_activities' then 'delete from daily_activities where id in (select a.id from daily_activities a join classrooms c on c.id = a.classroom_id where c.school_id = $1 and c.academic_year_id = $2 limit $3)'
    when 'scores' then 'delete from scores where id in (select sc.id from scores sc join class_subjects cs on cs.id = sc.class_subject_id join classrooms c on c.id = cs.classroom_id where c.school_id = $1 and cs.academic_year_id = $2 limit $3)'
    when 'score_configs' then 'delete from score_configs where id in (select sc.id from score_configs sc join class_subjects cs on cs.id = sc.class_subject_id join classrooms c on c.id = cs.classroom_id where c.school_id = $1 and cs.academic_year_id = $2 limit $3)'
    when 'approval_signatures' then 'delete from approval_signatures where id in (select s.id from approval_signatures s join class_subjects cs on cs.id = s.class_subject_id join classrooms c on c.id = cs.classroom_id where c.school_id = $1 and cs.academic_year_id = $2 limit $3)'
    when 'class_schedule_slots' then 'delete from class_schedule_slots where id in (select s.id from class_schedule_slots s join classrooms c on c.id = s.classroom_id where c.school_id = $1 and c.academic_year_id = $2 limit $3)'
    when 'class_schedule_activities' then 'delete from class_schedule_activities where id in (select a.id from class_schedule_activities a join classrooms c on c.id = a.classroom_id where c.school_id = $1 and c.academic_year_id = $2 limit $3)'
    when 'document_references' then 'delete from document_references where id in (select r.id from document_references r join approved_document_exports e on e.id = r.export_id where e.school_id = $1 and e.academic_year_id = $2 limit $3)'
    when 'approved_document_exports' then 'delete from approved_document_exports where id in (select id from approved_document_exports where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'class_document_approvals' then 'delete from class_document_approvals where id in (select id from class_document_approvals where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'document_approval_submissions' then 'delete from document_approval_submissions where id in (select s.id from document_approval_submissions s join classrooms c on c.id = s.classroom_id where c.school_id = $1 and c.academic_year_id = $2 limit $3)'
    when 'student_health' then 'delete from student_health where id in (select id from student_health where academic_year_id = $2 limit $3)'
    when 'health_inspection' then 'delete from health_inspection where id in (select id from health_inspection where academic_year_id = $2 limit $3)'
    when 'character_traits' then 'delete from character_traits where id in (select id from character_traits where academic_year_id = $2 limit $3)'
    when 'reading_evaluation' then 'delete from reading_evaluation where id in (select id from reading_evaluation where academic_year_id = $2 limit $3)'
    when 'activities_evaluation' then 'delete from activities_evaluation where id in (select id from activities_evaluation where academic_year_id = $2 limit $3)'
    when 'competency_evaluation' then 'delete from competency_evaluation where id in (select id from competency_evaluation where academic_year_id = $2 limit $3)'
    when 'evaluation_custom_scores' then 'delete from evaluation_custom_scores where id in (select id from evaluation_custom_scores where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'teacher_comments' then 'delete from teacher_comments where id in (select id from teacher_comments where academic_year_id = $2 limit $3)'
    when 'student_club_assignments' then 'delete from student_club_assignments where id in (select id from student_club_assignments where academic_year_id = $2 limit $3)'
    when 'students' then 'delete from students where id in (select s.id from students s join classrooms c on c.id = s.classroom_id where c.school_id = $1 and c.academic_year_id = $2 limit $3)'
    when 'class_subjects' then 'delete from class_subjects where id in (select cs.id from class_subjects cs join classrooms c on c.id = cs.classroom_id where c.school_id = $1 and cs.academic_year_id = $2 limit $3)'
    when 'teacher_permissions' then 'delete from teacher_permissions where id in (select t.id from teacher_permissions t join classrooms c on c.id = t.classroom_id where c.school_id = $1 and c.academic_year_id = $2 limit $3)'
    when 'period_config' then 'delete from period_config where id in (select p.id from period_config p join classrooms c on c.id = p.classroom_id where c.school_id = $1 and c.academic_year_id = $2 limit $3)'
    when 'personal_homeroom_rooms' then 'delete from personal_homeroom_rooms where (school_id, classroom_id) in (select school_id, classroom_id from personal_homeroom_rooms where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'schedule_drafts' then 'delete from schedule_drafts where id in (select id from schedule_drafts where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'schedule_plans' then 'delete from schedule_plans where (school_id, academic_year_id, semester) in (select school_id, academic_year_id, semester from schedule_plans where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'schedule_teacher_blocks' then 'delete from schedule_teacher_blocks where (school_id, academic_year_id, semester, teacher_id, day_of_week, period) in (select school_id, academic_year_id, semester, teacher_id, day_of_week, period from schedule_teacher_blocks where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'schedule_substitute_days' then 'delete from schedule_substitute_days where id in (select id from schedule_substitute_days where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'substitute_documents' then 'delete from substitute_documents where id in (select id from substitute_documents where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'classrooms' then 'delete from classrooms where id in (select id from classrooms where school_id = $1 and academic_year_id = $2 limit $3)'
    when 'holidays' then 'delete from holidays where id in (select id from holidays where academic_year_id = $2 limit $3)'
    when 'weekend_school_days' then 'delete from weekend_school_days where id in (select id from weekend_school_days where academic_year_id = $2 limit $3)'
    else null
  end;
  if v_sql is null then
    raise exception 'ตาราง % ไม่รองรับการล้างข้อมูล', p_target;
  end if;
  if p_target = 'weekend_school_days' and to_regclass('public.weekend_school_days') is null then
    return 0;
  end if;
  perform public.backup_set_restore_triggers(false);
  execute v_sql using p_school_id, p_year, p_limit;
  get diagnostics n = row_count;
  perform public.backup_set_restore_triggers(true);
  return n;
exception when others then
  perform public.backup_set_restore_triggers(true);
  raise;
end;
$$;

create or replace function public.backup_restore_insert_batch(
  p_school_id uuid, p_year uuid, p_target text, p_rows jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  bad integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  if jsonb_array_length(p_rows) > 400 then
    raise exception 'นำเข้าได้ครั้งละไม่เกิน 400 แถว';
  end if;
  if not exists (select 1 from academic_years where id = p_year and school_id = p_school_id) then
    raise exception 'ปีการศึกษาไม่ใช่ของโรงเรียนนี้';
  end if;
  if p_target in ('classrooms', 'schedule_plans', 'schedule_drafts', 'schedule_teacher_blocks', 'schedule_substitute_days', 'substitute_documents', 'personal_homeroom_rooms', 'class_document_approvals', 'approved_document_exports', 'evaluation_custom_scores') then
    execute format('select count(*) from jsonb_populate_recordset(null::public.%I, $1) r where r.school_id is distinct from $2 or r.academic_year_id is distinct from $3', p_target)
      into bad using p_rows, p_school_id, p_year;
  elsif p_target in ('holidays', 'class_subjects', 'class_schedule_slots', 'class_schedule_activities', 'student_health', 'health_inspection', 'character_traits', 'reading_evaluation', 'activities_evaluation', 'competency_evaluation', 'teacher_comments', 'student_club_assignments', 'weekend_school_days') then
    execute format('select count(*) from jsonb_populate_recordset(null::public.%I, $1) r where r.academic_year_id is distinct from $2', p_target)
      into bad using p_rows, p_year;
  elsif p_target in ('students', 'period_config', 'teacher_permissions', 'daily_attendance', 'hourly_attendance', 'daily_activities') then
    execute format($f$
      select count(*) from jsonb_populate_recordset(null::public.%I, $1) r
      where not exists (select 1 from classrooms c where c.id = r.classroom_id and c.school_id = $2 and c.academic_year_id = $3)
    $f$, p_target) into bad using p_rows, p_school_id, p_year;
  elsif p_target in ('score_configs', 'approval_signatures') then
    execute format($f$
      select count(*) from jsonb_populate_recordset(null::public.%I, $1) r
      where not exists (
        select 1 from class_subjects cs join classrooms c on c.id = cs.classroom_id
        where cs.id = r.class_subject_id and c.school_id = $2 and cs.academic_year_id = $3
      )
    $f$, p_target) into bad using p_rows, p_school_id, p_year;
  elsif p_target = 'scores' then
    select count(*) into bad from jsonb_populate_recordset(null::scores, p_rows) r
    where not exists (
      select 1 from class_subjects cs join classrooms c on c.id = cs.classroom_id
      where cs.id = r.class_subject_id and c.school_id = p_school_id and cs.academic_year_id = p_year
    ) or not exists (
      select 1 from students s join classrooms c on c.id = s.classroom_id
      where s.id = r.student_id and c.school_id = p_school_id and c.academic_year_id = p_year
    );
  elsif p_target = 'schedule_substitute_entries' then
    select count(*) into bad from jsonb_populate_recordset(null::schedule_substitute_entries, p_rows) r
    where not exists (
      select 1 from schedule_substitute_days d
      where d.id = r.substitute_day_id and d.school_id = p_school_id and d.academic_year_id = p_year
    );
  elsif p_target = 'document_references' then
    select count(*) into bad from jsonb_populate_recordset(null::document_references, p_rows) r
    where r.school_id is distinct from p_school_id or not exists (
      select 1 from approved_document_exports e
      where e.id = r.export_id and e.school_id = p_school_id and e.academic_year_id = p_year
    );
  elsif p_target = 'document_approval_submissions' then
    select count(*) into bad from jsonb_populate_recordset(null::document_approval_submissions, p_rows) r
    where r.school_id is distinct from p_school_id or not exists (
      select 1 from classrooms c where c.id = r.classroom_id and c.school_id = p_school_id and c.academic_year_id = p_year
    );
  else
    raise exception 'ตาราง % ไม่รองรับการนำเข้า', p_target;
  end if;
  if bad > 0 then
    raise exception 'ข้อมูล % ไม่ตรงกับโรงเรียนหรือปีการศึกษานี้', p_target;
  end if;
  if p_target = 'class_subjects' and exists (
    select 1 from jsonb_populate_recordset(null::class_subjects, p_rows) r
    where not exists (select 1 from subjects s where s.id = r.subject_id and s.school_id = p_school_id)
      or (r.teacher_id is not null and not exists (select 1 from users u where u.id = r.teacher_id and u.school_id = p_school_id))
  ) then
    raise exception 'วิชาที่เปิดสอนไม่ตรงกับรายวิชาหรือบุคลากรของโรงเรียนนี้';
  end if;
  perform public.backup_set_restore_triggers(false);
  perform public.backup_insert_rows(p_target, p_rows);
  perform public.backup_set_restore_triggers(true);
  return jsonb_array_length(p_rows);
exception when others then
  perform public.backup_set_restore_triggers(true);
  raise;
end;
$$;

create or replace function public.backup_restore_counts(p_school_id uuid, p_year uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'students', (select count(*) from students s join classrooms c on c.id = s.classroom_id where c.school_id = p_school_id and c.academic_year_id = p_year),
    'scores', (select count(*) from scores sc join class_subjects cs on cs.id = sc.class_subject_id join classrooms c on c.id = cs.classroom_id where c.school_id = p_school_id and cs.academic_year_id = p_year),
    'attendance', (select count(*) from daily_attendance a join classrooms c on c.id = a.classroom_id where c.school_id = p_school_id and c.academic_year_id = p_year),
    'schedule', (select count(*) from class_schedule_slots s join classrooms c on c.id = s.classroom_id where c.school_id = p_school_id and s.academic_year_id = p_year)
  );
$$;

revoke all on function public.backup_set_restore_triggers(boolean) from public, anon, authenticated;
revoke all on function public.backup_restore_prepare(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.backup_restore_upsert_batch(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.backup_restore_clear_batch(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.backup_restore_insert_batch(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.backup_restore_counts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.backup_set_restore_triggers(boolean) to service_role;
grant execute on function public.backup_restore_prepare(uuid, uuid, jsonb) to service_role;
grant execute on function public.backup_restore_upsert_batch(uuid, text, jsonb) to service_role;
grant execute on function public.backup_restore_clear_batch(uuid, uuid, text, integer) to service_role;
grant execute on function public.backup_restore_insert_batch(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.backup_restore_counts(uuid, uuid) to service_role;

alter function public.restore_school_backup(uuid, uuid, jsonb) set statement_timeout = '300s';
alter function public.backup_set_restore_triggers(boolean) set statement_timeout = '25s';
alter function public.backup_restore_prepare(uuid, uuid, jsonb) set statement_timeout = '25s';
alter function public.backup_restore_upsert_batch(uuid, text, jsonb) set statement_timeout = '25s';
alter function public.backup_restore_clear_batch(uuid, uuid, text, integer) set statement_timeout = '25s';
alter function public.backup_restore_insert_batch(uuid, uuid, text, jsonb) set statement_timeout = '25s';
alter function public.backup_restore_counts(uuid, uuid) set statement_timeout = '25s';

notify pgrst, 'reload schema';
