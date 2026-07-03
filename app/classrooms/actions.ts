'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity } from '@/lib/audit'

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  return session
}

// ผอ. = ดูอย่างเดียว (oversight) · จัดการได้: admin + หัวหน้าวิชาการ (กำหนดครูประจำชั้น)
const CAN_MANAGE = ['admin', 'district', 'academic_head', 'deputy_principal']

// ข้อมูลตั้งต้น: ปีการศึกษา + ครู (สำหรับเลือกครูประจำชั้น)
export async function fetchClassroomInit() {
  const session = await requireSession()
  const db = createServerClient()
  const sid = session.schoolId || ''
  const [yearsRes, teachersRes] = await Promise.all([
    db.from('academic_years').select('id, year_be, is_active')
      .eq('school_id', sid).order('year_be', { ascending: false }),
    db.from('users').select('id, prefix, full_name, is_homeroom')
      .in('role', ['teacher', 'academic_head', 'deputy_principal']).eq('school_id', sid).eq('is_active', true)
      .order('full_name'),
  ])
  return {
    role: session.role,
    canManage: CAN_MANAGE.includes(session.role),
    years: yearsRes.data || [],
    teachers: teachersRes.data || [],
  }
}

// ชั้นเรียนของปีที่เลือก + จำนวนนักเรียน
export async function fetchClassrooms(yearId: string) {
  const session = await requireSession()
  const db = createServerClient()
  const { data: classrooms } = await db.from('classrooms')
    .select('id, level, room, homeroom_teacher_id, homeroom_teacher2_id, academic_year_id')
    .eq('school_id', session.schoolId || '')
    .eq('academic_year_id', yearId)
    .order('level').order('room')
  const list = classrooms || []
  // นับนักเรียนต่อห้อง
  const ids = list.map(c => c.id)
  let countMap: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: studs } = await db.from('students').select('classroom_id').in('classroom_id', ids)
    countMap = (studs || []).reduce((m: Record<string, number>, s: { classroom_id: string }) => {
      m[s.classroom_id] = (m[s.classroom_id] || 0) + 1; return m
    }, {})
  }
  return list.map(c => ({ ...c, student_count: countMap[c.id] || 0 }))
}

export async function saveClassroom(id: string | null, payload: {
  level: string; room: number; academic_year_id: string
  homeroom_teacher_id: string | null; homeroom_teacher2_id: string | null
}) {
  const session = await requireSession()
  if (!CAN_MANAGE.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const row = { ...payload, school_id: session.schoolId }

  let error
  let savedId = id
  if (id) ({ error } = await db.from('classrooms').update(row).eq('id', id))
  else {
    const res = await db.from('classrooms').insert(row).select('id').single()
    error = res.error
    savedId = res.data?.id ?? null
  }
  if (error) return { error: error.message }

  // ตั้ง is_homeroom=true ให้ครูที่ถูกกำหนดเป็นครูประจำชั้น (เพื่อให้เห็นเมนูธุรการชั้นเรียน)
  const homerooms = [payload.homeroom_teacher_id, payload.homeroom_teacher2_id].filter(Boolean) as string[]
  if (homerooms.length > 0) {
    await db.from('users').update({ is_homeroom: true }).in('id', homerooms)
  }
  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: id ? 'update' : 'create',
    module: 'classrooms',
    targetType: 'classroom',
    targetId: savedId,
    targetLabel: `${payload.level}/${payload.room}`,
    description: `${id ? 'แก้ไข' : 'เพิ่ม'}ห้องเรียน ${payload.level}/${payload.room}`,
    metadata: {
      academicYearId: payload.academic_year_id,
      homeroomTeacherId: payload.homeroom_teacher_id,
      homeroomTeacher2Id: payload.homeroom_teacher2_id,
    },
  })
  return { error: null }
}

export async function deleteClassroom(id: string) {
  const session = await requireSession()
  if (!CAN_MANAGE.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { data: classroom } = await db.from('classrooms')
    .select('level, room, school_id')
    .eq('id', id)
    .maybeSingle()
  const { count } = await db.from('students').select('id', { count: 'exact', head: true }).eq('classroom_id', id)
  if ((count ?? 0) > 0) return { error: `ลบไม่ได้ — มีนักเรียน ${count} คนในห้องนี้` }
  const { error } = await db.from('classrooms').delete().eq('id', id)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: classroom?.school_id ?? session.schoolId,
      action: 'delete',
      module: 'classrooms',
      targetType: 'classroom',
      targetId: id,
      targetLabel: classroom ? `${classroom.level}/${classroom.room}` : 'ห้องเรียน',
      description: `ลบห้องเรียน ${classroom ? `${classroom.level}/${classroom.room}` : ''}`.trim(),
    })
  }
  return { error: error?.message }
}
