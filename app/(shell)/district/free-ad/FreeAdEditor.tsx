'use client'
import { useState } from 'react'
import { FiImage, FiSave } from 'react-icons/fi'
import { saveFreeScheduleAd } from './actions'
import { freeAdIsLive, safeHttpUrl, type FreeScheduleAd } from '@/lib/free-schedule-ad-window'
import { MembershipAd } from '@/components/layout/MembershipUI'
export default function FreeAdEditor({ initial, loadError }: { initial: FreeScheduleAd; loadError?: string }) {
  const [draft,setDraft]=useState({...initial,enabled:initial.enabled!==false}),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[message,setMessage]=useState(loadError||''),[error,setError]=useState(!!loadError)
  const busy=saving||uploading
  async function upload(file:File|undefined){if(!file||busy)return;setError(false);setMessage('');setUploading(true);try{const body=new FormData();body.set('file',file);const response=await fetch('/api/upload/membership-ad',{method:'POST',body});const result=await response.json();if(!response.ok||!result.url)throw Error(result.error||'อัปโหลดไม่สำเร็จ');setDraft(current=>({...current,imageUrl:result.url}));setMessage('อัปโหลดรูปแล้ว กดบันทึกโฆษณาเพื่อเริ่มใช้งาน')}catch(e){setError(true);setMessage(e instanceof Error?e.message:'อัปโหลดไม่สำเร็จ')}finally{setUploading(false)}}
  async function save(){if(busy)return;setSaving(true);setMessage('');try{const result=await saveFreeScheduleAd(draft);if(result.error)throw Error(result.error);setError(false);setMessage(draft.enabled?'บันทึกโฆษณาแล้ว จะแสดงเฉพาะสมาชิกฟรีตามช่วงที่กำหนด':'ปิดแสดงโฆษณาแล้ว')}catch(e){setError(true);setMessage(e instanceof Error?e.message:'บันทึกไม่สำเร็จ')}finally{setSaving(false)}}
  return <section className="data-card membership-admin"><header><h1>จัดการโฆษณาตารางฟรี</h1><p>แสดงใต้เมนูซ้ายบนคอมพิวเตอร์ และใต้พื้นที่ทำงานบนมือถือ เฉพาะสมาชิกฟรี</p></header><form className="membership-admin-form" onSubmit={event=>{event.preventDefault();void save()}}>
    <fieldset className="membership-admin-fields" disabled={busy} style={{border:0,padding:0,margin:0}}>
      <label className="membership-admin-check"><input type="checkbox" checked={draft.enabled} onChange={event=>setDraft({...draft,enabled:event.target.checked})}/>เปิดแสดงโฆษณา</label>
      <label>ชื่อโฆษณา<input className="form-input" value={draft.title} maxLength={120} onChange={event=>setDraft({...draft,title:event.target.value})} placeholder="เช่น สื่อและบริการสำหรับคุณครู"/></label>
      <label><span><FiImage aria-hidden="true"/> รูปโฆษณา · PNG, JPG, WebP ไม่เกิน 3 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{void upload(event.target.files?.[0]);event.target.value=''}}/></label>
      {draft.imageUrl&&<button className="btn" type="button" onClick={()=>setDraft({...draft,imageUrl:''})}>นำรูปออกจากโฆษณา</button>}
      <label>ลิงก์รูปภาพ (หรือใช้ปุ่มอัปโหลด)<input className="form-input" type="url" value={draft.imageUrl} onChange={event=>setDraft({...draft,imageUrl:event.target.value})} placeholder="https://..."/></label>
      <label>ลิงก์เมื่อกดโฆษณา<input className="form-input" type="url" value={draft.href} onChange={event=>setDraft({...draft,href:event.target.value})} placeholder="https://..."/></label>
      <div className="membership-admin-dates"><label>เริ่มแสดง (ไม่บังคับ)<input className="form-input" type="date" value={draft.start} onChange={event=>setDraft({...draft,start:event.target.value})}/></label><label>สิ้นสุด (ไม่บังคับ)<input className="form-input" type="date" min={draft.start||undefined} value={draft.end} onChange={event=>setDraft({...draft,end:event.target.value})}/></label></div>
      <button className="btn btn-primary" type="submit"><FiSave aria-hidden="true"/>{uploading?'กำลังอัปโหลด…':saving?'กำลังบันทึก…':'บันทึกโฆษณา'}</button>
      {message&&<p className={error?'membership-admin-error':'membership-admin-success'} role={error?'alert':'status'}>{message}</p>}
    </fieldset><aside className="membership-admin-preview"><h2>ตัวอย่างโฆษณา</h2><MembershipAd ad={{title:draft.title,href:safeHttpUrl(draft.href),imageUrl:safeHttpUrl(draft.imageUrl)}}/><p>{freeAdIsLive(draft)?'อยู่ในช่วงแสดงวันนี้':'ยังไม่แสดงวันนี้'}</p><p>แนะนำภาพแนวนอน 16:9 ลิงก์เปิดในแท็บใหม่</p></aside>
  </form></section>
}
