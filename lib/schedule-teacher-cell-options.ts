import type {PeriodTimeRow} from './schedule-helpers'
import {clockMinute,levelPeriodTimes,teacherPeriodTimes,teacherBlockInterval} from './schedule-period-profiles'

type Lesson={id:string;teacherId:string|null;classroomId:string;label:string}
type Slot={classroomId:string;day:number;period:number;lessonId:string|null;locked:boolean}
type Busy={teacherId:string;classroomId:string;day:number;period:number;lessonId:string;label:string;locked:boolean;activity?:boolean;activityFixed?:boolean;start_time?:string;end_time?:string;teacherActivityId?:string}
export type TeacherCellEvent=Busy
export type TeacherCellData={lessons:Lesson[];slots:Slot[];quotas:{id:string;target:number;used:number}[];busy:Busy[];blocks:{teacherId:string;day:number;period:number}[];classroomLevels?:Record<string,string>}
export const teacherCellClock=(times:PeriodTimeRow[],period:number)=>teacherPeriodTimes(times).find(time=>!time.is_break&&time.period===period)
export function teacherCellBlocks(data:TeacherCellData,times:PeriodTimeRow[],teacher:string,day:number,period:number){
 const clock=teacherCellClock(times,period);if(!clock)return []
 return data.blocks.filter(block=>{const interval=teacherBlockInterval(times,block);return block.teacherId===teacher&&block.day===day&&interval&&interval.start<clockMinute(clock.end_time)&&clockMinute(clock.start_time)<interval.end})
}
export function teacherCellEvents(data:TeacherCellData,times:PeriodTimeRow[],teacher:string,day:number,period:number){
 const clock=teacherCellClock(times,period);if(!clock)return []
 const matching=data.busy.filter(event=>{
  if(event.teacherId!==teacher||event.day!==day)return false
  const local=event.teacherActivityId?event:levelPeriodTimes(times,data.classroomLevels?.[event.classroomId]||'').find(time=>!time.is_break&&time.period===event.period)
  return local?.start_time&&local.end_time&&local.start_time<clock.end_time&&clock.start_time<local.end_time
 })
 return [...new Map(matching.map(event=>[event.teacherActivityId||`${event.classroomId}:${event.period}:${event.lessonId}`,event])).values()]
}
/** Display clock IDs are never sent as a classroom's local period number. */
export function teacherCellOptions(data:TeacherCellData,times:PeriodTimeRow[],teacher:string,day:number,period:number,current?:Busy,reserved:string[]=[]){
 const clock=current?levelPeriodTimes(times,data.classroomLevels?.[current.classroomId]||'').find(time=>!time.is_break&&time.period===current.period):teacherCellClock(times,period)
 if(!clock)return []
 return data.lessons.filter(lesson=>lesson.teacherId===teacher&&(!current||lesson.classroomId===current.classroomId)).flatMap(lesson=>{
  const time=levelPeriodTimes(times,data.classroomLevels?.[lesson.classroomId]||'').find(row=>!row.is_break&&row.start_time===clock.start_time&&row.end_time===clock.end_time)
  if(!time)return []
  const quota=data.quotas.find(q=>q.id===lesson.id),used=data.slots.filter(slot=>slot.classroomId===lesson.classroomId&&slot.lessonId===lesson.id).length+reserved.filter(id=>id===lesson.id).length
  if(lesson.id!==current?.lessonId&&quota&&used>=quota.target)return []
  if(data.slots.some(slot=>slot.classroomId===lesson.classroomId&&slot.day===day&&slot.period===time.period&&(slot.lessonId!==current?.lessonId||slot.locked)))return []
  return [{...lesson,period:time.period,start:time.start_time,end:time.end_time,label:`${lesson.label} · ${time.start_time}–${time.end_time}${quota?` · เหลือ ${Math.max(0,quota.target-used)} คาบ`:''}`}]
 })
}
