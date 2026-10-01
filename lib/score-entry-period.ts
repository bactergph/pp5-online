import 'server-only'
import { createServerClient } from '@/lib/supabase'

export async function getScoreEntryPeriod(
  session: { schoolId: string | null; role: string; userId: string },
  classSubjectId: string,
  term: number,
  classroomId?: string,
) {
  if (term !== 1 && term !== 2) return { error: 'ภาคเรียนไม่ถูกต้อง' }
  if (!session.schoolId) return { error: 'กรุณาเลือกโรงเรียน' }
  const db = createServerClient()
  const { data: subject, error: subjectError } = await db.from('class_subjects')
    .select('academic_year_id, classroom_id, teacher_id').eq('id', classSubjectId).maybeSingle()
  if (subjectError || !subject || (classroomId && classroomId !== subject.classroom_id)) {
    return { error: 'ไม่พบรายวิชาหรือห้องเรียน' }
  }
  if (session.role === 'teacher' && subject.teacher_id !== session.userId) return { error: 'ไม่มีสิทธิ์ในรายวิชานี้' }
  const { data: year, error } = await db.from('academic_years')
    .select('year_be, term1_scores_open, term2_scores_open')
    .eq('id', subject.academic_year_id).eq('school_id', session.schoolId).maybeSingle()
  if (error || !year) return { error: 'ตรวจสอบสถานะการบันทึกคะแนนไม่ได้ กรุณาติดต่อผู้ดูแลระบบ' }
  const open = term === 1 ? year.term1_scores_open : year.term2_scores_open
  return {
    open: open === true,
    classroomId: subject.classroom_id as string,
    error: open === true ? undefined : `ปิดการบันทึกคะแนน ปีการศึกษา ${year.year_be} ภาคเรียนที่ ${term} แล้ว`,
  }
}
