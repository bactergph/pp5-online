'use server'
import { createServerClient } from '@/lib/supabase'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'

const MISSING_TABLE_MSG = 'ยังไม่มีตารางวันหยุดกลางในระบบ — ไปที่ Supabase → SQL Editor แล้วรันไฟล์ supabase/migrations/010_global_holidays.sql'

function mapGlobalHolidayError(message?: string | null) {
  if (!message) return null
  if (message.includes('global_holidays') || message.includes('schema cache')) return MISSING_TABLE_MSG
  return message
}

export type GlobalHoliday = {
  id: string
  year_be: number
  date: string
  name: string
}

export async function fetchGlobalHolidays(yearBe?: number) {
  await requireDistrict()
  const db = createServerClient()
  let query = db.from('global_holidays')
    .select('id, year_be, date, name')
    .order('year_be', { ascending: false })
    .order('date')
  if (yearBe) query = query.eq('year_be', yearBe)
  const { data } = await query
  return data || []
}

export async function addGlobalHoliday(payload: { year_be: number; date: string; name: string }) {
  const session = await requireDistrict()
  if (!payload.year_be || !payload.date || !payload.name?.trim()) {
    return { error: 'กรุณากรอกข้อมูลให้ครบ' }
  }
  const db = createServerClient()
  const { error } = await db.from('global_holidays').insert({
    year_be: Number(payload.year_be),
    date: payload.date,
    name: payload.name.trim(),
  })
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'create',
      module: 'global_holidays',
      targetType: 'global_holiday',
      targetLabel: payload.name.trim(),
      description: `เพิ่มวันหยุดกลาง ${payload.name.trim()} (${payload.date})`,
      metadata: { yearBe: Number(payload.year_be), date: payload.date },
    })
  }
  return { error: mapGlobalHolidayError(error?.message) }
}

export async function deleteGlobalHoliday(id: string) {
  const session = await requireDistrict()
  const db = createServerClient()
  const { data: holiday } = await db.from('global_holidays')
    .select('year_be, date, name')
    .eq('id', id)
    .maybeSingle()
  const { error } = await db.from('global_holidays').delete().eq('id', id)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'delete',
      module: 'global_holidays',
      targetType: 'global_holiday',
      targetId: id,
      targetLabel: holiday?.name ?? 'วันหยุดกลาง',
      description: `ลบวันหยุดกลาง ${holiday?.name || ''}`.trim(),
      metadata: { yearBe: holiday?.year_be ?? null, date: holiday?.date ?? null },
    })
  }
  return { error: mapGlobalHolidayError(error?.message) }
}

export async function bulkAddGlobalHolidays(rows: { year_be: number; date: string; name: string }[]) {
  const session = await requireDistrict()
  if (!rows.length) return { error: 'ไม่พบรายการที่นำเข้าได้', added: 0, skipped: 0 }

  const db = createServerClient()
  let added = 0
  let skipped = 0

  for (const row of rows) {
    if (!row.year_be || !row.date || !row.name?.trim()) {
      skipped += 1
      continue
    }
    const { error } = await db.from('global_holidays').insert({
      year_be: Number(row.year_be),
      date: row.date,
      name: row.name.trim(),
    })
    if (error) {
      if (error.message.includes('duplicate')) skipped += 1
      else return { error: mapGlobalHolidayError(error.message), added, skipped }
    } else {
      added += 1
    }
  }

  if (added > 0) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'create',
      module: 'global_holidays',
      targetType: 'global_holiday',
      targetLabel: `นำเข้าวันหยุดกลาง ${added} รายการ`,
      description: `นำเข้าวันหยุดกลางแบบกลุ่ม ${added} รายการ`,
      metadata: { added, skipped },
    })
  }

  return { error: null, added, skipped }
}
