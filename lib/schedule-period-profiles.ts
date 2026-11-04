import { validatePeriodTimes, type PeriodTimeRow } from './schedule-helpers'
export type PeriodBand = 'primary' | 'secondary'
export function periodBand(level: string): PeriodBand | null {
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
  if (Object.keys(profiles).some(key => !['primary','secondary'].includes(key))) return 'กลุ่มเวลาเรียนไม่ถูกต้อง'
  for (const [key, rows] of Object.entries(profiles)) {
    if (!Array.isArray(rows) || rows.some(row => row.profiles)) return 'ข้อมูลเวลาเรียนแยกระดับไม่ถูกต้อง'
    const error = validatePeriodTimes(rows)
    if (error) return `${key === 'primary' ? 'ประถม' : 'มัธยม'}: ${error}`
    if (rows.filter(row => !row.is_break).length !== times.filter(row => !row.is_break).length) return 'แต่ละระดับต้องมีจำนวนคาบเท่ากัน ปรับเวลาพักและเวลาสอนของแต่ละระดับได้'
  }
  return null
}
export const clockMinute = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3,5))
export function periodInterval(times: PeriodTimeRow[], period: number) {
  const row = times.find(row => !row.is_break && row.period === period)
  return row ? { start: clockMinute(row.start_time), end: clockMinute(row.end_time) } : null
}
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
 if(!hasPeriodProfiles(times))return times
 const clocks=new Map<string,PeriodTimeRow>()
 for(const rows of [times,...Object.values(periodProfiles(times))])for(const row of rows||[])if(!row.is_break)clocks.set(`${row.start_time}-${row.end_time}`,row)
 return [...clocks.values()].sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.end_time.localeCompare(b.end_time)).map((row,i)=>({period:i+1,label:`ช่วง ${i+1}`,start_time:row.start_time,end_time:row.end_time,is_break:false,sort_order:i+1}))
}
export function teacherDisplayPeriod(times:PeriodTimeRow[],level:string,period:number){
 if(!hasPeriodProfiles(times))return period
 const row=levelPeriodTimes(times,level).find(row=>!row.is_break&&row.period===period)
 return teacherPeriodTimes(times).find(t=>t.start_time===row?.start_time&&t.end_time===row?.end_time)?.period||period
}
export function rosterPeriodClock(times:PeriodTimeRow[],level:string,period:number):{start_time?:string;end_time?:string}{
 if(!hasPeriodProfiles(times))return {}
 const row=levelPeriodTimes(times,level).find(row=>!row.is_break&&row.period===period)
 return row?{start_time:row.start_time,end_time:row.end_time}:{}
}
export function teacherBlockOverlaps(times:PeriodTimeRow[],blockPeriod:number,displayPeriod:number){
 const block=periodInterval(times,blockPeriod),display=periodInterval(teacherPeriodTimes(times),displayPeriod)
 return !!block&&!!display&&intervalsOverlap(block,display)
}
