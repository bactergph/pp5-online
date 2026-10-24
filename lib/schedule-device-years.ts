import {normalizePlan,type FreeWizardPlan} from './schedule-device-free'
import type {FreeSubstituteEntry} from '../components/schedules/FreeSubstituteDesk'
type Plan=FreeWizardPlan&{substitutes:Record<string,FreeSubstituteEntry[]>}
type Workspace={semester:1|2;terms:{1:Plan;2:Plan}}
export type LocalScheduleBundle=Workspace&{year?:string;archives?:Record<string,Workspace>}
export function deviceSchoolYear(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'numeric'}).formatToParts(date)
  return String(Number(parts.find(part=>part.type==='year')?.value)+543-(Number(parts.find(part=>part.type==='month')?.value)<4?1:0))
}
export function deviceYear(bundle:LocalScheduleBundle){return bundle.year||bundle.terms[bundle.semester].document?.academicYear||deviceSchoolYear()}
export function switchDeviceYear(bundle:LocalScheduleBundle,target:string):LocalScheduleBundle{
  if(!/^2\d{3}$/.test(target))throw Error('ระบุปีการศึกษา พ.ศ. 4 หลัก เช่น 2569')
  const year=deviceYear(bundle)
  if(target===year)return bundle
  const archives={...bundle.archives,[year]:{semester:bundle.semester,terms:bundle.terms}}
  if(!archives[target]&&Object.keys(archives).length>30)throw Error('เก็บได้สูงสุด 31 ปีการศึกษาต่อไฟล์ กรุณาดาวน์โหลดสำเนาแยกก่อนเพิ่มปีใหม่')
  const current=bundle.terms[bundle.semester]
  const blank=():Plan=>({...normalizePlan({teachers:current.teachers,rooms:current.rooms,places:current.places,days:current.days,periods:current.periods,activityCatalog:current.activityCatalog,document:{schoolName:'',printDate:'',academicHeadName:'',directorName:'',...current.document,academicYear:target}}),substitutes:{}})
  const selected=archives[target]||{semester:1 as const,terms:{1:blank(),2:blank()}}
  delete archives[target]
  return {...selected,year:target,archives}
}
