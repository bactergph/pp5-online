'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {usePathname} from 'next/navigation'
import Swal from 'sweetalert2'
import {readFreePlan,writeFreePlan} from '@/lib/schedule-device-cache'
import {readDeviceBackup} from '@/lib/schedule-device-backup'
import {normalizePlan,deviceActivityCatalog,FREE_SCHEDULE_TEACHER_LIMIT,type FreeWizardPlan} from '@/lib/schedule-device-free'
import {deviceYear,deviceSchoolYear,switchDeviceYear,type LocalScheduleBundle} from '@/lib/schedule-device-years'
import {deviceScheduleView} from '@/lib/schedule-device-navigation'
import {createDeviceScheduleServices} from '@/lib/schedule-device-services'
import type {FreeSubstituteEntry} from './FreeSubstituteDesk'
import {ScheduleServicesProvider,type ScheduleOperations} from './ScheduleServices'
import ClassScheduleEntry from './ClassScheduleEntry'
import TeachingScheduleEntry from './TeachingScheduleEntry'
import ScheduleConflictsEntry from './ScheduleConflictsEntry'
import SubstituteScheduleEntry from './SubstituteScheduleEntry'
import PeriodTimesEntry from './PeriodTimesEntry'
import ScheduleWorkloadEntry from './ScheduleWorkloadEntry'
import ScheduleExportEntry from './ScheduleExportEntry'
import './free-schedule.css'
import './schedule-workspace.css'
export type LiveFreeAd={title:string;href:string;imageUrl:string}
type DeskTier='school'|'free'|'pro'
type FreePlan=FreeWizardPlan&{substitutes:Record<string,FreeSubstituteEntry[]>}
type FreeBundle=LocalScheduleBundle
function blankPlan(shared?: Partial<FreePlan>): FreePlan {
  const base = normalizePlan(shared)
  return { ...base, subjects: shared?.subjects ? base.subjects : [], timetable: shared?.timetable || [], substitutes: shared?.substitutes || {}, blocks: shared?.blocks || [], activities: shared?.activities ? base.activities : [] }
}

function shareFields(source: FreePlan, target: FreePlan): FreePlan {
  return { ...target, teachers: source.teachers, rooms: source.rooms, places: source.places, activityCatalog:source.activityCatalog, days: source.days, periods: source.periods, blocks:target.blocks.filter(block=>source.teachers.some(teacher=>teacher.id===block.teacherId)) }
}

function asBundle(raw?: Partial<FreeBundle> & Partial<FreePlan>): FreeBundle {
  const metadata={year:raw?.year||deviceSchoolYear(),archives:raw?.archives||{}}
  const stored = raw?.terms
  if (stored) {
    const second=blankPlan(stored[2]),first=blankPlan(stored[1])
    const merge=<T extends {id:string}>(a:T[],b:T[])=>[...new Map([...b,...a].map(item=>[item.id,item])).values()]
    first.activityCatalog=merge(deviceActivityCatalog(first),deviceActivityCatalog(second));first.teachers=merge(first.teachers,second.teachers);first.rooms=merge(first.rooms,second.rooms);first.places=merge(first.places,second.places)
    return { ...metadata,semester: raw?.semester === 2 ? 2 : 1, terms: { 1: first, 2: shareFields(first, second) } }
  }
  const term = blankPlan(raw)
  return {...metadata,semester:raw?1:(new Date().getMonth()>=9||new Date().getMonth()<3?2:1),terms: { 1: term, 2: shareFields(term, blankPlan()) } }
}


export default function FreeScheduleDesk({ad=null}:{tier:DeskTier;ad?:LiveFreeAd|null}) {
  const pathname=usePathname(),[bundle,setBundle]=useState<FreeBundle>(()=>asBundle()),[ready,setReady]=useState(false)
  const [status,setStatus]=useState('กำลังเปิดฐานข้อมูลในเครื่อง…'),[error,setError]=useState(''),[failed,setFailed]=useState(false),[saving,setSaving]=useState(false)
  const [revision,setRevision]=useState(0),[computing,setComputing]=useState(false),[yearDraft,setYearDraft]=useState('')
  const [operations,setOperations]=useState<ScheduleOperations|null>(null)
  const [schoolDraft,setSchoolDraft]=useState<NonNullable<FreeWizardPlan['document']>|null>(null)
  const [guard,setGuard]=useState({dirty:false,busy:false}),[routeStep,setRouteStep]=useState(1)
  const latest=useRef(bundle),expected=useRef(''),queue=useRef(Promise.resolve(true)),failure=useRef(false),pending=useRef(0),controller=useRef<AbortController|null>(null),previousPath=useRef(pathname)
  const [visiblePath,setVisiblePath]=useState(pathname)
  const data=bundle.terms[bundle.semester]
  const write=useCallback(async(next:FreeBundle)=>{
    pending.current++;latest.current=next;setBundle(next);setSaving(true);setStatus('กำลังบันทึกลงเครื่อง…')
    const result=queue.current.then(async()=>{
      if(failure.current)return false
      try{const saved=new Date(Math.max(Date.now(),(Date.parse(expected.current)||0)+1)).toISOString();await writeFreePlan(next,saved,expected.current);expected.current=saved;setStatus('บันทึกบนเครื่องแล้ว');return true}
      catch(cause){failure.current=true;setFailed(true);setError(cause instanceof Error?cause.message:'บันทึกลงเครื่องไม่สำเร็จ');setStatus('ยังไม่บันทึก — ดาวน์โหลดสำเนาก่อนปิดหน้านี้');return false}
    }).finally(()=>{pending.current--;if(!pending.current)setSaving(false)})
    queue.current=result;return result
  },[])
  useEffect(()=>{let active=true;readFreePlan<FreeBundle&FreePlan>().then(row=>{
    if(!active)return
    const next=asBundle(row?.data);latest.current=next;expected.current=row?.savedAt||'';setBundle(next)
    setOperations(createDeviceScheduleServices({read:()=>latest.current,write,onComputing:abort=>{controller.current=abort;setComputing(!!abort)}}))
    setReady(true);setStatus(row?'เปิดข้อมูลจากเครื่องแล้ว':'พร้อมบันทึกข้อมูลบนเครื่องนี้')
  }).catch(error=>{if(active)setError(error instanceof Error?error.message:'เปิดฐานข้อมูลในเครื่องไม่ได้')});return()=>{active=false}},[write])

  useEffect(()=>{const unload=(event:BeforeUnloadEvent)=>{if(saving||computing||guard.dirty||guard.busy){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload)},[saving,computing,guard])
  useEffect(()=>{
    let active=true
    async function route(){
      const previous=previousPath.current
      if(previous!==pathname&&(saving||computing||guard.busy)){window.history.replaceState(null,'',previous);return}
      if(previous!==pathname&&guard.dirty){
        const answer=await Swal.fire({icon:'question',title:'ออกจากหน้าที่กำลังแก้ไข?',text:'ข้อมูลที่ยังไม่บันทึกและฉบับร่างจะถูกปิด',showCancelButton:true,confirmButtonText:'ออกจากหน้า',cancelButtonText:'แก้ไขต่อ'})
        if(!active)return
        if(!answer.isConfirmed){window.history.replaceState(null,'',previous);return}
      }
      previousPath.current=pathname;setVisiblePath(pathname)
      const step=Number(new URLSearchParams(window.location.search).get('step'));setRouteStep(step>=1&&step<=7?step:1)
    }
    void route();return()=>{active=false}
  },[pathname,saving,computing,guard])
  useEffect(()=>{const route=()=>{const step=Number(new URLSearchParams(window.location.search).get('step'));if(step>=1&&step<=7){setRouteStep(step);setRevision(value=>value+1)}};window.addEventListener('device-schedule-navigate',route);return()=>window.removeEventListener('device-schedule-navigate',route)},[])
  function backup(){const blob=new Blob([JSON.stringify({format:'jarnsek-device-schedule',version:1,data:latest.current},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='jarnsek-device-schedule.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
  async function restore(file:File){
    try{
      const next=asBundle(readDeviceBackup(JSON.parse(await file.text()),FREE_SCHEDULE_TEACHER_LIMIT))
      if(!(await Swal.fire({icon:'warning',title:'แทนที่ข้อมูลในเครื่องด้วยไฟล์สำรอง?',showCancelButton:true,confirmButtonText:'นำเข้า',cancelButtonText:'ยกเลิก'})).isConfirmed)return
      if(await write(next)){setRevision(value=>value+1);setGuard({dirty:false,busy:false})}
    }catch(error){setError(error instanceof Error?error.message:'นำเข้าไฟล์ไม่สำเร็จ')}
  }
  const view=deviceScheduleView(visiblePath)
  const schoolDocument=data.document||{schoolName:'',academicYear:deviceYear(bundle),printDate:'',academicHeadName:'',directorName:''}
  const blocked=saving||computing||guard.busy||guard.dirty||failed
  return <section className="device-schedule-workspace">
    <div className="local-storage-bar"><div role="status"><strong>จัดตารางสอนฟรี · ครูไม่เกิน 25 คน</strong><small>{status} · ข้อมูลและการประมวลผลอยู่บนอุปกรณ์นี้</small></div><div className="actions"><button type="button" disabled={!ready} onClick={backup}>ดาวน์โหลดสำเนาข้อมูล</button><label className="local-restore">นำเข้าไฟล์สำรอง<input type="file" accept=".json,application/json" disabled={!ready||blocked} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void restore(file)}}/></label></div></div>
    {computing&&<p className="prep-working" role="status">กำลังประมวลผลบนเครื่องนี้… <button type="button" onClick={()=>controller.current?.abort()}>ยกเลิกการจัดตาราง</button></p>}
    {error&&<p className="prep-error" role="alert">{error}</p>}
    {!ready||!operations?<p role="status">กำลังเปิดข้อมูลในเครื่อง…</p>:<>
      {ad&&<LiveAd ad={ad}/>}
      <details className="device-school-settings"><summary>ข้อมูลโรงเรียนและปีการศึกษาในเครื่อง</summary><fieldset disabled={blocked}>
        <label>ชื่อโรงเรียน<input value={(schoolDraft||schoolDocument).schoolName} onChange={event=>setSchoolDraft({...schoolDraft||schoolDocument,schoolName:event.target.value})}/></label>
        <label>หัวหน้าวิชาการ<input value={(schoolDraft||schoolDocument).academicHeadName} onChange={event=>setSchoolDraft({...schoolDraft||schoolDocument,academicHeadName:event.target.value})}/></label>
        <label>ผู้อำนวยการ<input value={(schoolDraft||schoolDocument).directorName} onChange={event=>setSchoolDraft({...schoolDraft||schoolDocument,directorName:event.target.value})}/></label>
        <button type="button" disabled={!schoolDraft} onClick={()=>{if(schoolDraft)void write({...latest.current,terms:{1:{...latest.current.terms[1],document:schoolDraft},2:{...latest.current.terms[2],document:schoolDraft}}}).then(saved=>{if(saved){setSchoolDraft(null);setRevision(value=>value+1)}})}}>บันทึกข้อมูลโรงเรียน</button>
        <form onSubmit={event=>{event.preventDefault();try{void write(switchDeviceYear(latest.current,yearDraft)).then(saved=>{if(saved){setRevision(value=>value+1);setYearDraft('')}})}catch(error){setError(error instanceof Error?error.message:'เพิ่มปีไม่สำเร็จ')}}}><label>เพิ่ม / เปิดปีการศึกษา<input aria-label="ปีการศึกษาในเครื่อง" placeholder="เช่น 2570" value={yearDraft} onChange={event=>setYearDraft(event.target.value)} inputMode="numeric" pattern="2[0-9]{3}" required/></label><button type="submit">เปิดปีการศึกษา</button></form>
      </fieldset></details>
      <ScheduleServicesProvider operations={operations} local onGuard={setGuard}>
        <fieldset className="device-shared-content" disabled={failed} key={revision+':'+view}>
          {view==='manage'?<ClassScheduleEntry mode="manage" initialWorkspace="prepare" initialStep={routeStep}/>:view==='class'?<ClassScheduleEntry mode="view"/>:view==='teaching'?<TeachingScheduleEntry/>:view==='period-times'?<PeriodTimesEntry/>:view==='substitute'?<SubstituteScheduleEntry/>:view==='conflicts'?<ScheduleConflictsEntry/>:view==='workload'?<ScheduleWorkloadEntry/>:<ScheduleExportEntry/>}
        </fieldset>
      </ScheduleServicesProvider>
    </>}
  </section>
}
function LiveAd({ad}:{ad:LiveFreeAd}){
  const body=<>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {ad.imageUrl&&<img src={ad.imageUrl} alt={ad.title||'โฆษณา'}/>}
    <span><small>โฆษณา</small><strong>{ad.title||ad.href}</strong></span>
  </>
  return ad.href?<a className="ad-live" href={ad.href} target="_blank" rel="noopener noreferrer">{body}</a>:<div className="ad-live">{body}</div>
}
