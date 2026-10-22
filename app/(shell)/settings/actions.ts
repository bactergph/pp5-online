'use server'
import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { getSession, createSession } from '@/lib/session'
import { clearUserFromLeaderSlots, syncSchoolLeaderSlot, syncUserRoleToSchoolLeaders } from '@/lib/school-leaders'
import { formatStaffName } from '@/lib/roles'
import { logActivity, resolveClassroomSchoolId, resolveClassSubjectContext } from '@/lib/audit'
import { classSubjectSemesterForLevel, type ClassSubjectSemester } from '@/lib/class-subject-term'
import {
  characterDefaultSettingsForBand,
  EVALUATION_DEFAULT_SETTINGS,
  EVALUATION_KIND_LABELS,
  evaluationBandForKind,
  isBandedEvaluationKind,
  normalizeCharacterEvaluationPayload,
  normalizeEvaluationSetting,
  normalizeReadingStandardPayload,
  normalizeRubricLevels,
  parseCharacterBehaviorRows,
  parseReadingIndicatorRows,
  readingDefaultSettingsForBand,
  READING_INDICATOR_FIELD_KEYS,
  sortOrderFromEvaluationItemNumber,
  validateCharacterEvaluationSetting,
  validateReadingEvaluationSetting,
  type EducationBand,
  type EvaluationKind,
  type EvaluationSetting,
} from '@/lib/evaluation-settings'
import { buildDefaultEvaluationRows, seedEvaluationSettingsForSchool } from '@/lib/evaluation-settings-seed'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'
import { invalidateClassroomStudents, invalidateClassroomStudentsMany } from '@/lib/students-cache'
import { invalidateSchoolCalendar } from '@/lib/school-calendar-cache'
import { staffAccessError, staffProfileError } from '@/lib/staff-permissions'
import { getSchoolShell } from '@/lib/school-shell'
import { resolveSchoolEducationType } from '@/lib/school-education-type'
import { secondaryCreditHours } from '@/lib/subject-credit-hours'
import { parseSubjectSemester, type SubjectSemester } from '@/lib/subject-semester'
import { prepareClassSubjectCopy, executeClassSubjectCopy, type ClassSubjectCopyInput } from '@/lib/class-subject-copy'

async function requireSchoolSession(allowUnassigned = false) {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  if (session.mustChangePassword) throw new Error('กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน')
  if (!allowUnassigned && !session.schoolId) throw new Error('กรุณากำหนดโรงเรียนก่อนใช้งาน')
  return session
}

function hasRole(session: { role: string }, roles: string[]) {
  return roles.includes(session.role)
}

const ADMIN_ROLES = ['admin', 'district']
const ACADEMIC_MANAGE_ROLES = ['admin', 'district', 'academic_head', 'deputy_principal']

type DbRow = Record<string, unknown>

function asText(value: unknown) {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)
}

// ============================================================
// School
// ============================================================

export async function fetchMySchool() {
  const session = await requireSchoolSession(true)
  const db = createServerClient()
  if (!session.schoolId) return null   // ยังไม่ได้เลือกโรงเรียน → ให้หน้าแสดงตัวเลือกค้นหาจากฐานข้อมูล
  const { data } = await db.from('schools').select('*').eq('id', session.schoolId).maybeSingle()
  return data
}

export async function fetchSubjectGroupHeads() {
  const session = await requireSchoolSession()
  if (!session.schoolId) return {} as Record<string, { name: string; userId: string | null }>
  const db = createServerClient()
  let data: { subject_group: string; head_name: string | null; head_user_id?: string | null }[] | null = null
  let error: { message: string } | null = null
  const primary = await db.from('subject_group_heads')
    .select('subject_group, head_name, head_user_id')
    .eq('school_id', session.schoolId)
  data = primary.data
  error = primary.error
  if (error?.message?.includes('head_user_id')) {
    const fallback = await db.from('subject_group_heads')
      .select('subject_group, head_name')
      .eq('school_id', session.schoolId)
    data = fallback.data
    error = fallback.error
  }
  if (error?.message?.includes('subject_group_heads')) {
    return Object.fromEntries(SUBJECT_GROUPS.map(g => [g, { name: '', userId: null }]))
  }
  const out: Record<string, { name: string; userId: string | null }> = {}
  for (const group of SUBJECT_GROUPS) out[group] = { name: '', userId: null }
  for (const row of data || []) {
    const group = asText(row.subject_group)
    if (group) {
      out[group] = {
        name: asText(row.head_name),
        userId: (row as { head_user_id?: string | null }).head_user_id || null,
      }
    }
  }
  return out
}

export async function saveSubjectGroupHeads(
  heads: Record<string, { name?: string | null; userId?: string | null } | null | undefined>,
) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น' }
  const schoolId = session.schoolId
  if (!schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const db = createServerClient()
  const { attachTypedNamesToStaff } = await import('@/lib/leader-staff')
  let linked: Record<string, { userId: string | null; name: string | null }>
  try {
    linked = await attachTypedNamesToStaff(schoolId, SUBJECT_GROUPS.map(group => ({
      key: group,
      name: heads[group]?.name,
      userId: heads[group]?.userId,
      position: `หัวหน้า${group}`,
      role: 'teacher',
    })))
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'เพิ่มบุคลากรไม่สำเร็จ' }
  }
  const rows = SUBJECT_GROUPS.map(group => {
    const row = linked[group]
    return {
      school_id: schoolId,
      subject_group: group,
      head_name: row?.name || null,
      head_user_id: row?.userId || null,
      updated_at: new Date().toISOString(),
    }
  })

  const { error } = await db.from('subject_group_heads').upsert(rows, { onConflict: 'school_id,subject_group' })
  if (error?.message?.includes('subject_group_heads')) {
    return { error: 'ยังไม่ได้ติดตั้งตารางหัวหน้ากลุ่มสาระ — รัน migration 021_subject_group_heads.sql' }
  }
  if (error?.message?.includes('head_user_id')) {
    return { error: 'ยังไม่ได้ติดตั้งคอลัมน์ head_user_id — รัน migration 033_subject_group_head_user_id.sql' }
  }
  if (!error) {
    await logActivity({
      actor: session,
      schoolId,
      action: 'update',
      module: 'school',
      targetType: 'school',
      targetId: schoolId,
      targetLabel: 'หัวหน้ากลุ่มสาระ',
      description: 'บันทึกชื่อหัวหน้ากลุ่มสาระการเรียนรู้',
      metadata: { groups: SUBJECT_GROUPS.length },
    })
  }
  const savedHeads = Object.fromEntries(rows.map(row => [row.subject_group, { name: row.head_name || '', userId: row.head_user_id }]))
  return { error: error?.message || null, heads: error ? undefined : savedHeads }
}

// ค้นหาโรงเรียนจากฐานข้อมูล (สำหรับ admin เลือกโรงเรียนของตน)
export async function searchSchools(q: string) {
  const session = await requireSchoolSession(true)
  if (!hasRole(session, ADMIN_ROLES)) return []
  if (!q || q.trim().length < 2) return []
  const db = createServerClient()
  const safe = q.trim().replace(/,/g, ' ')
  // ค้นจากฐานอ้างอิงเท่านั้น — สมาชิกจะได้โรงเรียนใหม่คนละ ID
  const withCatalog = await db.from('schools')
    .select('id, name, area_office, district, province')
    .eq('is_catalog', true)
    .or(`name.ilike.%${safe}%,district.ilike.%${safe}%,province.ilike.%${safe}%`)
    .limit(20)
  if (!withCatalog.error) return withCatalog.data || []
  if (!String(withCatalog.error.message || '').includes('is_catalog')) {
    throw new Error(withCatalog.error.message)
  }
  const { data } = await db.from('schools')
    .select('id, name, area_office, district, province')
    .or(`name.ilike.%${safe}%,district.ilike.%${safe}%,province.ilike.%${safe}%`)
    .limit(20)
  return data || []
}

// เลือกชื่อจากฐานอ้างอิง → สร้างโรงเรียนสมาชิกใหม่ (ID ใหม่) ไม่แชร์ข้อมูลกับแถว catalog
export async function setMySchool(catalogId: string) {
  const session = await requireSchoolSession(true)
  if (session.role !== 'admin') return { error: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น' }
  const db = createServerClient()

  // ถ้ามีโรงเรียนสมาชิกอยู่แล้ว ห้ามสร้างซ้ำตอนเลือกใหม่ (ต้องใช้ Super Admin ล้างก่อน)
  if (session.schoolId) {
    const { data: current } = await db.from('schools')
      .select('id, is_catalog, member_code')
      .eq('id', session.schoolId)
      .maybeSingle()
    if (current && current.is_catalog === false) {
      return { error: 'บัญชีนี้มีโรงเรียนสมาชิกอยู่แล้ว — ติดต่อ Super Admin หากต้องการล้างการตั้งค่า' }
    }
  }

  const { createMemberSchoolFromCatalog } = await import('@/lib/school-member')
  let member: { id: string; name: string; member_code: string | null }
  try {
    member = await createMemberSchoolFromCatalog(catalogId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'สร้างโรงเรียนสมาชิกไม่สำเร็จ' }
  }

  const { error } = await db.from('users')
    .update({ school_id: member.id })
    .eq('id', session.userId)
  if (error) return { error: error.message }

  await createSession({ ...session, schoolId: member.id })
  await seedEvaluationSettingsForSchool(member.id)
  await logActivity({
    actor: { ...session, schoolId: member.id },
    schoolId: member.id,
    action: 'create',
    module: 'school',
    targetType: 'school',
    targetId: member.id,
    targetLabel: member.name,
    description: `สร้างโรงเรียนสมาชิกใหม่: ${member.name}${member.member_code ? ` (${member.member_code})` : ''}`,
    metadata: { catalogId, memberCode: member.member_code },
  })
  return { error: null }
}

export async function createMySchool(payload: { name: string; department?: string | null; area_office?: string | null; district?: string | null; province?: string | null }) {
  const session = await requireSchoolSession(true)
  if (session.role !== 'admin') return { error: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น' }
  const db = createServerClient()
  if (session.schoolId) {
    const { data: current } = await db.from('schools')
      .select('id, is_catalog')
      .eq('id', session.schoolId)
      .maybeSingle()
    if (current && current.is_catalog === false) {
      return { error: 'บัญชีนี้มีโรงเรียนสมาชิกอยู่แล้ว — ติดต่อ Super Admin หากต้องการล้างการตั้งค่า' }
    }
  }
  const { createMemberSchool } = await import('@/lib/school-member')
  let member: { id: string; name: string; member_code: string | null }
  try {
    member = await createMemberSchool(payload)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'สร้างโรงเรียนไม่สำเร็จ' }
  }
  const { error } = await db.from('users')
    .update({ school_id: member.id })
    .eq('id', session.userId)
  if (error) return { error: error.message }
  await createSession({ ...session, schoolId: member.id })
  await seedEvaluationSettingsForSchool(member.id)
  await logActivity({
    actor: { ...session, schoolId: member.id },
    schoolId: member.id,
    action: 'create',
    module: 'school',
    targetType: 'school',
    targetId: member.id,
    targetLabel: member.name,
    description: `สร้างโรงเรียนสมาชิกจากการกรอกเอง: ${member.name}${member.member_code ? ` (${member.member_code})` : ''}`,
    metadata: { memberCode: member.member_code, source: 'typed' },
  })
  return { error: null }
}

export async function saveSchool(id: string | null, payload: Record<string, string | null>) {
  const session = await requireSchoolSession(true)
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น' }
  if (id && id !== session.schoolId) return {error:'ไม่มีสิทธิ์แก้ไขข้อมูลโรงเรียนนี้'}
  if ('id' in payload) return {error:'ไม่สามารถเปลี่ยนรหัสโรงเรียนผ่านฟอร์มนี้'}
  const db = createServerClient()
  const { revalidatePath } = await import('next/cache')
  const withoutPendingColumns = () => {
    const next = { ...payload }
    delete next.acting_director_position
    return next
  }
  const isMissingActingPosition = (error: { message?: string } | null | undefined) =>
    !!error?.message?.includes('acting_director_position')

  // trim ข้อความว่าง → null
  for (const key of ['program_name', 'created_by', 'name', 'department', 'area_office', 'district', 'province', 'address', 'phone', 'document_prefix'] as const) {
    if (key in payload && payload[key] != null) {
      const t = String(payload[key]).trim()
      payload[key] = t || null
    }
  }

  let previousCode: string | null = null
  if (id) {
    const { data: prev } = await db.from('schools').select('code').eq('id', id).maybeSingle()
    previousCode = prev?.code ? String(prev.code).trim().toLowerCase() : null
  }

  // ตรวจรหัสกลุ่ม (code) — ใช้สำหรับ URL login รายโรงเรียน ห้ามซ้ำ
  // ถ้าว่างตอนอัปเดต → ไม่แตะ code เดิม (กันฟอร์ม defaultValue ว่างแล้วลบ URL ทิ้ง)
  if (payload.code != null && String(payload.code).trim() !== '') {
    const code = String(payload.code).trim().toLowerCase()
    if (!/^[a-z0-9-]+$/.test(code)) return { error: 'รหัสโรงเรียนใช้ได้เฉพาะ a-z 0-9 - (ห้ามเว้นวรรค/ภาษาไทย)' }
    const { isReservedSchoolPathSegment } = await import('@/lib/school-path')
    if (isReservedSchoolPathSegment(code)) {
      return { error: 'รหัสนี้ใช้เป็นชื่อเมนูระบบไม่ได้ เลือกรหัสอื่น' }
    }
    const { data: ex } = await db.from('schools').select('id').ilike('code', code)
      .neq('id', id || '00000000-0000-0000-0000-000000000000').maybeSingle()
    if (ex) return { error: 'รหัสนี้ถูกใช้แล้ว เลือกรหัสอื่น' }
    payload.code = code
  } else if (id) {
    delete payload.code
  } else {
    payload.code = null
  }
  if (id) {
    let { error } = await db.from('schools').update(payload).eq('id', id)
    if (isMissingActingPosition(error)) {
      ;({ error } = await db.from('schools').update(withoutPendingColumns()).eq('id', id))
    }
    if (!error && session.role === 'admin') {
      await db.from('users').update({ school_id: id }).eq('id', session.userId)
      if (session.schoolId !== id) await createSession({ ...session, schoolId: id })
    }
    if (!error) {
      const nextCode = (payload.code ? String(payload.code) : previousCode) || null
      const { schoolLoginPath, schoolLoginPhysicalPath } = await import('@/lib/school-path')
      if (previousCode) {
        revalidatePath(schoolLoginPhysicalPath(previousCode))
        revalidatePath(schoolLoginPath(previousCode))
      }
      if (nextCode && nextCode !== previousCode) {
        revalidatePath(schoolLoginPhysicalPath(nextCode))
        revalidatePath(schoolLoginPath(nextCode))
      }
      await logActivity({
        actor: session,
        schoolId: id,
        action: 'update',
        module: 'school',
        targetType: 'school',
        targetId: id,
        targetLabel: String(payload.name || 'โรงเรียน'),
        description: `บันทึกข้อมูลโรงเรียน ${payload.name || ''}`.trim(),
        metadata: { fields: Object.keys(payload) },
      })
    }
    return { error: error?.message }
  }
  let { data, error } = await db.from('schools').insert(payload).select('id').single()
  if (isMissingActingPosition(error)) {
    ;({ data, error } = await db.from('schools').insert(withoutPendingColumns()).select('id').single())
  }
  if (!error && data?.id && session.role === 'admin') {
    await db.from('users').update({ school_id: data.id }).eq('id', session.userId)
    await createSession({ ...session, schoolId: data.id })
  }
  if (!error && data?.id) {
    await logActivity({
      actor: { ...session, schoolId: data.id },
      schoolId: data.id,
      action: 'create',
      module: 'school',
      targetType: 'school',
      targetId: data.id,
      targetLabel: String(payload.name || 'โรงเรียน'),
      description: `สร้างข้อมูลโรงเรียน ${payload.name || ''}`.trim(),
      metadata: { fields: Object.keys(payload) },
    })
  }
  return { error: error?.message }
}

export async function updateSchoolActingDirector(payload: {
  vice_director_name?: string | null
  acting_director: string | null
  acting_director_position: string | null
  acting_director_user_id?: string | null
  vice_director_user_id?: string | null
}) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น' }
  const schoolId = session.schoolId
  if (!schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const db = createServerClient()
  const updates: Record<string, string | null> = {
    acting_director: payload.acting_director?.trim() || null,
    acting_director_position: payload.acting_director_position?.trim() || null,
  }
  if (payload.vice_director_name != null) {
    updates.vice_director_name = payload.vice_director_name.trim() || null
  }
  if (payload.acting_director_user_id !== undefined) {
    updates.acting_director_user_id = payload.acting_director_user_id || null
  }
  if (payload.vice_director_user_id !== undefined) {
    updates.vice_director_user_id = payload.vice_director_user_id || null
  }

  const withoutPendingColumns = () => {
    const next = { ...updates }
    delete next.acting_director_position
    return next
  }
  const isMissingActingPosition = (error: { message?: string } | null | undefined) =>
    !!error?.message?.includes('acting_director_position')

  let { error } = await db.from('schools').update(updates).eq('id', schoolId)
  if (isMissingActingPosition(error)) {
    ;({ error } = await db.from('schools').update(withoutPendingColumns()).eq('id', schoolId))
  }
  if (!error) {
    await logActivity({
      actor: session,
      schoolId,
      action: 'update',
      module: 'school',
      targetType: 'school',
      targetId: schoolId,
      targetLabel: 'ผู้รักษาการ',
      description: updates.acting_director
        ? `ตั้งผู้รักษาการ: ${updates.acting_director}`
        : 'ยกเลิกผู้รักษาการ',
      metadata: { fields: Object.keys(updates) },
    })
  }
  return { error: error?.message || null }
}

// ============================================================
// Users
// ============================================================

export async function fetchSchoolUsers() {
  const session = await requireSchoolSession(true)
  if (staffAccessError(session)) return {schoolId:null,code:null,users:[],canManage:false,viewerRole:session.role}
  const db = createServerClient()
  const query = db.from('users')
    .select('id, email, username, prefix, full_name, position, role, is_homeroom, is_active, signature_url')
    .order('full_name')
  query.eq('school_id', session.schoolId).neq('role','district')
  const { data } = await query
  const staffRows = await Promise.all((data || []).map(async user => {
    if (!user.email?.startsWith('pending-')) return {...user,role_pending:false}
    const {data:account} = await db.auth.admin.getUserById(user.id)
    return {...user,role_pending:account.user?.app_metadata?.staff_role_pending ?? (user.role === 'teacher')}
  }))
  let code: string | null = null
  if (session.schoolId) {
    const { data: sc } = await db.from('schools').select('code').eq('id', session.schoolId).maybeSingle()
    code = sc?.code ?? null
  }
  return {
    schoolId: session.schoolId,
    code,
    users: staffRows,
    canManage: hasRole(session, ADMIN_ROLES),
    viewerRole: session.role,
  }
}

export async function fetchSchoolStaff() {
  const session = await requireSchoolSession()
  if (!session.schoolId) return []
  const db = createServerClient()
  const { data } = await db.from('users')
    .select('id, prefix, full_name, position, role')
    .eq('school_id', session.schoolId)
    .or('is_active.eq.true,email.like.pending-%')
    .order('full_name')
  return data || []
}

export async function saveSchoolLeaders(payload: {
  director_user_id?: string | null
  director_name?: string | null
  vice_director_user_id?: string | null
  vice_director_name?: string | null
  acting_director_user_id?: string | null
  acting_director?: string | null
  acting_director_position?: string | null
  academic_head_user_id?: string | null
  academic_head_name?: string | null
  measurement_head_user_id?: string | null
  measurement_head_name?: string | null
}) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น' }
  const schoolId = session.schoolId
  if (!schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const db = createServerClient()
  const { actingLeaderRole, attachTypedNamesToStaff } = await import('@/lib/leader-staff')
  let linked: Record<string, { userId: string | null; name: string | null }>
  try {
    linked = await attachTypedNamesToStaff(schoolId, [
      { key: 'director', name: payload.director_name, userId: payload.director_user_id, position: 'ผู้อำนวยการ', role: 'principal' },
      { key: 'vice', name: payload.vice_director_name, userId: payload.vice_director_user_id, position: 'รองผู้อำนวยการ', role: 'deputy_principal' },
      { key: 'acting', name: payload.acting_director, userId: payload.acting_director_user_id, position: (payload.acting_director_position || '').trim() || 'ผู้รักษาการ', role: actingLeaderRole(payload.acting_director_position) },
      { key: 'academic', name: payload.academic_head_name, userId: payload.academic_head_user_id, position: 'หัวหน้าฝ่ายวิชาการ', role: 'academic_head' },
      { key: 'measurement', name: payload.measurement_head_name, userId: payload.measurement_head_user_id, position: 'หัวหน้างานวัดผล', role: 'teacher' },
    ])
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'เพิ่มบุคลากรไม่สำเร็จ' }
  }
  const updates: Record<string, string | null> = {}
  for (const [key, val] of Object.entries(payload)) {
    if (val !== undefined) updates[key] = val === '' ? null : val
  }
  const applyLinked = (nameKey: string, userKey: string, slot: string) => {
    const row = linked[slot]
    if (!row) return
    updates[nameKey] = row.name
    updates[userKey] = row.userId
  }
  applyLinked('director_name', 'director_user_id', 'director')
  applyLinked('vice_director_name', 'vice_director_user_id', 'vice')
  applyLinked('acting_director', 'acting_director_user_id', 'acting')
  applyLinked('academic_head_name', 'academic_head_user_id', 'academic')
  applyLinked('measurement_head_name', 'measurement_head_user_id', 'measurement')

  const withoutPendingColumns = () => {
    const next = { ...updates }
    for (const col of [
      'acting_director_position',
      'director_user_id',
      'vice_director_user_id',
      'acting_director_user_id',
      'academic_head_user_id',
      'measurement_head_user_id',
    ]) {
      delete next[col]
    }
    return next
  }

  let { error } = await db.from('schools').update(updates).eq('id', schoolId)
  if (error?.message?.includes('user_id') || error?.message?.includes('acting_director_position')) {
    ;({ error } = await db.from('schools').update(withoutPendingColumns()).eq('id', schoolId))
  }
  return { error: error?.message || null, leaders: error ? undefined : updates }
}

export async function updateUser(id: string, payload: Record<string, string | boolean | null>) {
  const session = await requireSchoolSession()
  const accessError = staffAccessError(session) || staffProfileError(payload)
  if (accessError) return {error:accessError}
  const db = createServerClient()
  const { data: target } = await db.from('users')
    .select('id, prefix, full_name, role, school_id, email')
    .eq('id', id)
    .eq('school_id',session.schoolId)
    .maybeSingle()
  const targetError = staffAccessError(session,target)
  if (targetError) return {error:targetError}
  if (id===session.userId && payload.role && payload.role!==session.role) return {error:'ไม่สามารถเปลี่ยนบทบาทบัญชีที่กำลังใช้งาน'}
  const { error } = await db.from('users').update(payload).eq('id', id).eq('school_id',session.schoolId)
  if (!error && target?.email?.startsWith('pending-') && payload.role) {
    await db.auth.admin.updateUserById(id,{app_metadata:{staff_role_pending:false}})
  }
  if (!error && target?.school_id) {
    const { data: updated } = await db.from('users')
      .select('id, prefix, full_name, role, school_id')
      .eq('id', id)
      .maybeSingle()
    if (updated) await syncUserRoleToSchoolLeaders(db, target.school_id, updated)
  }
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: target?.school_id ?? session.schoolId,
      action: 'update',
      module: 'users',
      targetType: 'user',
      targetId: id,
      targetLabel: target?.full_name ?? 'ผู้ใช้',
      description: `แก้ไขข้อมูลผู้ใช้ ${target?.full_name || ''}`.trim(),
      metadata: { targetRole: target?.role ?? null, fields: Object.keys(payload) },
    })
  }
  return { error: error?.message }
}

export async function toggleUserActive(id: string, isActive: boolean) {
  const session = await requireSchoolSession()
  const accessError=staffAccessError(session)
  if (accessError) return {error:accessError}
  if (id===session.userId) return {error:'ไม่สามารถระงับหรืออนุมัติบัญชีที่กำลังใช้งาน'}
  if (typeof isActive!=='boolean') return {error:'สถานะไม่ถูกต้อง'}
  const db = createServerClient()
  const { data: target } = await db.from('users').select('full_name, role, school_id').eq('id', id).eq('school_id',session.schoolId).maybeSingle()
  const targetError=staffAccessError(session,target)
  if (targetError) return {error:targetError}
  if (session.role==='admin' && target?.role==='admin') return {error:'การอนุมัติหรือระงับผู้ดูแลโรงเรียนต้องทำโดยผู้ดูแลเขต'}
  const { error } = await db.from('users').update({ is_active: isActive }).eq('id', id).eq('school_id',session.schoolId)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: target?.school_id ?? session.schoolId,
      action: isActive ? 'activate' : 'deactivate',
      module: 'users',
      targetType: 'user',
      targetId: id,
      targetLabel: target?.full_name ?? 'ผู้ใช้',
      description: `${isActive ? 'เปิดใช้งาน' : 'ระงับ'}ผู้ใช้ ${target?.full_name || ''}`.trim(),
      metadata: { targetRole: target?.role ?? null },
    })
  }
  return {error:error?.message || null}
}

/** ลบบุคลากรออกจากระบบ (auth + users) — ใช้ได้เฉพาะ admin/district */
export async function deleteSchoolUser(id: string) {
  const session = await requireSchoolSession()
  const accessError=staffAccessError(session)
  if (accessError) return {error:accessError}
  if (session.userId === id) return { error: 'ไม่สามารถลบบัญชีของตนเองได้' }

  const db = createServerClient()
  const { data: target } = await db.from('users')
    .select('id, full_name, prefix, role, school_id')
    .eq('id', id)
    .eq('school_id',session.schoolId)
    .maybeSingle()
  const targetError=staffAccessError(session,target)
  if (targetError || !target) return {error:targetError || 'ไม่พบผู้ใช้'}

  if (session.role === 'admin') {
    if (!session.schoolId || target.school_id !== session.schoolId) {
      return { error: 'ไม่มีสิทธิ์ลบผู้ใช้คนนี้' }
    }
    if (!['teacher', 'academic_head', 'deputy_principal', 'principal'].includes(target.role)) {
      return { error: 'ลบได้เฉพาะครูและผู้บริหารโรงเรียน' }
    }
  } else if (session.role === 'district') {
    if (session.schoolId && target.school_id && target.school_id !== session.schoolId) {
      return { error: 'ไม่มีสิทธิ์ลบผู้ใช้คนนี้' }
    }
    if (target.role === 'district') {
      return { error: 'ไม่สามารถลบบัญชีเขตได้' }
    }
  }

  if (target.school_id) {
    await clearUserFromLeaderSlots(db, target.school_id, id)
  }

  const { error: authError } = await db.auth.admin.deleteUser(id)
  if (authError) return { error: authError.message }

  const { error } = await db.from('users').delete().eq('id', id).eq('school_id',session.schoolId)
  // แถว users อาจถูกลบแล้วจาก ON DELETE CASCADE ของ auth.users — ไม่ถือเป็น error
  if (error && !/not found|0 rows|does not exist/i.test(error.message)) {
    return { error: error.message }
  }

  await logActivity({
    actor: session,
    schoolId: target.school_id ?? session.schoolId,
    action: 'delete',
    module: 'users',
    targetType: 'user',
    targetId: id,
    targetLabel: target.full_name ?? 'ผู้ใช้',
    description: `ลบบุคลากร ${target.full_name || ''}`.trim(),
    metadata: { targetRole: target.role ?? null },
  })
  return { error: null }
}

// ============================================================
// Academic Years
// ============================================================

export async function setScoreEntryOpen(yearId: string, term: number, open: boolean) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES) || !session.schoolId) return { error: 'ไม่มีสิทธิ์' }
  if (![1, 2].includes(term) || typeof open !== 'boolean') return { error: 'ข้อมูลไม่ถูกต้อง' }
  const db = createServerClient()
  const field = term === 1 ? 'term1_scores_open' : 'term2_scores_open'
  const { data, error } = await db.from('academic_years').update({ [field]: open })
    .eq('id', yearId).eq('school_id', session.schoolId).select('year_be').maybeSingle()
  if (error || !data) return { error: error?.message || 'ไม่พบปีการศึกษาในโรงเรียนนี้' }
  await logActivity({
    actor: session, schoolId: session.schoolId, action: 'update', module: 'academic_years',
    targetType: 'academic_year', targetId: yearId, targetLabel: String(data.year_be),
    description: `${open ? 'เปิด' : 'ปิด'}การบันทึกคะแนน ปีการศึกษา ${data.year_be} ภาคเรียนที่ ${term}`,
    metadata: { term, open },
  })
  return { error: undefined }
}

export async function fetchAcademicYears() {
  const session = await requireSchoolSession()
  const db = createServerClient()
  if (!session.schoolId) return { schoolId: null, years: [] }
  const { data } = await db.from('academic_years')
    .select('*')
    .eq('school_id', session.schoolId)
    .order('year_be', { ascending: false })
  return { schoolId: session.schoolId, years: data || [] }
}

export async function fetchGlobalTermCalendarsForSchoolYears() {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return []
  const db = createServerClient()
  if (!session.schoolId) return []
  const { data: years } = await db.from('academic_years')
    .select('year_be')
    .eq('school_id', session.schoolId)
  const yearBes = [...new Set((years || []).map(y => y.year_be))]
  if (yearBes.length === 0) return []
  const { data, error } = await db.from('global_term_calendars')
    .select('id, year_be, term1_start_date, term1_end_date, term2_start_date, term2_end_date')
    .in('year_be', yearBes)
    .order('year_be', { ascending: false })
  // ตารางยังไม่ migrate / schema cache ยังไม่มี → ถือว่ายังไม่มีข้อมูลกลาง
  if (error) {
    console.warn('[fetchGlobalTermCalendarsForSchoolYears]', error.message)
    return []
  }
  return data || []
}

export async function saveAcademicYear(id: string | null, payload: Record<string, unknown>) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  if (id) {
    const { error } = await db.from('academic_years').update(payload).eq('id', id)
    if (!error) {
      await logActivity({
        actor: session,
        schoolId: session.schoolId,
        action: 'update',
        module: 'academic_years',
        targetType: 'academic_year',
        targetId: id,
        targetLabel: String(payload.year_be || 'ปีการศึกษา'),
        description: `แก้ไขปีการศึกษา ${payload.year_be || ''}`.trim(),
        metadata: { fields: Object.keys(payload) },
      })
    }
    return { error: error?.message }
  }
  const { data, error } = await db.from('academic_years').insert(payload).select('id').single()
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId ?? (typeof payload.school_id === 'string' ? payload.school_id : null),
      action: 'create',
      module: 'academic_years',
      targetType: 'academic_year',
      targetId: data?.id ?? null,
      targetLabel: String(payload.year_be || 'ปีการศึกษา'),
      description: `เพิ่มปีการศึกษา ${payload.year_be || ''}`.trim(),
      metadata: { fields: Object.keys(payload) },
    })
  }
  return { error: error?.message }
}

export async function syncAcademicYearCalendarFromGlobal(yearId: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { data: year } = await db.from('academic_years')
    .select('id, year_be, school_id')
    .eq('id', yearId)
    .maybeSingle()
  if (!year) return { error: 'ไม่พบปีการศึกษา' }
  if (session.role !== 'district' && year.school_id !== session.schoolId) return { error: 'ไม่มีสิทธิ์' }

  const { data: globalCalendar } = await db.from('global_term_calendars')
    .select('term1_start_date, term1_end_date, term2_start_date, term2_end_date')
    .eq('year_be', year.year_be)
    .maybeSingle()
  if (!globalCalendar) return { error: 'ยังไม่มีปฏิทินกลางของปีนี้' }

  const { error } = await db.from('academic_years')
    .update({
      term1_start_date: globalCalendar.term1_start_date,
      term1_end_date: globalCalendar.term1_end_date,
      term2_start_date: globalCalendar.term2_start_date,
      term2_end_date: globalCalendar.term2_end_date,
    })
    .eq('id', yearId)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: year.school_id,
      action: 'sync',
      module: 'academic_years',
      targetType: 'academic_year',
      targetId: yearId,
      targetLabel: String(year.year_be),
      description: `ซิงก์วันเปิด-ปิดภาคเรียนจากส่วนกลาง ปี ${year.year_be}`,
      metadata: { yearBe: year.year_be },
    })
  }
  return { error: error?.message || null }
}

export async function setActiveAcademicYear(id: string, schoolId: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  await db.from('academic_years').update({ is_active: false }).eq('school_id', schoolId)
  const { error } = await db.from('academic_years').update({ is_active: true }).eq('id', id)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId,
      action: 'activate',
      module: 'academic_years',
      targetType: 'academic_year',
      targetId: id,
      description: 'ตั้งปีการศึกษาปัจจุบัน',
    })
  }
}

// ============================================================
// Holidays
// ============================================================

export async function fetchAcademicYearsForHolidays() {
  const session = await requireSchoolSession()
  const db = createServerClient()
  const query = db.from('academic_years').select('id, year_be, is_active').order('year_be', { ascending: false })
  if (session.schoolId) query.eq('school_id', session.schoolId)
  const { data } = await query
  return data || []
}

export async function fetchHolidays(yearId: string) {
  await requireSchoolSession()
  const db = createServerClient()
  const { data } = await db.from('holidays')
    .select('*')
    .eq('academic_year_id', yearId)
    .order('date')
  return data || []
}

export async function fetchWeekendSchoolDays(yearId: string) {
  await requireSchoolSession()
  const db = createServerClient()
  const { data, error } = await db.from('weekend_school_days')
    .select('*')
    .eq('academic_year_id', yearId)
    .order('date')
  if (error) return []
  return data || []
}

export async function fetchGlobalHolidaysForYear(yearId: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return []
  const db = createServerClient()
  const { data: year } = await db.from('academic_years')
    .select('year_be')
    .eq('id', yearId)
    .maybeSingle()
  if (!year?.year_be) return []
  const { data } = await db.from('global_holidays')
    .select('id, year_be, date, name')
    .eq('year_be', year.year_be)
    .order('date')
  return data || []
}

export async function syncHolidaysFromGlobal(yearId: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์', added: 0, skipped: 0 }
  const db = createServerClient()
  const { data: year } = await db.from('academic_years')
    .select('id, year_be, school_id')
    .eq('id', yearId)
    .maybeSingle()
  if (!year) return { error: 'ไม่พบปีการศึกษา', added: 0, skipped: 0 }
  if (session.role !== 'district' && year.school_id !== session.schoolId) {
    return { error: 'ไม่มีสิทธิ์', added: 0, skipped: 0 }
  }

  const [{ data: globalRows }, { data: localRows }] = await Promise.all([
    db.from('global_holidays').select('date, name').eq('year_be', year.year_be).order('date'),
    db.from('holidays').select('date, name').eq('academic_year_id', yearId),
  ])
  const existing = new Set((localRows || []).map(h => `${h.date}|${h.name}`))
  const rows = (globalRows || [])
    .filter(h => !existing.has(`${h.date}|${h.name}`))
    .map(h => ({ academic_year_id: yearId, date: h.date, name: h.name }))

  if (rows.length === 0) {
    return { error: null, added: 0, skipped: globalRows?.length || 0 }
  }
  const { error } = await db.from('holidays').insert(rows)
  if (!error) {
    invalidateSchoolCalendar(yearId)
    await logActivity({
      actor: session,
      schoolId: year.school_id,
      action: 'sync',
      module: 'holidays',
      targetType: 'academic_year',
      targetId: yearId,
      targetLabel: String(year.year_be),
      description: `ซิงก์วันหยุดกลาง ปี ${year.year_be} เพิ่ม ${rows.length} วัน`,
      metadata: { yearBe: year.year_be, added: rows.length, skipped: (globalRows?.length || 0) - rows.length },
    })
  }
  return {
    error: error?.message || null,
    added: error ? 0 : rows.length,
    skipped: (globalRows?.length || 0) - rows.length,
  }
}

export async function addHoliday(yearId: string, date: string, name: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { data: year } = await db.from('academic_years').select('school_id, year_be').eq('id', yearId).maybeSingle()
  const { error } = await db.from('holidays').insert({ academic_year_id: yearId, date, name })
  if (!error) {
    invalidateSchoolCalendar(yearId)
    await logActivity({
      actor: session,
      schoolId: year?.school_id ?? session.schoolId,
      action: 'create',
      module: 'holidays',
      targetType: 'holiday',
      targetLabel: name,
      description: `เพิ่มวันหยุด ${name} (${date})`,
      metadata: { yearId, yearBe: year?.year_be ?? null, date },
    })
  }
  return { error: error?.message }
}

export async function bulkAddHolidays(yearId: string, rows: { date: string; name: string }[]) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์', added: 0, skipped: 0 }
  if (!rows.length) return { error: 'ไม่พบรายการที่นำเข้าได้', added: 0, skipped: 0 }

  const db = createServerClient()
  const { data: year } = await db.from('academic_years').select('school_id, year_be').eq('id', yearId).maybeSingle()
  if (!year) return { error: 'ไม่พบปีการศึกษา', added: 0, skipped: 0 }

  let added = 0
  let skipped = 0
  for (const row of rows) {
    if (!row.date || !row.name?.trim()) {
      skipped += 1
      continue
    }
    const { error } = await db.from('holidays').insert({
      academic_year_id: yearId,
      date: row.date,
      name: row.name.trim(),
    })
    if (error) {
      if (error.message.includes('duplicate')) skipped += 1
      else return { error: error.message, added, skipped }
    } else {
      added += 1
    }
  }

  if (added > 0) {
    invalidateSchoolCalendar(yearId)
    await logActivity({
      actor: session,
      schoolId: year.school_id ?? session.schoolId,
      action: 'create',
      module: 'holidays',
      targetType: 'holiday',
      targetLabel: `นำเข้าวันหยุด ${added} รายการ`,
      description: `นำเข้าวันหยุดแบบกลุ่ม ${added} รายการ`,
      metadata: { yearId, yearBe: year.year_be, added, skipped },
    })
  }

  return { error: null, added, skipped }
}

function isSaturdayOrSunday(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay()
  return day === 0 || day === 6
}

export async function addWeekendSchoolDay(yearId: string, date: string, name: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!date || !isSaturdayOrSunday(date)) return { error: 'เลือกได้เฉพาะวันเสาร์หรือวันอาทิตย์' }

  const db = createServerClient()
  const { data: year } = await db.from('academic_years').select('school_id, year_be').eq('id', yearId).maybeSingle()
  if (!year) return { error: 'ไม่พบปีการศึกษา' }
  if (session.role !== 'district' && year.school_id !== session.schoolId) return { error: 'ไม่มีสิทธิ์' }

  const label = name?.trim() || 'เปิดสอนเสาร์-อาทิตย์'
  const { error } = await db.from('weekend_school_days')
    .upsert({ academic_year_id: yearId, date, name: label }, { onConflict: 'academic_year_id,date' })
  if (!error) {
    invalidateSchoolCalendar(yearId)
    await logActivity({
      actor: session,
      schoolId: year.school_id,
      action: 'upsert',
      module: 'holidays',
      targetType: 'weekend_school_day',
      targetLabel: label,
      description: `กำหนดวันเปิดสอนเสาร์-อาทิตย์ ${label} (${date})`,
      metadata: { yearId, yearBe: year.year_be, date },
    })
  }
  return { error: error?.message || null }
}

export async function deleteWeekendSchoolDay(id: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { data: row } = await db.from('weekend_school_days')
    .select('date, name, academic_year_id, academic_years(school_id, year_be)')
    .eq('id', id)
    .maybeSingle()
  const { error } = await db.from('weekend_school_days').delete().eq('id', id)
  if (!error) {
    invalidateSchoolCalendar(row?.academic_year_id)
    const year = Array.isArray(row?.academic_years) ? row?.academic_years[0] : row?.academic_years
    await logActivity({
      actor: session,
      schoolId: year?.school_id ?? session.schoolId,
      action: 'delete',
      module: 'holidays',
      targetType: 'weekend_school_day',
      targetId: id,
      targetLabel: row?.name ?? 'วันเปิดสอนเสาร์-อาทิตย์',
      description: `ลบวันเปิดสอนเสาร์-อาทิตย์ ${row?.name || ''}`.trim(),
      metadata: { date: row?.date ?? null, yearBe: year?.year_be ?? null },
    })
  }
  return { error: error?.message || null }
}

export async function deleteHoliday(id: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { data: holiday } = await db.from('holidays')
    .select('date, name, academic_year_id, academic_years(school_id, year_be)')
    .eq('id', id)
    .maybeSingle()
  const { error } = await db.from('holidays').delete().eq('id', id)
  if (!error) {
    invalidateSchoolCalendar(holiday?.academic_year_id)
    const year = Array.isArray(holiday?.academic_years) ? holiday?.academic_years[0] : holiday?.academic_years
    await logActivity({
      actor: session,
      schoolId: year?.school_id ?? session.schoolId,
      action: 'delete',
      module: 'holidays',
      targetType: 'holiday',
      targetId: id,
      targetLabel: holiday?.name ?? 'วันหยุด',
      description: `ลบวันหยุด ${holiday?.name || ''}`.trim(),
      metadata: { date: holiday?.date ?? null, yearBe: year?.year_be ?? null },
    })
  }
}

// ============================================================
// Permissions
// ============================================================

export async function fetchPermissionsData() {
  const session = await requireSchoolSession()
  const db = createServerClient()
  const schoolId = session.schoolId

  const [teachersRes, classroomsRes, subjectsRes] = await Promise.all([
    db.from('users').select('id, full_name, prefix, role')
      .in('role', ['teacher', 'academic_head', 'deputy_principal'])
      .eq('school_id', schoolId || '')
      .order('full_name'),
    db.from('classrooms').select('id, level, room')
      .eq('school_id', schoolId || '')
      .order('level').order('room'),
    db.from('subjects').select('id, name, code')
      .eq('school_id', schoolId || '')
      .order('code'),
  ])
  const classroomIds = (classroomsRes.data || []).map(c => c.id)
  const [classSubjectsRes, permissionsRes] = classroomIds.length
    ? await Promise.all([
      db.from('class_subjects').select('id, classroom_id, subject_id, order_number')
        .in('classroom_id', classroomIds)
        .order('order_number'),
      db.from('teacher_permissions').select('*')
        .in('classroom_id', classroomIds),
    ])
    : [{ data: [] }, { data: [] }]

  return {
    teachers: teachersRes.data || [],
    classrooms: classroomsRes.data || [],
    subjects: subjectsRes.data || [],
    classSubjects: classSubjectsRes.data || [],
    permissions: permissionsRes.data || [],
  }
}

export async function addPermission(teacherId: string, classroomId: string, subjectId: string | null) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { error } = await db.from('teacher_permissions').insert({
    teacher_id: teacherId,
    classroom_id: classroomId,
    subject_id: subjectId || null,
  })
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: await resolveClassroomSchoolId(classroomId),
      action: 'create',
      module: 'permissions',
      targetType: 'teacher_permission',
      targetLabel: subjectId ? 'สิทธิ์รายวิชา' : 'สิทธิ์ทุกวิชาในห้อง',
      description: 'เพิ่มสิทธิ์ครูผู้สอน',
      metadata: { teacherId, classroomId, subjectId },
    })
  }
  return { error: error?.message }
}

export async function addPermissions(rows: { teacher_id: string; classroom_id: string; subject_id: string }[]) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', added: 0 }
  if (rows.length === 0) return { error: 'ไม่มีรายการให้เพิ่ม', added: 0 }
  const db = createServerClient()
  const { error } = await db.from('teacher_permissions').insert(rows)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: rows[0]?.classroom_id ? await resolveClassroomSchoolId(rows[0].classroom_id) : session.schoolId,
      action: 'create',
      module: 'permissions',
      targetType: 'teacher_permission',
      description: `เพิ่มสิทธิ์ครูผู้สอน ${rows.length} รายการ`,
      metadata: { count: rows.length },
    })
  }
  return { error: error?.message, added: error ? 0 : rows.length }
}

export async function removePermission(id: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return
  const db = createServerClient()
  const { data: permission } = await db.from('teacher_permissions')
    .select('teacher_id, classroom_id, subject_id')
    .eq('id', id)
    .maybeSingle()
  const { error } = await db.from('teacher_permissions').delete().eq('id', id)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: permission?.classroom_id ? await resolveClassroomSchoolId(permission.classroom_id) : session.schoolId,
      action: 'delete',
      module: 'permissions',
      targetType: 'teacher_permission',
      targetId: id,
      description: 'ลบสิทธิ์ครูผู้สอน',
      metadata: {
        teacherId: permission?.teacher_id ?? null,
        classroomId: permission?.classroom_id ?? null,
        subjectId: permission?.subject_id ?? null,
      },
    })
  }
}

// ============================================================
// Period Config — คาบสอนต่อสัปดาห์
// ============================================================

export async function fetchPeriodConfigs() {
  const session = await requireSchoolSession()
  const db = createServerClient()
  const [classroomsRes, periodsRes] = await Promise.all([
    db.from('classrooms')
      .select('id, level, room')
      .eq('school_id', session.schoolId || '')
      .order('level').order('room'),
    db.from('period_config')
      .select('*'),
  ])
  const classrooms = classroomsRes.data || []
  const periodMap = Object.fromEntries(
    (periodsRes.data || []).map((p: Record<string, unknown>) => [p.classroom_id as string, p])
  )
  return classrooms.map((c: { id: string; level: string; room: number }) => ({
    ...c,
    config: periodMap[c.id] || null,
  }))
}

export async function savePeriodConfig(
  classroomId: string,
  hours: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number }
) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const payload = {
    classroom_id: classroomId,
    mon_hours: hours.mon, tue_hours: hours.tue, wed_hours: hours.wed,
    thu_hours: hours.thu, fri_hours: hours.fri, sat_hours: hours.sat, sun_hours: hours.sun,
  }
  const { data: existing } = await db.from('period_config').select('id').eq('classroom_id', classroomId).maybeSingle()
  if (existing) {
    const { error } = await db.from('period_config').update(payload).eq('classroom_id', classroomId)
    if (!error) {
      await logActivity({
        actor: session,
        schoolId: await resolveClassroomSchoolId(classroomId),
        action: 'update',
        module: 'periods',
        targetType: 'classroom',
        targetId: classroomId,
        description: 'แก้ไขคาบสอนต่อสัปดาห์',
        metadata: { classroomId },
      })
    }
    return { error: error?.message }
  }
  const { error } = await db.from('period_config').insert(payload)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: await resolveClassroomSchoolId(classroomId),
      action: 'create',
      module: 'periods',
      targetType: 'classroom',
      targetId: classroomId,
      description: 'เพิ่มคาบสอนต่อสัปดาห์',
      metadata: { classroomId },
    })
  }
  return { error: error?.message }
}

// ============================================================
// Import DMC — นำเข้านักเรียนจากไฟล์ DMC
// ============================================================

export async function fetchClassroomsForImport() {
  const session = await requireSchoolSession()
  const db = createServerClient()
  const { data } = await db.from('classrooms')
    .select('id, level, room, academic_year_id, academic_years(year_be, is_active)')
    .eq('school_id', session.schoolId || '')
    .order('level').order('room')
  return data || []
}

function normalizeImportNationalId(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  let s = String(raw).trim()
  if (!s) return null
  // Excel บางไฟล์อ่านเลขบัตรเป็น scientific notation
  if (/e[+-]?\d+/i.test(s)) {
    const n = Number(s)
    if (Number.isFinite(n)) s = Math.round(n).toString()
  }
  const digits = s.replace(/\D/g, '')
  return digits.length >= 10 ? digits : (digits || null)
}

function normalizeImportName(raw: unknown, fallback = '-'): string {
  const s = String(raw ?? '').trim()
  return s || fallback
}

function normalizeImportGender(raw: unknown, prefix: string): string {
  const r = String(raw ?? '').trim()
  if (r === 'M' || r === 'F') return r
  if (r === 'ช' || r.includes('ชาย') || r.toLowerCase() === 'm') return 'M'
  if (r === 'ญ' || r.includes('หญิง') || r.toLowerCase() === 'f') return 'F'
  return prefix === 'เด็กหญิง' || prefix === 'นางสาว' || prefix === 'นาง' ? 'F' : 'M'
}

export async function importStudents(classroomId: string, rows: {
  student_code: string | null
  national_id: string | null
  prefix: string
  first_name: string
  last_name: string
  gender: string
  birth_date: string | null
  address?: string | null
  status: string
}[]) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์', inserted: 0, skipped: 0, duplicate: 0, failed: 0, firstError: null as string | null }
  if (!classroomId) return { error: 'ยังไม่ได้เลือกชั้นเรียนปลายทาง', inserted: 0, skipped: 0, duplicate: 0, failed: 0, firstError: null as string | null }
  if (rows.length === 0) return { error: 'ไม่มีข้อมูลนักเรียน', inserted: 0, skipped: 0, duplicate: 0, failed: 0, firstError: null as string | null }
  const db = createServerClient()

  // กันซ้ำด้วยเลขบัตร + หาเลขที่ล่าสุดในห้อง (เพื่อไล่เลขที่ต่อ)
  const { data: existing } = await db.from('students')
    .select('student_number, national_id').eq('classroom_id', classroomId)
  const existingNat = new Set(
    (existing || [])
      .map(e => normalizeImportNationalId(e.national_id))
      .filter((v): v is string => Boolean(v)),
  )
  let maxNo = Math.max(0, ...((existing || []).map(e => e.student_number || 0)))

  let inserted = 0
  let duplicate = 0
  let failed = 0
  let firstError: string | null = null
  for (const row of rows) {
    const nationalId = normalizeImportNationalId(row.national_id)
    if (nationalId && existingNat.has(nationalId)) { duplicate++; continue }
    const payload = {
      student_code: row.student_code ? String(row.student_code).trim() || null : null,
      national_id: nationalId,
      prefix: normalizeImportName(row.prefix, 'เด็กชาย'),
      first_name: normalizeImportName(row.first_name),
      last_name: normalizeImportName(row.last_name),
      gender: normalizeImportGender(row.gender, String(row.prefix || '')),
      birth_date: row.birth_date || null,
      address: row.address ?? null,
      status: row.status || 'เรียน',
      classroom_id: classroomId,
      student_number: maxNo + 1,
    }
    const { error } = await db.from('students').insert(payload)
    if (!error) {
      inserted++
      maxNo++
      if (nationalId) existingNat.add(nationalId)
    } else {
      failed++
      if (!firstError) firstError = error.message
    }
  }
  const skipped = duplicate + failed
  if (inserted > 0) invalidateClassroomStudents(classroomId)
  await logActivity({
    actor: session,
    schoolId: await resolveClassroomSchoolId(classroomId),
    action: 'import',
    module: 'students',
    targetType: 'classroom',
    targetId: classroomId,
    description: `นำเข้านักเรียน DMC สำเร็จ ${inserted} คน ข้าม ${skipped} คน`,
    metadata: { classroomId, inserted, skipped, duplicate, failed, total: rows.length, firstError },
  })
  return { error: null, inserted, skipped, duplicate, failed, firstError }
}

type ImportStudentRow = {
  student_code: string | null
  national_id: string | null
  prefix: string
  first_name: string
  last_name: string
  gender: string
  birth_date: string | null
  address?: string | null
  status: string
}

type ImportStudentSchoolRow = ImportStudentRow & {
  level: string
  room: number | string
}

function normalizeClassLevel(level: string) {
  const raw = String(level || '').trim().replace(/\s+/g, '')
  const compact = raw
    .replace(/^อนุบาล/, 'อ.')
    .replace(/^อ(\d)/, 'อ.$1')
    .replace(/^ประถมศึกษาปีที่/, 'ป.')
    .replace(/^ประถม/, 'ป.')
    .replace(/^ป(\d)/, 'ป.$1')
  return compact
}

function normalizeClassKey(level: string, room: number | string) {
  const cleanLevel = normalizeClassLevel(level)
  const cleanRoom = Number(String(room || '').trim())
  return `${cleanLevel}|${Number.isFinite(cleanRoom) ? cleanRoom : String(room || '').trim()}`
}

export async function importStudentsWholeSchool(academicYearId: string, rows: ImportStudentSchoolRow[]) {
  const empty = { inserted: 0, skipped: 0, missingClass: 0, duplicate: 0, failed: 0, firstError: null as string | null }
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์', ...empty }
  if (!academicYearId) return { error: 'ยังไม่ได้เลือกปีการศึกษา', ...empty }
  if (rows.length === 0) return { error: 'ไม่มีข้อมูลนักเรียน', ...empty }

  const db = createServerClient()
  const { data: initialClassrooms } = await db.from('classrooms')
    .select('id, level, room, school_id')
    .eq('academic_year_id', academicYearId)
    .eq('school_id', session.schoolId || '')

  const classroomRows = [...(initialClassrooms || [])]
  const classroomByKey = new Map(classroomRows.map(c => [normalizeClassKey(c.level, c.room), c]))
  const neededClasses = new Map<string, { level: string; room: number }>()
  for (const row of rows) {
    const key = normalizeClassKey(row.level, row.room)
    if (classroomByKey.has(key) || neededClasses.has(key)) continue
    const room = Number(String(row.room || '').trim())
    if (!Number.isFinite(room)) continue
    neededClasses.set(key, { level: normalizeClassLevel(row.level), room })
  }

  if (neededClasses.size > 0) {
    const { data: createdClassrooms, error: createClassError } = await db.from('classrooms')
      .insert([...neededClasses.values()].map(c => ({
        ...c,
        academic_year_id: academicYearId,
        school_id: session.schoolId,
      })))
      .select('id, level, room, school_id')
    if (createClassError) {
      return { error: `สร้างห้องเรียนที่ขาดไม่สำเร็จ: ${createClassError.message}`, ...empty, skipped: rows.length, missingClass: rows.length }
    }
    for (const classroom of createdClassrooms || []) {
      classroomRows.push(classroom)
      classroomByKey.set(normalizeClassKey(classroom.level, classroom.room), classroom)
    }
  }

  if (classroomRows.length === 0) {
    return { error: 'ยังไม่มีชั้นเรียนในปีการศึกษานี้', ...empty, skipped: rows.length, missingClass: rows.length }
  }

  const classroomIds = classroomRows.map(c => c.id)
  const { data: existing } = await db.from('students')
    .select('classroom_id, student_number, national_id')
    .in('classroom_id', classroomIds)

  const existingNat = new Set(
    (existing || [])
      .map(s => normalizeImportNationalId(s.national_id))
      .filter((v): v is string => Boolean(v)),
  )
  const maxNoByClass = new Map<string, number>()
  for (const classroomId of classroomIds) maxNoByClass.set(classroomId, 0)
  for (const s of existing || []) {
    maxNoByClass.set(s.classroom_id, Math.max(maxNoByClass.get(s.classroom_id) || 0, s.student_number || 0))
  }

  let inserted = 0
  let duplicate = 0
  let failed = 0
  let missingClass = 0
  let firstError: string | null = null
  const touchedClassroomIds = new Set<string>()

  for (const row of rows) {
    const classroom = classroomByKey.get(normalizeClassKey(row.level, row.room))
    if (!classroom) { missingClass++; continue }
    const nationalId = normalizeImportNationalId(row.national_id)
    if (nationalId && existingNat.has(nationalId)) { duplicate++; continue }

    const nextNo = (maxNoByClass.get(classroom.id) || 0) + 1
    const { error } = await db.from('students').insert({
      student_code: row.student_code ? String(row.student_code).trim() || null : null,
      national_id: nationalId,
      prefix: normalizeImportName(row.prefix, 'เด็กชาย'),
      first_name: normalizeImportName(row.first_name),
      last_name: normalizeImportName(row.last_name),
      gender: normalizeImportGender(row.gender, String(row.prefix || '')),
      birth_date: row.birth_date || null,
      address: row.address ?? null,
      status: row.status || 'เรียน',
      classroom_id: classroom.id,
      student_number: nextNo,
    })
    if (error) {
      failed++
      if (!firstError) firstError = error.message
      continue
    }
    inserted++
    touchedClassroomIds.add(classroom.id)
    maxNoByClass.set(classroom.id, nextNo)
    if (nationalId) existingNat.add(nationalId)
  }

  const skipped = duplicate + failed + missingClass
  if (touchedClassroomIds.size > 0) invalidateClassroomStudentsMany(touchedClassroomIds)

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'import',
    module: 'students',
    targetType: 'school',
    targetId: session.schoolId,
    description: `นำเข้านักเรียน DMC ทั้งโรงเรียน สำเร็จ ${inserted} คน ข้าม ${skipped} คน`,
    metadata: { academicYearId, inserted, skipped, missingClass, duplicate, failed, total: rows.length, firstError },
  })

  return { error: null, inserted, skipped, missingClass, duplicate, failed, firstError }
}

// ============================================================
// Password Reset — admin รร รีเซ็ตรหัสครูเป็น 123456 แล้วบังคับเปลี่ยนตอนเข้าครั้งแรก
// ============================================================
export async function resetTeacherPassword(userId: string) {
  const session = await requireSchoolSession()
  const accessError=staffAccessError(session)
  if (accessError) return {error:accessError}
  const db = createServerClient()
  const { SCHOOL_TEMP_PASSWORD } = await import('@/lib/school-temp-password')
  const {data:target} = await db.from('users').select('full_name, role, school_id').eq('id',userId).eq('school_id',session.schoolId).maybeSingle()
  const targetError=staffAccessError(session,target)
  if (targetError) return {error:targetError}
  if (session.role==='admin' && target?.role==='admin') {
    return {error:'การรีเซ็ตรหัสผ่านผู้ดูแลโรงเรียนต้องทำโดยผู้ดูแลเขต'}
  }

  const { error } = await db.auth.admin.updateUserById(userId, { password: SCHOOL_TEMP_PASSWORD })
  if (error) return { error: error.message }

  const flagRes = await db.from('users').update({ must_change_password: true }).eq('id', userId).eq('school_id',session.schoolId)
  if (flagRes.error && !String(flagRes.error.message || '').includes('must_change_password')) {
    return { error: flagRes.error.message }
  }

  await logActivity({
    actor: session,
    schoolId: target?.school_id ?? session.schoolId,
    action: 'reset_password',
    module: 'users',
    targetType: 'user',
    targetId: userId,
    targetLabel: target?.full_name ?? 'ผู้ใช้',
    description: `รีเซ็ตรหัสผ่านผู้ใช้ ${target?.full_name || ''} เป็นรหัสชั่วคราว`.trim(),
    metadata: { targetRole: target?.role ?? null, tempPassword: true },
  })
  return { error: undefined, tempPassword: SCHOOL_TEMP_PASSWORD }
}

// ============================================================
// Subjects — รายวิชา
// ============================================================

export async function fetchSubjects() {
  const session = await requireSchoolSession()
  const db = createServerClient()
  if (!session.schoolId) return []
  const { data } = await db.from('subjects')
    .select('*')
    .eq('school_id', session.schoolId)
    .order('code')
  return data || []
}

export async function fetchSchoolSubjectGroups() {
  const session = await requireSchoolSession()
  if (!session.schoolId) return { groups: [], error: 'กรุณาเลือกโรงเรียน' }
  const db = createServerClient()
  const { data, error } = await db.from('school_subject_groups')
    .select('name').eq('school_id', session.schoolId).order('name')
  if (error) {
    if (/school_subject_groups|schema cache/i.test(error.message)) {
      return { groups: SUBJECT_GROUPS.map(name => ({ name })), error: 'ยังไม่ได้ติดตั้ง migration 078_school_subject_groups.sql' }
    }
    return { groups: SUBJECT_GROUPS.map(name => ({ name })), error: error.message }
  }
  return { groups: data || [], error: null }
}

export async function manageSchoolSubjectGroup(action: 'add' | 'rename' | 'delete', name: string, newName?: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'กรุณาเลือกโรงเรียน' }
  const db = createServerClient()
  const { data, error } = await db.rpc('manage_school_subject_group', {
    p_school_id: session.schoolId,
    p_action: action,
    p_name: name,
    p_new_name: newName || null,
  })
  if (error) {
    return { error: /manage_school_subject_group|schema cache/i.test(error.message)
      ? 'ยังไม่ได้ติดตั้ง migration 078_school_subject_groups.sql ในฐานข้อมูล'
      : 'บันทึกกลุ่มสาระไม่สำเร็จ กรุณาลองใหม่' }
  }
  const result = data as { ok?: boolean; error?: string; name?: string }
  if (result?.error || !result?.ok) return { error: result?.error || 'บันทึกกลุ่มสาระไม่สำเร็จ' }
  try {
    await logActivity({
      actor: session, schoolId: session.schoolId,
      action: action === 'add' ? 'create' : action === 'delete' ? 'delete' : 'update',
      module: 'subjects', targetType: 'subject_group', targetLabel: result.name || name,
      description: action === 'add' ? `เพิ่มกลุ่มสาระ ${result.name}` : action === 'rename' ? `แก้ไขกลุ่มสาระ ${name} เป็น ${result.name}` : `ลบกลุ่มสาระ ${name}`,
    })
  } catch (auditError) { console.error('Subject group audit failed', auditError) }
  return { error: null }
}

export async function setMissingSubjectSemesterToSecond() {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', count: 0 }
  if (!session.schoolId) return { error: 'กรุณาเลือกโรงเรียน', count: 0 }
  const db = createServerClient()
  const { data, error } = await db.rpc('set_missing_subject_semester_to_second', { p_school_id: session.schoolId })
  if (error) return { error: 'ยังบันทึกภาคเรียนไม่ได้ กรุณาติดตั้ง migration 079_subject_catalog_semester.sql', count: 0 }
  const count = Number(data || 0)
  try {
    await logActivity({ actor: session, schoolId: session.schoolId, action: 'update', module: 'subjects',
      targetType: 'subject', description: `กำหนดวิชาที่ยังไม่มีภาคเรียนเป็นภาคเรียนที่ 2 จำนวน ${count} วิชา`, metadata: { semester: 2, count } })
  } catch (auditError) { console.error('Subject semester audit failed', auditError) }
  return { error: null, count }
}

async function subjectRoomTerms(schoolId: string) {
  const db = createServerClient()
  const levelOf = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const page = await db.from('classrooms').select('id,level').eq('school_id', schoolId).range(from, from + 999)
    if (page.error) return new Map<string, { levels: string[]; semesters: number[] }>()
    for (const row of page.data || []) levelOf.set(row.id, row.level)
    if (!page.data || page.data.length < 1000) break
  }
  const seen = new Map<string, { levels: Set<string>; semesters: Set<number> }>()
  const ids = [...levelOf.keys()]
  for (let index = 0; index < ids.length; index += 80) {
    const chunk = ids.slice(index, index + 80)
    for (let from = 0; ; from += 1000) {
      const page = await db.from('class_subjects').select('subject_id,semester,classroom_id').in('classroom_id', chunk).range(from, from + 999)
      if (page.error) return new Map<string, { levels: string[]; semesters: number[] }>()
      for (const row of page.data || []) {
        const item = seen.get(row.subject_id) || { levels: new Set<string>(), semesters: new Set<number>() }
        const level = levelOf.get(row.classroom_id)
        if (level) item.levels.add(level)
        if (typeof row.semester === 'number') item.semesters.add(row.semester)
        seen.set(row.subject_id, item)
      }
      if (!page.data || page.data.length < 1000) break
    }
  }
  return new Map([...seen].map(([id, item]) => [id, { levels: [...item.levels], semesters: [...item.semesters] }]))
}

export async function fetchSubjectSettingsInit() {
  const session = await requireSchoolSession()
  const db = createServerClient()
  const [subjects, school, placements, subjectGroupResult] = await Promise.all([
    fetchSubjects(),
    session.schoolId ? getSchoolShell(session.schoolId) : Promise.resolve(null),
    session.schoolId ? subjectRoomTerms(session.schoolId) : Promise.resolve(new Map<string, { levels: string[]; semesters: number[] }>()),
    fetchSchoolSubjectGroups(),
  ])
  let levels: string[] = []
  if (session.schoolId && school?.education_type !== 'primary' && school?.education_type !== 'secondary') {
    const rooms = await db.from('classrooms').select('level').eq('school_id', session.schoolId).in('level', ['ม.4', 'ม.5', 'ม.6']).limit(1)
    levels = (rooms.data || []).map(row => row.level)
  }
  return {
    subjects: (subjects || []).map(subject => {
      const place = placements.get(subject.id)
      return { ...subject, levels: place?.levels || [], semesters: place?.semesters || [] }
    }),
    subjectGroups: subjectGroupResult.groups,
    subjectGroupsError: subjectGroupResult.error,
    educationType: resolveSchoolEducationType(school?.education_type, levels),
  }
}

export async function saveSubject(id: string | null, payload: Record<string, unknown>) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'กรุณาเลือกโรงเรียน' }
  const code = typeof payload.code === 'string' ? payload.code.trim() : ''
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!code || !name) return { error: 'กรุณาระบุรหัสวิชาและชื่อวิชา' }
  const school = await getSchoolShell(session.schoolId)
  if (school?.education_type === 'secondary') {
    try {
      const hours = secondaryCreditHours(payload.credits)
      payload = { ...payload, credits: hours.credits, hours_per_year: hours.annual }
    } catch (error) { return { error: error instanceof Error ? error.message : 'หน่วยกิตไม่ถูกต้อง' } }
  }
  const level = typeof payload.level === 'string' ? payload.level.trim() : ''
  let semester: SubjectSemester | undefined
  if (payload.semester !== undefined) {
    try { semester = parseSubjectSemester(payload.semester) }
    catch (error) { return { error: error instanceof Error ? error.message : 'ภาคเรียนไม่ถูกต้อง' } }
  }
  if (level && !['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'].includes(level)) return { error: 'ชั้นไม่ถูกต้อง' }
  payload = {
    code, name, short_name: payload.short_name, subject_group: payload.subject_group,
    level: level || null,
    type: payload.type, hours_per_year: payload.hours_per_year,
    credits: payload.credits, max_score: payload.max_score,
    ...(semester !== undefined ? { semester } : {}),
  }
  const db = createServerClient()
  const subjectGroup = typeof payload.subject_group === 'string' ? payload.subject_group.trim() : ''
  if (subjectGroup) {
    const { data: group, error: groupError } = await db.from('school_subject_groups').select('name')
      .eq('school_id', session.schoolId).eq('name', subjectGroup).maybeSingle()
    if (groupError) {
      if (!/school_subject_groups|schema cache/i.test(groupError.message)) return { error: 'ตรวจสอบกลุ่มสาระไม่สำเร็จ' }
      if (!SUBJECT_GROUPS.includes(subjectGroup as typeof SUBJECT_GROUPS[number])) return { error: 'กรุณารัน migration 078_school_subject_groups.sql ก่อนใช้กลุ่มสาระแบบกำหนดเอง' }
    } else if (!group) return { error: 'ไม่พบกลุ่มสาระนี้ในโรงเรียน กรุณาโหลดหน้าใหม่แล้วเลือกอีกครั้ง' }
  }
  if (id) {
    const { data: existing, error } = await db.from('subjects').select('id')
      .eq('id', id).eq('school_id', session.schoolId).maybeSingle()
    if (error) return { error: 'ตรวจสอบรายวิชาไม่สำเร็จ กรุณาลองใหม่' }
    if (!existing) return { error: 'ไม่พบรายวิชาที่ต้องการแก้ไขในโรงเรียนนี้ กรุณาโหลดหน้าใหม่' }
  }
  const sameCode = await db.from('subjects').select('id, code, name, level').eq('school_id', session.schoolId).eq('code', code)
  const levelColumnMissing = !!sameCode.error && /level/i.test(sameCode.error.message) && /does not exist|schema cache/i.test(sameCode.error.message)
  if (levelColumnMissing && level) {
    return { error: 'รหัสวิชาใช้ซ้ำได้เมื่อคนละชั้น กรุณารันไฟล์ supabase/migrations/077_subject_code_per_level.sql ใน SQL Editor แล้วลองใหม่' }
  }
  if (sameCode.error && !levelColumnMissing) return { error: 'ตรวจสอบรหัสวิชาไม่สำเร็จ กรุณาลองใหม่' }
  const duplicateRows = levelColumnMissing
    ? (await db.from('subjects').select('id, code, name').eq('school_id', session.schoolId).eq('code', code)).data || []
    : sameCode.data || []
  const duplicate = duplicateRows.find(row => row.id !== id && (levelColumnMissing || ((row as { level?: string | null }).level || '') === (level || '')))
  if (duplicate) {
    return { error: level ? `รหัสวิชา ${code} มีในชั้น ${level} แล้ว` : `รหัสวิชา ${code} ที่ยังไม่กำหนดชั้นมีอยู่แล้ว${levelColumnMissing ? ' ถ้ารหัสนี้คนละชั้น ให้รันไฟล์ supabase/migrations/077_subject_code_per_level.sql' : ' ระบุชั้นให้ต่างจากรายการเดิม'}` }
  }
  const missingLevelColumn = (message?: string) => /level/i.test(message || '') && /does not exist|schema cache/i.test(message || '')
  const saveError = (error: { code?: string; message: string } | null) =>
    /semester/i.test(error?.message || '') && /does not exist|schema cache/i.test(error?.message || '')
      ? 'ยังบันทึกภาคเรียนไม่ได้ กรุณาติดตั้ง migration 079_subject_catalog_semester.sql แล้วลองใหม่'
      : error?.code === '23505'
      ? `รหัสวิชา ${code}${level ? ` ชั้น ${level}` : ''} ซ้ำไม่ได้ ถ้ารหัสนี้คนละชั้นแล้วยังบันทึกไม่ได้ ให้รันไฟล์ supabase/migrations/077_subject_code_per_level.sql`
      : missingLevelColumn(error?.message) || /subjects_level_check/i.test(error?.message || '')
        ? 'ยังบันทึกชั้นไม่ได้ กรุณารันไฟล์ supabase/migrations/076_subject_level.sql ใน SQL Editor แล้วลองใหม่'
        : error?.message
  const { level: _level, ...withoutLevel } = payload
  const persist = (body: Record<string, unknown>) => id
    ? db.from('subjects').update(body).eq('id', id).eq('school_id', session.schoolId).select('id').maybeSingle()
    : db.from('subjects').insert({ ...body, school_id: session.schoolId }).select('id').single()
  let saved = await persist(payload)
  if (saved.error && missingLevelColumn(saved.error.message) && !level) saved = await persist(withoutLevel)
  if (!saved.error && id && !saved.data) return { error: 'ไม่พบรายวิชาที่ต้องการแก้ไข กรุณาโหลดหน้าใหม่' }
  if (!saved.error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: id ? 'update' : 'create',
      module: 'subjects',
      targetType: 'subject',
      targetId: id || saved.data?.id || null,
      targetLabel: String(payload.name || payload.code || 'รายวิชา'),
      description: `${id ? 'แก้ไข' : 'เพิ่ม'}รายวิชา ${payload.name || payload.code || ''}`.trim(),
      metadata: id ? { fields: Object.keys(payload) } : { code },
    })
  }
  return { error: saveError(saved.error) }
}

export async function deleteAllSubjects() {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', count: 0 }
  if (!session.schoolId) return { error: 'กรุณาเลือกโรงเรียน', count: 0 }
  const db = createServerClient()
  const { data, error } = await db.rpc('delete_school_subjects', { p_school_id: session.schoolId })
  if (error) return {
    error: error.code === 'PGRST202'
      ? 'กรุณารัน SQL 060_delete_school_subjects.sql ใน Supabase ก่อนใช้ปุ่มลบทั้งหมด'
      : error.message,
    count: 0,
  }
  const count = Number(data || 0)
  try {
    await logActivity({ actor: session, schoolId: session.schoolId, action: 'delete', module: 'subjects',
      targetType: 'subject', targetLabel: 'รายวิชาทั้งหมด', description: `ลบรายวิชาทั้งหมด ${count} รายการ`, metadata: { count } })
  } catch (error) { console.error('Subject deletion audit failed', error) }
  return { error: undefined, count }
}

export async function deleteSubject(id: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  // กันลบถ้าวิชาถูกใช้ใน class_subjects แล้ว
  const { data: subject } = await db.from('subjects').select('name, code, school_id').eq('id', id).eq('school_id', session.schoolId).maybeSingle()
  if (!subject) return { error: 'ไม่พบรายวิชาในโรงเรียนนี้' }
  const { count } = await db.from('class_subjects')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', id)
  if ((count ?? 0) > 0) return { error: 'ลบไม่ได้ — วิชานี้ถูกเปิดสอนอยู่ (มีใน "วิชาที่เปิดสอน")' }
  const { error } = await db.from('subjects').delete().eq('id', id).eq('school_id', session.schoolId)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: subject?.school_id ?? session.schoolId,
      action: 'delete',
      module: 'subjects',
      targetType: 'subject',
      targetId: id,
      targetLabel: subject ? `${subject.name} (${subject.code})` : 'รายวิชา',
      description: `ลบรายวิชา ${subject ? `${subject.name} (${subject.code})` : ''}`.trim(),
    })
  }
  return { error: error?.message }
}

// ============================================================
// Evaluation Settings — แม่แบบการประเมิน
// ============================================================

function defaultSettingsForKind(kind: EvaluationKind, educationBand?: EducationBand): EvaluationSetting[] {
  if (kind === 'character') {
    return characterDefaultSettingsForBand((educationBand || '1') as EducationBand) as EvaluationSetting[]
  }
  if (kind === 'reading') {
    return readingDefaultSettingsForBand((educationBand || '1') as EducationBand) as EvaluationSetting[]
  }
  return EVALUATION_DEFAULT_SETTINGS[kind] as EvaluationSetting[]
}

async function ensureEvaluationSettings(schoolId: string, kind: EvaluationKind, educationBand?: EducationBand) {
  const band = evaluationBandForKind(kind, educationBand)
  const defaults = buildDefaultEvaluationRows(schoolId, kind, educationBand)
  const db = createServerClient()
  const { data, error } = await db.from('evaluation_settings')
    .select('id, kind, field_key, label, short_label, description, group_label, sort_order, is_active, score_type, max_score, is_required, hours_per_year, rubric_levels, education_band')
    .eq('school_id', schoolId)
    .eq('kind', kind)
    .eq('education_band', band)
    .order('sort_order')

  if (error) {
    return {
      settings: defaultSettingsForKind(kind, educationBand),
      error: error.message.includes('evaluation_settings') ? 'ยังไม่ได้ติดตั้งตาราง evaluation_settings กรุณา apply migration 016_evaluation_settings.sql' : error.message,
    }
  }

  const existingKeys = new Set((data || []).map(row => row.field_key))
  const missing = defaults.filter(row => !existingKeys.has(row.field_key))
  if (missing.length > 0) {
    const { error: insertError } = await db.from('evaluation_settings')
      .upsert(missing, { onConflict: 'school_id,kind,education_band,field_key' })
    if (insertError) return { settings: (data || []) as EvaluationSetting[], error: insertError.message }
    const refreshed = await db.from('evaluation_settings')
      .select('id, kind, field_key, label, short_label, description, group_label, sort_order, is_active, score_type, max_score, is_required, hours_per_year, rubric_levels, education_band')
      .eq('school_id', schoolId)
      .eq('kind', kind)
      .eq('education_band', band)
      .order('sort_order')
    return { settings: (refreshed.data || []).map(row => normalizeEvaluationSetting({ ...(row as EvaluationSetting), kind })), error: refreshed.error?.message ?? null }
  }

  return { settings: (data || []).map(row => normalizeEvaluationSetting({ ...(row as EvaluationSetting), kind })), error: null }
}

export async function fetchEvaluationSettings(kind: EvaluationKind, educationBand?: EducationBand) {
  const session = await requireSchoolSession()
  if (!session.schoolId) return { settings: [] as EvaluationSetting[], error: 'ยังไม่ได้เลือกโรงเรียน' }
  return ensureEvaluationSettings(session.schoolId, kind, educationBand)
}

export async function saveEvaluationSetting(id: string, payload: Partial<Pick<EvaluationSetting, 'label' | 'short_label' | 'description' | 'group_label' | 'sort_order' | 'is_active' | 'hours_per_year'>>) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  if (!id) return { error: 'ไม่พบรายการตั้งค่า' }

  const db = createServerClient()
  const updatePayload: Record<string, unknown> = {
    label: String(payload.label || '').trim(),
    short_label: String(payload.short_label || '').trim(),
    description: payload.description ? String(payload.description).trim() : null,
    group_label: payload.group_label ? String(payload.group_label).trim() : null,
    sort_order: Number(payload.sort_order || 1),
    is_active: Boolean(payload.is_active),
    updated_at: new Date().toISOString(),
  }
  if (payload.hours_per_year !== undefined) {
    updatePayload.hours_per_year = Math.max(0, Number(payload.hours_per_year || 0))
  }

  const { data: before } = await db.from('evaluation_settings')
    .select('kind, field_key, label')
    .eq('id', id)
    .eq('school_id', session.schoolId)
    .maybeSingle()

  if (before?.kind === 'character') {
    const validationError = validateCharacterEvaluationSetting(
      String(payload.label || ''),
      String(payload.short_label || ''),
      payload.description ? String(payload.description) : null,
    )
    if (validationError) return { error: validationError }
    const normalized = normalizeCharacterEvaluationPayload(
      String(payload.label || ''),
      String(payload.short_label || ''),
      payload.description ? String(payload.description) : null,
    )
    Object.assign(updatePayload, normalized)
  } else if (!updatePayload.label || !updatePayload.short_label) {
    return { error: 'กรุณากรอกชื่อและชื่อย่อ' }
  }
  const { error } = await db.from('evaluation_settings')
    .update(updatePayload)
    .eq('id', id)
    .eq('school_id', session.schoolId)

  if (!error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'update',
      module: 'evaluation_settings',
      targetType: 'evaluation_setting',
      targetId: id,
      targetLabel: updatePayload.label,
      description: `แก้ไขการตั้งค่าประเมิน ${before?.label || updatePayload.label}`,
      metadata: { kind: before?.kind, fieldKey: before?.field_key, fields: Object.keys(updatePayload) },
    })
  }

  return { error: error?.message ?? null }
}

export async function createEvaluationSetting(kind: EvaluationKind, payload: Partial<Pick<EvaluationSetting, 'label' | 'short_label' | 'description' | 'group_label' | 'sort_order' | 'is_active' | 'hours_per_year'>>) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const label = String(payload.label || '').trim()
  const shortLabel = String(payload.short_label || '').trim()
  if (kind === 'character') {
    const validationError = validateCharacterEvaluationSetting(
      label,
      shortLabel,
      payload.description ? String(payload.description) : null,
    )
    if (validationError) return { error: validationError }
  } else if (!label || !shortLabel) {
    return { error: 'กรุณากรอกชื่อและชื่อย่อ' }
  }

  const normalizedCharacter = kind === 'character'
    ? normalizeCharacterEvaluationPayload(label, shortLabel, payload.description ? String(payload.description) : null)
    : null

  const scoreType = kind === 'activities' ? 'pass_fail' : 'score_0_3'
  const maxScore = kind === 'activities' ? 1 : 3
  const db = createServerClient()
  const row = {
    school_id: session.schoolId,
    kind,
    field_key: `custom_${kind}_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    label: normalizedCharacter?.label || label,
    short_label: normalizedCharacter?.short_label || shortLabel,
    description: normalizedCharacter ? normalizedCharacter.description : (payload.description ? String(payload.description).trim() : null),
    group_label: normalizedCharacter ? normalizedCharacter.group_label : (payload.group_label ? String(payload.group_label).trim() : EVALUATION_KIND_LABELS[kind]),
    sort_order: normalizedCharacter?.sort_order ?? Number(payload.sort_order || 1),
    is_active: payload.is_active !== false,
    score_type: scoreType,
    max_score: maxScore,
    is_required: false,
    hours_per_year: kind === 'activities' ? Math.max(0, Number(payload.hours_per_year || 0)) : 0,
  }

  const { data, error } = await db.from('evaluation_settings')
    .insert(row)
    .select('id')
    .single()

  if (!error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'create',
      module: 'evaluation_settings',
      targetType: 'evaluation_setting',
      targetId: data?.id ?? null,
      targetLabel: label,
      description: `เพิ่มข้อประเมิน ${label}`,
      metadata: { kind, fieldKey: row.field_key },
    })
  }

  return { error: error?.message ?? null }
}

function characterBehaviorFieldKey(
  shortLabel: string,
  existing: EvaluationSetting[],
  reservedKeys: Set<string>,
) {
  const previous = existing.find(item => item.short_label === shortLabel)
  if (previous?.field_key && !reservedKeys.has(previous.field_key)) return previous.field_key
  return `custom_character_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

function characterTopicFieldKey(
  topicNumber: string,
  existing: EvaluationSetting[],
  reservedKeys: Set<string>,
) {
  const traitKey = `trait${topicNumber}_score`
  const previous = existing.find(item => item.short_label === topicNumber)
  if (previous?.field_key && !reservedKeys.has(previous.field_key)) return previous.field_key
  if (!reservedKeys.has(traitKey)) return traitKey
  return `custom_character_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export async function saveCharacterTopicWithBehaviors(
  topicId: string | null,
  topic: { short_label: string; label: string; max_score: number; is_active: boolean },
  behaviorRows: Array<{ itemNo: string; detail: string }>,
  educationBand: EducationBand,
) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const topicError = validateCharacterEvaluationSetting(topic.label, topic.short_label, null)
  if (topicError) return { error: topicError }

  const maxScore = Math.max(0, Number(topic.max_score) || 3)

  const parsedBehaviors = parseCharacterBehaviorRows(topic.short_label, behaviorRows)
  if (parsedBehaviors.error) return { error: parsedBehaviors.error }

  const { settings: existing, error: loadError } = await ensureEvaluationSettings(session.schoolId, 'character', educationBand)
  if (loadError) return { error: loadError }

  const db = createServerClient()
  const normalizedTopic = normalizeCharacterEvaluationPayload(topic.label, topic.short_label, null)
  const reservedKeys = new Set<string>()
  let savedTopicId = topicId

  if (topicId) {
    const { error } = await db.from('evaluation_settings')
      .update({
        label: normalizedTopic.label,
        short_label: normalizedTopic.short_label,
        description: null,
        group_label: null,
        sort_order: normalizedTopic.sort_order,
        is_active: topic.is_active,
        max_score: maxScore,
        updated_at: new Date().toISOString(),
      })
      .eq('id', topicId)
      .eq('school_id', session.schoolId)
    if (error) return { error: error.message }
    const current = existing.find(item => item.id === topicId)
    if (current) reservedKeys.add(current.field_key)
  } else {
    const fieldKey = characterTopicFieldKey(normalizedTopic.short_label, existing, reservedKeys)
    reservedKeys.add(fieldKey)
    const { data, error } = await db.from('evaluation_settings')
      .insert({
        school_id: session.schoolId,
        kind: 'character',
        education_band: educationBand,
        field_key: fieldKey,
        label: normalizedTopic.label,
        short_label: normalizedTopic.short_label,
        description: null,
        group_label: null,
        sort_order: normalizedTopic.sort_order,
        is_active: topic.is_active,
        score_type: 'score_0_3',
        max_score: maxScore,
        is_required: true,
        hours_per_year: 0,
      })
      .select('id, field_key')
      .single()
    if (error) return { error: error.message }
    savedTopicId = data?.id ?? null
  }

  const topicPrefix = `${normalizedTopic.short_label}.`
  const nextBehaviorLabels = new Set(parsedBehaviors.rows.map(item => item.short_label))

  for (const behavior of parsedBehaviors.rows) {
    const normalized = normalizeCharacterEvaluationPayload(behavior.label, behavior.short_label, behavior.description)
    const previous = existing.find(item => item.short_label === behavior.short_label)
    if (previous?.id) {
      reservedKeys.add(previous.field_key)
      const { error } = await db.from('evaluation_settings')
        .update({
          label: normalized.label,
          short_label: normalized.short_label,
          description: normalized.description,
          group_label: null,
          sort_order: normalized.sort_order,
          is_active: topic.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', previous.id)
        .eq('school_id', session.schoolId)
      if (error) return { error: error.message }
      continue
    }

    const fieldKey = characterBehaviorFieldKey(behavior.short_label, existing, reservedKeys)
    reservedKeys.add(fieldKey)
    const { error } = await db.from('evaluation_settings')
      .insert({
        school_id: session.schoolId,
        kind: 'character',
        education_band: educationBand,
        field_key: fieldKey,
        label: normalized.label,
        short_label: normalized.short_label,
        description: normalized.description,
        group_label: null,
        sort_order: normalized.sort_order,
        is_active: topic.is_active,
        score_type: 'score_0_3',
        max_score: 3,
        is_required: false,
        hours_per_year: 0,
      })
    if (error) return { error: error.message }
  }

  for (const item of existing) {
    if (!item.id || !item.short_label.startsWith(topicPrefix)) continue
    if (nextBehaviorLabels.has(item.short_label)) continue
    const { error } = await db.from('evaluation_settings')
      .delete()
      .eq('id', item.id)
      .eq('school_id', session.schoolId)
    if (error) return { error: error.message }
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'update',
    module: 'evaluation_settings',
    targetType: 'evaluation_setting',
    targetId: savedTopicId,
    targetLabel: normalizedTopic.label,
    description: `บันทึกหัวข้อคุณลักษณะ ${normalizedTopic.short_label} และพฤติกรรมบ่งชี้ ${parsedBehaviors.rows.length} รายการ`,
    metadata: { kind: 'character', educationBand, topic: normalizedTopic.short_label, behaviorCount: parsedBehaviors.rows.length },
  })

  return { error: null }
}

function readingStandardFieldKey(
  standardNumber: string,
  existing: EvaluationSetting[],
  reservedKeys: Set<string>,
) {
  const standardKey = `reading_standard_${standardNumber}`
  const previous = existing.find(item => item.short_label === standardNumber)
  if (previous?.field_key && !reservedKeys.has(previous.field_key)) return previous.field_key
  if (!reservedKeys.has(standardKey)) return standardKey
  return `custom_reading_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

function readingIndicatorFieldKey(
  shortLabel: string,
  existing: EvaluationSetting[],
  reservedKeys: Set<string>,
) {
  const known = READING_INDICATOR_FIELD_KEYS[shortLabel]
  const previous = existing.find(item => item.short_label === shortLabel)
  if (previous?.field_key && !reservedKeys.has(previous.field_key)) return previous.field_key
  if (known && !reservedKeys.has(known)) return known
  return `custom_reading_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export async function saveReadingStandardWithIndicators(
  standardId: string | null,
  standard: { short_label: string; label: string; group_label: string | null; is_active: boolean },
  indicatorRows: Array<{ itemNo: string; detail: string; rubric0: string; rubric1: string; rubric2: string; rubric3: string }>,
  educationBand: EducationBand = '1',
) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const standardError = validateReadingEvaluationSetting(standard.label, standard.short_label)
  if (standardError) return { error: standardError }

  const parsedIndicators = parseReadingIndicatorRows(standard.short_label, indicatorRows)
  if (parsedIndicators.error) return { error: parsedIndicators.error }

  const { settings: existing, error: loadError } = await ensureEvaluationSettings(session.schoolId, 'reading', educationBand)
  if (loadError) return { error: loadError }

  const db = createServerClient()
  const normalizedStandard = normalizeReadingStandardPayload(standard.label, standard.short_label, standard.group_label)
  const maxScore = parsedIndicators.rows.length * 3
  const reservedKeys = new Set<string>()
  let savedStandardId = standardId

  if (standardId) {
    const { error } = await db.from('evaluation_settings')
      .update({
        label: normalizedStandard.label,
        short_label: normalizedStandard.short_label,
        description: null,
        group_label: normalizedStandard.group_label,
        sort_order: normalizedStandard.sort_order,
        is_active: standard.is_active,
        max_score: maxScore,
        updated_at: new Date().toISOString(),
      })
      .eq('id', standardId)
      .eq('school_id', session.schoolId)
    if (error) return { error: error.message }
    const current = existing.find(item => item.id === standardId)
    if (current) reservedKeys.add(current.field_key)
  } else {
    const fieldKey = readingStandardFieldKey(normalizedStandard.short_label, existing, reservedKeys)
    reservedKeys.add(fieldKey)
    const { data, error } = await db.from('evaluation_settings')
      .insert({
        school_id: session.schoolId,
        kind: 'reading',
        education_band: educationBand,
        field_key: fieldKey,
        label: normalizedStandard.label,
        short_label: normalizedStandard.short_label,
        description: null,
        group_label: normalizedStandard.group_label,
        sort_order: normalizedStandard.sort_order,
        is_active: standard.is_active,
        score_type: 'score_0_3',
        max_score: maxScore,
        is_required: true,
        hours_per_year: 0,
        rubric_levels: null,
      })
      .select('id, field_key')
      .single()
    if (error) return { error: error.message }
    savedStandardId = data?.id ?? null
  }

  const standardPrefix = `${normalizedStandard.short_label}.`
  const nextIndicatorLabels = new Set(parsedIndicators.rows.map(item => item.short_label))

  for (const indicator of parsedIndicators.rows) {
    const previous = existing.find(item => item.short_label === indicator.short_label)
    const rubricLevels = Object.keys(indicator.rubric_levels).length > 0 ? indicator.rubric_levels : null
    if (previous?.id) {
      reservedKeys.add(previous.field_key)
      const { error } = await db.from('evaluation_settings')
        .update({
          label: indicator.label,
          short_label: indicator.short_label,
          description: indicator.description,
          group_label: normalizedStandard.group_label,
          sort_order: sortOrderFromEvaluationItemNumber(indicator.short_label),
          is_active: standard.is_active,
          max_score: 3,
          rubric_levels: rubricLevels,
          updated_at: new Date().toISOString(),
        })
        .eq('id', previous.id)
        .eq('school_id', session.schoolId)
      if (error) return { error: error.message }
      continue
    }

    const fieldKey = readingIndicatorFieldKey(indicator.short_label, existing, reservedKeys)
    reservedKeys.add(fieldKey)
    const { error } = await db.from('evaluation_settings')
      .insert({
        school_id: session.schoolId,
        kind: 'reading',
        education_band: educationBand,
        field_key: fieldKey,
        label: indicator.label,
        short_label: indicator.short_label,
        description: indicator.description,
        group_label: normalizedStandard.group_label,
        sort_order: sortOrderFromEvaluationItemNumber(indicator.short_label),
        is_active: standard.is_active,
        score_type: 'score_0_3',
        max_score: 3,
        is_required: true,
        hours_per_year: 0,
        rubric_levels: rubricLevels,
      })
    if (error) return { error: error.message }
  }

  for (const item of existing) {
    if (!item.id || !item.short_label.startsWith(standardPrefix)) continue
    if (nextIndicatorLabels.has(item.short_label)) continue
    const { error } = await db.from('evaluation_settings')
      .delete()
      .eq('id', item.id)
      .eq('school_id', session.schoolId)
    if (error) return { error: error.message }
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'update',
    module: 'evaluation_settings',
    targetType: 'evaluation_setting',
    targetId: savedStandardId,
    targetLabel: normalizedStandard.label,
    description: `บันทึกมาตรฐานอ่าน คิด วิเคราะห์ ${normalizedStandard.short_label} และตัวชี้วัด ${parsedIndicators.rows.length} รายการ`,
    metadata: { kind: 'reading', educationBand, standard: normalizedStandard.short_label, indicatorCount: parsedIndicators.rows.length },
  })

  return { error: null }
}

export async function resetEvaluationSettings(kind: EvaluationKind, educationBand?: EducationBand) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const band = evaluationBandForKind(kind, educationBand)
  const db = createServerClient()
  const { error: deleteError } = await db.from('evaluation_settings')
    .delete()
    .eq('school_id', session.schoolId)
    .eq('kind', kind)
    .eq('education_band', band)
  if (deleteError) return { error: deleteError.message }

  const { error } = await db.from('evaluation_settings')
    .insert(buildDefaultEvaluationRows(session.schoolId, kind, educationBand))

  if (!error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'reset',
      module: 'evaluation_settings',
      targetType: 'evaluation_setting',
      targetId: null,
      targetLabel: EVALUATION_KIND_LABELS[kind],
      description: isBandedEvaluationKind(kind)
        ? `คืนค่าเริ่มต้นการตั้งค่าประเมิน ${EVALUATION_KIND_LABELS[kind]} ช่วงชั้นที่ ${band}`
        : `คืนค่าเริ่มต้นการตั้งค่าประเมิน ${EVALUATION_KIND_LABELS[kind]}`,
      metadata: { kind, educationBand: isBandedEvaluationKind(kind) ? band : null },
    })
  }

  return { error: error?.message ?? null }
}

// ============================================================
// Clubs — ชุมนุม
// ============================================================

export async function fetchClubSettingsInit() {
  const session = await requireSchoolSession()
  const db = createServerClient()
  if (!session.schoolId) return { years: [], classrooms: [], clubs: [], error: 'ยังไม่ได้เลือกโรงเรียน' }

  const [years, classrooms, clubs] = await Promise.all([
    db.from('academic_years')
      .select('id, year_be, is_active')
      .eq('school_id', session.schoolId)
      .order('year_be', { ascending: false }),
    db.from('classrooms')
      .select('id, level, room, academic_year_id')
      .eq('school_id', session.schoolId)
      .order('level')
      .order('room'),
    db.from('clubs')
      .select('id, code, name, short_name, description, advisor_name, max_students, is_active')
      .eq('school_id', session.schoolId)
      .order('code'),
  ])

  const error = years.error || classrooms.error || clubs.error
  return {
    years: years.data || [],
    classrooms: classrooms.data || [],
    clubs: clubs.data || [],
    error: error
      ? error.message.includes('clubs') ? 'ยังไม่ได้ติดตั้งตาราง clubs กรุณา apply migration 017_clubs.sql' : error.message
      : null,
  }
}

export async function saveClub(id: string | null, payload: Record<string, unknown>) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const db = createServerClient()
  const row = {
    code: String(payload.code || '').trim(),
    name: String(payload.name || '').trim(),
    short_name: String(payload.short_name || '').trim() || null,
    description: String(payload.description || '').trim() || null,
    advisor_name: String(payload.advisor_name || '').trim() || null,
    max_students: payload.max_students ? Number(payload.max_students) : null,
    is_active: payload.is_active !== false,
    updated_at: new Date().toISOString(),
  }
  if (!row.code || !row.name) return { error: 'กรุณากรอกรหัสและชื่อชุมนุม' }

  if (id) {
    const { error } = await db.from('clubs')
      .update(row)
      .eq('id', id)
      .eq('school_id', session.schoolId)
    if (!error) {
      await logActivity({
        actor: session,
        schoolId: session.schoolId,
        action: 'update',
        module: 'clubs',
        targetType: 'club',
        targetId: id,
        targetLabel: `${row.code} ${row.name}`,
        description: `แก้ไขชุมนุม ${row.code} ${row.name}`,
        metadata: { fields: Object.keys(row) },
      })
    }
    return { error: error?.message ?? null }
  }

  const { data, error } = await db.from('clubs')
    .insert({ ...row, school_id: session.schoolId })
    .select('id')
    .single()
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'create',
      module: 'clubs',
      targetType: 'club',
      targetId: data?.id ?? null,
      targetLabel: `${row.code} ${row.name}`,
      description: `เพิ่มชุมนุม ${row.code} ${row.name}`,
      metadata: { code: row.code },
    })
  }
  return { error: error?.message ?? null }
}

export async function deleteClub(id: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  const db = createServerClient()

  const { data: club } = await db.from('clubs')
    .select('code, name')
    .eq('id', id)
    .eq('school_id', session.schoolId)
    .maybeSingle()
  const { count } = await db.from('student_club_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', id)
  if ((count ?? 0) > 0) return { error: 'ลบไม่ได้ — มีนักเรียนเลือกชุมนุมนี้อยู่ ให้ย้ายนักเรียนออกก่อน' }

  const { error } = await db.from('clubs')
    .delete()
    .eq('id', id)
    .eq('school_id', session.schoolId)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'delete',
      module: 'clubs',
      targetType: 'club',
      targetId: id,
      targetLabel: club ? `${club.code} ${club.name}` : 'ชุมนุม',
      description: `ลบชุมนุม ${club ? `${club.code} ${club.name}` : ''}`.trim(),
    })
  }
  return { error: error?.message ?? null }
}

export async function fetchClubAssignments(classroomId: string, academicYearId: string) {
  const session = await requireSchoolSession()
  const db = createServerClient()
  if (!session.schoolId) return { students: [], assignments: {}, error: 'ยังไม่ได้เลือกโรงเรียน' }

  const { data: classroom } = await db.from('classrooms')
    .select('id, school_id, academic_year_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom || classroom.school_id !== session.schoolId) return { students: [], assignments: {}, error: 'ไม่พบห้องเรียน' }

  const { data: students, error: studentsError } = await db.from('students')
    .select('id, student_number, prefix, first_name, last_name, status')
    .eq('classroom_id', classroomId)
    .order('student_number')
  if (studentsError) return { students: [], assignments: {}, error: studentsError.message }

  const studentIds = (students || []).map(student => student.id)
  if (studentIds.length === 0) return { students: [], assignments: {}, error: null }

  const { data, error } = await db.from('student_club_assignments')
    .select('student_id, club_id')
    .eq('academic_year_id', academicYearId)
    .in('student_id', studentIds)

  return {
    students: students || [],
    assignments: Object.fromEntries((data || []).map(row => [row.student_id, row.club_id || ''])),
    error: error
      ? error.message.includes('student_club_assignments') ? 'ยังไม่ได้ติดตั้งตาราง student_club_assignments กรุณา apply migration 017_clubs.sql' : error.message
      : null,
  }
}

export async function saveClubAssignments(academicYearId: string, rows: { student_id: string; club_id: string | null }[]) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', count: 0 }
  if (!rows.length) return { error: 'ไม่มีข้อมูล', count: 0 }

  const db = createServerClient()
  const payload = rows.map(row => ({
    student_id: row.student_id,
    academic_year_id: academicYearId,
    club_id: row.club_id || null,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await db.from('student_club_assignments')
    .upsert(payload, { onConflict: 'student_id,academic_year_id' })

  if (!error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'upsert',
      module: 'clubs',
      targetType: 'student_club_assignments',
      targetId: academicYearId,
      targetLabel: 'เลือกชุมนุมนักเรียน',
      description: `บันทึกชุมนุมนักเรียน ${payload.length} คน`,
      metadata: { academicYearId, count: payload.length },
    })
  }

  return { error: error?.message ?? null, count: payload.length }
}

// ============================================================
// Class Subjects — วิชาที่เปิดสอน (classroom × subject × teacher)
// ============================================================

export async function fetchClassSubjectInit() {
  const session = await requireSchoolSession()
  const db = createServerClient()
  const sid = session.schoolId || ''
  const [years, teachers, subjects] = await Promise.all([
    db.from('academic_years').select('id, year_be, is_active').eq('school_id', sid).order('year_be', { ascending: false }),
    db.from('users').select('id, prefix, full_name').in('role', ['teacher', 'academic_head', 'deputy_principal']).eq('school_id', sid).or('is_active.eq.true,email.like.pending-%').order('full_name'),
    db.from('subjects').select('id, code, name, short_name, subject_group, type, hours_per_year, credits, max_score').eq('school_id', sid).order('code'),
  ])
  return {
    role: session.role,
    canManage: hasRole(session, ACADEMIC_MANAGE_ROLES),
    years: years.data || [], teachers: teachers.data || [], subjects: subjects.data || [],
  }
}

// วิชาในห้องสำหรับตั้งอัตราส่วนคะแนน — ครูเห็นเฉพาะวิชาที่ตนสอน
export async function fetchScoreClassSubjects(classroomId: string) {
  const session = await requireSchoolSession()
  const db = createServerClient()
  let q = db.from('class_subjects').select('id, subject_id, teacher_id, order_number')
    .eq('classroom_id', classroomId).order('order_number')
  if (session.role === 'teacher') q = q.eq('teacher_id', session.userId)
  const { data } = await q
  return data || []
}

// ห้องเรียนสำหรับตั้งอัตราส่วนคะแนน — ครูเห็นเฉพาะห้องที่ตนสอน
export async function fetchScoreClassroomsLite(yearId: string) {
  const session = await requireSchoolSession()
  const db = createServerClient()
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

export async function fetchClassroomsLite(yearId: string) {
  const session = await requireSchoolSession()
  const db = createServerClient()
  const { data } = await db.from('classrooms').select('id, level, room')
    .eq('school_id', session.schoolId || '').eq('academic_year_id', yearId)
    .order('level').order('room')
  return data || []
}

export async function fetchClassSubjects(classroomId: string, semester?: ClassSubjectSemester) {
  const session = await requireSchoolSession()
  const db = createServerClient()
  let query = db.from('class_subjects')
    .select('*,classrooms!inner(school_id)')
    .eq('classroom_id', classroomId).eq('classrooms.school_id', session.schoolId).order('order_number')
  if (semester !== undefined) query = query.eq('semester', semester)
  const result = await query
  if (result.error && /semester/.test(result.error.message) && semester !== undefined) {
    const fallback = await db.from('class_subjects')
      .select('*,classrooms!inner(school_id)')
      .eq('classroom_id', classroomId).eq('classrooms.school_id', session.schoolId).order('order_number')
    return fallback.data || []
  }
  return result.data || []
}

const CURRICULUM_GROUP_ORDER: Record<string, number> = {
  'ภาษาไทย': 10,
  'คณิตศาสตร์': 20,
  'วิทยาศาสตร์และเทคโนโลยี': 30,
  'สังคมศึกษา ศาสนา และวัฒนธรรม': 40,
  'สุขศึกษาและพลศึกษา': 60,
  'ศิลปะ': 70,
  'การงานอาชีพ': 80,
  'ภาษาต่างประเทศ': 90,
}

function subjectLevelRank(subject: DbRow | null | undefined) {
  const codeDigits = asText(subject?.code).replace(/\D/g, '')
  if (codeDigits.length >= 2) {
    const grade = Number(codeDigits[1])
    const band = codeDigits[0] === '3' ? 30 : codeDigits[0] === '2' ? 20 : 0
    if (grade >= 1 && grade <= 6) return band + grade
  }
  const nameMatch = asText(subject?.name).match(/(\d+)\s*$/)
  return nameMatch ? Number(nameMatch[1]) : 99
}

function curriculumSubjectRank(subject: DbRow | null | undefined) {
  const code = asText(subject?.code)
  const name = asText(subject?.name)
  const group = asText(subject?.subject_group)
  const levelRank = subjectLevelRank(subject)
  const groupRank = CURRICULUM_GROUP_ORDER[group] ?? 900
  const historyOffset = code.startsWith('ส') && (code.endsWith('102') || name.includes('ประวัติ')) ? 10 : 0
  const antiCorruptionOffset = name.includes('ต้านทุจริต') ? 80 : 0
  const typeOffset = asText(subject?.type).includes('เพิ่ม') ? 500 : 0
  return (levelRank * 1000) + typeOffset + groupRank + historyOffset + antiCorruptionOffset
}

async function normalizeClassSubjectOrder(db: ReturnType<typeof createServerClient>, classroomId: string, semester?: ClassSubjectSemester) {
  let query = db.from('class_subjects')
    .select('id, subject_id, order_number, subjects(code, name, subject_group, type)')
    .eq('classroom_id', classroomId)
  if (semester !== undefined) query = query.eq('semester', semester)
  let { data, error: rowsError } = await query
  if (rowsError && /semester/.test(rowsError.message) && semester !== undefined) {
    const fallback = await db.from('class_subjects')
      .select('id, subject_id, order_number, subjects(code, name, subject_group, type)')
      .eq('classroom_id', classroomId)
    data = fallback.data
    rowsError = fallback.error
  }
  if (rowsError) throw new Error(rowsError.message)
  const rows = ((data || []) as DbRow[]).slice().sort((a, b) => {
    const firstSubject = Array.isArray(a.subjects) ? a.subjects[0] : a.subjects
    const secondSubject = Array.isArray(b.subjects) ? b.subjects[0] : b.subjects
    const firstRank = curriculumSubjectRank(firstSubject as DbRow | null)
    const secondRank = curriculumSubjectRank(secondSubject as DbRow | null)
    if (firstRank !== secondRank) return firstRank - secondRank
    const firstCode = asText((firstSubject as DbRow | null)?.code)
    const secondCode = asText((secondSubject as DbRow | null)?.code)
    return firstCode.localeCompare(secondCode, 'th')
  })
  const changedRows = rows.filter((row, index) => Number(row.order_number || 0) !== index + 1)
  if (changedRows.length === 0) return
  for (const [index, row] of rows.entries()) {
    if (Number(row.order_number || 0) === index + 1) continue
    const { error } = await db.from('class_subjects').update({ order_number: index + 1 }).eq('id', asText(row.id))
    if (error) throw new Error(error.message)
  }
}

export async function addClassSubjects(classroomId: string, academicYearId: string, subjectIds: string[], semester?: ClassSubjectSemester) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', added: 0 }
  if (subjectIds.length === 0) return { error: 'ไม่ได้เลือกวิชา', added: 0 }
  const db = createServerClient()
  const room = await db.from('classrooms').select('level').eq('id', classroomId).maybeSingle()
  const term = semester ?? classSubjectSemesterForLevel(room.data?.level, 1)
  let existingQuery = db.from('class_subjects').select('subject_id, order_number').eq('classroom_id', classroomId)
  if (term !== undefined) existingQuery = existingQuery.eq('semester', term)
  let existingResult = await existingQuery
  if (existingResult.error && /semester/.test(existingResult.error.message)) existingResult = await db.from('class_subjects').select('subject_id, order_number').eq('classroom_id', classroomId)
  const existing = existingResult.data
  const have = new Set((existing || []).map((e: { subject_id: string }) => e.subject_id))
  let order = Math.max(0, ...((existing || []).map((e: { order_number: number }) => e.order_number || 0)))
  const rows = subjectIds.filter(id => !have.has(id)).map(id => ({
    classroom_id: classroomId, subject_id: id, academic_year_id: academicYearId, semester: term,
    order_number: ++order, teacher_id: null,
  }))
  if (rows.length === 0) {
    await normalizeClassSubjectOrder(db, classroomId, term)
    return { error: null, added: 0 }
  }
  let { error } = await db.from('class_subjects').insert(rows)
  if (error && /semester/.test(error.message)) {
    const fallback = await db.from('class_subjects').insert(rows.map(({ semester: _semester, ...row }) => row))
    error = fallback.error
  }
  if (!error) {
    await normalizeClassSubjectOrder(db, classroomId, term)
    await logActivity({
      actor: session,
      schoolId: await resolveClassroomSchoolId(classroomId),
      action: 'create',
      module: 'class_subjects',
      targetType: 'classroom',
      targetId: classroomId,
      description: `เพิ่มวิชาที่เปิดสอน ${rows.length} วิชา`,
      metadata: { classroomId, academicYearId, count: rows.length },
    })
  }
  return { error: error?.message, added: rows.length }
}

export async function previewClassSubjectCopy(input: ClassSubjectCopyInput) {
  try {
    const session = await requireSchoolSession()
    if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', preview: null }
    const plan = await prepareClassSubjectCopy(createServerClient(), session.schoolId!, input)
    const preview = { subjectIds: plan.subjectIds, sourceLabel: plan.sourceLabel, targetLabel: plan.targetLabel,
      total: plan.total, added: plan.added, skipped: plan.skipped }
    return { error: null, preview }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'ตรวจสอบรายวิชาต้นทางไม่สำเร็จ', preview: null }
  }
}

export async function copyClassSubjects(input: ClassSubjectCopyInput, confirmedSubjectIds: string[]) {
  try {
    const session = await requireSchoolSession()
    if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', added: 0, skipped: 0 }
    const result = await executeClassSubjectCopy(createServerClient(), session.schoolId!, input, confirmedSubjectIds)
    if (result.added) {
      try {
        await logActivity({ actor: session, schoolId: session.schoolId, action: 'create', module: 'class_subjects',
          targetType: 'classroom', targetId: input.targetClassroomId,
          description: `คัดลอกรายวิชาจากห้องอื่น ${result.added} วิชา`, metadata: { ...input, ...result } })
      } catch (auditError) { console.error('Class subject copy audit failed', auditError) }
    }
    return { error: null, ...result }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'คัดลอกรายวิชาไม่สำเร็จ', added: 0, skipped: 0 }
  }
}

export async function reorderClassSubjects(classroomId: string, semester?: ClassSubjectSemester) {
  try {
    const session = await requireSchoolSession()
    if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
    const db = createServerClient()
    await normalizeClassSubjectOrder(db, classroomId, semester)
    await logActivity({
      actor: session,
      schoolId: await resolveClassroomSchoolId(classroomId),
      action: 'update',
      module: 'class_subjects',
      targetType: 'classroom',
      targetId: classroomId,
      description: 'เรียงลำดับวิชาที่เปิดสอนตามหลักสูตร',
      metadata: { classroomId },
    })
    return { error: null }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'เรียงรายวิชาไม่สำเร็จ' }
  }
}

export async function setClassSubjectTeacher(id: string, teacherId: string | null, roomName?: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const target = await db.from('class_subjects').select('id,classrooms!inner(school_id)').eq('id',id).eq('classrooms.school_id',session.schoolId).maybeSingle()
  if (target.error || !target.data) return {error:'ไม่มีสิทธิ์แก้ไขรายวิชานี้'}
  if (teacherId) {
    const teacher = await db.from('users').select('id').eq('id',teacherId).eq('school_id',session.schoolId).maybeSingle()
    if (teacher.error || !teacher.data) return {error:'ครูผู้สอนต้องอยู่ในโรงเรียนนี้'}
  }
  if (roomName !== undefined && (typeof roomName !== 'string' || roomName.trim().length>120)) return {error:'ชื่อสถานที่เรียนต้องไม่เกิน 120 ตัวอักษร'}
  const payload = {teacher_id:teacherId || null,...(roomName===undefined?{}:{room_name:roomName.trim() || null})}
  let {error} = await db.from('class_subjects').update(payload).eq('id',id)
  if (error && /room_name/.test(error.message)) {
    if (roomName?.trim()) return {error:'กรุณารันไฟล์ 059_class_subject_room_name.sql ใน Supabase ก่อนบันทึกสถานที่เรียน'}
    const fallback = await db.from('class_subjects').update({teacher_id:teacherId || null}).eq('id',id)
    error = fallback.error
  }
  if (!error) {
    const context = await resolveClassSubjectContext(id)
    await logActivity({
      actor: session,
      schoolId: context.schoolId ?? session.schoolId,
      action: 'assign_teacher',
      module: 'class_subjects',
      targetType: 'class_subject',
      targetId: id,
      targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
      description: `${teacherId ? 'กำหนด' : 'ลบ'}ครูผู้สอน ${context.subjectLabel || 'รายวิชา'}`.trim(),
      metadata: { teacherId, classSubjectId: id },
    })
  }
  return { error: error?.message }
}

export async function removeClassSubject(id: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const context = await resolveClassSubjectContext(id)
  const { data: classSubjectRow } = await db.from('class_subjects').select('classroom_id, semester').eq('id', id).maybeSingle()
  const { count } = await db.from('scores').select('id', { count: 'exact', head: true }).eq('class_subject_id', id)
  if ((count ?? 0) > 0) return { error: 'ลบไม่ได้ — วิชานี้มีการกรอกคะแนนแล้ว' }
  const { error } = await db.from('class_subjects').delete().eq('id', id)
  if (!error) {
    if (classSubjectRow?.classroom_id) await normalizeClassSubjectOrder(db, String(classSubjectRow.classroom_id), classSubjectRow.semester as ClassSubjectSemester | undefined)
    await logActivity({
      actor: session,
      schoolId: context.schoolId ?? session.schoolId,
      action: 'delete',
      module: 'class_subjects',
      targetType: 'class_subject',
      targetId: id,
      targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
      description: `ลบวิชาที่เปิดสอน ${context.subjectLabel || ''}`.trim(),
    })
  }
  return { error: error?.message }
}

export async function removeAllClassSubjects(classroomId: string, semester?: ClassSubjectSemester) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', deleted: 0 }
  if (!classroomId) return { error: 'ยังไม่ได้เลือกห้องเรียน', deleted: 0 }
  const db = createServerClient()
  let list = db.from('class_subjects').select('id').eq('classroom_id', classroomId)
  if (semester !== undefined) list = list.eq('semester', semester)
  let listed = await list
  if (listed.error && /semester/.test(listed.error.message)) {
    if (semester === 1 || semester === 2) return { error: 'กรุณารันไฟล์ฐานข้อมูล 068_class_subject_semester.sql ก่อนลบรายวิชาแยกภาคเรียน', deleted: 0 }
    listed = await db.from('class_subjects').select('id').eq('classroom_id', classroomId)
  }
  const ids = (listed.data || []).map(row => row.id as string)
  if (ids.length === 0) return { error: null, deleted: 0 }
  const { count } = await db.from('scores').select('id', { count: 'exact', head: true }).in('class_subject_id', ids)
  if ((count ?? 0) > 0) return { error: 'ลบทั้งหมดไม่ได้ — มีรายวิชาที่กรอกคะแนนแล้ว', deleted: 0 }
  const { error } = await db.from('class_subjects').delete().in('id', ids)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: await resolveClassroomSchoolId(classroomId),
      action: 'delete',
      module: 'class_subjects',
      targetType: 'classroom',
      targetId: classroomId,
      description: `ลบรายวิชาที่เปิดสอนทั้งหมด ${ids.length} วิชา`,
      metadata: { classroomId, count: ids.length },
    })
  }
  return { error: error?.message ?? null, deleted: error ? 0 : ids.length }
}

// ============================================================
// Score Configs — อัตราส่วนคะแนน (ต่อ class_subject × ภาคเรียน)
// ============================================================

export async function fetchScoreConfigs(classSubjectIds: string[], term: number) {
  await requireSchoolSession()
  if (classSubjectIds.length === 0) return []
  const db = createServerClient()
  const { data } = await db.from('score_configs').select('*')
    .eq('term', term).in('class_subject_id', classSubjectIds)
  return data || []
}

export async function saveScoreConfigs(rows: {
  class_subject_id: string; term: number; unit_count: number
  between_scores: number[]; midterm_max: number; final_max: number; total_max: number
}[]) {
  const session = await requireSchoolSession()
  if (!hasRole(session, [...ACADEMIC_MANAGE_ROLES, 'teacher'])) return { error: 'ไม่มีสิทธิ์' }
  if (rows.length === 0) return { error: 'ไม่มีข้อมูล' }
  const db = createServerClient()
  // ครู: แก้ได้เฉพาะวิชาที่ตนสอน
  if (session.role === 'teacher') {
    const ids = rows.map(r => r.class_subject_id)
    const { data: mine } = await db.from('class_subjects').select('id').in('id', ids).eq('teacher_id', session.userId)
    const mineSet = new Set((mine || []).map((m: { id: string }) => m.id))
    if (rows.some(r => !mineSet.has(r.class_subject_id))) return { error: 'แก้อัตราส่วนได้เฉพาะวิชาที่ตนสอน' }
  }
  const { error } = await db.from('score_configs').upsert(rows, { onConflict: 'class_subject_id,term' })
  if (!error) {
    const context = await resolveClassSubjectContext(rows[0].class_subject_id)
    await logActivity({
      actor: session,
      schoolId: context.schoolId ?? session.schoolId,
      action: 'upsert',
      module: 'score_config',
      targetType: 'score_config',
      targetId: rows[0].class_subject_id,
      targetLabel: context.subjectLabel,
      description: `บันทึกสัดส่วนคะแนน ${rows.length} รายการ`,
      metadata: { count: rows.length, term: rows[0].term },
    })
  }
  return { error: error?.message }
}

// เพิ่มหลายวิชาทีเดียว (วางจากโครงสร้าง Excel) — upsert ตาม (school_id, code)
export async function bulkUpsertSubjects(rows: {
  code: string; name: string; short_name?: string | null
  subject_group: string; type: string; hours_per_year: number; credits: number; max_score: number
  semester?: SubjectSemester
}[]) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', count: 0 }
  if (!session.schoolId) return { error: 'ไม่พบโรงเรียน', count: 0 }
  if (rows.length === 0) return { error: 'ไม่มีข้อมูลให้เพิ่ม', count: 0 }
  try { rows.forEach(row => { if (row.semester !== undefined) parseSubjectSemester(row.semester) }) }
  catch (error) { return { error: error instanceof Error ? error.message : 'ภาคเรียนไม่ถูกต้อง', count: 0 } }
  const db = createServerClient()
  const requestedGroups = [...new Set(rows.map(row => row.subject_group.trim()).filter(Boolean))]
  if (requestedGroups.length) {
    const { data: groups, error: groupError } = await db.from('school_subject_groups').select('name')
      .eq('school_id', session.schoolId).in('name', requestedGroups)
    const migrationMissing = !!groupError && /school_subject_groups|schema cache/i.test(groupError.message)
    const fallbackGroupsValid = migrationMissing && requestedGroups.every(group => SUBJECT_GROUPS.includes(group as typeof SUBJECT_GROUPS[number]))
    if ((groupError && !fallbackGroupsValid) || (!groupError && (groups || []).length !== requestedGroups.length)) return {
      error: migrationMissing
        ? 'กรุณารัน migration 078_school_subject_groups.sql ก่อนนำเข้ากลุ่มสาระแบบกำหนดเอง'
        : 'มีกลุ่มสาระที่ไม่อยู่ในรายการของโรงเรียน กรุณาตรวจข้อมูลก่อนนำเข้า',
      count: 0,
    }
  }
  const school = await getSchoolShell(session.schoolId)
  let payload
  try {
    payload = rows.map(r => ({ ...r, level: null, ...(school?.education_type === 'secondary' ? { hours_per_year: secondaryCreditHours(r.credits).annual } : {}), school_id: session.schoolId }))
  } catch { return { error: 'รายวิชามัธยมต้องมีหน่วยกิตตั้งแต่ 0.5 และเพิ่มครั้งละ 0.5 กรุณาตรวจรายการนำเข้า', count: 0 } }
  let saved = await db.from('subjects').upsert(payload, { onConflict: 'school_id,code,level' }).select('id')
  if (saved.error && /semester/i.test(saved.error.message) && /does not exist|schema cache/i.test(saved.error.message)) {
    return { error: 'ยังบันทึกภาคเรียนไม่ได้ กรุณาติดตั้ง migration 079_subject_catalog_semester.sql แล้วลองใหม่', count: 0 }
  }
  if (saved.error && /unique|constraint|level|schema cache/i.test(saved.error.message)) {
    saved = await db.from('subjects').upsert(payload.map(({ level: _level, ...row }) => row), { onConflict: 'school_id,code' }).select('id')
  }
  if (!saved.error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'upsert',
      module: 'subjects',
      targetType: 'subject',
      description: `นำเข้า/อัปเดตรายวิชา ${saved.data?.length ?? 0} รายการ`,
      metadata: { count: saved.data?.length ?? 0 },
    })
  }
  return { error: saved.error?.message, count: saved.data?.length ?? 0 }
}

/** ดึงรายวิชากลางที่ active ให้โรงเรียนดู/นำเข้า */
export async function fetchGlobalSubjectsForSchool() {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return []
  const db = createServerClient()
  const { data, error } = await db
    .from('global_subjects')
    .select('code,name,short_name,subject_group,type,hours_per_year,credits,max_score')
    .eq('is_active', true)
    .order('subject_group')
    .order('sort_order')
    .order('code')
  if (error) {
    if (error.message.includes('global_subjects') || error.message.includes('schema cache')) return []
    throw new Error(error.message)
  }
  return data || []
}

/** นำเข้าโครงสร้างรายวิชากลางเข้าโรงเรียน (upsert ตามรหัสวิชา) */
export async function syncSubjectsFromGlobal() {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', count: 0 }
  if (!session.schoolId) return { error: 'ไม่พบโรงเรียน', count: 0 }
  const rows = await fetchGlobalSubjectsForSchool()
  if (!rows.length) {
    return { error: 'ยังไม่มีโครงสร้างรายวิชากลางในระบบ', count: 0 }
  }
  return bulkUpsertSubjects(rows.map(r => ({
    code: r.code,
    name: r.name,
    short_name: r.short_name,
    subject_group: r.subject_group,
    type: r.type || 'พื้นฐาน',
    hours_per_year: r.hours_per_year || 0,
    credits: Number(r.credits) || 0,
    max_score: r.max_score || 100,
  })))
}
