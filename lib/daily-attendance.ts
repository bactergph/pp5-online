/** ค่าช่องว่างที่เก็บในฐาน — คนละความหมายกับไม่มีแถว (=มา) */
export const DAILY_BLANK = '-' as const

export type DailyDbStatus = 'ม' | 'ป' | 'ล' | 'ข' | typeof DAILY_BLANK
/** ลำดับวนคลิก: ม → ล → ป → ข → ช่องว่าง → ม */
export type DailyDisplayStatus = 'ม' | 'ล' | 'ป' | 'ข' | typeof DAILY_BLANK

export const DAILY_STATUS_CYCLE: DailyDisplayStatus[] = ['ม', 'ล', 'ป', 'ข', DAILY_BLANK]

export const DAILY_STATUS_LABELS: Record<DailyDisplayStatus, string> = {
  'ม': 'มา',
  'ล': 'ลา',
  'ป': 'ป่วย',
  'ข': 'ขาด',
  [DAILY_BLANK]: 'ช่องว่าง',
}

export function isDailyBlank(status?: string | null): status is typeof DAILY_BLANK {
  return status === DAILY_BLANK
}

export function toDailyDisplay(status?: DailyDbStatus | string | null): DailyDisplayStatus | null {
  if (status == null || status === '') return null
  if (status === DAILY_BLANK) return DAILY_BLANK
  // รองรับค่าเก่าที่เคยแสดงเป็น /
  if (status === 'ม' || status === '/') return 'ม'
  if (status === 'ป' || status === 'ล' || status === 'ข') return status
  return null
}

export function toDailyDb(status: DailyDisplayStatus | '/'): DailyDbStatus {
  if (status === '/') return 'ม'
  return status
}

/** Sparse + blank: ไม่มีแถว = มา; มี '-' = ช่องว่าง; นอกนั้นตามค่า */
export function resolveDailyStatus(saved?: DailyDbStatus | string | null): DailyDisplayStatus {
  if (isDailyBlank(saved)) return DAILY_BLANK
  return toDailyDisplay(saved as DailyDbStatus | null) ?? 'ม'
}

/** ข้อความในช่อง: ช่องว่างที่เก็บแล้ว = ว่างเปล่า; ไม่มีแถว = ม */
export function dailyCellText(saved?: DailyDbStatus | string | null): string {
  const status = resolveDailyStatus(saved)
  return status === DAILY_BLANK ? '' : status
}

/** วนคลิก ม → ล → ป → ข → ช่องว่าง → ม */
export function nextDailyDisplay(status: DailyDisplayStatus): DailyDisplayStatus {
  const index = DAILY_STATUS_CYCLE.indexOf(status)
  return DAILY_STATUS_CYCLE[(index < 0 ? 0 : index + 1) % DAILY_STATUS_CYCLE.length]
}

export function isDailyPresent(status?: DailyDbStatus | string | null) {
  return status === 'ม'
}

/** ไม่มีแถวหรือ ม ชัดๆ = มา; ช่องว่างที่เก็บแล้ว / ขลป ≠ มา */
export function isDailyPresentOrDefault(status?: DailyDbStatus | string | null) {
  return status == null || status === 'ม'
}

/** สรุป ม/ป/ล/ข — ข้ามช่องว่างที่เก็บแล้ว (ไม่นับ) */
export function summarizeDailyStatuses(
  schoolDays: number[],
  byDay: Record<number, string | undefined> | undefined,
) {
  const out = { 'ม': 0, 'ป': 0, 'ล': 0, 'ข': 0 } as Record<'ม' | 'ป' | 'ล' | 'ข', number>
  for (const day of schoolDays) {
    const saved = byDay?.[day]
    if (isDailyBlank(saved)) continue
    const display = resolveDailyStatus(saved)
    if (display === DAILY_BLANK) continue
    out[display] += 1
  }
  return out
}

export function dailyDisplayLabel(status?: DailyDbStatus | string | null) {
  const display = status == null ? null : resolveDailyStatus(status)
  if (display == null) return ''
  return DAILY_STATUS_LABELS[display]
}
