'use client'
import { useRef, useState } from 'react'
import Swal from 'sweetalert2'
import ActivityAssignmentFields from './ActivityAssignmentFields'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import { activityTeachers, validateActivityTeam, type ActivityTeam } from '@/lib/schedule-activity-teams'
import { freeActivityGroup, newId, teachingRows, type FreeWizardPlan } from '@/lib/schedule-device-free'
import { devicePreparation } from '@/lib/schedule-device-view'

export default function FreeActivityEditor({plan,onPlan,onDirty}:{plan:FreeWizardPlan;onPlan:(plan:FreeWizardPlan)=>void;onDirty:(value:boolean)=>void}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [group,setGroup] = useState<ActivityTeam|null>(null)
  const [name,setName] = useState(''),[error,setError] = useState(''),[pending,setPending] = useState(false),[times,setTimes] = useState(false)
  const data = devicePreparation(plan)
  function open(id?:string) {
    const activity = plan.activities.find(item=>item.id===id)
    setGroup(activity ? freeActivityGroup(activity) : {id:newId(),settingId:'',mode:'joint',roomIds:[],teacherIds:[],roomTeachers:{},weeklyPeriods:1,cells:[]})
    setName(activity?.name||'');setError('');setPending(false);setTimes(!!activity?.cells.length);onDirty(true)
    dialog.current?.showModal()
  }
  function close(){dialog.current?.close();onDirty(false);setGroup(null)}
  async function save(){
    if(!group || pending)return
    try {
      if(!name.trim())throw Error('กรอกชื่อกิจกรรม')
      validateActivityTeam({...group,id:newId(),settingId:group.id},data.classrooms.map(room=>room.id),data.teachers.map(teacher=>teacher.id),[group.id],plan.days,plan.periods)
      const conflicts = group.mode==='separate' && group.cells.length ? plan.teachers.filter(teacher=>group.roomIds.filter(room=>activityTeachers(group,room).includes(teacher.id)).length>1) : []
      if(conflicts.length)throw Error(`ครูรับผิดชอบหลายห้องในคาบเดียวกัน: ${conflicts.map(teacher=>teacher.name).join(', ')} กรุณาใช้ทีมร่วม หรือให้ระบบจัดวันและคาบแยกกัน`)
      const overwritten=plan.timetable.filter(cell=>group.roomIds.includes(cell.classroomId)&&group.cells.some(slot=>slot.day===cell.day&&slot.period===cell.period)&&cell.activityId!==group.id)
      const duplicates=plan.activities.filter(activity=>activity.id!==group.id&&activity.name.trim()===name.trim()&&activity.roomIds.some(room=>group.roomIds.includes(room)))
      if(duplicates.length)throw Error('มีกิจกรรมชื่อนี้ในห้องที่เลือกแล้ว กรุณาแก้ไขรายการเดิม')
      if(overwritten.length) {
        dialog.current?.close()
        const confirmed=await Swal.fire({icon:'warning',title:'แทนที่คาบเดิม?',text:`เปลี่ยน ${overwritten.length} ช่อง${overwritten.some(cell=>cell.locked)?' รวมคาบที่ล็อกไว้':''} ตารางเก่าจะไม่ถูกคืนอัตโนมัติ`,showCancelButton:true,confirmButtonText:'ยืนยันแทนที่',cancelButtonText:'ยกเลิก',confirmButtonColor:'#1373d9'})
        if(!confirmed.isConfirmed){dialog.current?.showModal();return}
      }
      const activity={id:group.id,name:name.trim(),mode:group.mode,roomIds:group.roomIds,teacherId:group.teacherIds[0]||'',teacherIds:group.teacherIds,roomTeachers:Object.fromEntries(group.roomIds.map(room=>[room,activityTeachers(group,room)[0]||''])),roomTeacherIds:group.roomTeachers,weeklyPeriods:group.weeklyPeriods,cells:group.cells}
      onPlan({...plan,activities:[...plan.activities.filter(item=>item.id!==group.id),activity],timetable:plan.timetable.filter(cell=>cell.activityId!==group.id&&!overwritten.includes(cell))})
      close()
    }catch(cause){setError(cause instanceof Error?cause.message:'บันทึกไม่ได้')}
  }
  return <div className="prep-activity-editor">
    <div className="prep-section-heading"><div><h2>กิจกรรมและครูผู้รับผิดชอบ</h2><p>เลือกหลายชั้น/ห้องและทีมครู เว้นวันไว้เพื่อให้ระบบจัดอัตโนมัติ</p></div><button type="button" className="prep-primary" onClick={()=>open()}>+ เพิ่มการจัดกิจกรรม</button></div>
    <div className="local-activity-list">{plan.activities.map(activity=><article key={activity.id}><h3>{activity.name}</h3><p>{activity.roomIds.map(id=>plan.rooms.find(room=>room.id===id)?.label).join(' · ')}</p><p>{activity.weeklyPeriods??activity.cells.length} คาบ/สัปดาห์ · {activity.mode==='joint'?'ทีมร่วม จัดพร้อมกัน':'ทีมแยกตามห้อง'} · {activity.cells.length?'กำหนดวันและคาบแล้ว':'จัดวันและคาบอัตโนมัติ'}</p><div className="actions"><button type="button" onClick={()=>open(activity.id)}>แก้ไข</button><button type="button" onClick={async()=>{if((await Swal.fire({icon:'warning',title:`นำ ${activity.name} ออกจากตาราง?`,text:'นำกิจกรรมและคาบกิจกรรมนี้ออก ไม่คืนวิชาเดิม',showCancelButton:true,confirmButtonText:'นำออก',cancelButtonText:'ยกเลิก'})).isConfirmed)onPlan({...plan,activities:plan.activities.filter(item=>item.id!==activity.id),timetable:plan.timetable.filter(cell=>cell.activityId!==activity.id)})}}>นำออก</button></div></article>)}</div>
    {!plan.activities.length&&<p className="local-empty">ยังไม่มีกิจกรรม เพิ่มได้หรือข้ามขั้นนี้</p>}
    <dialog ref={dialog} className="prep-activity-dialog activity-assignment-dialog" onCancel={event=>{event.preventDefault();close()}}>
      <div className="local-dialog-head"><div><h2>กำหนดกิจกรรมให้ชั้น/ห้อง</h2><small>เก็บข้อมูลบนเครื่องนี้</small></div><button type="button" onClick={close}>ปิด</button></div>
      <div className="local-dialog-body">{group&&<>
        <section className="prep-activity-block"><h3>1 กิจกรรม</h3><div className="local-form-grid"><label className="field">ชื่อกิจกรรม<input value={name} onChange={event=>setName(event.target.value)} placeholder="เช่น ลูกเสือ / แนะแนว"/></label><label className="field">คาบต่อสัปดาห์<input type="number" min={1} max={8} value={group.weeklyPeriods} onChange={event=>setGroup({...group,weeklyPeriods:Number(event.target.value)})}/></label></div></section>
        <ActivityAssignmentFields classrooms={data.classrooms} teachers={data.teachers} eligibleTeacherIds={data.teachers.map(teacher=>teacher.id)} draft={group} onChange={patch=>setGroup({...group,...patch})} onPendingChange={setPending}/>
        <section className="prep-activity-block"><label><input type="checkbox" checked={times} onChange={event=>{setTimes(event.target.checked);if(!event.target.checked)setGroup({...group,cells:[]})}}/>กำหนดวันและคาบเอง</label>{!times?<p>ระบบจะเลือกวันและคาบให้ตามเงื่อนไขของครูและห้อง</p>:<div className="prep-scroll"><table><thead><tr><th>วัน</th>{teachingRows(plan.periods).map(row=><th key={row.period}>คาบ {row.period}</th>)}</tr></thead><tbody>{SCHEDULE_DAYS.filter(day=>plan.days.includes(day.value)).map(day=><tr key={day.value}><th>{day.label}</th>{teachingRows(plan.periods).map(row=><td key={row.period}><input type="checkbox" aria-label={`${day.label} คาบ ${row.period}`} checked={group.cells.some(cell=>cell.day===day.value&&cell.period===row.period)} onChange={()=>setGroup({...group,cells:group.cells.some(cell=>cell.day===day.value&&cell.period===row.period)?group.cells.filter(cell=>!(cell.day===day.value&&cell.period===row.period)):[...group.cells,{day:day.value,period:row.period}]})}/></td>)}</tr>)}</tbody></table></div>}</section>
        {error&&<p className="prep-error" role="alert">{error}</p>}
      </>}</div><footer className="local-dialog-footer"><span>{group?.roomIds.length||0} ห้อง · {group?.weeklyPeriods||0} คาบ/สัปดาห์</span><button type="button" onClick={close}>ยกเลิก</button><button type="button" className="prep-primary" disabled={pending||!group?.roomIds.length||!name.trim()} onClick={()=>void save()}>บันทึกกิจกรรม</button></footer>
    </dialog>
  </div>
}
