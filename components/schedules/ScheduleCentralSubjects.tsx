'use client'
import { useState } from 'react'
import { fetchPrimaryScheduleSubjects } from '@/app/schedules/catalog-actions'
import { centralSubjectPeriods, centralSubjectProblem, prepareCentralSubjects, primaryRoomGrade, primarySubjectGrade, type CentralScheduleSubject, type CentralSubjectRoom } from '@/lib/schedule-central-subjects'
import { SCHEDULE_WEEKS_PER_YEAR } from '@/lib/schedule-helpers'
import './schedule-central-subjects.css'

export default function ScheduleCentralSubjects({rooms,initialLevel,existing,staged,disabled,onAppend}:{
  rooms:CentralSubjectRoom[];initialLevel:string;existing:{classroomId:string;code:string;activity?:boolean}[]
  staged:string[][];disabled:boolean;onAppend:(rows:string[][])=>void
}) {
  const grades=[1,2,3,4,5,6]
  const configuredLevels=[...new Set(rooms.map(room=>room.level))]
  const [open,setOpen]=useState(false),[catalog,setCatalog]=useState<CentralScheduleSubject[]|null>(null)
  const [loading,setLoading]=useState(false),[error,setError]=useState('')
  const [selectedGrades,setSelectedGrades]=useState<number[]>([primaryRoomGrade(initialLevel)||rooms.map(room=>primaryRoomGrade(room.level)).find(value=>value!==null)||1])
  const [roomIds,setRoomIds]=useState<string[]|null>(null),[codes,setCodes]=useState<string[]|null>(null)
  const gradeRooms=rooms.filter(room=>selectedGrades.includes(primaryRoomGrade(room.level)||0)).sort((a,b)=>(primaryRoomGrade(a.level)||0)-(primaryRoomGrade(b.level)||0)||a.room-b.room)
  const missingGrades=selectedGrades.filter(grade=>!gradeRooms.some(room=>primaryRoomGrade(room.level)===grade))
  const subjects=(catalog||[]).filter(subject=>selectedGrades.includes(primarySubjectGrade(subject.code)||0)).sort((a,b)=>(primarySubjectGrade(a.code)||0)-(primarySubjectGrade(b.code)||0)||a.sort_order-b.sort_order||a.code.localeCompare(b.code,'th'))
  const selectedRooms=roomIds??gradeRooms.map(room=>room.id),selectedCodes=codes??subjects.filter(subject=>!centralSubjectProblem(subject)).map(subject=>subject.code)
  const preview=prepareCentralSubjects(subjects,gradeRooms,selectedRooms,selectedCodes,existing,staged)
  async function load(){
    setLoading(true);setError('')
    try{const result=await fetchPrimaryScheduleSubjects();if(result.error||!result.data)throw Error(result.error||'โหลดรายวิชากลางไม่สำเร็จ');setCatalog(result.data);setCodes(null)}
    catch(cause){setError(cause instanceof Error?cause.message:'กรุณาเชื่อมต่ออินเทอร์เน็ตเพื่อดึงรายวิชากลาง แล้วลองอีกครั้ง')}
    finally{setLoading(false)}
  }
  function toggleRoom(id:string){setRoomIds(selectedRooms.includes(id)?selectedRooms.filter(item=>item!==id):[...selectedRooms,id])}
  function toggleSubject(code:string){setCodes(selectedCodes.includes(code)?selectedCodes.filter(item=>item!==code):[...selectedCodes,code])}
  function chooseGrades(next:number[]){
    const added=next.filter(grade=>!selectedGrades.includes(grade))
    // Keep choices in the other grades when adding or removing a grade.
    setRoomIds([...selectedRooms.filter(id=>rooms.some(room=>room.id===id&&next.includes(primaryRoomGrade(room.level)||0))),...rooms.filter(room=>added.includes(primaryRoomGrade(room.level)||0)).map(room=>room.id)])
    setCodes([...selectedCodes.filter(code=>next.includes(primarySubjectGrade(code)||0)),...(catalog||[]).filter(subject=>added.includes(primarySubjectGrade(subject.code)||0)&&!centralSubjectProblem(subject)).map(subject=>subject.code)])
    setSelectedGrades(next.slice().sort((a,b)=>a-b))
  }
  return <div className="central-subject-import">
    <button type="button" className="central-subject-toggle" aria-expanded={open} aria-controls="primary-central-subjects" disabled={disabled||loading} onClick={()=>{setOpen(!open);if(!open&&catalog===null)void load()}}>ดึงโครงสร้างรายวิชากลาง</button>
    {open&&<section id="primary-central-subjects" className="central-subject-panel" aria-labelledby="primary-central-title">
      <header><div><h3 id="primary-central-title">รายวิชากลาง · ระดับประถม</h3><p>เลือกชั้น ห้อง และรายวิชา แล้วตรวจในตารางนำเข้าก่อนบันทึก</p></div><button type="button" disabled={loading||disabled} onClick={()=>setOpen(false)}>ปิดส่วนนี้</button></header>
      <>
        <fieldset className="central-subject-grade-picker" disabled={loading||disabled}><legend>เลือกชั้นได้หลายชั้น</legend><div className="central-subject-choice-bar"><button type="button" data-central-grades="all" onClick={()=>chooseGrades(grades)}>เลือกทั้งหมด ป.1–ป.6</button><button type="button" data-central-grades="clear" onClick={()=>chooseGrades([])}>ล้างการเลือกชั้น</button></div><div className="central-subject-grades">{grades.map(value=><label key={value}><input type="checkbox" data-grade={value} aria-label={`เลือกชั้น ป.${value}`} checked={selectedGrades.includes(value)} onChange={()=>chooseGrades(selectedGrades.includes(value)?selectedGrades.filter(grade=>grade!==value):[...selectedGrades,value])}/><span>ป.{value}<small>{rooms.filter(room=>primaryRoomGrade(room.level)===value).length} ห้อง</small></span></label>)}</div></fieldset>
        {loading&&<p role="status">กำลังโหลดโครงสร้างรายวิชากลาง…</p>}
        {error&&<div className="prep-error" role="alert">{error}<button type="button" disabled={loading||disabled} onClick={()=>void load()}>ลองโหลดอีกครั้ง</button></div>}
        {catalog!==null&&!loading&&!error&&<>
          {!selectedGrades.length&&<p className="central-subject-empty" role="status">เลือกอย่างน้อยหนึ่งชั้น หรือกดเลือกทั้งหมด ป.1–ป.6 เพื่อดูรายวิชา</p>}
          {selectedGrades.length>0&&<fieldset disabled={disabled}><legend>ห้องที่จะเพิ่มรายวิชา</legend>{gradeRooms.length>0&&<><div className="central-subject-choice-bar"><button type="button" data-central-rooms="all" onClick={()=>setRoomIds(gradeRooms.map(room=>room.id))}>เลือกทุกห้องของชั้นที่เลือก</button><button type="button" onClick={()=>setRoomIds([])}>ล้างการเลือกห้อง</button></div><div className="central-subject-rooms">{gradeRooms.map(room=><label key={room.id}><input type="checkbox" data-room={room.id} checked={selectedRooms.includes(room.id)} onChange={()=>toggleRoom(room.id)}/>{room.level}/{room.name}</label>)}</div></>}{missingGrades.length>0&&<div className="central-subject-room-notice" role="status"><strong>ยังไม่มีห้องปลายทางสำหรับ {missingGrades.map(grade=>`ป.${grade}`).join(' · ')}</strong><p>{configuredLevels.length?`ชั้นที่ตั้งไว้ตอนนี้: ${configuredLevels.join(' · ')}`:'ชุดข้อมูลนี้ยังไม่ได้กำหนดชั้น/ห้อง'}</p><p>ดูรายวิชาได้ก่อน เพิ่มและบันทึกห้องที่ขาดในขั้น 2 แล้วกลับมานำเข้า วิชาจะถูกใส่เฉพาะห้องที่ตรงระดับชั้น</p></div>}</fieldset>}
          <fieldset disabled={disabled}><legend>รายวิชาที่จะนำเข้า</legend><div className="central-subject-choice-bar"><button type="button" onClick={()=>setCodes(subjects.filter(subject=>!centralSubjectProblem(subject)).map(subject=>subject.code))}>เลือกทุกวิชา</button><button type="button" onClick={()=>setCodes([])}>ล้างการเลือกวิชา</button></div>
            {!subjects.length?<p className="central-subject-empty">{selectedGrades.length?'ยังไม่มีรายวิชากลางสำหรับชั้นที่เลือก ให้ผู้ดูแลเพิ่มในเมนูโครงสร้างรายวิชากลางก่อน':'ยังไม่ได้เลือกชั้น'}</p>:<div className="central-subject-options">{subjects.map(subject=>{const problem=centralSubjectProblem(subject);return <label key={subject.code} className={problem?'is-unavailable':''}><input type="checkbox" data-code={subject.code} disabled={!!problem} checked={!problem&&selectedCodes.includes(subject.code)} onChange={()=>toggleSubject(subject.code)}/><span><strong>{subject.name}</strong><small><span className="central-subject-grade-tag">ป.{primarySubjectGrade(subject.code)}</span> {subject.code} · {subject.subject_group} · {subject.type}</small>{problem&&<small className="central-subject-problem">{problem}</small>}</span><em>{subject.hours_per_year} ชม./ปี<strong>{centralSubjectPeriods(subject)} คาบ/สัปดาห์</strong></em></label>})}</div>}
          </fieldset>
          <p className="central-subject-note">คำนวณจาก {SCHEDULE_WEEKS_PER_YEAR} สัปดาห์ต่อปี ปัดเป็นจำนวนคาบเต็ม ปรับจำนวนคาบในตารางนำเข้าได้ · วิชาเดิมของแต่ละห้องจะถูกข้าม</p>
          <div className="central-subject-stage"><span role="status">เพิ่มใหม่ {preview.rows.length} รายการ · ข้ามรายการซ้ำ {preview.skipped} รายการ{preview.overLimit&&<strong className="central-subject-problem">จำนวนรายการเกินขีดจำกัด กรุณาเลือกห้องหรือวิชาให้น้อยลง</strong>}</span><button type="button" className="prep-primary" disabled={disabled||!preview.rows.length||preview.overLimit} onClick={()=>{if(preview.overLimit||!preview.rows.length)return;onAppend(preview.rows);setOpen(false)}}>นำ {preview.rows.length} รายการลงตารางนำเข้า</button></div>
        </>}
      </>
    </section>}
  </div>
}
