import type { Preparation } from './schedule-preparation'
import { blocksFor, checkPlanning, type LessonRule } from './schedule-planning'
import { withJointTeachingGroups } from './schedule-joint-teaching'
import { subjectDayIssue } from './schedule-subject-days'

export type SubjectDetailsInput = { code: string; name: string; shortName: string; group: string; type: string; count: number; teacherId?: string | null; periodMode?: 'single' | 'double' }
export function normalizeSubjectDetails(input: SubjectDetailsInput): SubjectDetailsInput {
  if (!input || ['code', 'name', 'shortName', 'group', 'type'].some(key => typeof input[key as keyof SubjectDetailsInput] !== 'string')) throw Error('กรอกรายละเอียดรายวิชาให้ถูกต้อง')
  const value = { ...input, code: input.code.trim(), name: input.name.trim(), shortName: input.shortName.trim(), group: input.group.trim(), type: input.type.trim() }
  if (!value.code || value.code.length > 40 || !value.name || value.name.length > 200 || value.shortName.length > 200) throw Error('กรอกรหัสและชื่อวิชาให้ครบ รหัสไม่เกิน 40 และชื่อไม่เกิน 200 ตัวอักษร')
  if (value.group.length > 80 || !['พื้นฐาน', 'เพิ่มเติม'].includes(value.type)) throw Error('กลุ่มสาระหรือประเภทวิชาไม่ถูกต้อง')
  if (!Number.isInteger(value.count) || value.count < 1 || value.count > 40) throw Error('จำนวนคาบต่อสัปดาห์ต้องเป็นจำนวนเต็ม 1–40 คาบ')
  if (value.teacherId !== undefined && value.teacherId !== null && (typeof value.teacherId !== 'string' || !/^[-0-9a-f]{36}$/i.test(value.teacherId))) throw Error('เลือกครูผู้สอนให้ถูกต้อง')
  if (value.periodMode !== undefined && !['single','double'].includes(value.periodMode)) throw Error('เลือกรูปแบบคาบเดี่ยวหรือคาบคู่ให้ถูกต้อง')
  return value
}
/** Keep existing blocks where possible; double-pattern offerings remain doubles
 * with a single remainder. Metadata edits never reset the lesson's preferences. */
export function subjectDetailsPattern(pattern: number[], count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 40) return []
  if (pattern.reduce((sum, n) => sum + n, 0) === count) return [...pattern]
  if (pattern.some(n => n === 2) && pattern.every(n => n === 1 || n === 2)) return [...Array(Math.floor(count / 2)).fill(2), ...(count % 2 ? [1] : [])]
  let remaining = count
  const result: number[] = []
  for (const size of pattern) if (size <= remaining) { result.push(size); remaining -= size }
  return [...result, ...Array(remaining).fill(1)]
}
export function prepareSubjectDetails(data: Preparation, lessonId: string, input: SubjectDetailsInput) {
  const details = normalizeSubjectDetails(input)
  const lesson = data.lessons.find(lesson => lesson.id === lessonId && !lesson.activity && data.classrooms.some(room => room.id === lesson.classroomId))
  if (!lesson) throw Error('ไม่พบรายวิชาในห้องและปีการศึกษานี้')
  if (data.lessons.some(other => !other.activity && other.id !== lessonId && other.classroomId === lesson.classroomId && other.code.trim().toLowerCase() === details.code.toLowerCase())) throw Error('รหัสวิชานี้มีในห้องแล้ว กรุณาใช้รหัสอื่น')
  const previous: LessonRule = data.plan.rules[lessonId] || { count: lesson.count, pattern: lesson.pattern || Array(lesson.count).fill(1), roomId: lesson.roomId || null, morning: !!lesson.morning, spread: lesson.spread ?? true, timePreference: lesson.timePreference || 'any' }
  const pattern = details.periodMode === 'single' ? Array(details.count).fill(1) : details.periodMode === 'double' ? [...Array(Math.floor(details.count / 2)).fill(2), ...(details.count % 2 ? [1] : [])] : subjectDetailsPattern(previous.pattern, details.count)
  const rule = { ...previous, count: details.count, pattern }
  const teacherId = details.teacherId === undefined ? lesson.teacherId : details.teacherId
  if (teacherId && !data.teachers.some(teacher => teacher.id === teacherId)) throw Error('ไม่พบครูผู้สอนในโรงเรียนนี้')
  if (teacherId && teacherId !== lesson.teacherId && data.plan.teacherIds?.length && !data.plan.teacherIds.includes(teacherId)) throw Error('กรุณาเลือกครูคนนี้ในขั้นกำหนดครูก่อน')
  const selected = data.slots.filter(row => row.class_subject_id === lessonId)
  if (!teacherId && selected.length) throw Error('มีคาบในตารางแล้ว กรุณานำคาบออกก่อนยกเลิกครูผู้สอน')
  if (selected.length > details.count) throw Error(`วิชานี้มีในตาราง ${selected.length} คาบ ลดเหลือ ${details.count} ไม่ได้ กรุณานำคาบส่วนเกินออกก่อน`)
  const lockedDayIssue=subjectDayIssue({...lesson,...rule},selected.filter(row=>row.locked).map(row=>({classroomId:row.classroom_id,lessonId,day:row.day_of_week,period:row.period})),data.plan.days,data.periods)
  if(lockedDayIssue)throw Error(lockedDayIssue)
  if (selected.length === details.count && selected.every(row=>row.locked)) {
    const remaining = new Set(selected.map(row => `${row.day_of_week}:${row.period}`))
    function fits(pattern: number[]): boolean {
      if (!pattern.length) return remaining.size === 0
      const first = [...remaining].sort((a, b) => { const [ad, ap] = a.split(':').map(Number), [bd, bp] = b.split(':').map(Number); return ad - bd || ap - bp })[0]
      for (const size of new Set(pattern)) for (const block of blocksFor(size, data.plan.days, data.periods).filter(block => `${block.day}:${block.periods[0]}` === first)) {
        const cells = block.periods.map(period => `${block.day}:${period}`)
        if (!cells.every(cell => remaining.has(cell))) continue
        cells.forEach(cell => remaining.delete(cell))
        const rest = [...pattern]; rest.splice(rest.indexOf(size), 1)
        if (fits(rest)) return true
        cells.forEach(cell => remaining.add(cell))
      }
      return false
    }
    if (!fits(rule.pattern)) throw Error('จำนวนคาบใหม่ทำให้คาบเดิมไม่ตรงรูปแบบคาบ กรุณาปรับคาบในตารางก่อน')
  }
  const plan = { ...data.plan, rules: { ...data.plan.rules, [lessonId]: rule } }
  const lessons = withJointTeachingGroups(data.lessons.map(item => item.id === lessonId ? { ...item, ...rule, teacherId } : item), plan, true)
  const fixed = checkPlanning(lessons, data.slots.map(row => ({ classroomId: row.classroom_id, lessonId: row.activity_id ? 'activity:' + row.activity_id : row.class_subject_id, day: row.day_of_week, period: row.period })), plan.days, data.periods, data.blocks).find(issue => issue.code?.startsWith('fixed_'))
  if (fixed) throw Error(fixed.message)
  return { details, lesson, plan, rule, teacherId }
}
