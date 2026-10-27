export type DeviceTeacher = { id: string; name: string }
export type DeviceRoom = { id: string; label: string }
export type DeviceSubject = { id: string; roomId: string; name: string; teacherId: string; periods: number }
export type DeviceCell = { classroomId: string; day: number; period: number; subjectId: string }
export type DeviceSubstitute = {
  id: string
  absentTeacherId: string
  period: number
  subjectId: string
  roomId: string
  subjectLabel: string
  roomLabel: string
  substituteTeacherId: string | null
  leaveType: string
  note: string | null
  overrideConflicts?:boolean
  conflictDetails?:string[]
  conflictConfirmedAt?:string|null
}
export type DeviceScheduleUpload = {
  teachers: DeviceTeacher[]
  rooms: DeviceRoom[]
  subjects: DeviceSubject[]
  timetable: DeviceCell[]
  substitutes: Record<string, DeviceSubstitute[]>
}

const text = (value: unknown, max: number) => String(value || '').trim().slice(0, max)

export function cleanDeviceSchedule(raw: Partial<DeviceScheduleUpload> | null | undefined): DeviceScheduleUpload {
  const teachers = (raw?.teachers || []).slice(0, 300).map(item => ({ id: text(item?.id, 80), name: text(item?.name, 120) })).filter(item => item.id && item.name)
  const rooms = (raw?.rooms || []).slice(0, 300).map(item => ({ id: text(item?.id, 80), label: text(item?.label, 80) })).filter(item => item.id && item.label)
  const subjects = (raw?.subjects || []).slice(0, 800).map(item => ({
    id: text(item?.id, 80),
    roomId: text(item?.roomId, 80),
    name: text(item?.name, 120),
    teacherId: text(item?.teacherId, 80),
    periods: Math.min(8, Math.max(1, Math.round(Number(item?.periods) || 1))),
  })).filter(item => item.id && item.name && item.roomId && item.teacherId)
  const timetable = (raw?.timetable || []).slice(0, 3000).map(item => ({
    classroomId: text(item?.classroomId, 80),
    day: Math.round(Number(item?.day) || 0),
    period: Math.round(Number(item?.period) || 0),
    subjectId: text(item?.subjectId, 80),
  })).filter(item => item.classroomId && item.subjectId && item.day >= 1 && item.day <= 5 && item.period >= 1 && item.period <= 8)
  const substitutes: Record<string, DeviceSubstitute[]> = {}
  for (const [date, rows] of Object.entries(raw?.substitutes || {}).slice(0, 120)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    substitutes[date] = (rows || []).slice(0, 2000).map(item => ({
      id: text(item?.id, 80),
      absentTeacherId: text(item?.absentTeacherId, 80),
      period: Math.round(Number(item?.period) || 0),
      subjectId: text(item?.subjectId, 80),
      roomId: text(item?.roomId, 80),
      subjectLabel: text(item?.subjectLabel, 120),
      roomLabel: text(item?.roomLabel, 80),
      substituteTeacherId: text(item?.substituteTeacherId, 80) || null,
      leaveType: text(item?.leaveType, 40) || 'ลาป่วย',
      note: text(item?.note, 200) || null,
      overrideConflicts:item?.overrideConflicts===true,
      conflictDetails:Array.isArray(item?.conflictDetails)?item.conflictDetails.slice(0,100).map(value=>text(value,1000)):[],
      conflictConfirmedAt:text(item?.conflictConfirmedAt,40)||null,
    })).filter(item => item.id && item.absentTeacherId && item.period >= 1 && item.period <= 8)
  }
  return { teachers, rooms, subjects, timetable, substitutes }
}

export function deviceScheduleHasContent(plan: DeviceScheduleUpload) {
  return plan.teachers.length + plan.rooms.length + plan.subjects.length + plan.timetable.length + Object.keys(plan.substitutes).length > 0
}

export function deviceScheduleHash(plan: DeviceScheduleUpload) {
  const body = JSON.stringify(plan)
  let hash = 5381
  for (let index = 0; index < body.length; index++) hash = ((hash << 5) + hash) ^ body.charCodeAt(index)
  return `${(hash >>> 0).toString(16)}:${body.length}`
}

export function parseDeviceRoom(label: string, index: number) {
  const match = label.trim().match(/^(.*?)[/\s]+(\d+)$/)
  if (match?.[1]?.trim() && Number(match[2]) > 0 && Number(match[2]) < 100) return { level: match[1].trim().slice(0, 40), room: Number(match[2]) }
  return { level: label.trim().slice(0, 40) || 'ห้อง', room: index + 1 }
}
