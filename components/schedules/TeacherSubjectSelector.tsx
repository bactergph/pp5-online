'use client'
import { useId, useState } from 'react'
import Swal from 'sweetalert2'

type Offering = { id: string; subjectId: string; code: string; name: string; room: string; teacherId: string | null; count: number }

export default function TeacherSubjectSelector({teacherId, teacherName, lessons, onAssign}: {
  teacherId: string; teacherName: string; lessons: Offering[]; onAssign: (ids: string[]) => void
}) {
  const inputId = useId()
  const [query,setQuery] = useState('')
  const [selected,setSelected] = useState<string[]>([])
  const groups = new Map<string,{id:string;code:string;name:string;lessons:Offering[]}>()
  for (const l of lessons) {
    const group = groups.get(l.subjectId) || {id:l.subjectId,code:l.code,name:l.name,lessons:[]}
    group.lessons.push(l); groups.set(l.subjectId,group)
  }
  const term = query.trim().toLocaleLowerCase()
  const candidates = [...groups.values()].map(g=>({...g,pending:g.lessons.filter(l=>l.teacherId!==teacherId)}))
    .filter(g=>g.pending.length>0 && `${g.code} ${g.name}`.toLocaleLowerCase().includes(term))
  const chosen = candidates.filter(g=>selected.includes(g.id))
  const offerings = chosen.flatMap(g=>g.pending)
  async function assign() {
    if (!teacherId || !offerings.length || offerings.length>500) return
    const changed = offerings.filter(l=>l.teacherId)
    const answer = await Swal.fire({icon:changed.length?'warning':'question',title:`มอบหมาย ${chosen.length} รหัสวิชาให้ ${teacherName}?`,text:`รวม ${offerings.length} ห้อง–รายวิชา · ${offerings.reduce((n,l)=>n+l.count,0)} คาบ/สัปดาห์\n${chosen.map(g=>`${g.code} ${g.name}: ${g.pending.map(l=>l.room).join(', ')}`).join('\n')}\n${changed.length?`เปลี่ยนจากผู้สอนเดิม ${changed.length} ห้อง–รายวิชา\n`:''}ตรวจห้องที่ได้รับผลกระทบก่อนยืนยัน จากนั้นกดบันทึกครูและภาระสอนเพื่อใช้จริง`,showCancelButton:true,confirmButtonText:'มอบหมายให้ครูคนนี้',cancelButtonText:'ยกเลิก',confirmButtonColor:'#245bdb'})
    if (!answer.isConfirmed) return
    onAssign(offerings.map(l=>l.id)); setSelected([])
  }
  if (!teacherId) return <p className="prep-empty-result">เลือกครูก่อน แล้วค้นหารหัสวิชาที่รับผิดชอบได้เลย ไม่ต้องเลือกห้องเรียน</p>
  return <section className="prep-teacher-lessons" aria-label="มอบหมายครูตามรหัสวิชา">
    <h3>เลือกรหัสวิชาให้ {teacherName}</h3>
    <p>หนึ่งรหัสอาจอยู่หลายห้อง ระบบจะแสดงห้องทั้งหมดที่จะมอบหมาย วิชาของครูคนนี้จะไม่ถูกเพิ่มซ้ำ</p>
    <label className="prep-code-search" htmlFor={inputId}>ค้นหารหัสวิชา / ชื่อวิชา<input id={inputId} type="search" value={query} placeholder="เช่น ค21101 หรือ คณิตศาสตร์" onChange={e=>{setQuery(e.target.value);setSelected([])}}/></label>
    <div className="prep-checks"><button type="button" disabled={!candidates.length} onClick={()=>setSelected(candidates.map(g=>g.id))}>เลือกทุกรหัสที่แสดง</button><button type="button" onClick={()=>setSelected([])}>ล้างการเลือก</button><span>เลือก {chosen.length} รหัส · {offerings.length} ห้อง–รายวิชา · {offerings.reduce((n,l)=>n+l.count,0)} คาบ/สัปดาห์</span></div>
    {candidates.length?<div className="prep-assign-list">{candidates.map(g=><label key={g.id}><input type="checkbox" checked={selected.includes(g.id)} onChange={()=>setSelected(v=>v.includes(g.id)?v.filter(id=>id!==g.id):[...v,g.id])}/><span><strong>{g.code} · {g.name}</strong><small>มอบหมาย {g.pending.length} ห้อง: {g.pending.map(l=>l.room).join(', ')}</small><small>{g.pending.reduce((n,l)=>n+l.count,0)} คาบ/สัปดาห์{g.lessons.length>g.pending.length?` · เป็นของครูคนนี้แล้ว ${g.lessons.length-g.pending.length} ห้อง`:''}{g.pending.some(l=>l.teacherId)?' · มีผู้สอนเดิม ต้องยืนยันการเปลี่ยน':''}</small></span></label>)}</div>:<p role="status">ไม่พบรหัสวิชาที่ยังไม่ได้มอบหมายให้ครูคนนี้ ลองค้นหารหัสหรือชื่ออื่น</p>}
    {offerings.length>500&&<p role="alert" className="prep-error">เลือกได้ครั้งละไม่เกิน 500 ห้อง–รายวิชา กรุณาลดจำนวนรหัสที่เลือก</p>}
    <button type="button" className="prep-primary" disabled={!offerings.length||offerings.length>500} onClick={()=>void assign()}>มอบหมาย {chosen.length} รหัสวิชาให้ครูคนนี้</button>
  </section>
}
