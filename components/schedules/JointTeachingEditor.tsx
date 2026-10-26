'use client'
import {useRef,useState,type RefObject} from 'react'
import type {ScheduleLesson} from '@/lib/schedule-store'
import type {Preparation} from '@/lib/schedule-preparation'
import {validateJointTeachingGroups,type JointTeachingGroup} from '@/lib/schedule-joint-teaching'
import './joint-teaching.css'

export default function JointTeachingEditor({buttonRef,groups,lessons,teachers,classrooms,busy,onSave}:{buttonRef?:RefObject<HTMLButtonElement|null>;groups:JointTeachingGroup[];lessons:(ScheduleLesson&{pattern?:number[]})[];teachers:Preparation['teachers'];classrooms:Preparation['classrooms'];busy:boolean;onSave:(groups:JointTeachingGroup[])=>Promise<void>}){
  const dialog=useRef<HTMLDialogElement>(null)
  const [teacher,setTeacher]=useState(''),[selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const label=(id:string)=>{const room=classrooms.find(room=>room.id===id);return room?`${room.level}/${room.name||room.room}`:'ห้องที่ไม่พบ'}
  const used=new Set(groups.flatMap(group=>group.lessonIds))
  const available=lessons.filter(lesson=>!lesson.activity&&lesson.teacherId===teacher&&!used.has(lesson.id))
  const chosen=available.filter(lesson=>selected.includes(lesson.id))
  async function save(next:JointTeachingGroup[]){
    if(saving||busy)return
    setSaving(true);setError('')
    try{validateJointTeachingGroups(next,lessons);await onSave(next);setSelected([])}catch(error){setError(error instanceof Error?error.message:'บันทึกไม่สำเร็จ')}finally{setSaving(false)}
  }
  return <>
    <button ref={buttonRef} type="button" disabled={busy} onClick={()=>{setError('');dialog.current?.showModal()}}>สอนรวมหลายห้อง{groups.length?` · ${groups.length} กลุ่ม`:''}</button>
    <dialog ref={dialog} className="prep-joint-dialog" aria-labelledby="joint-teaching-title" onCancel={event=>{if(saving)event.preventDefault()}}>
      <header><div><h2 id="joint-teaching-title">สอนรวมหลายห้อง</h2><p>ครูคนเดียว สอนพร้อมกันหลายห้อง · นับภาระสอนครั้งเดียว</p></div><button type="button" disabled={saving} onClick={()=>dialog.current?.close()}>ปิด</button></header>
      <div className="prep-joint-body">
        <p className="prep-notice">เลือกวิชาของแต่ละห้องที่เรียนพร้อมกันได้ แม้รหัสวิชาต่างกัน ระบบจะจัดทุกคาบของกลุ่มให้ตรงกัน โดยแยกรายวิชาและคะแนนแต่ละห้องไว้ตามเดิม</p>
        {groups.length>0&&<section aria-label="กลุ่มที่บันทึกแล้ว"><h3>กลุ่มที่บันทึกแล้ว</h3><ul className="prep-joint-groups">{groups.map(group=>{const members=lessons.filter(lesson=>group.lessonIds.includes(lesson.id));return <li key={group.id}><div><b>{members[0]?.teacherName||teachers.find(t=>t.id===members[0]?.teacherId)?.full_name}</b><span>{members.map(lesson=>`${label(lesson.classroomId)} · ${lesson.code} ${lesson.name}`).join(' / ')}</span><small>{group.cells?group.cells.length:(members[0]?.count||0)} คาบ/สัปดาห์ · {members.length} ห้อง · นับครูครั้งเดียว{group.cells&&' · เฉพาะคาบที่ล็อก (แก้/นำออกในหน้าล็อกคาบ)'}</small></div>{!group.cells&&<button type="button" disabled={saving||busy} onClick={()=>void save(groups.filter(item=>item.id!==group.id))}>ยกเลิกสอนรวม</button>}</li>})}</ul></section>}
        <section><h3>เพิ่มกลุ่มสอนรวม</h3><label htmlFor="joint-teacher">ครูผู้สอน<select id="joint-teacher" value={teacher} disabled={saving} onChange={event=>{setTeacher(event.target.value);setSelected([]);setError('')}}><option value="">เลือกครู</option>{teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.prefix||''}{teacher.full_name}</option>)}</select></label>
          {teacher&&<><label htmlFor="joint-search">ค้นหาห้องหรือวิชา<input id="joint-search" value={query} disabled={saving} onChange={event=>setQuery(event.target.value)} placeholder="เช่น ป.4 หรือ การงาน"/></label>
          <div className="prep-joint-choices">{available.filter(lesson=>`${label(lesson.classroomId)} ${lesson.code} ${lesson.name}`.toLowerCase().includes(query.toLowerCase())).map(lesson=><label key={lesson.id}><input type="checkbox" checked={selected.includes(lesson.id)} disabled={saving} onChange={event=>setSelected(ids=>event.target.checked?[...ids,lesson.id]:ids.filter(id=>id!==lesson.id))}/><span><b>{label(lesson.classroomId)} · {lesson.code}</b><span>{lesson.name}</span><small>{lesson.count} คาบ/สัปดาห์ · {(lesson.pattern||Array(lesson.count).fill(1)).join('+')} · {lesson.roomName||'ไม่ระบุสถานที่'}</small></span></label>)}</div>
          {!available.length&&<p>ยังไม่มีวิชาของครูคนนี้ที่นำมารวมได้ กำหนดครูให้แต่ละห้องก่อน หรือยกเลิกกลุ่มเดิมเพื่อเลือกใหม่</p>}</>}
          <p>ต้องมีครู จำนวนคาบ รูปแบบคาบ สถานที่ และช่วงเวลาตรงกัน หากมีคาบเดิมคนละเวลา ให้ล้างคาบของห้องที่เกี่ยวข้องก่อนสร้างกลุ่ม</p>
        </section>
        {error&&<p className="prep-error" role="alert">{error}</p>}
      </div>
      <footer><span aria-live="polite">{saving?'กำลังบันทึก…':`เลือก ${chosen.length} ห้อง${chosen.length?` · ภาระครู ${chosen[0].count} คาบ/สัปดาห์`:''}`}</span><button type="button" className="prep-primary" disabled={saving||busy||chosen.length<2} onClick={()=>void save([...groups,{id:crypto.randomUUID(),lessonIds:chosen.map(lesson=>lesson.id)}])}>บันทึกกลุ่มสอนรวม</button></footer>
    </dialog>
  </>
}
