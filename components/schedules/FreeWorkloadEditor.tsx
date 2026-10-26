'use client'
import {applyJointTeachingLock,prepareJointTeachingSession} from '@/lib/schedule-joint-lock'
import {localDraftCells} from '@/lib/schedule-device-view'
import { useEffect,useRef } from 'react'
import WorkloadEditor, {type WorkloadChange,type WorkloadOperations} from './WorkloadEditor'
import {devicePreparation,devicePreflight} from '@/lib/schedule-device-view'
import {changeDeviceCell,lockDeviceCell,blockDeviceTeacher} from '@/lib/schedule-device-operations'
import {validateJointTeachingGroups,jointTeachingSlotErrors} from '@/lib/schedule-joint-teaching'
import type {FreeWizardPlan} from '@/lib/schedule-device-free'

export default function FreeWorkloadEditor({plan,onPlan,busy}:{plan:FreeWizardPlan;onPlan:(plan:FreeWizardPlan)=>void|boolean|Promise<void|boolean>;busy:boolean}){
  const latest=useRef(plan);useEffect(()=>{latest.current=plan},[plan])
  const data=devicePreparation(plan)
  async function save(next:FreeWizardPlan){
    const data=devicePreparation(next)
    validateJointTeachingGroups(next.teachingGroups,data.lessons)
    const errors=jointTeachingSlotErrors(data.lessons,next.timetable.map(cell=>({classroomId:cell.classroomId,lessonId:cell.subjectId||null,day:cell.day,period:cell.period,locked:!!cell.locked})))
    if(errors.length)throw Error(errors[0])
    const result=await onPlan(next)
    if(result===false)throw Error('บันทึกลงเครื่องไม่สำเร็จ กรุณาลองใหม่หรือดาวน์โหลดสำเนา')
    latest.current=next
  }
  async function commit(change:WorkloadChange){
    const current=latest.current,assignments=new Map(change.assignments.map(row=>[row.lessonId,row.teacherId])),rules=new Map(change.rules?.map(row=>[row.lessonId,row.value]))
    const next={...current,places:change.places||current.places,subjects:current.subjects.map(subject=>{const rule=rules.get(subject.id);return {...subject,teacherId:assignments.get(subject.id)??subject.teacherId,...(rule?{periods:rule.count,pattern:rule.pattern,placeId:rule.roomId,spread:rule.spread,timePreference:rule.timePreference||(rule.morning?'morning':'any')}:{} )}})}
    const conflicts=devicePreflight(next,next.rooms.map(room=>room.id),false).filter(issue=>issue.severity==='error'&&issue.code?.startsWith('fixed_'))
    if(conflicts.length)throw Error(conflicts[0].message)
    await save(next)
  }
  const attempt=async(work:()=>Promise<void>)=>{try{await work();return {error:null}}catch(error){return {error:error instanceof Error?error.message:'บันทึกไม่สำเร็จ'}}}
  const operations:WorkloadOperations={
    setJointTeachingScheduleCell:(_year,_term,request)=>attempt(async()=>{const changed=request.lessonIds?prepareJointTeachingSession(devicePreparation(latest.current),request,_year):null;const rows=changed?.rows||applyJointTeachingLock(devicePreparation(latest.current),request,_year);await save({...latest.current,teachingGroups:changed?.plan.teachingGroups||latest.current.teachingGroups,timetable:localDraftCells({status:'complete',issues:[],rows,offerings:[],unlock:[],assigned:0,locked:0})})}),
    saveClassScheduleCell:(room,_year,day,period,lesson,_note,_term,expected)=>attempt(()=>save(changeDeviceCell(latest.current,room,day,period,lesson,expected))),
    toggleScheduleCellLock:(room,_year,day,period)=>attempt(()=>save(lockDeviceCell(latest.current,room,day,period))),
    setTeacherAvailabilityBlock:(_year,_term,teacher,day,period,blocked)=>attempt(()=>save(blockDeviceTeacher(latest.current,teacher,day,period,blocked))),
    editTeacherScheduleCell:(_year,_term,teacher,room,day,period,expected,lesson)=>attempt(async()=>{
      const target=lesson?latest.current.subjects.find(subject=>subject.id===lesson):latest.current.subjects.find(subject=>subject.id===expected)
      if(!target||target.teacherId!==teacher||target.roomId!==room)throw Error('รายวิชาไม่ใช่ภาระสอนของครูคนนี้')
      await save(changeDeviceCell(latest.current,room,day,period,lesson,expected))
    }),
  }
  const teaching=data.lessons.filter(lesson=>!lesson.activity)
  const ready=teaching.length>0&&teaching.every(lesson=>plan.teachers.some(teacher=>teacher.id===lesson.teacherId)&&lesson.count>0&&lesson.pattern?.reduce((sum,size)=>sum+size,0)===lesson.count)
  return <WorkloadEditor snapshotHash={data.hash} teachingGroups={plan.teachingGroups||[]} onTeachingGroupsChange={groups=>save({...latest.current,teachingGroups:groups})} classrooms={data.classrooms} lessons={teaching} teachers={data.teachers} rules={data.plan.rules} teacherAssignments={{}} slots={data.slots} places={data.plan.rooms} blocks={data.blocks} days={data.plan.days} periods={data.periods} year="local" term={1} busy={busy} ready={ready} onCommit={commit} onRefresh={async()=>{}} operations={operations}/>
}
