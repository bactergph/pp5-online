'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { FiCalendar, FiGrid, FiRepeat, FiUsers, FiZap } from 'react-icons/fi'
import { SCHEDULE_DAYS, isTimetableClassroom } from '@/lib/schedules'
import { type DeviceDraft } from '@/lib/schedule-device-build'
import { readFreePlan, writeFreePlan } from '@/lib/schedule-device-cache'
import { solveScheduleOnDevice } from '@/lib/schedule-device-run'
import { FREE_SCHEDULE_TEACHER_LIMIT, deviceTeacherLimitMessage, freeActivityTeachers, copyTermSubjects, normalizePlan, roomNeed, slotCapacity, teachingRows, toDeviceSnapshot, type FreeWizardPlan } from '@/lib/schedule-device-free'
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
type FreeBundle = { semester: 1 | 2; terms: { 1: FreePlan; 2: FreePlan } }

function blankPlan(shared?: Partial<FreePlan>): FreePlan {
  const base = normalizePlan(shared)
  return { ...base, subjects: shared?.subjects ? base.subjects : [], timetable: shared?.timetable || [], substitutes: shared?.substitutes || {}, blocks: shared?.blocks || [], activities: shared?.activities ? base.activities : [] }
}

function shareFields(source: FreePlan, target: FreePlan): FreePlan {
  return { ...target, teachers: source.teachers, rooms: source.rooms, places: source.places, days: source.days, periods: source.periods }
}

function asBundle(raw?: Partial<FreeBundle> & Partial<FreePlan>): FreeBundle {
  const stored = raw?.terms
  if (stored) {
    const first = blankPlan(stored[1])
    return { semester: raw?.semester === 2 ? 2 : 1, terms: { 1: first, 2: shareFields(first, blankPlan(stored[2])) } }
  }
  const term = blankPlan(raw)
  return { semester: 1, terms: { 1: term, 2: shareFields(term, blankPlan()) } }
}

function localReport(plan: FreePlan) {
  const teacherName = Object.fromEntries(plan.teachers.map(teacher => [teacher.id, teacher.name]))
  const roomName = Object.fromEntries(plan.rooms.map(room => [room.id, room.label]))
  const clashes: string[] = []
  const seen = new Map<string, string>()
  const places = new Map<string, string>()
  const load = new Map<string, number>()
  const mark = (teacherId: string, day: number, period: number, where: string) => {
    const who = teacherName[teacherId] || 'ครู'
    load.set(who, (load.get(who) || 0) + 1)
    const key = `${teacherId}|${day}|${period}`
    const previous = seen.get(key)
    const when = `วัน${SCHEDULE_DAYS.find(item => item.value === day)?.label || day} คาบ ${period}`
    if (previous && previous !== where) clashes.push(`${who} ${when}: ${previous} กับ ${where}`)
    else seen.set(key, where)
  }
  for (const cell of plan.timetable) {
    const subject = plan.subjects.find(item => item.id === cell.subjectId)
    if (!subject) continue
    const where = `${roomName[cell.classroomId] || ''} ${subject.name}`.trim()
    mark(subject.teacherId, cell.day, cell.period, where)
    if (subject.placeId) {
      const placeKey = `${subject.placeId}|${cell.day}|${cell.period}`
      const previous = places.get(placeKey)
      if (previous && previous !== where) clashes.push(`${plan.places.find(place => place.id === subject.placeId)?.name || 'สถานที่'} วัน${SCHEDULE_DAYS.find(item => item.value === cell.day)?.label || cell.day} คาบ ${cell.period}: ${previous} กับ ${where}`)
      else places.set(placeKey, where)
    }
  }
  const seenActivity = new Set<string>()
  for(const activity of plan.activities){
    const cells=[...activity.cells.map(cell=>({...cell,roomId:''})),...plan.timetable.filter(cell=>cell.activityId===activity.id).map(cell=>({...cell,roomId:cell.classroomId}))]
    for(const cell of cells)for(const roomId of cell.roomId?[cell.roomId]:activity.roomIds){
      for(const teacher of freeActivityTeachers(activity,roomId)){
        const key=activity.id+':'+(activity.mode==='joint'?'joint':roomId)+':'+teacher+':'+cell.day+':'+cell.period
        if(seenActivity.has(key))continue
        seenActivity.add(key)
        mark(teacher,cell.day,cell.period,activity.mode==='joint'?activity.name:(roomName[roomId]||'')+' '+activity.name)
      }
    }
  }
  return { clashes, load: [...load.entries()] }
}

const escapeHtml=(text:string)=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char))

function cellLabel(plan: FreePlan, roomId: string, day: number, period: number) {
  const activity = plan.activities.find(item => item.roomIds.includes(roomId) && (plan.timetable.some(cell=>cell.activityId===item.id&&cell.classroomId===roomId&&cell.day===day&&cell.period===period)||item.cells.some(cell => cell.day === day && cell.period === period)))
  if (activity) return `${escapeHtml(activity.name)}<br><small>${escapeHtml(freeActivityTeachers(activity,roomId).map(id=>plan.teachers.find(teacher=>teacher.id===id)?.name||'').filter(Boolean).join(', '))}</small>`
  const cell = plan.timetable.find(item => item.classroomId === roomId && item.day === day && item.period === period)
  const subject = cell ? plan.subjects.find(item => item.id === cell.subjectId) : undefined
  return subject ? `${escapeHtml(subject.name)}<br><small>${escapeHtml(plan.teachers.find(teacher => teacher.id === subject.teacherId)?.name || '')}</small>` : ''
}

export default function FreeScheduleDesk({ tier, ad = null }: { tier: DeskTier; ad?: LiveFreeAd | null }) {
  const [bundle, setBundle] = useState<FreeBundle>(() => asBundle())
  const data = bundle.terms[bundle.semester]
  const teacherLimit=tier==='free'?FREE_SCHEDULE_TEACHER_LIMIT:undefined
  const teacherLimitError=deviceTeacherLimitMessage(data.teachers.length,teacherLimit)
  const [ready, setReady] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [previewRoom, setPreviewRoom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<DeviceDraft | null>(null)
  const [mode, setMode] = useState<'class' | 'teacher' | 'wizard' | 'substitute'>('class')
  const [wizardStep, setWizardStep] = useState(1)
  const [lockTeacher, setLockTeacher] = useState('')
  const [paperTitle, setPaperTitle] = useState('')
  const [picked, setPicked] = useState('')
  const [scope,setScope] = useState<string[]>([]),[clear,setClear] = useState(true),[issues,setIssues] = useState<PlanningIssue[]|null>(null),[activityDirty,setActivityDirty] = useState(false)
  const [storageError,setStorageError] = useState(false)
  const [storageStatus,setStorageStatus] = useState(''),[saving,setSaving] = useState(false)
  const latest = useRef(bundle), expectedSave = useRef(''), queue = useRef(Promise.resolve(true)), failedSave = useRef(false), runLock = useRef(false)
  const draftBase = useRef(''), abort = useRef<AbortController|null>(null), pendingWrites = useRef(0)
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(busy||saving||activityDirty||draft){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[busy,saving,activityDirty,draft])

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
    if(limitError&&next.teachers.length>data.teachers.length){setError(limitError);return}
    setDraft(null);setIssues(null)
    setPreviewRoom(current=>next.rooms.some(room=>room.id===current)?current:next.rooms[0]?.id||'')
    setLockTeacher(current=>next.teachers.some(teacher=>teacher.id===current)?current:next.teachers[0]?.id||'')
    setScope(current=>[...new Set([...current.filter(id=>next.rooms.some(room=>room.id===id)),...next.rooms.filter(room=>isTimetableClassroom(room.label.split("/")[0])&&!data.rooms.some(old=>old.id===room.id)).map(room=>room.id)])])
    void persist({...data,...next,substitutes:data.substitutes},true)
  }
  async function arrange(roomIds?:string[]){
    if(runLock.current)return
    runLock.current=true;setBusy(true);setError('');setDraft(null);setIssues(null)
    const selected=roomIds??scope
    setScope(selected);setWizardStep(7);setMode('wizard')
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
      setDraft(null);setIssues(null);setMode('class')
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
      const next=readDeviceBackup(JSON.parse(await file.text()),teacherLimit)
      if(!(await Swal.fire({icon:'warning',title:'นำข้อมูลสำรองกลับมาใช้?',text:'แทนที่ข้อมูลทั้งสองภาคเรียนในเบราว์เซอร์นี้ ควรดาวน์โหลดสำเนาปัจจุบันเก็บไว้ก่อน',showCancelButton:true,confirmButtonText:'นำกลับมาใช้',cancelButtonText:'ยกเลิก'})).isConfirmed)return
      if(!await commit(next))return
      setDraft(null);setIssues(null);setError('');setPreviewRoom(next.terms[next.semester].rooms[0]?.id||'');setScope(next.terms[next.semester].rooms.filter(room=>isTimetableClassroom(room.label.split("/")[0])).map(room=>room.id));setPicked('')
    }catch(cause){setError(cause instanceof Error?cause.message:'นำเข้าไฟล์ไม่สำเร็จ')}
  }
  const report = useMemo(() => localReport(data), [data])
  const showReview = tier !== 'free'

  function switchTerm(semester: 1 | 2) {
    const next = { ...bundle, semester }
    if(busy||activityDirty)return
    void commit(next)
    const plan = next.terms[semester]
    setDraft(null);setIssues(null);setScope(plan.rooms.filter(room=>isTimetableClassroom(room.label.split("/")[0])).map(room=>room.id))
    setPreviewRoom(plan.rooms[0]?.id || '')
    setPicked('')
    setError('')
  }

  async function placeCell(subjectId: string) {
    const [dayText, periodText] = picked.split(':')
    const day = Number(dayText)
    const period = Number(periodText)
    if (!previewRoom || !day || !period) return
    const current=data.timetable.find(cell=>cell.classroomId===previewRoom&&cell.day===day&&cell.period===period)
    if(current?.locked&&current.subjectId!==subjectId&&!(await Swal.fire({icon:'warning',title:'แทนที่คาบที่ล็อกไว้?',showCancelButton:true,confirmButtonText:'ยืนยันแทนที่',cancelButtonText:'ยกเลิก'})).isConfirmed)return
    const rest = data.timetable.filter(cell => !(cell.classroomId === previewRoom && cell.day === day && cell.period === period))
    const timetable = subjectId ? [...rest, { classroomId: previewRoom, day, period, subjectId, locked: false }] : rest
    const problems=devicePreflight({...data,timetable},[previewRoom],false,teacherLimit).filter(issue=>issue.severity==='error')
    if(problems.length){setError(problems[0].message);return}
    setError('');setDraft(null)
    void persist({ ...data, timetable })
  }

  function toggleCellLock() {
    const [dayText, periodText] = picked.split(':')
    const day = Number(dayText)
    const period = Number(periodText)
    setDraft(null)
    persist({ ...data, timetable: data.timetable.map(cell => cell.classroomId === previewRoom && cell.day === day && cell.period === period ? { ...cell, locked: !cell.locked } : cell) })
  }

  function toggleBlock(teacherId: string, day: number, period: number) {
    setDraft(null);setIssues(null)
    const exists = data.blocks.some(block => block.teacherId === teacherId && block.day === day && block.period === period)
    persist({
      ...data,
      blocks: exists
        ? data.blocks.filter(block => !(block.teacherId === teacherId && block.day === day && block.period === period))
        : [...data.blocks, { teacherId, day, period }],
    })
  }

  function printPersonal() {
    const title = escapeHtml(paperTitle.trim() || 'ตารางเรียน')
    const rooms = data.rooms.filter(room => data.timetable.some(cell => cell.classroomId === room.id))
    const periods = teachingRows(data.periods)
    const body = rooms.map(room => {
      const rows = SCHEDULE_DAYS.filter(day => data.days.includes(day.value)).map(day => {
        const cells = periods.map(period => {
          const text = cellLabel(data, room.id, day.value, period.period)
          return `<td>${text}</td>`
        }).join('')
        return `<tr><th>${day.label}</th>${cells}</tr>`
      }).join('')
      const heads = periods.map(period => `<th>คาบ ${period.period}</th>`).join('')
      return `<h2>${escapeHtml(room.label)}</h2><table><thead><tr><th>วัน</th>${heads}</tr></thead><tbody>${rows}</tbody></table>`
    }).join('')
    const popup = window.open('', '_blank')
    if (!popup) return
    popup.opener=null
    popup.document.write(`<!doctype html><html><head><title>${title}</title><style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%;margin-bottom:24px}td,th{border:1px solid #182b49;padding:8px;text-align:center}h1{color:#182b49}</style></head><body><h1>${title}</h1>${body || '<p>ยังไม่มีตาราง</p>'}</body></html>`)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  return (
    <section className="free-schedule schedule-workspace">
      <header className="desk-head schedule-workspace-heading">
        <div>
          <span>ตารางเรียนและตารางสอน</span>
          <h1>{mode === 'wizard' && wizardStep === 5 ? 'กิจกรรมและครู' : mode === 'wizard' ? 'เตรียมและจัดตาราง' : mode === 'teacher' ? 'ตารางสอนและคาบที่ล็อก' : mode === 'substitute' ? 'จัดครูสอนแทน' : `ตารางเรียน ภาคเรียนที่ ${bundle.semester}`}</h1>
          <p>จัดตารางด้วยเครื่องผู้ใช้ · ข้อมูลเก็บในเบราว์เซอร์นี้</p>
          {savedAt && <small>บันทึกในเครื่องล่าสุด {new Date(savedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</small>}
        </div>
        {teacherLimit!==undefined&&<span className="prep-count">โหมดฟรี · ครู {data.teachers.length}/{teacherLimit} คน</span>}
        <label className="field term">ภาคเรียน<select disabled={busy||saving||activityDirty} value={bundle.semester} onChange={event => switchTerm(Number(event.target.value) === 2 ? 2 : 1)}><option value={1}>ภาคเรียนที่ 1</option><option value={2}>ภาคเรียนที่ 2</option></select></label>
        <button type="button" className="quick schedule-quick-button" aria-pressed={mode === 'wizard' && wizardStep !== 5} onClick={() => { setWizardStep(1); setMode('wizard') }}>
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
            <button type="button" aria-pressed={mode === 'class'} onClick={() => setMode('class')}><FiGrid aria-hidden="true" />ตารางเรียน</button>
            <button type="button" aria-pressed={mode === 'teacher'} onClick={() => setMode('teacher')}><FiUsers aria-hidden="true" />ตารางสอน / ล็อกคาบ</button>
            <button type="button" aria-pressed={mode === 'wizard' && wizardStep === 5} onClick={() => { setWizardStep(5); setMode('wizard') }}><FiCalendar aria-hidden="true" />กิจกรรมและครู</button>
            <button type="button" aria-pressed={mode === 'substitute'} onClick={() => setMode('substitute')}><FiRepeat aria-hidden="true" />สอนแทน</button>
          </nav>
          {mode === 'wizard' ? (
            <FreeScheduleWizard teacherLimit={teacherLimit} plan={data} step={wizardStep} onStep={setWizardStep} onPlan={saveWizard} busy={busy} onActivityDirty={setActivityDirty} onTeacher={()=>setMode('teacher')} canCopyOther={bundle.terms[bundle.semester===1?2:1].subjects.length>0} onCopyOther={async()=>{if((await Swal.fire({icon:'warning',title:'คัดลอกจากอีกภาคเรียน?',text:'แทนที่วิชา กิจกรรม และคาบไม่ว่างของภาคนี้ พร้อมล้างตารางเดิม',showCancelButton:true,confirmButtonText:'ยืนยันคัดลอก',cancelButtonText:'ยกเลิก'})).isConfirmed)saveWizard(copyTermSubjects(bundle.terms[bundle.semester===1?2:1],data))}} review={
              <ScheduleReviewStep data={devicePreparation(data)} rooms={scope} clear={clear} issues={draft?deviceDraftView(data,draft,scope)!.issues:issues} draft={deviceDraftView(data,draft,scope)} blocked={activityDirty||storageError}
                workingLabel={busy?'กำลังประมวลผลและตรวจข้อมูลบนเครื่องนี้…':undefined}
                onRooms={rooms=>{setScope(rooms);setDraft(null);setIssues(null)}} onClear={value=>{setClear(value);setDraft(null);setIssues(null)}} onFix={setWizardStep}
                onCheck={()=>{setDraft(null);setIssues(devicePreflight(data,scope,clear,teacherLimit))}} onGenerate={()=>void arrange(scope)} onConfirm={()=>void confirmDraft()}
                onDiscard={async()=>{if((await Swal.fire({icon:'warning',title:'ทิ้งฉบับร่าง?',text:'ตารางบนเครื่องจะไม่เปลี่ยน',showCancelButton:true,confirmButtonText:'ทิ้งฉบับร่าง',cancelButtonText:'ยกเลิก'})).isConfirmed){setDraft(null);setIssues(null)}}}/>
            } />
          ) : mode === 'teacher' ? (
            <article>
              <h2>ตารางสอนและคาบที่ล็อก</h2>
              <label className="field">ครู<select value={lockTeacher} onChange={event => setLockTeacher(event.target.value)}><option value="">เลือกครู</option>{data.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
              {lockTeacher && (
                <div className="board" tabIndex={0} role="region" aria-label="ตารางสอนและคาบไม่ว่าง เลื่อนเพื่อดูทุกคาบ"><ScheduleGridTable periodTimes={data.periods} days={data.days} renderCell={(day,period)=>{
                  const subject=data.subjects.find(item=>item.teacherId===lockTeacher&&data.timetable.some(cell=>cell.subjectId===item.id&&cell.day===day&&cell.period===period))
                  const activity=data.activities.find(item=>item.roomIds.some(roomId=>freeActivityTeachers(item,roomId).includes(lockTeacher)&&(data.timetable.some(cell=>cell.activityId===item.id&&cell.classroomId===roomId&&cell.day===day&&cell.period===period)||item.cells.some(cell=>cell.day===day&&cell.period===period))))
                  const blocked=data.blocks.some(block=>block.teacherId===lockTeacher&&block.day===day&&block.period===period)
                  return subject?<><b>{subject.name}</b><small>{data.rooms.find(room=>room.id===subject.roomId)?.label}</small></>:activity?<><b>{activity.name}</b><small>กิจกรรม</small></>:<button type="button" aria-label={day+' คาบ '+period+(blocked?' ปลดล็อก':' ล็อกไม่ว่าง')} aria-pressed={blocked} onClick={()=>toggleBlock(lockTeacher,day,period)}>{blocked?'ไม่ว่าง':'ว่าง'}</button>
                }}/></div>
              )}
            </article>
          ) : mode === 'substitute' ? (
            <FreeSubstituteDesk teachers={data.teachers} rooms={data.rooms} subjects={data.subjects} timetable={data.timetable} days={data.substitutes} periods={data.periods} onSave={substitutes => persist({ ...data, substitutes })} />
          ) : (
            <>
              <div className="actions">
                {data.rooms.length > 0 && <select value={previewRoom} onChange={event => { setPreviewRoom(event.target.value); setPicked('') }} aria-label="ดูตารางห้อง">{data.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select>}
                <button type="button" className="primary" disabled={busy || !previewRoom} onClick={() => void arrange(previewRoom ? [previewRoom] : undefined)}>{busy ? 'กำลังจัด...' : 'จัดห้องนี้'}</button>
                <button type="button" disabled={busy || !data.subjects.length} onClick={() => void arrange(data.rooms.filter(room=>isTimetableClassroom(room.label.split("/")[0])).map(room=>room.id))}>จัดทุกห้อง</button>
                <button type="button" onClick={() => { setWizardStep(1); setMode('wizard') }}>เปิดตัวช่วยจัดตาราง</button>
              </div>
              {error && <p className="error" role="alert">{error}</p>}
              {!data.timetable.length && !draft && <p className="note">กดปุ่มจัดตารางด้านบน แล้วเดิน 7 ขั้น จัดเสร็จแล้วกดช่องเพื่อย้ายวิชาหรือล็อก</p>}
              {previewRoom && <div className="quota">{data.subjects.filter(subject => subject.roomId === previewRoom).map(subject => {
                const placed = data.timetable.filter(cell => cell.subjectId === subject.id).length
                return <span key={subject.id}>{subject.name} <b className={placed > subject.periods ? 'over' : placed < subject.periods ? 'short' : ''}>{placed}/{subject.periods}</b></span>
              })}<span>ใช้ {roomNeed(data, previewRoom)} / {slotCapacity(data)} ช่อง</span></div>}
              {previewRoom && (data.timetable.length || data.activities.length || draft?.status === 'complete') && <FreePlanBoard plan={data} roomId={previewRoom} draft={null} selected={picked} onSelect={(day, period) => setPicked(`${day}:${period}`)} />}
              {picked && previewRoom && (() => {
                const [dayText, periodText] = picked.split(':')
                const day = Number(dayText)
                const period = Number(periodText)
                const activity = data.activities.find(item => item.roomIds.includes(previewRoom) && (data.timetable.some(cell=>cell.activityId===item.id&&cell.classroomId===previewRoom&&cell.day===day&&cell.period===period)||item.cells.some(cell => cell.day === day && cell.period === period)))
                const current = data.timetable.find(cell => cell.classroomId === previewRoom && cell.day === day && cell.period === period)
                return <article>
                  <h2>{SCHEDULE_DAYS.find(item => item.value === day)?.label} คาบ {period}</h2>
                  {activity ? <p className="note">คาบนี้ปักกิจกรรม {activity.name} ไว้ แก้ทีมครูได้ในขั้นกิจกรรม</p> : <>
                    <label className="field">รายวิชา<select value={current?.subjectId || ''} onChange={event => placeCell(event.target.value)}><option value="">ว่าง</option>{data.subjects.filter(subject => subject.roomId === previewRoom).map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
                    <button type="button" disabled={!current} onClick={toggleCellLock}>{current?.locked ? 'ปลดล็อก' : 'ล็อกคาบนี้'}</button>
                  </>}
                </article>
              })()}
              <div className="grid">
                <article>
                  <h2>คาบชน</h2>
                  {report.clashes.length ? <ul className="issues">{report.clashes.map(item => <li key={item}>{item}</li>)}</ul> : <p className="note">ยังไม่พบครูคนเดียวสอนสองห้องในคาบเดียวกัน หรือแย่งห้องใช้ร่วม</p>}
                </article>
                <article>
                  <h2>ภาระงานจากตารางนี้</h2>
                  {report.load.length ? <ul>{report.load.map(([name, count]) => <li key={name}><span>{name}</span><b>{count} คาบ</b></li>)}</ul> : <p className="note">ยังไม่มีตารางให้คิดภาระงาน</p>}
                </article>
                {showReview && <article>
                  <h2>พิมพ์หัวกระดาษส่วนตัว</h2>
                  <form onSubmit={event => { event.preventDefault(); printPersonal() }}>
                    <label className="field">หัวกระดาษ<input value={paperTitle} onChange={event => setPaperTitle(event.target.value)} placeholder="เช่น ชื่อครูหรือชื่อห้อง" /></label>
                    <button type="submit" className="primary">พิมพ์ตาราง</button>
                  </form>
                </article>}
              </div>
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
