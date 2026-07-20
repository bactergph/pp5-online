'use server'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import {
  buildSchoolMisGradesCsv,
  classroomGradeNumber,
  isGradableSchoolMisSubject,
  schoolMisExportFileName,
  schoolMisGradeCell,
  subjectCodeGradeNumber,
} from '@/lib/schoolmis-csv'
import { fetchReportInit } from '@/app/(shell)/reports/actions'

type DbRow = Record<string, unknown>

function asText(value: unknown) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
}

function asNumber(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function requireSchoolSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  if (!session.schoolId) throw new Error('ยังไม่ได้เลือกโรงเรียน')
  return session
}

export async function fetchSchoolMisExportInit() {
  return fetchReportInit('pp5-class')
}

export async function exportSchoolMisGradesCsv(params: {
  academicYearId: string
  classroomId: string
}) {
  const session = await requireSchoolSession()
  const schoolId = session.schoolId || ''
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

  const [{ data: students }, { data: classSubjectRows }] = await Promise.all([
    db.from('students')
      .select('id, student_number, student_code, prefix, first_name, last_name, status')
      .eq('classroom_id', params.classroomId)
      .order('student_number'),
    db.from('class_subjects')
      .select('id, order_number, subjects(id, code, name, subject_group, type)')
      .eq('classroom_id', params.classroomId)
      .eq('academic_year_id', params.academicYearId)
      .order('order_number'),
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
      // ถอดรหัสชั้นจากรหัสวิชาได้ → ต้องตรงชั้นห้อง; ถอดไม่ได้ → คงไว้ (วิชาของห้องนี้)
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
    const { data: scores } = await db
      .from('scores')
      .select('student_id, class_subject_id, term, grade, result')
      .in('student_id', studentIds)
      .in('class_subject_id', subjectIds)

    // ใช้เกรดภาค 2 เป็นหลัก (ระบบบันทึกเกรดตอนจบปี) fallback ภาค 1
    const byTerm = new Map<string, { grade: number | null; result: string | null }>()
    for (const row of (scores || []) as DbRow[]) {
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
  }
}
