'use client'
import { useState } from 'react'
import { fetchScheduleCentralSubjects } from '@/app/schedules/catalog-actions'
import { centralRoomLevel, centralSubjectLevel, centralSubjectKey, centralSubjectPeriods, centralSubjectProblem, prepareCentralSubjects, type CentralScheduleSubject, type CentralSubjectRoom } from '@/lib/schedule-central-subjects'
import './schedule-central-subjects.css'

export default function ScheduleCentralSubjects({rooms,initialLevel,existing,staged,disabled,onAppend,onOpenChange}:{rooms:CentralSubjectRoom[];initialLevel:string;existing:{classroomId:string;code:string;activity?:boolean}[];staged:string[][];disabled:boolean;onAppend:(rows:string[][])=>void;onOpenChange?:(open:boolean)=>void}) {
  const levels=[...new Set(rooms.flatMap(room=>centralRoomLevel(room.level)?[centralRoomLevel(room.level)!]:[]))].sort((a,b)=>Number(a.startsWith('ม.'))-Number(b.startsWith('ม.'))||a.localeCompare(b,'th',{numeric:true}))
  const [open,setOpen]=useState(false),[step,setStep]=useState(1),[catalog,setCatalog]=useState<CentralScheduleSubject[]|null>(null)
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('')
  const [selectedLevels,setSelectedLevels]=useState<string[]>(levels.includes(centralRoomLevel(initialLevel)||'')?[centralRoomLevel(initialLevel)!]:levels.slice(0,1))
  const [roomIds,setRoomIds]=useState<string[]>([]),[codes,setCodes]=useState<string[]>([])
  const subjects=(catalog||[]).filter(subject=>selectedLevels.includes(centralSubjectLevel(subject)||'')).sort((a,b)=>(centralSubjectLevel(a)||'').localeCompare(centralSubjectLevel(b)||'','th',{numeric:true})||a.sort_order-b.sort_order||a.code.localeCompare(b.code,'th'))
  const visible=subjects.filter(subject=>!query.trim()||(subject.code+' '+subject.name+' '+subject.subject_group).toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th')))
  const targets=rooms.filter(room=>selectedLevels.includes(centralRoomLevel(room.level)||''))
  const selectedSubjects=subjects.filter(subject=>codes.includes(centralSubjectKey(subject)))
  const targetLevels=selectedLevels.filter(level=>selectedSubjects.some(subject=>centralSubjectLevel(subject)===level))
  const eligible=targets.filter(room=>targetLevels.includes(centralRoomLevel(room.level)||''))
  const preview=prepareCentralSubjects(subjects,targets,roomIds,codes,existing,staged)
  function show(next:boolean){setOpen(next);onOpenChange?.(next)}
  async function load(){setLoading(true);setError('');try{const result=await fetchScheduleCentralSubjects();if(result.error||!result.data)throw Error(result.error||'โหลดรายวิชากลางไม่สำเร็จ');setCatalog(result.data)}catch(error){setError(error instanceof Error?error.message:'โหลดไม่สำเร็จ กรุณาลองใหม่')}finally{setLoading(false)}}
  function chooseLevels(next:string[]){setSelectedLevels(next);setCodes(codes.filter(code=>next.includes(code.split('|')[0])));setRoomIds(roomIds.filter(id=>rooms.some(room=>room.id===id&&next.includes(centralRoomLevel(room.level)||''))))}
  return <div className="central-subject-import">
    <button type="button" className="central-subject-toggle" aria-expanded={open} disabled={disabled||loading} onClick={()=>{show(!open);if(!open&&catalog===null)void load()}}>ดึงโครงสร้างรายวิชากลาง</button>
    {open&&<section className="central-subject-panel" aria-labelledby="central-subject-title">
      <header><div><h3 id="central-subject-title">เลือกรายวิชาจากข้อมูลกลาง</h3><p>ประถม ป.1–ป.6 และมัธยม ม.1–ม.6 · นำไปใช้ได้หลายห้องพร้อมกัน</p></div><button type="button" onClick={()=>show(false)}>ปิดส่วนนี้</button></header>
      <ol className="central-subject-steps" aria-label="ขั้นตอนเลือกรายวิชากลาง">{['เลือกชั้น','เลือกวิชา','เลือกห้อง'].map((label,index)=><li key={label} aria-current={step===index+1?'step':undefined}><b>{index+1}</b>{label}</li>)}</ol>
      {loading&&<p role="status">กำลังโหลดรายวิชากลาง…</p>}
      {error&&<div className="prep-error" role="alert">{error}<button type="button" onClick={()=>void load()}>ลองโหลดอีกครั้ง</button></div>}
      {!loading&&!error&&<>
        {step===1&&<fieldset disabled={disabled}><legend>1. เลือกชั้นที่ต้องการเพิ่มรายวิชา</legend><p>เลือกจากชั้นที่ตั้งไว้ในขั้น 2 เลือกหลายชั้นได้</p>
          {!levels.length?<p className="central-subject-room-notice">ยังไม่มีชั้น/ห้องเรียน กรุณาเพิ่มและบันทึกในขั้น 2 ก่อน</p>:<><div className="central-subject-choice-bar"><button type="button" data-central-grades="all" onClick={()=>chooseLevels(levels)}>เลือกทุกชั้นที่เปิดสอน</button>{levels.some(level=>level.startsWith('ป.'))&&levels.some(level=>level.startsWith('ม.'))&&<><button type="button" onClick={()=>chooseLevels(levels.filter(level=>level.startsWith('ป.')))}>เลือกเฉพาะประถม</button><button type="button" onClick={()=>chooseLevels(levels.filter(level=>level.startsWith('ม.')))}>เลือกเฉพาะมัธยม</button></>}<button type="button" data-central-grades="clear" onClick={()=>chooseLevels([])}>ล้างการเลือก</button></div><div className="central-subject-grades">{levels.map(level=><label key={level}><input type="checkbox" data-level={level} checked={selectedLevels.includes(level)} onChange={()=>chooseLevels(selectedLevels.includes(level)?selectedLevels.filter(item=>item!==level):[...selectedLevels,level])}/><span>{level}<small>{rooms.filter(room=>centralRoomLevel(room.level)===level).length} ห้อง</small></span></label>)}</div></>}
        </fieldset>}
        {step===2&&<fieldset disabled={disabled}><legend>2. เลือกรายวิชาที่จะนำไปใช้</legend><p>ชั้นที่เลือก: {selectedLevels.join(' · ')} · เลือกแล้ว {selectedSubjects.length} วิชา</p>
          {selectedLevels.some(level=>level.startsWith('ม.'))&&<p className="central-subject-source">โครงสร้างมัธยมเป็นตัวอย่างจากโรงเรียนเซกา ภาคเรียน 2 ตรวจชื่อและจำนวนคาบให้ตรงกับหลักสูตรของโรงเรียนก่อนบันทึก</p>}
          <input type="search" className="central-subject-search" placeholder="ค้นหารหัส ชื่อวิชา หรือกลุ่มสาระ" aria-label="ค้นหารายวิชากลาง" value={query} onChange={event=>setQuery(event.target.value)}/>
          <div className="central-subject-choice-bar"><button type="button" onClick={()=>setCodes([...new Set([...codes,...visible.filter(subject=>!centralSubjectProblem(subject)).map(centralSubjectKey)])])}>เลือกวิชาที่แสดงทั้งหมด</button><button type="button" onClick={()=>setCodes([])}>ล้างการเลือกวิชา</button></div>
          {!visible.length?<p className="central-subject-empty">ไม่พบรายวิชาสำหรับชั้นหรือคำค้นนี้</p>:<div className="central-subject-options">{visible.map(subject=>{const problem=centralSubjectProblem(subject),key=centralSubjectKey(subject);return <label key={key} className={problem?'is-unavailable':''}><input type="checkbox" data-code={subject.code} data-subject-key={key} checked={codes.includes(key)} disabled={!!problem} onChange={()=>setCodes(codes.includes(key)?codes.filter(code=>code!==key):[...codes,key])}/><span><strong>{subject.name}</strong><small><span className="central-subject-grade-tag">{centralSubjectLevel(subject)}</span> {subject.code} · {subject.type}</small><small>{subject.subject_group}</small>{problem&&<small className="central-subject-problem">{problem}</small>}</span><em><strong>{centralSubjectPeriods(subject)} คาบ/สัปดาห์</strong></em></label>})}</div>}
        </fieldset>}
        {step===3&&<fieldset disabled={disabled}><legend>3. เลือกห้องที่จะใช้รายวิชาเหล่านี้</legend><p>เลือกแล้ว {selectedSubjects.length} วิชา · {eligible.filter(room=>roomIds.includes(room.id)).length} ห้อง</p>
          <div className="central-subject-choice-bar"><button type="button" data-central-rooms="all" onClick={()=>setRoomIds(eligible.map(room=>room.id))}>เลือกทุกห้องของชั้นที่เลือก</button><button type="button" onClick={()=>setRoomIds([])}>ล้างการเลือกห้อง</button></div>
          {targetLevels.slice().sort((a,b)=>a.localeCompare(b,'th',{numeric:true})).map(level=><div className="central-subject-room-group" key={level}><strong>{level} · {selectedSubjects.filter(subject=>centralSubjectLevel(subject)===level).length} วิชาที่เลือก</strong><div className="central-subject-rooms">{targets.filter(room=>centralRoomLevel(room.level)===level).map(room=><label key={room.id}><input type="checkbox" data-room={room.id} checked={roomIds.includes(room.id)} onChange={()=>setRoomIds(roomIds.includes(room.id)?roomIds.filter(id=>id!==room.id):[...roomIds,room.id])}/>{room.level}/{room.name}</label>)}</div></div>)}
          <p className="central-subject-note">รายวิชาจะเข้าห้องที่ตรงชั้นเท่านั้น วิชาเดิมและรายการที่อยู่ในตารางนำเข้าจะไม่ถูกทับ สามารถปรับจำนวนคาบก่อนบันทึกได้</p>
        </fieldset>}
        <div className="central-subject-stage"><span role="status">{step===3?('เพิ่มใหม่ '+preview.rows.length+' รายการ · ข้ามรายการที่มีแล้ว '+preview.skipped+' รายการ'):('เลือกแล้ว '+selectedLevels.length+' ชั้น'+(step===2?' · '+selectedSubjects.length+' วิชา':''))}{preview.overLimit&&step===3&&<strong className="central-subject-problem">รายการเกินขีดจำกัด กรุณาลดจำนวนห้องหรือรายวิชา</strong>}</span><div className="central-subject-nav">{step>1&&<button type="button" onClick={()=>setStep(step-1)}>ย้อนกลับ</button>}{step<3?<button type="button" className="prep-primary" disabled={disabled||!selectedLevels.length||step===2&&!selectedSubjects.length||catalog===null} onClick={()=>setStep(step+1)}>{step===1?'ถัดไป: เลือกวิชา':'ถัดไป: เลือกห้อง'}</button>:<button type="button" className="prep-primary" disabled={disabled||!preview.rows.length||preview.overLimit} onClick={()=>{onAppend(preview.rows);show(false)}}>เพิ่ม {preview.rows.length} รายการลงตารางตรวจสอบ</button>}</div></div>
      </>}
    </section>}
  </div>
}
