'use client'
import { useEffect, useRef, useState } from 'react'
import type { Preparation } from '@/lib/schedule-preparation'
import { SUBJECT_GROUPS } from '@/lib/schedule-input'
import { prepareSubjectDetails, subjectDetailsPattern, type SubjectDetailsInput } from '@/lib/schedule-subject-details'
import { useScheduleServices } from './ScheduleServices'
import './schedule-subject-editor.css'

export default function ScheduleSubjectEditor({data,lessonId,year,term,onClose,onSaved,onReload,onDirty,onBusy}:{data:Preparation;lessonId:string;year:string;term:number;onClose:()=>void;onSaved:()=>Promise<void>;onReload:()=>Promise<void>;onDirty:(dirty:boolean)=>void;onBusy:(busy:boolean)=>void}){
  const {operations,local}=useScheduleServices(),dialog=useRef<HTMLDialogElement>(null),saving=useRef(false)
  const lesson=data.lessons.find(lesson=>lesson.id===lessonId)!,room=data.classrooms.find(room=>room.id===lesson.classroomId)
  const original=data.plan.rules[lessonId],initialName=lesson.fullName||lesson.name
  const initialPattern=original?.pattern||lesson.pattern||Array(lesson.count).fill(1)
  const [form,setForm]=useState<SubjectDetailsInput>({code:lesson.code,name:initialName,shortName:lesson.name!==initialName?lesson.name:'',group:lesson.subjectGroup||'',type:lesson.subjectType||'พื้นฐาน',count:original?.count??lesson.count,teacherId:lesson.teacherId,periodMode:initialPattern.every(size=>size===1)?'single':initialPattern.every(size=>size===1||size===2)?'double':undefined})
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const pattern=Number.isInteger(form.count)&&form.count>=1&&form.count<=40?(form.periodMode==='single'?Array(form.count).fill(1):form.periodMode==='double'?[...Array(Math.floor(form.count/2)).fill(2),...(form.count%2?[1]:[])]:subjectDetailsPattern(initialPattern,form.count)):[]
  const groups=[...new Set([...SUBJECT_GROUPS,...(lesson.subjectGroup?[lesson.subjectGroup]:[])])]
  useEffect(()=>{dialog.current?.showModal()},[])
  function close(){if(saving.current)return;dialog.current?.close();onDirty(false);onClose()}
  function change<K extends keyof SubjectDetailsInput>(key:K,value:SubjectDetailsInput[K]){setForm(current=>({...current,[key]:value}));setError('');onDirty(true)}
  async function save(){
    if(saving.current)return
    setError('')
    try{prepareSubjectDetails(data,lessonId,form)}catch(error){setError(error instanceof Error?error.message:'ตรวจรายละเอียดไม่สำเร็จ');return}
    saving.current=true;setBusy(true);onBusy(true)
    try{const result=await operations.saveScheduleSubjectDetails(year,term,data.hash,lessonId,form);if(result.error)throw Error(result.error);await onSaved();onDirty(false);dialog.current?.close();onClose()}catch(error){setError(error instanceof Error?error.message:'บันทึกไม่สำเร็จ')}finally{saving.current=false;setBusy(false);onBusy(false)}
  }
  return <dialog ref={dialog} className="prep-team-dialog prep-subject-edit-dialog" aria-labelledby="subject-edit-title" onCancel={event=>{event.preventDefault();close()}}>
    <header><div><h2 id="subject-edit-title">แก้ไขรายละเอียดรายวิชา</h2><p>{room?.level}/{room?.name||room?.room} · {lesson.code}</p></div><button type="button" disabled={busy} onClick={close}>ปิด</button></header>
    <form onSubmit={event=>{event.preventDefault();void save()}}>
      <div className="prep-team-dialog-body"><fieldset disabled={busy} className="subject-edit-fields">
        <label>รหัสวิชา<input name="code" required maxLength={40} value={form.code} onChange={event=>change('code',event.target.value)}/></label>
        <label className="subject-edit-wide">ชื่อวิชา<input name="name" required maxLength={200} value={form.name} onChange={event=>change('name',event.target.value)}/></label>
        <label className="subject-edit-wide">ชื่อย่อบนตาราง <small>เว้นว่างเพื่อใช้ชื่อวิชาเต็ม</small><input name="shortName" maxLength={200} value={form.shortName} onChange={event=>change('shortName',event.target.value)}/></label>
        <label>กลุ่มสาระ<select name="group" value={form.group} onChange={event=>change('group',event.target.value)}><option value="">ไม่ระบุหมวด</option>{groups.map(group=><option key={group}>{group}</option>)}</select></label>
        <label>ประเภทวิชา<select name="type" value={form.type} onChange={event=>change('type',event.target.value)}><option>พื้นฐาน</option><option>เพิ่มเติม</option></select></label>
        <label>คาบต่อสัปดาห์<input name="count" type="number" min={1} max={40} step={1} required value={Number.isNaN(form.count)?'':form.count} onChange={event=>change('count',event.target.value===''?NaN:Number(event.target.value))}/></label>
        <label>รูปแบบคาบ<select name="periodMode" value={form.periodMode||'keep'} onChange={event=>change('periodMode',event.target.value==='keep'?undefined:event.target.value as 'single'|'double')}><option value="single">เดี่ยวทั้งหมด · แยกวัน</option><option value="double">คาบคู่ + เดี่ยวที่เหลือ · แยกวัน</option>{initialPattern.some(size=>size>2)&&<option value="keep">คงรูปแบบเดิม ({initialPattern.join(' + ')})</option>}</select></label>
        <label className="subject-edit-wide">ครูผู้สอน<select name="teacherId" value={form.teacherId||''} onChange={event=>change('teacherId',event.target.value||null)}><option value="">ยังไม่กำหนดครู</option>{data.teachers.filter(teacher=>!data.plan.teacherIds?.length||data.plan.teacherIds.includes(teacher.id)||teacher.id===lesson.teacherId).map(teacher=><option key={teacher.id} value={teacher.id}>{[teacher.prefix,teacher.full_name].filter(Boolean).join(' ')}</option>)}</select></label>
      </fieldset><div className="subject-edit-context"><p>รูปแบบคาบ: {pattern.length?pattern.join(' + '):'ระบุจำนวนคาบ 1–40'} · หนึ่งวันเรียนวิชานี้ได้หนึ่งช่วง คาบคู่ต้องติดกันและไม่ข้ามพัก</p><p>สถานที่และความต้องการช่วงเวลาเดิมยังอยู่ หากเปลี่ยนรูปแบบคาบ ให้สร้างฉบับร่างแบบ “จัดวิชาที่ไม่ล็อกใหม่” เพื่อปรับตารางเดิม คาบที่ล็อกต้องตรงรูปแบบใหม่ก่อนบันทึก</p><p>{local?'แก้ไขรายวิชาและครูเฉพาะห้องนี้':'รหัส ชื่อ ชื่อย่อ กลุ่มสาระ และประเภทเป็นข้อมูลกลาง ทุกห้องและปีที่ใช้รายวิชาเดียวกันจะแสดงข้อมูลใหม่ ครูเปลี่ยนเฉพาะรายวิชาของห้องนี้ (วิชาที่ใช้ทั้งปีจะเปลี่ยนทั้งสองเทอม) ส่วนจำนวนและรูปแบบคาบเปลี่ยนเฉพาะห้องและภาคเรียนนี้'}</p></div>
      {error&&<div className="prep-error" role="alert">{error}<button type="button" disabled={busy} onClick={()=>void onReload().catch(()=>setError('โหลดข้อมูลล่าสุดไม่สำเร็จ'))}>โหลดข้อมูลล่าสุด</button></div>}
      </div><footer><span role="status">{busy?'กำลังบันทึกรายละเอียด…':'ตรวจรายละเอียดก่อนบันทึก'}</span><button type="button" disabled={busy} onClick={close}>ยกเลิก</button><button type="submit" className="prep-primary" disabled={busy}>{busy?'กำลังบันทึก…':'บันทึกรายวิชา'}</button></footer>
    </form>
  </dialog>
}
