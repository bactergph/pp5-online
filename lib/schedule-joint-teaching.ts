import type {LessonRule, PlannedLesson} from './schedule-planning'

/** A whole weekly offering taught to several distinct classrooms at once.
 * Subject IDs/codes and student records remain separate. */
export type JointTeachingGroup = {id: string; lessonIds: string[]}
type Lesson = Pick<PlannedLesson, 'id'|'classroomId'|'teacherId'|'count'|'activity'> & Partial<PlannedLesson>
type Config = {teachingGroups?: JointTeachingGroup[]; rules?: Record<string, LessonRule>}
const signature=(lesson:Lesson, rule?:LessonRule)=>{
  const count=rule?.count??lesson.count
  if(!Number.isInteger(count)||count<1||count>40)throw Error('กำหนดจำนวนคาบสอนรวม 1–40 คาบต่อสัปดาห์')
  const pattern=rule?.pattern??lesson.pattern??Array(count).fill(1)
  if(!Array.isArray(pattern)||pattern.some(n=>!Number.isInteger(n)||n<1||n>8)||pattern.reduce((a,b)=>a+b,0)!==count)throw Error('รูปแบบคาบสอนรวมไม่ถูกต้อง')
  return JSON.stringify([count,[...pattern].sort((a,b)=>a-b),(rule?rule.roomId:lesson.roomId)??null,rule?.timePreference??lesson.timePreference??((rule?.morning??lesson.morning)?'morning':'any')])
}

export function validateJointTeachingGroups(groups:JointTeachingGroup[]|undefined, lessons:Lesson[], rules:Record<string,LessonRule>={}) {
  if(groups===undefined)return
  if(!Array.isArray(groups)||groups.length>500)throw Error('รายการกลุ่มสอนรวมไม่ถูกต้อง')
  const byId=new Map(lessons.map(lesson=>[lesson.id,lesson])),seen=new Set<string>(),ids=new Set<string>()
  for(const group of groups){
    if(!group||typeof group.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(group.id)||ids.has(group.id))throw Error('รหัสกลุ่มสอนรวมไม่ถูกต้องหรือซ้ำ')
    ids.add(group.id)
    if(!Array.isArray(group.lessonIds)||group.lessonIds.length<2||group.lessonIds.length>500)throw Error('เลือกวิชาจากอย่างน้อย 2 ห้องเพื่อสอนรวม')
    const members=group.lessonIds.map(id=>{const lesson=byId.get(id);if(!lesson||lesson.activity||seen.has(id))throw Error('วิชาในกลุ่มสอนรวมไม่พบ เป็นกิจกรรม หรือถูกใช้ในกลุ่มอื่นแล้ว');seen.add(id);return lesson})
    if(new Set(members.map(lesson=>lesson.classroomId)).size!==members.length)throw Error('กลุ่มสอนรวมต้องเลือกวิชาจากคนละห้อง')
    const teacher=members[0].teacherId
    if(!teacher||members.some(lesson=>lesson.teacherId!==teacher))throw Error('กลุ่มสอนรวมต้องมีครูคนเดียวกันครบทุกห้อง')
    if(members.some(lesson=>signature(lesson,rules[lesson.id])!==signature(members[0],rules[members[0].id])))throw Error('กลุ่มสอนรวมต้องมีจำนวนคาบ รูปแบบคาบ สถานที่ และช่วงเวลาตรงกัน กรุณาแก้ภาระสอนก่อนรวม')
    if((rules[members[0].id]?.count??members[0].count)<1)throw Error('กำหนดภาระสอนก่อนสร้างกลุ่มสอนรวม')
  }
}

/** The existing synchronization key also supports subjects, with a separate
 * namespace. activity stays false, so scores/reports/workload remain subjects. */
export function withJointTeachingGroups<T extends Lesson>(lessons:T[],config:Config,strict=false):T[] {
  if(strict)validateJointTeachingGroups(config.teachingGroups,lessons,config.rules)
  const groups=new Map((config.teachingGroups||[]).flatMap(group=>group.lessonIds.map(id=>[id,`teaching:${group.id}`] as const)))
  return lessons.map(lesson=>lesson.activity?lesson:{...lesson,activityGroupId:groups.get(lesson.id)})
}

/** Selecting one room for automatic rebuilding includes every room in each
 * connected joint group, so a partial rebuild cannot leave half a group stale. */
export function jointTeachingScope(roomIds:string[],lessons:Lesson[],groups:JointTeachingGroup[]=[]){
  const rooms=new Set(roomIds),byId=new Map(lessons.map(lesson=>[lesson.id,lesson.classroomId]));let changed=true
  while(changed){changed=false;for(const group of groups){const members=group.lessonIds.map(id=>byId.get(id)).filter((id):id is string=>!!id);if(members.some(id=>rooms.has(id)))for(const id of members)if(!rooms.has(id)){rooms.add(id);changed=true}}}
  return [...rooms]
}

export function jointTeachingSlotErrors(lessons:Lesson[],rows:{classroomId:string;lessonId:string|null;day:number;period:number}[]){
  const result:string[]=[],groups=new Map<string,Lesson[]>()
  for(const lesson of lessons)if(!lesson.activity&&lesson.activityGroupId)groups.set(lesson.activityGroupId,[...groups.get(lesson.activityGroupId)||[],lesson])
  for(const members of groups.values()){
    const cells=(id:string)=>rows.filter(row=>row.lessonId===id).map(row=>`${row.day}:${row.period}`).sort().join(',')
    if(members.some(lesson=>cells(lesson.id)!==cells(members[0].id)))result.push('วิชาสอนรวมต้องอยู่วันและคาบเดียวกันครบทุกห้อง กรุณาจัดตารางกลุ่มนี้ใหม่พร้อมกัน')
  }
  return result
}

/** Teacher views show every course code, while class views keep their own code. */
export function jointTeachingSubjectLabel<T extends {id:string;activityGroupId?:string;code?:string;name?:string}>(lesson:T,lessons:T[]){
  const members=lesson.activityGroupId?.startsWith('teaching:')?lessons.filter(member=>member.activityGroupId===lesson.activityGroupId):[lesson]
  return [[...new Set(members.map(member=>member.code).filter(Boolean))].join('/'),[...new Set(members.map(member=>member.name).filter(Boolean))].join(' / ')].filter(Boolean).join(' ')
}
