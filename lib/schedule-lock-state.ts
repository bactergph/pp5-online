import type {ActivityTeam} from './schedule-activity-teams'
import {activityTeachers} from './schedule-activity-teams'

type ActivityLesson={id:string;classroomId:string;subjectId:string;name?:string;activity?:boolean;teacherId:string|null;teacherIds?:string[]}
type Slot={classroom_id:string;day_of_week:number;period:number;activity_id:string|null;locked:boolean}
export function activityLockCells(groups:ActivityTeam[],lessons:ActivityLesson[],slots:Slot[]){
  const cells=new Map<string,{classroomId:string;day:number;period:number;lessonId:string;name:string;teacherIds:string[];fixed:boolean;locked:boolean}>()
  for(const row of slots){
    if(!row.activity_id)continue
    const lesson=lessons.find(lesson=>lesson.id===`activity:${row.activity_id}`)
    if(!lesson)continue
    cells.set(`${row.classroom_id}:${row.day_of_week}:${row.period}`,{classroomId:row.classroom_id,day:row.day_of_week,period:row.period,lessonId:lesson.id,name:lesson.name||'กิจกรรม',teacherIds:lesson.teacherIds??(lesson.teacherId?[lesson.teacherId]:[]),fixed:false,locked:!!row.locked})
  }
  for(const group of groups)for(const classroomId of group.roomIds)for(const cell of group.cells){
    const lesson=lessons.find(lesson=>lesson.activity&&lesson.classroomId===classroomId&&lesson.subjectId===group.settingId),key=`${classroomId}:${cell.day}:${cell.period}`
    cells.set(key,{classroomId,...cell,lessonId:lesson?.id||`activity-team:${group.id}:${classroomId}`,name:lesson?.name||'กิจกรรม',teacherIds:activityTeachers(group,classroomId),fixed:true,locked:cells.get(key)?.locked||false})
  }
  return [...cells.values()]
}
