'use server'
import { createServerClient } from '@/lib/supabase'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'

export type GlobalTermCalendar = {
  id: string
  year_be: number
  term1_start_date: string | null
  term1_end_date: string | null
  term2_start_date: string | null
  term2_end_date: string | null
}

export async function fetchGlobalTermCalendars() {
  await requireDistrict()
  const db = createServerClient()
  const { data } = await db.from('global_term_calendars')
    .select('id, year_be, term1_start_date, term1_end_date, term2_start_date, term2_end_date')
    .order('year_be', { ascending: false })
  return data || []
}

export async function saveGlobalTermCalendar(payload: Omit<GlobalTermCalendar, 'id'>) {
  const session = await requireDistrict()
  if (!payload.year_be) return { error: 'กรุณากรอกปี พ.ศ.' }
  const db = createServerClient()
  const row = {
    year_be: Number(payload.year_be),
    term1_start_date: payload.term1_start_date || null,
    term1_end_date: payload.term1_end_date || null,
    term2_start_date: payload.term2_start_date || null,
    term2_end_date: payload.term2_end_date || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from('global_term_calendars')
    .upsert(row, { onConflict: 'year_be' })
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'upsert',
      module: 'global_term_calendars',
      targetType: 'global_term_calendar',
      targetLabel: String(row.year_be),
      description: `บันทึกปฏิทินเปิด-ปิดภาคเรียนกลาง ปี ${row.year_be}`,
      metadata: { yearBe: row.year_be },
    })
  }
  return { error: error?.message || null }
}

export async function deleteGlobalTermCalendar(id: string) {
  const session = await requireDistrict()
  const db = createServerClient()
  const { data: calendar } = await db.from('global_term_calendars').select('year_be').eq('id', id).maybeSingle()
  const { error } = await db.from('global_term_calendars').delete().eq('id', id)
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: null,
      action: 'delete',
      module: 'global_term_calendars',
      targetType: 'global_term_calendar',
      targetId: id,
      targetLabel: calendar?.year_be ? String(calendar.year_be) : 'ปฏิทินกลาง',
      description: `ลบปฏิทินเปิด-ปิดภาคเรียนกลาง ปี ${calendar?.year_be || ''}`.trim(),
    })
  }
  return { error: error?.message || null }
}
