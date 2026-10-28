'use client'
import { useScheduleGuard, useScheduleOperations } from './ScheduleServices'
import { useEffect, useState, useRef } from 'react'
import Swal from 'sweetalert2'
import type { Preparation } from '@/lib/schedule-preparation'
import type { LessonRule,PlanningIssue } from '@/lib/schedule-planning'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import ScheduleReviewStep, { type ScheduleDraftView } from './ScheduleReviewStep'
import ScheduleDataInput from './ScheduleDataInput'
import WizardPeriodEditor from './WizardPeriodEditor'
import ActivityTeamEditor from './ActivityTeamEditor'
import WorkloadEditor, { type WorkloadChange } from './WorkloadEditor'
import ClassroomLevelEditor from './ClassroomLevelEditor'
import SchedulePeriodBudget from './SchedulePeriodBudget'
import { confirmScheduleClear } from './confirmScheduleClear'
import {schedulePeriodBudget} from '@/lib/schedule-period-budget'
import './schedule-preparation.css'
import { FiArrowLeft, FiArrowRight, FiCheck, FiZap } from 'react-icons/fi'
const titles=['วันและเวลา','กำหนดชั้น','กำหนดครู','กิจกรรม','รายวิชา','กำหนดภาระสอน/ล็อกคาบ','ตรวจและจัดตาราง']
const descriptions=['ตั้งวันเรียนและตรวจช่วงพัก','เลือกชั้นที่เปิดสอน จำนวนห้อง และชื่อห้อง','เลือกครูหรือวางรายชื่อจาก Excel','กำหนดกิจกรรม ชั้น/ห้อง และทีมครูก่อนรายวิชา','เตรียมรายวิชาให้พอดีกับคาบที่เหลือหลังหักกิจกรรม','กำหนดครู คาบต่อสัปดาห์ และล็อกคาบที่ไม่ให้จัดตารางย้าย','ตรวจข้อขัดแย้งและสร้างฉบับร่าง']
const alert=Swal.mixin({confirmButtonColor:'#245bdb',cancelButtonText:'ยกเลิก',confirmButtonText:'ยืนยัน',reverseButtons:true})
export default function SchedulePreparation({yearId,semester,initialRooms,initialStep=1,onChanged,onUnsavedChange,onBusyChange}:{yearId:string;semester:number;initialRooms?:string[];initialStep?:number;onChanged:()=>void;onUnsavedChange?:(value:boolean)=>void;onBusyChange?:(value:boolean)=>void}){
  const { clearScheduleScope, previewScheduleClear, fetchPreparation, saveScheduleTeachingAssignments, savePreparation, checkPreparation, createScheduleDraft, confirmScheduleDraft, discardScheduleDraft, savePeriodTimes, removeScheduleSubjectCell, editTeacherScheduleCell, saveClassScheduleCell, setTeacherAvailabilityBlock, toggleScheduleCellLock, setJointTeachingScheduleCell } = useScheduleOperations()

 const [data,setData]=useState<Preparation|null>(null),[step,setStep]=useState(initialStep),[error,setError]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[message,setMessage]=useState('')
 const [rooms,setRooms]=useState<string[]>(initialRooms||[]),[clear,setClear]=useState(false),[issues,setIssues]=useState<PlanningIssue[]|null>(null),[draft,setDraft]=useState<ScheduleDraftView|null>(null)
 const [teacherAssignments,setTeacherAssignments]=useState<Record<string,string>>({})
 const [workingLabel,setWorkingLabel]=useState('กำลังบันทึก กรุณารอ…')
 const [timeDirty,setTimeDirty]=useState(false)
 const runLock=useRef(false)
 const [inputDirty,setInputDirty]=useState({teachers:false,subjects:false})
 const [activityDirty,setActivityDirty]=useState(false)
 const hasInputDirty=inputDirty.teachers||inputDirty.subjects
 const hasUnsavedInput=hasInputDirty||activityDirty
 useScheduleGuard(dirty||timeDirty||hasUnsavedInput||!!draft?.id,busy)
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false)},[busy,onBusyChange])
 useEffect(()=>{onUnsavedChange?.(dirty||timeDirty||busy||hasUnsavedInput||!!draft?.id);const guard=(e:BeforeUnloadEvent)=>{if(dirty||timeDirty||busy||hasUnsavedInput||draft?.id){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>{window.removeEventListener('beforeunload',guard);onUnsavedChange?.(false)}},[dirty,timeDirty,busy,hasUnsavedInput,draft?.id,onUnsavedChange])
 useEffect(()=>{let active=true;fetchPreparation(yearId,semester).then(r=>{if(!active)return;if(r.error)setError(r.error);else if(r.data){setData(r.data);setRooms(initialRooms?.length?initialRooms.filter(id=>r.data!.classrooms.some(c=>c.id===id)):r.data.classrooms.map(c=>c.id))}}).catch(()=>{if(active)setError('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่')});return()=>{active=false}},[yearId,semester,initialRooms,fetchPreparation])
 async function run(work:()=>Promise<void>,label='กำลังบันทึก กรุณารอ…'){if(runLock.current)return;runLock.current=true;setWorkingLabel(label);setBusy(true);setError('');setMessage('');try{await work()}catch(e){setError(e instanceof Error?e.message:'ดำเนินการไม่สำเร็จ')}finally{runLock.current=false;setBusy(false)}}
 function edit(update:(d:Preparation)=>Preparation){setData(current=>current?update(current):current);setDirty(true);setIssues(null);setDraft(null)}
 async function save(){if(!data)return;let hash=data.hash
 if(timeDirty||!data.timesConfigured){
 if(!(await alert.fire({icon:'question',title:'บันทึกเวลาคาบของโรงเรียน?',text:'เวลานี้ใช้ร่วมกับตารางทุกปีและภาคเรียน ระบบจะตรวจคาบเดิมก่อนเปลี่ยนโครงสร้าง',showCancelButton:true})).isConfirmed)throw Error('ยังไม่ได้บันทึกวันและเวลา')
 await savePeriodTimes(data.periods);const latest=await fetchPreparation(yearId,semester);if(latest.error||!latest.data)throw Error(latest.error||'โหลดเวลาหลังบันทึกไม่สำเร็จ');hash=latest.data.hash;setData({...latest.data,plan:data.plan});setTimeDirty(false)
 }
 const r=await savePreparation(yearId,semester,hash,data.plan);if(r.error||!r.data)throw Error(r.error||'บันทึกไม่สำเร็จ');let saved=r.data;setData(saved)
 if(Object.keys(teacherAssignments).length){const assigned=await saveScheduleTeachingAssignments(yearId,semester,saved.hash,Object.entries(teacherAssignments).map(([lessonId,teacherId])=>({lessonId,teacherId})));if(assigned.error||!assigned.data)throw Error(assigned.error||'บันทึกครูผู้สอนไม่สำเร็จ');saved=assigned.data;setData(saved);setTeacherAssignments({})}
 setDirty(false);setIssues(null);setDraft(null);setMessage('บันทึกการตั้งค่าแล้ว');onChanged()}
 async function generateDraft(){
 await run(async()=>{
 setDraft(null);setIssues(null);if(dirty||timeDirty)await save()
 const latest=await fetchPreparation(yearId,semester);if(latest.error||!latest.data)throw Error(latest.error||'ตรวจคาบเรียนล่าสุดไม่สำเร็จ');setData(latest.data)
 const budget=schedulePeriodBudget(latest.data,rooms),missing=budget.filter(row=>row.missing),over=budget.filter(row=>row.excess)
 if(over.length){await alert.fire({icon:'error',title:'จำนวนคาบเกินเวลาที่กำหนด',text:over.map(row=>row.label+' เกิน '+row.excess+' คาบ').join(' · '),confirmButtonText:'ไปแก้ไขรายวิชา'});setStep(5);return}
 if(missing.length){
 const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
 const response=await alert.fire({icon:'warning',title:'คาบเรียนยังไม่ครบ '+missing.length+' ห้อง',html:'<p>หากจัดต่อ ระบบจะตรวจเงื่อนไขก่อน แล้วจัดเฉพาะคาบที่กำหนด โดยเว้นช่องที่ขาดไว้</p><ul style="max-height:38vh;overflow:auto;text-align:left;padding-left:24px">'+missing.map(row=>'<li><b>'+escape(row.label)+'</b> · วิชา '+row.subjects+' + กิจกรรม '+row.activities+' = '+row.total+'/'+row.target+' คาบ · <b>ขาด '+row.missing+' คาบ</b></li>').join('')+'</ul>',showCancelButton:true,showDenyButton:true,confirmButtonText:'ดำเนินการจัดเลย',denyButtonText:'ไปแก้ไขรายวิชา',denyButtonColor:'#64748b',cancelButtonText:'ยกเลิก'})
 if(!response.isConfirmed){if(response.isDenied)setStep(5);return}
 }
 const result=await createScheduleDraft(yearId,semester,rooms,clear);if(result.error||!result.data)throw Error(result.error||'สร้างฉบับร่างไม่สำเร็จ');setDraft(result.data);setIssues(result.data.issues)
 },'กำลังตรวจคาบเรียนและจัดตารางอัตโนมัติ…')
 }
 async function clearPlacedSubjects(kind:'subjects'|'activities'='subjects'){
  if(!data||busy||runLock.current||!rooms.length)return
  if(dirty||timeDirty||hasUnsavedInput){setError('บันทึกการตั้งค่าที่กำลังแก้ก่อนล้างคาบรายวิชา');return}
  const selected=[...rooms],names=selected.map(id=>{const room=data.classrooms.find(room=>room.id===id);return room?room.level+'/'+room.name:id})
  await run(async()=>{
    const preview=await previewScheduleClear(yearId,semester,'selected',selected[0],selected,{kind,includeLocked:true})
    if(preview.error||!preview.data)throw Error(preview.error||'ตรวจข้อมูลก่อนล้างไม่สำเร็จ')
    const choice=await confirmScheduleClear(kind,names.slice(0,6).join(' · ')+(names.length>6?' และอีก '+(names.length-6)+' ห้อง':''),preview.data)
    if(!choice)return
    const result=await clearScheduleScope(yearId,semester,'selected',selected[0],selected,{kind,...choice,expectedHash:preview.data.hash})
    if(result.error)throw Error(result.error)
    await reload();setMessage('ล้างคาบ'+(kind==='activities'?'กิจกรรม':'รายวิชา')+'แล้ว '+(result.data?.removed||0)+' คาบ'+(choice.includeLocked?' · รวมคาบที่ล็อก':' · เก็บคาบที่ล็อกไว้'))
  },'กำลังตรวจและล้างคาบตาราง…')
 }
 async function reload(){const r=await fetchPreparation(yearId,semester);if(r.error||!r.data)throw Error(r.error||'โหลดไม่สำเร็จ');setData(r.data);setDirty(false);setTimeDirty(false);setTeacherAssignments({});setIssues(null);setDraft(null);onChanged()}
 async function saveTeachingGroups(groups:NonNullable<Preparation['plan']['teachingGroups']>){
 if(!data||runLock.current)throw Error('กำลังบันทึก กรุณารอก่อน')
 if(dirty||timeDirty||hasUnsavedInput)throw Error('บันทึกข้อมูลที่กำลังแก้ก่อนสร้างกลุ่มสอนรวม')
 runLock.current=true;setBusy(true);setWorkingLabel('กำลังบันทึกกลุ่มสอนรวม…')
 try{const result=await savePreparation(yearId,semester,data.hash,{...data.plan,teachingGroups:groups,rules:{...data.plan.rules,...Object.fromEntries(groups.flatMap(group=>group.lessonIds).map(id=>{const lesson=data.lessons.find(lesson=>lesson.id===id)!;return [id,data.plan.rules[id]||{count:lesson.count,pattern:lesson.pattern||Array(lesson.count).fill(1),roomId:lesson.roomId||null,morning:!!lesson.morning,timePreference:lesson.timePreference||'any',spread:lesson.spread??true}]}))}});if(result.error||!result.data)throw Error(result.error||'บันทึกไม่สำเร็จ');setData(result.data);setDraft(null);setIssues(null);setMessage('บันทึกกลุ่มสอนรวมแล้ว');onChanged()}finally{runLock.current=false;setBusy(false)}
 }
 async function refreshLocks(){
 const latest=await fetchPreparation(yearId,semester);if(latest.error||!latest.data)throw Error(latest.error||'โหลดคาบที่ล็อกไม่สำเร็จ');const fresh=latest.data
 // Joint lock edits change both slots and grouping metadata. Keep unsaved plan
 // settings while refreshing the saved groups and their teacher-load keys.
 setData(current=>current?{...current,hash:fresh.hash,slots:fresh.slots,blocks:fresh.blocks,manualBlocks:fresh.manualBlocks,substituteReservations:fresh.substituteReservations,lessons:fresh.lessons,plan:{...current.plan,teachingGroups:fresh.plan.teachingGroups}}:fresh);setDraft(null);setIssues(null)
 }
 async function saveWorkload(change:WorkloadChange){
 if(!data||runLock.current)throw Error('กำลังบันทึก กรุณารอให้เสร็จก่อน')
 if(dirty||timeDirty||hasUnsavedInput)throw Error('บันทึกการตั้งค่าหรือข้อมูลในขั้นก่อนหน้าให้เรียบร้อยก่อนกำหนดภาระสอน')
 runLock.current=true;setBusy(true);setWorkingLabel('กำลังบันทึกภาระสอน…');setError('');setMessage('');setIssues(null);setDraft(null)
 let planSaved=false
 try{
 let saved=data
 const plan={...data.plan,rules:{...data.plan.rules,...Object.fromEntries((change.rules||[]).map(rule=>[rule.lessonId,rule.value]))},rooms:[...data.plan.rooms,...(change.places||[]).filter(place=>!data.plan.rooms.some(existing=>existing.id===place.id))]}
 if(JSON.stringify(plan)!==JSON.stringify(data.plan)){
 const result=await savePreparation(yearId,semester,saved.hash,plan)
 if(result.error||!result.data)throw Error(result.error||'บันทึกภาระสอนไม่สำเร็จ')
 saved=result.data;setData(saved);planSaved=true
 }
 const changed=change.assignments.filter(row=>(saved.lessons.find(lesson=>lesson.id===row.lessonId)?.teacherId||'')!==row.teacherId)
 if(changed.length){
 const result=await saveScheduleTeachingAssignments(yearId,semester,saved.hash,changed)
 if(result.error||!result.data)throw Error(result.error||'บันทึกครูผู้สอนไม่สำเร็จ')
 saved=result.data;setData(saved)
 }
 onChanged()
 }catch(error){
 const detail=error instanceof Error?error.message:'บันทึกภาระสอนไม่สำเร็จ'
 const message=planSaved?`${detail}\nบันทึกคาบและเงื่อนไขแล้ว แต่ครูผู้สอนยังบันทึกไม่สำเร็จ กดบันทึกเพื่อลองใหม่`:detail
 setError(message);throw Error(message)
 }finally{runLock.current=false;setBusy(false)}
 }
 if(!data)return <section className="schedule-prep" role="status">{error||'กำลังตรวจข้อมูลเตรียมตาราง…'}{error&&<button onClick={()=>void run(reload)}>ลองใหม่</button>}</section>
 const rule=(id:string,count:number):LessonRule=>data.plan.rules[id]||{count,pattern:Array(Math.max(0,Math.min(40,count))).fill(1),roomId:null,morning:false,spread:true}
 const scopedLessons=data.lessons.filter(l=>data.classrooms.some(c=>c.id===l.classroomId))
 const teaching=scopedLessons.filter(l=>!l.activity)
 const eligibleTeachers=data.plan.teacherIds??data.teachers.map(t=>t.id)
 const workloadReady=teaching.length>0&&teaching.every(l=>{const r=rule(l.id,l.count),teacher=teacherAssignments[l.id]??l.teacherId;return teacher&&eligibleTeachers.includes(teacher)&&r.count>0&&r.pattern.length>0&&r.pattern.every(n=>Number.isInteger(n)&&n>=1&&n<=8)&&r.pattern.reduce((a,b)=>a+b,0)===r.count})
 const stepsReady=[data.timesConfigured&&!timeDirty&&data.periods.length>0&&data.plan.days.length>0,data.classrooms.length>0,eligibleTeachers.length>0&&!inputDirty.teachers,true,teaching.length>0&&!inputDirty.subjects,workloadReady,issues!==null&&!issues.some(i=>i.severity==='error')&&!dirty&&!timeDirty&&!hasInputDirty]
 const statuses=[stepsReady[0]?'ตั้งค่าแล้ว':'ยังต้องตั้งค่า',stepsReady[1]?`เปิด ${data.classrooms.length} ห้อง`:'ยังไม่มีห้อง',stepsReady[2]?`เลือก ${eligibleTeachers.length} คน`:'ยังต้องเลือกครู','กำหนดตามแผนโรงเรียน',stepsReady[4]?`${teaching.length} รายการ`:'ยังต้องเพิ่มรายวิชา',stepsReady[5]?'กำหนดครบแล้ว':'ยังต้องกำหนดภาระสอน',stepsReady[6]?'ผ่านการตรวจเบื้องต้น':'ยังไม่ผ่านการตรวจ']

 return <section className="schedule-prep" aria-label="เตรียมและจัดตารางเรียน" aria-busy={busy}>
 <header className="prep-heading"><div><span className="prep-eyebrow"><FiZap aria-hidden="true"/> จัดตารางเรียน</span><h2>เตรียมตารางอย่างเป็นขั้นตอน</h2><p>กำหนดวัน ครู วิชา และกิจกรรม แล้วตรวจฉบับร่างก่อนบันทึกใช้จริง</p></div><span className="prep-count">ขั้น {step} จาก 7</span></header>
 <nav aria-label="ขั้นตอนจัดตาราง"><ol className="prep-steps">{titles.map((title,i)=><li key={title}><button type="button" disabled={busy} aria-current={step===i+1?'step':undefined} onClick={()=>setStep(i+1)}><b aria-hidden="true">{i+1}</b><span><strong>{title}</strong><small>{statuses[i]}</small></span></button></li>)}</ol></nav>
 {step===1&&<div className="prep-step-context"><span>ขั้น {step} · {titles[step-1]}</span><p>{descriptions[step-1]}</p><small>ความพร้อมนี้เป็นข้อมูลเบื้องต้น ตรวจข้อบังคับทั้งหมดอีกครั้งในขั้น 7</small></div>}
 {hasInputDirty&&<p className="prep-notice">มีข้อมูลนำเข้าที่ยังไม่บันทึกในขั้น {inputDirty.teachers?"3 ครู ":""}{inputDirty.subjects?"5 รายวิชา":""} · บันทึกข้อมูลในขั้นนั้นก่อนสร้างฉบับร่าง</p>}
 {error&&<div className="prep-error" role="alert">{error}<button disabled={busy} onClick={()=>void run(async()=>{if((dirty||timeDirty)&&!(await alert.fire({icon:'warning',title:'ทิ้งการตั้งค่าที่ยังไม่บันทึก?',showCancelButton:true})).isConfirmed)return;await reload();setDraft(null)})}>โหลดข้อมูลล่าสุด</button></div>}{message&&<p role="status" className="prep-success">{message}</p>}
 {(dirty||timeDirty)&&step!==1&&<div className="prep-save-bar" role="status"><span>{step===2?'บันทึกวันและเวลาก่อนกำหนดชั้น':step===3?'บันทึกวันและเวลาก่อนเพิ่มครู':step===5?'บันทึกวันและเวลาก่อนเพิ่มรายวิชา':'มีการตั้งค่าที่ยังไม่บันทึก'}</span><button type="button" className="prep-primary" disabled={busy} onClick={()=>void run(save)}>บันทึก</button></div>}
 <div className="prep-input-step" hidden={step!==3}><ScheduleDataInput kind="teachers" data={data} year={yearId} term={semester} onSaved={reload} onRoster={ids=>edit(d=>({...d,plan:{...d.plan,teacherIds:ids}}))} locked={dirty||timeDirty} onBusy={setBusy} onDirty={value=>setInputDirty(v=>({...v,teachers:value}))}/></div><div className="prep-input-step" hidden={step!==5}><ScheduleDataInput kind="subjects" data={data} year={yearId} term={semester} onSaved={reload} onRoster={ids=>edit(d=>({...d,plan:{...d.plan,teacherIds:ids}}))} locked={dirty||timeDirty} onBusy={setBusy} onDirty={value=>setInputDirty(v=>({...v,subjects:value}))}/><SchedulePeriodBudget data={data} onFix={setStep}/></div>
 <fieldset disabled={busy} className="prep-body">
 {step===1&&<><h2>วันและเวลาคาบเรียน</h2><p>เลือกวันเรียน แล้วปรับเวลาและช่วงพักได้ที่นี่</p><div className="prep-checks">{SCHEDULE_DAYS.map(day=><label key={day.value}><input type="checkbox" checked={data.plan.days.includes(day.value)} onChange={()=>edit(d=>({...d,plan:{...d.plan,days:d.plan.days.includes(day.value)?d.plan.days.filter(v=>v!==day.value):[...d.plan.days,day.value].sort()}}))}/>{day.label}</label>)}</div><WizardPeriodEditor rows={data.periods} configured={data.timesConfigured} dirty={dirty||timeDirty} onSave={()=>void run(save)} onChange={periods=>{setData({...data,periods});setTimeDirty(true);setIssues(null);setDraft(null)}}/></>}

 {step===2&&<ClassroomLevelEditor classrooms={data.classrooms} year={yearId} term={semester} locked={dirty||timeDirty} busy={busy} onSaved={reload} onBusy={setBusy}/>}
 {step===6&&<WorkloadEditor snapshotHash={data.hash} teachingGroups={data.plan.teachingGroups||[]} onTeachingGroupsChange={saveTeachingGroups} classrooms={data.classrooms} lessons={teaching} teachers={data.teachers.filter(t=>eligibleTeachers.includes(t.id))} rules={data.plan.rules} teacherAssignments={teacherAssignments} activityLessons={data.lessons.filter(lesson=>lesson.activity)} activityGroups={data.plan.activityGroups||[]} substituteReservations={data.substituteReservations||[]} onEditActivities={()=>setStep(4)} slots={data.slots} places={data.plan.rooms} blocks={data.manualBlocks??data.blocks} days={data.plan.days} periods={data.periods} year={yearId} term={semester} busy={busy} ready={workloadReady} onCommit={saveWorkload} onRefresh={refreshLocks} operations={{setJointTeachingScheduleCell,removeScheduleSubjectCell,editTeacherScheduleCell,saveClassScheduleCell,setTeacherAvailabilityBlock,toggleScheduleCellLock}}/>}
 {step===4&&<ActivityTeamEditor data={data} year={yearId} term={semester} onSaved={reload} onBusy={setBusy} onDirty={setActivityDirty} blocked={dirty||timeDirty||hasInputDirty}/>}
 {step===7&&<ScheduleReviewStep data={data} rooms={rooms} clear={clear} issues={issues} draft={draft} blocked={hasUnsavedInput} workingLabel={busy?workingLabel:undefined}
 onRooms={next=>{setRooms(next);setIssues(null);setDraft(null)}} onClear={next=>{setClear(next);setIssues(null);setDraft(null)}} onFix={setStep}
 onClearSubjects={()=>void clearPlacedSubjects()}
 onClearActivities={()=>void clearPlacedSubjects('activities')}
 onCheck={()=>void run(async()=>{setDraft(null);setIssues(null);if(dirty||timeDirty)await save();const result=await checkPreparation(yearId,semester,rooms,clear);if(result.error)throw Error(result.error);setIssues(result.data)},'กำลังตรวจความพร้อม…')}
 onGenerate={()=>void generateDraft()}
 onConfirm={()=>void run(async()=>{if(!draft?.id||dirty||timeDirty||hasUnsavedInput)throw Error('ข้อมูลเตรียมตารางเปลี่ยนแล้ว กรุณาบันทึกและสร้างฉบับร่างใหม่');const locked=draft.locked||0;const outside=draft.affectedRooms||[];if(!(await alert.fire({icon:'question',title:'ยืนยันใช้ฉบับร่างนี้?',text:`บันทึกตารางเป็นชุดเดียว${outside.length?` รวมกิจกรรมร่วมในห้องนอกขอบเขตอีก ${outside.length} ห้อง`:''}${locked?` และแทนที่คาบล็อก ${locked} ช่อง`:''} ระบบจะตรวจว่าข้อมูลล่าสุดยังตรงกับฉบับร่าง`,showCancelButton:true})).isConfirmed)return;const result=await confirmScheduleDraft(draft.id,locked>0);if(result.error)throw Error(result.error);setDraft(null);await reload();setMessage('บันทึกใช้ตารางแล้ว');await alert.fire({icon:'success',title:'บันทึกตารางแล้ว',text:result.data?.committed?'ตารางเรียนและตารางครูใช้ข้อมูลชุดนี้แล้ว':'ฉบับร่างนี้ถูกบันทึกใช้ไปแล้ว ไม่มีการบันทึกซ้ำ'})},'กำลังตรวจข้อมูลล่าสุดและบันทึกตาราง…')}
 onDiscard={()=>void run(async()=>{if(!draft?.id||!(await alert.fire({icon:'warning',title:'ทิ้งฉบับร่างนี้?',showCancelButton:true})).isConfirmed)return;const result=await discardScheduleDraft(draft.id);if(result.error)throw Error(result.error);setDraft(null);setMessage('ยกเลิกร่างแล้ว ตารางจริงไม่เปลี่ยน')},'กำลังยกเลิกฉบับร่าง…')}/>}
 </fieldset>{busy&&step!==7&&<p className="prep-working" role="status">{workingLabel}</p>}<footer className="prep-wizard-footer"><button type="button" disabled={step===1||busy} onClick={()=>setStep(step-1)}><FiArrowLeft aria-hidden="true"/>ย้อนกลับ</button><span>{step===7?'ตรวจร่างก่อนยืนยัน ตารางจริงยังไม่เปลี่ยน':`ถัดไป: ${titles[step]}`}</span>{step<7&&<button type="button" className="prep-primary" disabled={busy} onClick={()=>setStep(step+1)}>ขั้นถัดไป<FiArrowRight aria-hidden="true"/></button>}{step===7&&<span className="prep-review-hint"><FiCheck aria-hidden="true"/>ยืนยันได้เมื่อมีฉบับร่างพร้อมตรวจ</span>}</footer>
 </section>
}
