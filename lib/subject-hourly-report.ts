import {
  buildTeachingWeeks,
  hoursPerWeek,
  isTeachingSchoolDay,
  parseIsoDate,
  schoolDayCalendarFromLists,
  termDateRange,
  type SchoolDayCalendar,
  type TeachingWeek,
} from '@/lib/hourly-attendance'

export const PRIMARY_SLOTS_PER_WEEK = 5
export const HOURLY_WEEKS_PER_PAGE = 4
/** @deprecated use HOURLY_WEEKS_PER_PAGE */
export const SECONDARY_WEEKS_PER_PAGE = HOURLY_WEEKS_PER_PAGE

const TEACHING_DAY_OFFSETS: Record<number, number[]> = {
  1: [2],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
}

function isoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function teachingDayOffsets(hpw: number) {
  const n = Math.max(1, Math.min(5, Math.round(hpw)))
  return TEACHING_DAY_OFFSETS[n] || TEACHING_DAY_OFFSETS[5]
}

export function displaySlotsPerWeek(isPrimary: boolean, hpw: number) {
  return isPrimary ? PRIMARY_SLOTS_PER_WEEK : Math.max(1, hpw)
}

export function primaryGlobalSlotNumber(weekNumber: number, slot: number) {
  return (weekNumber - 1) * PRIMARY_SLOTS_PER_WEEK + slot
}

export type SubjectCalendarDay = {
  date: Date
  iso: string
  weekNumber: number
  dayOfWeek: number
  dayNumber: number
  isWeekend: boolean
  isHoliday: boolean
  holidayLabel?: string
  isOpenWeekend: boolean
  hourNumber?: number
  /** คาบที่ในสัปดาห์ (1..hpw) — ตรงกับ hour_number ใน hourly_attendance */
  slotInWeek?: number
}

export type SubjectCalendarWeek = {
  weekNumber: number
  days: SubjectCalendarDay[]
}

export function buildSubjectCalendarWeeks(
  termStart: string | null,
  termEnd: string | null,
  calendar?: SchoolDayCalendar,
  hpw = 1,
  holidayNames?: Map<string, string>,
): { weeks: SubjectCalendarWeek[]; totalHours: number } {
  const teachingWeeks = buildTeachingWeeks(termStart, termEnd, calendar)
  const termStartDate = parseIsoDate(termStart)
  const termEndDate = parseIsoDate(termEnd)
  const offsets = teachingDayOffsets(hpw)
  let globalHour = 0

  const weeks: SubjectCalendarWeek[] = teachingWeeks.map(tw => {
    const monday = parseIsoDate(tw.startDate) || parseIsoDate(tw.endDate)!
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() - 1)

    const days: SubjectCalendarDay[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(sunday)
      date.setDate(sunday.getDate() + i)
      const iso = isoDate(date)
      const dow = date.getDay()
      const isOpenWeekend = calendar?.openWeekendDays.has(iso) ?? false
      const isHoliday = calendar?.holidays.has(iso) ?? false
      const isWeekend = (dow === 0 || dow === 6) && !isOpenWeekend
      days.push({
        date,
        iso,
        weekNumber: tw.weekNumber,
        dayOfWeek: dow,
        dayNumber: date.getDate(),
        isWeekend,
        isHoliday,
        holidayLabel: isHoliday ? (holidayNames?.get(iso) || 'วันหยุด') : undefined,
        isOpenWeekend,
      })
    }

    let slotInWeek = 0
    for (const offset of offsets) {
      const targetDow = offset + 1
      const day = days.find(d => {
        if (d.dayOfWeek !== targetDow || d.isHoliday || d.isWeekend) return false
        if (!termStartDate || !termEndDate) return false
        return d.date >= termStartDate && d.date <= termEndDate
          && isTeachingSchoolDay(d.date, d.iso, calendar)
      })
      if (day) {
        globalHour += 1
        slotInWeek += 1
        day.hourNumber = globalHour
        day.slotInWeek = slotInWeek
      }
    }

    return { weekNumber: tw.weekNumber, days }
  })

  return { weeks: weeks.slice(0, 20), totalHours: globalHour }
}

export function subjectHourlyTermWeeks(
  termStart: string | null,
  termEnd: string | null,
  calendar?: SchoolDayCalendar,
) {
  return buildTeachingWeeks(termStart, termEnd, calendar).slice(0, 20)
}

export function subjectHourlyHpw(hoursPerYear: number, weeks: TeachingWeek[]) {
  return hoursPerWeek(hoursPerYear, weeks.length)
}

function hourlyPagesByFourWeeks<T extends { weekNumber: number }>(
  weeks: T[],
  keyPrefix: string,
  summaryOnLastBlock = false,
) {
  const pages: { key: string; weeks: T[]; showSummary: boolean }[] = []
  for (let i = 0; i < weeks.length; i += HOURLY_WEEKS_PER_PAGE) {
    const chunk = weeks.slice(i, i + HOURLY_WEEKS_PER_PAGE)
    const isLastChunk = i + HOURLY_WEEKS_PER_PAGE >= weeks.length
    const hasWeek17Plus = chunk.some(week => week.weekNumber >= 17)
    pages.push({
      key: `${keyPrefix}-w${chunk[0]?.weekNumber || i + 1}`,
      weeks: chunk,
      showSummary: summaryOnLastBlock && isLastChunk && hasWeek17Plus,
    })
  }
  return pages
}

export function primaryHourlyPages(weeks: TeachingWeek[]) {
  return hourlyPagesByFourWeeks(weeks, 'pri', true)
}

export function secondaryHourlyPages(weeks: SubjectCalendarWeek[]) {
  return hourlyPagesByFourWeeks(weeks, 'sec', false)
}

export function countPrimaryHourlyPages(weeks: TeachingWeek[]) {
  if (weeks.length === 0) return 1
  return primaryHourlyPages(weeks).length || 1
}

export function countSecondaryHourlyPages(weeks: SubjectCalendarWeek[]) {
  if (weeks.length === 0) return 1
  return secondaryHourlyPages(weeks).length || 1
}

export function reportCalendarFromPayload(
  holidays: { date: string }[] = [],
  weekendSchoolDays: { date: string }[] = [],
) {
  return schoolDayCalendarFromLists(
    holidays.map(day => day.date),
    weekendSchoolDays.map(day => day.date),
  )
}

export function holidayNameMap(holidays: { date: string; name?: string | null }[] = []) {
  return new Map(holidays.map(day => [day.date, day.name || 'วันหยุด']))
}

export function termRangeFromYear(
  year: {
    term1_start_date: string | null
    term1_end_date: string | null
    term2_start_date: string | null
    term2_end_date: string | null
  } | null,
  term: 1 | 2,
) {
  return termDateRange(year, term)
}
