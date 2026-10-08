'use client'

import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import {useCallback, useEffect, useRef, useState} from 'react'
import {fetchTeacherAvailability, setTeacherAvailabilityBlock, editTeacherScheduleCell, toggleScheduleCellLock} from '@/app/schedules/actions'
import {type PeriodTimeRow} from '@/lib/schedule-helpers'
import ScheduleGridTable from './ScheduleGridTable'

type Availability = Awaited<ReturnType<typeof fetchTeacherAvailability>>
export default function TeacherAvailabilityPanel({yearId,semester,periodTimes,disabled,refreshToken,fixedTeacher,expanded,onChanged}: {yearId:string;semester:number;periodTimes:PeriodTimeRow[];disabled:boolean;refreshToken:string;fixedTeacher?:string;expanded?:boolean;onChanged?:()=>Promise<void>}) {
  const [data,setData] = useState<Availability|null>(null)
  const [teacher,setTeacher] = useState('')
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [editing,setEditing] = useState<{day:number;period:number}|null>(null)
  const [pending,setPending]=useState<string[]>([])
  const pendingRef=useRef(new Set<string>())
  useEffect(()=>{if(error||notice)void Swal.fire({icon:error?'error':'success',title:error?'ดำเนินการไม่สำเร็จ':notice,text:error||undefined,toast:!error,position:error?'center':'top-end',timer:error?undefined:2200,showConfirmButton:!!error,confirmButtonText:'ตกลง',confirmButtonColor:'#946b25'})},[error,notice])
  const request = useRef(0)
  const load = useCallback(async(keepSelection=false)=>{
    const id=++request.current
    if(!keepSelection){setData(null);setError('');setNotice('');setEditing(null)}
    try {const next=await fetchTeacherAvailability(yearId,semester);if(id!==request.current)return;setData(next);setTeacher(t=>fixedTeacher|| (next.teachers.some(x=>x.id===t)?t:next.teachers[0]?.id||''))}
    catch(e){if(id===request.current)setError(e instanceof Error?e.message:'โหลดไม่สำเร็จ')}
  },[yearId,semester,fixedTeacher])
  useEffect(()=>{let active=true;const counter=request;void Promise.resolve().then(()=>{if(active)void load(true)});return()=>{active=false;counter.current++}},[load,refreshToken])
  useEffect(()=>{
    if(saving||pending.length)return
    const refresh=()=>{if(document.visibilityState==='visible')void load(true)}
    const timer=window.setInterval(refresh,15000)
    window.addEventListener('focus',refresh)
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[load,saving,pending.length])
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
    const options=Object.fromEntries(data.lessons.filter(l=>l.teacherId===teacher&&(!busy||l.classroomId===busy.classroomId)&&!data.slots.some(slot=>slot.classroomId===l.classroomId&&slot.day===day&&slot.period===period&&(slot.lessonId!==busy?.lessonId||slot.locked))).map(l=>[l.id,l.label]))
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
    pendingRef.current.add(key);setPending([...pendingRef.current]);++request.current
    setSaving(true);setError('');setNotice('')
    try{
      const result=unlock?await toggleScheduleCellLock(room,yearId,day,period,semester):await editTeacherScheduleCell(yearId,semester,teacher,room,day,period,busy?.lessonId||null,remove?null:lessonId)
      if(result.error)throw new Error(result.error)
      await load(true);await onChanged?.()
      setNotice(unlock?'ปลดล็อกคาบเรียนแล้ว':remove?'นำวิชาออกแล้ว':'บันทึกวิชาแล้ว')
    }catch(e){await load(true);setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ')}
    finally{pendingRef.current.delete(key);setPending([...pendingRef.current]);setSaving(false)}
  }
  const content=<>
    <style>{`
      .availability-cell{display:flex;flex-direction:column;gap:7px;align-items:center;justify-content:center;width:100%;min-height:90px;padding:8px;border:1px dashed #c4ceca;border-radius:8px;background:#f4f9f6;color:#345341;font:inherit;cursor:pointer;}
      .availability-cell span{font-size:12px;line-height:1.5;}.availability-cell.is-busy{background:#edf1f5;border:1px solid #ced7e0;color:#354859;cursor:pointer!important;}.availability-cell.is-blocked{background:#f9ecd2;border:1px solid #c69742;color:#72501e;}
      .availability-cell.is-selected{outline:3px solid #946b25;outline-offset:-3px;box-shadow:0 0 0 2px #f5e8ce;}.availability-cell .selected-label{font-weight:700;color:#78501b;font-size:11px;}
      .availability-teacher select,.availability-editor select{min-height:44px;width:100%;border:1px solid #b6a58c!important;background:#faf7f1!important;color:#302a23!important;border-radius:6px;padding:10px 12px!important;}.availability-teacher option,.availability-editor option{background:white;color:#302a23;}
      .availability-editor{border:1px solid #c9beae;border-radius:12px;background:#fffdf8;padding:20px;display:grid;gap:12px;margin:16px 0;}.availability-editor h3{margin:0;}.availability-editor select{font:inherit;padding:12px;border:1px solid #bfb6a7;border-radius:8px;max-width:100%;}.availability-editor-actions{display:flex;gap:10px;flex-wrap:wrap;}.availability-editor button{font:inherit;padding:9px 14px;border:1px solid #bfb6a7;border-radius:8px;background:white;cursor:pointer;}.availability-editor button.danger{color:#a32929;}.availability-editor button:disabled{opacity:.5;cursor:not-allowed;}.availability-teacher{display:grid;gap:8px;max-width:360px;margin:16px 0;}.availability-teacher select{font:inherit;padding:10px;}.availability-error{color:#b02525;}
    `}</style>
    <div className="teacher-availability-body">
      <p>กดคาบเพื่อเลือกวิชา นำวิชาออก หรือล็อกคาบว่าง การแก้ไขจะปรับตารางเรียนของห้องให้ตรงกันด้วย</p>
      {!data?<p>กำลังโหลด...</p>:<>
        {!data.supported&&<p role="alert">ยังไม่เปิดใช้การล็อกคาบครู กรุณารันฐานข้อมูล 058_schedule_eight_periods_teacher_blocks.sql</p>}
        {!fixedTeacher&&<label className="availability-teacher">ครูผู้สอน<select value={teacher} disabled={disabled||saving} onChange={e=>{setTeacher(e.target.value);setNotice('');setEditing(null)}}>{data.teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
        <div className="schedule-grid-scroll"><ScheduleGridTable periodTimes={periodTimes} compactBreak renderCell={(day,period)=>{
          const busy=data.busy.find(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
          const blocked=data.blocks.some(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
          const selected=editing?.day===day&&editing?.period===period
          const loading=pending.includes(`${teacher}:${day}:${period}`)
          return <button type="button" className={`availability-cell ${blocked?'is-blocked':busy?'is-busy':''} ${selected?'is-selected':''}`} aria-pressed={selected} aria-busy={loading} aria-label={`วัน${['','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์'][day]} คาบ ${period} ${blocked?'ล็อกคาบว่าง':busy?'มีสอน':'ว่าง'}`} disabled={disabled||saving||loading||!teacher} onClick={()=>void chooseCell(day,period)}>{loading?<><span className="inline-block size-5 animate-spin rounded-full border-2 border-stone-300 border-t-amber-700" aria-hidden="true"/><strong>กำลังบันทึก...</strong></>:<>{selected&&<span className="selected-label">กำลังเลือก · คาบ {period}</span>}<strong>{blocked?'ล็อกคาบว่าง':busy?'มีสอน':'ว่าง'}</strong><span>{busy?busy.label:blocked?'กดเพื่อปลดล็อกหรือเลือกวิชา':'กดเพื่อเลือกวิชาหรือล็อก'}</span></>}</button>
        }}/></div>
      </>}
    </div>
  </>
  return fixedTeacher||expanded?<section className="teacher-availability-panel">{content}</section>:<details className="teacher-availability-panel"><summary>ตารางครูและล็อกคาบว่าง <span>นำวิชาออก เปลี่ยนวิชา หรือเว้นคาบสอน</span></summary>{content}</details>
}
