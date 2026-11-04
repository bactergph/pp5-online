import { validatePeriodTimes, type PeriodTimeRow } from './schedule-helpers'
import { teacherActivitiesInClock, type ScheduleTeacherBlock } from './schedule-teacher-activities'
export type PeriodBand = 'kindergarten' | 'primary' | 'secondary'
export const PERIOD_BANDS: {id:PeriodBand;label:string;grades:string}[] = [{id:'kindergarten',label:'อนุบาล',grades:'อ.1–อ.3'},{id:'primary',label:'ประถม',grades:'ป.1–ป.6'},{id:'secondary',label:'มัธยม',grades:'ม.1–ม.6'}]
export function periodBand(level: string): PeriodBand | null {
  if (/^(อ\.?\s*[1-3]|อนุบาล)/.test(level.trim())) return 'kindergarten'
  if (/^(ป\.?\s*[1-6]|ประถม)/.test(level.trim())) return 'primary'
  if (/^(ม\.?\s*[1-6]|มัธยม)/.test(level.trim())) return 'secondary'
  return null
}
export function periodProfiles(times: PeriodTimeRow[]) { return times.find(row => row.profiles)?.profiles || {} }
export function levelPeriodTimes(times: PeriodTimeRow[], level: string) {
  const band = periodBand(level)
  return (band && periodProfiles(times)[band]) || times
}
export function hasPeriodProfiles(times: PeriodTimeRow[]) { return Object.keys(periodProfiles(times)).length > 0 }
export function validatePeriodProfiles(times: PeriodTimeRow[]): string | null {
  const invalid = validatePeriodTimes(times)
  if (invalid) return invalid
  const profiles = periodProfiles(times)
  if (Object.keys(profiles).some(key => !['kindergarten','primary','secondary'].includes(key))) return 'กลุ่มเวลาเรียนไม่ถูกต้อง'
  for (const [key, rows] of Object.entries(profiles)) {
    if (!Array.isArray(rows) || rows.some(row => row.profiles)) return 'ข้อมูลเวลาเรียนแยกระดับไม่ถูกต้อง'
    const error = validatePeriodTimes(rows)
    if (error) return `${PERIOD_BANDS.find(b=>b.id===key)?.label || key}: ${error}`
  }
  return null
}
export const clockMinute = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3,5))
export function periodInterval(times: PeriodTimeRow[], period: number) {
  const row = times.find(row => !row.is_break && row.period === period)
  return row ? { start: clockMinute(row.start_time), end: clockMinute(row.end_time) } : null
}
export function teacherBlockInterval(times:PeriodTimeRow[], block:ScheduleTeacherBlock) {
  return block.start_time && block.end_time ? {start:clockMinute(block.start_time),end:clockMinute(block.end_time)} : periodInterval(times,block.period)
}
export function hasTeacherTimeline(times:PeriodTimeRow[]) { return hasPeriodProfiles(times) || teacherActivitiesInClock(times).length > 0 }
export function intervalsOverlap(a: {start:number;end:number}, b: {start:number;end:number}) { return a.start < b.end && b.start < a.end }
export function profileLessonTimes<T extends {classroomId:string; classroomLevel?:string}>(lessons:T[], rooms:{id:string;level:string}[]) {
  const levels = new Map(rooms.map(room => [room.id,room.level]))
  return lessons.map(lesson => ({...lesson,classroomLevel:levels.get(lesson.classroomId)||lesson.classroomLevel||''}))
}
/** A teacher's unavailable cells refer to the school's shared clock, never a grade's period number. */
export function profileCellOverlap(times:PeriodTimeRow[],levelA:string,periodA:number,levelB:string,periodB:number) {
  const a=periodInterval(levelPeriodTimes(times,levelA),periodA),b=periodInterval(levelPeriodTimes(times,levelB),periodB)
  return !!a&&!!b&&intervalsOverlap(a,b)
}
/** Display-only clock columns for teachers who teach across grade schedules. */
export function teacherPeriodTimes(times:PeriodTimeRow[]):PeriodTimeRow[]{
 if(!hasTeacherTimeline(times))return times
 const clocks=new Map<string,PeriodTimeRow>()
 for(const rows of [times,...Object.values(periodProfiles(times))])for(const row of rows||[])if(!row.is_break)clocks.set(`${row.start_time}-${row.end_time}`,row)
 for(const activity of teacherActivitiesInClock(times))clocks.set(`${activity.start_time}-${activity.end_time}`,{period:0,label:activity.name,start_time:activity.start_time,end_time:activity.end_time,is_break:false,sort_order:0})
 return [...clocks.values()].sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.end_time.localeCompare(b.end_time)).map((row,i)=>({period:i+1,label:`ช่วง ${i+1}`,start_time:row.start_time,end_time:row.end_time,is_break:false,sort_order:i+1}))
}
export function teacherDisplayPeriod(times:PeriodTimeRow[],level:string,period:number){
 if(!hasTeacherTimeline(times))return period
 const row=levelPeriodTimes(times,level).find(row=>!row.is_break&&row.period===period)
 return teacherPeriodTimes(times).find(t=>t.start_time===row?.start_time&&t.end_time===row?.end_time)?.period||period
}
export function rosterPeriodClock(times:PeriodTimeRow[],level:string,period:number):{start_time?:string;end_time?:string}{
 const row=levelPeriodTimes(times,level).find(row=>!row.is_break&&row.period===period)
 return row?{start_time:row.start_time,end_time:row.end_time}:{}
}
export function teacherBlockOverlaps(times:PeriodTimeRow[],blockPeriod:number,displayPeriod:number){
 const block=periodInterval(times,blockPeriod),display=periodInterval(teacherPeriodTimes(times),displayPeriod)
 return !!block&&!!display&&intervalsOverlap(block,display)
}
