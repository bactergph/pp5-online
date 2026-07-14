'use server'
import { createServerClient } from '@/lib/supabase'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'

const MISSING_TABLE_MSG = 'ยังไม่มีตารางโครงสร้างรายวิชากลาง — ไปที่ Supabase → SQL Editor แล้วรันไฟล์ supabase/migrations/041_global_subjects.sql'

function mapError(message?: string | null) {
  if (!message) return null
  if (message.includes('global_subjects') || message.includes('schema cache')) return MISSING_TABLE_MSG
  return message
}

export type GlobalSubject = {
  id: string
  code: string
  name: string
  short_name: string | null
  subject_group: string
  type: string
  hours_per_year: number
  credits: number
  max_score: number
  sort_order: number
  is_active: boolean
}

export type GlobalSubjectPayload = {
  code: string
  name: string
  short_name?: string | null
  subject_group: string
  type?: string
  hours_per_year?: number
  credits?: number
  max_score?: number
  sort_order?: number
  is_active?: boolean
}

function normalizePayload(payload: GlobalSubjectPayload) {
  const code = String(payload.code || '').trim().toUpperCase()
  const name = String(payload.name || '').trim()
  const subject_group = String(payload.subject_group || '').trim()
  if (!code || !name) return { error: 'กรุณากรอกรหัสและชื่อวิชา' as string }
  if (!(SUBJECT_GROUPS as readonly string[]).includes(subject_group)) {
    return { error: 'กลุ่มสาระไม่ถูกต้อง' as string }
  }
  return {
    error: null as string | null,
    row: {
      code,
      name,
      short_name: payload.short_name?.trim() || null,
      subject_group,
      type: (payload.type || 'พื้นฐาน').trim() || 'พื้นฐาน',
      hours_per_year: Number(payload.hours_per_year) || 0,
      credits: Number(payload.credits) || 0,
      max_score: Number(payload.max_score) || 100,
      sort_order: Number(payload.sort_order) || 0,
      is_active: payload.is_active !== false,
    },
  }
}

export async function fetchGlobalSubjects() {
  await requireDistrict()
  const db = createServerClient()
  const { data, error } = await db
    .from('global_subjects')
    .select('id,code,name,short_name,subject_group,type,hours_per_year,credits,max_score,sort_order,is_active')
    .order('subject_group')
    .order('sort_order')
    .order('code')
  if (error) throw new Error(mapError(error.message) || error.message)
  return (data || []) as GlobalSubject[]
}

export async function saveGlobalSubject(id: string | null, payload: GlobalSubjectPayload) {
  const session = await requireDistrict()
  const parsed = normalizePayload(payload)
  if (parsed.error || !parsed.row) return { error: parsed.error || 'ข้อมูลไม่ถูกต้อง' }
  const db = createServerClient()

  if (id) {
    const { error } = await db.from('global_subjects').update(parsed.row).eq('id', id)
    if (!error) {
      await logActivity({
        actor: session,
        schoolId: null,
        action: 'update',
        module: 'global_subjects',
        targetType: 'global_subject',
        targetId: id,
        targetLabel: parsed.row.name,
        description: `แก้ไขรายวิชากลาง ${parsed.row.code} ${parsed.row.name}`,
        metadata: { code: parsed.row.code },
      })
    }
    return { error: mapError(error?.message) }
  }

  const { data, error } = await db.from('global_subjects').insert(parsed.row).select('id').single()
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'create',
      module: 'global_subjects',
      targetType: 'global_subject',
      targetId: data?.id ?? null,
      targetLabel: parsed.row.name,
      description: `เพิ่มรายวิชากลาง ${parsed.row.code} ${parsed.row.name}`,
      metadata: { code: parsed.row.code },
    })
  }
  return { error: mapError(error?.message) }
}

export async function deleteGlobalSubject(id: string) {
  const session = await requireDistrict()
  const db = createServerClient()
  const { data: row } = await db.from('global_subjects').select('code,name').eq('id', id).maybeSingle()
  const { error } = await db.from('global_subjects').delete().eq('id', id)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'delete',
      module: 'global_subjects',
      targetType: 'global_subject',
      targetId: id,
      targetLabel: row?.name ?? 'รายวิชากลาง',
      description: `ลบรายวิชากลาง ${row?.code || ''} ${row?.name || ''}`.trim(),
      metadata: { code: row?.code ?? null },
    })
  }
  return { error: mapError(error?.message) }
}

export async function bulkUpsertGlobalSubjects(rows: GlobalSubjectPayload[]) {
  const session = await requireDistrict()
  if (!rows.length) return { error: 'ไม่มีข้อมูล', count: 0 }
  const db = createServerClient()
  const payload: ReturnType<typeof normalizePayload>['row'][] = []
  for (const r of rows) {
    const parsed = normalizePayload(r)
    if (parsed.error || !parsed.row) return { error: parsed.error || 'ข้อมูลไม่ถูกต้อง', count: 0 }
    payload.push(parsed.row)
  }
  const { data, error } = await db
    .from('global_subjects')
    .upsert(payload, { onConflict: 'code' })
    .select('id')
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'upsert',
      module: 'global_subjects',
      targetType: 'global_subject',
      description: `นำเข้า/อัปเดตรายวิชากลาง ${data?.length ?? 0} รายการ`,
      metadata: { count: data?.length ?? 0 },
    })
  }
  return { error: mapError(error?.message), count: data?.length ?? 0 }
}
