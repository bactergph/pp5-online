import type { PlannedLesson, PlannedSlot } from './schedule-planning'
import type { PeriodTimeRow } from './schedule-helpers'

/** Each ordinary subject has at most one teaching block per weekday. A block
 * may span multiple contiguous periods only when its pattern explicitly allows it. */
export function subjectDayIssue(lesson: PlannedLesson, rows: PlannedSlot[], days: number[], times: PeriodTimeRow[]): string | null {
  if (lesson.activity || lesson.fixedOnly || !Number.isInteger(lesson.count) || lesson.count < 1) return null
  const pattern = lesson.pattern || Array(lesson.count).fill(1)
  if (!Array.isArray(pattern) || pattern.some(size => !Number.isInteger(size) || size < 1)) return null
  if (pattern.length > days.length) return `${lesson.label} มี ${pattern.length} ช่วงเรียนต่อสัปดาห์ แต่มีวันเรียน ${days.length} วัน กรุณาเลือกคาบคู่หรือปรับจำนวนคาบ เพื่อไม่ให้วิชาเดิมซ้ำวัน`
  const fixedDays = [...new Set(rows.filter(row => row.lessonId === lesson.id).map(row => row.day))]
  const options = fixedDays.map(day => {
    const selected = rows.filter(row => row.lessonId === lesson.id && row.day === day).map(row => row.period)
    const sizes = [...new Set(pattern)].filter(length => times.some((_, start) => {
      const block = times.slice(start, start + length)
      return block.length === length && block.every((time, index) => !time.is_break && (!index || block[index - 1].end_time === time.start_time)) && selected.every(period => block.some(time => time.period === period))
    }))
    return { day, sizes }
  }).sort((a, b) => a.sizes.length - b.sizes.length)
  const counts = new Map(pattern.map(size => [size, pattern.filter(item => item === size).length]))
  function match(index: number): boolean {
    if (index === options.length) return true
    for (const size of options[index].sizes) if (counts.get(size)) {
      counts.set(size, counts.get(size)! - 1)
      if (match(index + 1)) return true
      counts.set(size, counts.get(size)! + 1)
    }
    return false
  }
  if (match(0)) return null
  const labels = ['','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์']
  return `${lesson.label} คาบเดิมไม่ตรงการกระจายวัน (${fixedDays.map(day => `วัน${labels[day] || day} คาบ ${rows.filter(row => row.lessonId === lesson.id && row.day === day).map(row => row.period).sort((a,b)=>a-b).join(', ')}`).join('; ')}) คาบเดี่ยวต้องคนละวัน ส่วนคาบคู่ต้องติดกันและไม่ข้ามพัก กรุณาปรับรูปแบบคาบหรือคาบล็อก`
}
