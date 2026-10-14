import type { PeriodTimeRow } from './schedule-helpers'
export type ActivityTeam = { id:string; settingId:string; mode:'joint'|'separate'; roomIds:string[]; teacherIds:string[]; roomTeachers:Record<string,string[]>; weeklyPeriods:number; cells:{day:number;period:number}[] }
export function activityTeachers(group:ActivityTeam,room:string){return group.mode==='joint'?group.teacherIds:group.roomTeachers[room]||[]}
export function lessonTeachers(l:{teacherId:string|null;teacherIds?:string[]}){return l.teacherIds??(l.teacherId?[l.teacherId]:[])}
export function validateActivityTeam(g:ActivityTeam,rooms:string[],teachers:string[],settings:string[],days:number[],periods:PeriodTimeRow[]){
 const uuid=(s:string)=>typeof s==='string'&&/^[-0-9a-f]{36}$/i.test(s)
 const unique=(ids:string[])=>Array.isArray(ids)&&new Set(ids).size===ids.length
 if(!g||!uuid(g.id)||!settings.includes(g.settingId)||!['joint','separate'].includes(g.mode)||!unique(g.roomIds)||!g.roomIds.length||g.roomIds.some(id=>!rooms.includes(id)))throw Error('เลือกกิจกรรมและห้องในโรงเรียนให้ถูกต้อง')
 if(!g.roomTeachers||typeof g.roomTeachers!=='object'||!Array.isArray(g.teacherIds))throw Error('กำหนดทีมครูให้ถูกต้อง')
 for(const room of g.roomIds){const ids=activityTeachers(g,room);if(!unique(ids)||!ids.length||ids.some(id=>!teachers.includes(id)))throw Error('เลือกครูผู้รับผิดชอบให้ครบทุกห้อง')}
 if(!Number.isInteger(g.weeklyPeriods)||g.weeklyPeriods<1||g.weeklyPeriods>8||!Array.isArray(g.cells)||g.cells.length!==g.weeklyPeriods||new Set(g.cells.map(c=>`${c.day}:${c.period}`)).size!==g.cells.length||g.cells.some(c=>!days.includes(c.day)||!periods.some(p=>!p.is_break&&p.period===c.period)))throw Error('เลือกวันและคาบให้ครบตามคาบต่อสัปดาห์ และห้ามใช้ช่วงพัก')
}
export function activityTeamWorkload(groups:ActivityTeam[]){
 const result:Record<string,number>={}
 for(const g of groups){const teams=g.mode==='joint'?[g.teacherIds]:g.roomIds.map(id=>activityTeachers(g,id));for(const ids of teams)for(const id of ids)result[id]=(result[id]||0)+g.weeklyPeriods}
 return result
}
