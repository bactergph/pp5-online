'use server'
import { randomUUID } from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { getSession, createSession } from '@/lib/session'
import { syncSchoolLeaderSlot, syncUserRoleToSchoolLeaders } from '@/lib/school-leaders'
import { formatStaffName } from '@/lib/roles'
import { logActivity, resolveClassroomSchoolId, resolveClassSubjectContext } from '@/lib/audit'
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
import { buildDefaultEvaluationRows } from '@/lib/evaluation-settings-seed'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'

async function requireSchoolSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
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
  const session = await requireSchoolSession()
  const db = createServerClient()
  if (!session.schoolId) return null   // ยังไม่ได้เลือกโรงเรียน → ให้หน้าแสดงตัวเลือกเลือก/สร้าง
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
  const rows = SUBJECT_GROUPS.map(group => {
    const entry = heads[group]
    return {
      school_id: schoolId,
      subject_group: group,
      head_name: (entry?.name || '').trim() || null,
      head_user_id: entry?.userId || null,
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
  return { error: error?.message || null }
}

// ค้นหาโรงเรียนจากฐานข้อมูล (สำหรับ admin เลือกโรงเรียนของตน)
export async function searchSchools(q: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return []
  if (!q || q.trim().length < 2) return []
  const db = createServerClient()
  const { data } = await db.from('schools')
    .select('id, name, area_office, district, province')
    .ilike('name', `%${q.trim()}%`)
    .limit(20)
  return data || []
}

// เลือกโรงเรียนจาก catalog → ก๊อปข้อมูลเป็น "record ของกลุ่มตัวเอง" (ไม่แชร์ row กับ admin อื่น)
export async function setMySchool(catalogId: string) {
  const session = await requireSchoolSession()
  if (session.role !== 'admin') return { error: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น' }
  const db = createServerClient()
  const { data: cat } = await db.from('schools')
    .select('name, area_office, district, province, address, phone')
    .eq('id', catalogId).maybeSingle()
  if (!cat) return { error: 'ไม่พบโรงเรียนที่เลือก' }
  if (session.schoolId) {
    // มีโรงเรียนของกลุ่มอยู่แล้ว → อัปเดตข้อมูลจาก catalog (school_id + code เดิม คงที่ → ลิงก์/ครูไม่กระทบ)
    const { error } = await db.from('schools').update(cat).eq('id', session.schoolId)
    if (!error) {
      await db.from('users').update({ school_id: session.schoolId }).eq('id', session.userId)
      await logActivity({
        actor: session,
        schoolId: session.schoolId,
        action: 'update',
        module: 'school',
        targetType: 'school',
        targetId: session.schoolId,
        targetLabel: cat.name,
        description: `เลือก/อัปเดตโรงเรียนจากฐานข้อมูล: ${cat.name}`,
        metadata: { catalogId },
      })
    }
    return { error: error?.message ?? null }
  }
  const { data: created, error } = await db.from('schools')
    .insert({ ...cat, created_by: session.fullName }).select('id').single()
  if (error || !created) return { error: error?.message || 'สร้างไม่สำเร็จ' }
  await db.from('users').update({ school_id: created.id }).eq('id', session.userId)
  await createSession({ ...session, schoolId: created.id })
  await logActivity({
    actor: { ...session, schoolId: created.id },
    schoolId: created.id,
    action: 'create',
    module: 'school',
    targetType: 'school',
    targetId: created.id,
    targetLabel: cat.name,
    description: `สร้างโรงเรียนจากฐานข้อมูล: ${cat.name}`,
    metadata: { catalogId },
  })
  return { error: null }
}

// สร้างโรงเรียนใหม่ (หรืออัปเดตของกลุ่มเดิม) + ผูกให้ admin คนปัจจุบัน
export async function createAndSetMySchool(payload: Record<string, string | null>) {
  const session = await requireSchoolSession()
  if (session.role !== 'admin') return { error: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น' }
  if (!payload.name || !String(payload.name).trim()) return { error: 'กรุณากรอกชื่อโรงเรียน' }
  const db = createServerClient()
  const row = { ...payload, created_by: session.fullName }
  if (session.schoolId) {
    const { error } = await db.from('schools').update(row).eq('id', session.schoolId)
    if (!error) {
      await db.from('users').update({ school_id: session.schoolId }).eq('id', session.userId)
      await logActivity({
        actor: session,
        schoolId: session.schoolId,
        action: 'update',
        module: 'school',
        targetType: 'school',
        targetId: session.schoolId,
        targetLabel: String(payload.name || 'โรงเรียน'),
        description: `แก้ไขข้อมูลโรงเรียน ${payload.name || ''}`.trim(),
        metadata: { fields: Object.keys(payload) },
      })
    }
    return { error: error?.message ?? null }
  }
  const { data, error } = await db.from('schools').insert(row).select('id').single()
  if (error || !data) return { error: error?.message || 'สร้างโรงเรียนไม่สำเร็จ' }
  await db.from('users').update({ school_id: data.id }).eq('id', session.userId)
  await createSession({ ...session, schoolId: data.id })
  await logActivity({
    actor: { ...session, schoolId: data.id },
    schoolId: data.id,
    action: 'create',
    module: 'school',
    targetType: 'school',
    targetId: data.id,
    targetLabel: String(payload.name || 'โรงเรียน'),
    description: `สร้างโรงเรียนใหม่ ${payload.name || ''}`.trim(),
    metadata: { fields: Object.keys(payload) },
  })
  return { error: null }
}

export async function saveSchool(id: string | null, payload: Record<string, string | null>) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'เฉพาะผู้ดูแลโรงเรียนเท่านั้น' }
  const db = createServerClient()
  const withoutPendingColumns = () => {
    const next = { ...payload }
    delete next.acting_director_position
    return next
  }
  const isMissingActingPosition = (error: { message?: string } | null | undefined) =>
    !!error?.message?.includes('acting_director_position')
  // ตรวจรหัสกลุ่ม (code) — ใช้สำหรับ URL login รายโรงเรียน ห้ามซ้ำ
  if (payload.code != null && String(payload.code).trim() !== '') {
    const code = String(payload.code).trim().toLowerCase()
    if (!/^[a-z0-9-]+$/.test(code)) return { error: 'รหัสโรงเรียนใช้ได้เฉพาะ a-z 0-9 - (ห้ามเว้นวรรค/ภาษาไทย)' }
    const { data: ex } = await db.from('schools').select('id').ilike('code', code)
      .neq('id', id || '00000000-0000-0000-0000-000000000000').maybeSingle()
    if (ex) return { error: 'รหัสนี้ถูกใช้แล้ว เลือกรหัสอื่น' }
    payload.code = code
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
  const session = await requireSchoolSession()
  const db = createServerClient()
  const query = db.from('users')
    .select('id, email, username, prefix, full_name, position, role, is_homeroom, is_active, signature_url')
    .order('full_name')
  if (session.schoolId) query.eq('school_id', session.schoolId)
  const { data } = await query
  let code: string | null = null
  if (session.schoolId) {
    const { data: sc } = await db.from('schools').select('code').eq('id', session.schoolId).maybeSingle()
    code = sc?.code ?? null
  }
  return { schoolId: session.schoolId, code, users: data || [], canManage: hasRole(session, ADMIN_ROLES) }
}

export async function fetchSchoolStaff() {
  const session = await requireSchoolSession()
  if (!session.schoolId) return []
  const db = createServerClient()
  const { data } = await db.from('users')
    .select('id, prefix, full_name, position, role')
    .eq('school_id', session.schoolId)
    .eq('is_active', true)
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
  const updates: Record<string, string | null> = {}
  for (const [key, val] of Object.entries(payload)) {
    if (val !== undefined) updates[key] = val === '' ? null : val
  }

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
  return { error: error?.message || null }
}

export async function updateUser(id: string, payload: Record<string, string | boolean | null>) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { data: target } = await db.from('users')
    .select('prefix, full_name, role, school_id')
    .eq('id', id)
    .maybeSingle()
  const { error } = await db.from('users').update(payload).eq('id', id)
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
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { data: target } = await db.from('users').select('full_name, role, school_id').eq('id', id).maybeSingle()
  const { error } = await db.from('users').update({ is_active: isActive }).eq('id', id)
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
}

// ============================================================
// Academic Years
// ============================================================

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
  const { data } = await db.from('global_term_calendars')
    .select('id, year_be, term1_start_date, term1_end_date, term2_start_date, term2_end_date')
    .in('year_be', yearBes)
    .order('year_be', { ascending: false })
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
    .select('date, name, academic_years(school_id, year_be)')
    .eq('id', id)
    .maybeSingle()
  const { error } = await db.from('weekend_school_days').delete().eq('id', id)
  if (!error) {
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
    .select('date, name, academic_years(school_id, year_be)')
    .eq('id', id)
    .maybeSingle()
  const { error } = await db.from('holidays').delete().eq('id', id)
  if (!error) {
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
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์', inserted: 0, skipped: 0 }
  if (!classroomId) return { error: 'ยังไม่ได้เลือกชั้นเรียนปลายทาง', inserted: 0, skipped: 0 }
  if (rows.length === 0) return { error: 'ไม่มีข้อมูลนักเรียน', inserted: 0, skipped: 0 }
  const db = createServerClient()

  // กันซ้ำด้วยเลขบัตร + หาเลขที่ล่าสุดในห้อง (เพื่อไล่เลขที่ต่อ)
  const { data: existing } = await db.from('students')
    .select('student_number, national_id').eq('classroom_id', classroomId)
  const existingNat = new Set((existing || []).filter(e => e.national_id).map(e => e.national_id))
  let maxNo = Math.max(0, ...((existing || []).map(e => e.student_number || 0)))

  let inserted = 0, skipped = 0
  for (const row of rows) {
    if (row.national_id && existingNat.has(row.national_id)) { skipped++; continue }
    const { error } = await db.from('students').insert({ ...row, classroom_id: classroomId, student_number: maxNo + 1 })
    if (!error) { inserted++; maxNo++; if (row.national_id) existingNat.add(row.national_id) }
    else skipped++
  }
  await logActivity({
    actor: session,
    schoolId: await resolveClassroomSchoolId(classroomId),
    action: 'import',
    module: 'students',
    targetType: 'classroom',
    targetId: classroomId,
    description: `นำเข้านักเรียน DMC สำเร็จ ${inserted} คน ข้าม ${skipped} คน`,
    metadata: { classroomId, inserted, skipped, total: rows.length },
  })
  return { error: null, inserted, skipped }
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
  const session = await requireSchoolSession()
  if (!hasRole(session, ADMIN_ROLES)) return { error: 'ไม่มีสิทธิ์', inserted: 0, skipped: 0, missingClass: 0 }
  if (!academicYearId) return { error: 'ยังไม่ได้เลือกปีการศึกษา', inserted: 0, skipped: 0, missingClass: 0 }
  if (rows.length === 0) return { error: 'ไม่มีข้อมูลนักเรียน', inserted: 0, skipped: 0, missingClass: 0 }

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
      return { error: `สร้างห้องเรียนที่ขาดไม่สำเร็จ: ${createClassError.message}`, inserted: 0, skipped: rows.length, missingClass: rows.length }
    }
    for (const classroom of createdClassrooms || []) {
      classroomRows.push(classroom)
      classroomByKey.set(normalizeClassKey(classroom.level, classroom.room), classroom)
    }
  }

  if (classroomRows.length === 0) {
    return { error: 'ยังไม่มีชั้นเรียนในปีการศึกษานี้', inserted: 0, skipped: rows.length, missingClass: rows.length }
  }

  const classroomIds = classroomRows.map(c => c.id)
  const { data: existing } = await db.from('students')
    .select('classroom_id, student_number, national_id')
    .in('classroom_id', classroomIds)

  const existingNat = new Set((existing || []).filter(s => s.national_id).map(s => s.national_id as string))
  const maxNoByClass = new Map<string, number>()
  for (const classroomId of classroomIds) maxNoByClass.set(classroomId, 0)
  for (const s of existing || []) {
    maxNoByClass.set(s.classroom_id, Math.max(maxNoByClass.get(s.classroom_id) || 0, s.student_number || 0))
  }

  let inserted = 0
  let skipped = 0
  let missingClass = 0

  for (const row of rows) {
    const classroom = classroomByKey.get(normalizeClassKey(row.level, row.room))
    if (!classroom) { skipped++; missingClass++; continue }
    if (row.national_id && existingNat.has(row.national_id)) { skipped++; continue }

    const nextNo = (maxNoByClass.get(classroom.id) || 0) + 1
    const { error } = await db.from('students').insert({
      student_code: row.student_code,
      national_id: row.national_id,
      prefix: row.prefix,
      first_name: row.first_name,
      last_name: row.last_name,
      gender: row.gender,
      birth_date: row.birth_date,
      address: row.address ?? null,
      status: row.status,
      classroom_id: classroom.id,
      student_number: nextNo,
    })
    if (error) {
      skipped++
      continue
    }
    inserted++
    maxNoByClass.set(classroom.id, nextNo)
    if (row.national_id) existingNat.add(row.national_id)
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'import',
    module: 'students',
    targetType: 'school',
    targetId: session.schoolId,
    description: `นำเข้านักเรียน DMC ทั้งโรงเรียน สำเร็จ ${inserted} คน ข้าม ${skipped} คน`,
    metadata: { academicYearId, inserted, skipped, missingClass, total: rows.length },
  })

  return { error: null, inserted, skipped, missingClass }
}

// ============================================================
// Password Reset — admin รร รีเซ็ตรหัสผ่านครูในโรงเรียนตัวเอง
// ============================================================
export async function resetTeacherPassword(userId: string, newPassword: string) {
  const session = await requireSchoolSession()
  if (!['admin', 'district'].includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  if (newPassword.length < 8) return { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }
  const db = createServerClient()
  // ตรวจว่า user นั้นอยู่ในโรงเรียนเดียวกัน (ป้องกัน admin ข้ามโรงเรียน)
  if (session.role === 'admin' && session.schoolId) {
    const { data: target } = await db.from('users').select('school_id, role').eq('id', userId).single()
    if (!target || target.school_id !== session.schoolId) return { error: 'ไม่มีสิทธิ์รีเซ็ตรหัสผ่านผู้ใช้คนนี้' }
    if (!['teacher', 'academic_head', 'deputy_principal', 'principal'].includes(target.role)) return { error: 'รีเซ็ตได้เฉพาะครูและผู้บริหารโรงเรียน' }
  }
  const { error } = await db.auth.admin.updateUserById(userId, { password: newPassword })
  if (!error) {
    const { data: target } = await db.from('users').select('full_name, role, school_id').eq('id', userId).maybeSingle()
    await logActivity({
      actor: session,
      schoolId: target?.school_id ?? session.schoolId,
      action: 'reset_password',
      module: 'users',
      targetType: 'user',
      targetId: userId,
      targetLabel: target?.full_name ?? 'ผู้ใช้',
      description: `รีเซ็ตรหัสผ่านผู้ใช้ ${target?.full_name || ''}`.trim(),
      metadata: { targetRole: target?.role ?? null },
    })
  }
  return { error: error?.message }
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

export async function saveSubject(id: string | null, payload: Record<string, unknown>) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  if (id) {
    const { error } = await db.from('subjects').update(payload).eq('id', id)
    if (!error) {
      await logActivity({
        actor: session,
        schoolId: session.schoolId,
        action: 'update',
        module: 'subjects',
        targetType: 'subject',
        targetId: id,
        targetLabel: String(payload.name || payload.code || 'รายวิชา'),
        description: `แก้ไขรายวิชา ${payload.name || payload.code || ''}`.trim(),
        metadata: { fields: Object.keys(payload) },
      })
    }
    return { error: error?.message }
  }
  const { data, error } = await db.from('subjects').insert({ ...payload, school_id: session.schoolId }).select('id').single()
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'create',
      module: 'subjects',
      targetType: 'subject',
      targetId: data?.id ?? null,
      targetLabel: String(payload.name || payload.code || 'รายวิชา'),
      description: `เพิ่มรายวิชา ${payload.name || payload.code || ''}`.trim(),
      metadata: { code: typeof payload.code === 'string' ? payload.code : null },
    })
  }
  return { error: error?.message }
}

export async function deleteSubject(id: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  // กันลบถ้าวิชาถูกใช้ใน class_subjects แล้ว
  const { data: subject } = await db.from('subjects').select('name, code, school_id').eq('id', id).maybeSingle()
  const { count } = await db.from('class_subjects')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', id)
  if ((count ?? 0) > 0) return { error: 'ลบไม่ได้ — วิชานี้ถูกเปิดสอนอยู่ (มีใน "วิชาที่เปิดสอน")' }
  const { error } = await db.from('subjects').delete().eq('id', id)
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
    db.from('users').select('id, prefix, full_name').in('role', ['teacher', 'academic_head', 'deputy_principal']).eq('school_id', sid).eq('is_active', true).order('full_name'),
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

export async function fetchClassSubjects(classroomId: string) {
  await requireSchoolSession()
  const db = createServerClient()
  const { data } = await db.from('class_subjects')
    .select('id, subject_id, teacher_id, order_number')
    .eq('classroom_id', classroomId).order('order_number')
  return data || []
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
  if (codeDigits.length >= 2) return Number(codeDigits[1])
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

async function normalizeClassSubjectOrder(db: ReturnType<typeof createServerClient>, classroomId: string) {
  const { data, error: rowsError } = await db.from('class_subjects')
    .select('id, subject_id, order_number, subjects(code, name, subject_group, type)')
    .eq('classroom_id', classroomId)
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

export async function addClassSubjects(classroomId: string, academicYearId: string, subjectIds: string[]) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', added: 0 }
  if (subjectIds.length === 0) return { error: 'ไม่ได้เลือกวิชา', added: 0 }
  const db = createServerClient()
  const { data: existing } = await db.from('class_subjects').select('subject_id, order_number').eq('classroom_id', classroomId)
  const have = new Set((existing || []).map((e: { subject_id: string }) => e.subject_id))
  let order = Math.max(0, ...((existing || []).map((e: { order_number: number }) => e.order_number || 0)))
  const rows = subjectIds.filter(id => !have.has(id)).map(id => ({
    classroom_id: classroomId, subject_id: id, academic_year_id: academicYearId,
    order_number: ++order, teacher_id: null,
  }))
  if (rows.length === 0) {
    await normalizeClassSubjectOrder(db, classroomId)
    return { error: null, added: 0 }
  }
  const { error } = await db.from('class_subjects').insert(rows)
  if (!error) {
    await normalizeClassSubjectOrder(db, classroomId)
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

export async function reorderClassSubjects(classroomId: string) {
  try {
    const session = await requireSchoolSession()
    if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
    const db = createServerClient()
    await normalizeClassSubjectOrder(db, classroomId)
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

export async function setClassSubjectTeacher(id: string, teacherId: string | null) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { error } = await db.from('class_subjects').update({ teacher_id: teacherId || null }).eq('id', id)
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
  const { data: classSubjectRow } = await db.from('class_subjects').select('classroom_id').eq('id', id).maybeSingle()
  const { count } = await db.from('scores').select('id', { count: 'exact', head: true }).eq('class_subject_id', id)
  if ((count ?? 0) > 0) return { error: 'ลบไม่ได้ — วิชานี้มีการกรอกคะแนนแล้ว' }
  const { error } = await db.from('class_subjects').delete().eq('id', id)
  if (!error) {
    if (classSubjectRow?.classroom_id) await normalizeClassSubjectOrder(db, String(classSubjectRow.classroom_id))
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

export async function removeAllClassSubjects(classroomId: string) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', deleted: 0 }
  if (!classroomId) return { error: 'ยังไม่ได้เลือกห้องเรียน', deleted: 0 }
  const db = createServerClient()
  const { data: rows } = await db.from('class_subjects').select('id').eq('classroom_id', classroomId)
  const ids = (rows || []).map(row => row.id as string)
  if (ids.length === 0) return { error: null, deleted: 0 }
  const { count } = await db.from('scores').select('id', { count: 'exact', head: true }).in('class_subject_id', ids)
  if ((count ?? 0) > 0) return { error: 'ลบทั้งหมดไม่ได้ — มีรายวิชาที่กรอกคะแนนแล้ว', deleted: 0 }
  const { error } = await db.from('class_subjects').delete().eq('classroom_id', classroomId)
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
}[]) {
  const session = await requireSchoolSession()
  if (!hasRole(session, ACADEMIC_MANAGE_ROLES)) return { error: 'ไม่มีสิทธิ์', count: 0 }
  if (!session.schoolId) return { error: 'ไม่พบโรงเรียน', count: 0 }
  if (rows.length === 0) return { error: 'ไม่มีข้อมูลให้เพิ่ม', count: 0 }
  const db = createServerClient()
  const payload = rows.map(r => ({ ...r, school_id: session.schoolId }))
  const { data, error } = await db.from('subjects')
    .upsert(payload, { onConflict: 'school_id,code' })
    .select('id')
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'upsert',
      module: 'subjects',
      targetType: 'subject',
      description: `นำเข้า/อัปเดตรายวิชา ${data?.length ?? 0} รายการ`,
      metadata: { count: data?.length ?? 0 },
    })
  }
  return { error: error?.message, count: data?.length ?? 0 }
}
