'use client'
import {useRef,useState,type RefObject} from 'react'
import type {ScheduleLesson} from '@/lib/schedule-store'
import type {Preparation} from '@/lib/schedule-preparation'
import {validateJointTeachingGroups,type JointTeachingGroup} from '@/lib/schedule-joint-teaching'
import {SCHEDULE_DAYS} from '@/lib/schedules'
import './joint-teaching.css'

export default function JointTeachingEditor({buttonRef,groups,lessons,teachers,classrooms,busy,onSave,onRemove}:{buttonRef?:RefObject<HTMLButtonElement|null>;groups:JointTeachingGroup[];lessons:(ScheduleLesson&{pattern?:number[]})[];teachers:Preparation['teachers'];classrooms:Preparation['classrooms'];busy:boolean;onSave:(groups:JointTeachingGroup[])=>Promise<void>;onRemove:(groupId:string)=>Promise<void>}){
  const dialog=useRef<HTMLDialogElement>(null)
  const [teacher,setTeacher]=useState(''),[selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const [cancelId,setCancelId]=useState('')
  const label=(id:string)=>{const room=classrooms.find(room=>room.id===id);return room?`${room.level}/${room.name||room.room}`:'ห้องที่ไม่พบ'}
  const used=new Set(groups.flatMap(group=>group.lessonIds))
  const available=lessons.filter(lesson=>!lesson.activity&&lesson.teacherId===teacher&&!used.has(lesson.id))
  const chosen=available.filter(lesson=>selected.includes(lesson.id))
  async function save(next:JointTeachingGroup[]){
    if(saving||busy)return
    setSaving(true);setError('')
    try{validateJointTeachingGroups(next,lessons);await onSave(next);setSelected([])}catch(error){setError(error instanceof Error?error.message:'บันทึกไม่สำเร็จ')}finally{setSaving(false)}
  }
  async function remove(id:string){
    if(saving||busy)return
    setSaving(true);setError('')
    try{await onRemove(id);setCancelId('');setSelected([])}catch(error){setError(error instanceof Error?error.message:'ยกเลิกไม่สำเร็จ')}finally{setSaving(false)}
  }
  return <>
    <button ref={buttonRef} type="button" disabled={busy} onClick={()=>{setError('');setCancelId('');dialog.current?.showModal()}}>สอนรวมหลายห้อง{groups.length?` · ${groups.length} กลุ่ม`:''}</button>
    <dialog ref={dialog} className="prep-joint-dialog" aria-labelledby="joint-teaching-title" onCancel={event=>{if(saving)event.preventDefault()}}>
      <header><div><h2 id="joint-teaching-title">สอนรวมหลายห้อง</h2><p>ครูคนเดียว สอนพร้อมกันหลายห้อง · นับภาระสอนครั้งเดียว</p></div><button type="button" disabled={saving} onClick={()=>dialog.current?.close()}>ปิด</button></header>
      <div className="prep-joint-body">
        <p className="prep-notice">ดูห้อง วิชา และคาบของแต่ละกลุ่มได้ด้านล่าง กดยกเลิกกลุ่มเพื่อกลับไปจัดแยกห้อง หรือแตะคาบในหน้าล็อกคาบเพื่อเอาออกเฉพาะคาบนั้น</p>
        {groups.length>0&&<section aria-label="กลุ่มที่บันทึกแล้ว"><h3>กลุ่มที่บันทึกแล้ว</h3><ul className="prep-joint-groups">{groups.map(group=>{const members=lessons.filter(lesson=>group.lessonIds.includes(lesson.id));return <li key={group.id} data-joint-group={group.id}><div><b>{members[0]?.teacherName||teachers.find(t=>t.id===members[0]?.teacherId)?.full_name}</b><div className="joint-group-members">{members.map(lesson=><span key={lesson.id}><b>{label(lesson.classroomId)}</b> · {lesson.code} {lesson.name}</span>)}</div><small>{group.cells?group.cells.length:(members[0]?.count||0)} คาบ/สัปดาห์ · {members.length} ห้อง · {group.cells?'ล็อกเฉพาะคาบ':'สอนรวมทั้งสัปดาห์'}</small>{group.cells&&<small>{group.cells.map(cell=>`${SCHEDULE_DAYS.find(day=>day.value===cell.day)?.short||cell.day} คาบ ${cell.period}`).join(' · ')}</small>}</div><button type="button" className="prep-joint-danger" disabled={saving||busy||!!cancelId} onClick={()=>{setCancelId(group.id);setError('')}}>ยกเลิกสอนรวม</button>{cancelId===group.id&&<div className="joint-cancel-confirm" role="alert"><b>ยกเลิกสอนรวม {members.length} ห้องนี้?</b><p>นำคาบสอนรวมและล็อกของกลุ่มนี้ออกพร้อมกันทุกห้อง วิชา ครู จำนวนคาบต่อสัปดาห์ และคาบอื่นยังอยู่ หลังยกเลิกสามารถจัดแยกห้องใหม่ได้</p><div className="joint-lock-actions"><button type="button" disabled={saving} onClick={()=>setCancelId('')}>กลับไปก่อน</button><button type="button" className="prep-joint-danger" disabled={saving||busy} onClick={()=>void remove(group.id)}>ยืนยันยกเลิกทั้งกลุ่ม</button></div></div>}</li>})}</ul></section>}
        <section><h3>เพิ่มกลุ่มสอนรวมทั้งสัปดาห์</h3><p>หากต้องการสอนรวมเฉพาะบางคาบ ให้เลือกจากหน้าล็อกคาบเรียนหรือล็อกคาบสอน</p><label htmlFor="joint-teacher">ครูผู้สอน<select id="joint-teacher" value={teacher} disabled={saving||!!cancelId} onChange={event=>{setTeacher(event.target.value);setSelected([]);setError('')}}><option value="">เลือกครู</option>{teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.prefix||''}{teacher.full_name}</option>)}</select></label>
          {teacher&&<><label htmlFor="joint-search">ค้นหาห้องหรือวิชา<input id="joint-search" value={query} disabled={saving} onChange={event=>setQuery(event.target.value)} placeholder="เช่น ป.4 หรือ การงาน"/></label>
          <div className="prep-joint-choices">{available.filter(lesson=>`${label(lesson.classroomId)} ${lesson.code} ${lesson.name}`.toLowerCase().includes(query.toLowerCase())).map(lesson=><label key={lesson.id}><input type="checkbox" checked={selected.includes(lesson.id)} disabled={saving} onChange={event=>setSelected(ids=>event.target.checked?[...ids,lesson.id]:ids.filter(id=>id!==lesson.id))}/><span><b>{label(lesson.classroomId)} · {lesson.code}</b><span>{lesson.name}</span><small>{lesson.count} คาบ/สัปดาห์ · {(lesson.pattern||Array(lesson.count).fill(1)).join('+')} · {lesson.roomName||'ไม่ระบุสถานที่'}</small></span></label>)}</div>
          {!available.length&&<p>ยังไม่มีวิชาของครูคนนี้ที่นำมารวมได้ กำหนดครูให้แต่ละห้องก่อน หรือยกเลิกกลุ่มเดิมเพื่อเลือกใหม่</p>}</>}
          <p>ต้องมีครู จำนวนคาบ รูปแบบคาบ สถานที่ และช่วงเวลาตรงกัน หากมีคาบเดิมคนละเวลา ให้ล้างคาบของห้องที่เกี่ยวข้องก่อนสร้างกลุ่ม</p>
        </section>
        {error&&<p className="prep-error" role="alert">{error}</p>}
      </div>
      <footer><span aria-live="polite">{saving?'กำลังบันทึก…':cancelId?'ตรวจห้องและคาบที่จะยกเลิกก่อนยืนยัน':`เลือก ${chosen.length} ห้อง${chosen.length?` · ภาระครู ${chosen[0].count} คาบ/สัปดาห์`:''}`}</span>{!cancelId&&<button type="button" className="prep-primary" disabled={saving||busy||!!cancelId||chosen.length<2} onClick={()=>void save([...groups,{id:crypto.randomUUID(),lessonIds:chosen.map(lesson=>lesson.id)}])}>บันทึกกลุ่มสอนรวม</button>}</footer>
    </dialog>
  </>
}
