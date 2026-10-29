import type { PlannedLesson, PlannedSlot, PlanningIssue } from './schedule-planning'
import type { PeriodTimeRow } from './schedule-helpers'

type SlotDemand = { count: number; slots: number[] }
export type SlotBottleneck = { indices: number[]; need: number; slots: number[] }

/** Match every remaining period to a distinct slot. An alternating path from
 * unmatched periods gives a Hall witness: a subset needs more slots than its
 * entire union provides. A total weekly load check cannot detect this subset. */
export function findSlotBottleneck(demands: SlotDemand[]): SlotBottleneck | null {
  const rows = demands.flatMap((demand, index) => Array.from({ length: demand.count }, () => index))
  const union = [...new Set(demands.flatMap(demand => demand.slots))]
  if (rows.length > union.length) return { indices: demands.map((_, i) => i), need: rows.length, slots: union }
  const held = new Map<number, number>(), matched = new Set<number>()
  function augment(row: number, seen: Set<number>): boolean {
    for (const slot of demands[rows[row]].slots) {
      if (seen.has(slot)) continue
      seen.add(slot)
      const previous = held.get(slot)
      if (previous === undefined || augment(previous, seen)) { held.set(slot, row); return true }
    }
    return false
  }
  for (let row = 0; row < rows.length; row++) if (augment(row, new Set())) matched.add(row)
  if (matched.size === rows.length) return null
  const reached = new Set<number>(), slots = new Set<number>(), queue: number[] = []
  for (let row = 0; row < rows.length; row++) if (!matched.has(row)) { reached.add(row); queue.push(row) }
  for (let at = 0; at < queue.length; at++) for (const slot of demands[rows[queue[at]]].slots) {
    slots.add(slot)
    const other = held.get(slot)
    if (other !== undefined && !reached.has(other)) { reached.add(other); queue.push(other) }
  }
  return { indices: [...new Set([...reached].map(row => rows[row]))], need: reached.size, slots: [...slots] }
}

const teachers = (lesson: PlannedLesson) => lesson.teacherIds ?? (lesson.teacherId ? [lesson.teacherId] : [])

/** A relaxation of the remaining timetable, never a complete feasibility proof.
 * Double periods may split here and movable activities may repeat on a day.
 * Failure even in this more permissive model proves the real inputs conflict. */
export function remainingSlotCapacityIssues(lessons: PlannedLesson[], fixed: PlannedSlot[], days: number[], times: PeriodTimeRow[], unavailable: { teacherId: string; day: number; period: number }[]): PlanningIssue[] {
  const cells = days.flatMap(day => times.filter(time => !time.is_break).map(time => ({ day, period: time.period })))
  const byId = new Map(lessons.map(lesson => [lesson.id, lesson]))
  const occupied = new Set<string>(), busy = new Set<string>(), venues = new Set<string>()
  const retained = new Map<string, PlannedSlot[]>()
  const key = (id: string, day: number, period: number) => `${id}:${day}:${period}`
  for (const row of fixed) {
    occupied.add(key(row.classroomId, row.day, row.period))
    const lesson = row.lessonId ? byId.get(row.lessonId) : undefined
    if (!lesson) continue
    retained.set(lesson.id, [...retained.get(lesson.id) || [], row])
    for (const id of teachers(lesson)) busy.add(key(id, row.day, row.period))
    if (lesson.roomId) venues.add(key(lesson.roomId, row.day, row.period))
  }
  for (const block of unavailable) busy.add(key(block.teacherId, block.day, block.period))
  const groups = new Map<string, PlannedLesson[]>()
  // Include satisfied members too, so an asymmetrically retained shared group
  // cannot be mistaken for independent demand. Leave that case to the solver.
  for (const lesson of lessons) {
    const owner = lesson.activityGroupId || lesson.id
    groups.set(owner, [...groups.get(owner) || [], lesson])
  }
  const units: (SlotDemand & { members: PlannedLesson[]; resources: string[] })[] = []
  for (const members of groups.values()) {
    if (members.some(lesson => lesson.fixedOnly)) continue
    const counts = members.map(lesson => lesson.count - (retained.get(lesson.id)?.length || 0))
    if (counts[0] <= 0 || counts.some(count => count !== counts[0])) continue
    // A partially retained selected-cell shared session needs its own solver;
    // counting the two members separately could overstate teacher demand.
    if (members.some(lesson => Object.keys(lesson.jointTeachingCells || {}).some(cell => !retained.get(lesson.id)?.some(row => `${row.day}:${row.period}` === cell)))) continue
    const slots = cells.flatMap((cell, index) => members.every(lesson => {
      if (occupied.has(key(lesson.classroomId, cell.day, cell.period))) return false
      if (teachers(lesson).some(id => busy.has(key(id, cell.day, cell.period)))) return false
      if (lesson.roomId && venues.has(key(lesson.roomId, cell.day, cell.period))) return false
      const singles = !lesson.pattern || lesson.pattern.every(size => size === 1)
      return lesson.activity || !singles || !retained.get(lesson.id)?.some(row => row.day === cell.day)
    }) ? [index] : [])
    units.push({ count: counts[0], slots, members, resources: [...new Set(members.flatMap(lesson => [
      `class:${lesson.classroomId}`, ...teachers(lesson).map(id => `teacher:${id}`), ...(lesson.roomId ? [`venue:${lesson.roomId}`] : []),
    ]))] })
  }
  for (const resource of new Set(units.flatMap(unit => unit.resources))) {
    const selected = units.filter(unit => unit.resources.includes(resource))
    const bottleneck = findSlotBottleneck(selected)
    if (!bottleneck) continue
    const affected = bottleneck.indices.map(index => selected[index])
    const kind = resource.slice(0, resource.indexOf(':')), id = resource.slice(resource.indexOf(':') + 1)
    const taught = lessons.filter(lesson => teachers(lesson).includes(id))
    const named = taught.find(lesson => teachers(lesson).length === 1 && lesson.teacherName)?.teacherName
    const team = taught.find(lesson => lesson.teacherName?.split(/[,、]/).length === teachers(lesson).length)
    const teacherName = named || (team ? team.teacherName!.split(/[,、]/)[teachers(team).indexOf(id)]?.trim() : undefined)
    const label = kind === 'teacher' ? `ครู ${teacherName || `รหัส ${id}`}` : kind === 'venue' ? 'สถานที่ร่วม' : `ห้อง ${affected[0].members.find(lesson => lesson.classroomId === id)?.label.split(' · ')[0] || id}`
    const dayNames = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']
    return [{ severity: 'error', step: 6, manageStep: 6,
      message: `${label}: กลุ่มรายวิชาที่ยังต้องจัดต้องใช้ ${bottleneck.need} คาบ แต่มีช่องร่วมที่ลงได้เพียง ${bottleneck.slots.length} ช่อง`,
      details: [
        'ตรวจพบข้อขัดกันจากคาบล็อก กิจกรรม และเวลาว่างที่กำหนด โดยยังไม่ได้ลองย้ายคาบใด',
        `จำนวนนี้เป็นคาบที่เหลือเฉพาะกลุ่มรายวิชาด้านล่าง ไม่ใช่ภาระสอนรวมทั้งหมด`,
        ...affected.map(unit => `${unit.members.map(lesson => lesson.label).join(' / ')}: ยังต้องจัด ${unit.count} คาบ${unit.members.length > 1 ? ' (สอนรวม นับครูครั้งเดียว)' : ''}`),
        ...days.flatMap(day => {
          const periods = bottleneck.slots.map(slot => cells[slot]).filter(cell => cell.day === day).map(cell => cell.period).sort((a, b) => a - b)
          return periods.length ? [`วัน${dayNames[day]}: คาบ ${periods.join(', ')}`] : []
        }),
        'ตรวจคาบล็อกและกิจกรรมของครูหรือห้องในกลุ่มนี้ แล้วเลือกคาบที่จะปลดล็อค ระบบจะไม่เปลี่ยนคาบล็อคให้เอง',
      ] }]
  }
  return []
}
