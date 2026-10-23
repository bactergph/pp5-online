'use client'
import { useState, type ReactNode } from 'react'
import { FiArrowLeft, FiArrowRight, FiZap } from 'react-icons/fi'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import { validatePeriodTimes } from '@/lib/schedule-helpers'
import type { DeviceDraft } from '@/lib/schedule-device-build'
import { deviceTeacherLimitMessage, freeActivityTeachers, addLevelRooms, importSubjectTable, newId, teachingRows, patternFor, roomNeed, slotCapacity, type FreeWizardPlan } from '@/lib/schedule-device-free'
import ScheduleGridTable from './ScheduleGridTable'
import WizardPeriodEditor from './WizardPeriodEditor'
import LessonPatternPicker from './LessonPatternPicker'
import FreeActivityEditor from './FreeActivityEditor'
import './schedule-preparation.css'
export type { FreeActivity, FreePlace, FreeSubject, FreeWizardPlan } from '@/lib/schedule-device-free'
export { activityTeacherId, addLevelRooms, doublesIn, importSubjectTable, newId, normalizePlan, patternFor, periodColumns, roomNeed, slotCapacity, teachingRows } from '@/lib/schedule-device-free'
export function cellText(plan: FreeWizardPlan, roomId: string, day: number, period: number, draft: DeviceDraft | null) {
  const row = draft?.rows.find(item => item.classroom_id === roomId && item.day_of_week === day && item.period === period)
  const saved = plan.timetable.find(cell => cell.classroomId === roomId && cell.day === day && cell.period === period)
  const pinned = plan.activities.find(item => `${item.id}:${roomId}` === row?.activity_id || item.id === saved?.activityId) || plan.activities.find(item => item.roomIds.includes(roomId) && item.cells.some(cell => cell.day === day && cell.period === period))
  if (pinned && (row?.activity_id || !row?.class_subject_id)) {
    const teacherNames = freeActivityTeachers(pinned, roomId).map(id=>plan.teachers.find(teacher=>teacher.id===id)?.name||'').filter(Boolean).join(', ')
    return { name: pinned.name, detail: teacherNames || 'ยังไม่กำหนดครู', kind: 'activity' as const, locked: false }
  }
  const subjectId = row?.class_subject_id || saved?.subjectId
  const subject = plan.subjects.find(item => item.id === subjectId)
  if (!subject) return null
  return { name: subject.name, detail: plan.teachers.find(item => item.id === subject.teacherId)?.name || '', kind: 'subject' as const, locked: !!(row?.locked || saved?.locked) }
}

const titles = ['วันและเวลา','กำหนดชั้น','กำหนดครู','รายวิชา','กิจกรรม','กำหนดภาระสอน/ล็อกคาบ','ตรวจและจัดตาราง']
export default function FreeScheduleWizard({plan,step,onStep,onPlan,busy,review,onActivityDirty,onTeacher,canCopyOther,onCopyOther,teacherLimit}:{
  plan:FreeWizardPlan;step:number;onStep:(step:number)=>void;onPlan:(plan:FreeWizardPlan)=>void;busy:boolean;review:ReactNode
  teacherLimit?:number;onActivityDirty:(dirty:boolean)=>void;onTeacher:()=>void;canCopyOther:boolean;onCopyOther:()=>void
}) {
  const [level,setLevel]=useState('ป.1, ป.2, ป.3, ป.4, ป.5, ป.6'),[count,setCount]=useState(1)
  const [teacher,setTeacher]=useState(''),[teacherPaste,setTeacherPaste]=useState(''),[subjectPaste,setSubjectPaste]=useState('')
  const [query,setQuery]=useState(''),[room,setRoom]=useState(''),[code,setCode]=useState(''),[name,setName]=useState(''),[periods,setPeriods]=useState(1),[place,setPlace]=useState(''),[error,setError]=useState('')
  const activeRoom=plan.rooms.some(item=>item.id===room)?room:plan.rooms[0]?.id||''
  const statuses=[validatePeriodTimes(plan.periods)||!plan.days.length?'ยังต้องตรวจเวลา':`${plan.days.length} วัน · ${teachingRows(plan.periods).length} คาบ`,`${plan.rooms.length} ห้อง`,`${plan.teachers.length} คน`,`${plan.subjects.length} รายการ`,`${plan.activities.length} กิจกรรม`,plan.subjects.length&&plan.subjects.every(item=>item.teacherId)?'กำหนดครูแล้ว':'ยังต้องกำหนดครู','ตรวจแล้วสร้างฉบับร่าง']
  const updateSubject=(id:string,patch:Partial<FreeWizardPlan['subjects'][number]>)=>onPlan({...plan,subjects:plan.subjects.map(subject=>subject.id===id?{...subject,...patch}:subject)})
  function addTeachers(text:string){const teachers=[...plan.teachers];for(const name of text.split(/\r?\n/).map(row=>row.split('\t')[0].trim()).filter(Boolean)){if(!teachers.some(item=>item.name===name))teachers.push({id:newId(),name})}const limitError=deviceTeacherLimitMessage(teachers.length,teacherLimit);if(limitError){setError(limitError);return}setError('');onPlan({...plan,teachers});setTeacher('');setTeacherPaste('')}
  return <section className="schedule-prep local-wizard" aria-label="เตรียมและจัดตารางเรียนบนเครื่อง" aria-busy={busy}>
    <header className="prep-heading"><div><span className="prep-eyebrow"><FiZap aria-hidden="true"/> QUICK WIZARD</span><h2>เตรียมตารางอย่างเป็นขั้นตอน</h2><p>ข้อมูลและตัวคำนวณอยู่บนเครื่องนี้ ตรวจฉบับร่างก่อนบันทึกใช้จริง</p></div><span className="prep-count">ขั้น {step} จาก 7</span></header>
    <nav aria-label="ขั้นตอนจัดตาราง"><ol className="prep-steps">{titles.map((title,index)=><li key={title}><button type="button" disabled={busy} aria-current={step===index+1?'step':undefined} onClick={()=>{setError('');onStep(index+1)}}><b>{index+1}</b><span><strong>{title}</strong><small>{statuses[index]}</small></span></button></li>)}</ol></nav>
    {error&&<p className="prep-error" role="alert">{error}</p>}
    <fieldset className="prep-body" disabled={busy}>
      {step===1&&<><h2>วันและเวลาคาบเรียน</h2><p>ใช้เวลาคาบเดียวกันทั้งตารางเรียน ตารางครู และกิจกรรม</p><div className="prep-checks">{SCHEDULE_DAYS.map(day=><label key={day.value}><input type="checkbox" checked={plan.days.includes(day.value)} onChange={()=>onPlan({...plan,days:plan.days.includes(day.value)?plan.days.filter(id=>id!==day.value):[...plan.days,day.value].sort()})}/>{day.label}</label>)}</div><WizardPeriodEditor rows={plan.periods} configured={true} dirty={false} onSave={()=>{}} onChange={rows=>{
        const removed=plan.timetable.some(cell=>!rows.some(row=>!row.is_break&&row.period===cell.period))||plan.activities.some(activity=>activity.cells.some(cell=>!rows.some(row=>!row.is_break&&row.period===cell.period)))||plan.blocks.some(cell=>!rows.some(row=>!row.is_break&&row.period===cell.period))
        if(removed){setError('มีตาราง กิจกรรม หรือคาบล็อกใช้คาบนี้อยู่ กรุณานำรายการเหล่านั้นออกก่อนลดคาบ');return}onPlan({...plan,periods:rows})
      }}/><p className="local-storage-hint">บันทึกการเปลี่ยนแปลงลงเครื่องอัตโนมัติ ไม่ต้องกดบันทึกเวลาอีกครั้ง</p></>}
      {step===2&&<><div className="prep-section-heading"><div><h2>กำหนดชั้นและห้องเรียน</h2><p>ระบุระดับชั้นที่เปิดสอน แล้วสร้างหลายห้องได้ในครั้งเดียว</p></div><span className="prep-count">{plan.rooms.length} ห้อง</span></div>
        <form className="local-form-grid" onSubmit={event=>{event.preventDefault();onPlan(addLevelRooms(plan,level.split(','),count))}}><label className="field">ระดับชั้น (คั่นด้วยจุลภาค)<input value={level} onChange={event=>setLevel(event.target.value)}/></label><label className="field">ห้องต่อชั้น<input type="number" min={1} max={20} value={count} onChange={event=>setCount(Number(event.target.value))}/></label><button className="prep-primary" type="submit">เพิ่มชั้นและห้อง</button></form>
        <div className="local-room-list">{plan.rooms.map(room=><label className="field" key={room.id}>ชื่อห้อง<input aria-label={`ชื่อห้อง ${room.label}`} value={room.label} onChange={event=>onPlan({...plan,rooms:plan.rooms.map(item=>item.id===room.id?{...item,label:event.target.value}:item)})}/></label>)}</div>
      </>}
      {step===3&&<><div className="prep-section-heading"><div><h2>ครูที่นำมาจัดตาราง</h2><p>เพิ่มรายชื่อเอง หรือวางหนึ่งชื่อในแต่ละแถวจาก Excel</p></div><span className="prep-count">{plan.teachers.length}{teacherLimit!==undefined?` / ${teacherLimit}`:""} คน</span></div>{teacherLimit!==undefined&&<p className="local-storage-hint">โหมดฟรีรองรับครูสูงสุด {teacherLimit} คน นับรายชื่อร่วมกันทั้งสองภาคเรียน</p>}
        <form className="local-form-grid" onSubmit={event=>{event.preventDefault();addTeachers(teacher)}}><label className="field">ชื่อครู<input value={teacher} onChange={event=>setTeacher(event.target.value)} required/></label><button type="submit" className="prep-primary" disabled={teacherLimit!==undefined&&plan.teachers.length>=teacherLimit}>เพิ่มครู</button></form>
        <details className="local-disclosure"><summary>วางรายชื่อจาก Excel</summary><label className="field">หนึ่งคนต่อแถว<textarea value={teacherPaste} onChange={event=>setTeacherPaste(event.target.value)}/></label><button type="button" className="prep-primary" disabled={!teacherPaste.trim()} onClick={()=>addTeachers(teacherPaste)}>นำเข้ารายชื่อ</button></details>
        <div className="prep-scroll"><table><thead><tr><th>ลำดับ</th><th>ชื่อครู</th><th>จัดการ</th></tr></thead><tbody>{plan.teachers.map((teacher,index)=><tr key={teacher.id}><td>{index+1}</td><td><input aria-label={`ชื่อครู ${index+1}`} value={teacher.name} onChange={event=>onPlan({...plan,teachers:plan.teachers.map(item=>item.id===teacher.id?{...item,name:event.target.value}:item)})}/></td><td><button type="button" onClick={()=>{if(plan.subjects.some(item=>item.teacherId===teacher.id)||plan.activities.some(item=>(item.teacherIds||[item.teacherId]).includes(teacher.id)||Object.values(item.roomTeacherIds||{}).flat().includes(teacher.id))){setError('ครูนี้มีรายวิชาหรือกิจกรรมรับผิดชอบ กรุณาเปลี่ยนผู้รับผิดชอบก่อนลบ');return}onPlan({...plan,teachers:plan.teachers.filter(item=>item.id!==teacher.id),blocks:plan.blocks.filter(item=>item.teacherId!==teacher.id)})}}>ลบ</button></td></tr>)}</tbody></table></div>
      </>}
      {step===4&&<><div className="prep-section-heading"><div><h2>กำหนดรายวิชาแต่ละห้อง</h2><p>เตรียมวิชาและคาบต่อสัปดาห์ แล้วกำหนดครูในขั้น 6</p></div><span className="prep-count">{plan.subjects.length} รายการ</span></div>
        <form className="local-form-grid" onSubmit={event=>{event.preventDefault();if(!name.trim()||!activeRoom)return;onPlan({...plan,subjects:[...plan.subjects,{id:newId(),roomId:activeRoom,name:name.trim(),code:code.trim(),teacherId:'',periods,pattern:patternFor(periods,0),placeId:null}]});setName('');setCode('')}}>
          <label className="field">ห้อง<select value={activeRoom} onChange={event=>setRoom(event.target.value)}>{plan.rooms.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="field">รหัสวิชา<input value={code} onChange={event=>setCode(event.target.value)}/></label><label className="field">ชื่อรายวิชา<input value={name} required onChange={event=>setName(event.target.value)}/></label><label className="field">คาบ/สัปดาห์<input type="number" min={1} max={40} value={periods} onChange={event=>setPeriods(Math.max(1,Math.min(40,Number(event.target.value)||1)))}/></label><button type="submit" className="prep-primary" disabled={!activeRoom}>เพิ่มรายวิชา</button>
        </form>
        <details className="local-disclosure"><summary>นำเข้าจาก Excel หรือคัดลอกจากอีกภาคเรียน</summary><p>เรียงคอลัมน์: ห้อง · รหัส · รายวิชา · ครู · คาบ/สัปดาห์ · จำนวนคาบคู่ · สถานที่</p><label className="field">วางตารางข้อมูล<textarea value={subjectPaste} onChange={event=>setSubjectPaste(event.target.value)} placeholder={'ม.1/1\tค21101\tคณิตศาสตร์\tครูตัวอย่าง\t3\t0'}/></label><div className="actions"><button type="button" className="prep-primary" disabled={!subjectPaste.trim()} onClick={()=>{const result=importSubjectTable(subjectPaste,plan,teacherLimit);if('error'in result)setError(result.error);else{onPlan(result.plan);setSubjectPaste('');setError('')}}}>นำเข้ารายวิชา</button>{canCopyOther&&<button type="button" onClick={onCopyOther}>คัดลอกจากอีกภาคเรียน</button>}</div></details>
        <div className="prep-scroll"><table><thead><tr><th>ห้อง</th><th>รหัสวิชา</th><th>ชื่อรายวิชา</th><th>คาบ/สัปดาห์</th><th>จัดการ</th></tr></thead><tbody>{plan.subjects.map(subject=><tr key={subject.id}><td>{plan.rooms.find(room=>room.id===subject.roomId)?.label}</td><td><input aria-label={`รหัส ${subject.name}`} value={subject.code} onChange={event=>updateSubject(subject.id,{code:event.target.value})}/></td><td><input aria-label={`ชื่อวิชา ${subject.code}`} value={subject.name} onChange={event=>updateSubject(subject.id,{name:event.target.value})}/></td><td>{subject.periods}</td><td><button type="button" onClick={()=>onPlan({...plan,subjects:plan.subjects.filter(item=>item.id!==subject.id),timetable:plan.timetable.filter(cell=>cell.subjectId!==subject.id)})}>ลบ</button></td></tr>)}</tbody></table></div>
      </>}
      {step===5&&<FreeActivityEditor plan={plan} onPlan={onPlan} onDirty={onActivityDirty}/>}
      {step===6&&<><div className="prep-section-heading"><div><h2>กำหนดภาระสอนและล็อกคาบ</h2><p>กำหนดครู จำนวนคาบ และรูปแบบคาบให้แต่ละวิชา</p></div><button type="button" onClick={onTeacher}>ตารางครู / ล็อกคาบไม่ว่าง</button></div>
        <label className="field">ค้นหารหัส ชื่อวิชา หรือห้อง<input type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <details className="local-disclosure"><summary>เพิ่มห้องสถานที่ใช้ร่วม</summary><form className="local-form-grid" onSubmit={event=>{event.preventDefault();if(!place.trim())return;onPlan({...plan,places:[...plan.places,{id:newId(),name:place.trim()}]});setPlace('')}}><label className="field">ชื่อสถานที่<input value={place} onChange={event=>setPlace(event.target.value)}/></label><button type="submit">เพิ่มสถานที่</button></form></details>
        <div className="prep-scroll"><table><thead><tr><th>ห้อง / วิชา</th><th>ครูผู้สอน</th><th>คาบ/สัปดาห์</th><th>รูปแบบคาบ</th><th>สถานที่</th><th>เป้า / จัดแล้ว / เหลือ</th></tr></thead><tbody>{plan.subjects.filter(subject=>`${subject.code} ${subject.name} ${plan.rooms.find(room=>room.id===subject.roomId)?.label}`.toLowerCase().includes(query.toLowerCase())).map(subject=>{
          const placed=plan.timetable.filter(cell=>cell.subjectId===subject.id).length
          return <tr key={subject.id}><td><b>{subject.code} {subject.name}</b><small>{plan.rooms.find(room=>room.id===subject.roomId)?.label}</small></td><td><select aria-label={`ครู ${subject.name}`} value={subject.teacherId} onChange={event=>updateSubject(subject.id,{teacherId:event.target.value})}><option value="">ยังไม่กำหนด</option>{plan.teachers.map(teacher=><option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></td><td><input aria-label={`คาบ ${subject.name}`} type="number" min={1} max={40} value={subject.periods} onChange={event=>{const count=Math.max(1,Math.min(40,Number(event.target.value)||1));updateSubject(subject.id,{periods:count,pattern:patternFor(count,0)})}}/></td><td className="prep-pattern-picker"><LessonPatternPicker count={subject.periods} value={subject.pattern.join("+")} label={subject.name} onChange={value=>updateSubject(subject.id,{pattern:value.split("+").map(Number)})}/></td><td><select aria-label={`สถานที่ ${subject.name}`} value={subject.placeId||''} onChange={event=>updateSubject(subject.id,{placeId:event.target.value||null})}><option value="">ห้องเรียน</option>{plan.places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}</select></td><td>{subject.periods} / {placed} / {Math.max(0,subject.periods-placed)}</td></tr>
        })}</tbody></table></div><p>การกำหนดครูยังไม่ใช่การจัดคาบ “จัดแล้ว” จะเพิ่มหลังยืนยันใช้ฉบับร่าง</p>
        {plan.rooms.filter(room=>roomNeed(plan,room.id)>slotCapacity(plan)).map(room=><p className="prep-error" key={room.id}>{room.label} ต้องการ {roomNeed(plan,room.id)} คาบ แต่มี {slotCapacity(plan)} ช่อง</p>)}
      </>}
      {step===7&&review}
    </fieldset>
    <footer className="prep-wizard-footer"><button type="button" disabled={step===1||busy} onClick={()=>onStep(step-1)}><FiArrowLeft aria-hidden="true"/>ย้อนกลับ</button><span>{step===7?'ตรวจร่างแล้วบันทึกลงเครื่อง ตารางเดิมยังไม่เปลี่ยน':`ถัดไป: ${titles[step]}`}</span>{step<7&&<button type="button" className="prep-primary" disabled={busy} onClick={()=>onStep(step+1)}>ขั้นถัดไป<FiArrowRight aria-hidden="true"/></button>}</footer>
  </section>
}

export function FreePlanBoard({plan,roomId,draft,selected,onSelect}:{plan:FreeWizardPlan;roomId:string;draft:DeviceDraft|null;selected?:string;onSelect?:(day:number,period:number)=>void}) {
  return <div className="board" tabIndex={0} role="region" aria-label="ตารางเรียน เลื่อนเพื่อดูทุกคาบ"><ScheduleGridTable periodTimes={plan.periods} days={plan.days} renderCell={(day,period)=>{
    const cell=cellText(plan,roomId,day,period,draft)
    const content=cell?<><b>{cell.name}</b><small>{cell.detail}</small>{cell.locked&&<small>ล็อก</small>}</>:'ว่าง'
    return onSelect?<button type="button" className={'cell-btn'+(cell?.kind==='activity'?' is-activity':'')} aria-pressed={selected===day+':'+period} onClick={()=>onSelect(day,period)}>{content}</button>:content
  }}/></div>
}
