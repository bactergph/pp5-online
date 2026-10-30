import { SUBJECT_GROUPS, SUBJECT_ROW_LIMIT, matchClassroomLabel } from './schedule-input'
import { SCHEDULE_WEEKS_PER_YEAR } from './schedule-helpers'

export type CentralScheduleSubject = {
  code: string; name: string; subject_group: string; type: string; hours_per_year: number; sort_order: number
  level?: string; credits?: number; semester?: number
}
export type CentralSubjectRoom = { id: string; level: string; name: string; room: number }

export function primarySubjectGrade(code: string) {
  const match=code.replace(/\s/g,'').match(/^[^\d\s]+1([1-6])\d{3}$/u)
  return match?Number(match[1]):null
}
export function primaryRoomGrade(level: string) {
  const normalized=level.normalize('NFKC').replace(/[๐-๙]/g,digit=>String(digit.charCodeAt(0)-0x0e50)).replace(/[\s\u200B-\u200D\uFEFF]/g,'').replace(/^ชั้น/,'')
  const match=normalized.match(/^(?:ป\.?|ประถม(?:ศึกษา)?(?:ปีที่)?)([1-6])$/u)
  return match?Number(match[1]):null
}
export function centralSubjectPeriods(subject: CentralScheduleSubject) {
  if(centralSubjectLevel(subject)?.startsWith('ม.')&&Number(subject.credits)>0)return Math.max(1,Math.round(Number(subject.credits)*2))
  const hours=Number(subject.hours_per_year)
  return Number.isFinite(hours)&&hours>0?Math.max(1,Math.round(hours/SCHEDULE_WEEKS_PER_YEAR)):0
}
export function centralSubjectProblem(subject: CentralScheduleSubject) {
  if(!centralSubjectLevel(subject))return 'ยังไม่ได้ระบุชั้นของรายวิชาในข้อมูลกลาง'
  if(!subject.name.trim())return 'ยังไม่มีชื่อวิชา'
  if(!SUBJECT_GROUPS.includes(subject.subject_group))return 'กลุ่มสาระไม่ตรงกับระบบจัดตาราง'
  if(!['พื้นฐาน','เพิ่มเติม'].includes(subject.type))return 'รองรับรายวิชาพื้นฐานและเพิ่มเติม'
  const count=centralSubjectPeriods(subject)
  return !count||count>40?'กรุณากำหนดชั่วโมงต่อปีในโครงสร้างกลางให้ถูกต้อง':null
}

export function centralRoomLevel(level:string):string|null {
  const primary=primaryRoomGrade(level)
  if(primary)return `ป.${primary}`
  const normalized=level.normalize('NFKC').replace(/[๐-๙]/g,d=>String(d.charCodeAt(0)-0x0e50)).replace(/[\s\u200B-\u200D\uFEFF]/g,'').replace(/^ชั้น/,'')
  const match=normalized.match(/^(?:ม\.?|มัธยม(?:ศึกษา)?(?:ปีที่)?)([1-6])$/u)
  return match?`ม.${match[1]}`:null
}
export function centralSubjectLevel(subject:Pick<CentralScheduleSubject,'code'|'level'>):string|null {
  if(subject.level?.trim())return centralRoomLevel(subject.level)
  const primary=primarySubjectGrade(subject.code)
  if(primary)return `ป.${primary}`
  const match=subject.code.replace(/\s/g,'').match(/^[^\d]+([23])([1-3])\d{3}$/u)
  return match?`ม.${Number(match[2])+(match[1]==='3'?3:0)}`:null
}
export function centralSubjectKey(subject:Pick<CentralScheduleSubject,'code'|'level'>){return `${centralSubjectLevel(subject)||''}|${subject.code.trim().toLowerCase()}`}

/** Prepare new room/code pairs only. Existing assignments and staged edits win. */
export function prepareCentralSubjects(catalog: CentralScheduleSubject[],rooms: CentralSubjectRoom[],roomIds: string[],codes: string[],existing: {classroomId:string;code:string;activity?:boolean}[],staged: string[][]) {
  const chosen=new Set(codes.map(code=>code.trim().toLowerCase())),targets=rooms.filter(room=>roomIds.includes(room.id))
  const key=(room:string,code:string)=>room+':'+code.replace(/\s+/g,'').toLowerCase()
  const known=new Set(existing.filter(lesson=>!lesson.activity).map(lesson=>key(lesson.classroomId,lesson.code)))
  const names=rooms.map(room=>({id:room.id,name:`${room.level}/${room.name}`,numeric:`${room.level}/${room.room}`}))
  for(const row of staged){const room=matchClassroomLabel(row[0]||'',names);if(room&&row[1]?.trim())known.add(key(room.id,row[1]))}
  const rows:string[][]=[];let skipped=0
  for(const room of targets)for(const subject of catalog){
    if((!chosen.has(subject.code.trim().toLowerCase())&&!chosen.has(centralSubjectKey(subject)))||centralRoomLevel(room.level)!==centralSubjectLevel(subject))continue
    if(centralSubjectProblem(subject))continue
    const id=key(room.id,subject.code)
    if(known.has(id)){skipped++;continue}
    known.add(id)
    rows.push([`${room.level}/${room.name}`,subject.code.trim(),subject.name.trim(),String(centralSubjectPeriods(subject)),subject.subject_group,subject.type])
  }
  const stagedCount=staged.filter(row=>row.some(cell=>cell.trim())).length
  return {rows,skipped,overLimit:stagedCount+rows.length>SUBJECT_ROW_LIMIT}
}
