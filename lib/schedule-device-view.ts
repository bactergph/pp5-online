import {validateJointTeachingGroups} from './schedule-joint-teaching'
import type { Preparation } from './schedule-preparation'
import type { DeviceDraft } from './schedule-device-build'
import { prepareDeviceDraft } from './schedule-device-build'
import { deviceTeacherLimitMessage, deviceActivityCatalog, toDeviceSnapshot, type FreeWizardPlan } from './schedule-device-free'
import type { PlanningIssue } from './schedule-planning'
import { isTimetableClassroom } from './schedules'

/** JSON storage preserves values, not the insertion order produced by migrations. */
export function deviceDataKey(value:unknown) {
  return JSON.stringify(value,(_key,item)=>item && typeof item==='object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item)
}

/** Pure adapters for the same presentation components used by the online wizard. */
export function devicePreparation(plan: FreeWizardPlan): Preparation {
  const snapshot = toDeviceSnapshot(plan, plan.rooms.map(room => room.id))
  return {
    ...snapshot, hash:deviceDataKey(plan), blocksSupported: true,manualBlocks:plan.blocks,
    substituteReservations:Object.entries(plan.substitutes||{}).flatMap(([date,entries])=>entries.filter(entry=>entry.substituteTeacherId).map(entry=>({teacherId:entry.substituteTeacherId!,date,day:new Date(date+'T12:00:00+07:00').getUTCDay()||7,period:entry.period}))),
    classrooms: plan.rooms.filter(room=>isTimetableClassroom(room.label.split('/')[0])).map(room => {
      const [level, ...rest] = room.label.split('/')
      return { id: room.id, level, room: plan.rooms.filter(item=>item.label.split('/')[0]===level).findIndex(item=>item.id===room.id)+1, name: rest.join('/') || '1' }
    }),
    teachers: plan.teachers.map(teacher => ({id:teacher.id,prefix:teacher.prefix || '',full_name:teacher.fullName || teacher.name,position:teacher.position || ''})),
    activities: deviceActivityCatalog(plan),
    lessons: snapshot.lessons.map(lesson => ({...lesson, name:lesson.name || '', code:lesson.code || '', subjectId:lesson.subjectId || lesson.id, activity:!!lesson.activity, teacherName:lesson.teacherName || '', roomName:lesson.roomName, pattern:lesson.pattern || Array(lesson.count).fill(1), roomId:lesson.roomId || null, morning:!!lesson.morning, spread:lesson.spread ?? true, source:'กำหนดคาบต่อสัปดาห์บนเครื่องนี้'})),
  }
}

export const deviceIssueSteps = (issues: PlanningIssue[]) => issues.map(issue => ({...issue,step:issue.manageStep??(({1:1,2:3,3:5,4:6,5:6,6:7} as Record<number,number>)[issue.step] || 7)}))

export function devicePreflight(plan: FreeWizardPlan, rooms: string[], clear: boolean, teacherLimit?:number) {
  if(plan.teachingGroups?.length){try{validateJointTeachingGroups(plan.teachingGroups,toDeviceSnapshot(plan,rooms).lessons)}catch(error){return [{severity:'error' as const,message:error instanceof Error?error.message:'ตรวจกลุ่มสอนรวมไม่สำเร็จ',step:6}]}}
  try {
    const issues:PlanningIssue[]=[]
    const limitError=deviceTeacherLimitMessage(plan.teachers.length,teacherLimit)
    if(limitError)return [{severity:'error' as const,message:limitError,step:3}]
    for(const [items,step] of [[plan.rooms,2],[plan.teachers,3],[plan.subjects,5],[plan.activities,4]] as const){
      if(new Set(items.map(item=>item.id)).size!==items.length)issues.push({severity:'error',step,message:'มีรหัสรายการซ้ำ กรุณาตรวจข้อมูลนำเข้าหรือไฟล์สำรอง'})
    }
    for(const subject of plan.subjects)if(!plan.rooms.some(room=>room.id===subject.roomId))issues.push({severity:'error',step:5,message:`${subject.name}: ไม่พบห้องเรียนที่กำหนด`})
    return [...issues,...deviceIssueSteps(prepareDeviceDraft(toDeviceSnapshot(plan, rooms), 'local', rooms, clear).issues)]
  }
  catch (error) { return [{severity:'error' as const,message:error instanceof Error ? error.message : 'ตรวจข้อมูลไม่สำเร็จ',step:4}] }
}

export function deviceDraftView(plan: FreeWizardPlan, draft: DeviceDraft | null, rooms: string[]) {
  if (!draft) return null
  const data = devicePreparation(plan)
  const lessons = draft.lessons || toDeviceSnapshot(plan, rooms).lessons
  return {
    ...draft, id: draft.status === 'complete' ? 'local-draft' : null, issues:deviceIssueSteps(draft.issues),
    affectedRooms:[...new Set(draft.rows.filter(row => !rooms.includes(row.classroom_id) && !plan.timetable.some(cell => cell.classroomId === row.classroom_id && cell.day === row.day_of_week && cell.period === row.period && (cell.subjectId || null) === row.class_subject_id && (cell.activityId ? `${cell.activityId}:${cell.classroomId}` : null) === row.activity_id)).map(row => row.classroom_id))],
    preview:{classrooms:data.classrooms,periods:plan.periods,days:plan.days,lessons:lessons.map(lesson => ({id:lesson.id,name:lesson.name || '',code:lesson.code || '',teacherName:lesson.teacherName || '',roomName:lesson.roomName || '',subjectId:lesson.subjectId || lesson.id}))},
    summary:rooms.map(roomId => ({roomId,target:lessons.filter(lesson => lesson.classroomId === roomId).reduce((sum,lesson) => sum+lesson.count,0),scheduled:draft.rows.filter(row => row.classroom_id === roomId && (row.class_subject_id || row.activity_id)).length})),
  }
}

export function localDraftCells(draft: DeviceDraft) {
  return draft.rows.filter(row => row.class_subject_id || row.activity_id || row.locked).map(row => ({classroomId:row.classroom_id,day:row.day_of_week,period:row.period,subjectId:row.class_subject_id || '',activityId:row.activity_id ? (draft.offerings.find(item => item.id === row.activity_id)?.evaluation_setting_id || row.activity_id.slice(0,-(`:${row.classroom_id}`).length)) : undefined,locked:row.locked}))
}
