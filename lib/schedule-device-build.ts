import { verifyCompleteSchedule } from './schedule-verification'
import { activityTeachers } from './schedule-activity-teams'
import { validatePeriodTimes, type PeriodTimeRow } from './schedule-helpers'
import { checkPlanning, lessonPrefersMorning, solvePlannedSchedule, type PlannedScheduleResult, type PlanningIssue, type SchedulePlan } from './schedule-planning'

export type DeviceSlot = {
  classroom_id: string
  academic_year_id: string
  day_of_week: number
  period: number
  class_subject_id: string | null
  activity_id: string | null
  note: string | null
  locked: boolean
}
export type DeviceOffering = { id: string; classroom_id: string; evaluation_setting_id: string }
export type DeviceLesson = {
  id: string
  classroomId: string
  teacherId: string | null
  count: number
  label: string
  activity?: boolean
  teacherOptional?: boolean
  pattern?: number[]
  roomName?: string
  roomId?: string | null
  subjectId?: string
  name?: string
  fullName?: string
  subjectGroup?: string
  teacherName?: string
  teacherIds?: string[]
  activityGroupId?: string
  code?: string
  spread?: boolean
  selectable?: boolean
  sourceHours?: number
  fixedOnly?: boolean
  preferMorning?: boolean
  morning?: boolean
}
export type DeviceSnapshot = {
  hash: string
  plan: SchedulePlan
  periods: PeriodTimeRow[]
  timesConfigured: boolean
  classrooms: { id: string; level: string; room: number }[]
  lessons: DeviceLesson[]
  slots: DeviceSlot[]
  blocks: { teacherId: string; day: number; period: number }[]
  activities: { id: string; label: string }[]
  teachers: { id: string; prefix?: string | null; full_name: string }[]
}
export type DeviceDraft = {
  status: 'invalid' | 'complete' | 'timeout' | 'conflict'
  issues: PlanningIssue[]
  rows: DeviceSlot[]
  offerings: DeviceOffering[]
  unlock: DeviceSlot[]
  assigned: number
  locked: number
  nodes?: number
  limitReason?: 'node_limit' | 'time_limit' | null
  message?: string
  solver?: PlannedScheduleResult['solver']
  elapsedMs?: number
  timeLimitMs?: number
  lessons?: DeviceLesson[]
}

const lessonKey = (row: DeviceSlot) => row.activity_id ? `activity:${row.activity_id}` : row.class_subject_id
function lessonColumns(id: string | null) {
  return { class_subject_id: id && !id.startsWith('activity:') ? id : null, activity_id: id?.startsWith('activity:') ? id.slice(9) : null }
}
function newId() {
  return globalThis.crypto.randomUUID()
}

function activityPlacement(data: DeviceSnapshot, year: string, reserved?: DeviceOffering[]) {
  const offerings: DeviceOffering[] = []
  const slots: DeviceSlot[] = []
  const extra: DeviceLesson[] = []
  const unlock: DeviceSlot[] = []
  const seen = new Set<string>()
  const patch = new Map<string, { teacherIds: string[]; teacherId: null; activityGroupId?: string; name: string; teacherName: string }>()
  const flexible = new Map<string, { count: number; roomIds: string[]; joint: boolean }>()
  for (const group of data.plan.activityGroups || []) {
    const label = data.activities.find(a => a.id === group.settingId)?.label || 'กิจกรรม'
    for (const roomId of group.roomIds) {
      if (!data.classrooms.some(c => c.id === roomId)) continue
      const teachers = activityTeachers(group, roomId)
      const teacherName = teachers.map(id => {
        const teacher = data.teachers.find(item => item.id === id)
        return teacher ? `${teacher.prefix || ''} ${teacher.full_name}`.trim() : ''
      }).filter(Boolean).join(', ')
      let lesson = data.lessons.find(item => item.activity && item.classroomId === roomId && item.subjectId === group.settingId)
      if (!lesson) {
        const reservedId = reserved?.find(item => item.classroom_id === roomId && item.evaluation_setting_id === group.settingId)?.id
        if (reserved && !reservedId) throw Error('ฉบับร่างไม่มีกิจกรรมที่ต้องเพิ่ม')
        const id = reservedId || newId()
        const room = data.classrooms.find(item => item.id === roomId)
        offerings.push({ id, classroom_id: roomId, evaluation_setting_id: group.settingId })
        lesson = { id: 'activity:' + id, classroomId: roomId, teacherId: null, teacherIds: teachers, count: group.weeklyPeriods, label: `${room?.level}/${room?.room} · ${label}`, subjectId: group.settingId, code: '', name: label, fullName: label, teacherName, activity: true, teacherOptional: true, selectable: false, activityGroupId: group.mode === 'joint' ? group.id : undefined, sourceHours: 0, roomName: '', spread: true }
        extra.push(lesson)
      } else patch.set(lesson.id, { teacherIds: teachers, teacherId: null, activityGroupId: group.mode === 'joint' ? group.id : undefined, name: lesson.name || label, teacherName: teacherName || lesson.teacherName || '' })
      if (!group.cells.length) flexible.set(lesson.id, { count: group.weeklyPeriods, roomIds: group.roomIds, joint: group.mode === 'joint' })
      for (const cell of group.cells) {
        const key = `${roomId}:${cell.day}:${cell.period}`
        if (seen.has(key)) throw Error('มีกิจกรรมมากกว่าหนึ่งรายการในคาบเดียวกัน กรุณาแก้ที่ขั้นกิจกรรม')
        seen.add(key)
        const previous = data.slots.find(slot => slot.classroom_id === roomId && slot.day_of_week === cell.day && slot.period === cell.period)
        if (previous?.locked && lessonKey(previous) !== lesson.id) unlock.push(previous)
        slots.push({ classroom_id: roomId, academic_year_id: year, day_of_week: cell.day, period: cell.period, ...lessonColumns(lesson.id), note: null, locked: !!(previous && lessonKey(previous) === lesson.id && previous.locked) })
      }
    }
  }
  return { slots, offerings, extra, patch, unlock, flexible }
}

export function prepareDeviceDraft(data: DeviceSnapshot, year: string, scope: string[], clear: boolean, reserved?: DeviceOffering[]) {
  if (!scope.length || scope.some(id => !data.classrooms.some(room => room.id === id))) throw Error('กรุณาเลือกห้องประถมหรือมัธยมในปีการศึกษานี้ การจัดตารางนี้ไม่รวมอนุบาล')
  const placed = activityPlacement(data, year, reserved)
  const cellKey = (slot: { classroom_id: string; day_of_week: number; period: number }) => `${slot.classroom_id}:${slot.day_of_week}:${slot.period}`
  const pinned = new Set(placed.slots.map(cellKey))
  const allLessons = [...data.lessons, ...placed.extra]
  const autoIds = new Set<string>()
  for (const [id, item] of placed.flexible) {
    const lesson = allLessons.find(row => row.id === id)
    if (lesson && (scope.includes(lesson.classroomId) || item.joint && item.roomIds.some(room => scope.includes(room)))) autoIds.add(id)
  }
  const retained = [...data.slots.filter(slot => !pinned.has(cellKey(slot)) && (slot.locked || !clear || slot.activity_id && !autoIds.has(lessonKey(slot) || '') || !scope.includes(slot.classroom_id) && !autoIds.has(lessonKey(slot) || ''))), ...placed.slots]
  const lessons = allLessons.map(lesson => {
    const active = scope.includes(lesson.classroomId) && !lesson.activity || autoIds.has(lesson.id)
    const count = active ? (placed.flexible.get(lesson.id)?.count ?? lesson.count) : retained.filter(slot => lessonKey(slot) === lesson.id).length
    return { ...lesson, ...placed.patch.get(lesson.id), count, fixedOnly: !active, pattern: active ? (lesson.activity ? Array(count).fill(1) : lesson.pattern) : undefined, teacherOptional: !active || lesson.teacherOptional, preferMorning: active && !lesson.activity && lessonPrefersMorning(lesson) }
  })
  const issues = checkPlanning(lessons, retained.map(slot => ({ classroomId: slot.classroom_id, lessonId: lessonKey(slot), day: slot.day_of_week, period: slot.period })), data.plan.days, data.periods, data.blocks)
  const activityKeys = new Set<string>()
  for (const group of data.plan.activityGroups || []) {
    const name = data.activities.find(item => item.id === group.settingId)?.label || 'กิจกรรม'
    const invalid = !data.activities.some(item => item.id === group.settingId) || !group.roomIds.length ||
      new Set(group.roomIds).size !== group.roomIds.length || group.roomIds.some(id => !data.classrooms.some(room => room.id === id)) ||
      !Number.isInteger(group.weeklyPeriods) || group.weeklyPeriods < 1 || group.weeklyPeriods > 8 ||
      (group.cells.length !== 0 && group.cells.length !== group.weeklyPeriods) ||
      new Set(group.cells.map(cell => cell.day+':'+cell.period)).size !== group.cells.length ||
      group.cells.some(cell => !data.plan.days.includes(cell.day) || !data.periods.some(row => !row.is_break && row.period === cell.period)) ||
      group.roomIds.some(id => activityTeachers(group, id).some(teacher => !data.teachers.some(row => row.id === teacher)))
    if (invalid) issues.push({ severity:'error', message:name+': ตรวจห้อง ครู จำนวนคาบ และวันกิจกรรมให้ถูกต้อง', step:4 })
    for (const room of group.roomIds) {
      const key = group.settingId+':'+room
      if (activityKeys.has(key)) issues.push({severity:'error',message:name+': มีกิจกรรมซ้ำในห้องเดียวกัน',step:4})
      activityKeys.add(key)
    }
  }
  for (const lesson of lessons.filter(item => item.count > 0)) {
    for (const teacher of lesson.teacherIds ?? (lesson.teacherId ? [lesson.teacherId] : [])) {
      if (!data.teachers.some(row => row.id === teacher)) issues.push({severity:'error',message:lesson.label+' ไม่พบครูผู้สอนในรายชื่อ',step:2})
    }
  }
  for (const lesson of lessons.filter(item => !item.activity && item.count > 0)) if (data.plan.teacherIds && !data.plan.teacherIds.includes(lesson.teacherId || '')) issues.push({ severity: 'error', message: `${lesson.label} ครูผู้สอนไม่ได้อยู่ในรายการครูที่เลือกจัดตาราง`, step: 2 })
  const roomLabel = (id: string) => {
    const room = data.classrooms.find(item => item.id === id)
    if (!room) return 'ห้อง'
    if (!room.room || room.level.includes('/')) return room.level
    return `${room.level}/${room.room}`
  }
  for (const id of scope) if (!lessons.some(lesson => lesson.classroomId === id && !lesson.activity)) issues.push({ severity: 'error', message: `${roomLabel(id)} ยังไม่มีรายวิชา`, step: 3 })
  if (!data.timesConfigured) issues.push({ severity: 'error', message: 'ยังไม่บันทึกเวลาคาบของโรงเรียน กรุณาตรวจและบันทึกเวลาเริ่ม–จบก่อนจัด', step: 1 })
  for (const lesson of lessons.filter(item => scope.includes(item.classroomId) && !item.activity && item.roomName && !data.plan.rules[item.id]?.roomId)) issues.push({ severity: 'warning', message: `${lesson.label} ระบุชื่อสถานที่ แต่ยังไม่ได้เชื่อมรหัสห้องร่วม จึงยังไม่ตรวจสถานที่นี้ชน`, step: 5 })
  const timeError = validatePeriodTimes(data.periods)
  if (timeError) issues.push({ severity: 'error', message: timeError, step: 1 })
  return { issues, retained, lessons, offerings: placed.offerings, unlock: placed.unlock }
}

export function buildDeviceDraft(data: DeviceSnapshot, year: string, scope: string[], clear: boolean): DeviceDraft {
  const prepared = prepareDeviceDraft(data, year, scope, clear)
  if (prepared.issues.some(issue => issue.severity === 'error')) return { status: 'invalid', issues: prepared.issues, rows: [], offerings: prepared.offerings, unlock: prepared.unlock, assigned: 0, locked: prepared.unlock.length }
  const result = solvePlannedSchedule(prepared.lessons, prepared.retained.map(slot => ({ classroomId: slot.classroom_id, lessonId: lessonKey(slot), day: slot.day_of_week, period: slot.period })), data.plan, data.periods, data.blocks)
  if (result.status !== 'complete') return { status: result.status, issues: result.issues, rows: [], offerings: prepared.offerings, unlock: prepared.unlock, assigned: 0, locked: prepared.unlock.length, nodes: result.nodes, limitReason: result.limitReason, message: result.message, solver: result.solver, elapsedMs: result.elapsedMs, timeLimitMs: result.timeLimitMs }
  const covered = new Set(prepared.retained.map(slot => `${slot.classroom_id}:${slot.day_of_week}:${slot.period}`))
  const rows = [...prepared.retained, ...result.assignments.filter(item => !covered.has(`${item.classroomId}:${item.day}:${item.period}`)).map(item => ({ classroom_id: item.classroomId, academic_year_id: year, day_of_week: item.day, period: item.period, ...lessonColumns(item.lessonId), note: null, locked: false }))]
  const verified = verifyCompleteSchedule(prepared.lessons, rows.map(slot => ({classroomId:slot.classroom_id,lessonId:lessonKey(slot),day:slot.day_of_week,period:slot.period})), data.plan.days, data.periods, data.blocks)
  if (verified.some(issue => issue.severity === 'error')) return { status:'invalid', issues:[...prepared.issues,...verified], rows:[], offerings:prepared.offerings, unlock:prepared.unlock, assigned:0, locked:prepared.unlock.length }
  return { status: 'complete', lessons: prepared.lessons, issues: [...prepared.issues,...result.issues], rows, offerings: prepared.offerings, unlock: prepared.unlock, assigned: result.assignments.length, locked: prepared.unlock.length, nodes: result.nodes, solver: result.solver, elapsedMs: result.elapsedMs, timeLimitMs: result.timeLimitMs }
}
