import type { SupabaseClient } from '@supabase/supabase-js'
import { classSubjectSemesterForLevel } from '@/lib/class-subject-term'

export type ClassSubjectCopyInput = {
  sourceClassroomId: string
  targetClassroomId: string
  academicYearId: string
  term: 1 | 2
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function checkDatabaseError(error: { message: string } | null) {
  if (!error) return
  if (/semester|no unique or exclusion constraint/i.test(error.message)) {
    throw new Error('กรุณารัน migration 068 สำหรับรายวิชาแยกภาคเรียนก่อนคัดลอก')
  }
  throw new Error(error.message)
}

/** The school ID must come from the authenticated server session. */
export async function prepareClassSubjectCopy(db: SupabaseClient, schoolId: string, input: ClassSubjectCopyInput) {
  if (!input || ![input.sourceClassroomId, input.targetClassroomId, input.academicYearId].every(id => typeof id === 'string' && UUID.test(id))
    || (input.term !== 1 && input.term !== 2)) throw new Error('กรุณาเลือกปีการศึกษา ห้องต้นทาง ห้องปลายทาง และภาคเรียนให้ถูกต้อง')
  if (input.sourceClassroomId === input.targetClassroomId) throw new Error('ห้องต้นทางและปลายทางต้องเป็นคนละห้อง')

  const rooms = await db.from('classrooms').select('id,level,room')
    .eq('school_id', schoolId).eq('academic_year_id', input.academicYearId)
    .in('id', [input.sourceClassroomId, input.targetClassroomId])
  checkDatabaseError(rooms.error)
  const source = rooms.data?.find(room => room.id === input.sourceClassroomId)
  const target = rooms.data?.find(room => room.id === input.targetClassroomId)
  if (!source || !target) throw new Error('ห้องต้นทางและปลายทางต้องอยู่ในโรงเรียนและปีการศึกษาที่เลือก')
  const sourceSemester = classSubjectSemesterForLevel(source.level, input.term)
  const targetSemester = classSubjectSemesterForLevel(target.level, input.term)
  const sourceRows = await db.from('class_subjects').select('subject_id,order_number')
    .eq('classroom_id', source.id).eq('academic_year_id', input.academicYearId)
    .eq('semester', sourceSemester).order('order_number')
  checkDatabaseError(sourceRows.error)
  const subjectIds = [...new Set<string>((sourceRows.data || []).map(row => String(row.subject_id)))]
  if (!subjectIds.length) throw new Error('ห้องต้นทางยังไม่มีรายวิชาในช่วงที่เลือก')
  const subjects = await db.from('subjects').select('id').eq('school_id', schoolId).in('id', subjectIds)
  checkDatabaseError(subjects.error)
  if (subjects.data?.length !== subjectIds.length) throw new Error('พบรายวิชาต้นทางที่ไม่อยู่ในโรงเรียน กรุณาตรวจสอบข้อมูลก่อนคัดลอก')
  const targetRows = await db.from('class_subjects').select('subject_id,order_number')
    .eq('classroom_id', target.id).eq('academic_year_id', input.academicYearId).eq('semester', targetSemester)
  checkDatabaseError(targetRows.error)
  const have = new Set((targetRows.data || []).map(row => row.subject_id))
  let order = Math.max(0, ...(targetRows.data || []).map(row => Number(row.order_number) || 0))
  const rows = subjectIds.filter(id => !have.has(id)).map(subjectId => ({
    classroom_id: target.id, subject_id: subjectId, academic_year_id: input.academicYearId,
    semester: targetSemester, teacher_id: null, order_number: ++order,
  }))
  return {
    rows, subjectIds,
    sourceLabel: `${source.level}/${source.room} · ${sourceSemester ? `ภาคเรียนที่ ${sourceSemester}` : 'ทั้งปี'}`,
    targetLabel: `${target.level}/${target.room} · ${targetSemester ? `ภาคเรียนที่ ${targetSemester}` : 'ทั้งปี'}`,
    total: subjectIds.length, added: rows.length, skipped: subjectIds.length - rows.length,
  }
}

export async function executeClassSubjectCopy(db: SupabaseClient, schoolId: string, input: ClassSubjectCopyInput, confirmedSubjectIds: string[]) {
  const plan = await prepareClassSubjectCopy(db, schoolId, input)
  const confirmed = new Set(Array.isArray(confirmedSubjectIds) ? confirmedSubjectIds : [])
  if (confirmed.size !== plan.subjectIds.length || plan.subjectIds.some(id => !confirmed.has(id))) {
    throw new Error('รายวิชาของห้องต้นทางเปลี่ยนแล้ว กรุณาตรวจสอบและยืนยันคัดลอกอีกครั้ง')
  }
  if (!plan.rows.length) return { added: 0, skipped: plan.total }
  // One atomic statement; concurrent/repeated requests never update existing offerings.
  const result = await db.from('class_subjects').upsert(plan.rows, {
    onConflict: 'classroom_id,subject_id,academic_year_id,semester', ignoreDuplicates: true,
  }).select('id')
  checkDatabaseError(result.error)
  const added = result.data?.length || 0
  return { added, skipped: plan.total - added }
}
