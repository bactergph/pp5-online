import { deviceTeacherLimitMessage, normalizePlan, type FreeWizardPlan } from './schedule-device-free'
import type { FreeSubstituteEntry } from '../components/schedules/FreeSubstituteDesk'
type Plan = FreeWizardPlan & { substitutes:Record<string,FreeSubstituteEntry[]> }
export type DeviceBundle = {semester:1|2;terms:{1:Plan;2:Plan}}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const text=(value:unknown)=>typeof value==='string'&&value.length<=5000
const integer=(value:unknown)=>Number.isInteger(value)
/** Reject malformed backups before they can replace the local database. No network access. */
export function readDeviceBackup(raw:unknown,teacherLimit?:number):DeviceBundle {
  const invalid=()=>{throw Error('ไฟล์สำรองไม่ถูกต้องหรือไม่ใช่ข้อมูลจัดตารางของจารย์เสก')}
  if(!record(raw)||raw.format!=='jarnsek-device-schedule'||raw.version!==1||!record(raw.data))return invalid()
  const data=raw.data
  if((data.semester!==1&&data.semester!==2)||!record(data.terms))return invalid()
  const plans:Plan[]=[]
  for(const term of [1,2]){
    const plan=data.terms[term]
    if(!record(plan))return invalid()
    const arrays=['teachers','rooms','places','subjects','timetable','days','periods','blocks','activities']
    for(const key of arrays)if(!Array.isArray(plan[key])||(plan[key] as unknown[]).length>50000)return invalid()
    const limitError=deviceTeacherLimitMessage((plan.teachers as unknown[]).length,teacherLimit)
    if(limitError)throw Error(limitError)
    const rows=(key:string)=>plan[key] as Record<string,unknown>[]
    for(const key of arrays.filter(key=>key!=='days'))if(rows(key).some(row=>!record(row)))return invalid()
    for(const key of ['teachers','rooms','places','subjects','activities'])if(rows(key).some(row=>!text(row.id)))return invalid()
    if(rows('teachers').some(row=>!text(row.name))||rows('rooms').some(row=>!text(row.label))||rows('places').some(row=>!text(row.name)))return invalid()
    if((plan.days as unknown[]).some(day=>!integer(day)||Number(day)<1||Number(day)>7))return invalid()
    if(rows('periods').some(row=>!integer(row.period)||!text(row.label)||!text(row.start_time)||!text(row.end_time)||typeof row.is_break!=='boolean'||!integer(row.sort_order)))return invalid()
    if(rows('subjects').some(row=>!text(row.roomId)||!text(row.name)||!text(row.code)||!text(row.teacherId)||!integer(row.periods)||Number(row.periods)<1||Number(row.periods)>40||!Array.isArray(row.pattern)||row.pattern.some(size=>!integer(size)||Number(size)<1||Number(size)>8)))return invalid()
    const cell=(row:Record<string,unknown>)=>!integer(row.day)||!integer(row.period)
    if(rows('timetable').some(row=>!text(row.classroomId)||!text(row.subjectId)||cell(row)||(row.activityId!==undefined&&!text(row.activityId)))||rows('blocks').some(row=>!text(row.teacherId)||cell(row)))return invalid()
    if(rows('activities').some(row=>!text(row.name)||!['joint','separate'].includes(String(row.mode))||!Array.isArray(row.roomIds)||row.roomIds.some(id=>!text(id))||!Array.isArray(row.cells)||row.cells.some(item=>!record(item)||cell(item))||!text(row.teacherId)||!record(row.roomTeachers)||Object.values(row.roomTeachers).some(id=>!text(id))||(row.teacherIds!==undefined&&(!Array.isArray(row.teacherIds)||row.teacherIds.some(id=>!text(id))))||(row.roomTeacherIds!==undefined&&(!record(row.roomTeacherIds)||Object.values(row.roomTeacherIds).some(ids=>!Array.isArray(ids)||ids.some(id=>!text(id)))))||(row.weeklyPeriods!==undefined&&(!integer(row.weeklyPeriods)||Number(row.weeklyPeriods)<1||Number(row.weeklyPeriods)>8))))return invalid()
    if(plan.substitutes!==undefined&&(!record(plan.substitutes)||Object.values(plan.substitutes).some(items=>!Array.isArray(items)||items.some(item=>!record(item)||!text(item.id)||!text(item.absentTeacherId)||!text(item.roomId)||!text(item.subjectId)||!integer(item.period)))))return invalid()
    const normalized=normalizePlan(plan as Partial<FreeWizardPlan>)
    plans.push({...normalized,substitutes:(plan.substitutes||{}) as Record<string,FreeSubstituteEntry[]>})
  }
  return {semester:data.semester,terms:{1:plans[0],2:plans[1]}}
}
