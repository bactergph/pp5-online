'use server'
import { createServerClient } from '@/lib/supabase'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'

type SchoolPayload = {
  name: string
  department?: string | null
  area_office?: string | null
  district?: string | null
  province?: string | null
  address?: string | null
  phone?: string | null
  document_prefix?: string | null
}

type SchoolRow = SchoolPayload & {
  id: string
  director_name?: string | null
  created_by?: string | null
  layout_tuner_enabled?: boolean | null
}
type AdminRow = {
  id: string
  school_id: string | null
  full_name: string
}

export async function fetchSchoolCatalogStats() {
  const session = await requireDistrict()
  const client = createServerClient()
  const [{ count: total }, adminsRes] = await Promise.all([
    client.from('schools').select('*', { count: 'exact', head: true }),
    client.from('users').select('school_id').eq('role', 'admin').eq('is_active', true).not('school_id', 'is', null),
  ])
  const withAdmin = new Set((adminsRes.data || []).map(a => a.school_id).filter(Boolean)).size
  return {
    total: total ?? 0,
    withAdmin,
    withoutAdmin: Math.max(0, (total ?? 0) - withAdmin),
  }
}

export async function fetchSchoolCatalog(opts?: {
  q?: string
  filterAdmin?: 'all' | 'has' | 'none'
  page?: number
  pageSize?: number
}) {
  const session = await requireDistrict()
  const client = createServerClient()
  const q = (opts?.q || '').trim()
  const filterAdmin = opts?.filterAdmin || 'all'
  const page = Math.max(1, opts?.page || 1)
  const pageSize = Math.min(100, Math.max(10, opts?.pageSize || 50))

  const { data: admins } = await client
    .from('users')
    .select('school_id, full_name')
    .eq('role', 'admin')
    .eq('is_active', true)

  const adminMap = Object.fromEntries(
    (admins || [])
      .filter(u => u.school_id)
      .map(u => [u.school_id as string, u.full_name as string]),
  )
  const adminIds = Object.keys(adminMap)

  if (filterAdmin === 'has' && adminIds.length === 0) {
    return { rows: [], total: 0, page, pageSize }
  }

  let query = client
    .from('schools')
    .select('id,name,department,area_office,district,province,address,phone,document_prefix,director_name,layout_tuner_enabled', { count: 'exact' })

  if (q.length >= 2) {
    const safe = q.replace(/,/g, ' ')
    query = query.or(
      `name.ilike.%${safe}%,district.ilike.%${safe}%,province.ilike.%${safe}%,area_office.ilike.%${safe}%`,
    )
  }

  if (filterAdmin === 'has') {
    query = query.in('id', adminIds)
  } else if (filterAdmin === 'none' && adminIds.length > 0) {
    query = query.not('id', 'in', `(${adminIds.join(',')})`)
  }

  const from = (page - 1) * pageSize
  const { data, count, error } = await query.order('name').range(from, from + pageSize - 1)
  if (error) throw new Error(error.message)

  const rows = ((data || []) as SchoolRow[]).map(s => ({
    ...s,
    admin_name: adminMap[s.id] ?? null,
    layout_tuner_enabled: s.layout_tuner_enabled !== false,
  }))

  return { rows, total: count ?? 0, page, pageSize }
}

/** @deprecated ใช้ fetchSchoolCatalog แทนเมื่อมีโรงเรียนจำนวนมาก */
export async function fetchSchools() {
  const { rows } = await fetchSchoolCatalog({ page: 1, pageSize: 100 })
  return rows
}

export async function createSchool(payload: SchoolPayload) {
  const session = await requireDistrict()
  const client = createServerClient()
  // ถ้าไม่ได้ระบุ area_office ให้ใช้ของเขตนี้
  const finalPayload = {
    ...payload,
    area_office: payload.area_office || session.areaOffice || undefined,
  }
  const { data, error } = await client.from('schools').insert(finalPayload).select('id').single()
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: data?.id ?? null,
      action: 'create',
      module: 'district_schools',
      targetType: 'school',
      targetId: data?.id ?? null,
      targetLabel: finalPayload.name,
      description: `Super Admin เพิ่มโรงเรียน ${finalPayload.name}`,
      metadata: { areaOffice: finalPayload.area_office ?? null },
    })
  }
  return { error: error?.message }
}

export async function updateSchool(id: string, payload: SchoolPayload) {
  const session = await requireDistrict()
  const client = createServerClient()
  const { error } = await client.from('schools').update(payload).eq('id', id)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: id,
      action: 'update',
      module: 'district_schools',
      targetType: 'school',
      targetId: id,
      targetLabel: payload.name,
      description: `Super Admin แก้ไขโรงเรียน ${payload.name}`,
      metadata: { fields: Object.keys(payload) },
    })
  }
  return { error: error?.message }
}

/** เปิด/ปิดเมนู "ปรับ layout" ของโรงเรียนเดียว (super admin เท่านั้น) */
export async function setSchoolLayoutTuner(id: string, enabled: boolean) {
  const session = await requireDistrict()
  const client = createServerClient()
  const { data: target } = await client.from('schools').select('name').eq('id', id).maybeSingle()
  const { error } = await client.from('schools').update({ layout_tuner_enabled: enabled }).eq('id', id)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: id,
      action: 'update',
      module: 'district_schools',
      targetType: 'school',
      targetId: id,
      targetLabel: target?.name ?? null,
      description: `Super Admin ${enabled ? 'เปิด' : 'ปิด'}เมนูปรับ layout ของ ${target?.name ?? ''}`.trim(),
      metadata: { layout_tuner_enabled: enabled },
    })
  }
  return { error: error?.message }
}

/** เปิด/ปิดเมนู "ปรับ layout" ทุกโรงเรียน */
export async function setAllSchoolsLayoutTuner(enabled: boolean) {
  const session = await requireDistrict()
  const client = createServerClient()
  const { error } = await client.from('schools').update({ layout_tuner_enabled: enabled }).not('id', 'is', null)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'update',
      module: 'district_schools',
      targetType: 'school',
      description: `Super Admin ${enabled ? 'เปิด' : 'ปิด'}เมนูปรับ layout ทุกโรงเรียน`,
      metadata: { layout_tuner_enabled: enabled },
    })
  }
  return { error: error?.message }
}

export async function deleteSchools(ids: string[]) {
  const session = await requireDistrict()
  if (ids.length === 0) return { error: undefined }
  const client = createServerClient()
  const { data: schools } = await client.from('schools').select('id, name').in('id', ids)
  const { error } = await client.from('schools').delete().in('id', ids)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'delete',
      module: 'district_schools',
      targetType: 'school',
      description: `Super Admin ลบโรงเรียน ${ids.length} รายการ`,
      metadata: { count: ids.length, names: (schools || []).map(s => s.name) },
    })
  }
  return { error: error?.message }
}

export async function bulkInsertSchools(rows: SchoolPayload[]) {
  const session = await requireDistrict()
  const client = createServerClient()
  const payload = rows.map(r => ({
    name: r.name,
    area_office: r.area_office || null,
    district: r.district || null,
    province: r.province || null,
    address: r.address || null,
    phone: r.phone || null,
    department: r.department || null,
    document_prefix: r.document_prefix || null,
  }))

  const BATCH = 500
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH)
    const { error } = await client.from('schools').insert(chunk)
    if (error) return { error: error.message }
  }

  await logActivity({
    actor: session,
    schoolId: null,
    action: 'import',
    module: 'district_schools',
    targetType: 'school',
    description: `Super Admin นำเข้าโรงเรียน ${rows.length} รายการ`,
    metadata: { count: rows.length },
  })
  return { error: undefined as string | undefined }
}
