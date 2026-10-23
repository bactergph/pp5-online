'use client'
import { useEffect, useRef, useState } from 'react'
import type { DraftPreview, Preparation } from '@/lib/schedule-preparation'
import type { PlanningIssue } from '@/lib/schedule-planning'
import type { ScheduleSlot } from '@/lib/schedule-store'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import { activityTeachers } from '@/lib/schedule-activity-teams'
import { activityTeacherLabel, teacherGivenName } from '@/lib/schedule-helpers'
import ScheduleGridTable from './ScheduleGridTable'

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
}
const steps:Record<number,string>={1:'วันและเวลา',3:'กำหนดครู',4:'รายวิชา',5:'กิจกรรม',6:'ภาระสอนและล็อกคาบ',7:'ตรวจและจัดตาราง'}

export default function ScheduleReviewStep({data,rooms,clear,issues,draft,blocked,onRooms,onClear,onCheck,onGenerate,onConfirm,onDiscard,onFix}:Props) {
  const resultRef=useRef<HTMLDivElement>(null)
  const [previewRoom,setPreviewRoom]=useState(''),[limits,setLimits]=useState<Record<number,number>>({})
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
  return <>
    <h2>ตรวจและจัดตารางเรียน</h2>
    <p>เลือกห้อง → สร้างฉบับร่างอัตโนมัติ → ตรวจผลและบันทึกใช้จริง ตารางจริงจะยังไม่เปลี่ยนระหว่างสร้างร่าง</p>
    <p className="prep-scope-note">ระบบพยายามจัดคณิตศาสตร์และวิทยาศาสตร์ไว้ก่อนพักกลางวัน หากครู คาบล็อก หรือเงื่อนไขอื่นไม่เอื้อ จะใช้ช่วงบ่ายเพื่อจัดให้ครบ</p>
    <div className="prep-review-selection">
      <div className="prep-review-title"><h3>ห้องที่จะจัดตาราง</h3><strong>{rooms.length} ห้อง</strong></div>
      <div className="prep-checks"><button type="button" onClick={()=>onRooms(data.classrooms.map(room=>room.id))}>เลือกทั้งโรงเรียน</button><button type="button" onClick={()=>onRooms([])}>ล้างการเลือก</button></div>
      <div className="prep-room-groups">{[...new Set(data.classrooms.map(room=>room.level))].map(level=><details key={level} open={data.classrooms.length<=12}>
        <summary>{level} · เลือก {data.classrooms.filter(room=>room.level===level&&rooms.includes(room.id)).length}/{data.classrooms.filter(room=>room.level===level).length} ห้อง</summary>
        <div className="prep-checks"><button type="button" onClick={()=>onRooms([...new Set([...rooms,...data.classrooms.filter(room=>room.level===level).map(room=>room.id)])])}>เลือกทั้ง {level}</button>{data.classrooms.filter(room=>room.level===level).map(room=><label key={room.id}><input type="checkbox" checked={rooms.includes(room.id)} onChange={()=>onRooms(rooms.includes(room.id)?rooms.filter(id=>id!==room.id):[...rooms,room.id])}/>{roomName(room.id)}</label>)}</div>
      </details>)}</div>
      <p className="prep-scope-note">เฉพาะประถมและมัธยม ไม่รวมอนุบาล · ระบบตรวจครูและสถานที่ชนกับห้องนอกขอบเขตด้วย</p>
    </div>
    <label className="prep-review-rebuild"><input type="checkbox" checked={clear} onChange={event=>onClear(event.target.checked)}/><span><b>จัดวิชาที่ไม่ล็อกใหม่</b><small>{clear?'ย้ายวิชาที่ไม่ล็อกในห้องที่เลือกได้ โดยคงคาบล็อกและกิจกรรมที่ระบุวันไว้':'เติมเฉพาะช่องว่าง วิชาที่ลงไว้แล้วจะอยู่คาบเดิม'}</small></span></label>
    {groups.length>0&&<details className="prep-review-activities"><summary>กิจกรรมที่นำมาจัด {groups.length} กลุ่ม</summary><ul>{groups.map(group=><li key={group.id}><b>{data.activities.find(activity=>activity.id===group.settingId)?.label||'กิจกรรม'}</b> · {group.weeklyPeriods} คาบ/สัปดาห์ · {group.cells.length?group.cells.map(cell=>`${SCHEDULE_DAYS.find(day=>day.value===cell.day)?.label} คาบ ${cell.period}`).join(', '):'จัดวันและคาบอัตโนมัติ'}{group.mode==='joint'&&group.roomIds.some(id=>!rooms.includes(id))&&<small>กิจกรรมรวมกลุ่มอาจเปลี่ยนคาบในอีก {group.roomIds.filter(id=>!rooms.includes(id)).length} ห้อง เพื่อให้จัดพร้อมกัน</small>}</li>)}</ul></details>}
    {blocked&&<p className="prep-notice" role="status">บันทึกข้อมูลครู รายวิชา หรือกิจกรรมที่กำลังแก้ก่อนสร้างร่าง</p>}
    <div className="prep-checks prep-review-actions"><button type="button" disabled={blocked||!rooms.length} onClick={onCheck}>ตรวจข้อมูลล่าสุด</button><button type="button" className="prep-primary" disabled={blocked||!rooms.length} onClick={onGenerate}>สร้างตารางฉบับร่าง</button></div>
    <div ref={resultRef} className="prep-result" tabIndex={-1} aria-label="ผลตรวจและฉบับร่าง">
      {!draft&&!issues&&<p className="prep-empty-result">ผลตรวจและตารางฉบับร่างจะแสดงที่นี่ หลังจากเลือกห้องแล้วกดสร้างฉบับร่าง</p>}
      {issues&&<div aria-live="polite">
        <p className={errors.length?'prep-error':'prep-success'}>{errors.length?`ต้องแก้ ${errors.length} รายการก่อนจัดตาราง`:'ผ่านการตรวจเบื้องต้น การค้นหายังต้องจัดให้ตรงเงื่อนไขทั้งหมด'}</p>
        {byStep.map(({step,items})=><details key={step} className="prep-review-issues" open={errors.length<=12}>
          <summary>{steps[step]||'ตรวจข้อมูล'} · {items.length} รายการ</summary>
          <button type="button" onClick={()=>onFix(step)}>ไปแก้{steps[step]||'ข้อมูล'}</button>
          <ul>{items.slice(0,limits[step]||12).map((issue,index)=><li key={index}>{issue.message}</li>)}</ul>
          {items.length>(limits[step]||12)&&<button type="button" onClick={()=>setLimits(current=>({...current,[step]:(current[step]||12)+50}))}>แสดงเพิ่มอีก {Math.min(50,items.length-(limits[step]||12))} รายการ</button>}
        </details>)}
        {!!warnings.length&&<details><summary>คำเตือน {warnings.length} รายการ</summary>{warnings.map((issue,index)=><p key={index}>{issue.message} <button type="button" onClick={()=>onFix(issue.step)}>ไปตรวจข้อมูล</button></p>)}</details>}
      </div>}
      {draft&&!ready&&<div className="prep-draft"><h3>{draft.status==='timeout'?'ยังค้นหาคำตอบไม่เสร็จ':draft.status==='conflict'?'เงื่อนไขจัดตารางขัดกัน':'ยังสร้างฉบับร่างไม่ได้'}</h3>{draft.message&&<p role="status">{draft.message}</p>}{draft.status==='timeout'&&<p>หยุดค้นหาที่ {draft.limitReason==='node_limit'?`${(draft.nodes||0).toLocaleString()} สถานะ`:`${Math.ceil((draft.elapsedMs??draft.timeLimitMs??45_000)/1000)} วินาที`} ยังไม่ยืนยันว่าจัดไม่ได้ ลองเลือกห้องเป็นชุดเล็กลงหรือตรวจคาบล็อกและช่วงว่างของครู</p>}<p>ตารางจริงยังไม่เปลี่ยน และยังไม่มีฉบับร่างให้บันทึก</p></div>}
      {ready&&draft&&<div className="prep-draft">
        <h3>ฉบับร่างพร้อมตรวจ</h3><p>จัดครบตามเป้าของห้องที่เลือก เพิ่มใหม่ {draft.assigned} คาบ · ตารางจริงยังไม่เปลี่ยน</p>
        {!!draft.affectedRooms?.length&&<p className="prep-notice">กิจกรรมรวมกลุ่มทำให้คาบในห้องนอกขอบเขตเปลี่ยนด้วย: {draft.affectedRooms.map(roomName).join(', ')} กรุณาตรวจห้องเหล่านี้ก่อนยืนยัน</p>}
        {!!draft.summary?.length&&<details><summary>จำนวนคาบที่จัดได้รายห้อง</summary><ul>{draft.summary.map(room=><li key={room.roomId}>{roomName(room.roomId)} · จัดแล้ว {room.scheduled}/{room.target} คาบ</li>)}</ul></details>}
        <div className="prep-checks prep-review-actions"><button type="button" className="prep-primary" onClick={onConfirm}>บันทึกใช้ตารางนี้</button><button type="button" onClick={onDiscard}>ทิ้งฉบับร่าง</button></div>
        <label>ตรวจห้อง <select value={activeRoom} onChange={event=>setPreviewRoom(event.target.value)}>{previewRooms.map(id=><option key={id} value={id}>{roomName(id)}{!rooms.includes(id)?' (กิจกรรมร่วม)':''}</option>)}</select></label>
        <div className="prep-scroll"><p className="prep-draft-legend"><span><i className="prep-swatch prep-swatch-activity"/>กิจกรรม</span><span><i className="prep-swatch prep-swatch-subject"/>รายวิชา</span><span><i className="prep-swatch prep-swatch-empty"/>ว่าง</span></p><ScheduleGridTable periodTimes={draft.preview?.periods||data.periods} days={draft.preview?.days||data.plan.days} renderCell={renderCell}/></div>
      </div>}
    </div>
  </>
}
