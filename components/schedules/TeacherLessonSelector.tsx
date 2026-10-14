'use client'
import { useState } from 'react'
import Swal from 'sweetalert2'

export default function TeacherLessonSelector({ teacherId, teacherName, lessons, onAssign }: {
  teacherId: string; teacherName: string
  lessons: { id: string; label: string; teacherId: string | null; teacherName: string; count: number }[]
  onAssign: (ids: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const candidates = lessons.filter(l=>l.teacherId!==teacherId)
  const chosen = candidates.filter(l=>selected.includes(l.id))
  async function assign() {
    if (!chosen.length || !teacherId) return
    const changed = chosen.filter(l=>l.teacherId)
    if (changed.length && !(await Swal.fire({icon:'warning',title:`เปลี่ยนครูผู้สอน ${changed.length} รายวิชา?`,text:`กำหนดให้ ${teacherName} แทนผู้สอนเดิม: ${changed.map(l=>l.label).join(', ')} การเปลี่ยนแปลงจะบันทึกเมื่อกดบันทึกครูและภาระสอน`,showCancelButton:true,confirmButtonText:'กำหนดให้ครูคนนี้',cancelButtonText:'ยกเลิก',confirmButtonColor:'#245bdb'})).isConfirmed) return
    onAssign(chosen.map(l=>l.id)); setSelected([])
  }
  if (!teacherId) return <p className="prep-empty-result">เลือกครูผู้สอนด้านบน แล้วเลือกห้องและรายวิชาที่ต้องการมอบหมาย</p>
  return <details className="prep-teacher-lessons" open>
    <summary>เลือกห้องและวิชาให้ {teacherName}</summary>
    <p>เลือกได้หลายวิชา รายวิชาที่กำหนดให้ครูคนนี้แล้วจะแสดงในตารางภาระสอนด้านล่าง</p>
    {candidates.length ? <>
      <div className="prep-checks"><button type="button" onClick={()=>setSelected(candidates.map(l=>l.id))}>เลือกทั้งหมดที่แสดง</button><button type="button" onClick={()=>setSelected([])}>ล้างการเลือก</button><span>เลือก {chosen.length} วิชา · {chosen.reduce((n,l)=>n+l.count,0)} คาบ/สัปดาห์</span></div>
      <div className="prep-assign-list">{candidates.map(l=><label key={l.id}><input type="checkbox" checked={selected.includes(l.id)} onChange={()=>setSelected(v=>v.includes(l.id)?v.filter(id=>id!==l.id):[...v,l.id])}/><span><strong>{l.label}</strong><small>{l.count} คาบ/สัปดาห์ · {l.teacherId?`ผู้สอนเดิม: ${l.teacherName || 'มีครูแล้ว'}`:'ยังไม่มีครูผู้สอน'}</small></span></label>)}</div>
      <button type="button" className="prep-primary" disabled={!chosen.length} onClick={()=>void assign()}>กำหนด {chosen.length} วิชาให้ครูคนนี้</button>
    </> : <p>ทุกวิชาในขอบเขตที่เลือกเป็นของครูคนนี้แล้ว หรือยังไม่มีรายวิชา ลองเปลี่ยนห้องเรียน</p>}
  </details>
}
