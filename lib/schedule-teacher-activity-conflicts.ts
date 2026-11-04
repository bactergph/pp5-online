import {levelPeriodTimes} from './schedule-period-profiles'
import type {PeriodTimeRow} from './schedule-helpers'
import type {TeacherScheduleActivity} from './schedule-teacher-activities'
type Data={periods:PeriodTimeRow[];classrooms:{id:string;level:string;name?:string;room:number}[];lessons:{id:string;classroomId:string;teacherId:string|null;teacherIds?:string[];name?:string;label:string}[];slots:{classroom_id:string;class_subject_id:string|null;activity_id:string|null;day_of_week:number;period:number}[];plan:{activityGroups?:{id:string;settingId:string;roomIds:string[];mode:string;teacherIds:string[];roomTeachers:Record<string,string[]>;cells:{day:number;period:number}[]}[]}}
export function teacherActivityConflicts(data:Data,activity:TeacherScheduleActivity){
 const result:{teacherId:string;day:number;start_time:string;end_time:string;label:string}[]=[],seen=new Set<string>()
 function inspect(roomId:string,day:number,period:number,ids:string[],label:string){
  const room=data.classrooms.find(room=>room.id===roomId),time=levelPeriodTimes(data.periods,room?.level||'').find(row=>!row.is_break&&row.period===period)
  if(!time||!activity.days.includes(day)||activity.start_time>=time.end_time||time.start_time>=activity.end_time)return
  for(const teacherId of ids.filter(id=>activity.teacherIds.includes(id))){const key=`${teacherId}:${roomId}:${day}:${period}:${label}`;if(seen.has(key))continue;seen.add(key);result.push({teacherId,day,start_time:time.start_time,end_time:time.end_time,label})}
 }
 for(const slot of data.slots){const id=slot.activity_id?`activity:${slot.activity_id}`:slot.class_subject_id,lesson=data.lessons.find(lesson=>lesson.id===id);if(lesson)inspect(slot.classroom_id,slot.day_of_week,slot.period,lesson.teacherIds??(lesson.teacherId?[lesson.teacherId]:[]),lesson.label)}
 for(const group of data.plan.activityGroups||[])for(const room of group.roomIds)for(const cell of group.cells){const lesson=data.lessons.find(l=>l.classroomId===room&&l.id.startsWith('activity:')&&l.teacherIds?.some(id=>activity.teacherIds.includes(id)));inspect(room,cell.day,cell.period,group.mode==='joint'?group.teacherIds:group.roomTeachers[room]||[],lesson?.label||'กิจกรรมนักเรียนที่กำหนดเวลาไว้')}
 return result
}
