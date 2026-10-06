import { gradeLabel } from '@/lib/grade'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'

/** ดึงเลขชั้นจากชื่อระดับ เช่น ป.4 → 4, ม.2 → 2 */
export function classroomGradeNumber(level: string | null | undefined): number | null {
  const m = String(level || '').match(/([1-6])/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 6 ? n : null
}

/**
 * ดึงเลขชั้นจากรหัสวิชา SchoolMIS เช่น ท14101 → 4, ค12101 → 2
 * (ตัวเลขตัวที่สองหลังตัวอักษรนำ: ตัวแรกเป็นระดับการศึกษา)
 */
export function subjectCodeGradeNumber(code: string | null | undefined): number | null {
  const m = String(code || '').trim().match(/^[^\d]*[1-3]([1-6])\d{3}$/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 6 ? n : null
}

/** กิจกรรมพัฒนาผู้เรียน (รหัสขึ้นต้น ก) — ไม่ส่งออกในรอบเกรด */
export function isActivitySubjectCode(code: string | null | undefined) {
  return /^ก\d/i.test(String(code || '').trim())
}

export function isGradableSchoolMisSubject(subject: {
  code: string
  subject_group?: string | null
  type?: string | null
}) {
  const code = String(subject.code || '').trim()
  if (!code || isActivitySubjectCode(code)) return false
  const group = String(subject.subject_group || '').trim()
  if (group && (SUBJECT_GROUPS as readonly string[]).includes(group)) return true
  // วิชาเพิ่มเติมที่ไม่อยู่ใน 8 กลุ่มสาระ แต่มีรหัสวิชาปกติ
  const type = String(subject.type || '')
  if (/กิจกรรม/i.test(type) || /กิจกรรม/i.test(group)) return false
  return Boolean(subjectCodeGradeNumber(code))
}

/** คอลัมน์หัว SchoolMIS: `รหัสวิชา ชื่อวิชา` */
export function schoolMisSubjectHeader(code: string, name: string) {
  const c = String(code || '').trim()
  const n = String(name || '').trim()
  return n ? `${c} ${n}` : c
}

export function schoolMisGradeCell(score: {
  grade?: number | null
  result?: string | null
} | null | undefined): string {
  if (!score) return ''
  const result = String(score.result || '').trim()
  if (result && result !== 'เรียน') return result
  if (score.grade === null || score.grade === undefined) return ''
  const n = Number(score.grade)
  if (!Number.isFinite(n)) return ''
  return gradeLabel(n)
}

export function escapeCsvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildSchoolMisGradesCsv(params: {
  students: Array<{
    id: string
    student_number: number
    student_code: string | null
    prefix: string | null
    first_name: string
    last_name: string
  }>
  subjects: Array<{ code: string; name: string; class_subject_id: string }>
  /** key = `${studentId}:${classSubjectId}` */
  gradeByKey: Record<string, string>
}) {
  const headers = ['#', 'รหัสนักเรียน', 'ชื่อ-สกุล', ...params.subjects.map(s => schoolMisSubjectHeader(s.code, s.name))]
  const lines = [headers.map(escapeCsvCell).join(',')]

  params.students.forEach((student, index) => {
    const fullName = [student.prefix, student.first_name, student.last_name].filter(Boolean).join('')
    const cells = [
      student.student_number || index + 1,
      student.student_code || '',
      fullName,
      ...params.subjects.map(subject => params.gradeByKey[`${student.id}:${subject.class_subject_id}`] || ''),
    ]
    lines.push(cells.map(escapeCsvCell).join(','))
  })

  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function schoolMisExportFileName(level: string, room: number, yearBe: number) {
  const safeLevel = String(level || 'ชั้น').replace(/[\\/:*?"<>|]+/g, '_').trim()
  return `คะแนน_${safeLevel}_ห้อง_${room}_ปี${yearBe}.csv`
}

export function canExportSchoolMisSchool(role: string) {
  return ['admin', 'academic_head', 'deputy_principal', 'principal', 'district'].includes(role)
}
export type SchoolMisSchoolRow = {
  number: number; studentCode: string; fullName: string; grades: Record<string, string>
}
export function buildSchoolMisSchoolCsv(rooms: Array<{
  level: string; room: number; subjects: { code: string; name: string }[]; rows: SchoolMisSchoolRow[]
}>) {
  const subjects = new Map<string, string>()
  for (const room of rooms) for (const subject of room.subjects) {
    if (!subjects.has(subject.code)) subjects.set(subject.code, schoolMisSubjectHeader(subject.code, subject.name))
  }
  const codes = [...subjects.keys()]
  const lines = [['#', 'ชั้น', 'ห้อง', 'รหัสนักเรียน', 'ชื่อ-สกุล', ...subjects.values()].map(escapeCsvCell).join(',')]
  for (const room of rooms) for (const student of room.rows) {
    lines.push([student.number, room.level, room.room, student.studentCode, student.fullName,
      ...codes.map(code => student.grades[code] || '')].map(escapeCsvCell).join(','))
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}
