import type {FreeSubstituteEntry} from '../components/schedules/FreeSubstituteDesk'
import type {DeviceDocumentSettings} from './schedule-device-documents'
import type { ActivityTeam } from './schedule-activity-teams'
import { emptyPlan } from './schedule-planning'
import { DEFAULT_PERIOD_TIMES, validatePeriodTimes, type PeriodTimeRow } from './schedule-helpers'
import type { DeviceSnapshot } from './schedule-device-build'
import { isTimetableClassroom } from './schedules'

export const FREE_SCHEDULE_TEACHER_LIMIT = 25
export function deviceTeacherLimitMessage(count:number, limit?:number) {
  return limit !== undefined && count > limit ? `จัดตารางฟรีรองรับครูสูงสุด ${limit} คน (มี ${count} คน) กรุณาลดรายชื่อครูก่อนจัดตาราง` : ''
}

export type LocalCell = { classroomId: string; day: number; period: number; subjectId: string; activityId?: string; locked?: boolean }

export type FreeActivity = {
  id: string
  settingId?: string
  name: string
  mode: 'joint' | 'separate'
  roomIds: string[]
  teacherId: string
  roomTeachers: Record<string, string>
  teacherIds?: string[]
  roomTeacherIds?: Record<string, string[]>
  weeklyPeriods?: number
  cells: { day: number; period: number }[]
}

export type FreeSubject = {
  id: string
  roomId: string
  code: string
  name: string
  teacherId: string
  periods: number
  pattern: number[]
  placeId: string | null
  timePreference?: 'any' | 'morning' | 'afternoon'
  spread?: boolean
  subjectGroup?: string
  subjectType?: string
}

export type FreePlace = { id: string; name: string }

export type FreeWizardPlan = {
  substitutes?:Record<string,FreeSubstituteEntry[]>
  document?: DeviceDocumentSettings
  reduceGaps?:boolean
  maxContinuous?:number
  teacherIds?: string[]
  activityCatalog?: {id:string;label:string;short_label:string;weeklyPeriods:number}[]
  teachers: { id: string; name: string; prefix?:string; fullName?:string; position?:string }[]
  rooms: { id: string; label: string }[]
  places: FreePlace[]
  subjects: FreeSubject[]
  timetable: LocalCell[]
  days: number[]
  periods: PeriodTimeRow[]
  blocks: { teacherId: string; day: number; period: number }[]
  activities: FreeActivity[]
}

export function newId() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function teachingRows(periods: PeriodTimeRow[]) {
  return (periods.length ? periods : DEFAULT_PERIOD_TIMES).filter(row => !row.is_break)
}

export function periodColumns(periods: PeriodTimeRow[]) {
  const rows = periods.length ? periods : DEFAULT_PERIOD_TIMES
  const breakAt = rows.findIndex(row => row.is_break)
  return {
    before: rows.slice(0, Math.max(breakAt, 0)).filter(row => !row.is_break),
    after: rows.slice(breakAt + 1).filter(row => !row.is_break),
  }
}

export function slotCapacity(plan: Pick<FreeWizardPlan, 'days' | 'periods'>) {
  return teachingRows(plan.periods).length * plan.days.length
}

export function patternFor(periods: number, doubles: number) {
  const count = Math.max(1, Math.min(40, Math.round(periods) || 1))
  const pair = Math.max(0, Math.min(Math.floor(count / 2), Math.round(doubles) || 0))
  return [...Array(pair).fill(2), ...Array(count - pair * 2).fill(1)]
}

export function doublesIn(pattern: number[] | undefined, periods: number) {
  if (!pattern?.length || pattern.reduce((sum, item) => sum + item, 0) !== periods || pattern.some(item => item !== 1 && item !== 2)) return 0
  return pattern.filter(item => item === 2).length
}

export function activityTeacherId(activity: FreeActivity, roomId: string) {
  return freeActivityTeachers(activity, roomId)[0] || ''
}

export function freeActivityTeachers(activity: FreeActivity, roomId: string) {
  return activity.mode === 'separate'
    ? activity.roomTeacherIds?.[roomId] ?? (activity.roomTeachers?.[roomId] ? [activity.roomTeachers[roomId]] : [])
    : activity.teacherIds ?? (activity.teacherId ? [activity.teacherId] : [])
}

export function freeActivityGroup(activity: FreeActivity): ActivityTeam {
  return { id: activity.id, settingId: activity.settingId || activity.id, mode: activity.mode, roomIds: activity.roomIds,
    teacherIds: activity.teacherIds ?? (activity.teacherId ? [activity.teacherId] : []),
    roomTeachers: Object.fromEntries(activity.roomIds.map(id => [id, freeActivityTeachers(activity, id)])),
    weeklyPeriods: activity.weeklyPeriods ?? (activity.cells.length || 1), cells: activity.cells }
}

export function deviceActivityCatalog(plan:Pick<FreeWizardPlan,'activities'|'activityCatalog'>) {
  return [...new Map([...plan.activities.map(activity=>({id:activity.settingId||activity.id,label:activity.name,short_label:activity.name,weeklyPeriods:activity.weeklyPeriods??(activity.cells.length||1)})),...(plan.activityCatalog||[])].map(item=>[item.id,item])).values()]
}

export function roomNeed(plan: FreeWizardPlan, roomId: string) {
  const subjects = plan.subjects.filter(subject => subject.roomId === roomId).reduce((sum, subject) => sum + subject.periods, 0)
  const activities = plan.activities.filter(activity => activity.roomIds.includes(roomId)).reduce((sum, activity) => sum + (activity.weeklyPeriods ?? (activity.cells.length || 1)), 0)
  return subjects + activities
}

export function normalizePlan(raw?: Partial<FreeWizardPlan>): FreeWizardPlan {
  const periods = raw?.periods?.length ? raw.periods : DEFAULT_PERIOD_TIMES
  return {
    substitutes:raw?.substitutes,
    document: raw?.document,
    reduceGaps:raw?.reduceGaps ?? false,
    maxContinuous:raw?.maxContinuous ?? 0,
    teachers: raw?.teachers || [],
    teacherIds: raw?.teacherIds,
    activityCatalog: raw?.activityCatalog ?? (raw?.activities || []).map(activity=>({id:activity.settingId || activity.id,label:activity.name,short_label:activity.name,weeklyPeriods:activity.weeklyPeriods ?? (activity.cells?.length || 1)})).filter((item,index,items)=>items.findIndex(other=>other.id===item.id)===index),
    rooms: raw?.rooms || [],
    places: raw?.places || [],
    subjects: (raw?.subjects || []).map(subject => ({
      id: subject.id,
      roomId: subject.roomId,
      code: subject.code || '',
      name: subject.name,
      teacherId: subject.teacherId,
      periods: subject.periods,
      pattern: subject.pattern && subject.pattern.reduce((sum, item) => sum + item, 0) === subject.periods && subject.pattern.every(item => Number.isInteger(item) && item >= 1 && item <= 8) ? subject.pattern : patternFor(subject.periods, 0),
      placeId: subject.placeId || null,
      timePreference: ['any','morning','afternoon'].includes(subject.timePreference || '') ? subject.timePreference : 'any',
      spread: subject.spread ?? true,
      subjectGroup: subject.subjectGroup || '',
      subjectType: subject.subjectType || 'พื้นฐาน',
    })),
    timetable: raw?.timetable || [],
    days: raw?.days ?? [1, 2, 3, 4, 5],
    periods,
    blocks: raw?.blocks || [],
    activities: (raw?.activities || []).map(activity => ({
      id: activity.id,
      settingId: activity.settingId,
      name: activity.name,
      mode: activity.mode === 'separate' ? 'separate' as const : 'joint' as const,
      roomIds: activity.roomIds || [],
      teacherId: activity.teacherId || '',
      roomTeachers: activity.roomTeachers || {},
      teacherIds: activity.teacherIds ?? (activity.teacherId ? [activity.teacherId] : []),
      roomTeacherIds: activity.roomTeacherIds ?? Object.fromEntries(Object.entries(activity.roomTeachers || {}).map(([id, teacher]) => [id, teacher ? [teacher] : []])),
      weeklyPeriods: activity.weeklyPeriods ?? (activity.cells?.length || 1),
      cells: activity.cells || [],
    })),
  }
}

function named<T extends { id: string }>(items: T[], name: string, label: (item: T) => string, make: () => T) {
  const found = items.find(item => label(item) === name)
  if (found) return { items, item: found }
  const item = make()
  return { items: [...items, item], item }
}

export function addLevelRooms(plan: FreeWizardPlan, levels: string[], count: number) {
  const rooms = [...plan.rooms]
  const total = Math.max(1, Math.min(20, Math.round(count) || 1))
  for (const level of levels.map(level => level.trim()).filter(level => level && isTimetableClassroom(level))) {
    for (let room = 1; room <= total; room += 1) {
      const label = `${level}/${room}`
      if (!rooms.some(item => item.label === label)) rooms.push({ id: newId(), label })
    }
  }
  return { ...plan, rooms }
}

export function importSubjectTable(text: string, plan: FreeWizardPlan, teacherLimit?:number): { plan: FreeWizardPlan } | { error: string } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length) return { error: 'ยังไม่มีแถวให้นำเข้า' }
  let teachers = [...plan.teachers]
  let rooms = [...plan.rooms]
  let places = [...plan.places]
  const subjects = [...plan.subjects]
  let imported = 0
  for (const [index, line] of lines.entries()) {
    const cells = line.split(line.includes('\t') ? '\t' : ',').map(cell => cell.trim())
    if (index === 0 && /ห้อง/.test(cells[0] || '') && cells.some(cell => /วิชา|ครู/.test(cell))) continue
    const [roomLabel, code, name, teacherName, periodText, doubleText, placeName] = cells
    if (!roomLabel || !name) return { error: `แถวที่ ${index + 1} ต้องมีห้องและรายวิชา ครูสามารถกำหนดในขั้นภาระสอนภายหลังได้` }
    const periods = Math.max(1, Math.min(40, Number(periodText) || 1))
    const room = named(rooms, roomLabel, item => item.label, () => ({ id: newId(), label: roomLabel }))
    rooms = room.items
    const teacher = teacherName ? named(teachers, teacherName, item => item.name, () => ({ id: newId(), name: teacherName })) : {items:teachers,item:{id:'',name:''}}
    teachers = teacher.items
    let placeId: string | null = null
    if (placeName) {
      const place = named(places, placeName, item => item.name, () => ({ id: newId(), name: placeName }))
      places = place.items
      placeId = place.item.id
    }
    const next = { id: newId(), roomId: room.item.id, code: code || '', name, teacherId: teacher.item.id, periods, pattern: patternFor(periods, Number(doubleText) || 0), placeId }
    const existing = subjects.findIndex(subject => subject.roomId === next.roomId && subject.name === name && subject.code === next.code)
    if (existing >= 0) subjects[existing] = { ...subjects[existing], ...next, id: subjects[existing].id }
    else subjects.push(next)
    imported += 1
  }
  if (!imported) return { error: 'ไม่พบแถวรายวิชา ใช้หัวตาราง ห้อง รหัส รายวิชา ครู คาบ คาบคู่ สถานที่' }
  const limitError=deviceTeacherLimitMessage(teachers.length,teacherLimit)
  if(limitError)return {error:limitError}
  return { plan: { ...plan, teachers, rooms, places, subjects } }
}

export function copyTermSubjects(source: FreeWizardPlan, target: FreeWizardPlan): FreeWizardPlan {
  return {
    ...target,
    subjects: source.subjects.map(subject => ({ ...subject, pattern: [...(subject.pattern || [])], placeId: subject.placeId || null })),
    activities: source.activities.map(activity => ({
      ...activity,
      roomIds: [...activity.roomIds],
      roomTeachers: { ...activity.roomTeachers },
      cells: activity.cells.map(cell => ({ ...cell })),
    })),
    blocks: source.blocks.map(block => ({ ...block })),
    timetable: [],
  }
}

export function withTeachingPeriods(periods: PeriodTimeRow[], count: number) {
  const rows = [...(periods.length ? periods : DEFAULT_PERIOD_TIMES)]
  const wanted = Math.max(1, Math.min(8, Math.round(count) || 1))
  let lessons = rows.filter(row => !row.is_break)
  while (lessons.length < wanted) {
    const last = rows.at(-1) || DEFAULT_PERIOD_TIMES.at(-1)!
    const start = last.end_time
    const [hour, minute] = start.split(':').map(Number)
    const endMinute = hour * 60 + minute + 60
    const end = `${String(Math.floor(endMinute / 60) % 24).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}`
    rows.push({ period: lessons.length + 1, label: `คาบที่ ${lessons.length + 1}`, start_time: start, end_time: end, is_break: false, sort_order: rows.length + 1 })
    lessons = rows.filter(row => !row.is_break)
  }
  return rows
}

export function toDeviceSnapshot(plan: FreeWizardPlan, _scope: string[]): DeviceSnapshot {
  void _scope // Include all rooms so conflicts outside the chosen scope remain visible.
  const lessons = plan.subjects.map(subject => {
    const room = plan.rooms.find(item => item.id === subject.roomId)
    const teacher = plan.teachers.find(item => item.id === subject.teacherId)
    const place = plan.places.find(item => item.id === subject.placeId)
    return {
      id: subject.id,
      classroomId: subject.roomId,
      teacherId: subject.teacherId,
      count: subject.periods,
      label: `${room?.label || 'ห้อง'} · ${subject.name}`,
      name: subject.name,
      fullName: subject.name,
      code: subject.code,
      subjectGroup: subject.subjectGroup,
      subjectType: subject.subjectType,
      teacherName: teacher?.name || '',
      pattern: subject.pattern,
      roomId: place?.id || null,
      roomName: place?.name || '',
      spread: subject.spread ?? true,
      timePreference: subject.timePreference || 'any',
    }
  })
  const groups = plan.activities.map(freeActivityGroup)
  const activityLessons = plan.activities.flatMap(activity => activity.roomIds.map(classroomId => ({
    id: `activity:${activity.id}:${classroomId}`, classroomId, teacherId: null,
    teacherIds: freeActivityTeachers(activity, classroomId), count: activity.weeklyPeriods ?? (activity.cells.length || 1),
    subjectId: activity.settingId || activity.id, name: activity.name, fullName: activity.name,
    label: `${plan.rooms.find(room => room.id === classroomId)?.label || ''} · ${activity.name}`,
    teacherName: freeActivityTeachers(activity, classroomId).map(id => plan.teachers.find(teacher => teacher.id === id)?.name || '').filter(Boolean).join(', '),
    activity: true, teacherOptional: true, activityGroupId: activity.mode === 'joint' ? activity.id : undefined,
  })))
  return {
    hash: 'local',
    plan: {
      ...emptyPlan(),
      reduceGaps:plan.reduceGaps ?? false,
      maxContinuous:plan.maxContinuous ?? 0,
      days: plan.days,
      teacherIds: plan.teacherIds,
      rooms: plan.places.map(place => ({ id: place.id, name: place.name })),
      rules: Object.fromEntries(lessons.map(lesson => [lesson.id, { count: lesson.count, pattern: lesson.pattern || [1], roomId: lesson.roomId || null, morning: lesson.timePreference==='morning', timePreference: lesson.timePreference, spread: lesson.spread }])),
      activityGroups: groups,
    },
    periods: plan.periods.length ? plan.periods : DEFAULT_PERIOD_TIMES,
    timesConfigured: !validatePeriodTimes(plan.periods.length ? plan.periods : DEFAULT_PERIOD_TIMES),
    classrooms: plan.rooms.filter(room => isTimetableClassroom(room.label.split('/')[0])).map(room => ({ id: room.id, level: room.label, room: 0 })),
    lessons: [...lessons, ...activityLessons],
    slots: plan.timetable.map(cell => ({ classroom_id: cell.classroomId, academic_year_id: 'local', day_of_week: cell.day, period: cell.period, class_subject_id: cell.subjectId || null, activity_id: cell.activityId ? `${cell.activityId}:${cell.classroomId}` : null, note: null, locked: !!cell.locked })),
    blocks: [...plan.blocks,...Object.entries(plan.substitutes||{}).flatMap(([date,entries])=>{
      const day=new Date(date+'T12:00:00+07:00').getUTCDay()||7
      return Number.isNaN(Date.parse(date))?[]:entries.filter(entry=>entry.substituteTeacherId).map(entry=>({teacherId:entry.substituteTeacherId!,day,period:entry.period}))
    })],
    activities: deviceActivityCatalog(plan),
    teachers: plan.teachers.map(teacher => ({ id: teacher.id, full_name: teacher.name })),
  }
}
