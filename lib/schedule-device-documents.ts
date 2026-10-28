import {scheduleTeachingView} from './schedule-teaching-view'
import type {SchedulePdfCell, SchedulePdfPage} from './jspdf-schedules'
import {freeActivityTeachers, teachingRows, type FreeWizardPlan} from './schedule-device-free'
import {deviceActivityAt} from './schedule-device-operations'
import {devicePreparation} from './schedule-device-view'
import {summarizeScheduleWorkload} from './schedule-workload'
import {teacherTimetableName,activityTimetableTeacherLabel} from './schedule-helpers'

export type DeviceDocumentSettings={schoolName:string;academicYear:string;printDate:string;academicHeadName:string;directorName:string;logoDataUrl?:string}
export function deviceWorkload(plan:FreeWizardPlan){
  const data=devicePreparation(plan)
  return summarizeScheduleWorkload({...data,activityGroups:data.plan.activityGroups},data.teachers)
}
const compact=teacherTimetableName
export function deviceDisplaySchedule(plan:FreeWizardPlan){
  const data=devicePreparation(plan)
  return {classrooms:plan.rooms.map(room=>({id:room.id,level:room.label.split('/')[0],room:room.label.split('/').slice(1).join('/')})),lessons:data.lessons,slots:data.slots,activityGroups:data.plan.activityGroups||[],teacherNames:Object.fromEntries(plan.teachers.map(t=>[t.id,t.name]))}
}
export function deviceDocumentPages(plan:FreeWizardPlan,kind:'class'|'teacher',ids:string[],semester:number,year:string):SchedulePdfPage[]{
  return ids.map(id=>{
    const gridData:Record<string,SchedulePdfCell>={}
    if(kind==='teacher'){
      const cells=scheduleTeachingView(deviceDisplaySchedule(plan),id)
      for(const day of plan.days)for(const {period} of teachingRows(plan.periods))gridData[`${day}-${period}`]=cells[`${day}-${period}`]?.pdf||{line1:plan.blocks.some(b=>b.teacherId===id&&b.day===day&&b.period===period)?'ไม่ว่าง':'—',line2:''}
      return {title:`ตารางสอน ${plan.teachers.find(t=>t.id===id)?.name||''} ภาคเรียนที่ ${semester} ปีการศึกษา ${year}`,gridData}
    }
    for(const day of plan.days)for(const {period} of teachingRows(plan.periods)){
      const subjects=plan.timetable.filter(cell=>cell.day===day&&cell.period===period&&cell.classroomId===id)
      const activityRooms=plan.rooms.flatMap(room=>{const activity=deviceActivityAt(plan,room.id,day,period);return activity&&room.id===id?[{room,activity}]:[]})
      if(activityRooms.length){
        const names=[...new Set(activityRooms.map(({activity})=>activity.name))].join(', ')
        const detail=activityTimetableTeacherLabel([...new Set(activityRooms.flatMap(({room,activity})=>freeActivityTeachers(activity,room.id)))].map(teacher=>plan.teachers.find(row=>row.id===teacher)?.name||'').join(', '))
        gridData[`${day}-${period}`]={line1:names,line2:'(กิจกรรม)',line3:detail}
      }else if(subjects.length){
        const cell=subjects[0],subject=plan.subjects.find(row=>row.id===cell.subjectId)
        if(subject)gridData[`${day}-${period}`]={line1:subject.shortName?.trim()||subject.name,line2:subject.code?`(${subject.code})`:'',line3:compact(plan.teachers.find(row=>row.id===subject.teacherId)?.name||''),line4:plan.places.find(row=>row.id===subject.placeId)?.name||''}
      }
      else gridData[`${day}-${period}`]={line1:'—',line2:''}
    }
    const name=plan.rooms.find(row=>row.id===id)?.label
    return {title:`ตารางเรียน ${name||''} ภาคเรียนที่ ${semester} ปีการศึกษา ${year}`,gridData}
  })
}
