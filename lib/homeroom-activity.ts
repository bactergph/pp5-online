import { resolveDailyStatus } from '@/lib/daily-attendance'

/** เรื่องที่ใช้บ่อยในแบบบันทึกกิจกรรม Homeroom ของโรงเรียน ครูเลือกได้หรือพิมพ์เอง */
export const HOMEROOM_TOPIC_PRESETS = [
  'การเตรียมความพร้อมเมื่อเปิดภาคเรียน',
  'ระเบียบวินัย',
  'การดูแลรักษาความสะอาดตนเอง',
  'ความรับผิดชอบในหน้าที่ที่ได้รับมอบหมาย',
  'การรักษาความสะอาดในห้องเรียน',
  'การใช้ห้องน้ำ การรักษาความสะอาด',
  'การเห็นอกเห็นใจผู้เรียน',
  'การออกกำลังกาย',
  'แนะนำการปฏิบัติตนในการดูแลสุขภาพ',
  'ความซื่อสัตย์สุจริต',
  'อบรมเรื่องมารยาท',
  'การใช้เวลาว่างให้เกิดประโยชน์',
  'การตั้งใจเรียน',
  'การเตรียมความพร้อมในการสอบ',
  'โรงเรียนปิดทำการเรียนการสอน',
  'วันพ่อแห่งชาติ',
  'วันรัฐธรรมนูญ',
  'หยุดวันปีใหม่',
] as const

export type HomeroomDayCounts = {
  total: number
  present: number
  leave: number
  absent: number
  sick: number
}

export function normalizeHomeroomTopics(values: string[]) {
  return values
    .map(value => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 2)
    .map(value => value.slice(0, 200))
}

export function homeroomClassTitle(level: string, room: number) {
  const text = String(level || '').trim()
  const digit = text.match(/(\d+)/)?.[1] || text
  if (/อนุบาล|^อ\.?/.test(text)) return `ชั้นอนุบาล ${digit} ห้อง ${room}`
  if (/มัธยม|^ม\.?/.test(text)) return `ชั้นมัธยมศึกษาปีที่ ${digit} ห้อง ${room}`
  return `ชั้นประถมศึกษาปีที่ ${digit} ห้อง ${room}`
}

export function thaiHomeroomDate(iso: string) {
  const date = new Date(`${iso}T12:00:00+07:00`)
  const weekday = new Intl.DateTimeFormat('th-TH', { weekday: 'long', timeZone: 'Asia/Bangkok' }).format(date)
  const day = new Intl.DateTimeFormat('th-TH', { day: 'numeric', timeZone: 'Asia/Bangkok' }).format(date)
  const month = new Intl.DateTimeFormat('th-TH', { month: 'long', timeZone: 'Asia/Bangkok' }).format(date)
  const year = new Intl.DateTimeFormat('th-TH', { year: 'numeric', timeZone: 'Asia/Bangkok' }).format(date).replace(/\D/g, '')
  return `${weekday}ที่ ${day} ${month} พ.ศ. ${year}`
}

export function homeroomWeekKey(iso: string) {
  const date = new Date(`${iso}T12:00:00+07:00`)
  const mondayOffset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - mondayOffset)
  return date.toISOString().slice(0, 10)
}

export function groupHomeroomWeeks(dates: string[]) {
  const groups: string[][] = []
  let current: string[] = []
  let week = ''
  for (const date of [...dates].sort()) {
    const key = homeroomWeekKey(date)
    if (key !== week) {
      if (current.length) groups.push(current)
      current = [date]
      week = key
    } else current.push(date)
  }
  if (current.length) groups.push(current)
  return groups
}

export function homeroomDayAttendance(saved: (string | null | undefined)[], date: string, asOf: string): HomeroomDayCounts {
  const counts: HomeroomDayCounts = { total: saved.length, present: 0, leave: 0, absent: 0, sick: 0 }
  for (const status of saved) {
    const display = resolveDailyStatus(status, date, asOf)
    if (display === 'ม') counts.present += 1
    else if (display === 'ล') counts.leave += 1
    else if (display === 'ข') counts.absent += 1
    else if (display === 'ป') counts.sick += 1
  }
  return counts
}

export function homeroomCountText(count: number) {
  return count > 0 ? String(count) : '-'
}
