'use client'
import {useRef,useState} from 'react'
import Swal from 'sweetalert2'
import type {Preparation} from '@/lib/schedule-preparation'
import {useScheduleOperations} from './ScheduleServices'

/** The personnel link in the free importer must manage local IDs, never online staff accounts. */
export default function LocalScheduleTeachers({data,onSaved,onBusy}:{data:Preparation;onSaved:()=>Promise<void>;onBusy:(busy:boolean)=>void}) {
  const {localTeachers}=useScheduleOperations(),dialog=useRef<HTMLDialogElement>(null)
  const [selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [edit,setEdit]=useState<{id:string;prefix:string;name:string;position:string}|null>(null)
  const visible=data.teachers.filter(teacher=>`${teacher.prefix} ${teacher.full_name} ${teacher.position}`.toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th')))
  async function save(remove=false) {
    if(busy||!localTeachers)return
    if(remove&&!(await Swal.fire({icon:'warning',title:`ลบรายชื่อครู ${selected.length} คน?`,text:'ครูที่ยังมีภาระสอน กิจกรรม หรือสอนแทนจะลบไม่ได้',showCancelButton:true,confirmButtonText:'ลบรายชื่อ',cancelButtonText:'ยกเลิก',confirmButtonColor:'#be3340'})).isConfirmed)return
    setBusy(true);onBusy(true);setError('')
    try {
      const result=remove?await localTeachers.remove(selected):edit?await localTeachers.save(edit.id,edit.prefix,edit.name,edit.position):{error:'เลือกครูที่จะแก้ไข'}
      if(result.error)throw Error(result.error)
      setEdit(null);setSelected([]);await onSaved()
    }catch(error){setError(error instanceof Error?error.message:'บันทึกไม่สำเร็จ')}
    finally{setBusy(false);onBusy(false)}
  }
  if(!localTeachers)return null
  return <>
    <button type="button" onClick={()=>{setError('');setEdit(null);dialog.current?.showModal()}}>หน้าบุคลากร</button>
    <dialog ref={dialog} className="prep-team-dialog prep-teacher-dialog" aria-labelledby="local-personnel-title" onCancel={event=>{if(busy)event.preventDefault()}}>
      <header><div><h2 id="local-personnel-title">รายชื่อครูในเครื่อง</h2><p>{data.teachers.length} / {localTeachers.limit} คน · เพิ่มได้อีก {Math.max(0,localTeachers.limit-data.teachers.length)} คน · ใช้ร่วมกันทั้งสองภาคเรียน</p>{data.teachers.length>localTeachers.limit&&<p className="prep-error" role="alert">เกินสิทธิ์ {data.teachers.length-localTeachers.limit} คน</p>}</div><button type="button" disabled={busy} onClick={()=>dialog.current?.close()}>ปิด</button></header>
      <div className="prep-team-dialog-body"><fieldset disabled={busy} className="device-shared-content">
        <label className="field">ค้นหาครู<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <div className="prep-scroll"><table><thead><tr><th><input type="checkbox" aria-label="เลือกครูที่แสดงทั้งหมด" checked={visible.length>0&&visible.every(teacher=>selected.includes(teacher.id))} onChange={event=>setSelected(event.target.checked?[...new Set([...selected,...visible.map(teacher=>teacher.id)])]:selected.filter(id=>!visible.some(teacher=>teacher.id===id)))}/></th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>จัดการ</th></tr></thead><tbody>{visible.map(teacher=><tr key={teacher.id}><td><input type="checkbox" aria-label={`เลือก ${teacher.full_name}`} checked={selected.includes(teacher.id)} onChange={event=>setSelected(event.target.checked?[...selected,teacher.id]:selected.filter(id=>id!==teacher.id))}/></td><td>{teacher.prefix} {teacher.full_name}</td><td>{teacher.position||'ไม่ระบุตำแหน่ง'}</td><td><button type="button" onClick={()=>setEdit({id:teacher.id,prefix:teacher.prefix||'',name:teacher.full_name,position:teacher.position||''})}>แก้ไข</button></td></tr>)}</tbody></table></div>
        {edit&&<div className="local-form-grid"><label className="field">คำนำหน้า<input value={edit.prefix} onChange={event=>setEdit({...edit,prefix:event.target.value})}/></label><label className="field">ชื่อ-นามสกุล<input value={edit.name} onChange={event=>setEdit({...edit,name:event.target.value})}/></label><label className="field">ตำแหน่ง<input value={edit.position} onChange={event=>setEdit({...edit,position:event.target.value})}/></label><button type="button" className="prep-primary" onClick={()=>void save()}>บันทึกชื่อครู</button></div>}
      </fieldset>{error&&<p className="prep-error" role="alert">{error}</p>}</div>
      <footer><span>เลือก {selected.length} คน</span><button type="button" disabled={busy||!selected.length} onClick={()=>void save(true)}>ลบรายชื่อที่เลือก</button><button type="button" disabled={busy} onClick={()=>dialog.current?.close()}>ปิด</button></footer>
    </dialog>
  </>
}
