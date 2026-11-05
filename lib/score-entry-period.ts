import 'server-only'
import { createServerClient } from '@/lib/supabase'
import {limitsToOwnSubjects} from '@/lib/personal-data-scope'

export async function getScoreEntryPeriod(
  session: { schoolId: string | null; role: string; userId: string; mustChangePassword?: boolean },
  classSubjectId: string,
  term: number,
  classroomId?: string,
) {
  if (term !== 1 && term !== 2) return { error: 'ภาคเรียนไม่ถูกต้อง' }
  if (session.mustChangePassword) return { error: 'กรุณาเปลี่ยนรหัสผ่านก่อนบันทึกคะแนน' }
  if (!session.schoolId) return { error: 'กรุณาเลือกโรงเรียน' }
  const db = createServerClient()
  const { data: subject, error: subjectError } = await db.from('class_subjects')
    .select('academic_year_id, classroom_id, teacher_id, semester, classrooms(level, school_id, academic_year_id)').eq('id', classSubjectId).maybeSingle()
  if (subjectError || !subject || (classroomId && classroomId !== subject.classroom_id)) {
    return { error: 'ไม่พบรายวิชาหรือห้องเรียน' }
  }
  const room = (Array.isArray(subject.classrooms) ? subject.classrooms[0] : subject.classrooms) as { level: string; school_id: string; academic_year_id: string } | null
  if (!room || room.school_id !== session.schoolId || room.academic_year_id !== subject.academic_year_id) return { error: 'ไม่พบรายวิชาหรือห้องเรียนในโรงเรียนนี้' }
  if (subject.semester && subject.semester !== term) return { error: 'รายวิชานี้ไม่ได้เปิดในภาคเรียนที่เลือก' }
  if (await limitsToOwnSubjects(session) && subject.teacher_id !== session.userId) return { error: 'บันทึกได้เฉพาะรายวิชาที่ตนรับผิดชอบ' }
  const { data: year, error } = await db.from('academic_years')
    .select('year_be, term1_scores_open, term2_scores_open')
    .eq('id', subject.academic_year_id).eq('school_id', session.schoolId).maybeSingle()
  if (error || !year) return { error: 'ตรวจสอบสถานะการบันทึกคะแนนไม่ได้ กรุณาติดต่อผู้ดูแลระบบ' }
  const open = term === 1 ? year.term1_scores_open : year.term2_scores_open
  return {
    open: open === true,
    classroomId: subject.classroom_id as string,
    classroomLevel: room.level,
    error: open === true ? undefined : `ปิดการบันทึกคะแนน ปีการศึกษา ${year.year_be} ภาคเรียนที่ ${term} แล้ว`,
  }
}
