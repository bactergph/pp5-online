import type { PlannedLesson, PlannedSlot, SchedulePlan } from './schedule-planning'
import type { PeriodTimeRow } from './schedule-helpers'

type Block = { cells: number[]; day: number; morning: boolean }
type Choice = Block & { keys: number[] }
type Task = { members: PlannedLesson[]; length: number; resources: number[]; options: Choice[]; priority: number }
type Attempt = { status: 'complete' | 'timeout'; assignments: PlannedSlot[]; nodes: number }

/** Bounded ejection search. Move whole lesson blocks, evicting their conflicting
 * blocks for reinsertion. Fixed cells and unavailable times never enter a domain.
 * Unlike chronological backtracking, flexible activities and subjects can repair
 * one another, without enumerating every activity timetable first. */
export function solveBlockRepair(
  lessons: PlannedLesson[], fixed: PlannedSlot[], plan: SchedulePlan, times: PeriodTimeRow[],
  unavailable: { teacherId: string; day: number; period: number }[],
  priority: (lesson: PlannedLesson) => number, maxNodes: number, timeLimitMs: number,
): Attempt | null {
  const deadline = Date.now() + timeLimitMs
  // Gap/continuous-period preferences keep their existing ranking solver.
  if (maxNodes <= 0 || timeLimitMs <= 0 || plan.reduceGaps || plan.maxContinuous !== 0) return null
  const teachers = (lesson: PlannedLesson) => lesson.teacherIds ?? (lesson.teacherId ? [lesson.teacherId] : [])
  const byId = new Map(lessons.map(lesson => [lesson.id, lesson]))
  const cells = plan.days.flatMap(day => times.filter(time => !time.is_break).map(time => ({ day, period: time.period })))
  const width = cells.length
  if (!width) return null
  const index = new Map(cells.map((cell, i) => [`${cell.day}:${cell.period}`, i]))
  const resources = new Map<string, number>()
  const resource = (key: string) => {
    let value = resources.get(key)
    if (value === undefined) { value = resources.size; resources.set(key, value) }
    return value
  }
  const lessonResources = new Map(lessons.map(lesson => [lesson.id, [...new Set([
    resource(`class:${lesson.classroomId}`), ...teachers(lesson).map(id => resource(`teacher:${id}`)),
    ...(lesson.roomId ? [resource(`venue:${lesson.roomId}`)] : []),
  ])]]))
  const hard = new Set<number>(), retained = new Map<string, number>()
  for (const row of fixed) {
    const slot = index.get(`${row.day}:${row.period}`), lesson = row.lessonId ? byId.get(row.lessonId) : undefined
    if (slot === undefined) return null
    for (const id of lesson ? lessonResources.get(lesson.id)! : [resource(`class:${row.classroomId}`)]) hard.add(id * width + slot)
    if (lesson) retained.set(lesson.id, (retained.get(lesson.id) || 0) + 1)
  }
  for (const block of unavailable) {
    const slot = index.get(`${block.day}:${block.period}`)
    if (slot !== undefined) hard.add(resource(`teacher:${block.teacherId}`) * width + slot)
  }
  const domains = new Map<number, Block[]>()
  const lunch = times.findIndex(time => time.is_break)
  for (const length of new Set(lessons.flatMap(lesson => lesson.pattern || [1]))) {
    const choices: Block[] = []
    for (const day of plan.days) for (let i = 0; i < times.length; i++) {
      const block = times.slice(i, i + length)
      if (block.length !== length || block.some(time => time.is_break)
        || block.some((time, j) => j > 0 && block[j - 1].end_time !== time.start_time)) continue
      choices.push({ cells: block.map(time => index.get(`${day}:${time.period}`)!), day,
        morning: lunch >= 0 ? i < lunch : i < Math.ceil(times.filter(time => !time.is_break).length / 2) })
    }
    domains.set(length, choices)
  }
  const tasks: Task[] = [], groups = new Map<string, PlannedLesson[]>()
  const add = (members: PlannedLesson[], length: number) => {
    tasks.push({ members, length, resources: [...new Set(members.flatMap(lesson => lessonResources.get(lesson.id)!))],
      options: [], priority: members.reduce((sum, lesson) => sum + priority(lesson), 0) })
  }
  for (const lesson of lessons) {
    if (lesson.fixedOnly || lesson.count === 0) continue
    if (lesson.activity) { const id = lesson.activityGroupId || lesson.id; groups.set(id, [...groups.get(id) || [], lesson]); continue }
    const pattern = lesson.pattern || Array(lesson.count).fill(1), kept = retained.get(lesson.id) || 0
    // Completing a partially locked double needs the exact block-cover search.
    // Leave that case to the existing solver rather than silently splitting it.
    if (kept && pattern.some(length => length > 1)) return null
    for (const length of pattern.slice(kept)) add([lesson], length)
  }
  for (const members of groups.values()) {
    if (members.some(lesson => retained.has(lesson.id) || lesson.count !== members[0].count)) return null
    for (let i = 0; i < members[0].count; i++) add(members, 1)
  }
  for (const task of tasks) {
    task.options = (domains.get(task.length) || []).flatMap(block => {
      const keys = task.resources.flatMap(id => block.cells.map(slot => id * width + slot))
      return keys.some(key => hard.has(key)) ? [] : [{ ...block, keys }]
    })
    if (!task.options.length) return null
  }
  if (!tasks.length) return { status: 'complete', assignments: [], nodes: 0 }

  const occupancy = new Int32Array(resources.size * width).fill(-1)
  const placed = new Int32Array(tasks.length).fill(-1), removed = new Int32Array(tasks.length)
  const last = new Int32Array(tasks.length).fill(-1000), pending = new Set(tasks.map((_, i) => i))
  const dayUse = new Map<string, number>()
  let state = 1, nodes = 0
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 }
  const place = (id: number, option: number, add: boolean) => {
    const choice = tasks[id].options[option]
    for (const key of choice.keys) occupancy[key] = add ? id : -1
    for (const lesson of tasks[id].members) {
      const key = `${lesson.id}:${choice.day}`
      dayUse.set(key, (dayUse.get(key) || 0) + (add ? 1 : -1))
    }
    placed[id] = add ? option : -1
  }
  while (pending.size && nodes < maxNodes && Date.now() < deadline) {
    let id = -1, rank = -Infinity
    for (const candidate of pending) {
      const task = tasks[candidate]
      const score = task.length * 1000 + task.resources.length * 20 + removed[candidate] * 10 - task.options.length + random()
      if (score > rank) { rank = score; id = candidate }
    }
    const task = tasks[id]
    let option = -1, best = Infinity, evictions: number[] = []
    for (let i = 0; i < task.options.length; i++) {
      const choice = task.options[i], blocked = new Set<number>()
      for (const key of choice.keys) if (occupancy[key] >= 0) blocked.add(occupancy[key])
      let cost = 0
      for (const old of blocked) cost += (1 + removed[old]) * tasks[old].length * 1.5 + (nodes - last[old] < 8 ? 10 : 0)
      // Preferences only rank legal choices; neither morning nor spread can
      // override a collision, lunch boundary, or fixed reservation.
      cost += (choice.morning ? -1 : 1) * task.priority * .03
      cost += task.members.reduce((sum, lesson) => sum + (lesson.spread ? dayUse.get(`${lesson.id}:${choice.day}`) || 0 : 0), 0) * .04
      cost += random() * .7
      if (cost < best) { best = cost; option = i; evictions = [...blocked] }
    }
    for (const old of evictions) { place(old, placed[old], false); removed[old]++; pending.add(old) }
    place(id, option, true); last[id] = nodes++; pending.delete(id)
  }
  if (pending.size) return { status: 'timeout', assignments: [], nodes }
  const assignments = tasks.flatMap((task, id) => task.members.flatMap(lesson => task.options[placed[id]].cells.map(slot => ({
    classroomId: lesson.classroomId, lessonId: lesson.id, ...cells[slot],
  }))))
  return { status: 'complete', assignments, nodes }
}
