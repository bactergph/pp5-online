'use client'
import {useEffect,useState} from 'react'
import type {Preparation} from '@/lib/schedule-preparation'
import ActivityTeamEditor from './ActivityTeamEditor'
import TeacherActivityEditor from './TeacherActivityEditor'
import './schedule-setup.css'
export default function ScheduleActivitiesStep({data,year,term,onSaved,onBusy,onDirty,blocked,busy,onFix}:{data:Preparation;year:string;term:number;onSaved:()=>Promise<void>;onBusy:(value:boolean)=>void;onDirty:(value:boolean)=>void;blocked:boolean;busy:boolean;onFix:()=>void}){
 const [tab,setTab]=useState<'student'|'teacher'>('student'),[studentDirty,setStudentDirty]=useState(false),[teacherDirty,setTeacherDirty]=useState(false)
 useEffect(()=>{onDirty(studentDirty||teacherDirty)},[studentDirty,teacherDirty,onDirty])
 return <section><div className="schedule-activities-tabs" role="group" aria-label="ชนิดกิจกรรม"><button type="button" aria-pressed={tab==='student'} disabled={busy||teacherDirty} onClick={()=>setTab('student')}>กิจกรรมนักเรียน</button><button type="button" aria-pressed={tab==='teacher'} disabled={busy||studentDirty} onClick={()=>setTab('teacher')}>กิจกรรมครู</button></div>{(studentDirty||teacherDirty)&&<p className="prep-notice">บันทึกหรือยกเลิกแบบฟอร์มที่เปิดอยู่ก่อนเปลี่ยนแท็บกิจกรรม</p>}<div hidden={tab!=='student'}><ActivityTeamEditor data={data} year={year} term={term} onSaved={onSaved} onBusy={onBusy} onDirty={setStudentDirty} blocked={blocked||teacherDirty}/></div><div hidden={tab!=='teacher'}><TeacherActivityEditor data={data} year={year} term={term} onSaved={onSaved} onBusy={onBusy} onDirty={setTeacherDirty} blocked={blocked||studentDirty} busy={busy} onFix={onFix}/></div></section>
}
