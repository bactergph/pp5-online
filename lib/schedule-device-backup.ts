import {validateJointTeachingGroups,jointTeachingSlotErrors} from './schedule-joint-teaching'
import { deviceTeacherLimitMessage, toDeviceSnapshot, normalizePlan, type FreeWizardPlan } from './schedule-device-free'
import type {LocalScheduleBundle} from './schedule-device-years'
import type { FreeSubstituteEntry } from '../components/schedules/FreeSubstituteDesk'
import { validDeviceLogo } from './schedule-device-school'
type Plan = FreeWizardPlan & { substitutes:Record<string,FreeSubstituteEntry[]> }
export type DeviceBundle=LocalScheduleBundle
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
    if(rows('teachers').some(row=>['prefix','fullName','position'].some(key=>row[key]!==undefined&&!text(row[key]))))return invalid()
    if(plan.teacherIds!==undefined&&(!Array.isArray(plan.teacherIds)||plan.teacherIds.some(id=>!text(id)||!rows('teachers').some(teacher=>teacher.id===id))||new Set(plan.teacherIds).size!==plan.teacherIds.length))return invalid()
    if(plan.activityCatalog!==undefined&&(!Array.isArray(plan.activityCatalog)||plan.activityCatalog.length>2000||plan.activityCatalog.some(item=>!record(item)||!text(item.id)||!text(item.label)||!text(item.short_label)||!integer(item.weeklyPeriods)||Number(item.weeklyPeriods)<1||Number(item.weeklyPeriods)>8)))return invalid()
    if(rows('activities').some(row=>row.settingId!==undefined&&!text(row.settingId))||rows('subjects').some(row=>row.subjectType!==undefined&&!['พื้นฐาน','เพิ่มเติม'].includes(String(row.subjectType))))return invalid()
    if((plan.days as unknown[]).some(day=>!integer(day)||Number(day)<1||Number(day)>7))return invalid()
    if(rows('periods').some(row=>!integer(row.period)||!text(row.label)||!text(row.start_time)||!text(row.end_time)||typeof row.is_break!=='boolean'||!integer(row.sort_order)))return invalid()
    if(rows('subjects').some(row=>!text(row.roomId)||!text(row.name)||!text(row.code)||!text(row.teacherId)||!integer(row.periods)||Number(row.periods)<1||Number(row.periods)>40||!Array.isArray(row.pattern)||row.pattern.some(size=>!integer(size)||Number(size)<1||Number(size)>8)))return invalid()
    const cell=(row:Record<string,unknown>)=>!integer(row.day)||!integer(row.period)
    if(rows('timetable').some(row=>!text(row.classroomId)||!text(row.subjectId)||cell(row)||(row.activityId!==undefined&&!text(row.activityId)))||rows('blocks').some(row=>!text(row.teacherId)||cell(row)))return invalid()
    if(rows('activities').some(row=>!text(row.name)||!['joint','separate'].includes(String(row.mode))||!Array.isArray(row.roomIds)||row.roomIds.some(id=>!text(id))||!Array.isArray(row.cells)||row.cells.some(item=>!record(item)||cell(item))||!text(row.teacherId)||!record(row.roomTeachers)||Object.values(row.roomTeachers).some(id=>!text(id))||(row.teacherIds!==undefined&&(!Array.isArray(row.teacherIds)||row.teacherIds.some(id=>!text(id))))||(row.roomTeacherIds!==undefined&&(!record(row.roomTeacherIds)||Object.values(row.roomTeacherIds).some(ids=>!Array.isArray(ids)||ids.some(id=>!text(id)))))||(row.weeklyPeriods!==undefined&&(!integer(row.weeklyPeriods)||Number(row.weeklyPeriods)<1||Number(row.weeklyPeriods)>8))))return invalid()
    if(plan.substitutes!==undefined&&(!record(plan.substitutes)||Object.values(plan.substitutes).some(items=>!Array.isArray(items)||items.some(item=>!record(item)||!text(item.id)||!text(item.absentTeacherId)||!text(item.roomId)||!text(item.subjectId)||!integer(item.period)))))return invalid()
    if(rows('subjects').some(row=>(row.timePreference!==undefined&&!['any','morning','afternoon'].includes(String(row.timePreference)))||(row.spread!==undefined&&typeof row.spread!=='boolean')||(row.subjectGroup!==undefined&&!text(row.subjectGroup))||(row.shortName!==undefined&&(!text(row.shortName)||String(row.shortName).length>200))))return invalid()
    if(plan.document!==undefined&&(!record(plan.document)||['schoolName','academicYear','printDate','academicHeadName','directorName'].some(key=>!text((plan.document as Record<string,unknown>)[key]))))return invalid()
    if(record(plan.document)&&plan.document.logoDataUrl!==undefined&&!validDeviceLogo(plan.document.logoDataUrl))return invalid()
    if(plan.reduceGaps!==undefined&&typeof plan.reduceGaps!=='boolean'||plan.maxContinuous!==undefined&&(!integer(plan.maxContinuous)||Number(plan.maxContinuous)<0||Number(plan.maxContinuous)>8))return invalid()
    const normalized=normalizePlan(plan as Partial<FreeWizardPlan>)
    const snapshot=toDeviceSnapshot(normalized,[])
    validateJointTeachingGroups(normalized.teachingGroups,snapshot.lessons)
    if(jointTeachingSlotErrors(snapshot.lessons,normalized.timetable.map(cell=>({classroomId:cell.classroomId,lessonId:cell.subjectId||null,day:cell.day,period:cell.period,locked:!!cell.locked}))).length)return invalid()
    plans.push({...normalized,substitutes:(plan.substitutes||{}) as Record<string,FreeSubstituteEntry[]>})
  }
  const merge=<T extends {id:string}>(a:T[],b:T[])=>[...new Map([...b,...a].map(item=>[item.id,item])).values()]
  const teachers=merge(plans[0].teachers,plans[1].teachers),rooms=merge(plans[0].rooms,plans[1].rooms),places=merge(plans[0].places,plans[1].places)
  const combinedLimit=deviceTeacherLimitMessage(teachers.length,teacherLimit)
  if(combinedLimit)throw Error(combinedLimit)
  const archives:NonNullable<LocalScheduleBundle['archives']>={}
  if(data.year!==undefined&&(typeof data.year!=='string'||!/^2\d{3}$/.test(data.year)))return invalid()
  if(data.archives!==undefined){
    if(!record(data.archives)||Object.keys(data.archives).length>30)return invalid()
    for(const [year,workspace] of Object.entries(data.archives)){
      if(!/^2\d{3}$/.test(year)||!record(workspace)||workspace.archives!==undefined)return invalid()
      const restored=readDeviceBackup({format:'jarnsek-device-schedule',version:1,data:workspace},teacherLimit)
      archives[year]={semester:restored.semester,terms:restored.terms}
    }
  }
  return {year:data.year as string|undefined,archives,semester:data.semester,terms:{1:{...plans[0],teachers,rooms,places},2:{...plans[1],teachers,rooms,places}}}
}
