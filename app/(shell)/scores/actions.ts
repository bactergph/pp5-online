'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity, resolveClassSubjectContext } from '@/lib/audit'
import { isSecondaryClassLevel } from '@/lib/class-level'
import { academicTermForDate } from '@/lib/academic-term'
import { dailyAttendanceToday } from '@/lib/daily-attendance'
import { normalizeSecondaryScore, type AcademicBand } from '@/lib/secondary-academic'
import { getScoreEntryPeriod } from '@/lib/score-entry-period'
import {limitsToOwnSubjects} from '@/lib/personal-data-scope'
import {scoreTermVisible,teacherOwnsOffering} from '@/lib/class-subject-offer'
import {selectClassSubjectOfferings} from '@/lib/class-subject-term'
import { mergeScoreEdit, readScoreInputs, type ScoreEdit } from '@/lib/score-edits'

async function requireSession() {
  const session = await getSession()
  if (!session || !session.schoolId || session.mustChangePassword) throw new Error('ไม่มีสิทธิ์')
  return session
}

const CAN_EDIT = ['admin', 'district', 'academic_head', 'deputy_principal', 'teacher']

async function loadScoreClassrooms(
  db: ReturnType<typeof createServerClient>,
  session: { userId: string; role: string; schoolId: string | null },
  yearId: string,
) {
  const schoolId = session.schoolId || ''

  if (await limitsToOwnSubjects(session)) {
    const roomSelect = 'classrooms!inner(id, level, room)'
    const [{ data }, shared] = await Promise.all([
      db.from('class_subjects').select(roomSelect).eq('teacher_id', session.userId).eq('academic_year_id', yearId).eq('classrooms.school_id', schoolId),
      db.from('class_subjects').select(roomSelect).contains('co_teacher_ids', [session.userId]).eq('academic_year_id', yearId).eq('classrooms.school_id', schoolId),
    ])
    const rows = [...(data || []), ...(shared.error ? [] : shared.data || [])]
    const map = new Map<string, { id: string; level: string; room: number }>()
    for (const row of rows) {
      const joined = row.classrooms
      const classroom = (Array.isArray(joined) ? joined[0] : joined) as { id: string; level: string; room: number } | null
      if (classroom?.id) map.set(classroom.id, classroom)
    }
    return Array.from(map.values()).sort((a, b) => a.level.localeCompare(b.level, 'th') || a.room - b.room)
  }

  const { data } = await db.from('classrooms').select('id, level, room')
    .eq('school_id', schoolId).eq('academic_year_id', yearId)
    .order('level').order('room')
  return data || []
}

async function loadScoreSubjects(
  db: ReturnType<typeof createServerClient>,
  session: { userId: string; role: string; schoolId: string | null },
  classroomId: string,
  term: 1 | 2 = 1,
) {
  const { data: room, error: roomError } = await db.from('classrooms').select('id,level')
    .eq('id', classroomId).eq('school_id', session.schoolId || '').maybeSingle()
  if (roomError) throw new Error('โหลดห้องเรียนไม่สำเร็จ กรุณาลองใหม่')
  if (!room) throw new Error('ไม่มีสิทธิ์ดูห้องเรียนนี้')
  const own = await limitsToOwnSubjects(session)
  type OfferingRow = { id: string; classroom_id: string; subject_id: string; teacher_id: string | null; co_teacher_ids?: string[] | null; content_units?: unknown; score_terms?: unknown; order_number: number; semester?: number | null }
  const full = 'id, classroom_id, subject_id, teacher_id, co_teacher_ids, content_units, score_terms, order_number, semester'
  const result = await db.from('class_subjects').select(full)
    .eq('classroom_id', classroomId).in('semester', [0, term]).order('order_number')
  let rows = (result.data || []) as OfferingRow[]
  let error = result.error
  if (error && /co_teacher_ids|content_units|score_terms/.test(error.message)) {
    const legacy = await db.from('class_subjects').select('id, classroom_id, subject_id, teacher_id, order_number, semester')
      .eq('classroom_id', classroomId).in('semester', [0, term]).order('order_number')
    rows = (legacy.data || []) as OfferingRow[]
    error = legacy.error
  }
  if (error && /semester/.test(error.message)) {
    const plain = await db.from('class_subjects').select('id, classroom_id, subject_id, teacher_id, order_number')
      .eq('classroom_id', classroomId).order('order_number')
    if (plain.error) throw new Error('โหลดรายวิชาไม่สำเร็จ กรุณาลองใหม่')
    return ((plain.data || []) as OfferingRow[]).filter(row => !own || teacherOwnsOffering(row, session.userId))
  }
  if (error) throw new Error('โหลดรายวิชาไม่สำเร็จ กรุณาลองใหม่')
  return selectClassSubjectOfferings(rows, room.level, term)
    .filter(row => scoreTermVisible(row.semester, row.score_terms, term) && (!own || teacherOwnsOffering(row, session.userId)))
}

/** ปี + วิชา + ห้องของปีที่ active + วิชาในห้องแรก — ลด waterfall ตอนเปิดหน้า */
export async function fetchScoreInit(band?: AcademicBand, initialTerm: 1 | 2 | 'current' = 1) {
  const session = await requireSession()
  const db = createServerClient()
  const sid = session.schoolId || ''
  const [years, subjects] = await Promise.all([
    db.from('academic_years').select('id, year_be, is_active, term1_start_date, term1_end_date, term2_start_date, term2_end_date').eq('school_id', sid).order('year_be', { ascending: false }),
    db.from('subjects').select('id, code, name').eq('school_id', sid).order('code'),
  ])
  const yearList = years.data || []
  const active = yearList.find(y => y.is_active) || yearList[0]
  const classrooms = (active ? await loadScoreClassrooms(db, session, active.id) : []).filter(room => !band || isSecondaryClassLevel(room.level) === (band === 'secondary'))
  const firstClassId = classrooms[0]?.id || ''
  const secondary = isSecondaryClassLevel(classrooms[0]?.level)
  const calendarTerm = initialTerm === 'current' ? academicTermForDate(active, dailyAttendanceToday()) : null
  let term: 1 | 2 = initialTerm === 2 ? 2 : calendarTerm || 1
  let classSubjects = firstClassId ? await loadScoreSubjects(db, session, firstClassId, term) : []
  // Legacy secondary schools may only have semester 2 offerings and no calendar yet.
  // Choose an available semester on first load, without changing a user's explicit choice.
  if (initialTerm === 'current' && secondary && !calendarTerm && !classSubjects.length && firstClassId) {
    const otherTerm = term === 1 ? 2 : 1
    const alternative = await loadScoreSubjects(db, session, firstClassId, otherTerm)
    if (alternative.length) { term = otherTerm; classSubjects = alternative }
  }

  return {
    role: session.role,
    canEdit: CAN_EDIT.includes(session.role),
    years: yearList,
    subjects: subjects.data || [],
    activeYearId: active?.id || '',
    classrooms,
    classSubjects,
    initialTerm: term,
  }
}

export async function fetchScoreClassrooms(yearId: string, band?: AcademicBand) {
  const session = await requireSession()
  const db = createServerClient()
  return (await loadScoreClassrooms(db, session, yearId)).filter(room => !band || isSecondaryClassLevel(room.level) === (band === 'secondary'))
}

// วิชาในห้อง — ครูเห็นเฉพาะวิชาที่ตนสอน
export async function fetchScoreSubjects(classroomId: string, term: 1 | 2 = 1) {
  const session = await requireSession()
  const db = createServerClient()
  return loadScoreSubjects(db, session, classroomId, term)
}

// // โหลดนักเรียน + config + คะแนนเดิม สำหรับ 1 วิชา × ภาคเรียน
export async function fetchScoreEntryData(classroomId: string, classSubjectId: string, term: number) {
  const session = await requireSession()
  const period = await getScoreEntryPeriod(session, classSubjectId, term, classroomId)
  if (!period.classroomId) throw new Error(period.error)
  const db = createServerClient()
  const [studentsR, configR, approvalR] = await Promise.all([
    db.from('students').select('id, student_number, student_code, prefix, first_name, last_name, status')
      .eq('classroom_id', classroomId).order('student_number'),
    db.from('score_configs').select('*').eq('class_subject_id', classSubjectId).eq('term', term).maybeSingle(),
    db.from('approval_signatures').select('id').eq('class_subject_id', classSubjectId)
      .eq('status', 'approved').in('term', period.annual ? [...new Set([1, term])] : [term]).limit(1),
  ])
  if (studentsR.error || configR.error || approvalR.error) throw new Error('โหลดข้อมูลคะแนนไม่สำเร็จ')
  const students = studentsR.data || []
  const ids = students.map((s: { id: string }) => s.id)
  let scores: Record<string, unknown>[] = []
  if (ids.length) {
    const { data, error } = await db.from('scores').select('*')
      .eq('class_subject_id', classSubjectId).eq('term', term).in('student_id', ids)
    if (error) throw new Error('โหลดคะแนนเดิมไม่สำเร็จ')
    scores = data || []
  }

  let term1Scores: Record<string, unknown>[] = []
  let term1Config: { total_max: number } | null = null
  if (period.annual && period.scoreTerms.length > 1 && term === 2 && ids.length) {
    const [term1ScoresR, term1ConfigR] = await Promise.all([
      db.from('scores').select('student_id, term_total, unit_scores, midterm_score, final_score')
        .eq('class_subject_id', classSubjectId).eq('term', 1).in('student_id', ids),
      db.from('score_configs').select('total_max')
        .eq('class_subject_id', classSubjectId).eq('term', 1).maybeSingle(),
    ])
    if (term1ScoresR.error || term1ConfigR.error) throw new Error('โหลดคะแนนภาคเรียนที่ 1 ไม่สำเร็จ')
    term1Scores = (term1ScoresR.data || []).filter(row => {
      const inputs = readScoreInputs(row)
      return row.term_total != null && (Number(row.term_total) !== 0 || Object.keys(inputs.unit_scores).length > 0
        || inputs.midterm_score !== null || inputs.final_score !== null)
    }).map(row => ({ student_id: row.student_id, term_total: row.term_total }))
    term1Config = term1ConfigR.data
  }

  const locked = !!approvalR.data?.length || scores.some(row => row.locked === true)
  return {
    students, config: configR.data, scores, term1Scores, term1Config, scoreTerms: period.scoreTerms, annual: period.annual,
    entryOpen: period.open === true && !locked,
    entryMessage: locked ? 'คะแนนวิชานี้ถูกล็อก (ลงนามแล้ว)' : period.error,
  }
}

export async function saveScores(classSubjectId: string, term: number, edits: ScoreEdit[]) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  if (!Array.isArray(edits) || !edits.length) return { error: 'ไม่มีข้อมูล' }
  if (new Set(edits.map(row => row.student_id)).size !== edits.length) return { error: 'มีรายชื่อนักเรียนซ้ำ กรุณาตรวจสอบก่อนบันทึก' }

  const period = await getScoreEntryPeriod(session, classSubjectId, term)
  if (period.error || !period.classroomId) return { error: period.error || 'ไม่พบห้องเรียน' }

  const db = createServerClient()
  const ids = edits.map(row => row.student_id)
  const [students, configR] = await Promise.all([
    db.from('students').select('id, first_name, last_name').eq('classroom_id', period.classroomId).in('id', ids),
    db.from('score_configs').select('between_scores, midterm_max, final_max, total_max').eq('class_subject_id', classSubjectId).eq('term', term).maybeSingle(),
  ])
  if (students.error || students.data?.length !== ids.length) return { error: 'ข้อมูลนักเรียนไม่ตรงกับห้องเรียน' }
  if (configR.error) return { error: 'โหลดสัดส่วนคะแนนไม่สำเร็จ กรุณาลองใหม่' }
  const config = configR.data
  if (!config || !(Number(config.total_max) > 0)) return { error: 'กรุณากำหนดสัดส่วนคะแนนของภาคเรียนนี้ก่อน' }

  const primary = !isSecondaryClassLevel(period.classroomLevel)
  const term1OnlyInputs = primary && term === 1 && period.scoreTerms.includes(2)
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error: readError } = await db.from('scores').select('student_id, unit_scores, midterm_score, final_score, result, updated_at')
      .eq('class_subject_id', classSubjectId).eq('term', term).in('student_id', ids)
    if (readError) return { error: 'ตรวจสอบคะแนนล่าสุดไม่สำเร็จ กรุณาลองใหม่' }
    const current = new Map((data || []).map(row => [row.student_id, row]))
    const payload = []
    for (const edit of edits) {
      const existing = current.get(edit.student_id)
      try {
        const original = readScoreInputs(existing)
        const { changed, inputs } = mergeScoreEdit(edit.before, edit.after, original)
        if (changed) {
          const normalized = normalizeSecondaryScore({ ...inputs, result: term1OnlyInputs ? 'เรียน' : inputs.result }, config)
          payload.push({ ...normalized, student_id: edit.student_id, expected_updated_at: existing?.updated_at ?? null })
        }
      } catch (error) {
        const student = students.data.find(row => row.id === edit.student_id)
        const name = [student?.first_name, student?.last_name].filter(Boolean).join(' ')
        const message = error instanceof Error ? error.message : 'ตรวจสอบคะแนนไม่สำเร็จ'
        return { error: name ? name + ' · ' + message : message }
      }
    }
    if (!payload.length) return { count: 0 }

    const { error } = await db.rpc('save_score_edits', {
      p_school: session.schoolId, p_subject: classSubjectId, p_term: term,
      p_primary: primary, p_config: config, p_rows: payload,
    })
    if (error?.code === '40001') continue
    if (error) return { error: error.message, count: 0 }

    const context = await resolveClassSubjectContext(classSubjectId)
    await logActivity({
      actor: session,
      schoolId: context.schoolId ?? session.schoolId,
      action: 'upsert',
      module: 'scores',
      targetType: 'class_subject',
      targetId: classSubjectId,
      targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
      description: ('บันทึกคะแนน ' + (context.subjectLabel || 'รายวิชา') + ' ' + (context.classroomLabel || '') + ' ภาคเรียน ' + term + ' จำนวน ' + payload.length + ' คน').trim(),
      metadata: { classSubjectId, term, count: payload.length },
    })
    return { count: payload.length }
  }
  return { error: 'มีการบันทึกคะแนนพร้อมกัน กรุณาลองบันทึกอีกครั้ง', count: 0 }
}
