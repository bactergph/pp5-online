export const BACKUP_FORMAT = 'jarnsek-school-backup'
export const BACKUP_VERSION = 1
export const BACKUP_FOLDER = 'สำรองข้อมูล'

export const SCHOOL_PROFILE_KEYS = [
  'name',
  'department',
  'area_office',
  'district',
  'province',
  'address',
  'phone',
  'document_prefix',
  'director_name',
  'vice_director_name',
  'acting_director',
  'academic_head_name',
  'measurement_head_name',
  'logo_url',
  'stamp_url',
  'program_name',
  'acting_director_position',
  'director_user_id',
  'vice_director_user_id',
  'acting_director_user_id',
  'academic_head_user_id',
  'measurement_head_user_id',
  'layout_tuner_enabled',
  'education_type',
] as const

export const BACKUP_SECTIONS = [
  { key: 'school', label: 'ข้อมูลโรงเรียน', tables: ['school'] },
  { key: 'staff', label: 'บุคลากร', tables: ['users'] },
  { key: 'catalog', label: 'รายวิชาและเกณฑ์', tables: ['subjects', 'subject_group_heads', 'school_subject_groups', 'evaluation_settings', 'clubs'] },
  { key: 'rooms', label: 'ห้องเรียนและนักเรียน', tables: ['classrooms', 'students', 'period_config', 'holidays', 'personal_homeroom_rooms', 'weekend_school_days'] },
  { key: 'teaching', label: 'วิชาที่เปิดสอน', tables: ['class_subjects', 'teacher_permissions', 'score_configs'] },
  { key: 'scores', label: 'คะแนนและเกรด', tables: ['scores'] },
  { key: 'attendance', label: 'มาเรียนและเวลาเรียน', tables: ['daily_attendance', 'hourly_attendance', 'daily_activities'] },
  { key: 'schedule', label: 'ตารางเรียน', tables: ['school_period_times', 'class_schedule_activities', 'class_schedule_slots', 'schedule_plans', 'schedule_drafts', 'schedule_teacher_blocks', 'schedule_substitute_days', 'schedule_substitute_entries', 'substitute_documents', 'device_schedule_uploads'] },
  { key: 'development', label: 'ประเมินผลและสุขภาพ', tables: ['character_traits', 'reading_evaluation', 'activities_evaluation', 'competency_evaluation', 'evaluation_custom_scores', 'teacher_comments', 'student_health', 'health_inspection', 'student_club_assignments'] },
  { key: 'documents', label: 'เอกสารและการอนุมัติ', tables: ['approval_signatures', 'class_document_approvals', 'document_approval_submissions', 'approved_document_exports', 'document_references'] },
] as const

export const BACKUP_IMPORT_NOTES = [
  'แทนที่นักเรียน คะแนน เกรด การมาเรียน เวลาเรียน ตารางเรียน วันหยุด และการอนุมัติของปีการศึกษานี้',
  'อัปเดตข้อมูลโรงเรียน บุคลากร รายวิชา กลุ่มสาระ เกณฑ์ และเวลาคาบของโรงเรียน',
  'ไม่เปลี่ยนรหัสโรงเรียน การเชื่อม Google Drive แพ็กเกจสมาชิก และปีการศึกษาที่กำลังใช้งาน',
  'ไม่ลบบุคลากรที่ไม่มีในไฟล์ บัญชีที่ถูกสร้างจากไฟล์ต้องตั้งรหัสผ่านใหม่',
  'บัญชีที่กำลังนำเข้าจะไม่ถูกเปลี่ยนชื่อผู้ใช้ บทบาท หรือสถานะเข้าสู่ระบบ',
] as const

export type BackupSchool = { id: string; code: string; name: string }
export type BackupYear = { id: string; yearBe: number }
export type BackupData = Record<string, unknown>
export type BackupPayload = {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  school: BackupSchool
  academicYear: BackupYear
  counts: Record<string, number>
  data: BackupData
}

export type BackupSectionSummary = { key: string; label: string; count: number }
export type BackupSummary = {
  school: BackupSchool
  academicYear: BackupYear
  exportedAt: string
  sections: BackupSectionSummary[]
  total: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function schoolProfile(row: Record<string, unknown>) {
  const profile: Record<string, unknown> = {}
  for (const key of SCHOOL_PROFILE_KEYS) profile[key] = row[key] ?? null
  return profile
}

export function schoolBackupFileName(schoolName: string, yearBe: number, at = new Date()) {
  const school = schoolName.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'ไม่ระบุชื่อ'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const part = (type: string) => parts.find(item => item.type === type)?.value || ''
  const stamp = `${part('year')}${part('month')}${part('day')}${part('hour')}${part('minute')}`
  return `Database_โรงเรียน ${school} ปีการศึกษา ${yearBe} ${stamp}.json`
}

export function backupImportAccepted(accept: unknown) {
  return accept === true
}

function asRecord(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}ไม่ถูกต้อง`)
  return value as Record<string, unknown>
}

function rowCount(value: unknown) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return 1
  return 0
}

export function summarizeBackup(value: unknown): BackupSummary {
  const payload = assertBackupPayload(value)
  const sections = BACKUP_SECTIONS.map(section => ({
    key: section.key,
    label: section.label,
    count: section.tables.reduce((sum, table) => sum + rowCount(payload.data[table]), 0),
  }))
  return {
    school: payload.school,
    academicYear: payload.academicYear,
    exportedAt: payload.exportedAt,
    sections,
    total: sections.reduce((sum, section) => sum + section.count, 0),
  }
}

export function assertBackupPayload(value: unknown, schoolId?: string): BackupPayload {
  const payload = asRecord(value, 'ไฟล์สำรอง')
  if (payload.format !== BACKUP_FORMAT || payload.version !== BACKUP_VERSION) {
    throw new Error('ไฟล์นี้ไม่ใช่ข้อมูลสำรองของจารย์เสก')
  }
  const school = asRecord(payload.school, 'โรงเรียนในไฟล์')
  const year = asRecord(payload.academicYear, 'ปีการศึกษาในไฟล์')
  const data = asRecord(payload.data, 'ข้อมูลในไฟล์')
  const yearRow = asRecord(data.academicYear, 'ปีการศึกษาในไฟล์')
  if (typeof school.id !== 'string' || !UUID.test(school.id)) throw new Error('ไฟล์สำรองไม่มีรหัสโรงเรียน')
  if (typeof school.name !== 'string' || !school.name.trim()) throw new Error('ไฟล์สำรองไม่มีชื่อโรงเรียน')
  if (typeof school.code !== 'string') throw new Error('ไฟล์สำรองไม่มีรหัสเข้าโรงเรียน')
  if (typeof year.id !== 'string' || !UUID.test(year.id)) throw new Error('ไฟล์สำรองไม่มีรหัสปีการศึกษา')
  if (!Number.isInteger(year.yearBe) || Number(year.yearBe) < 2500) throw new Error('ปีการศึกษาในไฟล์ไม่ถูกต้อง')
  if (yearRow.id !== year.id || Number(yearRow.year_be) !== year.yearBe) throw new Error('รายละเอียดปีการศึกษาในไฟล์ไม่ตรงกัน')
  if (typeof payload.exportedAt !== 'string' || Number.isNaN(Date.parse(payload.exportedAt))) throw new Error('ไฟล์สำรองไม่มีเวลาที่ส่งออก')
  if (schoolId && school.id !== schoolId) throw new Error('ไฟล์นี้เป็นของโรงเรียนอื่น นำเข้าได้เฉพาะไฟล์ของโรงเรียนที่กำลังใช้งาน')
  for (const [key, entry] of Object.entries(data)) {
    if (key === 'school' || key === 'academicYear') continue
    if (!Array.isArray(entry)) throw new Error('ข้อมูลในไฟล์ไม่ครบถ้วน')
  }
  return payload as BackupPayload
}
