'use client'
import { useEffect, useRef, useState } from 'react'
import type { Preparation } from '@/lib/schedule-preparation'
import { prepareTeacherDetails, type TeacherProfile } from '@/lib/schedule-teacher-details'
import { useScheduleOperations } from './ScheduleServices'

export default function ScheduleTeacherEditor({teacher,year,term,onClose,onSaved,onDirty,onBusy}:{teacher:Preparation['teachers'][number];year:string;term:number;onClose:()=>void;onSaved:()=>Promise<void>;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}) {
  const operations=useScheduleOperations(),dialog=useRef<HTMLDialogElement>(null),saving=useRef(false)
  const [expected]=useState<TeacherProfile>({prefix:teacher.prefix||'',name:teacher.full_name,position:teacher.position||''})
  const [form,setForm]=useState(expected),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{dialog.current?.showModal()},[])
  function close(){if(saving.current)return;dialog.current?.close();onDirty(false);onClose()}
  function change(field:keyof TeacherProfile,value:string){setForm(previous=>({...previous,[field]:value}));setError('');onDirty(true)}
  async function save(){
    if(saving.current)return
    const input={...form,expected}
    try{prepareTeacherDetails(expected,input)}catch(error){setError(error instanceof Error?error.message:'ตรวจชื่อครูอีกครั้ง');return}
    saving.current=true;setBusy(true);onBusy(true);setError('')
    try{
      const result=await operations.saveScheduleTeacherDetails(year,term,teacher.id,input)
      if(result.error)throw Error(result.error)
      await onSaved();onDirty(false);dialog.current?.close();onClose()
    }catch(error){setError(error instanceof Error?error.message:'บันทึกชื่อครูไม่สำเร็จ')}
    finally{saving.current=false;setBusy(false);onBusy(false)}
  }
  return <dialog ref={dialog} className="prep-team-dialog prep-teacher-edit-dialog" aria-labelledby="teacher-edit-title" onCancel={event=>{event.preventDefault();close()}}>
    <header><h2 id="teacher-edit-title">แก้ไขชื่อครู</h2><button type="button" disabled={busy} onClick={close}>ปิด</button></header>
    <form onSubmit={event=>{event.preventDefault();void save()}}>
      <div className="prep-team-dialog-body"><p className="prep-teacher-edit-note">แก้ไขข้อมูลครูท่านเดิม รายวิชา ภาระสอน และคาบที่กำหนดไว้ยังอยู่ครบ</p>
        <fieldset disabled={busy} className="prep-teacher-edit-fields">
          <label>คำนำหน้า<input name="prefix" maxLength={30} autoComplete="off" value={form.prefix} onChange={event=>change('prefix',event.target.value)}/></label>
          <label>ชื่อ-นามสกุล<input name="name" required maxLength={200} autoComplete="off" autoFocus value={form.name} onChange={event=>change('name',event.target.value)}/></label>
          <label>ตำแหน่ง<input name="position" maxLength={100} autoComplete="off" value={form.position} onChange={event=>change('position',event.target.value)}/></label>
        </fieldset>
        {error&&<p className="prep-error" role="alert">{error}</p>}
      </div>
      <footer><span role="status">{busy?'กำลังบันทึกชื่อครู…':'ใช้รหัสครูเดิม ไม่เพิ่มรายชื่อใหม่'}</span><button type="button" disabled={busy} onClick={close}>ยกเลิก</button><button type="submit" className="prep-primary" disabled={busy||!form.name.trim()}>{busy?'กำลังบันทึก…':'บันทึกชื่อครู'}</button></footer>
    </form>
  </dialog>
}
