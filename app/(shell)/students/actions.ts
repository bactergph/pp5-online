'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity, resolveClassroomSchoolId, resolveStudentSchoolId } from '@/lib/audit'
import { invalidateClassroomStudents } from '@/lib/students-cache'

async function requireSession() {
  const s = await getSession()
  if (!s) throw new Error('ไม่มีสิทธิ์')
  if (!s.schoolId || s.mustChangePassword) throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลโรงเรียน')
  return s
}
const CAN_MANAGE = ['admin', 'district', 'academic_head', 'deputy_principal']
async function ownsClassroom(schoolId:string|null,classroomId:unknown) {
  if (!schoolId || typeof classroomId!=='string') return false
  const {data,error}=await createServerClient().from('classrooms').select('id').eq('id',classroomId).eq('school_id',schoolId).maybeSingle()
  return !error && Boolean(data)
}

export async function fetchStudentInit() {
  const session = await requireSession()
  const db = createServerClient()
  const { data: years } = await db.from('academic_years')
    .select('id, year_be, is_active').eq('school_id', session.schoolId || '')
    .order('year_be', { ascending: false })
  const yearList = years || []
  const active = yearList.find(y => y.is_active) || yearList[0]
  let classrooms: { id: string; level: string; room: number }[] = []
  let students: Record<string, unknown>[] = []
  if (active) {
    const { data: cs } = await db.from('classrooms').select('id, level, room')
      .eq('school_id', session.schoolId || '').eq('academic_year_id', active.id)
      .order('level').order('room')
    classrooms = cs || []
    const firstClassId = classrooms[0]?.id
    if (firstClassId) {
      const { data: studs } = await db.from('students').select('*')
        .eq('classroom_id', firstClassId).order('student_number')
      students = studs || []
    }
  }
  return {
    canManage: CAN_MANAGE.includes(session.role),
    years: yearList,
    activeYearId: active?.id || '',
    classrooms,
    students,
  }
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
  const session=await requireSession()
  if (!await ownsClassroom(session.schoolId,classroomId)) throw new Error('ไม่มีสิทธิ์เข้าถึงห้องเรียนนี้')
  const db = createServerClient()
  const { data } = await db.from('students').select('*')
    .eq('classroom_id', classroomId).order('student_number')
  return data || []
}

export async function saveStudent(id: string | null, payload: Record<string, unknown>) {
  const session = await requireSession()
  if (!CAN_MANAGE.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  if ('id' in payload) return {error:'ไม่สามารถเปลี่ยนรหัสนักเรียนผ่านฟอร์มนี้'}
  const db = createServerClient()
  if (id) {
    const { data: before } = await db.from('students')
      .select('classroom_id')
      .eq('id', id)
      .maybeSingle()
    if (!before || !await ownsClassroom(session.schoolId,before.classroom_id)) return {error:'ไม่มีสิทธิ์แก้ไขนักเรียนคนนี้'}
    if ('classroom_id' in payload && !await ownsClassroom(session.schoolId,payload.classroom_id)) return {error:'ไม่มีสิทธิ์ย้ายนักเรียนไปห้องเรียนนี้'}
    const { error } = await db.from('students').update(payload).eq('id', id)
    if (!error) {
      invalidateClassroomStudents(before?.classroom_id)
      if (typeof payload.classroom_id === 'string' && payload.classroom_id !== before?.classroom_id) {
        invalidateClassroomStudents(payload.classroom_id)
      }
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
  if (!await ownsClassroom(session.schoolId,payload.classroom_id)) return {error:'ไม่มีสิทธิ์เพิ่มนักเรียนในห้องเรียนนี้'}
  const { data, error } = await db.from('students').insert(payload).select('id').single()
  if (!error) {
    if (typeof payload.classroom_id === 'string') invalidateClassroomStudents(payload.classroom_id)
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
    .select('first_name, last_name, classroom_id, classrooms(school_id)')
    .eq('id', id)
    .maybeSingle()
  if (!student || !await ownsClassroom(session.schoolId,student.classroom_id)) return {error:'ไม่มีสิทธิ์ลบนักเรียนคนนี้'}
  const { error } = await db.from('students').delete().eq('id', id)
  if (!error) {
    invalidateClassroomStudents(student?.classroom_id)
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
