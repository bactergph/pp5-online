'use server'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { fetchReportInit } from '@/app/(shell)/reports/actions'

export async function fetchNameListExportInit() {
  return fetchReportInit('pp5-class')
}

export async function fetchNameListStudents(classroomId: string) {
  const session = await getSession()
  if (!session?.schoolId) throw new Error('ไม่มีสิทธิ์')

  const db = createServerClient()
  const { data: classroom } = await db
    .from('classrooms')
    .select('id, level, room, school_id, academic_year_id')
    .eq('id', classroomId)
    .maybeSingle()

  if (!classroom || classroom.school_id !== session.schoolId) {
    throw new Error('ไม่พบห้องเรียน')
  }

  const [{ data: year }, { data: school }, { data: students }] = await Promise.all([
    db.from('academic_years').select('year_be').eq('id', classroom.academic_year_id).maybeSingle(),
    db.from('schools').select('name').eq('id', session.schoolId).maybeSingle(),
    db.from('students')
      .select('student_number, student_code, prefix, first_name, last_name, gender, status')
      .eq('classroom_id', classroomId)
      .order('student_number'),
  ])

  return {
    schoolName: school?.name || 'โรงเรียน',
    yearBe: year?.year_be || 0,
    classroomLabel: `${classroom.level}/${classroom.room}`,
    students: students || [],
  }
}
