import { devicePreflight } from './schedule-device-view'
import { freeActivityTeachers, teachingRows, type FreeWizardPlan, type LocalCell } from './schedule-device-free'

export function deviceActivityAt(plan:FreeWizardPlan, room:string, day:number, period:number) {
  const saved=plan.timetable.find(cell=>cell.classroomId===room&&cell.day===day&&cell.period===period&&cell.activityId)
  return plan.activities.find(activity=>activity.roomIds.includes(room)&&(activity.id===saved?.activityId||activity.cells.some(cell=>cell.day===day&&cell.period===period)))
}
function position(plan:FreeWizardPlan, room:string, day:number, period:number) {
  if(!plan.rooms.some(item=>item.id===room)||!plan.days.includes(day)||!teachingRows(plan.periods).some(row=>row.period===period))throw Error('ห้อง วัน หรือคาบอยู่นอกตารางเรียน')
}
function validate(plan:FreeWizardPlan) {
  const errors=devicePreflight(plan,plan.rooms.map(room=>room.id),false).filter(issue=>issue.severity==='error'&&issue.code?.startsWith('fixed_'))
  if(errors.length)throw Error(errors[0].message)
  return plan
}
/** Manual edits use the same fixed-cell validation as automatic generation.
 * Missing teachers on unrelated, unplaced subjects do not prevent incremental edits. */
export function changeDeviceCell(plan:FreeWizardPlan,room:string,day:number,period:number,subjectId:string|null,expected?:string|null) {
  position(plan,room,day,period)
  const current=plan.timetable.find(cell=>cell.classroomId===room&&cell.day===day&&cell.period===period)
  if(expected!==undefined&&(current?.subjectId||null)!==expected)throw Error('คาบนี้เปลี่ยนไปแล้ว กรุณาตรวจข้อมูลล่าสุด')
  if(deviceActivityAt(plan,room,day,period))throw Error('คาบนี้เป็นกิจกรรม กรุณาแก้ที่เมนูกิจกรรม')
  if(current?.locked&&current.subjectId!==subjectId)throw Error('คาบนี้ล็อกอยู่ กรุณาปลดล็อกก่อนแก้')
  const subject=subjectId?plan.subjects.find(item=>item.id===subjectId&&item.roomId===room):undefined
  if(subjectId&&(!subject||!plan.teachers.some(teacher=>teacher.id===subject.teacherId)))throw Error('ไม่พบรายวิชาหรือครูผู้สอนของห้องนี้')
  const timetable=plan.timetable.filter(cell=>!(cell.classroomId===room&&cell.day===day&&cell.period===period))
  if(subjectId)timetable.push({classroomId:room,day,period,subjectId,locked:current?.subjectId===subjectId&&!!current.locked})
  return validate({...plan,timetable})
}
export function lockDeviceCell(plan:FreeWizardPlan,room:string,day:number,period:number) {
  position(plan,room,day,period)
  const current=plan.timetable.find(cell=>cell.classroomId===room&&cell.day===day&&cell.period===period)
  const activity=deviceActivityAt(plan,room,day,period)
  if(!current)return {...plan,timetable:[...plan.timetable,{classroomId:room,day,period,subjectId:'',...(activity?{activityId:activity.id}:{}),locked:true}]}
  if(current.locked&&!current.subjectId&&!current.activityId)return {...plan,timetable:plan.timetable.filter(cell=>cell!==current)}
  return {...plan,timetable:plan.timetable.map(cell=>cell===current?{...cell,locked:!cell.locked}:cell)}
}
export function blockDeviceTeacher(plan:FreeWizardPlan,teacher:string,day:number,period:number,blocked:boolean) {
  if(!plan.teachers.some(item=>item.id===teacher)||!plan.days.includes(day)||!teachingRows(plan.periods).some(row=>row.period===period))throw Error('ครู วัน หรือคาบไม่ถูกต้อง')
  if(blocked&&plan.timetable.some(cell=>cell.day===day&&cell.period===period&&plan.subjects.some(subject=>subject.id===cell.subjectId&&subject.teacherId===teacher)))throw Error('ครูมีคาบสอนอยู่ กรุณาย้ายหรือนำวิชาออกก่อน')
  if(blocked&&plan.rooms.some(room=>{const activity=deviceActivityAt(plan,room.id,day,period);return activity&&freeActivityTeachers(activity,room.id).includes(teacher)}))throw Error('ครูรับผิดชอบกิจกรรมในคาบนี้')
  const blocks=plan.blocks.filter(block=>!(block.teacherId===teacher&&block.day===day&&block.period===period))
  return {...plan,blocks:blocked?[...blocks,{teacherId:teacher,day,period}]:blocks}
}
export function moveDeviceCell(plan:FreeWizardPlan,source:LocalCell,target:{day:number;period:number},swap=false) {
  position(plan,source.classroomId,target.day,target.period)
  const current=plan.timetable.find(cell=>cell.classroomId===source.classroomId&&cell.day===source.day&&cell.period===source.period)
  if(!current||current.subjectId!==source.subjectId)throw Error('คาบต้นทางเปลี่ยนไปแล้ว')
  const destination=plan.timetable.find(cell=>cell.classroomId===source.classroomId&&cell.day===target.day&&cell.period===target.period)
  if(current.locked||destination?.locked)throw Error('คาบต้นทางหรือปลายทางล็อกอยู่')
  if(current.activityId||deviceActivityAt(plan,source.classroomId,source.day,source.period)||deviceActivityAt(plan,source.classroomId,target.day,target.period))throw Error('ย้ายกิจกรรมผ่านเมนูกิจกรรม')
  if(destination&&!swap)throw Error('คาบปลายทางมีวิชาแล้ว เลือกสลับคาบหรือเลือกช่องว่าง')
  const timetable=plan.timetable.filter(cell=>cell!==current&&cell!==destination)
  timetable.push({...current,...target})
  if(destination)timetable.push({...destination,day:source.day,period:source.period})
  return validate({...plan,timetable})
}
export type DeviceClearScope={kind:'school'|'room'|'level'|'teacher';id?:string}
export function clearDeviceCells(plan:FreeWizardPlan,scope:DeviceClearScope) {
  if(!['school','room','level','teacher'].includes(scope.kind)||scope.kind!=='school'&&!scope.id)throw Error('กรุณาเลือกขอบเขตที่ต้องการล้างคาบ')
  const affected=(cell:LocalCell)=>scope.kind==='school'||scope.kind==='room'&&cell.classroomId===scope.id||scope.kind==='level'&&plan.rooms.find(room=>room.id===cell.classroomId)?.label.split('/')[0]===scope.id||scope.kind==='teacher'&&plan.subjects.find(subject=>subject.id===cell.subjectId)?.teacherId===scope.id
  return {...plan,timetable:plan.timetable.filter(cell=>cell.locked||!!cell.activityId||!affected(cell))}
}

/** Copy offerings without copying placed cells or silently replacing a target's teachers. */
export function copyDeviceSubjects(plan:FreeWizardPlan,source:string,targets:string[]) {
  if(!plan.rooms.some(room=>room.id===source)||targets.some(id=>!plan.rooms.some(room=>room.id===id)))throw Error('ไม่พบห้องต้นทางหรือปลายทาง')
  const subjects=[...plan.subjects]
  for(const roomId of new Set(targets.filter(id=>id!==source)))for(const subject of plan.subjects.filter(item=>item.roomId===source)){
    if(subjects.some(item=>item.roomId===roomId&&(subject.code?item.code===subject.code:item.name===subject.name)))continue
    subjects.push({...subject,id:globalThis.crypto.randomUUID(),roomId,teacherId:'',pattern:[...subject.pattern],placeId:null})
  }
  return {...plan,subjects}
}
