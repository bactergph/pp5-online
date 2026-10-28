import type { SubstituteRosterEntry } from './substitute-roster'

export type SubstituteHistoryDay = { id: string; date: string; entries: SubstituteRosterEntry[] }
export type SubstituteHistoryPage = { days: SubstituteHistoryDay[]; teacher_names: Record<string, string>; nextBefore: string | null }
export type SubstituteHistoryRecord = { key: string; day: SubstituteHistoryDay; absentId: string; entries: SubstituteRosterEntry[] }
export const SUBSTITUTE_HISTORY_PAGE_DAYS = 10

export function validateSubstituteHistoryScope(year: string, term: number, before?: string) {
  if (!year || ![1, 2].includes(term)) throw Error('กรุณาเลือกปีการศึกษาและภาคเรียน')
  if (before && (!/^\d{4}-\d{2}-\d{2}$/.test(before) || Number.isNaN(Date.parse(before)) || new Date(before).toISOString().slice(0, 10) !== before)) throw Error('วันที่สำหรับดูรายการย้อนหลังไม่ถูกต้อง')
}

export function pageSubstituteHistory(days: SubstituteHistoryDay[], before?: string) {
  const eligible = days.filter(day => day.entries.length && (!before || day.date < before)).sort((a, b) => b.date.localeCompare(a.date))
  const page = eligible.slice(0, SUBSTITUTE_HISTORY_PAGE_DAYS)
  return { days: page, nextBefore: eligible.length > page.length ? page[page.length - 1].date : null }
}

/** One saved record is an absent teacher's assignments on a particular date. */
export function substituteHistoryRecords(days: SubstituteHistoryDay[]): SubstituteHistoryRecord[] {
  return days.flatMap(day => [...new Set(day.entries.map(row => row.absent_teacher_id))].map(absentId => ({
    key: `${day.id}:${absentId}`, day, absentId,
    entries: day.entries.filter(row => row.absent_teacher_id === absentId).sort((a, b) => a.period - b.period || (a.room_label || '').localeCompare(b.room_label || '', 'th')),
  })))
}
