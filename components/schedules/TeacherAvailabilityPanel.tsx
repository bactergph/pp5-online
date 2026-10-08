'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import {fetchTeacherAvailability, setTeacherAvailabilityBlock, editTeacherScheduleCell, toggleScheduleCellLock} from '@/app/schedules/actions'
import {type PeriodTimeRow} from '@/lib/schedule-helpers'
import ScheduleGridTable from './ScheduleGridTable'

type Availability = Awaited<ReturnType<typeof fetchTeacherAvailability>>
export default function TeacherAvailabilityPanel({yearId,semester,periodTimes,disabled,refreshToken,fixedTeacher}: {yearId:string;semester:number;periodTimes:PeriodTimeRow[];disabled:boolean;refreshToken:string;fixedTeacher?:string}) {
  const [data,setData] = useState<Availability|null>(null)
  const [teacher,setTeacher] = useState('')
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [editing,setEditing] = useState<{day:number;period:number}|null>(null)
  const [chosen,setChosen] = useState('')
  const request = useRef(0)
  const load = useCallback(async()=>{
    const id=++request.current
    setData(null);setError('');setNotice('');setEditing(null)
    try {const next=await fetchTeacherAvailability(yearId,semester);if(id!==request.current)return;setData(next);setTeacher(t=>fixedTeacher|| (next.teachers.some(x=>x.id===t)?t:next.teachers[0]?.id||''))}
    catch(e){if(id===request.current)setError(e instanceof Error?e.message:'โหลดไม่สำเร็จ')}
  },[yearId,semester,fixedTeacher])
  useEffect(()=>{let active=true;const counter=request;void Promise.resolve().then(()=>{if(active)void load()});return()=>{active=false;counter.current++}},[load,refreshToken])
  async function toggle(day:number,period:number,blocked:boolean){
    const id=request.current
    setSaving(true);setError('');setNotice('')
    try {
      const result=await setTeacherAvailabilityBlock(yearId,semester,teacher,day,period,!blocked)
      if('error' in result)throw new Error(String(result.error))
      if(id!==request.current)return
      setData(current=>current?{...current,blocks:!blocked?[...current.blocks,{teacherId:teacher,day,period}]:current.blocks.filter(b=>!(b.teacherId===teacher&&b.day===day&&b.period===period))}:current)
      setNotice(!blocked?'ล็อกคาบว่างแล้ว ระบบจะไม่ลงวิชาให้ครูในคาบนี้':'ปลดล็อกคาบว่างแล้ว')
    }catch(e){if(id===request.current)setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ')}
    finally{setSaving(false)}
  }
  const busyCell=editing&&data?.busy.find(b=>b.teacherId===teacher&&b.day===editing.day&&b.period===editing.period)
  async function edit(remove=false,unlock=false){
    if(!editing||!data)return
    setSaving(true);setError('')
    try{
      const next=data.lessons.find(l=>l.id===chosen)
      const room=busyCell?.classroomId||next?.classroomId
      if(!room)throw new Error('กรุณาเลือกวิชาและห้องเรียน')
      const result=unlock?await toggleScheduleCellLock(room,yearId,editing.day,editing.period,semester):await editTeacherScheduleCell(yearId,semester,teacher,room,editing.day,editing.period,busyCell?.lessonId||null,remove?null:chosen)
      if('error' in result)throw new Error(String(result.error))
      await load()
      setNotice(unlock?'ปลดล็อกคาบเรียนแล้ว':remove?'นำวิชาออกแล้ว สามารถล็อกคาบว่างหรือเลือกวิชาใหม่ได้':'บันทึกวิชาแล้ว ตารางเรียนของห้องปรับตรงกันแล้ว')
    }catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ')}
    finally{setSaving(false)}
  }
  const content=<>
    <style>{`
      .availability-cell{display:flex;flex-direction:column;gap:7px;align-items:center;justify-content:center;width:100%;min-height:90px;padding:8px;border:1px dashed #c4ceca;border-radius:8px;background:#f4f9f6;color:#345341;font:inherit;cursor:pointer;}
      .availability-cell span{font-size:12px;line-height:1.5;}.availability-cell.is-busy{background:#edf1f5;border:1px solid #ced7e0;color:#354859;cursor:pointer!important;}.availability-cell.is-blocked{background:#f9ecd2;border:1px solid #c69742;color:#72501e;}
      .availability-editor{border:1px solid #c9beae;border-radius:12px;background:#fffdf8;padding:20px;display:grid;gap:12px;margin:16px 0;}.availability-editor h3{margin:0;}.availability-editor select{font:inherit;padding:12px;border:1px solid #bfb6a7;border-radius:8px;max-width:100%;}.availability-editor-actions{display:flex;gap:10px;flex-wrap:wrap;}.availability-editor button{font:inherit;padding:9px 14px;border:1px solid #bfb6a7;border-radius:8px;background:white;cursor:pointer;}.availability-editor button.danger{color:#a32929;}.availability-editor button:disabled{opacity:.5;cursor:not-allowed;}.availability-teacher{display:grid;gap:8px;max-width:360px;margin:16px 0;}.availability-teacher select{font:inherit;padding:10px;}.availability-error{color:#b02525;}
    `}</style>
    <div className="teacher-availability-body">
      <p>กดคาบเพื่อเลือกวิชา นำวิชาออก หรือล็อกคาบว่าง การแก้ไขจะปรับตารางเรียนของห้องให้ตรงกันด้วย</p>
      {error&&<p role="alert" className="availability-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {!data?<p>กำลังโหลด...</p>:<>
        {!data.supported&&<p role="alert">ยังไม่เปิดใช้การล็อกคาบครู กรุณารันฐานข้อมูล 058_schedule_eight_periods_teacher_blocks.sql</p>}
        {!fixedTeacher&&<label className="availability-teacher">ครูผู้สอน<select value={teacher} disabled={disabled||saving} onChange={e=>{setTeacher(e.target.value);setNotice('');setEditing(null)}}>{data.teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
        {editing&&<section className="availability-editor" aria-label="แก้ไขคาบสอน"><h3>คาบ {editing.period} · {['','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์'][editing.day]}</h3><p>{busyCell?.label||'คาบว่าง'}</p>
          {busyCell?.locked?<p>คาบเรียนนี้ล็อกอยู่ กรุณาปลดล็อกก่อนแก้ไข</p>:<select aria-label="เลือกวิชาและห้องเรียน" disabled={saving} value={chosen} onChange={e=>setChosen(e.target.value)}><option value="">เลือกวิชาและห้องเรียน</option>{data.lessons.filter(l=>l.teacherId===teacher&&(!busyCell||l.classroomId===busyCell.classroomId)).map(l=>{const taken=data.slots.some(s=>s.classroomId===l.classroomId&&s.day===editing.day&&s.period===editing.period&&(s.lessonId!==busyCell?.lessonId||s.locked));return <option key={l.id} value={l.id} disabled={taken}>{l.label}{taken?' (ห้องมีคาบแล้ว)':''}</option>})}</select>}
          <div className="availability-editor-actions">
            {busyCell?.locked?<button disabled={saving} onClick={()=>edit(false,true)}>ปลดล็อกคาบเรียน</button>:<>
              {busyCell&&<button className="danger" disabled={saving} onClick={()=>edit(true)}>เอาวิชาออก</button>}
              <button disabled={saving||!chosen||data.blocks.some(b=>b.teacherId===teacher&&b.day===editing.day&&b.period===editing.period)} onClick={()=>edit()}>บันทึกวิชา</button>
            </>}
            {!busyCell&&<button disabled={saving||!data.supported} onClick={()=>toggle(editing.day,editing.period,data.blocks.some(b=>b.teacherId===teacher&&b.day===editing.day&&b.period===editing.period))}>{data.blocks.some(b=>b.teacherId===teacher&&b.day===editing.day&&b.period===editing.period)?'ปลดล็อกคาบว่าง':'ล็อกคาบว่าง'}</button>}
            <button disabled={saving} onClick={()=>setEditing(null)}>ปิด</button>
          </div>
        </section>}
        <div className="schedule-grid-scroll"><ScheduleGridTable periodTimes={periodTimes} compactBreak renderCell={(day,period)=>{
          const busy=data.busy.find(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
          const blocked=data.blocks.some(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
          return <button type="button" className={`availability-cell ${blocked?'is-blocked':busy?'is-busy':''}`} aria-pressed={blocked} disabled={disabled||saving||!teacher} onClick={()=>{setEditing({day,period});setChosen(busy?.lessonId||'');setError('');setNotice('')}}><strong>{blocked?'ล็อกคาบว่าง':busy?'มีสอน':'ว่าง'}</strong><span>{busy?busy.label:blocked?'กดเพื่อปลดล็อกหรือเลือกวิชา':'กดเพื่อเลือกวิชาหรือล็อก'}</span></button>
        }}/></div>
      </>}
    </div>
  </>
  return fixedTeacher?<section className="teacher-availability-panel">{content}</section>:<details className="teacher-availability-panel"><summary>ตารางครูและล็อกคาบว่าง <span>นำวิชาออก เปลี่ยนวิชา หรือเว้นคาบสอน</span></summary>{content}</details>
}
