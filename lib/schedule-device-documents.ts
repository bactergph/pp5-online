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
export function deviceDocumentPages(plan:FreeWizardPlan,kind:'class'|'teacher',ids:string[],semester:number,year:string):SchedulePdfPage[]{
  return ids.map(id=>{
    const gridData:Record<string,SchedulePdfCell>={}
    for(const day of plan.days)for(const {period} of teachingRows(plan.periods)){
      const subjects=plan.timetable.filter(cell=>cell.day===day&&cell.period===period&&(kind==='class'?cell.classroomId===id:plan.subjects.some(subject=>subject.id===cell.subjectId&&subject.teacherId===id)))
      const activityRooms=plan.rooms.flatMap(room=>{const activity=deviceActivityAt(plan,room.id,day,period);return activity&&(kind==='class'?room.id===id:freeActivityTeachers(activity,room.id).includes(id))?[{room,activity}]:[]})
      if(activityRooms.length){
        const names=[...new Set(activityRooms.map(({activity})=>activity.name))].join(', ')
        const detail=kind==='teacher'?activityRooms.map(({room})=>room.label).join(', '):activityTimetableTeacherLabel([...new Set(activityRooms.flatMap(({room,activity})=>freeActivityTeachers(activity,room.id)))].map(teacher=>plan.teachers.find(row=>row.id===teacher)?.name||'').join(', '))
        gridData[`${day}-${period}`]={line1:names,line2:'(กิจกรรม)',line3:detail}
      }else if(subjects.length){
        const cell=subjects[0],subject=plan.subjects.find(row=>row.id===cell.subjectId)
        if(subject)gridData[`${day}-${period}`]={line1:subject.name,line2:subject.code?`(${subject.code})`:'',line3:kind==='class'?compact(plan.teachers.find(row=>row.id===subject.teacherId)?.name||''):subjects.map(item=>plan.rooms.find(row=>row.id===item.classroomId)?.label||'').filter(Boolean).join(' + '),line4:plan.places.find(row=>row.id===subject.placeId)?.name||''}
      }else if(kind==='teacher'&&plan.blocks.some(block=>block.teacherId===id&&block.day===day&&block.period===period))gridData[`${day}-${period}`]={line1:'ไม่ว่าง',line2:''}
      else gridData[`${day}-${period}`]={line1:'—',line2:''}
    }
    const name=kind==='class'?plan.rooms.find(row=>row.id===id)?.label:plan.teachers.find(row=>row.id===id)?.name
    return {title:`${kind==='class'?'ตารางเรียน':'ตารางสอน'} ${name||''} ภาคเรียนที่ ${semester} ปีการศึกษา ${year}`,gridData}
  })
}
