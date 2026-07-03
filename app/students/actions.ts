'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity, resolveClassroomSchoolId, resolveStudentSchoolId } from '@/lib/audit'

async function requireSession() {
  const s = await getSession()
  if (!s) throw new Error('ไม่มีสิทธิ์')
  return s
}
const CAN_MANAGE = ['admin', 'district', 'academic_head', 'deputy_principal']

export async function fetchStudentInit() {
  const session = await requireSession()
  const db = createServerClient()
  const { data: years } = await db.from('academic_years')
    .select('id, year_be, is_active').eq('school_id', session.schoolId || '')
    .order('year_be', { ascending: false })
  return { canManage: CAN_MANAGE.includes(session.role), years: years || [] }
}

export async function fetchClassroomsForYear(yearId: string) {
  const session = await requireSession()
  const db = createServerClient()
  const { data } = await db.from('classrooms').select('id, level, room')
    .eq('school_id', session.schoolId || '').eq('academic_year_id', yearId)
    .order('level').order('room')
  return data || []
}

export async function fetchStudents(classroomId: string) {
  await requireSession()
  const db = createServerClient()
  const { data } = await db.from('students').select('*')
    .eq('classroom_id', classroomId).order('student_number')
  return data || []
}

export async function saveStudent(id: string | null, payload: Record<string, unknown>) {
  const session = await requireSession()
  if (!CAN_MANAGE.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  if (id) {
    const { error } = await db.from('students').update(payload).eq('id', id)
    if (!error) {
      await logActivity({
        actor: session,
        schoolId: await resolveStudentSchoolId(id),
        action: 'update',
        module: 'students',
        targetType: 'student',
        targetId: id,
        targetLabel: String(payload.first_name || payload.last_name || 'นักเรียน'),
        description: `แก้ไขข้อมูลนักเรียน ${[payload.first_name, payload.last_name].filter(Boolean).join(' ') || ''}`.trim(),
        metadata: { fields: Object.keys(payload) },
      })
    }
    return { error: error?.message }
  }
  const { data, error } = await db.from('students').insert(payload).select('id').single()
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: typeof payload.classroom_id === 'string' ? await resolveClassroomSchoolId(payload.classroom_id) : session.schoolId,
      action: 'create',
      module: 'students',
      targetType: 'student',
      targetId: data?.id ?? null,
      targetLabel: String(payload.first_name || payload.last_name || 'นักเรียน'),
      description: `เพิ่มนักเรียน ${[payload.first_name, payload.last_name].filter(Boolean).join(' ') || ''}`.trim(),
      metadata: { classroomId: typeof payload.classroom_id === 'string' ? payload.classroom_id : null },
    })
  }
  return { error: error?.message }
}

export async function deleteStudent(id: string) {
  const session = await requireSession()
  if (!CAN_MANAGE.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { data: student } = await db.from('students')
    .select('first_name, last_name, classrooms(school_id)')
    .eq('id', id)
    .maybeSingle()
  const { error } = await db.from('students').delete().eq('id', id)
  if (!error) {
    const classroom = Array.isArray(student?.classrooms) ? student?.classrooms[0] : student?.classrooms
    await logActivity({
      actor: session,
      schoolId: classroom?.school_id ?? session.schoolId,
      action: 'delete',
      module: 'students',
      targetType: 'student',
      targetId: id,
      targetLabel: [student?.first_name, student?.last_name].filter(Boolean).join(' ') || 'นักเรียน',
      description: `ลบนักเรียน ${[student?.first_name, student?.last_name].filter(Boolean).join(' ') || ''}`.trim(),
    })
  }
  return { error: error?.message }
}
