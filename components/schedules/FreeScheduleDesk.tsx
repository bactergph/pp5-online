'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import {usePathname} from 'next/navigation'
import {deviceScheduleView,deviceScheduleHref,type DeviceScheduleView} from '@/lib/schedule-device-navigation'
import {changeDeviceCell,lockDeviceCell,blockDeviceTeacher,moveDeviceCell,clearDeviceCells,type DeviceClearScope} from '@/lib/schedule-device-operations'
import FreeScheduleDocuments from './FreeScheduleDocuments'
import {deviceYear,deviceSchoolYear,switchDeviceYear,type LocalScheduleBundle} from '@/lib/schedule-device-years'
import {deviceWorkload} from '@/lib/schedule-device-documents'
import { FiCalendar, FiGrid, FiRepeat, FiUsers, FiZap } from 'react-icons/fi'
import { SCHEDULE_DAYS, isTimetableClassroom } from '@/lib/schedules'
import { type DeviceDraft } from '@/lib/schedule-device-build'
import { readFreePlan, writeFreePlan } from '@/lib/schedule-device-cache'
import { solveScheduleOnDevice } from '@/lib/schedule-device-run'
import { FREE_SCHEDULE_TEACHER_LIMIT, deviceTeacherLimitMessage, freeActivityTeachers, copyTermSubjects, normalizePlan, roomNeed, slotCapacity, toDeviceSnapshot, type FreeWizardPlan } from '@/lib/schedule-device-free'
import FreeSubstituteDesk, { type FreeSubstituteEntry } from '@/components/schedules/FreeSubstituteDesk'
import FreeScheduleWizard, { FreePlanBoard } from '@/components/schedules/FreeScheduleWizard'
import ScheduleGridTable from './ScheduleGridTable'
import ScheduleReviewStep from './ScheduleReviewStep'
import { deviceDataKey, devicePreparation, devicePreflight, deviceDraftView, localDraftCells } from '@/lib/schedule-device-view'
import type { PlanningIssue } from '@/lib/schedule-planning'
import { readDeviceBackup } from '@/lib/schedule-device-backup'
import './schedule-workspace.css'
import './free-schedule.css'
export type LiveFreeAd = { title: string; href: string; imageUrl: string }

type DeskTier = 'school' | 'free' | 'pro'
type FreePlan = FreeWizardPlan & { substitutes: Record<string, FreeSubstituteEntry[]> }
type FreeBundle=LocalScheduleBundle

function blankPlan(shared?: Partial<FreePlan>): FreePlan {
  const base = normalizePlan(shared)
  return { ...base, subjects: shared?.subjects ? base.subjects : [], timetable: shared?.timetable || [], substitutes: shared?.substitutes || {}, blocks: shared?.blocks || [], activities: shared?.activities ? base.activities : [] }
}

function shareFields(source: FreePlan, target: FreePlan): FreePlan {
  return { ...target, teachers: source.teachers, rooms: source.rooms, places: source.places, days: source.days, periods: source.periods, blocks:target.blocks.filter(block=>source.teachers.some(teacher=>teacher.id===block.teacherId)) }
}

function asBundle(raw?: Partial<FreeBundle> & Partial<FreePlan>): FreeBundle {
  const metadata={year:raw?.year||deviceSchoolYear(),archives:raw?.archives||{}}
  const stored = raw?.terms
  if (stored) {
    const second=blankPlan(stored[2]),first=blankPlan(stored[1])
    const merge=<T extends {id:string}>(a:T[],b:T[])=>[...new Map([...b,...a].map(item=>[item.id,item])).values()]
    first.teachers=merge(first.teachers,second.teachers);first.rooms=merge(first.rooms,second.rooms);first.places=merge(first.places,second.places)
    return { ...metadata,semester: raw?.semester === 2 ? 2 : 1, terms: { 1: first, 2: shareFields(first, second) } }
  }
  const term = blankPlan(raw)
  return {...metadata,semester:raw?1:(new Date().getMonth()>=9||new Date().getMonth()<3?2:1),terms: { 1: term, 2: shareFields(term, blankPlan()) } }
}

export default function FreeScheduleDesk({ ad = null }: { tier: DeskTier; ad?: LiveFreeAd | null }) {
  const pathname=usePathname()
  const [bundle, setBundle] = useState<FreeBundle>(() => asBundle())
  const data = bundle.terms[bundle.semester]
  const teacherLimit=FREE_SCHEDULE_TEACHER_LIMIT
  const teacherLimitError=deviceTeacherLimitMessage(data.teachers.length,teacherLimit)
  const [ready, setReady] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [previewRoom, setPreviewRoom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<DeviceDraft | null>(null)
  const [mode, setMode] = useState<'class'|'teacher'|'wizard'|'substitute'|'conflicts'|'print'|'workload'>('class')
  const [wizardStep, setWizardStep] = useState(1)
  const [lockTeacher, setLockTeacher] = useState('')
  const [moveSource,setMoveSource]=useState<FreeWizardPlan['timetable'][number]|null>(null)
  const previousPath=useRef(pathname),approvedPath=useRef(pathname),pendingPick=useRef(''),routeInitialized=useRef(false),[substituteDirty,setSubstituteDirty]=useState(false)
  const [picked, setPicked] = useState(''),[restoreCount,setRestoreCount]=useState(0)
  const [scope,setScope] = useState<string[]>([]),[clear,setClear] = useState(true),[issues,setIssues] = useState<PlanningIssue[]|null>(null),[activityDirty,setActivityDirty] = useState(false)
  const [storageError,setStorageError] = useState(false)
  const [storageStatus,setStorageStatus] = useState(''),[saving,setSaving] = useState(false)
  const latest = useRef(bundle), expectedSave = useRef(''), queue = useRef(Promise.resolve(true)), failedSave = useRef(false), runLock = useRef(false)
  const draftBase = useRef(''), abort = useRef<AbortController|null>(null), pendingWrites = useRef(0)
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(busy||saving||activityDirty||substituteDirty||draft){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[busy,saving,activityDirty,substituteDirty,draft])

  useEffect(()=>{
    if(routeInitialized.current&&previousPath.current===pathname)return
    let active=true
    async function applyRoute(){
      const previous=previousPath.current
      if(pathname!==previous&&(busy||activityDirty||substituteDirty)){
        if(busy&&approvedPath.current!==pathname){window.history.replaceState(null,'',previous);return}
        const answer=await Swal.fire({icon:'question',title:'ออกจากหน้าที่กำลังแก้ไข?',text:'ข้อมูลที่ยังไม่กดบันทึกจะไม่ถูกเก็บ',showCancelButton:true,confirmButtonText:'ออกจากหน้า',cancelButtonText:'แก้ไขต่อ'})
        if(!active)return
        if(!answer.isConfirmed){window.history.replaceState(null,'',previous);return}
        setActivityDirty(false);setSubstituteDirty(false)
      }
      routeInitialized.current=true;previousPath.current=pathname
      const view=deviceScheduleView(pathname)
      setMode(view==='manage'||view==='period-times'?'wizard':view==='teaching'?'teacher':view)
      if(view==='period-times')setWizardStep(1)
      setPicked(pendingPick.current);pendingPick.current='';setMoveSource(null)
    }
    void applyRoute()
    return()=>{active=false}
  },[pathname,busy,activityDirty,substituteDirty])
  function navigate(view:DeviceScheduleView){const path=deviceScheduleHref(pathname,view);approvedPath.current=path;window.history.pushState(null,'',path)}

  useEffect(() => {
    let active = true
    readFreePlan<FreeBundle & FreePlan>().then(row => {
      if (!active) return
      const next = asBundle(row?.data)
      setBundle(next)
      const plan = next.terms[next.semester]
      if (row?.savedAt) setSavedAt(row.savedAt)
      expectedSave.current = row?.savedAt || ''; latest.current = next; setScope(plan.rooms.filter(room=>isTimetableClassroom(room.label.split("/")[0])).map(room=>room.id))
      setPreviewRoom(plan.rooms[0]?.id || '')
      setLockTeacher(plan.teachers[0]?.id || '')
      setReady(true)
    }).catch(cause => { if(active)setError(cause instanceof Error ? cause.message : 'เปิดฐานข้อมูลบนเครื่องไม่ได้') })
    return () => { active = false }
  }, [])

  function commit(next: FreeBundle) {
    pendingWrites.current+=1
    latest.current=next;setBundle(next);setSaving(true);setStorageStatus('กำลังบันทึกลงเครื่อง…')
    queue.current=queue.current.then(async()=>{
      if(failedSave.current){setStorageStatus('ยังไม่บันทึก — ดาวน์โหลดสำเนาก่อนปิดหน้านี้');return false}
      const saved=new Date(Math.max(Date.now(),(Date.parse(expectedSave.current)||0)+1)).toISOString()
      try { await writeFreePlan(next,saved,expectedSave.current);expectedSave.current=saved;setSavedAt(saved);setStorageStatus('บันทึกบนเครื่องแล้ว');return true }
      catch(cause){failedSave.current=true;setStorageError(true);setError(cause instanceof Error?cause.message:'บันทึกลงเครื่องไม่สำเร็จ');setStorageStatus('ยังไม่บันทึก — ดาวน์โหลดสำเนาก่อนปิดหน้านี้');return false}
    }).finally(()=>{pendingWrites.current-=1;if(!pendingWrites.current)setSaving(false)})
    return queue.current
  }
  function persist(next:FreePlan,syncShared=false){
    const current=latest.current,other=current.semester===1?2:1
    return commit({...current,terms:{...current.terms,[current.semester]:next,[other]:syncShared?shareFields(next,current.terms[other]):current.terms[other]}})
  }
  function saveWizard(next:FreeWizardPlan){
    const limitError=deviceTeacherLimitMessage(next.teachers.length,teacherLimit)
    if(limitError&&next.teachers.length>data.teachers.length){setError(limitError);return false}
    const other=latest.current.terms[latest.current.semester===1?2:1]
    const removed=other.teachers.filter(teacher=>!next.teachers.some(item=>item.id===teacher.id))
    if(removed.some(teacher=>other.subjects.some(subject=>subject.teacherId===teacher.id)||other.activities.some(activity=>activity.roomIds.some(room=>freeActivityTeachers(activity,room).includes(teacher.id)))||[other.substitutes,next.substitutes||{}].some(entries=>Object.values(entries).flat().some(entry=>entry.absentTeacherId===teacher.id||entry.substituteTeacherId===teacher.id)))){setError('ครูที่ลบยังมีภาระสอน กิจกรรม หรือสอนแทนในข้อมูลที่บันทึกไว้ กรุณาเปลี่ยนผู้รับผิดชอบก่อนลบ');return false}
    const removedRooms=other.rooms.filter(room=>!next.rooms.some(item=>item.id===room.id)).map(room=>room.id)
    if([other,next].some(plan=>plan.subjects.some(subject=>removedRooms.includes(subject.roomId))||plan.timetable.some(cell=>removedRooms.includes(cell.classroomId))||plan.activities.some(activity=>activity.roomIds.some(room=>removedRooms.includes(room)))||Object.values(plan.substitutes||{}).flat().some(entry=>removedRooms.includes(entry.roomId)))){setError('ห้องที่ลบยังมีรายวิชา กิจกรรม ตาราง หรือรายการสอนแทนอยู่ กรุณานำออกก่อนลบห้อง');return false}
    const removedPeriod=(day:number,period:number)=>!next.days.includes(day)||!next.periods.some(row=>!row.is_break&&row.period===period)
    if([other,next].some(plan=>plan.timetable.some(cell=>removedPeriod(cell.day,cell.period))||plan.blocks.some(block=>removedPeriod(block.day,block.period))||plan.activities.some(activity=>activity.cells.some(cell=>removedPeriod(cell.day,cell.period))))){setError('มีตาราง กิจกรรม หรือคาบไม่ว่างใช้วันและเวลานี้อยู่ กรุณานำออกก่อนลดคาบ');return false}
    setDraft(null);setIssues(null)
    setPreviewRoom(current=>next.rooms.some(room=>room.id===current)?current:next.rooms[0]?.id||'')
    setLockTeacher(current=>next.teachers.some(teacher=>teacher.id===current)?current:next.teachers[0]?.id||'')
    setScope(current=>[...new Set([...current.filter(id=>next.rooms.some(room=>room.id===id)),...next.rooms.filter(room=>isTimetableClassroom(room.label.split("/")[0])&&!data.rooms.some(old=>old.id===room.id)).map(room=>room.id)])])
    return persist({...latest.current.terms[latest.current.semester],...next,substitutes:latest.current.terms[latest.current.semester].substitutes},true)
  }
  async function arrange(roomIds?:string[]){
    if(runLock.current)return
    runLock.current=true;setBusy(true);setError('');setDraft(null);setIssues(null)
    const selected=roomIds??scope
    setScope(selected);setWizardStep(7);setMode('wizard');navigate('manage')
    try{
      if(!await queue.current||failedSave.current)throw Error('ข้อมูลยังไม่บันทึกลงเครื่อง กรุณาดาวน์โหลดสำเนาแล้วโหลดหน้าใหม่')
      const base=latest.current,plan=base.terms[base.semester],problems=devicePreflight(plan,selected,clear,teacherLimit)
      setIssues(problems);if(problems.some(issue=>issue.severity==='error'))return
      const stored=await readFreePlan<FreeBundle>()
      if((stored?.savedAt||'')!==expectedSave.current||deviceDataKey(asBundle(stored?.data))!==deviceDataKey(base))throw Error('ข้อมูลถูกแก้จากแท็บอื่น กรุณาโหลดใหม่ก่อนจัดตาราง')
      draftBase.current=deviceDataKey(base)
      abort.current=new AbortController()
      const result=await solveScheduleOnDevice(toDeviceSnapshot(plan,selected),'local',selected,clear,abort.current.signal)
      if(deviceDataKey(latest.current)!==draftBase.current)throw Error('ข้อมูลเปลี่ยนระหว่างจัดตาราง กรุณาสร้างฉบับร่างใหม่')
      setDraft(result)
    }catch(cause){setError(cause instanceof Error?cause.message:'จัดตารางบนเครื่องไม่สำเร็จ')}
    finally{abort.current=null;runLock.current=false;setBusy(false)}
  }
  async function confirmDraft(){
    if(runLock.current||draft?.status!=='complete')return
    runLock.current=true;setBusy(true)
    try{
      const limitError=deviceTeacherLimitMessage(data.teachers.length,teacherLimit);if(limitError)throw Error(limitError)
      if(!(await Swal.fire({icon:'question',title:'บันทึกใช้ตารางนี้บนเครื่อง?',text:'แทนที่ด้วยฉบับร่างที่ตรวจแล้ว ไม่มีการส่งตารางขึ้นเซิร์ฟเวอร์',showCancelButton:true,confirmButtonText:'บันทึกใช้ตาราง',cancelButtonText:'ยกเลิก',confirmButtonColor:'#1373d9'})).isConfirmed)return
      await queue.current
      const stored=await readFreePlan<FreeBundle>()
      if((stored?.savedAt||'')!==expectedSave.current||deviceDataKey(latest.current)!==draftBase.current||deviceDataKey(asBundle(stored?.data))!==draftBase.current)throw Error('ข้อมูลเปลี่ยนหลังสร้างร่าง หรือมีแท็บอื่นแก้ข้อมูล กรุณาโหลดข้อมูลล่าสุดและจัดใหม่')
      if(!await persist({...data,timetable:localDraftCells(draft)}))return
      setDraft(null);setIssues(null);setMode('class');navigate('class')
    }catch(cause){setError(cause instanceof Error?cause.message:'บันทึกไม่สำเร็จ')}
    finally{runLock.current=false;setBusy(false)}
  }
  function backup(){
    const url=URL.createObjectURL(new Blob([JSON.stringify({format:'jarnsek-device-schedule',version:1,data:latest.current},null,2)],{type:'application/json'}))
    const link=document.createElement('a');link.href=url;link.download='jarnsek-schedule-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  async function restore(file:File){
    try{
      if(file.size>15*1024*1024)throw Error('ไฟล์สำรองต้องมีขนาดไม่เกิน 15 MB')
      const next=asBundle(readDeviceBackup(JSON.parse(await file.text()),teacherLimit))
      if(!(await Swal.fire({icon:'warning',title:'นำข้อมูลสำรองกลับมาใช้?',text:'แทนที่ข้อมูลทั้งสองภาคเรียนในเบราว์เซอร์นี้ ควรดาวน์โหลดสำเนาปัจจุบันเก็บไว้ก่อน',showCancelButton:true,confirmButtonText:'นำกลับมาใช้',cancelButtonText:'ยกเลิก'})).isConfirmed)return
      if(!await commit(next))return
      setRestoreCount(count=>count+1);setSubstituteDirty(false);setLockTeacher(next.terms[next.semester].teachers[0]?.id||'');setDraft(null);setIssues(null);setError('');setPreviewRoom(next.terms[next.semester].rooms[0]?.id||'');setScope(next.terms[next.semester].rooms.filter(room=>isTimetableClassroom(room.label.split("/")[0])).map(room=>room.id));setPicked('')
    }catch(cause){setError(cause instanceof Error?cause.message:'นำเข้าไฟล์ไม่สำเร็จ')}
  }
  const report=useMemo(()=>devicePreflight(data,data.rooms.map(room=>room.id),false,teacherLimit),[data,teacherLimit])
  const workload=useMemo(()=>deviceWorkload(data),[data])

  function switchTerm(semester: 1 | 2) {
    const next = { ...bundle, semester }
    if(busy||activityDirty||substituteDirty)return
    void commit(next)
    const plan = next.terms[semester]
    setDraft(null);setIssues(null);setScope(plan.rooms.filter(room=>isTimetableClassroom(room.label.split("/")[0])).map(room=>room.id))
    setPreviewRoom(plan.rooms[0]?.id || '')
    setPicked('');setMoveSource(null)
    setError('')
  }


  async function selectYear(year:string){
    if(busy||saving||activityDirty||substituteDirty)return
    try{
      if(year==='new'){
        const answer=await Swal.fire({title:'เพิ่มปีการศึกษา',input:'number',inputValue:Number(deviceYear(bundle))+1,showCancelButton:true,confirmButtonText:'เพิ่มปีการศึกษา',cancelButtonText:'ยกเลิก'})
        if(!answer.isConfirmed)return
        year=String(answer.value).trim()
      }
      const next=switchDeviceYear(latest.current,year)
      if(!await commit(next))return
      const plan=next.terms[next.semester]
      setDraft(null);setIssues(null);setError('');setPreviewRoom(plan.rooms[0]?.id||'');setLockTeacher(plan.teachers[0]?.id||'');setPicked('');setMoveSource(null);setScope(plan.rooms.filter(room=>isTimetableClassroom(room.label.split('/')[0])).map(room=>room.id))
    }catch(error){setError(error instanceof Error?error.message:'เปลี่ยนปีการศึกษาไม่สำเร็จ')}
  }
  async function editPlan(work:()=>FreeWizardPlan){
    try{setError('');const next=work();setDraft(null);setIssues(null);await persist({...data,...next})}
    catch(cause){setError(cause instanceof Error?cause.message:'แก้ตารางไม่สำเร็จ')}
  }
  function placeCell(subjectId:string){const [day,period]=picked.split(':').map(Number);void editPlan(()=>changeDeviceCell(data,previewRoom,day,period,subjectId||null))}
  function toggleCellLock(){const [day,period]=picked.split(':').map(Number);void editPlan(()=>lockDeviceCell(data,previewRoom,day,period))}
  function toggleBlock(teacher:string,day:number,period:number){void editPlan(()=>blockDeviceTeacher(data,teacher,day,period,!data.blocks.some(block=>block.teacherId===teacher&&block.day===day&&block.period===period)))}
  async function clearSlots(scope:DeviceClearScope){
    let next:FreeWizardPlan
    try{next=clearDeviceCells(data,scope)}catch(error){setError(error instanceof Error?error.message:'ล้างคาบไม่สำเร็จ');return}
    const count=data.timetable.length-next.timetable.length
    if(!count){setError('ไม่มีคาบรายวิชาที่ปลดล็อกให้ล้างในขอบเขตนี้');return}
    if((await Swal.fire({icon:'warning',title:'ล้างคาบรายวิชา '+count+' คาบ?',text:'เก็บคาบที่ล็อกและกิจกรรมไว้',showCancelButton:true,confirmButtonText:'ล้างคาบ',cancelButtonText:'ยกเลิก'})).isConfirmed)void editPlan(()=>next)
  }
  async function selectCell(day:number,period:number){
    if(moveSource){
      if(moveSource.day===day&&moveSource.period===period){setMoveSource(null);return}
      const occupied=data.timetable.some(cell=>cell.classroomId===previewRoom&&cell.day===day&&cell.period===period)
      if((await Swal.fire({icon:'question',title:occupied?'สลับคาบทั้งสองช่อง?':'ย้ายวิชาไปคาบนี้?',showCancelButton:true,confirmButtonText:occupied?'สลับคาบ':'ย้ายคาบ',cancelButtonText:'ยกเลิก'})).isConfirmed){await editPlan(()=>moveDeviceCell(data,moveSource,{day,period},occupied));setMoveSource(null)}
    }
    setPicked(day+':'+period)
  }

  return (
    <section className="free-schedule schedule-workspace">
      <header className="desk-head schedule-workspace-heading">
        <div>
          <span>ตารางเรียนและตารางสอน</span>
          <h1>{mode === 'wizard' && wizardStep === 5 ? 'กิจกรรมและครู' : mode === 'wizard' ? 'เตรียมและจัดตาราง' : mode === 'teacher' ? 'ตารางสอนและคาบที่ล็อก' : mode === 'substitute' ? 'จัดครูสอนแทน' : mode==='conflicts'?'ตรวจความขัดแย้ง':mode==='print'?'พิมพ์ตาราง':mode==='workload'?'ภาระงานสอน': `ตารางเรียน ภาคเรียนที่ ${bundle.semester}`}</h1>
          <p>จัดตารางด้วยเครื่องผู้ใช้ · ข้อมูลเก็บในเบราว์เซอร์นี้</p>
          {savedAt && <small>บันทึกในเครื่องล่าสุด {new Date(savedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</small>}
        </div>
        {teacherLimit!==undefined&&<span className="prep-count">โหมดฟรี · ครู {data.teachers.length}/{teacherLimit} คน</span>}
        <label className="field term">ปีการศึกษา<select value={deviceYear(bundle)} disabled={busy||saving||activityDirty||substituteDirty} onChange={event=>void selectYear(event.target.value)}>{[...new Set([deviceYear(bundle),...Object.keys(bundle.archives||{})])].sort().reverse().map(year=><option key={year} value={year}>พ.ศ. {year}</option>)}<option value="new">+ เพิ่มปีการศึกษา</option></select></label>
        <label className="field term">ภาคเรียน<select disabled={busy||saving||activityDirty||substituteDirty} value={bundle.semester} onChange={event => switchTerm(Number(event.target.value) === 2 ? 2 : 1)}><option value={1}>ภาคเรียนที่ 1</option><option value={2}>ภาคเรียนที่ 2</option></select></label>
        <button type="button" className="quick schedule-quick-button" disabled={busy||activityDirty||substituteDirty} aria-pressed={mode === 'wizard' && wizardStep !== 5} onClick={() => { setWizardStep(1); navigate('manage');setMode('wizard') }}>
          <FiZap aria-hidden="true" />
          <span>จัดตาราง<small>เตรียมข้อมูลและสร้างฉบับร่าง</small></span>
        </button>
      </header>

      <div className="local-storage-bar"><div role="status"><strong>ฐานข้อมูลบนเครื่องนี้</strong><small>{storageStatus||'เปิดข้อมูลจากเบราว์เซอร์'} · การล้างข้อมูลเว็บไซต์อาจลบงานที่เก็บไว้</small></div><div className="actions"><button type="button" disabled={!ready} onClick={backup}>ดาวน์โหลดสำเนาข้อมูล</button><label className="local-restore">นำเข้าไฟล์สำรอง<input type="file" accept=".json,application/json" disabled={!ready||busy||saving||storageError} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void restore(file)}}/></label></div></div>
      {busy&&<button type="button" onClick={()=>abort.current?.abort()}>ยกเลิกการจัดตาราง</button>}
      {teacherLimitError&&<p className="error" role="alert">{teacherLimitError} · ข้อมูลเดิมยังอยู่ครบ สามารถดาวน์โหลดสำเนาหรือลดรายชื่อในขั้น 3</p>}
      {error&&<p className="error" role="alert">{error}</p>}
      {!ready ? <p className="note">กำลังเปิดข้อมูลในเครื่อง...</p> : (
        <>
          {ad && <LiveAd ad={ad} />}
          <fieldset className="local-workspace-body" disabled={busy}><nav className="workspace-nav schedule-workspace-nav" aria-label="พื้นที่จัดตาราง">
            <button type="button" aria-pressed={mode === 'class'} onClick={() => navigate('class')}><FiGrid aria-hidden="true" />ตารางเรียน</button>
            <button type="button" aria-pressed={mode === 'teacher'} onClick={() => navigate('teaching')}><FiUsers aria-hidden="true" />ตารางสอน / ล็อกคาบ</button>
            <button type="button" aria-pressed={mode === 'wizard' && wizardStep === 5} onClick={() => { setWizardStep(5);navigate('manage');setMode('wizard') }}><FiCalendar aria-hidden="true" />กิจกรรมและครู</button>
            <button type="button" aria-pressed={mode === 'substitute'} onClick={() => navigate('substitute')}><FiRepeat aria-hidden="true" />สอนแทน</button>
            <button type="button" aria-pressed={mode==='conflicts'} onClick={()=>navigate('conflicts')}>ตรวจความขัดแย้ง</button>
            <button type="button" aria-pressed={mode==='print'} onClick={()=>navigate('print')}>พิมพ์ตาราง</button>
            <button type="button" aria-pressed={mode==='workload'} onClick={()=>navigate('workload')}>ภาระงานสอน</button>
          </nav>
          {mode==='conflicts'?<article><h2>ตรวจความขัดแย้ง</h2><p>ตรวจจากรายวิชา กิจกรรม ทีมครู สถานที่ และคาบที่ล็อกในฐานข้อมูลเครื่องนี้</p><p role="status">ข้อผิดพลาด {report.filter(issue=>issue.severity==='error').length} · คำเตือน {report.filter(issue=>issue.severity==='warning').length}</p>{report.length?<ul className="issues">{report.map((issue,index)=><li key={index} className={issue.severity==='error'?'error':'note'}>{issue.message}<button type="button" onClick={()=>{setWizardStep(issue.step);navigate('manage')}}>ไปแก้ขั้น {issue.step}</button></li>)}</ul>:<p className="local-storage-hint">ไม่พบความขัดแย้งเบื้องต้น ระบบจะตรวจความครบถ้วนอีกครั้งหลังจัดตาราง</p>}</article>:mode==='print'||mode==='workload'?<FreeScheduleDocuments plan={data} semester={bundle.semester} year={deviceYear(bundle)} workload={mode==='workload'} onSettings={document=>void persist({...data,document})}/>:mode === 'wizard' ? (
            <FreeScheduleWizard teacherLimit={teacherLimit} plan={data} step={wizardStep} onStep={setWizardStep} onPlan={saveWizard} busy={busy} onActivityDirty={setActivityDirty} canCopyOther={bundle.terms[bundle.semester===1?2:1].subjects.length>0} onCopyOther={async()=>{if((await Swal.fire({icon:'warning',title:'คัดลอกจากอีกภาคเรียน?',text:'แทนที่วิชา กิจกรรม และคาบไม่ว่างของภาคนี้ พร้อมล้างตารางเดิม',showCancelButton:true,confirmButtonText:'ยืนยันคัดลอก',cancelButtonText:'ยกเลิก'})).isConfirmed)saveWizard(copyTermSubjects(bundle.terms[bundle.semester===1?2:1],data))}} review={
              <><details className="local-disclosure"><summary>ความต้องการเพิ่มเติมของตัวจัดตาราง</summary><label><input type="checkbox" checked={!!data.reduceGaps} onChange={event=>void saveWizard({...data,reduceGaps:event.target.checked})}/> ลดคาบว่างระหว่างคาบสอน</label><label className="field">จำนวนคาบสอนต่อเนื่องที่ต้องการไม่เกิน<select value={data.maxContinuous||0} onChange={event=>void saveWizard({...data,maxContinuous:Number(event.target.value)})}><option value={0}>ไม่กำหนด</option>{[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} คาบ</option>)}</select></label></details><ScheduleReviewStep data={devicePreparation(data)} rooms={scope} clear={clear} issues={draft?deviceDraftView(data,draft,scope)!.issues:issues} draft={deviceDraftView(data,draft,scope)} blocked={activityDirty||storageError}
                workingLabel={busy?'กำลังประมวลผลและตรวจข้อมูลบนเครื่องนี้…':undefined}
                onRooms={rooms=>{setScope(rooms);setDraft(null);setIssues(null)}} onClear={value=>{setClear(value);setDraft(null);setIssues(null)}} onFix={setWizardStep}
                onCheck={()=>{setDraft(null);setIssues(devicePreflight(data,scope,clear,teacherLimit))}} onGenerate={()=>void arrange(scope)} onConfirm={()=>void confirmDraft()}
                onDiscard={async()=>{if((await Swal.fire({icon:'warning',title:'ทิ้งฉบับร่าง?',text:'ตารางบนเครื่องจะไม่เปลี่ยน',showCancelButton:true,confirmButtonText:'ทิ้งฉบับร่าง',cancelButtonText:'ยกเลิก'})).isConfirmed){setDraft(null);setIssues(null)}}}/></>
            } />
          ) : mode === 'teacher' ? (
            <article>
              <h2>ตารางสอนและคาบที่ล็อก</h2>
              <label className="field">ครู<select value={lockTeacher} onChange={event => setLockTeacher(event.target.value)}><option value="">เลือกครู</option>{data.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
              {lockTeacher&&<button type="button" onClick={()=>void clearSlots({kind:'teacher',id:lockTeacher})}>ล้างคาบสอนครูนี้</button>}
              {lockTeacher && (
                <div className="board" tabIndex={0} role="region" aria-label="ตารางสอนและคาบไม่ว่าง เลื่อนเพื่อดูทุกคาบ"><ScheduleGridTable periodTimes={data.periods} days={data.days} renderCell={(day,period)=>{
                  const subject=data.subjects.find(item=>item.teacherId===lockTeacher&&data.timetable.some(cell=>cell.subjectId===item.id&&cell.day===day&&cell.period===period))
                  const activity=data.activities.find(item=>item.roomIds.some(roomId=>freeActivityTeachers(item,roomId).includes(lockTeacher)&&(data.timetable.some(cell=>cell.activityId===item.id&&cell.classroomId===roomId&&cell.day===day&&cell.period===period)||item.cells.some(cell=>cell.day===day&&cell.period===period))))
                  const blocked=data.blocks.some(block=>block.teacherId===lockTeacher&&block.day===day&&block.period===period)
                  return subject?<button type="button" className="cell-btn" onClick={()=>{setPreviewRoom(subject.roomId);pendingPick.current=day+':'+period;navigate('class')}}><b>{subject.name}</b><small>{subject.code} · {data.rooms.find(room=>room.id===subject.roomId)?.label}</small><small>{data.places.find(place=>place.id===subject.placeId)?.name}</small></button>:activity?<><b>{activity.name}</b><small>กิจกรรม</small></>:<button type="button" aria-label={day+' คาบ '+period+(blocked?' ปลดล็อก':' ล็อกไม่ว่าง')} aria-pressed={blocked} onClick={()=>toggleBlock(lockTeacher,day,period)}>{blocked?'ไม่ว่าง':'ว่าง'}</button>
                }}/></div>
              )}
            </article>
          ) : mode === 'substitute' ? (
            <FreeSubstituteDesk key={deviceYear(bundle)+':'+bundle.semester+':'+restoreCount} teachers={data.teachers} rooms={data.rooms} subjects={data.subjects} timetable={data.timetable} days={data.substitutes} periods={data.periods} reservations={data.blocks.concat(data.activities.flatMap(activity=>activity.roomIds.flatMap(roomId=>{const cells=[...activity.cells,...data.timetable.filter(cell=>cell.activityId===activity.id&&cell.classroomId===roomId)];return cells.flatMap(cell=>freeActivityTeachers(activity,roomId).map(teacherId=>({teacherId,day:cell.day,period:cell.period})))})))} onDirty={setSubstituteDirty} onSave={substitutes => persist({ ...data, substitutes })} />
          ) : (
            <>
              <div className="actions">
                {data.rooms.length > 0 && <select value={previewRoom} onChange={event => { setPreviewRoom(event.target.value); setPicked('');setMoveSource(null) }} aria-label="ดูตารางห้อง">{data.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select>}
                <button type="button" className="primary" disabled={busy || !previewRoom} onClick={() => void arrange(previewRoom ? [previewRoom] : undefined)}>{busy ? 'กำลังจัด...' : 'จัดห้องนี้'}</button>
                <button type="button" disabled={busy || !data.subjects.length} onClick={() => void arrange(data.rooms.filter(room=>isTimetableClassroom(room.label.split("/")[0])).map(room=>room.id))}>จัดทุกห้อง</button>
                <button type="button" onClick={() => { setWizardStep(1);navigate('manage'); setMode('wizard') }}>เปิดตัวช่วยจัดตาราง</button>
                <button type="button" onClick={()=>void clearSlots({kind:'room',id:previewRoom})}>ล้างคาบห้องนี้</button><button type="button" onClick={()=>void clearSlots({kind:'level',id:data.rooms.find(room=>room.id===previewRoom)?.label.split('/')[0]})}>ล้างคาบระดับชั้นนี้</button><button type="button" onClick={()=>void clearSlots({kind:'school'})}>ล้างคาบทุกห้อง</button>
              </div>
              {moveSource&&<p className="local-storage-hint">เลือกช่องปลายทางเพื่อย้ายหรือสลับคาบ <button type="button" onClick={()=>setMoveSource(null)}>ยกเลิกการย้าย</button></p>}
              {error && <p className="error" role="alert">{error}</p>}
              {!data.timetable.length && !draft && <p className="note">กดปุ่มจัดตารางด้านบน แล้วเดิน 7 ขั้น จัดเสร็จแล้วกดช่องเพื่อย้ายวิชาหรือล็อก</p>}
              {previewRoom && <div className="quota">{data.subjects.filter(subject => subject.roomId === previewRoom).map(subject => {
                const placed = data.timetable.filter(cell => cell.subjectId === subject.id).length
                return <span key={subject.id}>{subject.name} <b className={placed > subject.periods ? 'over' : placed < subject.periods ? 'short' : ''}>{placed}/{subject.periods}</b></span>
              })}<span>ใช้ {roomNeed(data, previewRoom)} / {slotCapacity(data)} ช่อง</span></div>}
              {previewRoom && <FreePlanBoard plan={data} roomId={previewRoom} draft={null} selected={picked} onSelect={(day, period) => void selectCell(day,period)} />}
              {picked && previewRoom && (() => {
                const [dayText, periodText] = picked.split(':')
                const day = Number(dayText)
                const period = Number(periodText)
                const activity = data.activities.find(item => item.roomIds.includes(previewRoom) && (data.timetable.some(cell=>cell.activityId===item.id&&cell.classroomId===previewRoom&&cell.day===day&&cell.period===period)||item.cells.some(cell => cell.day === day && cell.period === period)))
                const current = data.timetable.find(cell => cell.classroomId === previewRoom && cell.day === day && cell.period === period)
                return <article>
                  <h2>{SCHEDULE_DAYS.find(item => item.value === day)?.label} คาบ {period}</h2>
                  {activity ? <p className="note">คาบนี้ปักกิจกรรม {activity.name} ไว้ แก้ทีมครูได้ในขั้นกิจกรรม</p> : <>
                    <label className="field">รายวิชา<select value={current?.subjectId || ''} onChange={event => placeCell(event.target.value)}><option value="">ว่าง</option>{data.subjects.filter(subject => subject.roomId === previewRoom&&(subject.id===current?.subjectId||data.timetable.filter(cell=>cell.subjectId===subject.id).length<subject.periods)).map(subject => <option key={subject.id} value={subject.id}>{subject.code} {subject.name}</option>)}</select></label>
                    <button type="button" onClick={toggleCellLock}>{current?.locked ? 'ปลดล็อก' : 'ล็อกคาบนี้'}</button><button type="button" disabled={!current||current.locked} onClick={()=>setMoveSource(current||null)}>ย้าย / สลับคาบนี้</button>
                  </>}
                </article>
              })()}
              <p className="note">กำหนดภาระสอนแล้ว {workload.length} คน · <button type="button" onClick={()=>navigate('workload')}>ดูภาระงานสอน</button><button type="button" onClick={()=>navigate('conflicts')}>ตรวจความขัดแย้ง</button></p>
            </>
          )}
          </fieldset>
        </>
      )}
    </section>
  )
}

function LiveAd({ ad }: { ad: LiveFreeAd }) {
  const body = (
    <>
      {/* Remote ad images follow the existing URL settings and are not optimized on this device. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title || 'โฆษณา'} />}
      <span><small>โฆษณา</small><strong>{ad.title || ad.href}</strong></span>
    </>
  )
  return ad.href
    ? <a className="ad-live" href={ad.href} target="_blank" rel="noopener noreferrer">{body}</a>
    : <div className="ad-live">{body}</div>
}
