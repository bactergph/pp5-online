export type DailyDbStatus = 'ม' | 'ป' | 'ล' | 'ข'
export type DailyDisplayStatus = 'ม' | 'ข' | 'ล' | 'ป'

export const DAILY_STATUS_CYCLE: DailyDisplayStatus[] = ['ม', 'ข', 'ล', 'ป']

export const DAILY_STATUS_LABELS: Record<DailyDisplayStatus, string> = {
  'ม': 'มา',
  'ข': 'ขาด',
  'ล': 'ลา',
  'ป': 'ป่วย',
}

export function toDailyDisplay(status?: DailyDbStatus | null): DailyDisplayStatus | null {
  if (!status) return null
  // รองรับค่าเก่าที่เคยแสดงเป็น /
  if (status === 'ม' || (status as string) === '/') return 'ม'
  if (status === 'ป' || status === 'ล' || status === 'ข') return status
  return null
}

export function toDailyDb(status: DailyDisplayStatus | '/'): DailyDbStatus {
  if (status === '/' || status === 'ม') return 'ม'
  return status
}

export function nextDailyDisplay(status: DailyDisplayStatus | null): DailyDisplayStatus {
  if (!status) return 'ม'
  const index = DAILY_STATUS_CYCLE.indexOf(status)
  return DAILY_STATUS_CYCLE[(index + 1) % DAILY_STATUS_CYCLE.length]
}

export function isDailyPresent(status?: DailyDbStatus | null) {
  return status === 'ม'
}

export function dailyDisplayLabel(status?: DailyDbStatus | null) {
  const display = toDailyDisplay(status)
  return display ? DAILY_STATUS_LABELS[display] : ''
}
