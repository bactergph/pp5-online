import 'server-only'
import { createServerClient } from '@/lib/supabase'
import {limitsToOwnSubjects} from '@/lib/personal-data-scope'
import {isSecondaryClassLevel} from '@/lib/class-level'
import {readScoreTerms,scoreTermVisible,teacherOwnsOffering} from '@/lib/class-subject-offer'

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
  const loaded = await db.from('class_subjects')
    .select('academic_year_id, classroom_id, teacher_id, co_teacher_ids, score_terms, semester, classrooms(level, school_id, academic_year_id)').eq('id', classSubjectId).maybeSingle()
  const subjectResult = loaded.error && /co_teacher_ids|score_terms/.test(loaded.error.message)
    ? await db.from('class_subjects').select('academic_year_id, classroom_id, teacher_id, semester, classrooms(level, school_id, academic_year_id)').eq('id', classSubjectId).maybeSingle()
    : loaded
  const subject = subjectResult.data as { academic_year_id: string; classroom_id: string; teacher_id: string | null; co_teacher_ids?: string[] | null; score_terms?: unknown; semester: number | null; classrooms: { level: string; school_id: string; academic_year_id: string } | { level: string; school_id: string; academic_year_id: string }[] | null } | null
  if (subjectResult.error || !subject || (classroomId && classroomId !== subject.classroom_id)) {
    return { error: 'ไม่พบรายวิชาหรือห้องเรียน' }
  }
  const room = (Array.isArray(subject.classrooms) ? subject.classrooms[0] : subject.classrooms) as { level: string; school_id: string; academic_year_id: string } | null
  if (!room || room.school_id !== session.schoolId || room.academic_year_id !== subject.academic_year_id) return { error: 'ไม่พบรายวิชาหรือห้องเรียนในโรงเรียนนี้' }
  if (!scoreTermVisible(subject.semester, subject.score_terms, term)) return { error: 'รายวิชานี้ไม่ได้เปิดบันทึกคะแนนในภาคเรียนที่เลือก' }
  if (await limitsToOwnSubjects(session) && !teacherOwnsOffering(subject, session.userId)) return { error: 'บันทึกได้เฉพาะรายวิชาที่ตนรับผิดชอบ' }
  const { data: year, error } = await db.from('academic_years')
    .select('year_be, term1_scores_open, term2_scores_open')
    .eq('id', subject.academic_year_id).eq('school_id', session.schoolId).maybeSingle()
  if (error || !year) return { error: 'ตรวจสอบสถานะการบันทึกคะแนนไม่ได้ กรุณาติดต่อผู้ดูแลระบบ' }
  const open = term === 1 ? year.term1_scores_open : year.term2_scores_open
  return {
    open: open === true,
    classroomId: subject.classroom_id as string,
    classroomLevel: room.level,
    annual: !isSecondaryClassLevel(room.level) && subject.semester !== 1 && subject.semester !== 2,
    scoreTerms: subject.semester === 1 || subject.semester === 2 ? [subject.semester] : readScoreTerms(subject.score_terms),
    error: open === true ? undefined : `ปิดการบันทึกคะแนน ปีการศึกษา ${year.year_be} ภาคเรียนที่ ${term} แล้ว`,
  }
}
