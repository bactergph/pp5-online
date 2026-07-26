'use server'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { loadReportDigitalReference } from '@/lib/document-reference'
import { loadReportDocumentSignatures, type ReportDocumentSignatures } from '@/lib/report-signatures'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'
import {
  EVALUATION_DEFAULT_SETTINGS,
  characterDefaultSettingsForBand,
  educationBandFromClassroomLevel,
  normalizeRubricLevels,
  readingDefaultSettingsForBand,
  type EducationBand,
  type RubricLevels,
} from '@/lib/evaluation-settings'

export type ReportMode = 'pp5-subject' | 'pp5-class' | 'pp6'

export type ReportYear = {
  id: string
  year_be: number
  is_active: boolean
  term1_start_date: string | null
  term1_end_date: string | null
  term2_start_date: string | null
  term2_end_date: string | null
}

export type ReportClassroom = {
  id: string
  level: string
  room: number
  academic_year_id: string
  homeroom_teacher_id: string | null
  homeroom_teacher2_id: string | null
  homeroom_teacher_name?: string
  homeroom_teacher2_name?: string
}

export type ReportStudent = {
  id: string
  student_number: number
  student_code: string | null
  national_id: string | null
  prefix: string | null
  first_name: string
  last_name: string
  status: string
}

export type ReportSubject = {
  class_subject_id: string
  order_number: number
  teacher_name: string
  subject: {
    id: string
    code: string
    name: string
    short_name: string | null
    subject_group: string
    type: string | null
    hours_per_year: number | null
    credits: number | null
    max_score: number | null
  }
}

export type ReportScore = {
  student_id: string
  class_subject_id: string
  term: number
  unit_scores: Record<string, number>
  between_total: number | null
  midterm_score: number | null
  final_score: number | null
  term_total: number | null
  year_total: number | null
  grade: number | null
  result: string | null
}

export type ReportScoreConfig = {
  class_subject_id: string
  term: number
  unit_count: number
  between_scores: number[]
  midterm_max: number
  final_max: number
  total_max: number
}

export type ReportDailyAttendanceRecord = {
  student_id: string
  date: string
  status: string
}

export type ReportCalendarDay = {
  date: string
  name: string | null
}

export type ReportEvaluationRow = Record<string, string | number | null>

export type ReportActivitySetting = {
  field_key: string
  label: string
  short_label: string
  sort_order: number
  is_active: boolean
  hours_per_year: number
}

export type ReportCharacterSetting = {
  field_key: string
  label: string
  short_label: string
  description: string | null
  sort_order: number
  is_active: boolean
  max_score: number
}

export type ReportReadingSetting = {
  field_key: string
  label: string
  short_label: string
  description: string | null
  group_label: string | null
  sort_order: number
  is_active: boolean
  max_score: number
  rubric_levels: RubricLevels | null
}

export type ReportHourlyAttendanceRecord = {
  student_id: string
  class_subject_id: string
  term: 1 | 2
  week_number: number
  hour_number: number
  status: string
}

export type ReportPayload = {
  error?: string | null
  school: {
    id: string
    name: string
    logo_url: string | null
    stamp_url: string | null
    department: string | null
    area_office: string | null
    district: string | null
    province: string | null
    director_name: string | null
    vice_director_name: string | null
    acting_director: string | null
    acting_director_position: string | null
    academic_head_name: string | null
    measurement_head_name: string | null
  } | null
  years: ReportYear[]
  classrooms: ReportClassroom[]
  classroom: ReportClassroom | null
  academicYear: ReportYear | null
  students: ReportStudent[]
  subjects: ReportSubject[]
  scores: ReportScore[]
  scoreConfigs: ReportScoreConfig[]
  dailyAttendanceRecords: ReportDailyAttendanceRecord[]
  holidays: ReportCalendarDay[]
  weekendSchoolDays: ReportCalendarDay[]
  dailyAttendance: Record<string, { present: number; sick: number; leave: number; absent: number }>
  hourlyAttendance: Record<string, { present: number; sick: number; leave: number; absent: number }>
  hourlyAttendanceRecords: ReportHourlyAttendanceRecord[]
  evaluations: {
    character: ReportEvaluationRow[]
    reading: ReportEvaluationRow[]
    competency: ReportEvaluationRow[]
    activities: ReportEvaluationRow[]
  }
  activitySettings: ReportActivitySetting[]
  characterSettings: ReportCharacterSetting[]
  readingSettings: ReportReadingSetting[]
  subjectGroupHeads: Record<string, string>
  documentSignatures?: ReportDocumentSignatures
  /** Digital Reference หลังอนุมัติ — ใช้วาด QR บนปก */
  digitalReference?: {
    code: string
    verifyUrl: string
    status: string
    pdfUrl: string | null
  } | null
}

type DbRow = Record<string, unknown>

function asText(value: unknown) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
}

function asNullableText(value: unknown) {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

function asNullableNumber(value: unknown) {
  if (value === null || value === undefined) return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

async function requireReportSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  if (!session.schoolId) throw new Error('ยังไม่ได้เลือกโรงเรียน')
  return session
}

function isHomeroomTeacher(classroom: ReportClassroom, userId: string) {
  return classroom.homeroom_teacher_id === userId || classroom.homeroom_teacher2_id === userId
}

async function fetchTeacherTeachingClassrooms(
  db: ReturnType<typeof createServerClient>,
  userId: string,
  schoolId: string,
) {
  const rows = await safeRows<DbRow>(
    db.from('class_subjects')
      .select('classrooms!inner(id, level, room, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id, school_id)')
      .eq('teacher_id', userId)
      .eq('classrooms.school_id', schoolId),
  )
  const map = new Map<string, ReportClassroom>()
  for (const row of rows) {
    const classroom = row.classrooms as DbRow
    const id = asText(classroom.id)
    if (!id || map.has(id)) continue
    map.set(id, {
      id,
      level: asText(classroom.level),
      room: asNumber(classroom.room),
      academic_year_id: asText(classroom.academic_year_id),
      homeroom_teacher_id: asNullableText(classroom.homeroom_teacher_id),
      homeroom_teacher2_id: asNullableText(classroom.homeroom_teacher2_id),
    })
  }
  return Array.from(map.values()).sort((a, b) => a.level.localeCompare(b.level, 'th') || a.room - b.room)
}

async function filterClassroomsForSession(
  classrooms: ReportClassroom[],
  session: Awaited<ReturnType<typeof requireReportSession>>,
  db: ReturnType<typeof createServerClient>,
  schoolId: string,
  mode?: ReportMode,
) {
  if (session.role !== 'teacher') return classrooms
  if (mode === 'pp5-class' || mode === 'pp6') {
    return classrooms.filter(classroom => isHomeroomTeacher(classroom, session.userId))
  }
  return fetchTeacherTeachingClassrooms(db, session.userId, schoolId)
}

function teacherName(row: DbRow) {
  const user = row.users as DbRow | null
  return [user?.prefix, user?.full_name].filter(Boolean).join('') || ''
}

function userFullName(row: DbRow) {
  return [row.prefix, row.full_name].filter(Boolean).join('') || asText(row.full_name)
}

function normalizeSubject(row: DbRow): ReportSubject {
  const subject = row.subjects as DbRow
  return {
    class_subject_id: asText(row.id),
    order_number: asNumber(row.order_number),
    teacher_name: teacherName(row),
    subject: {
      id: asText(subject?.id),
      code: asText(subject?.code),
      name: asText(subject?.name),
      short_name: asNullableText(subject?.short_name),
      subject_group: asText(subject?.subject_group),
      type: asNullableText(subject?.type),
      hours_per_year: asNullableNumber(subject?.hours_per_year),
      credits: asNullableNumber(subject?.credits),
      max_score: asNullableNumber(subject?.max_score),
    },
  }
}

function summarizeDaily(rows: DbRow[]) {
  const out: ReportPayload['dailyAttendance'] = {}
  for (const row of rows) {
    const id = String(row.student_id)
    if (!out[id]) out[id] = { present: 0, sick: 0, leave: 0, absent: 0 }
    if (row.status === 'ป') out[id].sick += 1
    else if (row.status === 'ล') out[id].leave += 1
    else if (row.status === 'ข') out[id].absent += 1
    else out[id].present += 1
  }
  return out
}

function summarizeHourly(rows: DbRow[]) {
  const out: ReportPayload['hourlyAttendance'] = {}
  for (const row of rows) {
    const id = String(row.student_id)
    if (!out[id]) out[id] = { present: 0, sick: 0, leave: 0, absent: 0 }
    if (row.status === 'ป') out[id].sick += 1
    else if (row.status === 'ล') out[id].leave += 1
    else if (row.status === 'ข') out[id].absent += 1
    else out[id].present += 1
  }
  return out
}

function termRange(year: ReportYear | null, term: 0 | 1 | 2) {
  if (!year) return { start: null, end: null }
  if (term === 0) return { start: year.term1_start_date, end: year.term2_end_date }
  return term === 1
    ? { start: year.term1_start_date, end: year.term1_end_date }
    : { start: year.term2_start_date, end: year.term2_end_date }
}

async function safeRows<T = DbRow>(promise: PromiseLike<{ data: T[] | null; error: unknown }>) {
  const result = await promise
  return result.data || []
}

function defaultActivitySettings(): ReportActivitySetting[] {
  return EVALUATION_DEFAULT_SETTINGS.activities.map(setting => ({
    field_key: setting.field_key,
    label: setting.label,
    short_label: setting.short_label,
    sort_order: setting.sort_order,
    is_active: setting.is_active,
    hours_per_year: setting.hours_per_year,
  }))
}

function normalizeActivitySetting(row: DbRow): ReportActivitySetting {
  const defaults = EVALUATION_DEFAULT_SETTINGS.activities.find(item => item.field_key === asText(row.field_key))
  return {
    field_key: asText(row.field_key),
    label: asText(row.label) || defaults?.label || '',
    short_label: asText(row.short_label) || defaults?.short_label || '',
    sort_order: asNumber(row.sort_order) || defaults?.sort_order || 1,
    is_active: row.is_active !== false,
    hours_per_year: Math.max(0, asNumber(row.hours_per_year ?? defaults?.hours_per_year ?? 0)),
  }
}

function defaultCharacterSettings(band: EducationBand = '4'): ReportCharacterSetting[] {
  return characterDefaultSettingsForBand(band).map(setting => ({
    field_key: setting.field_key,
    label: setting.label,
    short_label: setting.short_label,
    description: setting.description,
    sort_order: setting.sort_order,
    is_active: setting.is_active,
    max_score: setting.max_score,
  }))
}

function normalizeCharacterSetting(row: DbRow, band: EducationBand = '4'): ReportCharacterSetting {
  const defaults = characterDefaultSettingsForBand(band).find(item => item.field_key === asText(row.field_key))
  return {
    field_key: asText(row.field_key),
    label: asText(row.label) || defaults?.label || '',
    short_label: asText(row.short_label) || defaults?.short_label || '',
    description: asNullableText(row.description) ?? defaults?.description ?? null,
    sort_order: asNumber(row.sort_order) || defaults?.sort_order || 1,
    is_active: row.is_active !== false,
    max_score: Math.max(0, asNumber(row.max_score ?? defaults?.max_score ?? 3)),
  }
}

async function loadCharacterSettings(
  db: ReturnType<typeof createServerClient>,
  schoolId: string,
  classroomLevel: string,
) {
  const band = educationBandFromClassroomLevel(classroomLevel)
  const { data, error } = await db.from('evaluation_settings')
    .select('field_key, label, short_label, description, sort_order, is_active, max_score')
    .eq('school_id', schoolId)
    .eq('kind', 'character')
    .eq('education_band', band)
    .order('sort_order')

  if (error || !data?.length) return defaultCharacterSettings(band)
  return (data as DbRow[]).map(row => normalizeCharacterSetting(row, band))
}

function defaultReadingSettings(band: EducationBand = '4'): ReportReadingSetting[] {
  return readingDefaultSettingsForBand(band).map(setting => ({
    field_key: setting.field_key,
    label: setting.label,
    short_label: setting.short_label,
    description: setting.description,
    group_label: setting.group_label,
    sort_order: setting.sort_order,
    is_active: setting.is_active,
    max_score: setting.max_score,
    rubric_levels: setting.rubric_levels ?? null,
  }))
}

function normalizeReadingSetting(row: DbRow, band: EducationBand = '4'): ReportReadingSetting {
  const defaults = readingDefaultSettingsForBand(band).find(item => item.field_key === asText(row.field_key))
  return {
    field_key: asText(row.field_key),
    label: asText(row.label) || defaults?.label || '',
    short_label: asText(row.short_label) || defaults?.short_label || '',
    description: asNullableText(row.description) ?? defaults?.description ?? null,
    group_label: asNullableText(row.group_label) ?? defaults?.group_label ?? null,
    sort_order: asNumber(row.sort_order) || defaults?.sort_order || 1,
    is_active: row.is_active !== false,
    max_score: Math.max(0, asNumber(row.max_score ?? defaults?.max_score ?? 3)),
    rubric_levels: normalizeRubricLevels(row.rubric_levels) ?? defaults?.rubric_levels ?? null,
  }
}

async function loadReadingSettings(
  db: ReturnType<typeof createServerClient>,
  schoolId: string,
  classroomLevel: string,
) {
  const band = educationBandFromClassroomLevel(classroomLevel)
  const { data, error } = await db.from('evaluation_settings')
    .select('field_key, label, short_label, description, group_label, sort_order, is_active, max_score, rubric_levels')
    .eq('school_id', schoolId)
    .eq('kind', 'reading')
    .eq('education_band', band)
    .order('sort_order')

  if (error || !data?.length) return defaultReadingSettings(band)
  return (data as DbRow[]).map(row => normalizeReadingSetting(row, band))
}

async function loadActivitySettings(db: ReturnType<typeof createServerClient>, schoolId: string) {
  const { data, error } = await db.from('evaluation_settings')
    .select('field_key, label, short_label, sort_order, is_active, hours_per_year')
    .eq('school_id', schoolId)
    .eq('kind', 'activities')
    .order('sort_order')

  if (error?.message?.includes('hours_per_year')) {
    const fallback = await db.from('evaluation_settings')
      .select('field_key, label, short_label, sort_order, is_active')
      .eq('school_id', schoolId)
      .eq('kind', 'activities')
      .order('sort_order')
    if (fallback.error || !fallback.data?.length) return defaultActivitySettings()
    return (fallback.data as DbRow[]).map(normalizeActivitySetting)
  }

  if (error || !data?.length) return defaultActivitySettings()
  return (data as DbRow[]).map(normalizeActivitySetting)
}

async function loadSubjectGroupHeads(db: ReturnType<typeof createServerClient>, schoolId: string) {
  const out = Object.fromEntries(SUBJECT_GROUPS.map(group => [group, ''])) as Record<string, string>
  if (!schoolId) return out
  const { data, error } = await db.from('subject_group_heads')
    .select('subject_group, head_name')
    .eq('school_id', schoolId)
  if (error) return out
  for (const row of data || []) {
    const group = asText(row.subject_group)
    if (group) out[group] = asText(row.head_name)
  }
  return out
}

const SCHOOL_SELECT_BASE = 'id, name, logo_url, stamp_url, department, area_office, district, province, director_name, vice_director_name, acting_director, academic_head_name, measurement_head_name'

async function loadReportSchool(db: ReturnType<typeof createServerClient>, schoolId: string) {
  const schoolR = await db.from('schools')
    .select(`${SCHOOL_SELECT_BASE}, acting_director_position`)
    .eq('id', schoolId)
    .maybeSingle()
  if (schoolR.error?.message?.includes('acting_director_position')) {
    const fallback = await db.from('schools')
      .select(SCHOOL_SELECT_BASE)
      .eq('id', schoolId)
      .maybeSingle()
    return fallback.data ? { ...fallback.data, acting_director_position: null } as ReportPayload['school'] : null
  }
  return schoolR.data as ReportPayload['school']
}

/**
 * ตรวจสิทธิ์ห้องเรียนด้วย query เดียว แทนการโหลด init ทั้งชุด
 * ครูประจำชั้นเท่านั้นสำหรับ pp5-class/pp6 — ครูผู้สอนตรวจผ่าน filter teacher_id ที่ class_subjects
 */
async function requireReportClassroom(
  db: ReturnType<typeof createServerClient>,
  session: Awaited<ReturnType<typeof requireReportSession>>,
  classroomId: string,
  mode?: ReportMode,
) {
  const { data } = await db.from('classrooms')
    .select('id, level, room, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id, school_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!data || asText((data as DbRow).school_id) !== session.schoolId) {
    throw new Error('ไม่มีสิทธิ์เข้าถึงห้องเรียนนี้')
  }
  const classroom: ReportClassroom = {
    id: asText((data as DbRow).id),
    level: asText((data as DbRow).level),
    room: asNumber((data as DbRow).room),
    academic_year_id: asText((data as DbRow).academic_year_id),
    homeroom_teacher_id: asNullableText((data as DbRow).homeroom_teacher_id),
    homeroom_teacher2_id: asNullableText((data as DbRow).homeroom_teacher2_id),
  }
  if (session.role === 'teacher' && (mode === 'pp5-class' || mode === 'pp6') && !isHomeroomTeacher(classroom, session.userId)) {
    throw new Error('ไม่มีสิทธิ์เข้าถึงห้องเรียนนี้')
  }
  return classroom
}

export async function fetchReportInit(mode?: ReportMode) {
  const session = await requireReportSession()
  const schoolId = session.schoolId || ''
  const db = createServerClient()
  const [school, yearsR, classroomsR, tunerR] = await Promise.all([
    loadReportSchool(db, schoolId),
    db.from('academic_years')
      .select('id, year_be, is_active, term1_start_date, term1_end_date, term2_start_date, term2_end_date')
      .eq('school_id', schoolId)
      .order('year_be', { ascending: false }),
    db.from('classrooms')
      .select('id, level, room, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
      .eq('school_id', schoolId)
      .order('level')
      .order('room'),
    // อ่านสวิตช์เมนู "ปรับ layout" แบบ defensive (ถ้าคอลัมน์ยังไม่มี ให้ถือว่าเปิด)
    db.from('schools').select('layout_tuner_enabled').eq('id', schoolId).maybeSingle(),
  ])
  const layoutTunerEnabled = (tunerR.data as { layout_tuner_enabled?: boolean } | null)?.layout_tuner_enabled !== false

  const classrooms = await filterClassroomsForSession(
    (classroomsR.data || []) as ReportClassroom[],
    session,
    db,
    schoolId,
    mode,
  )
  const teacherIds = Array.from(new Set(classrooms
    .flatMap(classroom => [classroom.homeroom_teacher_id, classroom.homeroom_teacher2_id])
    .filter((id): id is string => Boolean(id))))
  let teacherNameMap: Record<string, string> = {}
  if (teacherIds.length > 0) {
    const { data: teachers } = await db.from('users').select('id, prefix, full_name').in('id', teacherIds)
    teacherNameMap = Object.fromEntries(((teachers || []) as DbRow[]).map(teacher => [asText(teacher.id), userFullName(teacher)]))
  }

  return {
    role: session.role,
    school,
    layoutTunerEnabled,
    years: yearsR.data || [],
    classrooms: classrooms.map(classroom => ({
      ...classroom,
      homeroom_teacher_name: classroom.homeroom_teacher_id ? teacherNameMap[classroom.homeroom_teacher_id] || '' : '',
      homeroom_teacher2_name: classroom.homeroom_teacher2_id ? teacherNameMap[classroom.homeroom_teacher2_id] || '' : '',
    })),
  }
}

export async function fetchReportSubjects(params: {
  academicYearId: string
  classroomId: string
  mode?: ReportMode
}) {
  const session = await requireReportSession()
  const db = createServerClient()
  await requireReportClassroom(db, session, params.classroomId, params.mode)

  let query = db.from('class_subjects')
    .select('id, order_number, subject_id, teacher_id, subjects(id, code, name, short_name, subject_group, type, hours_per_year, credits, max_score), users(prefix, full_name)')
    .eq('classroom_id', params.classroomId)
    .eq('academic_year_id', params.academicYearId)
    .order('order_number')
  if (session.role === 'teacher' && params.mode === 'pp5-subject') {
    query = query.eq('teacher_id', session.userId)
  }
  const rows = await safeRows<DbRow>(query)

  return rows.map(normalizeSubject)
}

export async function fetchReportData(params: {
  academicYearId: string
  classroomId: string
  term: 0 | 1 | 2
  classSubjectId?: string
  mode?: ReportMode
}) {
  const session = await requireReportSession()
  const schoolId = session.schoolId || ''
  const db = createServerClient()

  let subjectQuery = db.from('class_subjects')
    .select('id, order_number, subject_id, teacher_id, subjects(id, code, name, short_name, subject_group, type, hours_per_year, credits, max_score), users(prefix, full_name)')
    .eq('classroom_id', params.classroomId)
    .eq('academic_year_id', params.academicYearId)
    .order('order_number')
  if (session.role === 'teacher' && params.mode === 'pp5-subject') {
    subjectQuery = subjectQuery.eq('teacher_id', session.userId)
    if (params.classSubjectId) subjectQuery = subjectQuery.eq('id', params.classSubjectId)
  }

  const [school, classroomBase, yearRow, students, classSubjectRows] = await Promise.all([
    loadReportSchool(db, schoolId),
    requireReportClassroom(db, session, params.classroomId, params.mode),
    db.from('academic_years')
      .select('id, year_be, is_active, term1_start_date, term1_end_date, term2_start_date, term2_end_date')
      .eq('id', params.academicYearId)
      .eq('school_id', schoolId)
      .maybeSingle()
      .then(result => result.data as ReportYear | null),
    safeRows<ReportStudent>(db.from('students')
      .select('id, student_number, student_code, national_id, prefix, first_name, last_name, status')
      .eq('classroom_id', params.classroomId)
      .order('student_number')),
    safeRows<DbRow>(subjectQuery),
  ])
  const academicYear = yearRow || null
  const range = termRange(academicYear, params.term)

  if (session.role === 'teacher' && params.mode === 'pp5-subject' && classSubjectRows.length === 0) {
    throw new Error('ไม่มีสิทธิ์เข้าถึงห้องเรียนนี้')
  }
  if (params.classSubjectId && params.mode === 'pp5-subject') {
    const allowed = classSubjectRows.some(row => asText(row.id) === params.classSubjectId)
    if (!allowed) throw new Error('ไม่มีสิทธิ์เข้าถึงรายวิชานี้')
  }

  const subjects = classSubjectRows.map(normalizeSubject)
  const subjectIds = subjects.map(subject => subject.class_subject_id)
  const studentIds = students.map(student => student.id)

  const homeroomIds = [classroomBase.homeroom_teacher_id, classroomBase.homeroom_teacher2_id]
    .filter((id): id is string => Boolean(id))
  const [subjectGroupHeads, documentSignatures, digitalReference, activitySettings, characterSettings, readingSettings, homeroomTeachers] = await Promise.all([
    loadSubjectGroupHeads(db, schoolId),
    loadReportDocumentSignatures(db, {
      mode: params.mode,
      classSubjectId: params.classSubjectId,
      classroomId: params.classroomId,
      academicYearId: params.academicYearId,
      term: params.term,
    }),
    loadReportDigitalReference({
      mode: params.mode || 'pp5-subject',
      classSubjectId: params.classSubjectId,
      classroomId: params.classroomId,
      academicYearId: params.academicYearId,
      term: params.term,
    }),
    loadActivitySettings(db, schoolId),
    loadCharacterSettings(db, schoolId, classroomBase.level),
    loadReadingSettings(db, schoolId, classroomBase.level),
    homeroomIds.length > 0
      ? safeRows<DbRow>(db.from('users').select('id, prefix, full_name').in('id', homeroomIds))
      : Promise.resolve([] as DbRow[]),
  ])
  const homeroomNameMap = Object.fromEntries(homeroomTeachers.map(teacher => [asText(teacher.id), userFullName(teacher)]))
  const classroom: ReportClassroom = {
    ...classroomBase,
    homeroom_teacher_name: classroomBase.homeroom_teacher_id ? homeroomNameMap[classroomBase.homeroom_teacher_id] || '' : '',
    homeroom_teacher2_name: classroomBase.homeroom_teacher2_id ? homeroomNameMap[classroomBase.homeroom_teacher2_id] || '' : '',
  }

  if (studentIds.length === 0) {
    return {
      school,
      years: academicYear ? [academicYear] : [],
      classrooms: [classroom],
      classroom,
      academicYear,
      students,
      subjects,
      scores: [],
      scoreConfigs: [],
      dailyAttendanceRecords: [],
      holidays: [],
      weekendSchoolDays: [],
      dailyAttendance: {},
      hourlyAttendance: {},
      hourlyAttendanceRecords: [],
      evaluations: { character: [], reading: [], competency: [], activities: [] },
      activitySettings,
      characterSettings,
      readingSettings,
      subjectGroupHeads,
      documentSignatures,
      digitalReference,
      error: null,
    } satisfies ReportPayload
  }

  let scoreQuery = db.from('scores').select('*').in('student_id', studentIds)
  if (params.term !== 0) scoreQuery = scoreQuery.eq('term', params.term)
  const limitedScoreQuery = subjectIds.length ? scoreQuery.in('class_subject_id', subjectIds) : scoreQuery

  const dailyQuery = db.from('daily_attendance').select('student_id, status, date').eq('classroom_id', params.classroomId).in('student_id', studentIds)
  if (range.start) dailyQuery.gte('date', range.start)
  if (range.end) dailyQuery.lte('date', range.end)

  // ตารางเช็คเวลารายชั่วโมงใช้เฉพาะ ปพ.5 รายวิชา — รายห้อง/ปพ.6 ใช้เช็คชื่อรายวันแทน จึงไม่ต้องดึง
  const needsHourly = params.mode === 'pp5-subject' || !params.mode
  const hourlyQuery = db.from('hourly_attendance').select('student_id, status, class_subject_id, term, week_number, hour_number')
  if (!needsHourly) {
    hourlyQuery.eq('class_subject_id', '__none__')
  } else if (params.classSubjectId) {
    hourlyQuery.eq('class_subject_id', params.classSubjectId)
  } else if (subjectIds.length) {
    hourlyQuery.in('class_subject_id', subjectIds)
  } else {
    hourlyQuery.eq('class_subject_id', '__none__')
  }
  if (params.term !== 0) hourlyQuery.eq('term', params.term)

  const [scores, scoreConfigs, dailyRows, hourlyRowsRaw, holidays, weekendSchoolDays, character, reading, competency, activities] = await Promise.all([
    safeRows<DbRow>(limitedScoreQuery),
    safeRows<DbRow>(subjectIds.length ? db.from('score_configs').select('*').in('class_subject_id', subjectIds) : db.from('score_configs').select('*').eq('class_subject_id', '__none__')),
    safeRows<DbRow>(dailyQuery),
    needsHourly ? safeRows<DbRow>(hourlyQuery) : Promise.resolve([] as DbRow[]),
    safeRows<DbRow>(db.from('holidays').select('date, name')
      .eq('academic_year_id', params.academicYearId)
      .gte('date', range.start || '1900-01-01')
      .lte('date', range.end || '2999-12-31')),
    safeRows<DbRow>(db.from('weekend_school_days').select('date, name')
      .eq('academic_year_id', params.academicYearId)
      .gte('date', range.start || '1900-01-01')
      .lte('date', range.end || '2999-12-31')),
    safeRows<ReportEvaluationRow>(db.from('character_traits').select('*')
      .eq('academic_year_id', params.academicYearId)
      .filter('term', params.term === 0 ? 'gte' : 'eq', params.term === 0 ? 1 : params.term)
      .in('student_id', studentIds)),
    safeRows<ReportEvaluationRow>(db.from('reading_evaluation').select('*')
      .eq('academic_year_id', params.academicYearId)
      .filter('term', params.term === 0 ? 'gte' : 'eq', params.term === 0 ? 1 : params.term)
      .in('student_id', studentIds)),
    safeRows<ReportEvaluationRow>(db.from('competency_evaluation').select('*')
      .eq('academic_year_id', params.academicYearId)
      .filter('term', params.term === 0 ? 'gte' : 'eq', params.term === 0 ? 1 : params.term)
      .in('student_id', studentIds)),
    safeRows<ReportEvaluationRow>(db.from('activities_evaluation').select('*')
      .eq('academic_year_id', params.academicYearId)
      .in('student_id', studentIds)),
  ])

  const studentIdSet = new Set(studentIds)
  const hourlyRows = hourlyRowsRaw.filter(row => studentIdSet.has(asText(row.student_id)))

  return {
    school,
    years: academicYear ? [academicYear] : [],
    classrooms: [classroom],
    classroom,
    academicYear,
    students,
    subjects,
    scores: scores.map(row => ({
      student_id: asText(row.student_id),
      class_subject_id: asText(row.class_subject_id),
      term: asNumber(row.term || params.term),
      unit_scores: (row.unit_scores && typeof row.unit_scores === 'object' ? row.unit_scores : {}) as Record<string, number>,
      between_total: asNullableNumber(row.between_total),
      midterm_score: asNullableNumber(row.midterm_score),
      final_score: asNullableNumber(row.final_score),
      term_total: asNullableNumber(row.term_total),
      year_total: asNullableNumber(row.year_total),
      grade: asNullableNumber(row.grade),
      result: asNullableText(row.result),
    })),
    scoreConfigs: scoreConfigs.map(row => ({
      class_subject_id: asText(row.class_subject_id),
      term: asNumber(row.term),
      unit_count: asNumber(row.unit_count),
      between_scores: Array.isArray(row.between_scores) ? row.between_scores.map(asNumber) : [],
      midterm_max: asNumber(row.midterm_max),
      final_max: asNumber(row.final_max),
      total_max: asNumber(row.total_max),
    })),
    dailyAttendanceRecords: dailyRows.map(row => ({
      student_id: asText(row.student_id),
      date: asText(row.date),
      status: asText(row.status),
    })),
    holidays: holidays.map(row => ({ date: asText(row.date), name: asNullableText(row.name) })),
    weekendSchoolDays: weekendSchoolDays.map(row => ({ date: asText(row.date), name: asNullableText(row.name) })),
    dailyAttendance: summarizeDaily(dailyRows),
    hourlyAttendance: summarizeHourly(hourlyRows),
    hourlyAttendanceRecords: hourlyRows.map(row => ({
      student_id: asText(row.student_id),
      class_subject_id: asText(row.class_subject_id),
      term: (asNumber(row.term) === 2 ? 2 : 1) as 1 | 2,
      week_number: asNumber(row.week_number),
      hour_number: asNumber(row.hour_number),
      status: asText(row.status),
    })),
    evaluations: { character, reading, competency, activities },
    activitySettings,
    characterSettings,
    readingSettings,
    subjectGroupHeads,
    documentSignatures,
    digitalReference,
    error: null,
  } satisfies ReportPayload
}

export type ReportPp6StudentOption = {
  id: string
  student_number: number
  student_code: string | null
  prefix: string | null
  first_name: string
  last_name: string
  classroom_id: string
  classroom_label: string
}

export async function fetchPp6Students(academicYearId: string) {
  const session = await requireReportSession()
  const db = createServerClient()
  const allClassrooms = await safeRows<ReportClassroom>(
    db.from('classrooms')
      .select('id, level, room, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
      .eq('school_id', session.schoolId || '')
      .eq('academic_year_id', academicYearId)
      .order('level')
      .order('room'),
  )
  const classrooms = session.role === 'teacher'
    ? allClassrooms.filter(classroom => isHomeroomTeacher(classroom, session.userId))
    : allClassrooms
  const classroomIds = classrooms.map(classroom => classroom.id)
  if (classroomIds.length === 0) return [] as ReportPp6StudentOption[]

  const rows = await safeRows<DbRow>(
    db.from('students')
      .select('id, student_number, student_code, prefix, first_name, last_name, classroom_id')
      .in('classroom_id', classroomIds)
      .order('student_number'),
  )
  const classroomLabelMap = Object.fromEntries(
    classrooms.map(classroom => [classroom.id, `${classroom.level}/${classroom.room}`]),
  )

  return rows.map(row => ({
    id: asText(row.id),
    student_number: asNumber(row.student_number),
    student_code: asNullableText(row.student_code),
    prefix: asNullableText(row.prefix),
    first_name: asText(row.first_name),
    last_name: asText(row.last_name),
    classroom_id: asText(row.classroom_id),
    classroom_label: classroomLabelMap[asText(row.classroom_id)] || '-',
  }))
}
