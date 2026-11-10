'use client'
import {useEffect,useRef,useState} from 'react'
import type {Preparation} from '@/lib/schedule-preparation'
import {SCHEDULE_DAYS} from '@/lib/schedules'
import {validateTeacherActivities,teacherActivityMinutes,type TeacherScheduleActivity} from '@/lib/schedule-teacher-activities'
import {teacherActivityConflicts} from '@/lib/schedule-teacher-activity-conflicts'
import {useScheduleOperations} from './ScheduleServices'
import {usePendingScheduleEditor} from './SchedulePendingEdits'
import './schedule-setup.css'

export default function TeacherActivityEditor({data,year,term,blocked,busy,onBusy,onSaved,onDirty,onFix}:{data:Preparation;year:string;term:number;blocked:boolean;busy:boolean;onBusy:(value:boolean)=>void;onSaved:()=>Promise<void>;onDirty:(value:boolean)=>void;onFix:()=>void}){
 const {savePreparation}=useScheduleOperations(),[draft,setDraft]=useState<TeacherScheduleActivity|null>(null),[baseline,setBaseline]=useState('null'),[error,setError]=useState(''),[message,setMessage]=useState(''),lock=useRef(false)
 const activities=data.plan.teacherActivities||[]
 const dirty=!!draft&&JSON.stringify(draft)!==baseline
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty,onDirty])
 const name=(id:string)=>{const teacher=data.teachers.find(t=>t.id===id);return teacher?`${teacher.prefix||''}${teacher.full_name}`:id}
 const conflicts=draft?teacherActivityConflicts(data,draft):[]
 usePendingScheduleEditor('teacher-activity',{step:4,label:'กิจกรรมครู',dirty,save:()=>save()})
 let validation='';if(draft)try{validateTeacherActivities([...activities.filter(a=>a.id!==draft.id),draft],data.teachers.map(t=>t.id))}catch(cause){validation=cause instanceof Error?cause.message:'ข้อมูลกิจกรรมครูไม่ถูกต้อง'}
 function open(activity?:TeacherScheduleActivity){setError('');setMessage('');setBaseline(JSON.stringify(activity||null));setDraft(activity?{...activity,teacherIds:[...activity.teacherIds],days:[...activity.days]}:{id:crypto.randomUUID(),name:'',teacherIds:[],days:[3],start_time:'15:30',end_time:'16:30'})}
 async function save(remove?:TeacherScheduleActivity){
  if(lock.current||blocked||busy||!remove&&!draft)return false
  if(remove&&!window.confirm(`ลบกิจกรรมครู “${remove.name}”? เวลานี้จะไม่ถูกกันไว้สำหรับครูที่เข้าร่วมอีกต่อไป`))return false
  lock.current=true;onBusy(true);setError('');setMessage('')
  try{
   if(!remove&&JSON.stringify(activities.find(activity=>activity.id===draft!.id)||null)!==baseline)throw Error('กิจกรรมนี้มีการแก้ไขแล้ว กรุณายกเลิกฟอร์มและเปิดข้อมูลล่าสุดก่อนบันทึก')
   const next=remove?activities.filter(a=>a.id!==remove.id):[...activities.filter(a=>a.id!==draft!.id),draft!]
   validateTeacherActivities(next,data.teachers.map(t=>t.id))
   const result=await savePreparation(year,term,data.hash,{...data.plan,teacherActivities:next})
   if(result.error)throw Error(result.error)
   setDraft(null);await onSaved();setMessage(remove?'ลบกิจกรรมครูแล้ว':'บันทึกกิจกรรมครูแล้ว ตารางครูและ PDF จะใช้ข้อมูลชุดนี้')
   return true
  }catch(cause){setError(cause instanceof Error?cause.message:'บันทึกกิจกรรมครูไม่สำเร็จ');return false}finally{lock.current=false;onBusy(false)}
 }
 return <section aria-label="จัดการกิจกรรมครู">
  <div className="prep-review-actions"><div><h2>กิจกรรมครู</h2><p>PLC ประชุม เวรดูแล หรือภารกิจช่วงพัก เช่น ขายของสหกรณ์ตอนพักเที่ยง · ใส่เวลาให้ตรงคาบพัก แล้วตารางสอนครูจะแสดงชื่องานในช่องนั้น</p></div>{!draft&&<button type="button" className="prep-primary" disabled={blocked||busy} onClick={()=>open()}>+ เพิ่มกิจกรรมครู</button>}</div>
  {blocked&&<p className="prep-notice">บันทึกข้อมูลหรือเวลาเรียนที่แก้ไขก่อนเพิ่มกิจกรรมครู</p>}
  {draft&&<fieldset disabled={busy||blocked} className="schedule-teacher-activity-form"><legend>{activities.some(a=>a.id===draft.id)?'แก้ไขกิจกรรมครู':'เพิ่มกิจกรรมครู'}</legend><div className="schedule-teacher-activity-fields"><label className="full">ชื่อกิจกรรม<input value={draft.name} maxLength={150} placeholder="เช่น ขายของสหกรณ์ / PLC กลุ่มสาระ" onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>เริ่ม (24 ชั่วโมง)<input value={draft.start_time} placeholder="15:30" inputMode="text" maxLength={5} onChange={e=>setDraft({...draft,start_time:e.target.value})}/></label><label>สิ้นสุด (24 ชั่วโมง)<input value={draft.end_time} placeholder="16:30" inputMode="text" maxLength={5} onChange={e=>setDraft({...draft,end_time:e.target.value})}/></label></div><div><strong>ทำซ้ำทุกสัปดาห์</strong><div className="prep-checks">{SCHEDULE_DAYS.map(day=><label key={day.value}><input type="checkbox" checked={draft.days.includes(day.value)} onChange={e=>setDraft({...draft,days:e.target.checked?[...draft.days,day.value].sort():draft.days.filter(d=>d!==day.value)})}/>{day.label}</label>)}</div></div><div><strong>ครูที่เข้าร่วม {draft.teacherIds.length} คน</strong><div className="prep-checks"><button type="button" onClick={()=>setDraft({...draft,teacherIds:data.teachers.map(t=>t.id)})}>เลือกครูทั้งหมด</button><button type="button" onClick={()=>setDraft({...draft,teacherIds:[]})}>ล้างการเลือกครู</button></div><div className="schedule-teacher-activity-staff">{data.teachers.map(teacher=><label key={teacher.id}><input type="checkbox" checked={draft.teacherIds.includes(teacher.id)} onChange={e=>setDraft({...draft,teacherIds:e.target.checked?[...draft.teacherIds,teacher.id]:draft.teacherIds.filter(id=>id!==teacher.id)})}/>{name(teacher.id)}</label>)}</div></div>
  {conflicts.length>0&&<div className="prep-error" role="alert"><strong>ครูติดสอนหรือกิจกรรมในเวลานี้</strong><ul>{conflicts.slice(0,12).map((c,i)=><li key={i}>{name(c.teacherId)} · {SCHEDULE_DAYS.find(day=>day.value===c.day)?.label} {c.start_time}–{c.end_time} · {c.label}</li>)}</ul><p>ปรับวัน เวลา หรือครูที่เข้าร่วม หรือย้ายคาบเดิมที่ชนก่อนบันทึก</p><button type="button" onClick={onFix}>ไปภาระสอน / ล็อกคาบ</button></div>}
  {validation&&<p className="prep-notice" role="status">{validation}</p>}<p className="schedule-teacher-activity-note">แสดงเฉพาะตารางสอนครูและ PDF ครู รวมช่องพักเที่ยงถ้าระบุเวลาตรงกับคาบพัก · ไม่เพิ่มคาบนักเรียน · ระบบจัดรายวิชาหลบเวลานี้ · สรุปเวลากิจกรรมแยกจากคาบสอน</p><div className="prep-review-actions"><button type="button" onClick={()=>{setDraft(null);setError('')}}>ยกเลิก</button><button type="button" className="prep-primary" disabled={!!validation||conflicts.length>0} onClick={()=>void save()}>บันทึกกิจกรรมครู</button></div></fieldset>}
  {error&&<p className="prep-error" role="alert">{error}</p>}{message&&<p className="prep-success" role="status">{message}</p>}
  <div className="schedule-teacher-activity-list">{activities.map(activity=><article key={activity.id} className="schedule-teacher-activity-item"><div><strong>{activity.name}</strong><p>{activity.days.map(d=>SCHEDULE_DAYS.find(day=>day.value===d)?.label).join(' / ')} · {activity.start_time}–{activity.end_time}</p><p>{activity.teacherIds.map(name).join(', ')}</p><small className="schedule-teacher-activity-hours">{teacherActivityMinutes([activity],activity.teacherIds[0])} นาที/สัปดาห์ต่อคน · แยกจากคาบสอน</small></div><div className="actions"><button type="button" disabled={blocked||busy||!!draft} onClick={()=>open(activity)}>แก้ไข</button><button type="button" disabled={blocked||busy||!!draft} onClick={()=>void save(activity)}>ลบ</button></div></article>)}</div>
  {!activities.length&&!draft&&<p className="prep-notice">ยังไม่มีกิจกรรมครู กดเพิ่มกิจกรรมเพื่อกำหนดวัน เวลา และรายชื่อครูที่เข้าร่วม</p>}
 </section>
}
