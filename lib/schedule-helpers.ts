import { SCHEDULE_DAYS, SCHEDULE_PERIOD_COUNT } from '@/lib/schedules'

export const SCHEDULE_WEEKS_PER_YEAR = 40
export const WORKLOAD_OK_MAX = 18
export const WORKLOAD_WARN_MAX = 20

export type PeriodTimeRow = {
  period: number
  label: string
  start_time: string
  end_time: string
  is_break: boolean
  sort_order: number
}

export const DEFAULT_PERIOD_TIMES: PeriodTimeRow[] = [
  { period: 1, label: 'คาบที่ 1', start_time: '08:30', end_time: '09:20', is_break: false, sort_order: 1 },
  { period: 2, label: 'คาบที่ 2', start_time: '09:20', end_time: '10:10', is_break: false, sort_order: 2 },
  { period: 3, label: 'คาบที่ 3', start_time: '10:10', end_time: '11:00', is_break: false, sort_order: 3 },
  { period: 4, label: 'คาบที่ 4', start_time: '11:00', end_time: '11:50', is_break: false, sort_order: 4 },
  { period: 5, label: 'พักเที่ยง', start_time: '11:50', end_time: '12:40', is_break: true, sort_order: 5 },
  { period: 5, label: 'คาบที่ 5', start_time: '12:40', end_time: '13:30', is_break: false, sort_order: 6 },
  { period: 6, label: 'คาบที่ 6', start_time: '13:30', end_time: '14:20', is_break: false, sort_order: 7 },
  { period: 7, label: 'คาบที่ 7', start_time: '14:20', end_time: '15:10', is_break: false, sort_order: 8 },
  { period: 8, label: 'คาบที่ 8', start_time: '15:10', end_time: '16:00', is_break: false, sort_order: 9 },
]

export function weeklyHoursFromYear(hoursPerYear: number | null | undefined) {
  if (!hoursPerYear || hoursPerYear <= 0) return 1
  return Math.max(1, Math.round(hoursPerYear / SCHEDULE_WEEKS_PER_YEAR))
}

export function workloadStatus(hours: number): 'ok' | 'warn' | 'over' {
  if (hours > WORKLOAD_WARN_MAX) return 'over'
  if (hours > WORKLOAD_OK_MAX) return 'warn'
  return 'ok'
}

export function workloadLabel(status: ReturnType<typeof workloadStatus>) {
  if (status === 'over') return 'เกินมาตรฐาน'
  if (status === 'warn') return 'ค่อนข้างมาก'
  return 'ปกติ'
}

export function emptyScheduleCells<T extends object>(factory: () => T) {
  const cells: Record<string, T> = {}
  for (const day of SCHEDULE_DAYS) {
    for (let period = 1; period <= SCHEDULE_PERIOD_COUNT; period++) {
      cells[`${day.value}-${period}`] = factory()
    }
  }
  return cells
}

export function shuffleArray<T>(arr: T[]) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export type AutoScheduleAssignment = {
  day: number
  period: number
  classSubjectId: string
}

/** กระจายวิชาตามโควต้าในช่องว่าง (ไม่ล็อก) */
export function buildAutoAssignments(
  quotas: { classSubjectId: string; count: number }[],
  emptySlots: { day: number; period: number }[],
  mode: 'spread' | 'random' = 'spread',
): AutoScheduleAssignment[] {
  const pool: string[] = []
  quotas.forEach(q => {
    for (let i = 0; i < q.count; i++) pool.push(q.classSubjectId)
  })
  if (!pool.length || !emptySlots.length) return []

  let slots = [...emptySlots]
  if (mode === 'spread') {
    slots.sort((a, b) => a.period - b.period || a.day - b.day)
  } else {
    slots = shuffleArray(slots)
  }
  const subjects = mode === 'spread' ? pool : shuffleArray(pool)
  const count = Math.min(pool.length, slots.length)
  const result: AutoScheduleAssignment[] = []
  for (let i = 0; i < count; i++) {
    result.push({
      day: slots[i].day,
      period: slots[i].period,
      classSubjectId: subjects[i],
    })
  }
  return result
}

export function periodTimeLabel(times: PeriodTimeRow[], period: number) {
  const row = times.find(t => t.period === period && !t.is_break)
  if (!row) return `คาบ ${period}`
  return `${row.start_time}–${row.end_time}`
}
