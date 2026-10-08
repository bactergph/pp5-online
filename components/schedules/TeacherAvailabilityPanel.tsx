'use client'

import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import {useCallback, useEffect, useRef, useState} from 'react'
import {fetchTeacherAvailability, setTeacherAvailabilityBlock, editTeacherScheduleCell, toggleScheduleCellLock, clearTeacherSchedule} from '@/app/schedules/actions'
import {type PeriodTimeRow} from '@/lib/schedule-helpers'
import ScheduleGridTable from './ScheduleGridTable'

type Availability = Awaited<ReturnType<typeof fetchTeacherAvailability>>
export default function TeacherAvailabilityPanel({yearId,semester,periodTimes,disabled,refreshToken,fixedTeacher,expanded,onChanged}: {yearId:string;semester:number;periodTimes:PeriodTimeRow[];disabled:boolean;refreshToken:string;fixedTeacher?:string;expanded?:boolean;onChanged?:()=>Promise<void>}) {
  const [data,setData] = useState<Availability|null>(null)
  const [teacher,setTeacher] = useState('')
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [editing,setEditing] = useState<{day:number;period:number}|null>(null)
  const [pending,setPending]=useState<string[]>([])
  const pendingRef=useRef(new Set<string>())
  const reservedLessons=useRef(new Map<string,string>())
  const editQueue=useRef(Promise.resolve())
  const [clearing,setClearing]=useState(false)
  async function clearSelectedTeacher(){
    if(!teacher||clearing||pendingRef.current.size)return
    const name=data?.teachers.find(t=>t.id===teacher)?.name||'ครูที่เลือก'
    const decision=await Swal.fire({icon:'warning',title:'ล้างตารางสอนครูที่เลือก?',text:`${name} · ภาคเรียนที่ ${semester} นำเฉพาะคาบสอนที่ไม่ล็อกออกจากตารางห้องเรียนด้วย คาบที่ล็อกและล็อกคาบว่างจะเก็บไว้`,showCancelButton:true,confirmButtonText:'ล้างตารางสอนครูคนนี้',cancelButtonText:'ยกเลิก',confirmButtonColor:'#be3340'})
    if(!decision.isConfirmed)return
    setClearing(true);setError('');setNotice('')
    try{
      const result=await clearTeacherSchedule(yearId,semester,teacher)
      if(result.error)throw new Error(result.error)
      await load(true);await onChanged?.();setEditing(null)
      setNotice(`ล้างตารางสอน ${name} แล้ว ${result.data?.removed||0} คาบ`)
    }catch(e){await load(true);setError(e instanceof Error?e.message:'ล้างไม่สำเร็จ')}
    finally{setClearing(false)}
  }
  useEffect(()=>{if(Swal.isVisible())return;if(error||notice)void Swal.fire({icon:error?'error':'success',title:error?'ดำเนินการไม่สำเร็จ':notice,text:error||undefined,toast:!error,position:error?'center':'top-end',timer:error?undefined:2200,showConfirmButton:!!error,confirmButtonText:'ตกลง',confirmButtonColor:'#946b25'})},[error,notice])
  const request = useRef(0)
  const load = useCallback(async(keepSelection=false)=>{
    const id=++request.current
    if(!keepSelection){setData(null);setError('');setNotice('');setEditing(null)}
    try {const next=await fetchTeacherAvailability(yearId,semester);if(id!==request.current)return;setData(next);setTeacher(t=>fixedTeacher|| (next.teachers.some(x=>x.id===t)?t:next.teachers[0]?.id||''))}
    catch(e){if(id===request.current)setError(e instanceof Error?e.message:'โหลดไม่สำเร็จ')}
  },[yearId,semester,fixedTeacher])
  useEffect(()=>{let active=true;const counter=request;void Promise.resolve().then(()=>{if(active)void load(true)});return()=>{active=false;counter.current++}},[load,refreshToken])
  useEffect(()=>{
    if(pending.length||clearing)return
    const refresh=()=>{if(document.visibilityState==='visible')void load(true)}
    const timer=window.setInterval(refresh,15000)
    window.addEventListener('focus',refresh)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[load,pending.length,clearing])
  async function toggle(day:number,period:number,blocked:boolean){
    const targetTeacher=teacher
    const key=`${targetTeacher}:${day}:${period}`
    if(pendingRef.current.has(key))return
    pendingRef.current.add(key);setPending([...pendingRef.current])
    ++request.current
    setError('');setNotice('')
    try {
      const result=await setTeacherAvailabilityBlock(yearId,semester,targetTeacher,day,period,!blocked)
      if(result.error)throw new Error(result.error)
      setData(current=>current?{...current,blocks:!blocked?[...current.blocks.filter(b=>!(b.teacherId===targetTeacher&&b.day===day&&b.period===period)),{teacherId:targetTeacher,day,period}]:current.blocks.filter(b=>!(b.teacherId===targetTeacher&&b.day===day&&b.period===period))}:current)
      setNotice(!blocked?'ล็อกคาบว่างแล้ว ระบบจะไม่ลงวิชาให้ครูในคาบนี้':'ปลดล็อกคาบว่างแล้ว')
    }catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ')}
    finally{pendingRef.current.delete(key);setPending([...pendingRef.current]);if(!pendingRef.current.size)await load(true)}
  }
  async function chooseCell(day:number,period:number) {
    if(!data)return
    const busy=data.busy.find(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
    setEditing({day,period});setError('');setNotice('')
    const title=`${['','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์'][day]} · คาบ ${period}`
    if(busy?.locked){
      const decision=await Swal.fire({icon:'question',title,text:'คาบเรียนนี้ล็อกอยู่ ต้องการปลดล็อกก่อนแก้ไขไหม?',showCancelButton:true,confirmButtonText:'ปลดล็อกคาบเรียน',cancelButtonText:'ยกเลิก',confirmButtonColor:'#946b25'})
      if(decision.isConfirmed)await editCell(day,period,'',false,true)
      return
    }
    if(!busy){
      const blocked=data.blocks.some(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
      const decision=await Swal.fire({icon:'question',title,text:blocked?'ต้องการปลดล็อกคาบว่างนี้ไหม?':'ต้องการล็อกคาบว่างนี้ไหม?',showCancelButton:true,showDenyButton:!blocked,confirmButtonText:blocked?'ปลดล็อกคาบว่าง':'ล็อกคาบว่าง',denyButtonText:'เลือกวิชา',cancelButtonText:'ยกเลิก',confirmButtonColor:'#946b25',denyButtonColor:'#64748b'})
      if(decision.isConfirmed&&data.supported){void toggle(day,period,blocked);return}
      if(!decision.isDenied)return
    }
    const options=Object.fromEntries(data.lessons.filter(l=>{
      const quota=data.quotas.find(q=>q.id===l.id)
      const used=data.slots.filter(slot=>slot.classroomId===l.classroomId&&slot.lessonId===l.id).length+[...reservedLessons.current.values()].filter(id=>id===l.id).length
      return l.teacherId===teacher&&(!busy||l.classroomId===busy.classroomId)&&(l.id===busy?.lessonId||!quota||used<quota.target)&&!data.slots.some(slot=>slot.classroomId===l.classroomId&&slot.day===day&&slot.period===period&&(slot.lessonId!==busy?.lessonId||slot.locked))
    }).map(l=>{const quota=data.quotas.find(q=>q.id===l.id);return [l.id,`${l.label}${quota?` · เหลือ ${Math.max(0,quota.target-quota.used)} คาบ`:''}`]}))
    const decision=await Swal.fire({title,text:busy?'เปลี่ยนวิชาหรือนำวิชาออกจากคาบนี้':'เลือกรายวิชาและห้องเรียนเพื่อบันทึกลงคาบนี้',input:'select',inputOptions:options,inputValue:busy?.lessonId||'',inputPlaceholder:'เลือกวิชาและห้องเรียน',inputValidator:value=>!value?'กรุณาเลือกวิชา':undefined,showCancelButton:true,showDenyButton:!!busy,confirmButtonText:'บันทึกวิชา',denyButtonText:'เอาวิชาออก',cancelButtonText:'ยกเลิก',confirmButtonColor:'#946b25',denyButtonColor:'#be3340'})
    if(decision.isConfirmed)await editCell(day,period,String(decision.value),false,false)
    else if(decision.isDenied)await editCell(day,period,'',true,false)
  }
  async function editCell(day:number,period:number,lessonId:string,remove:boolean,unlock:boolean){
    if(!data)return
    const busy=data.busy.find(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
    const next=data.lessons.find(l=>l.id===lessonId)
    const room=busy?.classroomId||next?.classroomId
    if(!room)return
    const key=`${teacher}:${day}:${period}`
    if(pendingRef.current.has(key))return
    if(!remove&&!unlock&&lessonId!==busy?.lessonId)reservedLessons.current.set(key,lessonId)
    pendingRef.current.add(key);setPending([...pendingRef.current]);++request.current
    const previous=editQueue.current
    let release:()=>void=()=>{}
    editQueue.current=new Promise<void>(resolve=>{release=resolve})
    setError('');setNotice('')
    await previous
    try{
      const result=unlock?await toggleScheduleCellLock(room,yearId,day,period,semester):await editTeacherScheduleCell(yearId,semester,teacher,room,day,period,busy?.lessonId||null,remove?null:lessonId)
      if(result.error)throw new Error(result.error)
      await load(true);await onChanged?.()
      setNotice(unlock?'ปลดล็อกคาบเรียนแล้ว':remove?'นำวิชาออกแล้ว':'บันทึกวิชาแล้ว')
    }catch(e){await load(true);setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ')}
    finally{reservedLessons.current.delete(key);pendingRef.current.delete(key);setPending([...pendingRef.current]);release()}
  }
  const teacherQuotas=data?.quotas.filter(q=>q.teacherId===teacher)||[]
  const target=teacherQuotas.reduce((n,q)=>n+q.target,0)
  const progress=target?Math.min(100,100*teacherQuotas.reduce((n,q)=>n+Math.min(q.target,q.used),0)/target):0
  const content=<>
    <style>{`
      .availability-cell{display:flex;flex-direction:column;gap:7px;align-items:center;justify-content:center;width:100%;min-height:90px;padding:8px;border:1px dashed #c4ceca;border-radius:8px;background:#f4f9f6;color:#345341;font:inherit;cursor:pointer;}
      .availability-cell span{font-size:12px;line-height:1.5;}.availability-cell.is-busy{background:#edf1f5;border:1px solid #ced7e0;color:#354859;cursor:pointer!important;}.availability-cell.is-blocked{background:#f9ecd2;border:1px solid #c69742;color:#72501e;}
      .availability-cell.is-selected{outline:3px solid #946b25;outline-offset:-3px;box-shadow:0 0 0 2px #f5e8ce;}.availability-cell .selected-label{font-weight:700;color:#78501b;font-size:11px;}
      .availability-teacher select,.availability-editor select{min-height:44px;width:100%;border:1px solid #b6a58c!important;background:#faf7f1!important;color:#302a23!important;border-radius:6px;padding:10px 12px!important;}.availability-teacher option,.availability-editor option{background:white;color:#302a23;}
      .availability-editor{border:1px solid #c9beae;border-radius:12px;background:#fffdf8;padding:20px;display:grid;gap:12px;margin:16px 0;}.availability-editor h3{margin:0;}.availability-editor select{font:inherit;padding:12px;border:1px solid #bfb6a7;border-radius:8px;max-width:100%;}.availability-editor-actions{display:flex;gap:10px;flex-wrap:wrap;}.availability-editor button{font:inherit;padding:9px 14px;border:1px solid #bfb6a7;border-radius:8px;background:white;cursor:pointer;}.availability-editor button.danger{color:#a32929;}.availability-editor button:disabled{opacity:.5;cursor:not-allowed;}.availability-teacher{display:grid;gap:8px;max-width:360px;margin:16px 0;}.availability-teacher select{font:inherit;padding:10px;}.availability-error{color:#b02525;}
    `}</style>
    <div className="teacher-availability-body">
      {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
      {notice&&<p role="status" className="text-sm text-emerald-700">{notice}</p>}
      <p>กดคาบเพื่อเลือกวิชา นำวิชาออก หรือล็อกคาบว่าง การแก้ไขจะปรับตารางเรียนของห้องให้ตรงกันด้วย</p>
      {!data?<p>กำลังโหลด...</p>:<>
        {!data.supported&&<p role="alert">ยังไม่เปิดใช้การล็อกคาบครู กรุณารันฐานข้อมูล 058_schedule_eight_periods_teacher_blocks.sql</p>}
        <div className="flex flex-wrap items-end gap-3">
        {!fixedTeacher&&<label className="availability-teacher">ครูผู้สอน<select value={teacher} disabled={disabled||clearing} onChange={e=>{setTeacher(e.target.value);setNotice('');setEditing(null)}}>{data.teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
        <button type="button" className="my-4 min-h-11 rounded-md border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50" disabled={disabled||clearing||pending.length>0||!teacher} onClick={()=>void clearSelectedTeacher()}>{clearing?'กำลังล้าง...':'ล้างตารางสอนครูที่เลือก'}</button>
        <details key={teacher} className="relative my-4 w-full shrink-0 rounded-lg border border-stone-200 bg-stone-50 p-3 sm:ml-auto sm:w-64">
          <summary className="cursor-pointer list-none" aria-label="ดูความคืบหน้าคาบครู">
            <div className="flex items-center justify-between gap-2 text-xs"><strong>ความคืบหน้าคาบต่อสัปดาห์</strong><span className="text-stone-500">รายละเอียด ▾</span></div>
            <div className="mt-2 flex justify-between text-xs text-stone-600"><span>เป้า <b>{teacherQuotas.reduce((n,q)=>n+q.target,0)}</b></span><span>ใช้ <b>{teacherQuotas.reduce((n,q)=>n+q.used,0)}</b></span><span>เหลือ <b>{teacherQuotas.reduce((n,q)=>n+Math.max(0,q.target-q.used),0)}</b></span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-emerald-600" style={{width:`${progress}%`}} /></div>
          </summary>
          <div className="absolute right-0 top-full z-20 mt-2 max-h-80 w-[min(360px,calc(100vw-48px))] overflow-auto rounded-lg border border-stone-200 bg-white p-4 shadow-xl">
          <h3 className="text-sm font-semibold">คาบต่อสัปดาห์ · ครูที่เลือก</h3>
          <p className="my-2 text-xs text-stone-500">แยกตามวิชาและห้องเรียน</p>
          <table className="w-full text-xs"><thead><tr className="border-b border-stone-300 bg-stone-100 text-black"><th className="p-2 text-left">วิชา / ห้อง</th><th className="p-2">เป้า</th><th className="p-2">ใช้</th></tr></thead><tbody>
            {data.quotas.filter(q=>q.teacherId===teacher).map(q=><tr key={q.id} className="border-b border-stone-200"><td className="py-3 pr-2"><strong className="font-medium">{q.label}</strong><span className="mt-1 block text-stone-500">{q.activity?'กิจกรรม':'รายวิชา'} · {q.used>q.target?`เกิน ${q.used-q.target} คาบ`:q.used===q.target?'ครบแล้ว':`เหลือ ${q.target-q.used} คาบ`}</span><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className={q.used>q.target?'h-full bg-rose-500':'h-full bg-emerald-500'} style={{width:`${Math.min(100,q.target?100*q.used/q.target:0)}%`}} /></div></td><td className="text-center">{q.target}</td><td className="text-center">{q.used}</td></tr>)}
          </tbody></table>
          {!data.quotas.some(q=>q.teacherId===teacher)&&<p className="py-3 text-xs text-stone-500">ยังไม่มีรายวิชาของครูที่เลือก</p>}
          <p className="mt-3 text-xs leading-5 text-stone-500">กิจกรรมที่ไม่กำหนดครูไม่รวมในภาระงานรายครู</p>
          </div>
        </details>
        </div>

        <div className="schedule-grid-scroll overflow-x-auto"><ScheduleGridTable periodTimes={periodTimes} compactBreak renderCell={(day,period)=>{
          const busy=data.busy.find(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
          const blocked=data.blocks.some(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
          const selected=editing?.day===day&&editing?.period===period
          const loading=pending.includes(`${teacher}:${day}:${period}`)
          return <button type="button" className={`availability-cell ${blocked?'is-blocked':busy?'is-busy':''} ${selected?'is-selected':''}`} aria-pressed={selected} aria-busy={loading} aria-label={`วัน${['','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์'][day]} คาบ ${period} ${blocked?'ล็อกคาบว่าง':busy?'มีสอน':'ว่าง'}`} disabled={disabled||clearing||loading||!teacher} onClick={()=>void chooseCell(day,period)}>{loading?<><span className="inline-block size-5 animate-spin rounded-full border-2 border-stone-300 border-t-amber-700" aria-hidden="true"/><strong>กำลังบันทึก...</strong></>:<>{selected&&<span className="selected-label">กำลังเลือก · คาบ {period}</span>}<strong>{blocked?'ล็อกคาบว่าง':busy?'มีสอน':'ว่าง'}</strong><span>{busy?busy.label:blocked?'กดเพื่อปลดล็อกหรือเลือกวิชา':'กดเพื่อเลือกวิชาหรือล็อก'}</span></>}</button>
        }}/></div>
      </>}
    </div>
  </>
  return fixedTeacher||expanded?<section className="teacher-availability-panel">{content}</section>:<details className="teacher-availability-panel"><summary>ตารางครูและล็อกคาบว่าง <span>นำวิชาออก เปลี่ยนวิชา หรือเว้นคาบสอน</span></summary>{content}</details>
}
