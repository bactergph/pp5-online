'use server'

import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { isSecondaryClassLevel } from '@/lib/class-level'
import { summarizeReading } from '@/lib/reading-summary'
import { fetchEvaluationData } from '../../actions'

export async function fetchReadingSummary(classroomId: string, yearId: string, term: 1 | 2) {
  const session = await getSession()
  if (!session || session.mustChangePassword) throw new Error('ไม่มีสิทธิ์')
  if (term !== 1 && term !== 2) throw new Error('ภาคเรียนไม่ถูกต้อง')
  const { data: room, error } = await createServerClient().from('classrooms')
    .select('id, level, room').eq('id', classroomId).eq('school_id', session.schoolId || '')
    .eq('academic_year_id', yearId).maybeSingle()
  if (error) throw new Error('โหลดห้องเรียนไม่สำเร็จ กรุณาลองใหม่')
  if (!room) throw new Error('ไม่พบห้องเรียนในปีการศึกษานี้ หรือไม่มีสิทธิ์เข้าถึง')
  const secondary = isSecondaryClassLevel(room.level)
  const terms: (1 | 2)[] = secondary ? [term] : [1, 2]
  const data = await Promise.all(terms.map(value => fetchEvaluationData('reading', classroomId, yearId, value)))
  const failed = data.find(value => value.error)
  if (failed) throw new Error(failed.error || 'โหลดผลประเมินไม่สำเร็จ')
  const students = data[0].students
  return {
    classroom: room, secondary, students,
    periods: data.map((value, index) => ({
      term: terms[index],
      rows: summarizeReading(students.map(student => student.id), value.rows, value.settings),
    })),
  }
}
