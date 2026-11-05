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
    const { data } = await db.from('class_subjects')
      .select('classrooms!inner(id, level, room)')
      .eq('teacher_id', session.userId)
      .eq('academic_year_id', yearId)
      .eq('classrooms.school_id', schoolId)
    const map = new Map<string, { id: string; level: string; room: number }>()
    for (const row of data || []) {
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
  const { data: room, error: roomError } = await db.from('classrooms').select('id')
    .eq('id', classroomId).eq('school_id', session.schoolId || '').maybeSingle()
  if (roomError) throw new Error('โหลดห้องเรียนไม่สำเร็จ กรุณาลองใหม่')
  if (!room) throw new Error('ไม่มีสิทธิ์ดูห้องเรียนนี้')
  let q = db.from('class_subjects').select('id, classroom_id, subject_id, teacher_id, order_number')
    .eq('classroom_id', classroomId).in('semester', [0, term]).order('order_number')
  if (await limitsToOwnSubjects(session)) q = q.eq('teacher_id', session.userId)
  const result = await q
  if (result.error && /semester/.test(result.error.message)) {
    let fallback = db.from('class_subjects').select('id, classroom_id, subject_id, teacher_id, order_number')
      .eq('classroom_id', classroomId).order('order_number')
    if (await limitsToOwnSubjects(session)) fallback = fallback.eq('teacher_id', session.userId)
    const plain = await fallback
    if (plain.error) throw new Error('โหลดรายวิชาไม่สำเร็จ กรุณาลองใหม่')
    return plain.data || []
  }
  if (result.error) throw new Error('โหลดรายวิชาไม่สำเร็จ กรุณาลองใหม่')
  return result.data || []
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
  const calendarTerm = initialTerm === 'current' && secondary ? academicTermForDate(active, dailyAttendanceToday()) : null
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

// โหลดนักเรียน + config + คะแนนเดิม สำหรับ 1 วิชา × ภาคเรียน
export async function fetchScoreEntryData(classroomId: string, classSubjectId: string, term: number) {
  const session = await requireSession()
  const period = await getScoreEntryPeriod(session, classSubjectId, term, classroomId)
  if (!period.classroomId) throw new Error(period.error)
  const db = createServerClient()
  const [studentsR, configR] = await Promise.all([
    db.from('students').select('id, student_number, student_code, prefix, first_name, last_name, status')
      .eq('classroom_id', classroomId).order('student_number'),
    db.from('score_configs').select('*').eq('class_subject_id', classSubjectId).eq('term', term).maybeSingle(),
  ])
  const students = studentsR.data || []
  const ids = students.map((s: { id: string }) => s.id)
  let scores: Record<string, unknown>[] = []
  if (ids.length) {
    const { data } = await db.from('scores').select('*')
      .eq('class_subject_id', classSubjectId).eq('term', term).in('student_id', ids)
    scores = data || []
  }

  let term1Scores: Record<string, unknown>[] = []
  let term1Config: { total_max: number } | null = null
  if (!isSecondaryClassLevel(period.classroomLevel) && term === 2 && ids.length) {
    const [term1ScoresR, term1ConfigR] = await Promise.all([
      db.from('scores').select('student_id, term_total')
        .eq('class_subject_id', classSubjectId).eq('term', 1).in('student_id', ids),
      db.from('score_configs').select('total_max')
        .eq('class_subject_id', classSubjectId).eq('term', 1).maybeSingle(),
    ])
    term1Scores = term1ScoresR.data || []
    term1Config = term1ConfigR.data
  }

  return { students, config: configR.data, scores, term1Scores, term1Config, entryOpen: period.open === true, entryMessage: period.error }
}

export async function saveScores(
  classSubjectId: string,
  term: number,
  rows: {
    student_id: string
    unit_scores: Record<string, number>
    between_total: number
    midterm_score: number | null
    final_score: number | null
    term_total: number | null
    year_total?: number | null
    grade: number | null
    result: string
  }[],
) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  if (rows.length === 0) return { error: 'ไม่มีข้อมูล' }
  if (new Set(rows.map(row => row.student_id)).size !== rows.length) return { error: 'มีรายชื่อนักเรียนซ้ำ กรุณาตรวจสอบก่อนบันทึก' }
  const db = createServerClient()

  // ครู: บันทึกได้เฉพาะวิชาที่ตนสอน
  const period = await getScoreEntryPeriod(session, classSubjectId, term)
  if (period.error) return { error: period.error }
  const { data: students, error: studentsError } = await db.from('students').select('id')
    .eq('classroom_id', period.classroomId).in('id', rows.map(row => row.student_id))
  if (studentsError || new Set(students?.map(student => student.id)).size !== new Set(rows.map(row => row.student_id)).size) {
    return { error: 'ข้อมูลนักเรียนไม่ตรงกับห้องเรียน' }
  }
  if (await limitsToOwnSubjects(session)) {
    const { data: cs } = await db.from('class_subjects')
      .select('id').eq('id', classSubjectId).eq('teacher_id', session.userId).maybeSingle()
    if (!cs) return { error: 'บันทึกคะแนนได้เฉพาะวิชาที่ตนสอน' }
  }

  // กันแก้คะแนนที่ถูกล็อก (ลงนามแล้ว)
  const { data: locked, error: lockError } = await db.from('scores')
    .select('student_id').eq('class_subject_id', classSubjectId).eq('term', term).eq('locked', true)
  if (locked && locked.length) return { error: 'คะแนนวิชานี้ถูกล็อก (ลงนามแล้ว) แก้ไขไม่ได้' }
  if (lockError) return { error: 'ตรวจสอบสถานะล็อกคะแนนไม่สำเร็จ กรุณาลองใหม่', count: 0 }

  const secondary = isSecondaryClassLevel(period.classroomLevel)
  let normalizedRows = rows
  if (secondary) {
    const { data: config, error } = await db.from('score_configs').select('between_scores, midterm_max, final_max, total_max').eq('class_subject_id', classSubjectId).eq('term', term).maybeSingle()
    if (error || !config || !(Number(config.total_max) > 0)) return { error: 'กรุณากำหนดสัดส่วนคะแนนของภาคเรียนนี้ก่อน' }
    try { normalizedRows = rows.map(row => normalizeSecondaryScore(row, config)) }
    catch (error) { return { error: error instanceof Error ? error.message : 'คะแนนรายภาคไม่ถูกต้อง' } }
  }
  const payload = normalizedRows.map(r => ({
    student_id: r.student_id,
    class_subject_id: classSubjectId,
    term,
    unit_scores: r.unit_scores,
    between_total: r.between_total,
    midterm_score: r.midterm_score,
    final_score: r.final_score,
    term_total: r.term_total,
    year_total: secondary ? null : r.year_total ?? null,
    grade: r.grade,
    result: r.result,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await db.from('scores').upsert(payload, { onConflict: 'student_id,class_subject_id,term' })
  if (!error) {
    const context = await resolveClassSubjectContext(classSubjectId)
    await logActivity({
      actor: session,
      schoolId: context.schoolId ?? session.schoolId,
      action: 'upsert',
      module: 'scores',
      targetType: 'class_subject',
      targetId: classSubjectId,
      targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
      description: `บันทึกคะแนน ${context.subjectLabel || 'รายวิชา'} ${context.classroomLabel || ''} ภาคเรียน ${term} จำนวน ${payload.length} คน`.trim(),
      metadata: { classSubjectId, term, count: payload.length },
    })
  }
  return { error: error?.message, count: error ? 0 : payload.length }
}
