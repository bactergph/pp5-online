import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { uploadFileToDrive } from '@/lib/google-drive'
import { logActivity } from '@/lib/audit'
import {
  BACKUP_FOLDER,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  schoolBackupFileName,
  schoolProfile,
  summarizeBackup,
  type BackupPayload,
} from '@/lib/school-backup/format'
import type { BackupActor } from '@/lib/school-backup/access'

type Phase = { key: string; label: string; state: 'run' | 'done' | 'error'; detail?: string }
type Query = {
  eq: (column: string, value: string) => Query
  in: (column: string, values: string[]) => Query
  order: (column: string, options?: { ascending?: boolean }) => Query
  range: (from: number, to: number) => PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
}

const PAGE = 1000

async function fetchAll(
  db: ReturnType<typeof createServerClient>,
  table: string,
  apply: (query: Query) => Query,
  order: string[] = ['id'],
) {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    let query = db.from(table).select('*') as unknown as Query
    query = apply(query)
    for (const column of order) query = query.order(column, { ascending: true })
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const batch = data || []
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

async function fetchByIds(
  db: ReturnType<typeof createServerClient>,
  table: string,
  column: string,
  ids: string[],
  order: string[] = ['id'],
) {
  const rows: Record<string, unknown>[] = []
  const unique = [...new Set(ids)]
  for (let index = 0; index < unique.length; index += 80) {
    const chunk = unique.slice(index, index + 80)
    rows.push(...await fetchAll(db, table, query => query.in(column, chunk), order))
  }
  const seen = new Set<string>()
  return rows.filter(row => {
    const id = typeof row.id === 'string' ? row.id : ''
    if (!id || seen.has(id)) return !id
    seen.add(id)
    return true
  })
}

function ids(rows: Record<string, unknown>[]) {
  return rows.map(row => row.id).filter((id): id is string => typeof id === 'string')
}

export async function exportSchoolBackup(
  actor: BackupActor,
  yearId: string,
  onPhase: (phase: Phase) => void,
) {
  const db = createServerClient()
  onPhase({ key: 'connect', label: 'ตรวจการเชื่อม Google Drive', state: 'run' })
  const { data: school, error: schoolError } = await db.from('schools')
    .select('id, code, name, google_drive_folder_id, google_drive_refresh_token')
    .eq('id', actor.schoolId)
    .maybeSingle()
  if (schoolError) throw new Error(schoolError.message)
  if (!school) throw new Error('ไม่พบโรงเรียน')
  if (!school.google_drive_refresh_token || !school.google_drive_folder_id) {
    throw new Error('ยังไม่ได้เชื่อม Google Drive ที่เมนูข้อมูลโรงเรียน')
  }
  const { data: year, error: yearError } = await db.from('academic_years')
    .select('*')
    .eq('id', yearId)
    .eq('school_id', actor.schoolId)
    .maybeSingle()
  if (yearError) throw new Error(yearError.message)
  if (!year) throw new Error('ไม่พบปีการศึกษาของโรงเรียนนี้')
  onPhase({ key: 'connect', label: 'ตรวจการเชื่อม Google Drive', state: 'done', detail: school.name })

  onPhase({ key: 'read', label: 'อ่านข้อมูลคะแนน เกรด การมาเรียน บุคลากร รายวิชา และตารางเรียน', state: 'run' })
  const yearKey = year.id as string
  const users = await fetchAll(db, 'users', query => query.eq('school_id', actor.schoolId))
  const subjects = await fetchAll(db, 'subjects', query => query.eq('school_id', actor.schoolId))
  const subjectGroupHeads = await fetchAll(db, 'subject_group_heads', query => query.eq('school_id', actor.schoolId))
  const schoolSubjectGroups = await fetchAll(db, 'school_subject_groups', query => query.eq('school_id', actor.schoolId), ['name'])
  const evaluationSettings = await fetchAll(db, 'evaluation_settings', query => query.eq('school_id', actor.schoolId))
  const clubs = await fetchAll(db, 'clubs', query => query.eq('school_id', actor.schoolId))
  const periodTimes = await fetchAll(db, 'school_period_times', query => query.eq('school_id', actor.schoolId), ['sort_order', 'id'])
  const deviceUploads = await fetchAll(db, 'device_schedule_uploads', query => query.eq('school_id', actor.schoolId), ['school_id'])
  const classrooms = await fetchAll(db, 'classrooms', query => query.eq('school_id', actor.schoolId).eq('academic_year_id', yearKey))
  const roomIds = ids(classrooms)
  const holidays = await fetchAll(db, 'holidays', query => query.eq('academic_year_id', yearKey))
  const students = await fetchByIds(db, 'students', 'classroom_id', roomIds)
  const classSubjects = await fetchAll(db, 'class_subjects', query => query.eq('academic_year_id', yearKey))
  const offeringIds = ids(classSubjects)
  const periodConfig = await fetchByIds(db, 'period_config', 'classroom_id', roomIds)
  const teacherPermissions = await fetchByIds(db, 'teacher_permissions', 'classroom_id', roomIds)
  const scoreConfigs = await fetchByIds(db, 'score_configs', 'class_subject_id', offeringIds)
  const scores = await fetchByIds(db, 'scores', 'class_subject_id', offeringIds)
  const dailyAttendance = await fetchByIds(db, 'daily_attendance', 'classroom_id', roomIds)
  const hourlyAttendance = await fetchByIds(db, 'hourly_attendance', 'classroom_id', roomIds)
  const dailyActivities = await fetchByIds(db, 'daily_activities', 'classroom_id', roomIds)
  const byYear = (table: string, order = ['id']) => fetchAll(db, table, query => query.eq('academic_year_id', yearKey), order)
  const bySchoolYear = (table: string, order = ['id']) => fetchAll(
    db,
    table,
    query => query.eq('school_id', actor.schoolId).eq('academic_year_id', yearKey),
    order,
  )
  const [
    studentHealth, healthInspection, characterTraits, readingEvaluation, activitiesEvaluation,
    competencyEvaluation, evaluationCustomScores, teacherComments, clubAssignments,
    scheduleActivities, scheduleSlots, schedulePlans, scheduleDrafts, teacherBlocks,
    substituteDays, substituteDocuments, homeroomRooms, classApprovals, approvedExports,
  ] = await Promise.all([
    byYear('student_health'),
    byYear('health_inspection'),
    byYear('character_traits'),
    byYear('reading_evaluation'),
    byYear('activities_evaluation'),
    byYear('competency_evaluation'),
    bySchoolYear('evaluation_custom_scores'),
    byYear('teacher_comments'),
    byYear('student_club_assignments'),
    byYear('class_schedule_activities'),
    byYear('class_schedule_slots'),
    bySchoolYear('schedule_plans', ['semester']),
    bySchoolYear('schedule_drafts'),
    bySchoolYear('schedule_teacher_blocks', ['semester', 'teacher_id', 'day_of_week', 'period']),
    bySchoolYear('schedule_substitute_days'),
    bySchoolYear('substitute_documents'),
    bySchoolYear('personal_homeroom_rooms', ['classroom_id']),
    bySchoolYear('class_document_approvals'),
    bySchoolYear('approved_document_exports'),
  ])
  const substituteEntries = await fetchByIds(db, 'schedule_substitute_entries', 'substitute_day_id', ids(substituteDays))
  const submissions = await fetchByIds(db, 'document_approval_submissions', 'classroom_id', roomIds)
  const signatures = await fetchByIds(db, 'approval_signatures', 'class_subject_id', offeringIds)
  const references = await fetchByIds(db, 'document_references', 'export_id', ids(approvedExports))
  let weekendSchoolDays: Record<string, unknown>[] | null = null
  try {
    weekendSchoolDays = await byYear('weekend_school_days')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('weekend_school_days')) throw error
  }

  const { data: profileRow, error: profileError } = await db.from('schools').select('*').eq('id', actor.schoolId).single()
  if (profileError) throw new Error(profileError.message)
  const data = {
    school: schoolProfile(profileRow),
    academicYear: year,
    users,
    subjects,
    subject_group_heads: subjectGroupHeads,
    school_subject_groups: schoolSubjectGroups,
    evaluation_settings: evaluationSettings,
    clubs,
    school_period_times: periodTimes,
    device_schedule_uploads: deviceUploads,
    classrooms,
    holidays,
    students,
    class_subjects: classSubjects,
    period_config: periodConfig,
    teacher_permissions: teacherPermissions,
    score_configs: scoreConfigs,
    scores,
    daily_attendance: dailyAttendance,
    hourly_attendance: hourlyAttendance,
    daily_activities: dailyActivities,
    student_health: studentHealth,
    health_inspection: healthInspection,
    character_traits: characterTraits,
    reading_evaluation: readingEvaluation,
    activities_evaluation: activitiesEvaluation,
    competency_evaluation: competencyEvaluation,
    evaluation_custom_scores: evaluationCustomScores,
    teacher_comments: teacherComments,
    student_club_assignments: clubAssignments,
    class_schedule_activities: scheduleActivities,
    class_schedule_slots: scheduleSlots,
    schedule_plans: schedulePlans,
    schedule_drafts: scheduleDrafts,
    schedule_teacher_blocks: teacherBlocks,
    schedule_substitute_days: substituteDays,
    schedule_substitute_entries: substituteEntries,
    substitute_documents: substituteDocuments,
    personal_homeroom_rooms: homeroomRooms,
    class_document_approvals: classApprovals,
    document_approval_submissions: submissions,
    approval_signatures: signatures,
    approved_document_exports: approvedExports,
    document_references: references,
    ...(weekendSchoolDays ? { weekend_school_days: weekendSchoolDays } : {}),
  }
  const payload: BackupPayload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    school: { id: school.id, code: school.code || '', name: school.name },
    academicYear: { id: year.id, yearBe: year.year_be },
    counts: {},
    data,
  }
  payload.counts = Object.fromEntries(summarizeBackup(payload).sections.map(section => [section.key, section.count]))
  const summary = summarizeBackup(payload)
  onPhase({
    key: 'read',
    label: 'อ่านข้อมูลคะแนน เกรด การมาเรียน บุคลากร รายวิชา และตารางเรียน',
    state: 'done',
    detail: `${summary.total.toLocaleString('th-TH')} รายการ`,
  })

  const fileName = schoolBackupFileName(school.name, year.year_be)
  onPhase({ key: 'upload', label: 'อัปโหลดขึ้น Google Drive', state: 'run', detail: fileName })
  const uploaded = await uploadFileToDrive({
    schoolId: actor.schoolId,
    rootFolderId: school.google_drive_folder_id,
    folderSegments: [BACKUP_FOLDER],
    fileName,
    buffer: Buffer.from(JSON.stringify(payload)),
    mimeType: 'application/json',
  })
  if (!uploaded.fileId) throw new Error('อัปโหลดขึ้น Google Drive ไม่สำเร็จ')
  onPhase({ key: 'upload', label: 'อัปโหลดขึ้น Google Drive', state: 'done', detail: fileName })
  await logActivity({
    actor,
    schoolId: actor.schoolId,
    action: 'export',
    module: 'backup',
    targetType: 'academic_year',
    targetId: year.id,
    targetLabel: fileName,
    description: `สำรองข้อมูลปีการศึกษา ${year.year_be} ขึ้น Google Drive`,
    metadata: { total: summary.total },
  })
  return { fileName, webViewLink: uploaded.webViewLink, summary }
}
