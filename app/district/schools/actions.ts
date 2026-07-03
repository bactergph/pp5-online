'use server'
import { createServerClient } from '@/lib/supabase'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'

type SchoolPayload = {
  name: string
  department?: string
  area_office?: string
  district?: string
  province?: string
  address?: string
  phone?: string
  document_prefix?: string
}

type SchoolRow = SchoolPayload & {
  id: string
  director_name?: string | null
  created_by?: string | null
}
type AdminRow = {
  id: string
  school_id: string | null
  full_name: string
}

export async function fetchSchools() {
  const session = await requireDistrict()
  const client = createServerClient()

  let schoolsQ = client
    .from('schools')
    .select('id,name,department,area_office,district,province,address,phone,document_prefix,director_name,created_by')
    .order('district').order('name')

  // กรองเฉพาะเขตของ district admin นี้ (ถ้ากำหนดแล้ว)
  if (session.areaOffice) {
    schoolsQ = schoolsQ.eq('area_office', session.areaOffice) as typeof schoolsQ
  }

  const [schoolsRes, adminsRes] = await Promise.all([
    schoolsQ,
    client.from('users')
      .select('id, school_id, full_name')
      .eq('role', 'admin')
      .eq('is_active', true)
  ])

  const schools = (schoolsRes.data || []) as SchoolRow[]
  const admins = (adminsRes.data || []) as AdminRow[]

  // Repair older rows where an admin created/selected a school, but users.school_id
  // was not persisted. Only link when created_by uniquely matches one admin.
  for (const admin of admins) {
    if (admin.school_id) continue
    const ownedSchools = schools.filter(s =>
      s.created_by?.trim() &&
      admin.full_name?.trim() &&
      s.created_by.trim() === admin.full_name.trim()
    )
    if (ownedSchools.length !== 1) continue
    const schoolId = ownedSchools[0].id
    const { error } = await client.from('users').update({ school_id: schoolId }).eq('id', admin.id)
    if (!error) admin.school_id = schoolId
  }

  const adminMap = Object.fromEntries(
    admins.filter(u => u.school_id).map(u => [u.school_id, u.full_name])
  )
  return schools.map(s => ({
    ...s,
    admin_name: adminMap[s.id] ?? null,
  }))
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
  const withArea = rows.map(r => ({
    ...r,
    area_office: r.area_office || session.areaOffice || undefined,
  }))
  const { error } = await client.from('schools').insert(withArea)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'import',
      module: 'district_schools',
      targetType: 'school',
      description: `Super Admin นำเข้าโรงเรียน ${rows.length} รายการ`,
      metadata: { count: rows.length, areaOffice: session.areaOffice ?? null },
    })
  }
  return { error: error?.message }
}
