'use client'
import { useEffect, useRef, useState } from 'react'
import type { DraftPreview, Preparation } from '@/lib/schedule-preparation'
import type { PlanningIssue } from '@/lib/schedule-planning'
import type { ScheduleSlot } from '@/lib/schedule-store'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import { activityTeachers } from '@/lib/schedule-activity-teams'
import { activityTeacherLabel, teacherGivenName } from '@/lib/schedule-helpers'
import ScheduleGridTable from './ScheduleGridTable'
import { FiAlertCircle, FiCheckCircle, FiChevronRight, FiGrid, FiInfo, FiRefreshCw, FiSave, FiTrash2, FiZap } from 'react-icons/fi'
import './schedule-review.css'

export type ScheduleDraftView = {
  status:'invalid'|'complete'|'timeout'|'conflict'; id:string|null; rows:ScheduleSlot[]; issues:PlanningIssue[]; assigned:number; locked:number
  nodes?:number; limitReason?:'node_limit'|'time_limit'|null; timeLimitMs?:number; elapsedMs?:number; message?:string
  affectedRooms?:string[]; summary?:{roomId:string;target:number;scheduled:number}[]
  preview?:DraftPreview
  activityLessons?:{id:string;name:string;teacherName:string;classroomId:string;subjectId:string}[]
}
type Props = {
  data:Preparation; rooms:string[]; clear:boolean; issues:PlanningIssue[]|null; draft:ScheduleDraftView|null; blocked:boolean
  onRooms:(rooms:string[])=>void; onClear:(clear:boolean)=>void; onCheck:()=>void; onGenerate:()=>void
  onConfirm:()=>void; onDiscard:()=>void; onFix:(step:number)=>void
  workingLabel?:string
}
const steps:Record<number,string>={1:'วันและเวลา',2:'กำหนดชั้น',3:'กำหนดครู',4:'รายวิชา',5:'กิจกรรม',6:'ภาระสอนและล็อกคาบ',7:'ตรวจและจัดตาราง'}

export default function ScheduleReviewStep({data,rooms,clear,issues,draft,blocked,onRooms,onClear,onCheck,onGenerate,onConfirm,onDiscard,onFix,workingLabel}:Props) {
  const resultRef=useRef<HTMLDivElement>(null)
  const [previewRoom,setPreviewRoom]=useState(''),[limits,setLimits]=useState<Record<number,number>>({})
  const [selectedLevel,setSelectedLevel]=useState('')
  useEffect(()=>{
    if(!draft)return
    resultRef.current?.focus({preventScroll:true})
    resultRef.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
  },[draft])
  const roomName=(id:string)=>{const room=(draft?.preview?.classrooms||data.classrooms).find(room=>room.id===id);return room?`${room.level}/${room.name}`:id}
  const teacherNames=(ids:string[])=>ids.map(id=>{const teacher=data.teachers.find(teacher=>teacher.id===id);return teacher?`${teacher.prefix||''} ${teacher.full_name}`.trim():''}).filter(Boolean).join(', ')
  const groups=(data.plan.activityGroups||[]).filter(group=>group.roomIds.some(id=>rooms.includes(id)))
  const previewRooms=[...new Set([...rooms,...draft?.affectedRooms||[]])]
  const activeRoom=previewRooms.includes(previewRoom)?previewRoom:previewRooms[0]||''
  const errors=(issues||[]).filter(issue=>issue.severity==='error'),warnings=(issues||[]).filter(issue=>issue.severity==='warning')
  const byStep=[...new Set(errors.map(issue=>issue.step))].sort((a,b)=>a-b).map(step=>({step,items:errors.filter(issue=>issue.step===step)}))
  const ready=draft?.status==='complete'&&!!draft.id&&!blocked&&!errors.length
  const levels=[...new Set(data.classrooms.map(room=>room.level))]
  const activeLevel=levels.includes(selectedLevel)?selectedLevel:levels[0]||''
  const levelRooms=data.classrooms.filter(room=>room.level===activeLevel)
  const levelSelected=levelRooms.filter(room=>rooms.includes(room.id)).length
  function toggleLevel(){
    const ids=levelRooms.map(room=>room.id)
    onRooms(levelSelected===ids.length?rooms.filter(id=>!ids.includes(id)):[...new Set([...rooms,...ids])])
  }
  function renderCell(day:number,period:number){
    const slot=draft?.rows.find(row=>row.classroom_id===activeRoom&&row.day_of_week===day&&row.period===period)
    const activity=slot?.activity_id?(draft?.preview?.lessons||draft?.activityLessons||data.lessons).find(lesson=>lesson.id==='activity:'+slot.activity_id):undefined
    // A cell is an activity only when the draft actually contains that activity.
    if(slot?.activity_id){
      const group=(data.plan.activityGroups||[]).find(group=>group.roomIds.includes(activeRoom)&&group.settingId===activity?.subjectId)
      const teachers=draft?.preview?(activity?.teacherName||''):activity?.teacherName||(group?teacherNames(activityTeachers(group,activeRoom)):'')
      return <div className="prep-slot prep-slot-activity"><b>{activity?.name||'กิจกรรม'}</b><small>กิจกรรม</small>{teachers&&<small>{activityTeacherLabel(teachers)}</small>}{slot.locked&&<small>ล็อก</small>}</div>
    }
    if(!slot?.class_subject_id)return <div className="prep-slot prep-slot-empty">{slot?.locked?'ล็อกช่องว่าง':slot?.note||'ว่าง'}</div>
    const lesson=(draft?.preview?.lessons||data.lessons).find(lesson=>lesson.id===slot.class_subject_id)
    return <div className={`prep-slot${slot.locked?' prep-slot-locked':''}`}><b>{lesson?.name||slot.note||'—'}</b>{lesson?.code&&<small>({lesson.code})</small>}{lesson?.teacherName&&<small>{teacherGivenName(lesson.teacherName)}</small>}{lesson?.roomName&&<small className="prep-slot-room">{lesson.roomName}</small>}{slot.locked&&<small>ล็อก</small>}</div>
  }
  return <section className="prep-review-step" aria-label="ตรวจและจัดตารางเรียน">
    <div className="prep-teacher-title prep-review-header">
      <h2>ตรวจและจัดตารางเรียน</h2>
      <p>เลือกห้อง สร้างฉบับร่าง แล้วตรวจตารางก่อนบันทึกใช้จริง</p>
    </div>
    <ol className="prep-review-flow" aria-label="ลำดับการจัดตาราง">
      <li><span>1</span>เลือกห้อง<FiChevronRight aria-hidden="true"/></li>
      <li><span>2</span>สร้างฉบับร่าง<FiChevronRight aria-hidden="true"/></li>
      <li><span>3</span>ตรวจและบันทึก</li>
    </ol>

    <section className="prep-review-selection" aria-labelledby="review-rooms-title">
      <div className="prep-review-title">
        <h3 id="review-rooms-title">ห้องที่จะจัดตาราง</h3>
        <span className="prep-review-count" aria-live="polite">เลือก {rooms.length} / {data.classrooms.length} ห้อง</span>
      </div>
      <div className="prep-subject-levels prep-review-levels" role="group" aria-label="เลือกระดับชั้นที่จะจัดตาราง">
        {levels.map(level=><button type="button" key={level} aria-pressed={level===activeLevel} onClick={()=>setSelectedLevel(level)}>{level}<small>{data.classrooms.filter(room=>room.level===level&&rooms.includes(room.id)).length}/{data.classrooms.filter(room=>room.level===level).length}</small></button>)}
      </div>
      <div className="prep-review-room-tools">
        <span>{activeLevel ? `${activeLevel} · เลือก ${levelSelected} จาก ${levelRooms.length} ห้อง` : 'ยังไม่มีห้องเรียนสำหรับจัดตาราง'}</span>
        <button type="button" disabled={!levelRooms.length} onClick={toggleLevel}>{levelSelected&&levelSelected===levelRooms.length?'เอาชั้นนี้ออก':'เลือกทั้งชั้น'}</button>
      </div>
      <div className="prep-review-room-picks" role="group" aria-label={`ห้องในระดับ ${activeLevel}`}>
        {levelRooms.map(room=><label key={room.id} className={rooms.includes(room.id)?'is-selected':undefined}><input type="checkbox" checked={rooms.includes(room.id)} onChange={()=>onRooms(rooms.includes(room.id)?rooms.filter(id=>id!==room.id):[...rooms,room.id])}/>{roomName(room.id)}</label>)}
      </div>
      <div className="prep-review-selection-footer">
        <small>เฉพาะประถมและมัธยม ไม่รวมอนุบาล</small>
        <div><button type="button" disabled={!data.classrooms.length||rooms.length===data.classrooms.length} onClick={()=>onRooms(data.classrooms.map(room=>room.id))}>เลือกทั้งโรงเรียน</button><button type="button" disabled={!rooms.length} onClick={()=>onRooms([])}>ล้างการเลือก</button></div>
      </div>
    </section>

    <section className="prep-review-options" aria-labelledby="review-mode-title">
      <h3 id="review-mode-title">ต้องการจัดตารางแบบไหน?</h3>
      <div className="prep-view-switch prep-review-rebuild" role="group" aria-label="รูปแบบจัดตาราง">
        <button type="button" aria-pressed={!clear} onClick={()=>onClear(false)}>เติมเฉพาะช่องว่าง</button>
        <button type="button" data-rebuild="true" aria-pressed={clear} onClick={()=>onClear(true)}>จัดวิชาที่ไม่ล็อกใหม่</button>
      </div>
      <p>{clear?'ย้ายวิชาที่ไม่ล็อกในห้องที่เลือกได้ โดยคงคาบล็อกและกิจกรรมที่ระบุวันไว้':'คงวิชาที่จัดไว้แล้ว แล้วนำคาบที่เหลือไปเติมในช่องว่าง'}</p>
      <details className="prep-review-conditions">
        <summary><FiInfo aria-hidden="true"/>เงื่อนไขที่ใช้จัดตาราง</summary>
        <ul><li>ตรวจครูและสถานที่ชน รวมตารางของห้องนอกขอบเขตที่เลือก</li><li>รักษาคาบพัก คาบล็อก ช่วงครูไม่ว่าง และรูปแบบคาบที่กำหนด</li><li>เน้นจัดภาษาไทย วิทยาศาสตร์ และคณิตศาสตร์ไว้ก่อนพักกลางวัน แม้เลือกได้ทั้งเช้าและบ่าย หากเงื่อนไขไม่เอื้อจะใช้ช่วงบ่ายเพื่อจัดให้ครบ</li></ul>
      </details>
      {groups.length>0&&<details className="prep-review-activities"><summary>กิจกรรมที่นำมาจัด {groups.length} กลุ่ม</summary><ul>{groups.map(group=><li key={group.id}><b>{data.activities.find(activity=>activity.id===group.settingId)?.label||'กิจกรรม'}</b><span>{group.weeklyPeriods} คาบ/สัปดาห์ · {group.cells.length?group.cells.map(cell=>`${SCHEDULE_DAYS.find(day=>day.value===cell.day)?.label} คาบ ${cell.period}`).join(', '):'จัดวันและคาบอัตโนมัติ'}</span>{group.mode==='joint'&&group.roomIds.some(id=>!rooms.includes(id))&&<small>กิจกรรมรวมกลุ่มอาจเปลี่ยนคาบในอีก {group.roomIds.filter(id=>!rooms.includes(id)).length} ห้อง เพื่อให้จัดพร้อมกัน</small>}</li>)}</ul></details>}
    </section>
    {blocked&&<p className="prep-notice" role="status"><FiInfo aria-hidden="true"/>บันทึกข้อมูลครู รายวิชา หรือกิจกรรมที่กำลังแก้ก่อนสร้างร่าง</p>}
    <div className="prep-review-action-bar">
      <span><FiInfo aria-hidden="true"/>{rooms.length ? 'ตารางจริงจะไม่เปลี่ยนจนยืนยันบันทึก' : 'เลือกอย่างน้อย 1 ห้องก่อนจัดตาราง'}</span>
      <div className="prep-review-actions"><button type="button" disabled={blocked||!rooms.length} onClick={onCheck}><FiRefreshCw aria-hidden="true"/>ตรวจข้อมูลล่าสุด</button><button type="button" className="prep-primary" disabled={blocked||!rooms.length} onClick={onGenerate}><FiZap aria-hidden="true"/>สร้างตารางฉบับร่าง</button></div>
    </div>
    {workingLabel&&<div className="prep-review-working" role="status"><FiRefreshCw aria-hidden="true"/><div><strong>{workingLabel}</strong><small>โปรดรอผลก่อนออกจากหน้านี้</small></div></div>}

    <div ref={resultRef} className="prep-result" tabIndex={-1} aria-label="ผลตรวจและฉบับร่าง">
      {!draft&&!issues&&!workingLabel&&<div className="prep-review-empty"><FiGrid aria-hidden="true"/><h3>ตารางฉบับร่างจะแสดงที่นี่</h3><p>กดสร้างฉบับร่าง ระบบจะตรวจข้อมูลและจัดตารางให้ห้องที่เลือก</p></div>}
      {issues&&<div className="prep-review-check-result" aria-live="polite">
        <div className={`prep-review-status ${errors.length?'is-error':'is-success'}`}>{errors.length?<FiAlertCircle aria-hidden="true"/>:<FiCheckCircle aria-hidden="true"/>}<div><strong>{errors.length?`ต้องแก้ ${errors.length} รายการก่อนจัดตาราง`:'ผ่านการตรวจเบื้องต้น'}</strong><p>{errors.length?'แยกตามขั้นตอนด้านล่าง กดไปแก้ข้อมูลแล้วกลับมาตรวจใหม่':'การตรวจเบื้องต้นไม่รับประกันว่าจะค้นหาตารางที่ตรงทุกเงื่อนไขได้เสมอ'}</p></div></div>
        {byStep.map(({step,items})=><details key={step} className="prep-review-issues" open={errors.length<=12}>
          <summary>ขั้น {step} · {steps[step]||'ตรวจข้อมูล'}<span>{items.length} รายการ</span></summary>
          <ul>{items.slice(0,limits[step]||12).map((issue,index)=><li key={index}>{issue.message}</li>)}</ul>
          <div className="prep-review-issue-actions"><button type="button" onClick={()=>onFix(step)}>ไปแก้{steps[step]||'ข้อมูล'}<FiChevronRight aria-hidden="true"/></button>{items.length>(limits[step]||12)&&<button type="button" onClick={()=>setLimits(current=>({...current,[step]:(current[step]||12)+50}))}>แสดงเพิ่มอีก {Math.min(50,items.length-(limits[step]||12))} รายการ</button>}</div>
        </details>)}
        {!!warnings.length&&<details className="prep-review-warnings"><summary>คำเตือน {warnings.length} รายการ</summary><ul>{warnings.map((issue,index)=><li key={index}><span>{issue.message}</span><button type="button" onClick={()=>onFix(issue.step)}>ไปตรวจข้อมูล<FiChevronRight aria-hidden="true"/></button></li>)}</ul></details>}
      </div>}
      {draft&&!ready&&<div className="prep-review-incomplete"><FiAlertCircle aria-hidden="true"/><div><h3>{draft.status==='timeout'?'ยังค้นหาคำตอบไม่เสร็จ':draft.status==='conflict'?'เงื่อนไขจัดตารางขัดกัน':draft.status==='complete'?'ฉบับร่างยังยืนยันไม่ได้':'ยังสร้างฉบับร่างไม่ได้'}</h3>{draft.message&&<p role="status">{draft.message}</p>}{draft.status==='timeout'&&<p>หยุดค้นหาที่ {draft.limitReason==='node_limit'?`${(draft.nodes||0).toLocaleString()} สถานะ`:`${Math.ceil((draft.elapsedMs??draft.timeLimitMs??45_000)/1000)} วินาที`} ยังไม่ยืนยันว่าจัดไม่ได้ ลองเลือกห้องเป็นชุดเล็กลงหรือตรวจคาบล็อกและช่วงว่างของครู</p>}<small>ตารางจริงยังไม่เปลี่ยน และยังไม่มีฉบับร่างที่พร้อมบันทึก</small></div></div>}
      {ready&&draft&&<div className="prep-draft">
        <header className="prep-review-draft-heading"><div><span className="prep-review-ready"><FiCheckCircle aria-hidden="true"/>จัดครบตามเป้า</span><h3>ฉบับร่างพร้อมตรวจ</h3><p>เลือกดูแต่ละห้อง แล้วบันทึกเมื่อพร้อมใช้งาน</p></div><span className="prep-review-unpublished">ยังไม่บันทึกใช้จริง</span></header>
        <dl className="prep-review-metrics"><div><dt>ห้องในฉบับร่าง</dt><dd>{previewRooms.length}<small>ห้อง</small></dd></div><div><dt>คาบในฉบับร่าง</dt><dd>{draft.rows.length.toLocaleString()}<small>คาบ</small></dd></div><div><dt>คาบเพิ่มใหม่</dt><dd>{draft.assigned.toLocaleString()}<small>คาบ</small></dd></div></dl>
        {!!draft.affectedRooms?.length&&<p className="prep-notice">กิจกรรมรวมกลุ่มทำให้คาบในห้องนอกขอบเขตเปลี่ยนด้วย: {draft.affectedRooms.map(roomName).join(', ')} กรุณาตรวจห้องเหล่านี้ก่อนยืนยัน</p>}
        {!!draft.summary?.length&&<details className="prep-review-room-summary"><summary>จำนวนคาบที่จัดได้รายห้อง</summary><ul>{draft.summary.map(room=><li key={room.roomId}><b>{roomName(room.roomId)}</b><span>จัดแล้ว {room.scheduled}/{room.target} คาบ</span></li>)}</ul></details>}
        <div className="prep-review-preview-bar"><label htmlFor="schedule-draft-room">ดูตารางห้อง<select id="schedule-draft-room" value={activeRoom} onChange={event=>setPreviewRoom(event.target.value)}>{previewRooms.map(id=><option key={id} value={id}>{roomName(id)}{!rooms.includes(id)?' (กิจกรรมร่วม)':''}</option>)}</select></label><p className="prep-draft-legend"><span><i className="prep-swatch prep-swatch-activity"/>กิจกรรม</span><span><i className="prep-swatch prep-swatch-subject"/>รายวิชา</span><span><i className="prep-swatch prep-swatch-empty"/>ว่าง</span></p></div>
        <div className="prep-scroll prep-review-grid" tabIndex={0} role="region" aria-label={`ตารางฉบับร่าง ${roomName(activeRoom)} เลื่อนเพื่อดูทุกคาบ`}><ScheduleGridTable periodTimes={draft.preview?.periods||data.periods} days={draft.preview?.days||data.plan.days} renderCell={renderCell}/></div>
        <div className="prep-review-save"><small>ระบบจะตรวจข้อมูลล่าสุดอีกครั้งก่อนบันทึกตารางเป็นชุดเดียว</small><div className="prep-review-actions"><button type="button" className="prep-review-discard" onClick={onDiscard}><FiTrash2 aria-hidden="true"/>ทิ้งฉบับร่าง</button><button type="button" className="prep-primary" onClick={onConfirm}><FiSave aria-hidden="true"/>บันทึกใช้ตารางนี้</button></div></div>
      </div>}
    </div>
  </section>
}
