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

// ข้อมูลตั้งต้น: ปีการศึกษา + ครู + ห้องของปีที่ active
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
  const years = yearsRes.data || []
  const active = years.find(y => y.is_active) || years[0]
  const classrooms = active ? await loadClassroomsWithCounts(db, sid, active.id) : []
  return {
    role: session.role,
    canManage: CAN_MANAGE.includes(session.role),
    years,
    teachers: teachersRes.data || [],
    activeYearId: active?.id || '',
    classrooms,
  }
}

async function loadClassroomsWithCounts(
  db: ReturnType<typeof createServerClient>,
  schoolId: string,
  yearId: string,
) {
  const { data: classrooms } = await db.from('classrooms')
    .select('id, level, room, homeroom_teacher_id, homeroom_teacher2_id, academic_year_id')
    .eq('school_id', schoolId)
    .eq('academic_year_id', yearId)
    .order('level').order('room')
  const list = classrooms || []
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

// ชั้นเรียนของปีที่เลือก + จำนวนนักเรียน
export async function fetchClassrooms(yearId: string) {
  const session = await requireSession()
  const db = createServerClient()
  return loadClassroomsWithCounts(db, session.schoolId || '', yearId)
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

// ตั้งค่าชั้นที่เปิดสอน + จำนวนห้อง แบบ bulk (ติ๊กชั้น + ระบุจำนวนห้อง)
// - สร้างห้องที่ยังไม่มีให้อัตโนมัติ (room 1..N)
// - ลดจำนวนห้อง/ปิดชั้น จะลบเฉพาะห้องที่ "ไม่มีนักเรียน" เท่านั้น (ห้องที่มีนักเรียนจะถูกข้ามไว้)
export async function applyClassroomLevels(
  academicYearId: string,
  levels: { level: string; rooms: number }[],
) {
  const session = await requireSession()
  if (!CAN_MANAGE.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  if (!academicYearId) return { error: 'ยังไม่ได้เลือกปีการศึกษา' }
  const db = createServerClient()
  const sid = session.schoolId || ''

  const { data: existing } = await db.from('classrooms')
    .select('id, level, room')
    .eq('school_id', sid)
    .eq('academic_year_id', academicYearId)
  const existingList = existing || []

  // นับนักเรียนต่อห้อง (กันลบห้องที่มีนักเรียน)
  const ids = existingList.map(c => c.id)
  let countMap: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: studs } = await db.from('students').select('classroom_id').in('classroom_id', ids)
    countMap = (studs || []).reduce((m: Record<string, number>, s: { classroom_id: string }) => {
      m[s.classroom_id] = (m[s.classroom_id] || 0) + 1; return m
    }, {})
  }

  const desired = new Map<string, number>()
  for (const l of levels) {
    const n = Math.max(0, Math.floor(Number(l.rooms) || 0))
    if (n > 0) desired.set(l.level, n)
  }

  const byLevel = new Map<string, { id: string; room: number }[]>()
  for (const c of existingList) {
    const arr = byLevel.get(c.level) || []
    arr.push({ id: c.id, room: c.room })
    byLevel.set(c.level, arr)
  }

  const toInsert: { school_id: string; level: string; room: number; academic_year_id: string }[] = []
  const toDelete: string[] = []
  const blocked: string[] = []

  const allLevels = new Set<string>([...desired.keys(), ...byLevel.keys()])
  for (const level of allLevels) {
    const want = desired.get(level) || 0
    const rows = byLevel.get(level) || []
    const existingRooms = new Set(rows.map(r => r.room))
    for (let r = 1; r <= want; r++) {
      if (!existingRooms.has(r)) toInsert.push({ school_id: sid, level, room: r, academic_year_id: academicYearId })
    }
    for (const row of rows) {
      if (row.room > want) {
        if ((countMap[row.id] || 0) > 0) blocked.push(`${level}/${row.room}`)
        else toDelete.push(row.id)
      }
    }
  }

  if (toInsert.length > 0) {
    const { error } = await db.from('classrooms').insert(toInsert)
    if (error) return { error: error.message }
  }
  if (toDelete.length > 0) {
    const { error } = await db.from('classrooms').delete().in('id', toDelete)
    if (error) return { error: error.message }
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'update',
    module: 'classrooms',
    targetType: 'classroom',
    description: `ตั้งค่าชั้นที่เปิดสอน (เพิ่ม ${toInsert.length}, ลบ ${toDelete.length})`,
    metadata: { academicYearId, created: toInsert.length, deleted: toDelete.length, blocked },
  })

  return { error: null, created: toInsert.length, deleted: toDelete.length, blocked }
}

/** บันทึกจอเดียว: สร้าง/หาปีการศึกษา → ตั้งค่าชั้นที่เปิดสอน */
export async function setupClassroomsForYear(
  yearBe: number,
  levels: { level: string; rooms: number }[],
  academicYearId?: string | null,
) {
  const session = await requireSession()
  if (!CAN_MANAGE.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  const sid = session.schoolId || ''
  if (!sid) return { error: 'ไม่พบโรงเรียน' }
  if (!Number.isFinite(yearBe) || yearBe < 2500 || yearBe > 2700) {
    return { error: 'กรุณากรอกปีการศึกษา (พ.ศ.) ให้ถูกต้อง' }
  }

  const db = createServerClient()
  let yearId = academicYearId || ''

  if (yearId) {
    const { data: existing } = await db.from('academic_years')
      .select('id, year_be')
      .eq('id', yearId)
      .eq('school_id', sid)
      .maybeSingle()
    if (!existing) yearId = ''
    else if (existing.year_be !== yearBe) {
      // ผู้ใช้เปลี่ยนเลขปี → หา/สร้างปีใหม่ตามเลขที่พิมพ์
      yearId = ''
    }
  }

  if (!yearId) {
    const { data: byYear } = await db.from('academic_years')
      .select('id')
      .eq('school_id', sid)
      .eq('year_be', yearBe)
      .maybeSingle()
    if (byYear?.id) {
      yearId = byYear.id
    } else {
      // ปีแรกของโรงเรียน → ตั้งเป็นปัจจุบัน
      const { count } = await db.from('academic_years')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', sid)
      const { data: created, error } = await db.from('academic_years')
        .insert({ school_id: sid, year_be: yearBe, is_active: (count ?? 0) === 0 })
        .select('id')
        .single()
      if (error || !created) return { error: error?.message || 'สร้างปีการศึกษาไม่สำเร็จ' }
      yearId = created.id
      await logActivity({
        actor: session,
        schoolId: sid,
        action: 'create',
        module: 'academic_years',
        targetType: 'academic_year',
        targetId: yearId,
        targetLabel: String(yearBe),
        description: `สร้างปีการศึกษา ${yearBe} (จากตั้งค่าชั้นเรียน)`,
      })
    }
  }

  const result = await applyClassroomLevels(yearId, levels)
  if (result.error) return { error: result.error, academicYearId: yearId }
  return { ...result, academicYearId: yearId, yearBe }
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
