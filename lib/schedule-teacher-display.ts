import type { PeriodTimeRow } from './schedule-helpers'
import { levelPeriodTimes, periodBand, teacherPeriodTimes, clockMinute } from './schedule-period-profiles'
import { teacherActivitiesInClock } from './schedule-teacher-activities'
import type { SchedulePdfCell } from './jspdf-schedules'

/** Academic teaching hours (placed periods), matching scheduled_hours in the
 * workload report. Count a joint class once; staff duties/PLC stay separate. */
export function teacherWeeklyHoursLabel(times: PeriodTimeRow[], cells: Record<string, SchedulePdfCell>): string {
  const axis = teacherPeriodTimes(times)
  const taught = new Set<string>()
  for (const [key, cell] of Object.entries(cells)) {
    if (!cell.line1?.trim() || ['—','ไม่ว่าง'].includes(cell.line1.trim()) || cell.line2 === '(กิจกรรมครู)') continue
    const [day, period] = key.split('-').map(Number)
    const time = axis.find(row => !row.is_break && row.period === period)
    if (day >= 1 && day <= 5 && time) taught.add(`${day}:${time.start_time}-${time.end_time}`)
  }
  return `จำนวน ${taught.size} ชั่วโมง/สัปดาห์`
}

export type TeacherDisplayCell = { classroomLevels?: string[]; line1?: string; label?: string }

/** Keep the shared display IDs: editing must still resolve to the original
 * classroom clock. Only the visible columns change, never stored periods. */
export function teacherDisplayTimes(times: PeriodTimeRow[], teacherId: string, levels: string[], occupiedPeriods: number[] = [], homeroomLevel?: string | null): PeriodTimeRow[] {
  const axis = teacherPeriodTimes(times)
  const selected = new Map<string, PeriodTimeRow>()
  const key = (row: PeriodTimeRow) => `${row.start_time}-${row.end_time}`
  const home = homeroomLevel && periodBand(homeroomLevel) ? homeroomLevel : ''
  const clocks = home ? [levelPeriodTimes(times, home)] : levels.length ? [...new Set(levels)].map(level => levelPeriodTimes(times, level)) : [times]
  for (const rows of clocks) for (const row of rows) {
    if (row.is_break && selected.get(key(row))?.is_break === false) continue
    selected.set(key(row), row)
  }
  // Include activities only for this teacher, and retain all populated cells
  // even when historical records have no classroom metadata.
  for (const activity of teacherActivitiesInClock(times).filter(a => a.teacherIds.includes(teacherId))) {
    const row = axis.find(r => r.start_time === activity.start_time && r.end_time === activity.end_time)
      ?? axis.find(r => r.is_break && r.start_time <= activity.start_time && activity.end_time <= r.end_time)
    if (row && !selected.has(key(row))) selected.set(key(row), {...row,label:'กิจกรรมครู'})
  }
  for (const row of axis) if (occupiedPeriods.includes(row.period) && !selected.has(key(row))) selected.set(key(row), row)
  const rows = [...selected.values()]
  const visible = rows.filter(row => !row.is_break || !rows.some(other => !other.is_break && other.start_time < row.end_time && row.start_time < other.end_time))
  return visible.sort((a,b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time)).map((row,index) => {
    const original = axis.find(r => key(r) === key(row))
    return { period: original?.period ?? -(index+1), label: row.label || `ช่วง ${index+1}`, start_time: row.start_time, end_time: row.end_time, is_break: row.is_break, sort_order: index+1 }
  })
}

export function teacherGridTimes(times: PeriodTimeRow[], teacherId: string, cells: Record<string, TeacherDisplayCell>, homeroomLevel?: string | null) {
  return teacherDisplayTimes(times, teacherId, Object.values(cells).flatMap(cell => cell.classroomLevels || []), Object.entries(cells).filter(([,cell]) => !!(cell.label || cell.line1) && cell.line1 !== '—').map(([key]) => Number(key.split('-')[1])), homeroomLevel)
}

/** Overlapping clocks need proportional placement, not consecutive columns. */
export function teacherPdfLayout(times: PeriodTimeRow[]): 'grid' | 'teacher-timeline' {
  return times.some((row,index) => times.slice(index+1).some(other => clockMinute(row.start_time) < clockMinute(other.end_time) && clockMinute(other.start_time) < clockMinute(row.end_time))) ? 'teacher-timeline' : 'grid'
}
