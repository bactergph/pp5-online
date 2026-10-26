import {validateJointTeachingGroups,jointTeachingSlotErrors,withJointTeachingGroups} from './schedule-joint-teaching'
import {checkPlanning,solvePlannedSchedule,type SchedulePlan,type PlannedLesson} from './schedule-planning'
import type {PeriodTimeRow} from './schedule-helpers'
import type {DeviceSlot} from './schedule-device-build'

export type JointLockRequest={lessonId:string;day:number;period:number;locked:boolean;remove?:boolean;lessonIds?:string[];periods?:number[];replaceExisting?:boolean;expectedHash?:string;groupId?:string;expected:{classroomId:string;lessonId:string|null;locked:boolean;period?:number}[]}
type Data={hash?:string;plan:SchedulePlan;lessons:PlannedLesson[];slots:DeviceSlot[];periods:PeriodTimeRow[];blocks:{teacherId:string;day:number;period:number}[]}
/** Explicit shared sessions are scoped to the chosen periods, never the whole week. */
export function prepareJointTeachingSession(data:Data,request:JointLockRequest,year:string){
  if(!request.expectedHash||request.expectedHash!==data.hash)throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนย้ายหรือล็อกสอนรวม')
  const ids=request.lessonIds||[],periods=request.periods||[request.period]
  if(!Array.isArray(ids)||!Array.isArray(periods)||request.remove!==undefined&&typeof request.remove!=='boolean'||ids.length<2||new Set(ids).size!==ids.length||!ids.includes(request.lessonId)||!data.plan.days.includes(request.day)||!periods.length||new Set(periods).size!==periods.length||periods.some(period=>!Number.isInteger(period)||!data.periods.some(time=>!time.is_break&&time.period===period))||typeof request.locked!=='boolean'||request.replaceExisting!==undefined&&typeof request.replaceExisting!=='boolean')throw Error('เลือกวิชาอย่างน้อย 2 ห้อง วัน และคาบเรียนให้ถูกต้อง')
  if(!request.remove&&!request.locked)throw Error('คาบสอนรวมเฉพาะเวลาต้องล็อกไว้ หากยกเลิกให้เอาคาบออกพร้อมกัน')
  const members=ids.map(id=>{const lesson=data.lessons.find(lesson=>lesson.id===id);if(!lesson||lesson.activity)throw Error('ไม่พบวิชาที่เลือกสอนรวม');return lesson})
  if(!members[0].teacherId||members.some(lesson=>lesson.teacherId!==members[0].teacherId)||new Set(members.map(lesson=>lesson.classroomId)).size!==members.length)throw Error('เลือกวิชาของครูคนเดียวกันจากคนละห้อง')
  const overlaps=(data.plan.teachingGroups||[]).filter(group=>group.lessonIds.some(id=>ids.includes(id)))
  if(overlaps.length>1||overlaps.some(group=>!group.cells||group.lessonIds.length!==ids.length||group.lessonIds.some(id=>!ids.includes(id))))throw Error('วิชานี้อยู่ในกลุ่มสอนรวมอื่นแล้ว กรุณาแก้กลุ่มเดิมก่อน')
  const oldGroup=overlaps[0],groupId=oldGroup?.id||request.groupId||crypto.randomUUID()
  if(request.remove&&!oldGroup)throw Error('ไม่พบคาบสอนรวมที่ต้องการนำออก')
  if(!Array.isArray(request.expected)||request.expected.length!==members.length*periods.length||new Set(request.expected.map(row=>`${row.classroomId}:${row.period??request.period}`)).size!==request.expected.length)throw Error('ข้อมูลคาบสอนรวมไม่ครบ กรุณาโหลดใหม่')
  for(const lesson of members)for(const period of periods){
    const old=data.slots.find(row=>row.classroom_id===lesson.classroomId&&row.day_of_week===request.day&&row.period===period)
    const expected=request.expected.find(row=>row.classroomId===lesson.classroomId&&(row.period??request.period)===period)
    if(!expected||expected.lessonId!==(old?.class_subject_id||null)||expected.locked!==!!old?.locked)throw Error('คาบในกลุ่มเปลี่ยนแล้ว กรุณาโหลดใหม่ก่อนล็อก')
    if(old?.activity_id||old?.class_subject_id&&old.class_subject_id!==lesson.id||old?.locked&&old.class_subject_id!==lesson.id)throw Error(lesson.label+' มีวิชา กิจกรรม หรือคาบล็อกอื่นอยู่ กรุณาเลือกช่องว่าง')
    if(data.plan.activityGroups?.some(group=>group.roomIds.includes(lesson.classroomId)&&group.cells.some(cell=>cell.day===request.day&&cell.period===period)))throw Error('คาบนี้มีกิจกรรม กรุณาเลือกคาบอื่น')
    if(request.remove&&old?.class_subject_id!==lesson.id)throw Error('ไม่พบคาบที่ต้องการนำออกครบทุกห้อง')
  }
  const chosen=(day:number,period:number)=>day===request.day&&periods.includes(period)
  const cells=(oldGroup?.cells||[]).filter(cell=>!chosen(cell.day,cell.period))
  if(!request.remove)cells.push(...periods.map(period=>({day:request.day,period})))
  const rules={...data.plan.rules,...Object.fromEntries(members.map(lesson=>[lesson.id,data.plan.rules[lesson.id]||{count:lesson.count,pattern:lesson.pattern||Array(lesson.count).fill(1),roomId:lesson.roomId||null,morning:!!lesson.morning,spread:lesson.spread??true,timePreference:lesson.timePreference||'any'}]))}
  const plan={...data.plan,rules,teachingGroups:[...(data.plan.teachingGroups||[]).filter(group=>group.id!==oldGroup?.id),...(cells.length?[{id:groupId,lessonIds:ids,cells}]:[])]}
  const lessons=withJointTeachingGroups(data.lessons,plan,true),rooms=new Set(members.map(lesson=>lesson.classroomId))
  const rows=data.slots.filter(row=>{
    if(rooms.has(row.classroom_id)&&chosen(row.day_of_week,row.period))return false
    if(request.replaceExisting&&row.class_subject_id&&ids.includes(row.class_subject_id))return !!oldGroup?.cells?.some(cell=>cell.day===row.day_of_week&&cell.period===row.period)
    return true
  })
  if(!request.remove)for(const lesson of members)for(const period of periods)rows.push({classroom_id:lesson.classroomId,academic_year_id:year,day_of_week:request.day,period,class_subject_id:lesson.id,activity_id:null,note:data.slots.find(row=>row.class_subject_id===lesson.id&&row.day_of_week===request.day&&row.period===period)?.note||null,locked:true})
  const planned=rows.map(row=>({classroomId:row.classroom_id,lessonId:row.activity_id?'activity:'+row.activity_id:row.class_subject_id,day:row.day_of_week,period:row.period}))
  const sync=jointTeachingSlotErrors(lessons,planned);if(sync.length)throw Error(sync[0])
  const fixed=checkPlanning(lessons,planned,plan.days,data.periods,data.blocks).find(issue=>issue.severity==='error'&&issue.code?.startsWith('fixed_'));if(fixed)throw Error(fixed.message)
  const active=new Set(ids),remaining=lessons.map(lesson=>({...lesson,count:active.has(lesson.id)?lesson.count:planned.filter(row=>row.lessonId===lesson.id).length,pattern:active.has(lesson.id)?lesson.pattern:undefined,fixedOnly:!active.has(lesson.id),teacherOptional:!active.has(lesson.id)||lesson.teacherOptional}))
  const answer=solvePlannedSchedule(remaining,planned,plan,data.periods,data.blocks,30000,1500)
  if(answer.status!=='complete')throw Error(answer.status==='timeout'?'ตรวจคาบสอนรวมยังไม่เสร็จ กรุณาลองอีกครั้ง':'คาบที่เลือกไม่ตรงรูปแบบคาบหรือเวลาว่าง กรุณาตรวจช่วงพักและคาบคู่')
  return {plan,rows}
}
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
