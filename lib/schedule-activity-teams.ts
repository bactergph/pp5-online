import type { PeriodTimeRow } from './schedule-helpers'
export type ActivityTeam = { id:string; settingId:string; mode:'joint'|'separate'; roomIds:string[]; teacherIds:string[]; roomTeachers:Record<string,string[]>; weeklyPeriods:number; cells:{day:number;period:number}[] }
export function activityTeachers(group:ActivityTeam,room:string){return group.mode==='joint'?group.teacherIds:group.roomTeachers[room]||[]}
export function lessonTeachers(l:{teacherId:string|null;teacherIds?:string[]}){return l.teacherIds??(l.teacherId?[l.teacherId]:[])}
export function validateActivityTeam(g:ActivityTeam,rooms:string[],teachers:string[],settings:string[],days:number[],periods:PeriodTimeRow[]){
 const uuid=(s:string)=>typeof s==='string'&&/^[-0-9a-f]{36}$/i.test(s)
 const unique=(ids:string[])=>Array.isArray(ids)&&new Set(ids).size===ids.length
 if(!g||!uuid(g.id)||!settings.includes(g.settingId)||!['joint','separate'].includes(g.mode)||!unique(g.roomIds)||!g.roomIds.length||g.roomIds.some(id=>!rooms.includes(id)))throw Error('เลือกกิจกรรมและห้องในโรงเรียนให้ถูกต้อง')
 if(!g.roomTeachers||typeof g.roomTeachers!=='object'||!Array.isArray(g.teacherIds))throw Error('กำหนดทีมครูให้ถูกต้อง')
 for(const room of g.roomIds){const ids=activityTeachers(g,room);if(!unique(ids)||ids.some(id=>!teachers.includes(id)))throw Error('ครูผู้รับผิดชอบไม่อยู่ในรายชื่อครูของโรงเรียน')}
 if(!Number.isInteger(g.weeklyPeriods)||g.weeklyPeriods<1||g.weeklyPeriods>8||!Array.isArray(g.cells)||(g.cells.length!==0&&g.cells.length!==g.weeklyPeriods)||new Set(g.cells.map(c=>`${c.day}:${c.period}`)).size!==g.cells.length||g.cells.some(c=>!days.includes(c.day)||!periods.some(p=>!p.is_break&&p.period===c.period)))throw Error('ไม่เลือกคาบเพื่อให้ระบบจัดอัตโนมัติ หรือเลือกคาบให้ครบตามชั่วโมงต่อสัปดาห์ และห้ามใช้ช่วงพัก')
}

export function activityWeeklyPeriods(value: unknown) {
 const count=Number(value)
 if(!Number.isInteger(count)||count<1||count>8)throw Error('ชั่วโมงกิจกรรมต่อสัปดาห์ต้องเป็นจำนวนเต็ม 1–8 คาบ')
 return count
}
export function activityTeamWorkload(groups:ActivityTeam[]){
 const result:Record<string,number>={}
 for(const g of groups){const teams=g.mode==='joint'?[g.teacherIds]:g.roomIds.map(id=>activityTeachers(g,id));for(const ids of teams)for(const id of ids)result[id]=(result[id]||0)+g.weeklyPeriods}
 return result
}

type RoomLesson = { id:string; classroomId:string; subjectId:string; activity?:boolean; name:string; code?:string; teacherName:string; teacherId:string|null; roomName?:string; teacherIds?:string[]; activityGroupId?:string; selectable?:boolean; count?:number; label?:string }
export type ActivityCellPlacement = { day:number; period:number; lessonId:string }
/** Cells defined in an activity team stay on that room's timetable, even when the saved slot was replaced. */
export function roomActivityDisplay(groups:ActivityTeam[], roomId:string, lessons:RoomLesson[], teacherNames:Record<string,string> = {}) {
 const extras:RoomLesson[] = []
 const cells:ActivityCellPlacement[] = []
 for (const group of groups || []) {
  if (!group.roomIds?.includes(roomId)) continue
  let lesson = lessons.find(item => item.activity && item.classroomId === roomId && item.subjectId === group.settingId)
  if (!lesson) {
   const sibling = lessons.find(item => item.activity && item.subjectId === group.settingId)
   const teacherIds = activityTeachers(group, roomId)
   const name = sibling?.name || 'กิจกรรม'
   lesson = { id:`activity-team:${group.id}:${roomId}`, classroomId:roomId, subjectId:group.settingId, activity:true, selectable:false, name, code:'', teacherId:null, teacherIds, teacherName:teacherIds.map(id => teacherNames[id] || '').filter(Boolean).join(', '), roomName:'', activityGroupId:group.mode === 'joint' ? group.id : undefined, count:group.weeklyPeriods, label:name }
   extras.push(lesson)
  }
  for (const cell of group.cells || []) cells.push({ day:Number(cell.day), period:Number(cell.period), lessonId:lesson.id })
 }
 return { lessons:extras, cells }
}
export function applyActivityDisplay<T extends { class_subject_id:string|null }>(grid:Record<string,T>, cells:ActivityCellPlacement[], blank?:T) {
 const next = { ...grid }
 for (const cell of cells) {
  const key = `${cell.day}-${cell.period}`
  const current = next[key] || blank
  if (!current) continue
  next[key] = { ...current, class_subject_id:cell.lessonId }
 }
 return next
}
