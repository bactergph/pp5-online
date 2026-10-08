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

export const MAX_SCHEDULE_PERIODS = 8
/** Move lunch and retain each period's duration, starting at the school's first bell. */
export function moveLunchBreak(times: PeriodTimeRow[], afterPeriod: number): PeriodTimeRow[] {
  const lessons = times.filter(t => !t.is_break)
  const lunch = times.find(t => t.is_break)
  if (!lunch || !Number.isInteger(afterPeriod) || afterPeriod < 1 || afterPeriod > lessons.length) throw new Error('กรุณาเลือกคาบก่อนพักเที่ยง')
  const minute = (value: string) => {const [h,m]=value.split(':').map(Number);return h*60+m}
  const clock = (value: number) => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
  const ordered = [...lessons.slice(0,afterPeriod),lunch,...lessons.slice(afterPeriod)]
  let cursor = minute(times[0].start_time)
  return ordered.map((row,index)=>{
    const duration = minute(row.end_time)-minute(row.start_time)
    if (!Number.isFinite(duration) || duration<=0 || cursor+duration>1439) throw new Error('กรุณาตรวจสอบเวลาเริ่มและสิ้นสุดก่อนย้ายช่วงพัก')
    const result = {...row,start_time:clock(cursor),end_time:clock(cursor+duration),sort_order:index+1}
    cursor+=duration
    return result
  })
}
export function schedulePeriods(times: PeriodTimeRow[]) {
  return (times.length ? times : DEFAULT_PERIOD_TIMES).filter(t => !t.is_break).map(t => t.period)
}
export function validatePeriodTimes(times: PeriodTimeRow[]) {
  const teaching = times.filter(t => !t.is_break)
  if (!teaching.length || teaching.length > MAX_SCHEDULE_PERIODS || times.filter(t => t.is_break && t.period === 0).length !== 1 || times.length !== teaching.length + 1 || teaching.some((t, i) => t.period !== i + 1)) return 'ต้องมีคาบเรียนเรียงจาก 1 สูงสุด 8 คาบ และพักเที่ยงหนึ่งช่วง'
  for (const [i, t] of times.entries()) {
    if (!t.label.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.start_time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.end_time) || t.start_time >= t.end_time || (i > 0 && times[i-1].end_time > t.start_time)) return 'กรุณาระบุเวลาให้ครบ เรียงตามลำดับ และไม่ทับซ้อนกัน'
  }
  return null
}

/** ค่าเริ่มต้นระดับประถม: 6 วิชา/วัน · วิชาละ 1 ชม. · เริ่ม 08:30 · พักเที่ยง 11:30–12:30 · เลิก 15:30 */
export const DEFAULT_PERIOD_TIMES: PeriodTimeRow[] = [
  { period: 1, label: 'คาบที่ 1', start_time: '08:30', end_time: '09:30', is_break: false, sort_order: 1 },
  { period: 2, label: 'คาบที่ 2', start_time: '09:30', end_time: '10:30', is_break: false, sort_order: 2 },
  { period: 3, label: 'คาบที่ 3', start_time: '10:30', end_time: '11:30', is_break: false, sort_order: 3 },
  { period: 0, label: 'พักเที่ยง', start_time: '11:30', end_time: '12:30', is_break: true, sort_order: 4 },
  { period: 4, label: 'คาบที่ 4', start_time: '12:30', end_time: '13:30', is_break: false, sort_order: 5 },
  { period: 5, label: 'คาบที่ 5', start_time: '13:30', end_time: '14:30', is_break: false, sort_order: 6 },
  { period: 6, label: 'คาบที่ 6', start_time: '14:30', end_time: '15:30', is_break: false, sort_order: 7 },
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
