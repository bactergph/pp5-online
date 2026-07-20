import 'server-only'
import { createServerClient } from '@/lib/supabase'

function generateMemberCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = 'MS-'
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

type CatalogTemplate = {
  name: string
  department?: string | null
  area_office?: string | null
  district?: string | null
  province?: string | null
  address?: string | null
  phone?: string | null
  document_prefix?: string | null
}

/**
 * สร้างโรงเรียนสมาชิกใหม่ (UUID + member_code ใหม่)
 * คัดลอกแค่ชื่อ/ที่อยู่จาก catalog เป็นค่าเริ่มต้น — ไม่ผูก moe_school_id / ไม่แชร์ข้อมูลกับแถวเดิม
 */
export async function createMemberSchoolFromCatalog(catalogId: string) {
  const db = createServerClient()
  const { data: src, error: srcErr } = await db
    .from('schools')
    .select('id, name, department, area_office, district, province, address, phone, document_prefix, is_catalog')
    .eq('id', catalogId)
    .maybeSingle()

  if (srcErr) {
    if (String(srcErr.message || '').includes('is_catalog')) {
      const fb = await db
        .from('schools')
        .select('id, name, department, area_office, district, province, address, phone, document_prefix')
        .eq('id', catalogId)
        .maybeSingle()
      if (fb.error) throw new Error(fb.error.message)
      if (!fb.data) throw new Error('ไม่พบโรงเรียนในฐานข้อมูลอ้างอิง')
      return insertMemberSchool(db, fb.data as CatalogTemplate)
    }
    throw new Error(srcErr.message)
  }
  if (!src) throw new Error('ไม่พบโรงเรียนในฐานข้อมูลอ้างอิง')

  if (src.is_catalog === false) {
    const { data: row } = await db
      .from('schools')
      .select('id, name, member_code')
      .eq('id', catalogId)
      .maybeSingle()
    return {
      id: src.id as string,
      name: (row?.name || src.name) as string,
      member_code: (row?.member_code as string) || null,
    }
  }

  return insertMemberSchool(db, src as CatalogTemplate)
}

async function insertMemberSchool(
  db: ReturnType<typeof createServerClient>,
  src: CatalogTemplate,
) {
  let lastError: string | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const memberCode = generateMemberCode()
    const payload: Record<string, unknown> = {
      name: src.name,
      department: src.department ?? null,
      area_office: src.area_office ?? null,
      district: src.district ?? null,
      province: src.province ?? null,
      address: src.address ?? null,
      phone: src.phone ?? null,
      document_prefix: src.document_prefix ?? null,
      moe_school_id: null,
      is_catalog: false,
      member_code: memberCode,
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
      google_drive_folder_id: null,
      google_drive_refresh_token: null,
      google_drive_access_token: null,
      google_drive_token_expiry: null,
      google_drive_connected_email: null,
    }

    const { data, error } = await db
      .from('schools')
      .insert(payload)
      .select('id, name, member_code')
      .single()

    if (!error && data) {
      return {
        id: data.id as string,
        name: data.name as string,
        member_code: (data.member_code as string) || memberCode,
      }
    }

    if (error && (error.message.includes('is_catalog') || error.message.includes('member_code'))) {
      const minimal = {
        name: src.name,
        department: src.department ?? null,
        area_office: src.area_office ?? null,
        district: src.district ?? null,
        province: src.province ?? null,
        address: src.address ?? null,
        phone: src.phone ?? null,
        document_prefix: src.document_prefix ?? null,
        moe_school_id: null,
        code: null,
        logo_url: null,
        stamp_url: null,
      }
      const retry = await db.from('schools').insert(minimal).select('id, name').single()
      if (retry.error) throw new Error(retry.error.message)
      return { id: retry.data.id as string, name: retry.data.name as string, member_code: null }
    }

    if (error && error.message.toLowerCase().includes('member_code')) {
      lastError = error.message
      continue
    }
    throw new Error(error?.message || 'สร้างโรงเรียนสมาชิกไม่สำเร็จ')
  }
  throw new Error(lastError || 'สร้างรหัสสมาชิกไม่สำเร็จ')
}

/** ถ้าเป็น catalog → clone เป็นสมาชิกใหม่; ถ้าเป็นสมาชิกอยู่แล้ว → ใช้ id เดิม */
export async function resolveMemberSchoolId(selectedSchoolId: string) {
  const db = createServerClient()
  const { data, error } = await db
    .from('schools')
    .select('id, is_catalog')
    .eq('id', selectedSchoolId)
    .maybeSingle()

  if (error && String(error.message || '').includes('is_catalog')) {
    return createMemberSchoolFromCatalog(selectedSchoolId)
  }
  if (error) throw new Error(error.message)
  if (!data) throw new Error('ไม่พบโรงเรียนที่เลือก')

  if (data.is_catalog === false) {
    const { data: row } = await db
      .from('schools')
      .select('id, name, member_code')
      .eq('id', selectedSchoolId)
      .maybeSingle()
    return {
      id: selectedSchoolId,
      name: row?.name || '',
      member_code: row?.member_code || null,
    }
  }

  return createMemberSchoolFromCatalog(selectedSchoolId)
}
