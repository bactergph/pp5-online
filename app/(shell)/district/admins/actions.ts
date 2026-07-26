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
type SchoolRow = {
  id: string
  name: string
  created_by?: string | null
  district?: string | null
  province?: string | null
  member_code?: string | null
  moe_school_id?: string | null
}

/** ค้นหาจากฐานอ้างอิง (catalog) — ตอนบันทึกจะสร้างโรงเรียนสมาชิกใหม่ให้ */
export async function searchSchoolsForAdminAssign(q: string) {
  await requireDistrict()
  const term = q.trim().replace(/,/g, ' ')
  if (term.length < 1) return [] as SchoolRow[]
  const db = createServerClient()
  const primary = await db
    .from('schools')
    .select('id, name, district, province')
    .eq('is_catalog', true)
    .or(`name.ilike.%${term}%,district.ilike.%${term}%,province.ilike.%${term}%`)
    .order('name')
    .limit(40)
  if (!primary.error) return (primary.data || []) as SchoolRow[]
  if (!String(primary.error.message || '').includes('is_catalog')) {
    throw new Error(primary.error.message)
  }
  const { data, error } = await db
    .from('schools')
    .select('id, name, district, province')
    .or(`name.ilike.%${term}%,district.ilike.%${term}%,province.ilike.%${term}%`)
    .order('name')
    .limit(40)
  if (error) throw new Error(error.message)
  return (data || []) as SchoolRow[]
}

// Super Admin: เห็น admin ทุกคน ทุกโรงเรียน (ไม่ scope เขต) + นับ นร./ครู/วิชา ของแต่ละโรงเรียน
export async function fetchAdminsAndSchools() {
  await requireDistrict()
  const db = createServerClient()

  // ไม่โหลด schools ทั้งประเทศ (~หลายหมื่นแถว / ติด limit 1000 ของ Supabase)
  // ดึงเฉพาะโรงเรียนที่ผูกกับ admin อยู่แล้ว สำหรับแสดงในตาราง
  const adminsRes = await db.from('users')
    .select('id, email, prefix, full_name, position, is_active, school_id')
    .eq('role', 'admin')
    .order('is_active', { ascending: true })
    .order('full_name')
  const admins = (adminsRes.data || []) as AdminRow[]

  const schoolMap: Record<string, SchoolRow> = {}
  const schools: SchoolRow[] = []
  const linkedSchoolIds = [...new Set(admins.map(a => a.school_id).filter(Boolean))] as string[]
  for (let i = 0; i < linkedSchoolIds.length; i += 200) {
    const chunk = linkedSchoolIds.slice(i, i + 200)
    const linked = await db.from('schools')
      .select('id, name, district, province, member_code')
      .in('id', chunk)
    const linkedSchools = linked.error && String(linked.error.message || '').includes('member_code')
      ? (await db.from('schools').select('id, name, district, province').in('id', chunk)).data
      : linked.data
    for (const school of (linkedSchools || []) as SchoolRow[]) {
      schoolMap[school.id] = school
      schools.push(school)
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
    const bySchool: Record<string, string[]> = {}
    for (const c of classrooms as { id: string; school_id: string }[]) {
      ;(bySchool[c.school_id] ||= []).push(c.id)
    }
    await Promise.all(sids.map(async (sid) => {
      const classIds = bySchool[sid] || []
      if (!classIds.length) return
      const { count } = await db.from('students').select('id', { count: 'exact', head: true }).in('classroom_id', classIds)
      if (stat[sid]) stat[sid].students = count || 0
    }))
  }

  // โควต้าต่อ admin — ดึงแบบขนานทีละชุด (ผลลัพธ์เหมือนเดิม ค่าเริ่มต้น 15)
  const quotaMap: Record<string, number> = {}
  const CHUNK = 12
  for (let i = 0; i < admins.length; i += CHUNK) {
    const chunk = admins.slice(i, i + CHUNK)
    await Promise.all(chunk.map(async (u) => {
      try {
        const { data } = await db.auth.admin.getUserById(u.id)
        quotaMap[u.id] = Number(data?.user?.app_metadata?.user_quota ?? 15)
      } catch {
        quotaMap[u.id] = 15
      }
    }))
  }

  const adminsOut = admins.map((u) => ({
    ...u,
    school: u.school_id ? (schoolMap[u.school_id] ?? { id: u.school_id, name: 'โรงเรียนที่ผูกไว้' }) : null,
    stat: u.school_id ? (stat[u.school_id] ?? null) : null,
    quota: quotaMap[u.id] ?? 15,
  }))
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

  const nextPayload = { ...payload }
  let memberMeta: { memberCode?: string | null; catalogId?: string } = {}
  if (payload.school_id) {
    try {
      const { resolveMemberSchoolId } = await import('@/lib/school-member')
      const member = await resolveMemberSchoolId(payload.school_id)
      nextPayload.school_id = member.id
      memberMeta = { memberCode: member.member_code, catalogId: payload.school_id }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'สร้างโรงเรียนสมาชิกไม่สำเร็จ' }
    }
  }

  const { error } = await db.from('users').update(nextPayload).eq('id', id)
  if (!error) {
    if (nextPayload.school_id) {
      const { data: admin } = await db.from('users').select('is_active, role').eq('id', id).maybeSingle()
      if (admin?.is_active && admin.role === 'admin') {
        await seedEvaluationSettingsForSchool(nextPayload.school_id)
      }
    }
    await logActivity({
      actor: session,
      schoolId: nextPayload.school_id ?? null,
      action: 'update',
      module: 'district_admins',
      targetType: 'user',
      targetId: id,
      targetLabel: payload.full_name ?? 'ผู้ดูแลโรงเรียน',
      description: `แก้ไขผู้ดูแลโรงเรียน ${payload.full_name || ''}`.trim(),
      metadata: { fields: Object.keys(payload), ...memberMeta },
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

/**
 * ล้างการตั้งค่าที่ผู้ดูแลโรงเรียนตั้งไว้ (onboarding / settings)
 * คงชื่อโรงเรียนและข้อมูลบัญชีรายชื่อจากเขต — ไม่ลบผู้ใช้ / ห้องเรียน / นักเรียน
 */
export async function resetSchoolMemberSettings(schoolId: string) {
  const session = await requireDistrict()
  const id = String(schoolId || '').trim()
  if (!id) return { error: 'ไม่ได้ระบุโรงเรียน' }

  const db = createServerClient()
  const { data: school, error: schoolErr } = await db
    .from('schools')
    .select('id, name, code')
    .eq('id', id)
    .maybeSingle()
  if (schoolErr) return { error: schoolErr.message }
  if (!school) return { error: 'ไม่พบโรงเรียน' }

  const { error: updateErr } = await db.from('schools').update({
    director_name: null,
    vice_director_name: null,
    acting_director: null,
    acting_director_position: null,
    academic_head_name: null,
    measurement_head_name: null,
    director_user_id: null,
    vice_director_user_id: null,
    acting_director_user_id: null,
    academic_head_user_id: null,
    measurement_head_user_id: null,
    code: null,
    program_name: null,
    created_by: null,
    logo_url: null,
    stamp_url: null,
    google_drive_refresh_token: null,
    google_drive_access_token: null,
    google_drive_token_expiry: null,
    google_drive_connected_email: null,
    google_drive_folder_id: null,
  }).eq('id', id)

  if (updateErr) return { error: updateErr.message }

  const { error: headsErr } = await db.from('subject_group_heads').delete().eq('school_id', id)
  if (headsErr && !headsErr.message.includes('subject_group_heads')) {
    return { error: headsErr.message }
  }

  await logActivity({
    actor: session,
    schoolId: id,
    action: 'reset_settings',
    module: 'district_admins',
    targetType: 'school',
    targetId: id,
    targetLabel: school.name,
    description: `ล้างการตั้งค่าโรงเรียน ${school.name}${school.code ? ` (เดิม /${school.code})` : ''}`.trim(),
    metadata: { previousCode: school.code || null },
  })

  return { error: undefined, schoolName: school.name as string }
}
