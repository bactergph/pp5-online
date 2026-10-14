import 'server-only'
import { getSession } from './session'
import { createServerClient } from './supabase'
import { SCHEDULE_EDIT_ROLES } from './schedules'
import { saveStaffRows } from './staff-table'
import { preparation } from './schedule-preparation'
import { validateSubjectInputs, type SubjectInputRow } from './schedule-input'

export async function importScheduleTeachers(year: string, term: number, rows: { key: string; prefix: string; name: string; position: string }[]) {
  // Reuse the personnel service: account roles, quota and permission checks stay intact.
  const current = await preparation(year, term)
  if (!Array.isArray(rows) || !rows.length || rows.length > 50) throw Error('เพิ่มครูได้ครั้งละ 1–50 คน')
  const known = new Map(current.teachers.map(t => [`${(t.prefix || '').trim()}|${t.full_name.trim()}`, t.id]))
  const sourceKeys = new Map<string, string>()
  const filtered = rows.filter(r => {
    if (!r.name?.trim() || r.name.length > 200 || r.prefix.length > 30 || r.position.length > 100) throw Error('กรอกชื่อครูและตำแหน่งให้ถูกต้อง')
    const key = `${r.prefix.trim()}|${r.name.trim()}`
    if (known.has(key) || sourceKeys.has(key)) return false
    sourceKeys.set(key, r.key); return true
  })
  const results = filtered.length ? await saveStaffRows(filtered.map(r => ({ key: r.key, prefix: r.prefix.trim(), full_name: r.name.trim(), position: r.position.trim(), role: '', username: '', password: '', is_homeroom: false }))) : []
  return { results: rows.map(r => {
    const nameKey = `${r.prefix.trim()}|${r.name.trim()}`
    const existingId = known.get(nameKey)
    if (existingId) return { key: r.key, id: existingId }
    const outcome = results.find(result => result.key === sourceKeys.get(nameKey))
    return { key: r.key, id: outcome?.id, error: outcome?.error || (!outcome ? 'ไม่พบผลบันทึกรายการนี้ กรุณาโหลดข้อมูลล่าสุด' : undefined) }
  }), reused: rows.length - filtered.length }
}

export async function importScheduleSubjects(year: string, term: number, hash: string, rows: SubjectInputRow[]) {
  const session = await getSession()
  if (!session?.schoolId || session.mustChangePassword || !SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])) throw Error('ไม่มีสิทธิ์จัดตารางเรียน')
  validateSubjectInputs(rows)
  const current = await preparation(year, term)
  if (hash !== current.hash) throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
  for (const row of rows) {
    if (!current.classrooms.some(c => c.id === row.classroomId) || !current.teachers.some(t => t.id === row.teacherId)) throw Error('ห้องหรือครูไม่ได้อยู่ในโรงเรียนและปีการศึกษานี้')
  }
  const { error } = await createServerClient().rpc('save_schedule_input_subjects', { p_school: session.schoolId, p_year: year, p_term: term, p_hash: hash, p_rows: rows })
  if (error) throw Error(error.code === 'PGRST202' ? 'กรุณาติดตั้ง migration 064_schedule_input_subjects.sql ก่อนบันทึกรายวิชาจากตาราง' : error.message)
  return preparation(year, term)
}

/** Update existing offerings only; curriculum metadata comes from the server. */
export async function saveTeachingAssignments(year: string, term: number, hash: string, assignments: { lessonId: string; teacherId: string }[]) {
  const current = await preparation(year, term)
  if (current.hash !== hash) throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
  if (!Array.isArray(assignments) || !assignments.length || assignments.length > 500 || new Set(assignments.map(r=>r.lessonId)).size !== assignments.length) throw Error('เลือกได้ครั้งละ 1–500 รายวิชาและห้ามซ้ำ')
  const eligible = current.plan.teacherIds ?? current.teachers.map(t=>t.id)
  const rows = assignments.map(row => {
    const lesson = current.lessons.find(l=>l.id===row.lessonId && !l.activity && current.classrooms.some(c=>c.id===l.classroomId))
    if (!lesson || !eligible.includes(row.teacherId) || !current.teachers.some(t=>t.id===row.teacherId)) throw Error('รายวิชาหรือครูไม่ได้อยู่ในขอบเขตจัดตารางของโรงเรียน')
    const rule = current.plan.rules[lesson.id]
    return {classroomId:lesson.classroomId, code:lesson.code, name:lesson.fullName || lesson.name, teacherId:row.teacherId,
      count:rule?.count ?? lesson.count, pattern:rule?.pattern ?? Array(lesson.count).fill(1),
      venue:current.plan.rooms.find(r=>r.id===rule?.roomId)?.name || lesson.roomName || '', group:lesson.subjectGroup || '', type:lesson.subjectType || 'พื้นฐาน'}
  })
  return importScheduleSubjects(year, term, hash, rows)
}
