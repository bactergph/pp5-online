import type { PlannedLesson, PlannedSlot } from './schedule-planning'
import type { PeriodTimeRow } from './schedule-helpers'

/** A preference between related courses, never a feasibility constraint. Language
 * names take precedence over the broad foreign-language subject group. */
export function subjectFamily(lesson: PlannedLesson): string | null {
  if (lesson.activity || lesson.fixedOnly) return null
  const name = `${lesson.fullName || ''} ${lesson.name || ''}`.toLowerCase()
  for (const [family, pattern] of [
    ['english', /อังกฤษ|\benglish\b/], ['chinese', /จีน|\bchinese\b/],
    ['japanese', /ญี่ปุ่น|\bjapanese\b/], ['french', /ฝรั่งเศส|\bfrench\b/],
    ['math', /คณิต|\bmath(?:ematics|s)?\b/], ['thai', /ภาษาไทย|\bthai\b/],
  ] as const) if (pattern.test(name)) return family
  const group = (lesson.subjectGroup || '').trim().toLowerCase()
  if (/คณิต|mathematics/.test(group)) return 'math'
  if (/ภาษาไทย/.test(group)) return 'thai'
  // An unspecified foreign-language group must not conflate different languages.
  return group && !/ภาษาต่างประเทศ|foreign/.test(group) ? `group:${group}` : null
}

/** Bounded quality pass after a complete solution. Move only single-period day
 * blocks within the same session, so morning priorities and teacher session
 * balance remain intact. Doubles, joint teaching, activities and locks stay put.
 * When no legal improvement exists the complete timetable is returned as-is. */
export function spreadSubjectFamilies(
  lessons: PlannedLesson[], fixed: PlannedSlot[], assignments: PlannedSlot[], days: number[],
  times: PeriodTimeRow[], unavailable: { teacherId: string; day: number; period: number }[],
  preferences: { reduceGaps?: boolean; maxContinuous?: number } = {},
): PlannedSlot[] {
  const byId = new Map(lessons.map(lesson => [lesson.id, lesson]))
  const families = new Map(lessons.map(lesson => [lesson.id, subjectFamily(lesson)]))
  const familyMembers = new Map<string, Set<string>>()
  for (const lesson of lessons) {
    const family = families.get(lesson.id)
    if (!family) continue
    const key = `${lesson.classroomId}:${family}`, members = familyMembers.get(key) || new Set<string>()
    members.add(lesson.id); familyMembers.set(key, members)
  }
  if (![...familyMembers.values()].some(members => members.size > 1)) return assignments
  const result = assignments.map(row => ({ ...row }))
  const key = (id: string, day: number, period: number) => `${id}:${day}:${period}`
  const teachersOf = (lesson: PlannedLesson) => lesson.teacherIds ?? (lesson.teacherId ? [lesson.teacherId] : [])
  const occupied = new Map<string, PlannedSlot>(), teachers = new Map<string, Set<PlannedSlot>>()
  const venues = new Map<string, Set<PlannedSlot>>(), lessonDays = new Map<string, number>()
  const familyDays = new Map<string, Map<string, number>>()
  const familyKey = (lesson: PlannedLesson, day: number) => `${lesson.classroomId}:${families.get(lesson.id)}:${day}`
  const retained = new Set(fixed.map(row => key(row.classroomId, row.day, row.period)))
  const blocked = new Set(unavailable.map(row => key(row.teacherId, row.day, row.period)))
  const register = (row: PlannedSlot, add: boolean) => {
    const position = key(row.classroomId, row.day, row.period)
    if (add) occupied.set(position, row); else occupied.delete(position)
    const lesson = row.lessonId ? byId.get(row.lessonId) : undefined
    if (!lesson) return
    const dayKey = key(lesson.id, row.day, 0)
    lessonDays.set(dayKey, (lessonDays.get(dayKey) || 0) + (add ? 1 : -1))
    if (families.get(lesson.id)) {
      const family = familyKey(lesson, row.day), counts = familyDays.get(family) || new Map<string, number>()
      const count = (counts.get(lesson.id) || 0) + (add ? 1 : -1)
      if (count) counts.set(lesson.id, count); else counts.delete(lesson.id)
      familyDays.set(family, counts)
    }
    for (const [map, id] of [...teachersOf(lesson).map(id => [teachers, id] as const), [venues, lesson.roomId] as const]) {
      if (!id) continue
      const k = key(id, row.day, row.period), rows = map.get(k) || new Set<PlannedSlot>()
      if (add) rows.add(row); else rows.delete(row)
      if (rows.size) map.set(k, rows); else map.delete(k)
    }
  }
  for (const row of [...fixed, ...result]) register(row, true)
  // Count competing course blocks, not every period of an intentional double.
  const penalty = (counts: Map<string, number>) => {
    const values = [...counts.values()]; let total = 0
    for (let a = 0; a < values.length; a++) for (let b = a + 1; b < values.length; b++) {
      if (values[a] === 1 || values[b] === 1) total++
    }
    return total
  }
  const movable = (row: PlannedSlot) => {
    const lesson = row.lessonId ? byId.get(row.lessonId) : undefined
    return !!lesson && !lesson.activity && !lesson.fixedOnly && !lesson.activityGroupId &&
      !Object.keys(lesson.jointTeachingCells || {}).length && !retained.has(key(row.classroomId, row.day, row.period)) &&
      lessonDays.get(key(lesson.id, row.day, 0)) === 1 && (!lesson.pattern || lesson.pattern.includes(1))
  }
  const available = (lesson: PlannedLesson, day: number, period: number, ignore: Set<PlannedSlot>) =>
    teachersOf(lesson).every(id => !blocked.has(key(id, day, period)) &&
      ![...teachers.get(key(id, day, period)) || []].some(row => !ignore.has(row))) &&
    (!lesson.roomId || ![...venues.get(key(lesson.roomId, day, period)) || []].some(row => !ignore.has(row)))
  const lunch = times.findIndex(time => time.is_break), teaching = times.filter(time => !time.is_break)
  const morning = new Set((lunch < 0 ? teaching.slice(0, Math.ceil(teaching.length / 2)) : times.slice(0, lunch)).map(time => time.period))
  const cells = days.flatMap(day => teaching.map(time => ({ day, period: time.period })))
  const dayStats = (teacher: string, day: number, changes: Map<PlannedSlot, { day: number; period: number }>) => {
    let first = -1, last = -1, count = 0, run = 0, longest = 0, index = 0
    for (const time of times) {
      if (time.is_break) { run = 0; continue }
      const busy = [...teachers.get(key(teacher, day, time.period)) || []].some(row => !changes.has(row)) ||
        [...changes].some(([row, next]) => next.day === day && next.period === time.period && teachersOf(byId.get(row.lessonId!)!).includes(teacher))
      if (busy) { if (first < 0) first = index; last = index; count++; longest = Math.max(longest, ++run) } else run = 0
      index++
    }
    return { gaps: first < 0 ? 0 : last - first + 1 - count, longest }
  }
  const deadline = Date.now() + 150
  for (let pass = 0; pass < 3; pass++) {
    let improved = false
    for (const row of result) {
      if (Date.now() >= deadline) return result
      if (!movable(row)) continue
      const lesson = byId.get(row.lessonId!)!
      if (!families.get(lesson.id) || !penalty(familyDays.get(familyKey(lesson, row.day)) || new Map())) continue
      let best: { other?: PlannedSlot; destination: { day: number; period: number } } | undefined, bestDelta = 0
      for (const destination of cells) {
        if (Date.now() >= deadline) break
        if (destination.day === row.day || morning.has(destination.period) !== morning.has(row.period) ||
          retained.has(key(row.classroomId, destination.day, destination.period)) ||
          (lessonDays.get(key(lesson.id, destination.day, 0)) || 0) > 0) continue
        const other = occupied.get(key(row.classroomId, destination.day, destination.period))
        if (other && (!movable(other) || (lessonDays.get(key(other.lessonId!, row.day, 0)) || 0) > 0)) continue
        const otherLesson = other ? byId.get(other.lessonId!)! : undefined, ignore = new Set(other ? [row, other] : [row])
        if (!available(lesson, destination.day, destination.period, ignore) || otherLesson && !available(otherLesson, row.day, row.period, ignore)) continue
        const changes = new Map<PlannedSlot, { day: number; period: number }>([[row, destination]])
        if (other) changes.set(other, { day: row.day, period: row.period })
        const counts = new Map<string, Map<string, number>>()
        for (const [changed, next] of changes) {
          const subject = byId.get(changed.lessonId!)!
          if (!families.get(subject.id)) continue
          for (const [day, delta] of [[changed.day, -1], [next.day, 1]]) {
            const k = familyKey(subject, day), value = counts.get(k) || new Map(familyDays.get(k) || [])
            const n = (value.get(subject.id) || 0) + delta
            if (n) value.set(subject.id, n); else value.delete(subject.id)
            counts.set(k, value)
          }
        }
        let delta = 0
        for (const [k, value] of counts) delta += penalty(value) - penalty(familyDays.get(k) || new Map())
        if (delta >= bestDelta) continue
        let worse = false
        if (preferences.reduceGaps || preferences.maxContinuous) {
          for (const teacher of new Set([...teachersOf(lesson), ...(otherLesson ? teachersOf(otherLesson) : [])])) for (const day of [row.day, destination.day]) {
            const before = dayStats(teacher, day, new Map()), after = dayStats(teacher, day, changes)
            if (preferences.reduceGaps && after.gaps > before.gaps || preferences.maxContinuous &&
              Math.max(0, after.longest - preferences.maxContinuous) > Math.max(0, before.longest - preferences.maxContinuous)) worse = true
          }
        }
        if (!worse) { best = { other, destination }; bestDelta = delta }
      }
      if (best) {
        const previous = { day: row.day, period: row.period }, other = best.other
        register(row, false); if (other) register(other, false)
        row.day = best.destination.day; row.period = best.destination.period
        if (other) { other.day = previous.day; other.period = previous.period }
        register(row, true); if (other) register(other, true)
        improved = true
      }
    }
    if (!improved) break
  }
  return result
}
