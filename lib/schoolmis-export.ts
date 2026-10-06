import 'server-only'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { fetchAllRows } from '@/lib/supabase-paginate'
import {
  buildSchoolMisGradesCsv,
  buildSchoolMisSchoolCsv,
  canExportSchoolMisSchool,
  type SchoolMisSchoolRow,
  classroomGradeNumber,
  isGradableSchoolMisSubject,
  schoolMisExportFileName,
  schoolMisGradeCell,
  subjectCodeGradeNumber,
} from '@/lib/schoolmis-csv'

type DbRow = Record<string, unknown>

function asText(value: unknown) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
}

function asNumber(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export type SchoolMisExportResult =
  | {
      error: null
      csv: string
      fileName: string
      studentCount: number
      subjectCount: number
      level: string
      room: number
      yearBe: number
      subjects: { code: string; name: string }[]
      rows: SchoolMisSchoolRow[]
    }
  | { error: string }

/** สร้าง CSV เกรด SchoolMIS ของห้องที่เลือก */
export async function buildSchoolMisGradesExport(params: {
  academicYearId: string
  classroomId: string
}): Promise<SchoolMisExportResult> {
  const session = await getSession()
  if (!session) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const schoolId = session.schoolId
  const db = createServerClient()

  const { data: classroom } = await db
    .from('classrooms')
    .select('id, level, room, academic_year_id, school_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', params.classroomId)
    .maybeSingle()

  if (!classroom || asText((classroom as DbRow).school_id) !== schoolId) {
    return { error: 'ไม่พบห้องเรียน' }
  }
  if (asText((classroom as DbRow).academic_year_id) !== params.academicYearId) {
    return { error: 'ห้องเรียนไม่ตรงกับปีการศึกษาที่เลือก' }
  }
  if (
    session.role === 'teacher'
    && asText((classroom as DbRow).homeroom_teacher_id) !== session.userId
    && asText((classroom as DbRow).homeroom_teacher2_id) !== session.userId
  ) {
    return { error: 'เฉพาะครูประจำชั้นเท่านั้นที่ส่งออก SchoolMIS ได้' }
  }

  const { data: yearRow } = await db
    .from('academic_years')
    .select('id, year_be')
    .eq('id', params.academicYearId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!yearRow) return { error: 'ไม่พบปีการศึกษา' }

  const [students, classSubjectRows] = await Promise.all([
    fetchAllRows<DbRow>((from, to) => db.from('students')
      .select('id, student_number, student_code, prefix, first_name, last_name, status')
      .eq('classroom_id', params.classroomId)
      .order('student_number').order('id').range(from, to)),
    fetchAllRows<DbRow>((from, to) => db.from('class_subjects')
      .select('id, order_number, subjects(id, code, name, subject_group, type)')
      .eq('classroom_id', params.classroomId)
      .eq('academic_year_id', params.academicYearId)
      .order('order_number').order('id').range(from, to)),
  ])

  const level = asText((classroom as DbRow).level)
  const room = asNumber((classroom as DbRow).room)
  const gradeLevel = classroomGradeNumber(level)

  const subjects = ((classSubjectRows || []) as DbRow[])
    .map(row => {
      const subject = row.subjects as DbRow | null
      return {
        class_subject_id: asText(row.id),
        order_number: asNumber(row.order_number),
        code: asText(subject?.code),
        name: asText(subject?.name),
        subject_group: asText(subject?.subject_group),
        type: asText(subject?.type),
      }
    })
    .filter(subject => isGradableSchoolMisSubject(subject))
    .filter(subject => {
      if (gradeLevel == null) return true
      const codeGrade = subjectCodeGradeNumber(subject.code)
      return codeGrade == null || codeGrade === gradeLevel
    })
    .sort((a, b) => a.order_number - b.order_number || a.code.localeCompare(b.code, 'th'))

  const studentList = ((students || []) as DbRow[]).map(student => ({
    id: asText(student.id),
    student_number: asNumber(student.student_number),
    student_code: student.student_code == null ? null : asText(student.student_code),
    prefix: student.prefix == null ? null : asText(student.prefix),
    first_name: asText(student.first_name),
    last_name: asText(student.last_name),
  }))

  const studentIds = studentList.map(s => s.id)
  const subjectIds = subjects.map(s => s.class_subject_id)

  const gradeByKey: Record<string, string> = {}
  if (studentIds.length > 0 && subjectIds.length > 0) {
    const scores = await fetchAllRows<DbRow>((from, to) =>
      db.from('scores')
        .select('student_id, class_subject_id, term, grade, result')
        .in('student_id', studentIds)
        .in('class_subject_id', subjectIds)
        .order('student_id')
        .order('class_subject_id')
        .order('term')
        .range(from, to),
    )

    const byTerm = new Map<string, { grade: number | null; result: string | null }>()
    for (const row of scores) {
      const key = `${asText(row.student_id)}:${asText(row.class_subject_id)}:${asNumber(row.term)}`
      byTerm.set(key, {
        grade: row.grade == null ? null : Number(row.grade),
        result: row.result == null ? null : asText(row.result),
      })
    }
    for (const studentId of studentIds) {
      for (const subjectId of subjectIds) {
        const base = `${studentId}:${subjectId}`
        const cell = schoolMisGradeCell(byTerm.get(`${base}:2`))
          || schoolMisGradeCell(byTerm.get(`${base}:1`))
        if (cell) gradeByKey[base] = cell
      }
    }
  }

  const csv = buildSchoolMisGradesCsv({
    students: studentList,
    subjects,
    gradeByKey,
  })

  return {
    error: null,
    csv,
    fileName: schoolMisExportFileName(level, room, asNumber((yearRow as DbRow).year_be)),
    studentCount: studentList.length,
    subjectCount: subjects.length,
    level,
    room,
    yearBe: asNumber((yearRow as DbRow).year_be),
    subjects: subjects.map(s => ({ code: s.code, name: s.name })),
    rows: studentList.map((student, index) => ({
      number: student.student_number || index + 1, studentCode: student.student_code || '',
      fullName: [student.prefix, student.first_name, student.last_name].filter(Boolean).join(''),
      grades: Object.fromEntries(subjects.map(subject => [subject.code, gradeByKey[`${student.id}:${subject.class_subject_id}`] || ''])),
    })),
  }
}

/** One CSV for the selected school's academic year; room export remains unchanged. */
export async function buildSchoolMisSchoolExport(academicYearId: string): Promise<{ error: null; csv: string; fileName: string } | { error: string }> {
  const session = await getSession()
  if (!session?.schoolId || !canExportSchoolMisSchool(session.role)) return { error: 'ไม่มีสิทธิ์ส่งออกข้อมูลทั้งโรงเรียน' } as const
  const db = createServerClient()
  const year = await db.from('academic_years').select('year_be').eq('id', academicYearId).eq('school_id', session.schoolId).maybeSingle()
  if (year.error) throw new Error(year.error.message)
  if (!year.data) return { error: 'ไม่พบปีการศึกษาในโรงเรียนนี้' } as const
  const rooms = await fetchAllRows<{ id: string; level: string; room: number }>((from, to) =>
    db.from('classrooms').select('id, level, room').eq('school_id', session.schoolId!).eq('academic_year_id', academicYearId)
      .order('level').order('room').order('id').range(from, to))
  if (!rooms.length) return { error: 'ไม่พบห้องเรียนในปีการศึกษาที่เลือก' } as const
  rooms.sort((a, b) => a.level.localeCompare(b.level, 'th', { numeric: true }) || a.room - b.room)
  const exports: Extract<SchoolMisExportResult, { error: null }>[] = []
  // Bound parallel queries while preserving classroom order.
  for (let start = 0; start < rooms.length; start += 3) {
    const batch = await Promise.all(rooms.slice(start, start + 3).map(room => buildSchoolMisGradesExport({ academicYearId, classroomId: room.id })))
    for (const result of batch) {
      if (result.error !== null) return { error: result.error }
      exports.push(result)
    }
  }
  return { error: null, csv: buildSchoolMisSchoolCsv(exports), fileName: `คะแนน_ทั้งโรงเรียน_ปี${year.data.year_be}.csv` }
}
