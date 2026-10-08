'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import {fetchTeacherAvailability, setTeacherAvailabilityBlock} from '@/app/schedules/actions'
import {type PeriodTimeRow} from '@/lib/schedule-helpers'
import ScheduleGridTable from './ScheduleGridTable'

type Availability = Awaited<ReturnType<typeof fetchTeacherAvailability>>
export default function TeacherAvailabilityPanel({yearId,semester,periodTimes,disabled,refreshToken}: {yearId:string;semester:number;periodTimes:PeriodTimeRow[];disabled:boolean;refreshToken:string}) {
  const [data,setData] = useState<Availability|null>(null)
  const [teacher,setTeacher] = useState('')
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const request = useRef(0)
  const load = useCallback(async()=>{
    const id=++request.current
    setData(null);setError('');setNotice('')
    try {const next=await fetchTeacherAvailability(yearId,semester);if(id!==request.current)return;setData(next);setTeacher(t=>next.teachers.some(x=>x.id===t)?t:next.teachers[0]?.id||'')}
    catch(e){if(id===request.current)setError(e instanceof Error?e.message:'โหลดไม่สำเร็จ')}
  },[yearId,semester])
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
  return <details className="teacher-availability-panel">
    <summary>ล็อกคาบว่างของครู <span>กำหนดช่วงที่ไม่ให้ลงสอน</span></summary>
    <div className="teacher-availability-body">
      <p>เลือกครูแล้วกดคาบว่างเพื่อล็อก ระบบจะเว้นคาบนี้ให้ครูในทุกห้อง ทั้งการเลือกวิชาเองและการจัดอัตโนมัติ แยกตามปีและภาคเรียน</p>
      {error&&<p role="alert" className="availability-error">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {!data?<p>กำลังโหลด...</p>:<>
        {!data.supported&&<p role="alert">ยังไม่เปิดใช้การล็อกคาบครู กรุณารันฐานข้อมูล 058_schedule_eight_periods_teacher_blocks.sql</p>}
        <label className="availability-teacher">ครูผู้สอน<select value={teacher} disabled={disabled||saving} onChange={e=>{setTeacher(e.target.value);setNotice('')}}>{data.teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div className="schedule-grid-scroll"><ScheduleGridTable periodTimes={periodTimes} compactBreak renderCell={(day,period)=>{
          const busy=data.busy.find(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
          const blocked=data.blocks.some(b=>b.teacherId===teacher&&b.day===day&&b.period===period)
          return <button type="button" className={`availability-cell ${blocked?'is-blocked':busy?'is-busy':''}`} aria-pressed={blocked} disabled={disabled||saving||!teacher||!data.supported||!!busy} onClick={()=>toggle(day,period,blocked)}><strong>{blocked?'ล็อกคาบว่าง':busy?'มีสอน':'ว่าง'}</strong><span>{busy?busy.label:blocked?'กดเพื่อปลดล็อก':'กดเพื่อล็อก'}</span></button>
        }}/></div>
      </>}
    </div>
  </details>
}
