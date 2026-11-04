import type { PeriodTimeRow } from './schedule-helpers'

export type TeacherScheduleActivity = {
  id: string
  name: string
  teacherIds: string[]
  days: number[]
  start_time: string
  end_time: string
}
export type ScheduleTeacherBlock = { teacherId: string; day: number; period: number; start_time?: string; end_time?: string; label?: string; teacherActivityId?: string }
const validClock = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
export function validateTeacherActivities(activities: TeacherScheduleActivity[] | undefined, teacherIds?: string[]) {
  if (activities === undefined) return
  if (!Array.isArray(activities) || activities.length > 200) throw Error('กำหนดกิจกรรมครูได้ไม่เกิน 200 รายการ')
  const ids = new Set<string>()
  for (const activity of activities) {
    if (!activity || typeof activity.id !== 'string' || !/^[-0-9a-f]{36}$/i.test(activity.id) || ids.has(activity.id)) throw Error('รหัสกิจกรรมครูไม่ถูกต้องหรือซ้ำกัน')
    ids.add(activity.id)
    if (typeof activity.name !== 'string' || !activity.name.trim() || activity.name.length > 150) throw Error('กรอกชื่อกิจกรรมครูไม่เกิน 150 ตัวอักษร')
    if (!Array.isArray(activity.teacherIds) || !activity.teacherIds.length || activity.teacherIds.length > 1000 || new Set(activity.teacherIds).size !== activity.teacherIds.length || activity.teacherIds.some(id => typeof id !== 'string' || !/^[-0-9a-f]{36}$/i.test(id) || teacherIds && !teacherIds.includes(id))) throw Error('เลือกครูที่เข้าร่วมกิจกรรมจากรายชื่อครูของโรงเรียน')
    if (!Array.isArray(activity.days) || !activity.days.length || new Set(activity.days).size !== activity.days.length || activity.days.some(day => !Number.isInteger(day) || day < 1 || day > 5)) throw Error('เลือกวันจันทร์–ศุกร์สำหรับกิจกรรมครู')
    if (typeof activity.start_time !== 'string' || typeof activity.end_time !== 'string' || !validClock(activity.start_time) || !validClock(activity.end_time) || activity.start_time >= activity.end_time) throw Error('เวลากิจกรรมครูต้องเป็น 24 ชั่วโมง และเวลาเริ่มต้องก่อนเวลาสิ้นสุด')
  }
  for (let i = 0; i < activities.length; i++) for (const other of activities.slice(i + 1)) {
    const activity = activities[i]
    if (activity.days.some(day => other.days.includes(day)) && activity.teacherIds.some(id => other.teacherIds.includes(id)) && activity.start_time < other.end_time && other.start_time < activity.end_time) throw Error(`กิจกรรมครู “${activity.name}” มีเวลาและครูทับกับ “${other.name}”`)
  }
}
/** Clock blocks preserve partial overlaps across different school bell schedules. */
export function teacherActivityBlocks(times: PeriodTimeRow[], activities: TeacherScheduleActivity[] = []): ScheduleTeacherBlock[] {
  return activities.flatMap(activity => {
    const overlaps = times.filter(row => !row.is_break && row.start_time < activity.end_time && activity.start_time < row.end_time).map(row => row.period)
    return activity.days.flatMap(day => activity.teacherIds.flatMap(teacherId => (overlaps.length ? overlaps : [0]).map(period => ({ teacherId, day, period, start_time: activity.start_time, end_time: activity.end_time, label: activity.name, teacherActivityId: activity.id }))))
  })
}
export function teacherActivityMinutes(activities: TeacherScheduleActivity[] = [], teacherId: string) {
  return activities.filter(activity => activity.teacherIds.includes(teacherId)).reduce((sum, activity) => {
    const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
    return sum + (minute(activity.end_time) - minute(activity.start_time)) * activity.days.length
  }, 0)
}
/** Display metadata is scoped to the selected year/term, never saved as school bell times. */
export function withTeacherActivityClock(times: PeriodTimeRow[], activities: TeacherScheduleActivity[] = []): PeriodTimeRow[] {
  return times.map((row, index) => ({ ...row, teacherActivities: index === 0 && activities.length ? activities : undefined }))
}
export function teacherActivitiesInClock(times: PeriodTimeRow[]) { return times.find(row => row.teacherActivities)?.teacherActivities || [] }

/** Availability notices use actual clocks and do not create classroom lessons. */
export function teacherActivityAvailability(times:PeriodTimeRow[],activities:TeacherScheduleActivity[]=[]){
 return teacherActivityBlocks(times,activities).map(block=>({...block,label:`กิจกรรมครู · ${block.label} (${block.start_time}–${block.end_time})`,classroomId:'',lessonId:`teacher-activity:${block.teacherActivityId}`,locked:true,activity:true,activityFixed:true}))
}
export function teacherActivityRosterBusy(times:PeriodTimeRow[],day:number){
 return teacherActivitiesInClock(times).filter(activity=>activity.days.includes(day)).flatMap(activity=>activity.teacherIds.map(teacherId=>({teacherId,period:0,start_time:activity.start_time,end_time:activity.end_time,kind:'activity' as const,label:`กิจกรรมครู · ${activity.name} (${activity.start_time}–${activity.end_time})`})))
}
