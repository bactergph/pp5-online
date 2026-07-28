export type HourlyStatus = '/' | 'ข' | 'ล' | 'ป'

export const HOURLY_STATUS_CYCLE: HourlyStatus[] = ['/', 'ข', 'ล', 'ป']

export const HOURLY_STATUS_LABELS: Record<HourlyStatus, string> = {
  '/': 'มา',
  'ข': 'ขาด',
  'ล': 'ลา',
  'ป': 'ป่วย',
}

const THAI_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export type TeachingWeek = {
  weekNumber: number
  startDate: string
  endDate: string
  dateLabel: string
}

export type HourlySummary = {
  present: number
  sick: number
  leave: number
  absent: number
  total: number
  percent: number
}

function isoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function thaiDayMonth(date: Date) {
  return `${date.getDate()} ${THAI_MONTH_SHORT[date.getMonth()]}`
}

function formatWeekRange(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth()
  return sameMonth
    ? `${start.getDate()}-${end.getDate()} ${THAI_MONTH_SHORT[start.getMonth()]}`
    : `${thaiDayMonth(start)}-${thaiDayMonth(end)}`
}

export function parseIsoDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : null
}

export function termDateRange(year: {
  term1_start_date: string | null
  term1_end_date: string | null
  term2_start_date: string | null
  term2_end_date: string | null
} | null, term: 1 | 2) {
  if (!year) return { start: null, end: null }
  return term === 1
    ? { start: year.term1_start_date, end: year.term1_end_date }
    : { start: year.term2_start_date, end: year.term2_end_date }
}

export type SchoolDayCalendar = {
  holidays: Set<string>
  openWeekendDays: Set<string>
}

export function schoolDayCalendarFromLists(
  holidays: string[] = [],
  openWeekendDays: string[] = [],
): SchoolDayCalendar {
  return {
    holidays: new Set(holidays),
    openWeekendDays: new Set(openWeekendDays),
  }
}

export function isTeachingSchoolDay(date: Date, iso: string, calendar?: SchoolDayCalendar) {
  const isWeekend = date.getDay() === 0 || date.getDay() === 6
  if (!calendar) return !isWeekend
  if (calendar.holidays.has(iso)) return false
  if (isWeekend && !calendar.openWeekendDays.has(iso)) return false
  return true
}

function mondayOfWeekContaining(date: Date) {
  const cursor = new Date(date)
  const day = cursor.getDay()
  cursor.setDate(cursor.getDate() + (day === 0 ? -6 : 1 - day))
  return cursor
}

/** สัปดาห์การสอนในภาคเรียน (จันทร์–ศุกร์) — ข้ามสัปดาห์ที่ไม่มีวันเรียน (ปิดเทอม/วันหยุด) */
export function buildTeachingWeeks(
  termStart: string | null,
  termEnd: string | null,
  calendar?: SchoolDayCalendar,
): TeachingWeek[] {
  const start = parseIsoDate(termStart)
  const end = parseIsoDate(termEnd)
  if (!start || !end || start > end) return []

  const weeks: TeachingWeek[] = []
  const cursor = mondayOfWeekContaining(start)

  while (cursor <= end) {
    const weekStart = new Date(cursor)
    const weekEnd = new Date(cursor)
    weekEnd.setDate(weekEnd.getDate() + 4)

    const clipStart = weekStart < start ? new Date(start) : weekStart
    const clipEnd = weekEnd > end ? new Date(end) : weekEnd

    let schoolDayCount = 0
    const dayCursor = new Date(clipStart)
    while (dayCursor <= clipEnd) {
      if (isTeachingSchoolDay(dayCursor, isoDate(dayCursor), calendar)) {
        schoolDayCount += 1
      }
      dayCursor.setDate(dayCursor.getDate() + 1)
    }

    // นับสัปดาห์ต้น/ปลายภาคเฉพาะกรณีที่มีวันเรียนอย่างน้อย 3 วัน
    // เพื่อตัด "สัปดาห์เศษ" ที่ทำให้จำนวนสัปดาห์เกินจริง (เช่น 22 แทน 20)
    const isPartialWeek = clipStart.getTime() !== weekStart.getTime() || clipEnd.getTime() !== weekEnd.getTime()
    const minDaysRequired = isPartialWeek ? 3 : 1

    if (schoolDayCount >= minDaysRequired) {
      const labelStart = weekStart < start ? new Date(start) : new Date(weekStart)
      const labelEnd = weekEnd > end ? new Date(end) : new Date(weekEnd)
      weeks.push({
        weekNumber: weeks.length + 1,
        startDate: isoDate(weekStart),
        endDate: isoDate(weekEnd > end ? end : weekEnd),
        dateLabel: formatWeekRange(labelStart, labelEnd),
      })
    }

    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

/** ชั่วโมงต่อสัปดาห์จากชั่วโมง/ปี และจำนวนสัปดาห์ในภาคเรียน */
export function hoursPerWeek(hoursPerYear: number, termWeekCount: number) {
  if (!termWeekCount) return 1
  const termHours = (hoursPerYear || 0) / 2
  if (termHours <= 0) return 1
  return Math.max(1, Math.round(termHours / termWeekCount))
}

export function globalSlotNumber(weekNumber: number, slot: number, hoursPerWeekCount: number) {
  return (weekNumber - 1) * hoursPerWeekCount + slot
}

export function hourlyCellKey(studentId: string, weekNumber: number, slot: number) {
  return `${studentId}:${weekNumber}:${slot}`
}

export type HourlyAttendanceRecord = {
  student_id: string
  class_subject_id: string
  term: 1 | 2
  week_number: number
  hour_number: number
  status: HourlyStatus | string
}

/** สร้าง map สำหรับ lookup ช่องเวลาเรียน — ใช้ร่วมกันระหว่างหน้าเช็คชื่อและรายงาน */
export function buildHourlyStatusMap(
  records: HourlyAttendanceRecord[] | undefined,
  classSubjectId: string,
  term?: 1 | 2,
) {
  const subjectId = classSubjectId.trim()
  const out = new Map<string, HourlyStatus>()
  for (const record of records || []) {
    if (record.class_subject_id.trim() !== subjectId) continue
    if (term !== undefined && record.term !== term) continue
    out.set(
      hourlyCellKey(record.student_id, record.week_number, record.hour_number),
      record.status as HourlyStatus,
    )
  }
  return out
}

export function nextHourlyStatus(current: HourlyStatus): HourlyStatus {
  const index = HOURLY_STATUS_CYCLE.indexOf(current)
  return HOURLY_STATUS_CYCLE[(index + 1) % HOURLY_STATUS_CYCLE.length]
}

/** Sparse: ช่องว่างแสดงเป็นมา — คลิกแรก → `ข` แล้ววน ข → ล → ป → / */
export function nextHourlyStatusFromSaved(current: HourlyStatus | null): HourlyStatus {
  if (current === null) return 'ข'
  return nextHourlyStatus(current)
}

/** ไม่มีแถว = มา (`/`) */
export function resolveHourlyStatus(saved: HourlyStatus | null | undefined): HourlyStatus {
  return saved ?? '/'
}

/** Callers that build status lists for expected slots should use resolveHourlyStatus(map.get(key)) so missing counts as present. */
export function summarizeHourlyStatuses(statuses: HourlyStatus[]): HourlySummary {
  let present = 0
  let sick = 0
  let leave = 0
  let absent = 0
  for (const status of statuses) {
    if (status === 'ป') sick += 1
    else if (status === 'ล') leave += 1
    else if (status === 'ข') absent += 1
    else present += 1
  }
  const total = present + sick + leave + absent
  const percent = total > 0 ? Math.round((present / total) * 1000) / 10 : 0
  return { present, sick, leave, absent, total, percent }
}

export function chunkWeeks<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}
