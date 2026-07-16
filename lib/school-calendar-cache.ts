import 'server-only'

/** วันหยุด / วันเปิดเสาร์-อาทิตย์ ต่อช่วงเดือน — แคชสั้นใน process */
type CalendarEntry = { date: string; name?: string | null }

const TTL_MS = 120_000
const holidayStore = new Map<string, { expiresAt: number; rows: CalendarEntry[] }>()
const weekendStore = new Map<string, { expiresAt: number; rows: CalendarEntry[] }>()

function rangeKey(academicYearId: string, start: string, end: string) {
  return `${academicYearId}|${start}|${end}`
}

export function invalidateSchoolCalendar(academicYearId?: string | null) {
  if (!academicYearId) {
    holidayStore.clear()
    weekendStore.clear()
    return
  }
  for (const key of holidayStore.keys()) {
    if (key.startsWith(`${academicYearId}|`)) holidayStore.delete(key)
  }
  for (const key of weekendStore.keys()) {
    if (key.startsWith(`${academicYearId}|`)) weekendStore.delete(key)
  }
}

export async function getHolidaysCached(
  academicYearId: string,
  start: string,
  end: string,
  loader: () => Promise<CalendarEntry[]>,
) {
  const key = rangeKey(academicYearId, start, end)
  const hit = holidayStore.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.rows.map(row => ({ ...row }))
  const rows = await loader()
  holidayStore.set(key, { expiresAt: Date.now() + TTL_MS, rows })
  return rows.map(row => ({ ...row }))
}

export async function getWeekendSchoolDaysCached(
  academicYearId: string,
  start: string,
  end: string,
  loader: () => Promise<CalendarEntry[]>,
) {
  const key = rangeKey(academicYearId, start, end)
  const hit = weekendStore.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.rows.map(row => ({ ...row }))
  const rows = await loader()
  weekendStore.set(key, { expiresAt: Date.now() + TTL_MS, rows })
  return rows.map(row => ({ ...row }))
}
