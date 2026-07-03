export const SCHEDULE_PERIOD_COUNT = 8

export const SCHEDULE_DAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'จันทร์', short: 'จ.' },
  { value: 2, label: 'อังคาร', short: 'อ.' },
  { value: 3, label: 'พุธ', short: 'พ.' },
  { value: 4, label: 'พฤหัสบดี', short: 'พฤ.' },
  { value: 5, label: 'ศุกร์', short: 'ศ.' },
]

export type ScheduleColumn =
  | { kind: 'period'; period: number; header: string }
  | { kind: 'break'; header: string }

/** คอลัมน์ตาราง: คาบ 1–4 | พักเที่ยง | คาบ 5–8 */
export const SCHEDULE_COLUMNS: ScheduleColumn[] = [
  { kind: 'period', period: 1, header: '1' },
  { kind: 'period', period: 2, header: '2' },
  { kind: 'period', period: 3, header: '3' },
  { kind: 'period', period: 4, header: '4' },
  { kind: 'break', header: 'พักเที่ยง' },
  { kind: 'period', period: 5, header: '5' },
  { kind: 'period', period: 6, header: '6' },
  { kind: 'period', period: 7, header: '7' },
  { kind: 'period', period: 8, header: '8' },
]

export const SCHEDULE_EDIT_ROLES = ['admin', 'academic_head', 'deputy_principal'] as const
export const SCHEDULE_VIEW_ROLES = ['admin', 'academic_head', 'deputy_principal', 'principal', 'teacher'] as const

export function scheduleCellKey(day: number, period: number) {
  return `${day}-${period}`
}

export function parseScheduleCellKey(key: string) {
  const [day, period] = key.split('-').map(Number)
  return { day, period }
}
