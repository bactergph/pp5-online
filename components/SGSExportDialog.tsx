'use client'
import { useEffect, useRef, useState } from 'react'
import { parsePacket, type ScorePacket } from '@/extensions/jarnsek-sgs/core'
import './sgs-export.css'

export default function SGSExportDialog({packet,unsaved,onClose}:{packet:ScorePacket;unsaved:boolean;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [selected,setSelected]=useState(()=>packet.columns.map((_,index)=>index))
  const [message,setMessage]=useState('')
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close()},[])
  function data(){
    if(!selected.length)throw Error('เลือกช่องคะแนนอย่างน้อย 1 ช่อง')
    return JSON.stringify(parsePacket({...packet,columns:packet.columns.filter((_,index)=>selected.includes(index)),students:packet.students.map(student=>({...student,values:student.values.filter((_,index)=>selected.includes(index))}))}),null,2)
  }
  async function copy(){try{await navigator.clipboard.writeText(data());setMessage('คัดลอกแล้ว เปิด SGS กดส่วนขยายจารย์เสก แล้ววางข้อมูลในตัวช่วย')}catch(error){setMessage(error instanceof Error&&error.message==='เลือกช่องคะแนนอย่างน้อย 1 ช่อง'?error.message:'คัดลอกไม่ได้ กรุณาใช้ปุ่มดาวน์โหลดไฟล์คะแนนแทน')}}
  function download(){
    try{
      const blob=new Blob([data()],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a')
      link.href=url;link.download=`jarnsek-sgs_${packet.context.subjectCode}_${packet.context.classroom}_${packet.context.yearBe}_${packet.context.term}.json`.replace(/[\\/:*?"<>|]/g,'_')
      link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('ดาวน์โหลดแล้ว เปิด SGS กดส่วนขยายจารย์เสก แล้วเลือกไฟล์คะแนนนี้')
    }catch(error){setMessage(error instanceof Error?error.message:'เตรียมไฟล์ไม่สำเร็จ')}
  }
  return <dialog ref={dialog} className="sgs-export-dialog" aria-labelledby="sgs-export-title" onCancel={onClose}>
    <header><div><span className="sgs-export-badge">จารย์เสก → SGS</span><h2 id="sgs-export-title">เตรียมคะแนนส่งเข้า SGS</h2><p>{packet.context.subjectCode} {packet.context.subjectName} · {packet.context.classroom}</p></div><button className="btn btn-secondary" onClick={onClose}>ปิด</button></header>
    <div className="sgs-export-body">
      <div className="sgs-export-meta"><span>ปี {packet.context.yearBe} · ภาคเรียน {packet.context.term}</span><strong>นักเรียน {packet.students.length} คน</strong></div>
      <h3>เลือกช่องคะแนนที่จะส่ง</h3><p>ใช้เลขประจำตัวนักเรียนจับคู่กับ SGS ช่องว่างจะคงคะแนนเดิมไว้</p>
      <div className="sgs-export-columns">{packet.columns.map((column,index)=><label key={column.key}><input type="checkbox" checked={selected.includes(index)} onChange={event=>setSelected(current=>event.target.checked?[...current,index]:current.filter(value=>value!==index))}/><span>{column.label}<small>เต็ม {column.max} คะแนน</small></span></label>)}</div>
      {unsaved&&<p className="sgs-export-warning">ไฟล์นี้รวมคะแนนที่คุณแก้ไขในหน้าปัจจุบันและยังไม่ได้บันทึกในจารย์เสก</p>}
      <div className="sgs-export-instructions"><strong>นำคะแนนไป SGS อย่างไร</strong><ol><li>ดาวน์โหลดหรือคัดลอกคะแนนที่เลือก</li><li>เปิดห้องและรายวิชาใน SGS ให้ตรง แล้วกดส่วนขยาย “จารย์เสก → SGS”</li><li>เลือกไฟล์หรือวางข้อมูล จับคู่ช่องคะแนน ตรวจแล้วเติมทั้งชุด</li><li>กดบันทึกใน SGS แล้วโหลดหน้าใหม่เพื่อตรวจคะแนน</li></ol><details><summary>ติดตั้งส่วนขยายครั้งแรก</summary><p><a href="/downloads/jarnsek-sgs-extension.zip" download>ดาวน์โหลดส่วนขยายจารย์เสก → SGS</a> แล้วแตก ZIP เปิด <code>chrome://extensions</code> เปิดโหมดนักพัฒนา กด “โหลดส่วนขยายที่แตกไฟล์แล้ว” และเลือกโฟลเดอร์ที่มี manifest.json</p><p>ใช้กับ Chrome บนคอมพิวเตอร์ รุ่นนี้ติดตั้งด้วยไฟล์ ZIP และยังไม่เผยแพร่บน Chrome Web Store</p></details></div>
      {message&&<p className="sgs-export-message" role="status">{message}</p>}
    </div>
    <footer><button className="btn btn-secondary" disabled={!selected.length} onClick={()=>void copy()}>คัดลอกคะแนน</button><button className="btn btn-primary" disabled={!selected.length} onClick={download}>ดาวน์โหลดไฟล์คะแนน SGS</button></footer>
  </dialog>
}
