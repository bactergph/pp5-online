'use client'
import {useEffect,useRef,useState} from 'react'
import {fetchPersonalHomeroomSettings,savePersonalHomeroomSettings} from '@/app/(shell)/classroom-admin/personal-actions'
import './personal-homeroom.css'
type Settings=NonNullable<Awaited<ReturnType<typeof fetchPersonalHomeroomSettings>>>
export default function PersonalHomeroomPanel(){
  const [data,setData]=useState<Settings|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const [year,setYear]=useState(''),[selected,setSelected]=useState<string[]>([])
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{let active=true;fetchPersonalHomeroomSettings().then(result=>{if(active&&result){setData(result);setYear(result.years.find(y=>y.is_active)?.id||result.years[0]?.id||'')}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'โหลดสิทธิ์ไม่สำเร็จ')});return()=>{active=false}},[])
  if(!data)return error?<p role="alert" className="personal-home-error">{error}</p>:null
  const current=data.selected.filter(row=>row.academic_year_id===year),over=current.length>data.limit
  function chooseYear(id:string){setYear(id);setSelected(data!.selected.filter(row=>row.academic_year_id===id).map(row=>row.classroom_id));setError('')}
  function open(){setSelected(current.map(row=>row.classroom_id));setError('');setMessage('');dialog.current?.showModal()}
  async function save(){
    if(busy||selected.length>data!.limit||!year)return
    setBusy(true);setError('')
    try{const result=await savePersonalHomeroomSettings(year,selected);if(result.error){setError(result.error);return}setData({...data!,selected:[...data!.selected.filter(row=>row.academic_year_id!==year),...selected.map(classroom_id=>({classroom_id,academic_year_id:year}))]});setMessage('บันทึกห้องประจำชั้นแล้ว');dialog.current?.close();window.dispatchEvent(new Event('personal-homeroom-changed'));window.location.reload()}
    catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ')}finally{setBusy(false)}
  }
  return <section className="personal-home-panel" aria-label="ห้องประจำชั้นของฉัน">
    <div><small>{data.label}</small><h2>ห้องประจำชั้นของฉัน · {current.length}/{data.limit} ห้อง</h2><p>งานธุรการ สุขภาพ ประเมิน และ ปพ.6 เฉพาะห้องที่เลือก แยกจากงานรายวิชาที่สอน</p>{over&&<p className="personal-home-error" role="alert">สิทธิ์ปัจจุบันเหลือ {data.limit} ห้อง กรุณาเลือกห้องใหม่</p>}{message&&<p role="status">{message}</p>}</div>
    <button type="button" onClick={open}>เลือกห้องประจำชั้น</button>
    <dialog ref={dialog} className="personal-home-dialog" onCancel={e=>{if(busy)e.preventDefault()}} aria-labelledby="personal-home-title">
      <header><div><h2 id="personal-home-title">เลือกห้องประจำชั้นของฉัน</h2><p>{data.label} · ได้ไม่เกิน {data.limit} ห้องต่อปีการศึกษา</p></div><button type="button" disabled={busy} onClick={()=>dialog.current?.close()} aria-label="ปิด">ปิด</button></header>
      <div className="personal-home-body"><label className="personal-home-year">ปีการศึกษา<select value={year} disabled={busy} onChange={e=>chooseYear(e.target.value)}>{data.years.map(y=><option key={y.id} value={y.id}>พ.ศ. {y.year_be}</option>)}</select></label>
      <div className="personal-home-rooms">{data.rooms.filter(room=>room.academic_year_id===year).map(room=><label key={room.id} className={selected.includes(room.id)?'is-selected':''}><input type="checkbox" checked={selected.includes(room.id)} disabled={busy||!selected.includes(room.id)&&selected.length>=data.limit} onChange={e=>setSelected(e.target.checked?[...selected,room.id]:selected.filter(id=>id!==room.id))}/><span>{room.level}/{room.room}</span></label>)}</div>
      {!data.rooms.some(room=>room.academic_year_id===year)&&<p>สร้างห้องเรียนในเมนูชั้นเรียนก่อนเลือกห้องประจำชั้น</p>}<p>ห้องที่เคยกรอกไว้ยังเก็บข้อมูลเดิม การเปลี่ยนห้องจะเปลี่ยนสิทธิ์ทำงานประจำชั้น</p>{error&&<p role="alert" className="personal-home-error">{error}</p>}</div>
      <footer><span>เลือก {selected.length}/{data.limit} ห้อง</span><button type="button" disabled={busy} onClick={()=>dialog.current?.close()}>ยกเลิก</button><button type="button" className="primary" disabled={busy||!year||selected.length>data.limit} onClick={()=>void save()}>{busy?'กำลังบันทึก…':'บันทึก'}</button></footer>
    </dialog>
  </section>
}
