-- Restore one academic year from a JSON backup produced by the school backup page.
-- Membership, school code, and Google Drive credentials are never written.

create or replace function public.backup_insert_rows(p_table text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
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
  execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', p_table, p_table)
    using p_rows;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create or replace function public.restore_school_backup(p_school_id uuid, p_actor_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year uuid;
  v_year_be integer;
  v_rows jsonb;
  v_disabled jsonb := '[]'::jsonb;
  v_pair jsonb;
  v_bad integer;
  rec record;
begin
  perform set_config('statement_timeout', '180s', true);
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

  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text || ':school-backup', 0));

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
    if exists (
      select 1 from pg_trigger g
      join pg_class c on c.oid = g.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = rec.table_name and g.tgname = rec.trigger_name and not g.tgisinternal
    ) then
      execute format('alter table public.%I disable trigger %I', rec.table_name, rec.trigger_name);
      v_disabled := v_disabled || jsonb_build_array(jsonb_build_object('table_name', rec.table_name, 'trigger_name', rec.trigger_name));
    end if;
  end loop;

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

  if exists (
    select 1 from jsonb_populate_recordset(null::subjects, coalesce(p_payload#>'{data,subjects}', '[]'::jsonb)) r
    where r.school_id is distinct from p_school_id
  ) then
    raise exception 'รายวิชาในไฟล์ไม่ใช่ของโรงเรียนนี้';
  end if;
  insert into subjects
  select * from jsonb_populate_recordset(null::subjects, coalesce(p_payload#>'{data,subjects}', '[]'::jsonb))
  on conflict (id) do update set
    code = excluded.code,
    name = excluded.name,
    short_name = excluded.short_name,
    subject_group = excluded.subject_group,
    type = excluded.type,
    hours_per_year = excluded.hours_per_year,
    credits = excluded.credits,
    max_score = excluded.max_score,
    level = excluded.level,
    semester = excluded.semester
  where subjects.school_id = p_school_id;

  delete from subject_group_heads where school_id = p_school_id;
  if exists (
    select 1 from jsonb_populate_recordset(null::subject_group_heads, coalesce(p_payload#>'{data,subject_group_heads}', '[]'::jsonb)) r
    where r.school_id is distinct from p_school_id
      or (r.head_user_id is not null and not exists (select 1 from users u where u.id = r.head_user_id and u.school_id = p_school_id))
  ) then
    raise exception 'หัวหน้ากลุ่มสาระในไฟล์ไม่ใช่บุคลากรของโรงเรียนนี้';
  end if;
  perform public.backup_insert_rows('subject_group_heads', p_payload#>'{data,subject_group_heads}');

  if exists (
    select 1 from jsonb_populate_recordset(null::evaluation_settings, coalesce(p_payload#>'{data,evaluation_settings}', '[]'::jsonb)) r
    where r.school_id is distinct from p_school_id
  ) then
    raise exception 'เกณฑ์การประเมินในไฟล์ไม่ใช่ของโรงเรียนนี้';
  end if;
  insert into evaluation_settings
  select * from jsonb_populate_recordset(null::evaluation_settings, coalesce(p_payload#>'{data,evaluation_settings}', '[]'::jsonb))
  on conflict (id) do update set
    kind = excluded.kind,
    field_key = excluded.field_key,
    label = excluded.label,
    short_label = excluded.short_label,
    description = excluded.description,
    group_label = excluded.group_label,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    score_type = excluded.score_type,
    max_score = excluded.max_score,
    is_required = excluded.is_required,
    hours_per_year = excluded.hours_per_year,
    rubric_levels = excluded.rubric_levels,
    education_band = excluded.education_band,
    schedule_weekly_periods = excluded.schedule_weekly_periods,
    updated_at = excluded.updated_at
  where evaluation_settings.school_id = p_school_id;

  if exists (
    select 1 from jsonb_populate_recordset(null::clubs, coalesce(p_payload#>'{data,clubs}', '[]'::jsonb)) r
    where r.school_id is distinct from p_school_id
  ) then
    raise exception 'ชุมนุมในไฟล์ไม่ใช่ของโรงเรียนนี้';
  end if;
  insert into clubs
  select * from jsonb_populate_recordset(null::clubs, coalesce(p_payload#>'{data,clubs}', '[]'::jsonb))
  on conflict (id) do update set
    code = excluded.code,
    name = excluded.name,
    short_name = excluded.short_name,
    description = excluded.description,
    advisor_name = excluded.advisor_name,
    max_students = excluded.max_students,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at
  where clubs.school_id = p_school_id;

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

  if exists (
    select 1 from jsonb_populate_recordset(null::classrooms, coalesce(p_payload#>'{data,classrooms}', '[]'::jsonb)) r
    where r.school_id is distinct from p_school_id or r.academic_year_id is distinct from v_year
      or (r.homeroom_teacher_id is not null and not exists (select 1 from users u where u.id = r.homeroom_teacher_id and u.school_id = p_school_id))
      or (r.homeroom_teacher2_id is not null and not exists (select 1 from users u where u.id = r.homeroom_teacher2_id and u.school_id = p_school_id))
  ) then
    raise exception 'ห้องเรียนในไฟล์ไม่ตรงกับโรงเรียนหรือปีการศึกษานี้';
  end if;

  if exists (
    select 1 from jsonb_populate_recordset(null::class_subjects, coalesce(p_payload#>'{data,class_subjects}', '[]'::jsonb)) r
    where r.academic_year_id is distinct from v_year
      or not exists (
        select 1 from jsonb_populate_recordset(null::classrooms, coalesce(p_payload#>'{data,classrooms}', '[]'::jsonb)) c
        where c.id = r.classroom_id and c.school_id = p_school_id and c.academic_year_id = v_year
      )
      or not exists (select 1 from subjects s where s.id = r.subject_id and s.school_id = p_school_id)
      or (r.teacher_id is not null and not exists (select 1 from users u where u.id = r.teacher_id and u.school_id = p_school_id))
  ) then
    raise exception 'วิชาที่เปิดสอนในไฟล์ไม่ตรงกับห้อง รายวิชา หรือบุคลากรของโรงเรียนนี้';
  end if;

  select count(*) into v_bad
  from jsonb_populate_recordset(null::students, coalesce(p_payload#>'{data,students}', '[]'::jsonb)) s
  where not exists (
    select 1 from jsonb_populate_recordset(null::classrooms, coalesce(p_payload#>'{data,classrooms}', '[]'::jsonb)) c
    where c.id = s.classroom_id and c.school_id = p_school_id and c.academic_year_id = v_year
  );
  if v_bad > 0 then
    raise exception 'มีนักเรียนในไฟล์ที่ไม่อยู่ในห้องของปีการศึกษานี้';
  end if;

  select count(*) into v_bad
  from jsonb_populate_recordset(null::scores, coalesce(p_payload#>'{data,scores}', '[]'::jsonb)) sc
  where not exists (
    select 1 from jsonb_populate_recordset(null::class_subjects, coalesce(p_payload#>'{data,class_subjects}', '[]'::jsonb)) cs
    where cs.id = sc.class_subject_id
  ) or not exists (
    select 1 from jsonb_populate_recordset(null::students, coalesce(p_payload#>'{data,students}', '[]'::jsonb)) st
    where st.id = sc.student_id
  );
  if v_bad > 0 then
    raise exception 'มีคะแนนในไฟล์ที่ไม่อยู่ในนักเรียนหรือรายวิชาของปีการศึกษานี้';
  end if;

  delete from class_schedule_slots s
  using classrooms c
  where s.classroom_id = c.id and c.school_id = p_school_id and c.academic_year_id = v_year;
  delete from class_schedule_activities a
  using classrooms c
  where a.classroom_id = c.id and c.school_id = p_school_id and c.academic_year_id = v_year;
  delete from schedule_substitute_entries e
  using schedule_substitute_days d
  where e.substitute_day_id = d.id and d.school_id = p_school_id and d.academic_year_id = v_year;
  delete from schedule_substitute_days where school_id = p_school_id and academic_year_id = v_year;
  delete from substitute_documents where school_id = p_school_id and academic_year_id = v_year;
  delete from schedule_drafts where school_id = p_school_id and academic_year_id = v_year;
  delete from schedule_plans where school_id = p_school_id and academic_year_id = v_year;
  delete from schedule_teacher_blocks where school_id = p_school_id and academic_year_id = v_year;
  delete from document_references r
  using approved_document_exports e
  where r.export_id = e.id and e.school_id = p_school_id and e.academic_year_id = v_year;
  delete from approved_document_exports where school_id = p_school_id and academic_year_id = v_year;
  delete from classrooms where school_id = p_school_id and academic_year_id = v_year;
  delete from holidays where academic_year_id = v_year;
  delete from evaluation_custom_scores where school_id = p_school_id and academic_year_id = v_year;
  if to_regclass('public.weekend_school_days') is not null
     and jsonb_typeof(p_payload#>'{data,weekend_school_days}') = 'array' then
    execute 'delete from public.weekend_school_days where academic_year_id = $1' using v_year;
  end if;

  perform public.backup_insert_rows('classrooms', p_payload#>'{data,classrooms}');
  perform public.backup_insert_rows('period_config', p_payload#>'{data,period_config}');
  perform public.backup_insert_rows('holidays', p_payload#>'{data,holidays}');
  perform public.backup_insert_rows('students', p_payload#>'{data,students}');
  perform public.backup_insert_rows('class_subjects', p_payload#>'{data,class_subjects}');
  perform public.backup_insert_rows('teacher_permissions', p_payload#>'{data,teacher_permissions}');
  perform public.backup_insert_rows('score_configs', p_payload#>'{data,score_configs}');
  perform public.backup_insert_rows('scores', p_payload#>'{data,scores}');
  perform public.backup_insert_rows('daily_attendance', p_payload#>'{data,daily_attendance}');
  perform public.backup_insert_rows('hourly_attendance', p_payload#>'{data,hourly_attendance}');
  perform public.backup_insert_rows('daily_activities', p_payload#>'{data,daily_activities}');
  perform public.backup_insert_rows('student_health', p_payload#>'{data,student_health}');
  perform public.backup_insert_rows('health_inspection', p_payload#>'{data,health_inspection}');
  perform public.backup_insert_rows('character_traits', p_payload#>'{data,character_traits}');
  perform public.backup_insert_rows('reading_evaluation', p_payload#>'{data,reading_evaluation}');
  perform public.backup_insert_rows('activities_evaluation', p_payload#>'{data,activities_evaluation}');
  perform public.backup_insert_rows('competency_evaluation', p_payload#>'{data,competency_evaluation}');
  perform public.backup_insert_rows('evaluation_custom_scores', p_payload#>'{data,evaluation_custom_scores}');
  perform public.backup_insert_rows('teacher_comments', p_payload#>'{data,teacher_comments}');
  perform public.backup_insert_rows('student_club_assignments', p_payload#>'{data,student_club_assignments}');
  perform public.backup_insert_rows('class_schedule_activities', p_payload#>'{data,class_schedule_activities}');
  perform public.backup_insert_rows('class_schedule_slots', p_payload#>'{data,class_schedule_slots}');
  perform public.backup_insert_rows('schedule_plans', p_payload#>'{data,schedule_plans}');
  perform public.backup_insert_rows('schedule_drafts', p_payload#>'{data,schedule_drafts}');
  perform public.backup_insert_rows('schedule_teacher_blocks', p_payload#>'{data,schedule_teacher_blocks}');
  perform public.backup_insert_rows('schedule_substitute_days', p_payload#>'{data,schedule_substitute_days}');
  perform public.backup_insert_rows('schedule_substitute_entries', p_payload#>'{data,schedule_substitute_entries}');
  perform public.backup_insert_rows('substitute_documents', p_payload#>'{data,substitute_documents}');
  perform public.backup_insert_rows('personal_homeroom_rooms', p_payload#>'{data,personal_homeroom_rooms}');
  perform public.backup_insert_rows('class_document_approvals', p_payload#>'{data,class_document_approvals}');
  perform public.backup_insert_rows('document_approval_submissions', p_payload#>'{data,document_approval_submissions}');
  perform public.backup_insert_rows('approval_signatures', p_payload#>'{data,approval_signatures}');
  perform public.backup_insert_rows('approved_document_exports', p_payload#>'{data,approved_document_exports}');
  perform public.backup_insert_rows('document_references', p_payload#>'{data,document_references}');
  if to_regclass('public.weekend_school_days') is not null
     and jsonb_typeof(p_payload#>'{data,weekend_school_days}') = 'array' then
    perform public.backup_insert_rows('weekend_school_days', p_payload#>'{data,weekend_school_days}');
  end if;

  for v_pair in select value from jsonb_array_elements(v_disabled) loop
    execute format('alter table public.%I enable trigger %I', v_pair->>'table_name', v_pair->>'trigger_name');
  end loop;

  return jsonb_build_object(
    'students', (select count(*) from students s join classrooms c on c.id = s.classroom_id where c.school_id = p_school_id and c.academic_year_id = v_year),
    'scores', (select count(*) from scores sc join class_subjects cs on cs.id = sc.class_subject_id join classrooms c on c.id = cs.classroom_id where c.school_id = p_school_id and cs.academic_year_id = v_year),
    'attendance', (select count(*) from daily_attendance a join classrooms c on c.id = a.classroom_id where c.school_id = p_school_id and c.academic_year_id = v_year),
    'schedule', (select count(*) from class_schedule_slots s join classrooms c on c.id = s.classroom_id where c.school_id = p_school_id and s.academic_year_id = v_year)
  );
exception
  when others then
    for v_pair in select value from jsonb_array_elements(v_disabled) loop
      execute format('alter table public.%I enable trigger %I', v_pair->>'table_name', v_pair->>'trigger_name');
    end loop;
    raise;
end;
$$;

revoke all on function public.backup_insert_rows(text, jsonb) from public, anon, authenticated;
revoke all on function public.restore_school_backup(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.backup_insert_rows(text, jsonb) to service_role;
grant execute on function public.restore_school_backup(uuid, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
