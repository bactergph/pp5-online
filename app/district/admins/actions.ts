'use server'
import { createServerClient } from '@/lib/supabase'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'
import { seedEvaluationSettingsForSchool } from '@/lib/evaluation-settings-seed'

type AdminRow = {
  id: string
  email: string
  prefix: string
  full_name: string
  position: string | null
  is_active: boolean
  school_id: string | null
}
type SchoolRow = { id: string; name: string; created_by?: string | null }

function normalizedOwner(value: string | null | undefined) {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

// Super Admin: เห็น admin ทุกคน ทุกโรงเรียน (ไม่ scope เขต) + นับ นร./ครู/วิชา ของแต่ละโรงเรียน
export async function fetchAdminsAndSchools() {
  await requireDistrict()
  const db = createServerClient()

  const [adminsRes, schoolsRes] = await Promise.all([
    db.from('users')
      .select('id, email, prefix, full_name, position, is_active, school_id')
      .eq('role', 'admin')
      .order('is_active', { ascending: true })   // รออนุมัติ (is_active=false) ขึ้นก่อน
      .order('full_name'),
    db.from('schools').select('id, name, created_by').order('name'),
  ])
  const admins = (adminsRes.data || []) as AdminRow[]
  const schools = (schoolsRes.data || []) as SchoolRow[]

  // Legacy repair: older school-selection flows could create/update a school
  // without writing users.school_id. Match the school's created_by against the
  // admin identity, then link it back so Super Admin no longer sees "ยังไม่ได้กำหนด".
  for (const admin of admins) {
    if (admin.school_id) continue
    let authFullName = ''
    try {
      const { data } = await db.auth.admin.getUserById(admin.id)
      authFullName = String(data?.user?.user_metadata?.full_name || '')
    } catch { /* best-effort repair */ }
    const ownerKeys = new Set([
      normalizedOwner(admin.full_name),
      normalizedOwner(`${admin.prefix || ''} ${admin.full_name || ''}`),
      normalizedOwner(admin.email),
      normalizedOwner(authFullName),
    ].filter(Boolean))
    const ownedSchools = schools.filter(s =>
      s.created_by?.trim() &&
      ownerKeys.has(normalizedOwner(s.created_by))
    )
    if (ownedSchools.length !== 1) continue
    const schoolId = ownedSchools[0].id
    const { error } = await db.from('users').update({ school_id: schoolId }).eq('id', admin.id)
    if (!error) admin.school_id = schoolId
  }

  // Final safe repair for legacy/demo data: if there is exactly one unassigned
  // admin and exactly one school that no admin owns, link them. Avoid guessing
  // when there are multiple possible matches.
  const assignedSchoolIds = new Set(admins.map(a => a.school_id).filter(Boolean))
  const remainingAdmins = admins.filter(a => !a.school_id)
  const unownedSchools = schools.filter(s => !assignedSchoolIds.has(s.id))
  if (remainingAdmins.length === 1 && unownedSchools.length === 1) {
    const admin = remainingAdmins[0]
    const schoolId = unownedSchools[0].id
    const { error } = await db.from('users').update({ school_id: schoolId }).eq('id', admin.id)
    if (!error) admin.school_id = schoolId
  }

  const schoolMap: Record<string, SchoolRow> = Object.fromEntries(schools.map(s => [s.id, s]))

  // Some legacy rows already have users.school_id but the broad schools query can
  // miss the referenced school. Fetch linked schools explicitly so the table does
  // not show "ยังไม่ได้กำหนด" when the admin is actually linked.
  const linkedSchoolIds = [...new Set(admins.map(a => a.school_id).filter(Boolean))] as string[]
  const missingSchoolIds = linkedSchoolIds.filter(id => !schoolMap[id])
  if (missingSchoolIds.length > 0) {
    const { data: linkedSchools } = await db.from('schools')
      .select('id, name')
      .in('id', missingSchoolIds)
    for (const school of (linkedSchools || []) as SchoolRow[]) {
      schoolMap[school.id] = school
      if (!schools.some(s => s.id === school.id)) schools.push(school)
    }
  }

  // สถิติต่อโรงเรียน (เฉพาะโรงเรียนที่มี admin)
  type Stat = { students: number; principal: number; academic_head: number; homeroom: number; teacher_only: number; totalUsers: number }
  const sids = [...new Set(admins.filter(a => a.school_id).map(a => a.school_id))] as string[]
  const stat: Record<string, Stat> = {}
  sids.forEach(id => { stat[id] = { students: 0, principal: 0, academic_head: 0, homeroom: 0, teacher_only: 0, totalUsers: 0 } })

  if (sids.length > 0) {
    const [classroomsR, usersR] = await Promise.all([
      db.from('classrooms').select('id, school_id').in('school_id', sids),
      db.from('users').select('role, is_homeroom, school_id').in('school_id', sids),
    ])
    for (const u of (usersR.data || [])) {
      const st = stat[u.school_id]; if (!st) continue
      if (u.role !== 'district') st.totalUsers++
      if (u.role === 'principal') st.principal++
      else if (u.role === 'academic_head') st.academic_head++
      else if (u.role === 'teacher') { if (u.is_homeroom) st.homeroom++; else st.teacher_only++ }
    }
    const classrooms = classroomsR.data || []
    const classSchool = Object.fromEntries(classrooms.map((c: { id: string; school_id: string }) => [c.id, c.school_id]))
    const classIds = classrooms.map((c: { id: string }) => c.id)
    if (classIds.length > 0) {
      const { data: studs } = await db.from('students').select('classroom_id').in('classroom_id', classIds)
      for (const s of (studs || [])) { const sid = classSchool[s.classroom_id]; if (stat[sid]) stat[sid].students++ }
    }
  }

  // โควต้าต่อ admin (เก็บใน app_metadata.user_quota, ค่าเริ่มต้น 15)
  const adminsOut = []
  for (const u of admins) {
    let quota = 15
    try { const { data } = await db.auth.admin.getUserById(u.id); quota = Number(data?.user?.app_metadata?.user_quota ?? 15) } catch { /* default */ }
    adminsOut.push({
      ...u,
      school: u.school_id ? (schoolMap[u.school_id] ?? { id: u.school_id, name: 'โรงเรียนที่ผูกไว้' }) : null,
      stat: u.school_id ? (stat[u.school_id] ?? null) : null,
      quota,
    })
  }
  return { admins: adminsOut, schools }
}

// Super Admin ตั้งโควต้าจำนวน user ที่ admin สร้างได้ในโรงเรียน
export async function setAdminQuota(adminId: string, quota: number) {
  const session = await requireDistrict()
  const db = createServerClient()
  const q = Math.max(0, Math.floor(Number(quota) || 0))
  const { data: target } = await db.from('users').select('full_name, school_id').eq('id', adminId).maybeSingle()
  const { error } = await db.auth.admin.updateUserById(adminId, { app_metadata: { user_quota: q } })
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: target?.school_id ?? null,
      action: 'set_quota',
      module: 'district_admins',
      targetType: 'user',
      targetId: adminId,
      targetLabel: target?.full_name ?? 'ผู้ดูแลโรงเรียน',
      description: `ตั้งโควต้าผู้ใช้ ${target?.full_name || ''} เป็น ${q} คน`.trim(),
      metadata: { quota: q },
    })
  }
  return { error: error?.message }
}

export async function updateAdmin(id: string, payload: {
  prefix?: string; full_name?: string; position?: string; school_id?: string
}) {
  const session = await requireDistrict()
  const db = createServerClient()

  // หมายเหตุ: 1 โรงเรียนมีหลาย admin ได้ (เอากฎ 1-รร-1-admin ออก)
  const { error } = await db.from('users').update(payload).eq('id', id)
  if (!error) {
    if (payload.school_id) {
      const { data: admin } = await db.from('users').select('is_active, role').eq('id', id).maybeSingle()
      if (admin?.is_active && admin.role === 'admin') {
        await seedEvaluationSettingsForSchool(payload.school_id)
      }
    }
    await logActivity({
      actor: session,
      schoolId: payload.school_id ?? null,
      action: 'update',
      module: 'district_admins',
      targetType: 'user',
      targetId: id,
      targetLabel: payload.full_name ?? 'ผู้ดูแลโรงเรียน',
      description: `แก้ไขผู้ดูแลโรงเรียน ${payload.full_name || ''}`.trim(),
      metadata: { fields: Object.keys(payload) },
    })
  }
  return { error: error?.message }
}

export async function toggleAdminActive(id: string, isActive: boolean) {
  const session = await requireDistrict()
  const db = createServerClient()
  const { data: target } = await db.from('users').select('full_name, school_id').eq('id', id).maybeSingle()
  const { error } = await db.from('users').update({ is_active: isActive }).eq('id', id)
  if (!error) {
    if (isActive && target?.school_id) {
      const { data: admin } = await db.from('users').select('role').eq('id', id).maybeSingle()
      if (admin?.role === 'admin') {
        await seedEvaluationSettingsForSchool(target.school_id)
      }
    }
    await logActivity({
      actor: session,
      schoolId: target?.school_id ?? null,
      action: isActive ? 'activate' : 'deactivate',
      module: 'district_admins',
      targetType: 'user',
      targetId: id,
      targetLabel: target?.full_name ?? 'ผู้ดูแลโรงเรียน',
      description: `${isActive ? 'เปิดใช้งาน' : 'ระงับ'}ผู้ดูแลโรงเรียน ${target?.full_name || ''}`.trim(),
    })
  }
}

export async function deleteAdmins(ids: string[]) {
  const session = await requireDistrict()
  if (ids.length === 0) return { error: undefined }
  const db = createServerClient()
  const { data: targets } = await db.from('users').select('id, full_name, school_id').in('id', ids)
  await Promise.all(ids.map(id => db.auth.admin.deleteUser(id)))
  const { error } = await db.from('users').delete().in('id', ids)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'delete',
      module: 'district_admins',
      targetType: 'user',
      description: `ลบผู้ดูแลโรงเรียน ${ids.length} คน`,
      metadata: { count: ids.length, names: (targets || []).map(t => t.full_name) },
    })
  }
  return { error: error?.message }
}

export async function resetAdminPassword(userId: string, newPassword: string) {
  const session = await requireDistrict()
  if (newPassword.length < 8) return { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }
  const db = createServerClient()
  const { data: target } = await db.from('users').select('full_name, school_id').eq('id', userId).maybeSingle()
  const { error } = await db.auth.admin.updateUserById(userId, { password: newPassword })
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: target?.school_id ?? null,
      action: 'reset_password',
      module: 'district_admins',
      targetType: 'user',
      targetId: userId,
      targetLabel: target?.full_name ?? 'ผู้ดูแลโรงเรียน',
      description: `รีเซ็ตรหัสผ่านผู้ดูแลโรงเรียน ${target?.full_name || ''}`.trim(),
    })
  }
  return { error: error?.message }
}
