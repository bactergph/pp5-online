'use client'
import {useState} from 'react'
import type {JointLockRequest} from '@/lib/schedule-joint-lock'
import type {ScheduleLesson,ScheduleSlot} from '@/lib/schedule-store'
import type {PeriodTimeRow} from '@/lib/schedule-helpers'
import type {JointTeachingGroup} from '@/lib/schedule-joint-teaching'

export default function JointSessionPicker({snapshotHash,lessons,teacherId,initialLessonId,day,period,periods,slots,groups,roomLabel,onPrepare}:{
  snapshotHash?:string;lessons:ScheduleLesson[];teacherId:string;initialLessonId:string;day:number;period:number;periods:PeriodTimeRow[];slots:ScheduleSlot[];groups:JointTeachingGroup[];roomLabel:(id:string)=>string;onPrepare:(request:JointLockRequest)=>void
}){
  const available=lessons.filter(lesson=>!lesson.activity&&lesson.teacherId===teacherId)
  const [ids,setIds]=useState<string[]>(initialLessonId?[initialLessonId]:[]),[selectedPeriods,setPeriods]=useState([period]),[move,setMove]=useState(false),[error,setError]=useState('')
  const chosen=available.filter(lesson=>ids.includes(lesson.id))
  const previous=slots.filter(slot=>slot.class_subject_id&&ids.includes(slot.class_subject_id)&&!(slot.day_of_week===day&&selectedPeriods.includes(slot.period))&&!groups.some(group=>group.cells&&group.lessonIds.includes(slot.class_subject_id!)&&group.cells.some(cell=>cell.day===slot.day_of_week&&cell.period===slot.period)))
  function prepare(){
    setError('')
    if(chosen.length<2||new Set(chosen.map(lesson=>lesson.classroomId)).size!==chosen.length){setError('เลือกวิชาจากอย่างน้อย 2 ห้อง โดยเลือกห้องละหนึ่งวิชา');return}
    if(!selectedPeriods.length){setError('เลือกคาบที่จะสอนพร้อมกันอย่างน้อย 1 คาบ');return}
    onPrepare({expectedHash:snapshotHash,lessonId:chosen[0].id,lessonIds:chosen.map(lesson=>lesson.id),groupId:crypto.randomUUID(),day,period,periods:selectedPeriods.slice().sort((a,b)=>a-b),locked:true,replaceExisting:move&&previous.length>0,expected:chosen.flatMap(lesson=>selectedPeriods.map(period=>{const old=slots.find(slot=>slot.classroom_id===lesson.classroomId&&slot.day_of_week===day&&slot.period===period);return {classroomId:lesson.classroomId,lessonId:old?.class_subject_id||null,locked:!!old?.locked,period}}))})
  }
  return <section className="prep-activity-block joint-session-picker" aria-label="ล็อกสอนรวมเฉพาะคาบ">
    <h3>เลือกวิชาและห้องที่จะสอนพร้อมกัน</h3><p>เลือกครูคนเดียวกัน ห้องละหนึ่งวิชา รหัส ชื่อวิชา และภาระต่อสัปดาห์ต่างกันได้ รวมกันเฉพาะคาบที่เลือก ส่วนคาบที่เหลือจัดแยกได้</p>
    <div className="joint-session-choices">{available.map(lesson=><label key={lesson.id}><input type="checkbox" data-joint-lesson={lesson.id} checked={ids.includes(lesson.id)} onChange={event=>setIds(current=>event.target.checked?[...current,lesson.id]:current.filter(id=>id!==lesson.id))}/><span><b>{roomLabel(lesson.classroomId)} · {lesson.code}</b><span>{lesson.fullName||lesson.name}</span><small>{lesson.count} คาบต่อสัปดาห์</small></span></label>)}</div>
    <h3>คาบที่จะสอนพร้อมกันในวันนี้</h3><div className="joint-session-periods">{periods.filter(time=>!time.is_break).map(time=><label key={time.period}><input type="checkbox" data-joint-period={time.period} checked={selectedPeriods.includes(time.period)} onChange={event=>setPeriods(current=>event.target.checked?[...current,time.period]:current.filter(value=>value!==time.period))}/><span>คาบ {time.period}<small>{time.start_time}–{time.end_time}</small></span></label>)}</div>
    {previous.length>0&&<label className="joint-session-move"><input type="checkbox" checked={move} onChange={event=>setMove(event.target.checked)}/><span>นำคาบเดิมของวิชาที่เลือกออกก่อนล็อกใหม่ ({previous.length} ช่อง{previous.some(slot=>slot.locked)?' รวมคาบที่ล็อกไว้':''})<small>กระทบเฉพาะวิชาที่เลือก คาบที่เหลือจะรอจัดอัตโนมัติอีกครั้ง</small></span></label>}
    {error&&<p className="prep-error" role="alert">{error}</p>}
    <button type="button" className="prep-primary" disabled={chosen.length<2||!selectedPeriods.length} onClick={prepare}>ตรวจและยืนยันสอนรวม {chosen.length} ห้อง · {selectedPeriods.length} คาบ</button>
  </section>
}
