// thaiDate.ts - แปลงวันที่เป็นรูปแบบไทย (พ.ศ.)
import dayjs from 'dayjs'
import 'dayjs/locale/th'

// ชื่อเดือนไทย
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.',
  'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.',
  'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
]

// แปลง ค.ศ. เป็น พ.ศ.
export function toBuddhistYear(year: number): number {
  return year + 543
}

// แปลง พ.ศ. เป็น ค.ศ.
export function toGregorianYear(year: number): number {
  return year - 543
}

// แสดงวันที่แบบไทย เช่น "18 พฤษภาคม 2569"
export function formatThaiDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = dayjs(date)
  if (!d.isValid()) return '-'
  const day = d.date()
  const month = THAI_MONTHS[d.month()]
  const year = toBuddhistYear(d.year())
  return `${day} ${month} ${year}`
}

// แสดงวันที่แบบย่อ เช่น "18 พ.ค. 2569"
export function formatThaiDateShort(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = dayjs(date)
  if (!d.isValid()) return '-'
  const day = d.date()
  const month = THAI_MONTHS_SHORT[d.month()]
  const year = toBuddhistYear(d.year())
  return `${day} ${month} ${year}`
}

// แสดงปี พ.ศ.
export function formatThaiYear(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = dayjs(date)
  if (!d.isValid()) return '-'
  return String(toBuddhistYear(d.year()))
}

// แสดงชื่อเดือนไทย
export function getThaiMonthName(month: number): string {
  return THAI_MONTHS[month - 1] || ''
}

// แสดงชื่อเดือนย่อไทย
export function getThaiMonthShort(month: number): string {
  return THAI_MONTHS_SHORT[month - 1] || ''
}

// คำนวณอายุ ณ วันนี้ (ปี-เดือน-วัน)
export function calculateAge(birthDate: string | Date | null | undefined): {
  years: number, months: number, days: number, display: string
} {
  if (!birthDate) return { years: 0, months: 0, days: 0, display: '-' }
  const birth = dayjs(birthDate)
  const today = dayjs()
  if (!birth.isValid()) return { years: 0, months: 0, days: 0, display: '-' }

  const years = today.diff(birth, 'year')
  const months = today.diff(birth.add(years, 'year'), 'month')
  const days = today.diff(birth.add(years, 'year').add(months, 'month'), 'day')

  return {
    years,
    months,
    days,
    display: `${years} ปี ${months} เดือน ${days} วัน`
  }
}

// แปลง date string เป็น format สำหรับ input[type=date]
export function toInputDate(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = dayjs(date)
  if (!d.isValid()) return ''
  return d.format('YYYY-MM-DD')
}

// ปีการศึกษาปัจจุบัน (พ.ศ.)
export function getCurrentAcademicYear(): number {
  const now = dayjs()
  const year = now.year() + 543
  // ถ้าเดือนมกราคม-เมษายน ยังนับเป็นปีการศึกษาก่อน
  if (now.month() < 4) return year - 1
  return year
}

export { THAI_MONTHS, THAI_MONTHS_SHORT }

/** แปลงข้อความวันที่ไทย เช่น "31 พ.ค. 2569" → "2026-05-31" */
export function parseThaiDateLabel(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const match = trimmed.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/)
  if (!match) return null

  const day = Number(match[1])
  const monthToken = match[2]
  const yearBe = Number(match[3])
  if (!day || !yearBe) return null

  let monthIndex = THAI_MONTHS_SHORT.findIndex(m => m === monthToken || m.replace(/\.$/, '') === monthToken.replace(/\.$/, ''))
  if (monthIndex < 0) monthIndex = THAI_MONTHS.findIndex(m => m === monthToken)
  if (monthIndex < 0) return null

  const iso = `${toGregorianYear(yearBe)}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return dayjs(iso).isValid() ? iso : null
}

export function buddhistYearFromIsoDate(date: string): number | null {
  const d = dayjs(date)
  if (!d.isValid()) return null
  return toBuddhistYear(d.year())
}

/** แปลงข้อความวาง (วันที่ + tab + ชื่อวันหยุด ต่อบรรทัด) */
export function parseHolidayPasteText(text: string): { year_be: number; date: string; name: string }[] {
  const rows: { year_be: number; date: string; name: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\t+/)
    const datePart = (parts[0] || trimmed).trim()
    const namePart = (parts[1] || '').trim()
    if (!namePart) continue
    const date = parseThaiDateLabel(datePart)
    const yearBe = buddhistYearFromIsoDate(date || '')
    if (!date || !yearBe) continue
    rows.push({ year_be: yearBe, date, name: namePart })
  }
  return rows
}
