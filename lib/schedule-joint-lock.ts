import {validateJointTeachingGroups,jointTeachingSlotErrors} from './schedule-joint-teaching'
import {checkPlanning,solvePlannedSchedule,type SchedulePlan,type PlannedLesson} from './schedule-planning'
import type {PeriodTimeRow} from './schedule-helpers'
import type {DeviceSlot} from './schedule-device-build'

export type JointLockRequest={lessonId:string;day:number;period:number;locked:boolean;remove?:boolean;expected:{classroomId:string;lessonId:string|null;locked:boolean}[]}
type Data={plan:SchedulePlan;lessons:PlannedLesson[];slots:DeviceSlot[];periods:PeriodTimeRow[];blocks:{teacherId:string;day:number;period:number}[]}
/** A joint cell is one atomic edit across every classroom. Never unlock or
 * replace unrelated reservations, lessons or activities. */
export function applyJointTeachingLock(data:Data,request:JointLockRequest,year:string){
  validateJointTeachingGroups(data.plan.teachingGroups,data.lessons,data.plan.rules)
  const group=data.plan.teachingGroups?.find(group=>group.lessonIds.includes(request.lessonId))
  if(!group)throw Error('กำหนดกลุ่มสอนรวมหลายห้องก่อนล็อกคาบพร้อมกัน')
  if(!data.plan.days.includes(request.day)||!data.periods.some(time=>!time.is_break&&time.period===request.period)||typeof request.locked!=='boolean'||request.remove!==undefined&&typeof request.remove!=='boolean')throw Error('วัน คาบ หรือสถานะล็อกไม่ถูกต้อง')
  const members=data.lessons.filter(lesson=>group.lessonIds.includes(lesson.id)),rooms=new Set(members.map(lesson=>lesson.classroomId))
  if(!Array.isArray(request.expected)||request.expected.length!==members.length||new Set(request.expected.map(row=>row.classroomId)).size!==members.length)throw Error('ข้อมูลห้องสอนรวมเปลี่ยนแล้ว กรุณาโหลดใหม่')
  for(const lesson of members){
    const old=data.slots.find(row=>row.classroom_id===lesson.classroomId&&row.day_of_week===request.day&&row.period===request.period)
    const expected=request.expected.find(row=>row.classroomId===lesson.classroomId)
    if(!expected||expected.lessonId!==(old?.class_subject_id||null)||expected.locked!==!!old?.locked)throw Error('คาบในกลุ่มเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนล็อก')
    if(old?.activity_id||old?.class_subject_id&&old.class_subject_id!==lesson.id||old?.locked&&old.class_subject_id!==lesson.id)throw Error(`${lesson.label} มีวิชา กิจกรรม หรือคาบล็อกอื่นอยู่ กรุณาเลือกช่องว่าง`)
    if(request.remove&&old?.class_subject_id!==lesson.id)throw Error('ไม่พบคาบสอนรวมที่ต้องการนำออก')
    if(data.plan.activityGroups?.some(group=>group.roomIds.includes(lesson.classroomId)&&group.cells.some(cell=>cell.day===request.day&&cell.period===request.period)))throw Error('คาบนี้มีกิจกรรม กรุณาเลือกคาบอื่น')
  }
  const rows=data.slots.filter(row=>!(rooms.has(row.classroom_id)&&row.day_of_week===request.day&&row.period===request.period))
  if(!request.remove)for(const lesson of members)rows.push({classroom_id:lesson.classroomId,academic_year_id:year,day_of_week:request.day,period:request.period,class_subject_id:lesson.id,activity_id:null,note:data.slots.find(row=>row.class_subject_id===lesson.id&&row.day_of_week===request.day&&row.period===request.period)?.note||null,locked:request.locked})
  const planned=rows.map(row=>({classroomId:row.classroom_id,lessonId:row.activity_id?'activity:'+row.activity_id:row.class_subject_id,day:row.day_of_week,period:row.period}))
  const sync=jointTeachingSlotErrors(data.lessons,planned);if(sync.length)throw Error(sync[0])
  const fixed=checkPlanning(data.lessons,planned,data.plan.days,data.periods,data.blocks).find(issue=>issue.severity==='error'&&issue.code?.startsWith('fixed_'));if(fixed)throw Error(fixed.message)
  // Verify remaining parts of each double/triple can still be completed. Other
  // offerings stay fixed; unrelated unfinished input does not block this edit.
  const lessons=data.lessons.map(lesson=>{const active=group.lessonIds.includes(lesson.id);return {...lesson,count:active?lesson.count:planned.filter(row=>row.lessonId===lesson.id).length,pattern:active?lesson.pattern:undefined,fixedOnly:!active,teacherOptional:!active||lesson.teacherOptional}})
  const solved=solvePlannedSchedule(lessons,planned,data.plan,data.periods,data.blocks,30000,1500)
  if(solved.status!=='complete')throw Error(solved.status==='timeout'?'ตรวจคาบสอนรวมยังไม่เสร็จ กรุณาลองอีกครั้ง':'คาบนี้ทำให้สอนรวมตามรูปแบบคาบที่กำหนดไม่ได้ กรุณาเลือกคาบอื่น')
  return rows
}
