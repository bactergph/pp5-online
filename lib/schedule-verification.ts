import { blocksFor, checkPlanning, type PlannedLesson, type PlannedSlot, type PlanningIssue } from './schedule-planning'
import type { PeriodTimeRow } from './schedule-helpers'

/** Independently verify a solver answer before calling it complete or storing it. */
export function verifyCompleteSchedule(lessons: PlannedLesson[], rows: PlannedSlot[], days: number[], periods: PeriodTimeRow[], blocks: {teacherId:string;day:number;period:number}[]): PlanningIssue[] {
  const issues = checkPlanning(lessons, rows, days, periods, blocks)
  const add = (message: string) => issues.push({severity:'error', message, step:6})
  for (const lesson of lessons) {
    const slots = rows.filter(row => row.lessonId === lesson.id)
    if (slots.length !== lesson.count) add(`${lesson.label} จัดได้ ${slots.length} จาก ${lesson.count} คาบ`)
    if (!lesson.fixedOnly && !lesson.activity && lesson.pattern?.some(size => size > 1) && slots.length === lesson.count) {
      const remaining = new Set(slots.map(slot => `${slot.day}:${slot.period}`))
      const fits = (pattern: number[]): boolean => {
        if (!pattern.length) return remaining.size === 0
        const first = [...remaining].sort((a,b)=>{const [ad,ap]=a.split(':').map(Number),[bd,bp]=b.split(':').map(Number);return ad-bd||ap-bp})[0]
        for (const size of new Set(pattern)) for (const candidate of blocksFor(size, days, periods).filter(block=>`${block.day}:${block.periods[0]}`===first)) {
          const cells = candidate.periods.map(period => `${candidate.day}:${period}`)
          if (!cells.every(cell => remaining.has(cell))) continue
          cells.forEach(cell => remaining.delete(cell))
          const next = [...pattern];next.splice(next.indexOf(size),1)
          if (fits(next)) return true
          cells.forEach(cell => remaining.add(cell))
        }
        return false
      }
      if (!fits(lesson.pattern)) add(`${lesson.label} รูปแบบคาบไม่ตรงกับที่กำหนด หรือคาบติดกันข้ามช่วงพัก`)
    }
  }
  const groups = new Map<string, string>()
  for (const lesson of lessons.filter(lesson => lesson.activityGroupId)) {
    const cells = rows.filter(row => row.lessonId === lesson.id).map(row => `${row.day}:${row.period}`).sort().join(',')
    const previous = groups.get(lesson.activityGroupId!)
    if (previous !== undefined && previous !== cells) add(`${lesson.label} ${lesson.activity?'กิจกรรมรวมกลุ่ม':'วิชาสอนรวม'}ไม่ได้จัดพร้อมกันทุกห้อง`)
    groups.set(lesson.activityGroupId!, cells)
  }
  return issues
}
