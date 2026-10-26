import type { Preparation } from './schedule-preparation'
import type { LessonRule, SchedulePlan } from './schedule-planning'
import {teachingEventAt} from './schedule-joint-teaching'

export type SchedulePlace = { id: string; name: string }
export type SchedulePlaceChange =
  | { kind: 'add'; place: SchedulePlace }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'remove'; id: string; replacementId: string | null }
  | { kind: 'assign'; lessonId: string; placeId: string | null; place?: SchedulePlace }

export const normalizePlaceName = (name: string) => name.replace(/\s+/g, ' ').trim().toLocaleLowerCase('th')
export function lessonPlaceId(data: Preparation, lesson: Preparation['lessons'][number]) {
  const rule = data.plan.rules[lesson.id]
  if (rule) return rule.roomId
  return lesson.roomId || data.plan.rooms.find(place => normalizePlaceName(place.name) === normalizePlaceName(lesson.roomName || ''))?.id || null
}
export function placeReferences(data: Preparation, id: string) {
  return new Set([...Object.entries(data.plan.rules).filter(([, rule]) => rule.roomId === id).map(([lessonId]) => lessonId), ...data.lessons.filter(lesson => lessonPlaceId(data, lesson) === id).map(lesson => lesson.id)])
}

/** A venue edit cannot change teachers, quotas, sessions, activities or timetable cells. */
export function applySchedulePlaceChange(data: Preparation, change: SchedulePlaceChange): SchedulePlan {
  if (!change || !['add', 'rename', 'remove', 'assign'].includes(change.kind)) throw Error('คำสั่งแก้สถานที่ไม่ถูกต้อง')
  const plan: SchedulePlan = { ...data.plan, rooms: data.plan.rooms.map(place => ({ ...place })), rules: { ...data.plan.rules } }
  const changed = new Set<string>()
  const name = (value: string, except?: string) => {
    if (typeof value !== 'string') throw Error('กรุณาระบุชื่อสถานที่')
    const trimmed = value.replace(/\s+/g, ' ').trim()
    if (!trimmed || trimmed.length > 100) throw Error('ชื่อสถานที่ต้องมี 1–100 ตัวอักษร')
    if (plan.rooms.some(place => place.id !== except && normalizePlaceName(place.name) === normalizePlaceName(trimmed))) throw Error('มีสถานที่ชื่อนี้อยู่แล้ว กรุณาเลือกจากรายการเดิม')
    return trimmed
  }
  const add = (place: SchedulePlace) => {
    if (!place || typeof place.id !== 'string' || !/^[-0-9a-f]{36}$/i.test(place.id) || plan.rooms.some(item => item.id === place.id)) throw Error('รหัสสถานที่ใหม่ไม่ถูกต้องหรือซ้ำ')
    if (plan.rooms.length >= 500) throw Error('เพิ่มสถานที่ได้สูงสุด 500 แห่ง')
    plan.rooms.push({ id: place.id, name: name(place.name) })
  }
  const setVenue = (lesson: Preparation['lessons'][number], id: string | null) => {
    const old = plan.rules[lesson.id]
    const count = old?.count ?? lesson.count
    if (!Number.isInteger(count) || count < 1 || count > 40) throw Error(`${lesson.label}: กำหนดจำนวนคาบต่อสัปดาห์ก่อนเลือกสถานที่`)
    const rule: LessonRule = old || { count, pattern: lesson.pattern?.length ? [...lesson.pattern] : Array(count).fill(1), roomId: null, morning: !!lesson.morning, spread: lesson.spread ?? true, timePreference: lesson.timePreference }
    plan.rules[lesson.id] = { ...rule, roomId: id }
    if (lessonPlaceId(data, lesson) !== id) changed.add(lesson.id)
  }
  if (change.kind === 'add') add(change.place)
  else if (change.kind === 'rename') {
    const place = plan.rooms.find(place => place.id === change.id)
    if (!place) throw Error('ไม่พบสถานที่นี้ กรุณาโหลดข้อมูลล่าสุด')
    place.name = name(change.name, place.id)
  } else if (change.kind === 'assign') {
    const lesson = data.lessons.find(lesson => lesson.id === change.lessonId && !lesson.activity && data.classrooms.some(room => room.id === lesson.classroomId))
    if (!lesson) throw Error('ไม่พบรายวิชาในภาคเรียนนี้')
    if (change.place) {
      if (change.place.id !== change.placeId) throw Error('รหัสสถานที่ไม่ตรงกัน')
      add(change.place)
    }
    if (change.placeId !== null && !plan.rooms.some(place => place.id === change.placeId)) throw Error('ไม่พบสถานที่ที่เลือก')
    setVenue(lesson, change.placeId)
  } else {
    if (!plan.rooms.some(place => place.id === change.id)) throw Error('ไม่พบสถานที่นี้ กรุณาโหลดข้อมูลล่าสุด')
    if (change.replacementId && (change.replacementId === change.id || !plan.rooms.some(place => place.id === change.replacementId))) throw Error('เลือกสถานที่ทดแทนที่ต่างจากสถานที่เดิม')
    if (placeReferences(data, change.id).size && !change.replacementId) throw Error('สถานที่นี้ยังมีรายวิชาใช้งาน กรุณาเลือกสถานที่ทดแทนก่อนลบ')
    for (const [id, rule] of Object.entries(plan.rules)) if (rule.roomId === change.id) { plan.rules[id] = { ...rule, roomId: change.replacementId }; changed.add(id) }
    for (const lesson of data.lessons) if (!plan.rules[lesson.id] && lessonPlaceId(data, lesson) === change.id) setVenue(lesson, change.replacementId)
    plan.rooms = plan.rooms.filter(place => place.id !== change.id)
  }
  // Check only newly introduced venue collisions; unrelated teacher/input warnings
  // must not prevent repairing a location. The database also validates at commit.
  const occupied = new Map<string, { lesson: Preparation['lessons'][number]; oldVenue: string | null }[]>()
  const lessons = new Map(data.lessons.map(lesson => [lesson.id, lesson]))
  for (const slot of data.slots) {
    const id = slot.class_subject_id || (slot.activity_id ? `activity:${slot.activity_id}` : '')
    const lesson = lessons.get(id)
    if (!lesson) continue
    const oldVenue = lessonPlaceId(data, lesson), venue = plan.rules[id]?.roomId ?? (plan.rules[id] ? null : oldVenue)
    if (!venue) continue
    const key = `${venue}:${slot.day_of_week}:${slot.period}`, peers = occupied.get(key) || []
    for (const peer of peers) {
      if (peer.lesson.classroomId === lesson.classroomId || teachingEventAt(lesson,slot.day_of_week,slot.period)===teachingEventAt(peer.lesson,slot.day_of_week,slot.period)) continue
      if (!(changed.has(id) || changed.has(peer.lesson.id)) || oldVenue === venue && peer.oldVenue === venue) continue
      const day = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'][slot.day_of_week] || String(slot.day_of_week)
      throw Error(`${plan.rooms.find(place => place.id === venue)?.name || 'สถานที่'} ชนวัน${day} คาบ ${slot.period}\n${peer.lesson.label} กับ ${lesson.label}\nกรุณาเลือกสถานที่อื่น หรือย้ายคาบที่ชนก่อน`)
    }
    peers.push({ lesson, oldVenue }); occupied.set(key, peers)
  }
  return plan
}
