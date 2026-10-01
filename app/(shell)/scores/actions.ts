'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity, resolveClassSubjectContext } from '@/lib/audit'
import { getScoreEntryPeriod } from '@/lib/score-entry-period'

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  return session
}

const CAN_EDIT = ['admin', 'district', 'academic_head', 'deputy_principal', 'teacher']

async function loadScoreClassrooms(
  db: ReturnType<typeof createServerClient>,
  session: { userId: string; role: string; schoolId: string | null },
  yearId: string,
) {
  const schoolId = session.schoolId || ''

  if (session.role === 'teacher') {
    const { data } = await db.from('class_subjects')
      .select('classrooms!inner(id, level, room)')
      .eq('teacher_id', session.userId)
      .eq('academic_year_id', yearId)
      .eq('classrooms.school_id', schoolId)
    const map = new Map<string, { id: string; level: string; room: number }>()
    for (const row of data || []) {
      const classroom = row.classrooms as { id: string; level: string; room: number }
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
  session: { userId: string; role: string },
  classroomId: string,
) {
  let q = db.from('class_subjects').select('id, subject_id, teacher_id, order_number')
    .eq('classroom_id', classroomId).order('order_number')
  if (session.role === 'teacher') q = q.eq('teacher_id', session.userId)
  const { data } = await q
  return data || []
}

/** ปี + วิชา + ห้องของปีที่ active + วิชาในห้องแรก — ลด waterfall ตอนเปิดหน้า */
export async function fetchScoreInit() {
  const session = await requireSession()
  const db = createServerClient()
  const sid = session.schoolId || ''
  const [years, subjects] = await Promise.all([
    db.from('academic_years').select('id, year_be, is_active').eq('school_id', sid).order('year_be', { ascending: false }),
    db.from('subjects').select('id, code, name').eq('school_id', sid).order('code'),
  ])
  const yearList = years.data || []
  const active = yearList.find(y => y.is_active) || yearList[0]
  const classrooms = active ? await loadScoreClassrooms(db, session, active.id) : []
  const firstClassId = classrooms[0]?.id || ''
  const classSubjects = firstClassId ? await loadScoreSubjects(db, session, firstClassId) : []

  return {
    role: session.role,
    canEdit: CAN_EDIT.includes(session.role),
    years: yearList,
    subjects: subjects.data || [],
    activeYearId: active?.id || '',
    classrooms,
    classSubjects,
  }
}

export async function fetchScoreClassrooms(yearId: string) {
  const session = await requireSession()
  const db = createServerClient()
  return loadScoreClassrooms(db, session, yearId)
}

// วิชาในห้อง — ครูเห็นเฉพาะวิชาที่ตนสอน
export async function fetchScoreSubjects(classroomId: string) {
  const session = await requireSession()
  const db = createServerClient()
  return loadScoreSubjects(db, session, classroomId)
}

// โหลดนักเรียน + config + คะแนนเดิม สำหรับ 1 วิชา × ภาคเรียน
export async function fetchScoreEntryData(classroomId: string, classSubjectId: string, term: number) {
  const session = await requireSession()
  const period = await getScoreEntryPeriod(session, classSubjectId, term, classroomId)
  if (!period.classroomId) throw new Error(period.error)
  const db = createServerClient()
  const [studentsR, configR] = await Promise.all([
    db.from('students').select('id, student_number, prefix, first_name, last_name, status')
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
  if (term === 2 && ids.length) {
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
    term_total: number
    year_total?: number | null
    grade: number | null
    result: string
  }[],
) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  if (rows.length === 0) return { error: 'ไม่มีข้อมูล' }
  const db = createServerClient()

  // ครู: บันทึกได้เฉพาะวิชาที่ตนสอน
  const period = await getScoreEntryPeriod(session, classSubjectId, term)
  if (period.error) return { error: period.error }
  const { data: students, error: studentsError } = await db.from('students').select('id')
    .eq('classroom_id', period.classroomId).in('id', rows.map(row => row.student_id))
  if (studentsError || new Set(students?.map(student => student.id)).size !== new Set(rows.map(row => row.student_id)).size) {
    return { error: 'ข้อมูลนักเรียนไม่ตรงกับห้องเรียน' }
  }
  if (session.role === 'teacher') {
    const { data: cs } = await db.from('class_subjects')
      .select('id').eq('id', classSubjectId).eq('teacher_id', session.userId).maybeSingle()
    if (!cs) return { error: 'บันทึกคะแนนได้เฉพาะวิชาที่ตนสอน' }
  }

  // กันแก้คะแนนที่ถูกล็อก (ลงนามแล้ว)
  const { data: locked } = await db.from('scores')
    .select('student_id').eq('class_subject_id', classSubjectId).eq('term', term).eq('locked', true)
  if (locked && locked.length) return { error: 'คะแนนวิชานี้ถูกล็อก (ลงนามแล้ว) แก้ไขไม่ได้' }

  const payload = rows.map(r => ({
    student_id: r.student_id,
    class_subject_id: classSubjectId,
    term,
    unit_scores: r.unit_scores,
    between_total: r.between_total,
    midterm_score: r.midterm_score,
    final_score: r.final_score,
    term_total: r.term_total,
    year_total: r.year_total ?? null,
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
  return { error: error?.message, count: payload.length }
}
