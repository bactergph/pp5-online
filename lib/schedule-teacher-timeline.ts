import type { PeriodTimeRow } from './schedule-helpers'
import type { SchedulePdfCell } from './jspdf-schedules'
import { pdfCellIdentity, stripPeriodLabel } from './schedule-cell-span'
import { clockMinute } from './schedule-period-profiles'

export function teacherTimelineBounds(times: PeriodTimeRow[]) {
  const start = Math.min(...times.map(row => clockMinute(row.start_time)))
  const end = Math.max(...times.map(row => clockMinute(row.end_time)))
  return { start, end, duration: Math.max(1, end-start) }
}

export function teacherTimelineDay(times: PeriodTimeRow[], grid: Record<string, SchedulePdfCell>, day: number) {
  const events = times.flatMap(time => {
    const cell = grid[`${day}-${time.period}`]
    if (!cell?.line1 || cell.line1 === '—' || (time.is_break && cell.line2 !== '(กิจกรรมครู)')) return []
    return [{time,cell,start:clockMinute(time.start_time),end:clockMinute(time.end_time),lane:0}]
  }).sort((a,b) => a.start-b.start || a.end-b.end)
  const merged: typeof events = []
  for (const event of events) {
    const prev = merged[merged.length - 1]
    const key = pdfCellIdentity(event.cell)
    if (prev && key && pdfCellIdentity(prev.cell) === key && prev.end === event.start) {
      prev.end = event.end
      prev.time = { ...prev.time, end_time: event.time.end_time }
      prev.cell = { ...prev.cell, line4: stripPeriodLabel(prev.cell.line4) || undefined }
      continue
    }
    merged.push({ ...event, time: { ...event.time } })
  }
  const laneEnds: number[] = []
  for (const event of merged) {
    const free = laneEnds.findIndex(end => end <= event.start)
    event.lane = free < 0 ? laneEnds.length : free
    laneEnds[event.lane] = event.end
  }
  return {events:merged,lanes:Math.max(1,laneEnds.length)}
}

export const timelineClockLabel = (minutes: number) => `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`
