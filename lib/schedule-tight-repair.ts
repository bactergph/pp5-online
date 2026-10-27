import type { PlannedLesson, PlannedSlot } from './schedule-planning'

type Choice = { cells: number[]; keys: number[]; day: number; morning: boolean }
type Task = { members: PlannedLesson[]; length: number; resources: number[]; options: Choice[]; priority: number }
type Unit = { task: Task; remaining: number; banned: Set<number>; chosen: Choice[] }
type Candidate = { unit: Unit; option: Choice }
export type TightRepairResult = { status: 'complete' | 'conflict' | 'timeout'; assignments: PlannedSlot[]; nodes: number; message?: string; details?: string[] }

/** Exact search for small single-period remainders. A resource whose remaining
 * demand fills every available cell must occupy all those cells. Branching on
 * these cells catches forced conflicts before the ordinary ejection search can
 * cycle for its full budget. Retained doubles have already been removed. */
export function solveTightSingles(tasks: Task[], cells: { day: number; period: number }[], resourceNames: Map<number, string>, maxNodes: number, deadline: number): TightRepairResult {
  const units: Unit[] = [], grouped = new Map<string, Unit>()
  for (const task of tasks) {
    const key = JSON.stringify(task.members.map(lesson => lesson.id))
    let unit = grouped.get(key)
    if (!unit) { unit = { task, remaining: 0, banned: new Set(), chosen: [] }; grouped.set(key, unit); units.push(unit) }
    unit.remaining++
  }
  const used = new Set<number>()
  let nodes = 0, limited = false, failure = ''
  function search(): boolean {
    if (nodes >= maxNodes || Date.now() >= deadline) { limited = true; return false }
    nodes++
    let best: Candidate[] | null = null
    const resources = new Map<number, { need: number; slots: Map<number, Candidate[]> }>()
    for (const unit of units) {
      if (!unit.remaining) continue
      const options = unit.task.options.flatMap((option, i) => unit.banned.has(i) || option.keys.some(key => used.has(key)) ? [] : [{ unit, option }])
      if (options.length < unit.remaining) { failure = `${unit.task.members.map(lesson => lesson.label).join(' / ')} ต้องใช้อีก ${unit.remaining} คาบ แต่เหลือช่องที่ลงได้ ${options.length} ช่อง`; return false }
      if (!best || options.length < best.length) best = options
      for (const id of unit.task.resources) {
        let resource = resources.get(id)
        if (!resource) { resource = { need: 0, slots: new Map() }; resources.set(id, resource) }
        resource.need += unit.remaining
        for (const item of options) { const cell = item.option.cells[0], entries = resource.slots.get(cell) || []; entries.push(item); resource.slots.set(cell, entries) }
      }
    }
    if (!best) return true
    for (const [id, resource] of resources) {
      if (resource.slots.size < resource.need) { failure = `${resourceNames.get(id) || 'ทรัพยากรร่วม'} ต้องใช้อีก ${resource.need} คาบ แต่เหลือช่องที่ลงได้ ${resource.slots.size} ช่อง`; return false }
      if (resource.slots.size === resource.need) for (const options of resource.slots.values()) if (options.length < best.length) best = options
    }
    const score = ({ unit, option }: Candidate) => (option.morning ? -1 : 1) * unit.task.priority + unit.chosen.filter(choice => choice.day === option.day).length * .1 + option.cells[0] / 1000
    best.sort((a, b) => score(a) - score(b))
    const oneUnit = best.every(item => item.unit === best![0].unit), bans: [Unit, number][] = []
    for (const { unit, option } of best) {
      unit.remaining--; unit.chosen.push(option); option.keys.forEach(key => used.add(key))
      if (search()) return true
      option.keys.forEach(key => used.delete(key)); unit.chosen.pop(); unit.remaining++
      if (limited) break
      // If branching on an offering, choose its first selected option. This
      // removes permutations of identical weekly periods without losing subsets.
      if (oneUnit) { const index = unit.task.options.indexOf(option); unit.banned.add(index); bans.push([unit, index]) }
    }
    for (const [unit, index] of bans) unit.banned.delete(index)
    return false
  }
  if (search()) return { status: 'complete', assignments: units.flatMap(unit => unit.chosen.flatMap(option => unit.task.members.map(lesson => ({ classroomId: lesson.classroomId, lessonId: lesson.id, ...cells[option.cells[0]] })))), nodes }
  return { status: limited ? 'timeout' : 'conflict', assignments: [], nodes,
    message: limited ? undefined : 'คาบล็อก กิจกรรม และเวลาว่างที่กำหนดไม่มีช่องร่วมพอสำหรับรายวิชาที่เหลือ',
    details: !limited && failure ? [`จุดขัดกันที่พบระหว่างตรวจเงื่อนไข: ${failure}`, 'ตรวจคาบล็อกและกิจกรรมของห้องหรือครูที่เกี่ยวข้อง แล้วเลือกเวลาสอนรวมใหม่'] : undefined }
}
