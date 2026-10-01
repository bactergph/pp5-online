export type Lesson = { id: string; classroomId: string; teacherId: string | null; count: number; label: string; teacherOptional?: boolean }
export type Placement = { classroomId: string; lessonId: string | null; day: number; period: number }

/** Bounded backtracking across all rooms. Never returns a partial timetable as success. */
export function solveSchoolSchedule(lessons: Lesson[], fixed: Placement[], maxNodes = 150000) {
  const deadline = Date.now() + 8000
  const byId = new Map(lessons.map(l => [l.id, l]))
  const occupied = new Set<string>()
  const busy = new Set<string>()
  const used = new Map<string, number>()
  const daily = new Map<string, number>()
  const result: Placement[] = []
  const roomKey = (room: string, slot: number) => `${room}:${slot}`
  for (const p of fixed) {
    const slot = (p.day - 1) * 6 + p.period - 1
    if (!Number.isInteger(p.day) || !Number.isInteger(p.period) || slot < 0 || slot >= 30 || p.period < 1 || p.period > 6) return { error: 'พบคาบเดิมนอกช่วงจันทร์–ศุกร์ คาบ 1–6', assignments: [] }
    const key = roomKey(p.classroomId, slot)
    if (occupied.has(key)) return { error: 'พบคาบห้องเรียนซ้ำ', assignments: [] }
    occupied.add(key)
    const l = p.lessonId ? byId.get(p.lessonId) : undefined
    if (p.lessonId && !l) return { error: 'ไม่พบรายวิชาหรือกิจกรรมของคาบเดิม', assignments: [] }
    if (l) {
      if (l.classroomId !== p.classroomId) return { error: 'รายวิชาของคาบเดิมไม่ตรงกับห้องเรียน', assignments: [] }
      if (!l.teacherId && !l.teacherOptional) return { error: `${l.label}: ยังไม่กำหนดครูผู้สอน`, assignments: [] }
      const t = roomKey(l.teacherId || `activity:${l.id}`, slot)
      if (busy.has(t)) return { error: 'คาบเดิมที่เก็บไว้มีครูสอนชนกัน กรุณาปลดล็อกหรือแก้คาบที่ชนก่อน', assignments: [] }
      busy.add(t)
      used.set(l.id, (used.get(l.id) || 0) + 1)
      daily.set(`${l.id}:${p.day}`, (daily.get(`${l.id}:${p.day}`) || 0) + 1)
    }
  }
  const remaining = lessons.map(l => Math.max(0, l.count - (used.get(l.id) || 0)))
  for (const [i, l] of lessons.entries()) {
    if (!Number.isInteger(l.count) || l.count < 0 || l.count > 30) return { error: `${l.label}: จำนวนคาบไม่ถูกต้อง`, assignments: [] }
    if (remaining[i] && !l.teacherId && !l.teacherOptional) return { error: `${l.label}: ยังไม่กำหนดครูผู้สอน`, assignments: [] }
    if ((used.get(l.id) || 0) > l.count) return { error: `${l.label}: คาบเดิมเกินโควต้า กรุณาจัดใหม่หรือปรับโควต้า`, assignments: [] }
  }
  for (const room of new Set(lessons.map(l => l.classroomId))) {
    const need = lessons.reduce((n, l, i) => n + (l.classroomId === room ? remaining[i] : 0), 0)
    const free = Array.from({ length: 30 }, (_, s) => s).filter(s => !occupied.has(roomKey(room, s))).length
    if (need > free) return { error: `ห้อง ${lessons.find(l => l.classroomId === room)?.label.split(' · ')[0] || room}: ต้องจัดอีก ${need} คาบ แต่เหลือ ${free} ช่อง`, assignments: [] }
  }
  for (const teacher of new Set(lessons.map(l => l.teacherId).filter(Boolean))) {
    const need = lessons.reduce((n, l, i) => n + (l.teacherId === teacher ? remaining[i] : 0), 0)
    const free = Array.from({ length: 30 }, (_, s) => s).filter(s => !busy.has(roomKey(teacher!, s))).length
    if (need > free) return { error: `ครูของ ${lessons.find(l => l.teacherId === teacher)?.label}: ต้องสอนอีก ${need} คาบ แต่มีเวลาว่าง ${free} คาบ`, assignments: [] }
  }
  let nodes = 0
  let timedOut = false
  const minimumSlot = lessons.map(() => 0)
  let lastPeriodLimit = 0
  let lastPeriodsUsed = 0
  const rooms = [...new Set(lessons.map(l => l.classroomId))]
  function requiredLastPeriods() {
    return rooms.reduce((total, room) => {
      const need = lessons.reduce((n,l,i) => n + (l.classroomId === room ? remaining[i] : 0),0)
      let free = 0
      for (let s=0;s<30;s++) if(s%6!==5 && !occupied.has(roomKey(room,s))) free++
      return total + Math.max(0,need-free)
    },0)
  }
  function search(): boolean {
    if (++nodes > maxNodes) return false
    if (nodes % 256 === 0 && Date.now() > deadline) { timedOut = true; return false }
    if (lastPeriodsUsed + requiredLastPeriods() > lastPeriodLimit) return false
    let best = -1
    let candidates: number[] = []
    let slack = Infinity
    for (let i = 0; i < lessons.length; i++) {
      if (!remaining[i]) continue
      const l = lessons[i]
      const slots: number[] = []
      for (let s = minimumSlot[i]; s < 30; s++) {
        if ((s % 6 !== 5 || lastPeriodsUsed < lastPeriodLimit) && !occupied.has(roomKey(l.classroomId, s)) && !busy.has(roomKey(l.teacherId || `activity:${l.id}`, s))) slots.push(s)
      }
      if (slots.length < remaining[i]) return false
      const diff = slots.length - remaining[i]
      if (diff < slack || (diff === slack && remaining[i] > (remaining[best] || 0))) {
        best = i; candidates = slots; slack = diff
      }
    }
    if (best < 0) return true
    const l = lessons[best]
    // Prefer different weekdays; minimumSlot removes permutations of identical lessons.
    candidates.sort((a, b) => Number(a % 6 === 5) - Number(b % 6 === 5) || (daily.get(`${l.id}:${Math.floor(a / 6) + 1}`) || 0) - (daily.get(`${l.id}:${Math.floor(b / 6) + 1}`) || 0) || a % 6 - b % 6 || a - b)
    for (const slot of candidates) {
      const day = Math.floor(slot / 6) + 1
      const dk = `${l.id}:${day}`
      const oldMin = minimumSlot[best]
      minimumSlot[best] = slot + 1
      occupied.add(roomKey(l.classroomId, slot)); busy.add(roomKey(l.teacherId || `activity:${l.id}`, slot))
      daily.set(dk, (daily.get(dk) || 0) + 1); remaining[best]--
      if (slot % 6 === 5) lastPeriodsUsed++
      result.push({ classroomId: l.classroomId, lessonId: l.id, day, period: slot % 6 + 1 })
      if (search()) return true
      if (slot % 6 === 5) lastPeriodsUsed--
      result.pop(); remaining[best]++; minimumSlot[best] = oldMin
      daily.set(dk, daily.get(dk)! - 1)
      occupied.delete(roomKey(l.classroomId, slot)); busy.delete(roomKey(l.teacherId || `activity:${l.id}`, slot))
      if (nodes > maxNodes || timedOut) break
    }
    return false
  }
  let solved = false
  const maximumLastPeriods = rooms.length * 5
  for (lastPeriodLimit = requiredLastPeriods(); lastPeriodLimit <= maximumLastPeriods; lastPeriodLimit++) {
    if (search()) { solved = true; break }
    if (nodes > maxNodes || timedOut) break
  }
  if (!solved) return { error: nodes > maxNodes || timedOut ? 'ค้นหาตารางครบตามเงื่อนไขไม่ทัน กรุณาลดคาบที่ล็อกแล้วลองใหม่ (ยังไม่เปลี่ยนตารางเดิม)' : 'จัดตารางครบโดยครูไม่ชนกันไม่ได้ กรุณาตรวจครูผู้สอนและคาบที่ล็อก (ยังไม่เปลี่ยนตารางเดิม)', assignments: [] }
  return { error: undefined, assignments: result }
}
