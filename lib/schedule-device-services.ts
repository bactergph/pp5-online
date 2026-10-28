import {applyJointTeachingLock,prepareJointTeachingSession,prepareJointTeachingCancellation} from './schedule-joint-lock'
import type { ScheduleOperations } from '../components/schedules/ScheduleServices'
import { activityTeachers, activityTeamKeepsSchedule, activityWeeklyPeriods, lessonTeachers, validateActivityTeam, type ActivityTeam } from './schedule-activity-teams'
import { validateSubjectInputs } from './schedule-input'
import { validatePeriodTimes } from './schedule-helpers'
import {validateJointTeachingGroups,jointTeachingSlotErrors,teachingEventAt,teachingQuotaParts} from './schedule-joint-teaching'
import { validatePlan } from './schedule-planning'
import { freeActivityGroup, freeActivityTeachers, newId, toDeviceSnapshot, type FreeActivity, type FreeWizardPlan } from './schedule-device-free'
import {freeTeacherLimit as resolveTeacherLimit} from './free-schedule-entitlement'
import { deviceDataKey, deviceDraftView, devicePreparation, devicePreflight, localDraftCells } from './schedule-device-view'
import {scheduleTeachingView} from './schedule-teaching-view'
import { deviceDisplaySchedule, deviceDocumentPages, deviceWorkload } from './schedule-device-documents'
import { deviceYear, type LocalScheduleBundle } from './schedule-device-years'
import { blockDeviceTeacher, changeDeviceCell, clearDeviceCells, deviceActivityAt, lockDeviceCell, moveDeviceCell, removeDeviceSubjectCell } from './schedule-device-operations'
import { solveScheduleOnDevice } from './schedule-device-run'
import type { DeviceDraft } from './schedule-device-build'
import type { FreeSubstituteEntry } from '../components/schedules/FreeSubstituteDesk'
import { availableSubstitutes } from './substitute-availability'
import {pageSubstituteHistory,validateSubstituteHistoryScope} from './substitute-history'
import {substituteRosterSnapshot,validateSubstituteRoster,validateSubstituteAcknowledgements,type SubstituteBusy} from './substitute-roster'
import { SCHEDULE_DAYS } from './schedules'
import { verifyCompleteSchedule } from './schedule-verification'
import { applySchedulePlaceChange } from './schedule-places'
import { prepareSubjectDetails } from './schedule-subject-details'
import { planScheduleClear, scheduleClearRooms } from './schedule-clear'

type Options = { read:()=>LocalScheduleBundle; write:(bundle:LocalScheduleBundle)=>Promise<boolean>; onComputing?:(controller:AbortController|null)=>void; teacherLimit?:number|(()=>number) }
type Plan = LocalScheduleBundle['terms'][1]
const failure = (error:unknown)=>({error:error instanceof Error?error.message:'บันทึกลงเครื่องไม่สำเร็จ',data:null})
const outcome = async<T,>(work:()=>Promise<T>)=>{try{return {data:await work(),error:null}}catch(error){return failure(error)}}

/** The online screens depend on this interface, never on a database implementation.
 * Every mutation here is serialized, verified, and acknowledged only after IndexedDB commits. */
export function createDeviceScheduleServices({read,write,onComputing,teacherLimit}:Options): ScheduleOperations {
  const currentTeacherLimit=()=>resolveTeacherLimit(typeof teacherLimit==='function'?teacherLimit():teacherLimit)
  let queue=Promise.resolve<unknown>(null)
  let selectedYear='', selectedTerm=1
  const drafts=new Map<string,{year:string;term:number;base:string;draft:DeviceDraft;rooms:string[]}>()
  function plan(year=selectedYear||deviceYear(read()),term=selectedTerm):Plan {
    if(term!==1&&term!==2)throw Error('เลือกภาคเรียน 1 หรือ 2')
    const bundle=read(),workspace=year===deviceYear(bundle)?bundle:bundle.archives?.[year]
    if(!workspace)throw Error('ไม่พบปีการศึกษาในเครื่องนี้')
    return workspace.terms[term]
  }
  const preparation=(year:string,term:number)=>{selectedYear=year;selectedTerm=term;return devicePreparation(plan(year,term))}
  function stale(current:FreeWizardPlan,hash:string){if(hash!==deviceDataKey(current))throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')}
  function fixed(next:FreeWizardPlan){const issue=devicePreflight(next,next.rooms.map(room=>room.id),false).find(issue=>issue.severity==='error'&&issue.code?.startsWith('fixed_'));if(issue)throw Error(issue.message)}
  async function put(year:string,term:number,next:FreeWizardPlan) {
    const snapshot=toDeviceSnapshot(next,[])
    validateJointTeachingGroups(next.teachingGroups,snapshot.lessons)
    const syncErrors=jointTeachingSlotErrors(snapshot.lessons,next.timetable.map(cell=>({classroomId:cell.classroomId,lessonId:cell.subjectId||null,day:cell.day,period:cell.period,locked:!!cell.locked})))
    if(syncErrors.length)throw Error(syncErrors[0])
    const current=read(),workspace=year===deviceYear(current)?current:current.archives?.[year]
    if(!workspace)throw Error('ไม่พบปีการศึกษา')
    const other=term===1?2:1,old=workspace.terms[term as 1|2],sibling=workspace.terms[other]
    if(next.teachers.length>currentTeacherLimit()&&next.teachers.length>old.teachers.length)throw Error(`จัดตารางฟรีรองรับครูสูงสุด ${currentTeacherLimit()} คน`)
    const removedRooms=old.rooms.filter(room=>!next.rooms.some(item=>item.id===room.id)).map(room=>room.id)
    for(const target of [next,sibling]) {
      if(target.subjects.some(subject=>removedRooms.includes(subject.roomId))||target.activities.some(activity=>activity.roomIds.some(id=>removedRooms.includes(id)))||target.timetable.some(cell=>removedRooms.includes(cell.classroomId))||Object.values(target.substitutes||{}).flat().some(row=>removedRooms.includes(row.roomId)))throw Error('ห้องที่ลบยังมีรายวิชา กิจกรรม ตาราง หรือรายการสอนแทนอยู่')
      const missing=(day:number,period:number)=>!next.days.includes(day)||!next.periods.some(row=>!row.is_break&&row.period===period)
      if(target.timetable.some(cell=>missing(cell.day,cell.period))||target.blocks.some(cell=>missing(cell.day,cell.period))||target.activities.some(activity=>activity.cells.some(cell=>missing(cell.day,cell.period))))throw Error('มีตาราง กิจกรรม หรือคาบไม่ว่างใช้วันและเวลานี้อยู่ กรุณานำออกก่อนลดคาบ')
    }
    const activityCatalog=next.activityCatalog||[]
    const terms={...workspace.terms,[term]:{...next,substitutes:next.substitutes||{}},[other]:{...sibling,teachers:next.teachers,teacherIds:sibling.teacherIds?.filter(id=>next.teachers.some(teacher=>teacher.id===id)),blocks:sibling.blocks.filter(block=>next.teachers.some(teacher=>teacher.id===block.teacherId)),rooms:next.rooms,places:next.places,days:next.days,periods:next.periods,activityCatalog,activities:sibling.activities.map(activity=>({...activity,name:activityCatalog.find(item=>item.id===(activity.settingId||activity.id))?.label||activity.name}))}}
    const bundle=year===deviceYear(current)?{...current,terms,semester:term as 1|2}:{...current,archives:{...current.archives,[year]:{...workspace,terms}}}
    if(!await write(bundle))throw Error('ยังไม่ได้บันทึกลงเครื่อง กรุณาดาวน์โหลดสำเนาก่อนปิดหน้านี้')
    return devicePreparation(next)
  }
  function mutate<T>(year:string,term:number,work:(current:Plan)=>Promise<T>):Promise<T> {
    const pending=queue.then(()=>work(structuredClone(plan(year,term))))
    queue=pending.catch(()=>null);return pending
  }
  const key=(year:string,term:number,date:string)=>`${year}:${term}:${date}`
  function dayKey(id:string){const [year,term,...rest]=id.split(':');const date=rest.join(':');weekday(date);return {year,term:Number(term),date}}
  function weekday(date:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('วันที่ไม่ถูกต้อง');return new Date(date+'T12:00:00+07:00').getUTCDay()||7}
  function allCells(current:FreeWizardPlan) {
    const cells=[...current.timetable]
    for(const activity of current.activities)for(const room of activity.roomIds)for(const cell of activity.cells) {
      const index=cells.findIndex(row=>row.classroomId===room&&row.day===cell.day&&row.period===cell.period)
      const entry={classroomId:room,...cell,subjectId:'',activityId:activity.id,locked:cells[index]?.locked||false}
      if(index<0)cells.push(entry);else cells[index]=entry
    }
    return cells
  }
  const lessonId=(cell:FreeWizardPlan['timetable'][number])=>cell.activityId?`activity:${cell.activityId}:${cell.classroomId}`:cell.subjectId||null
  function classBundle(year:string,term:number,room:string) {
    const current=plan(year,term),data=preparation(year,term)
    if(!current.rooms.some(item=>item.id===room))throw Error('ไม่พบห้องเรียน')
    const grid:Record<string,{class_subject_id:string|null;expected_lesson_id:string|null;note:string|null;locked:boolean}>={}
    for(const cell of allCells(current).filter(cell=>cell.classroomId===room))grid[`${cell.day}-${cell.period}`]={class_subject_id:lessonId(cell),expected_lesson_id:lessonId(cell),note:null,locked:!!cell.locked}
    const subjects=data.lessons.filter(lesson=>lesson.classroomId===room).map(lesson=>({id:lesson.id,teacher_id:lesson.teacherId,subject_code:lesson.code,subject_name:lesson.name,teacher_name:lesson.teacherName,room_name:lesson.roomName||'',label:lesson.label,activity:!!lesson.activity}))
    const items=data.lessons.filter(lesson=>lesson.classroomId===room&&!lesson.activity).map(lesson=>{const used=current.timetable.filter(cell=>cell.subjectId===lesson.id).length;return {class_subject_id:lesson.id,code:lesson.code,name:lesson.name,target:lesson.count,used,remaining:lesson.count-used}})
    const warnings:Record<string,string[]>={}
    for(const [position,cell] of Object.entries(grid)) {
      const lesson=data.lessons.find(item=>item.id===cell.class_subject_id)
      if(!lesson)continue
      const [day,period]=position.split('-').map(Number)
      const conflicts=busyCells(current).filter(other=>other.day===day&&other.period===period&&other.classroomId!==room&&lessonTeachers(lesson).includes(other.teacherId)&&other.group!==teachingEventAt(lesson,day,period))
      if(conflicts.length)warnings[position]=[...new Set(conflicts.map(other=>current.rooms.find(item=>item.id===other.classroomId)?.label||''))]
    }
    return {grid,subjects,warnings,quotas:{items,filled:items.reduce((sum,item)=>sum+item.used,0),totalTarget:items.reduce((sum,item)=>sum+item.target,0)}}
  }
  function busyCells(current:FreeWizardPlan) {
    const data=devicePreparation(current)
    return allCells(current).flatMap(cell=>{const lesson=data.lessons.find(item=>item.id===lessonId(cell));return lesson?lessonTeachers(lesson).map(teacherId=>({teacherId,day:cell.day,period:cell.period,label:[lesson.label,lesson.roomName].filter(Boolean).join(' · '),classroomId:cell.classroomId,lessonId:lesson.id,locked:!!cell.locked,group:teachingEventAt(lesson,cell.day,cell.period)})):[]})
  }
  function activityImpact(current:FreeWizardPlan,hash:string,group:ActivityTeam,remove=false) {
    stale(current,hash)
    const old=current.activities.find(item=>item.id===group.id)
    if(remove&&!old)throw Error('ไม่พบทีมกิจกรรม')
    if(!remove)validateActivityTeam(group,current.rooms.map(room=>room.id),current.teacherIds??current.teachers.map(t=>t.id),(current.activityCatalog||[]).map(item=>item.id),current.days,current.periods)
    const overwrites=remove?[]:current.activities.filter(item=>item.id!==group.id&&(item.settingId||item.id)===group.settingId&&item.roomIds.some(id=>group.roomIds.includes(id))).map(item=>({rooms:item.roomIds.filter(id=>group.roomIds.includes(id)).map(roomId=>({roomId,previous:freeActivityTeachers(item,roomId),next:activityTeachers(group,roomId),duplicates:freeActivityTeachers(item,roomId).filter(id=>activityTeachers(group,roomId).includes(id))}))}))
    const affected=!remove&&activityTeamKeepsSchedule(old?freeActivityGroup(old):undefined,group)?[]:current.timetable.filter(cell=>!!old&&cell.activityId===old.id||!remove&&group.roomIds.includes(cell.classroomId)&&(group.cells.some(target=>target.day===cell.day&&target.period===cell.period)||current.activities.some(item=>item.id===cell.activityId&&(item.settingId||item.id)===group.settingId)))
    return {affected:affected.length,locked:affected.filter(cell=>cell.locked).length,hash:deviceDataKey(current),overwrites}
  }
  const saveActivity=(year:string,term:number,hash:string,group:ActivityTeam,remove=false,unlock=false,overwrite=false)=>mutate(year,term,async current=>{
    const impact=activityImpact(current,hash,group,remove)
    if(impact.locked&&!unlock)throw Error('ต้องยืนยันแทนที่คาบล็อกโดยเฉพาะ')
    if(impact.overwrites.length&&!overwrite)throw Error('ยืนยันบันทึกทับทีมครูกิจกรรมก่อน')
    const catalog=current.activityCatalog?.find(item=>item.id===group.settingId)
    const activities=current.activities.filter(item=>item.id!==group.id).map(item=>{
      if(remove||(item.settingId||item.id)!==group.settingId)return item
      const roomIds=item.roomIds.filter(id=>!group.roomIds.includes(id))
      return {...item,roomIds,roomTeachers:Object.fromEntries(Object.entries(item.roomTeachers).filter(([id])=>roomIds.includes(id))),roomTeacherIds:Object.fromEntries(Object.entries(item.roomTeacherIds||{}).filter(([id])=>roomIds.includes(id)))}
    }).filter(item=>item.roomIds.length)
    if(!remove)activities.push({id:group.id,settingId:group.settingId,name:catalog?.label||'กิจกรรม',mode:group.mode,roomIds:group.roomIds,teacherId:group.teacherIds[0]||'',teacherIds:group.teacherIds,roomTeachers:Object.fromEntries(Object.entries(group.roomTeachers).map(([id,ids])=>[id,ids[0]||''])),roomTeacherIds:group.roomTeachers,weeklyPeriods:group.weeklyPeriods,cells:group.cells} satisfies FreeActivity)
    const old=current.activities.find(item=>item.id===group.id)
    const timetable=!remove&&activityTeamKeepsSchedule(old?freeActivityGroup(old):undefined,group)?current.timetable:current.timetable.filter(cell=>{
      if(cell.activityId===group.id)return false
      if(remove)return true
      if(!group.roomIds.includes(cell.classroomId))return true
      if(group.cells.some(target=>target.day===cell.day&&target.period===cell.period))return false
      return !current.activities.some(item=>item.id===cell.activityId&&(item.settingId||item.id)===group.settingId)
    })
    const next={...current,activities,timetable};fixed(next);return put(year,term,next)
  })
  const externalEntry=(entry:FreeSubstituteEntry)=>({id:entry.id,absent_teacher_id:entry.absentTeacherId,period:entry.period,class_subject_id:entry.subjectId||null,classroom_id:entry.roomId||null,subject_label:entry.subjectLabel,room_label:entry.roomLabel,substitute_teacher_id:entry.substituteTeacherId,leave_type:entry.leaveType,note:entry.note,override_conflicts:entry.overrideConflicts===true,conflict_details:entry.conflictDetails||[],conflict_confirmed_at:entry.conflictConfirmedAt||null})
  function rosterBusy(current:FreeWizardPlan,day:number):SubstituteBusy[] {
    const lessons=devicePreparation(current).lessons
    return [...current.blocks.filter(row=>row.day===day).map(row=>({teacherId:row.teacherId,period:row.period,kind:'block' as const})),
      ...busyCells(current).filter(row=>row.day===day).map(row=>{const lesson=lessons.find(lesson=>lesson.id===row.lessonId);return {teacherId:row.teacherId,period:row.period,kind:row.lessonId.startsWith('activity:')?'activity' as const:'lesson' as const,label:lesson?`${lesson.code||''} ${lesson.name}`.trim():row.label,roomLabel:current.rooms.find(room=>room.id===row.classroomId)?.label||''}})]
  }
  function teacherSlots(date:string,year:string,teacher:string,term:number) {
    const current=plan(year,term),data=devicePreparation(current),day=weekday(date)
    return allCells(current).filter(cell=>cell.day===day).flatMap(cell=>{
      const lesson=data.lessons.find(item=>item.id===lessonId(cell))
      return lesson&&lessonTeachers(lesson).includes(teacher)?[{period:cell.period,class_subject_id:lesson.activity?null:lesson.id,classroom_id:cell.classroomId,room_label:current.rooms.find(item=>item.id===cell.classroomId)?.label||'',subject_label:`${lesson.code} ${lesson.name}`.trim()}]:[]
    }).sort((a,b)=>a.period-b.period)
  }
  function exportContext() {
    const current=plan(),document=current.document
    return {school:{name:document?.schoolName||'โรงเรียน',logo_url:document?.logoDataUrl||null,academic_head_name:document?.academicHeadName||'',director_name:document?.directorName||'',director_prefix:'',director_position:'ผู้อำนวยการสถานศึกษา',acting_director:null,acting_director_position:null},periodTimes:current.periods}
  }
  const services:ScheduleOperations={
    localTeachers:{
      get limit(){return currentTeacherLimit()},
      save:(id,prefix,name,position)=>outcome(()=>mutate(selectedYear,selectedTerm,async current=>{
        if(!name.trim()||name.length>200||prefix.length>30||position.length>100||!current.teachers.some(teacher=>teacher.id===id))throw Error('ตรวจชื่อครู คำนำหน้า และตำแหน่ง')
        const label=`${prefix.trim()} ${name.trim()}`.trim()
        if(current.teachers.some(teacher=>teacher.id!==id&&teacher.name===label))throw Error('มีครูชื่อนี้แล้ว กรุณาตรวจรายชื่อเดิม')
        await put(selectedYear,selectedTerm,{...current,teachers:current.teachers.map(teacher=>teacher.id===id?{...teacher,name:label,prefix:prefix.trim(),fullName:name.trim(),position:position.trim()}:teacher)})
      })),
      remove:ids=>outcome(()=>mutate(selectedYear,selectedTerm,async current=>{
        for(const target of [current,plan(selectedYear,selectedTerm===1?2:1)])if(target.subjects.some(subject=>ids.includes(subject.teacherId))||target.activities.some(activity=>activity.roomIds.some(room=>freeActivityTeachers(activity,room).some(id=>ids.includes(id))))||Object.values(target.substitutes||{}).flat().some(entry=>ids.includes(entry.absentTeacherId)||!!entry.substituteTeacherId&&ids.includes(entry.substituteTeacherId)))throw Error('ครูที่เลือกยังมีภาระสอน กิจกรรม หรือสอนแทนอยู่ กรุณาเปลี่ยนผู้รับผิดชอบก่อนลบ')
        await put(selectedYear,selectedTerm,{...current,teachers:current.teachers.filter(teacher=>!ids.includes(teacher.id)),teacherIds:current.teacherIds?.filter(id=>!ids.includes(id)),blocks:current.blocks.filter(block=>!ids.includes(block.teacherId))})
      })),
    },
    fetchScheduleInit:async()=>{
      const bundle=read(),year=deviceYear(bundle)
      selectedYear=year;selectedTerm=bundle.semester
      return {canEdit:true,role:'admin',homeroomClassroomIds:[],defaultSemester:bundle.semester,defaultTeacherId:plan().teachers[0]?.id||null,years:[year,...Object.keys(bundle.archives||{})].sort().reverse().map(id=>({id,year_be:Number(id),is_active:id===year,term1_start_date:null,term1_end_date:null,term2_start_date:null,term2_end_date:null})),teachers:devicePreparation(plan()).teachers}
    },
    fetchPreparation:async(year,term)=>outcome(async()=>preparation(year,term)),
    fetchScheduleDays:async(year,term=1)=>plan(year,term).days,
    fetchPeriodTimes:async()=>({times:plan().periods,isDefault:false}),
    savePeriodTimes:async periods=>{const error=validatePeriodTimes(periods);if(error)throw Error(error);await mutate(selectedYear,selectedTerm,current=>put(selectedYear,selectedTerm,{...current,periods}));return {ok:true}},
    fetchScheduleClassrooms:async year=>devicePreparation(plan(year)).classrooms.map(room=>({...room,label:`${room.level}/${room.name}`})),
    saveTimetableClassrooms:(year,term,levels)=>outcome(()=>mutate(year,term,async current=>{
      if(new Set(levels.map(level=>level.level)).size!==levels.length)throw Error('มีระดับชั้นซ้ำในข้อมูลที่กำลังบันทึก')
      const rooms=levels.flatMap(level=>{
        if(new Set(level.names.map(name=>name.trim().toLowerCase())).size!==level.names.length||level.names.length>30||level.names.some(name=>!name.trim()||name.length>20))throw Error('ชื่อห้องซ้ำหรือไม่ถูกต้อง')
        const previous=current.rooms.filter(room=>room.label.split('/')[0]===level.level)
        return level.names.map((name,index)=>({id:previous[index]?.id||newId(),label:`${level.level}/${name.trim()}`}))
      })
      await put(year,term,{...current,rooms});return {created:rooms.filter(room=>!current.rooms.some(item=>item.id===room.id)).length,deleted:current.rooms.filter(room=>!rooms.some(item=>item.id===room.id)).length}
    })),
    saveScheduleInputTeachers:(year,term,rows)=>outcome(()=>mutate(year,term,async current=>{
      const teachers=[...current.teachers],results:{key:string;id:string;error?:string}[]=[]
      if(!rows.length||rows.length>50)throw Error('เพิ่มครูได้ครั้งละ 1–50 คน')
      for(const row of rows){
        if(!row.name.trim()||row.name.length>200||row.prefix.length>30||row.position.length>100)throw Error('กรอกชื่อครูและตำแหน่งให้ถูกต้อง')
        const name=`${row.prefix.trim()} ${row.name.trim()}`.trim()
        let teacher=teachers.find(item=>item.name===name)
        if(!teacher){teacher={id:newId(),name,prefix:row.prefix.trim(),fullName:row.name.trim(),position:row.position.trim()};teachers.push(teacher)}
        results.push({key:row.key,id:teacher.id})
      }
      // Reject an oversized import atomically; never truncate the submitted names.
      if(teachers.length>currentTeacherLimit())throw Error(`จัดตารางฟรีรองรับครูสูงสุด ${currentTeacherLimit()} คน (ชุดนี้รวม ${teachers.length} คน เกิน ${teachers.length-currentTeacherLimit()} คน) กรุณาลดรายชื่อก่อนบันทึก`)
      await put(year,term,{...current,teachers});return {results,reused:rows.length-(teachers.length-current.teachers.length)}
    })),
    saveScheduleInputSubjects:(year,term,hash,rows)=>outcome(()=>mutate(year,term,async current=>{
      stale(current,hash);validateSubjectInputs(rows)
      const subjects=[...current.subjects],places=[...current.places]
      for(const row of rows){
        if(!current.rooms.some(room=>room.id===row.classroomId))throw Error('ไม่พบห้องนักเรียน')
        const index=subjects.findIndex(item=>item.roomId===row.classroomId&&item.code.trim().toLowerCase()===row.code.trim().toLowerCase()),old=subjects[index]
        let place=places.find(item=>item.name===row.venue.trim())
        if(row.venue.trim()&&!place){place={id:newId(),name:row.venue.trim()};places.push(place)}
        const subject={...old,id:old?.id||newId(),roomId:row.classroomId,code:row.code.trim(),name:row.name.trim(),teacherId:old?.teacherId||row.teacherId||'',periods:row.count,pattern:row.pattern,placeId:place?.id||old?.placeId||null,subjectGroup:row.group,subjectType:row.type}
        if(index<0)subjects.push(subject);else subjects[index]=subject
      }
      const next={...current,subjects,places};fixed(next);await put(year,term,next);return preparation(year,term)
    })),
    saveScheduleSubjectDetails:(year,term,hash,lessonId,input)=>outcome(()=>mutate(year,term,async current=>{
      stale(current,hash)
      const {details,rule,teacherId}=prepareSubjectDetails(devicePreparation(current),lessonId,input)
      const next={...current,subjects:current.subjects.map(subject=>subject.id===lessonId?{...subject,code:details.code,name:details.name,shortName:details.shortName,subjectGroup:details.group,subjectType:details.type,periods:rule.count,pattern:rule.pattern,teacherId:teacherId||''}:subject)}
      await put(year,term,next);return preparation(year,term)
    })),
    removeScheduleInputSubjects:(year,term,hash,ids)=>outcome(()=>mutate(year,term,async current=>{
      stale(current,hash)
      if(ids.some(id=>!current.subjects.some(subject=>subject.id===id)))throw Error('ไม่พบรายวิชาที่ต้องการลบ')
      if(current.timetable.some(cell=>ids.includes(cell.subjectId)))throw Error('รายวิชานี้มีคาบอยู่ในตารางแล้ว กรุณานำคาบออกก่อน')
      await put(year,term,{...current,subjects:current.subjects.filter(subject=>!ids.includes(subject.id))});return preparation(year,term)
    })),
    saveSchedulePlaces:(year,term,hash,change)=>outcome(()=>mutate(year,term,async current=>{
      stale(current,hash)
      const config=applySchedulePlaceChange(devicePreparation(current),change)
      if(change.kind==='remove'&&plan(year,term===1?2:1).subjects.some(subject=>subject.placeId===change.id))throw Error(`สถานที่นี้ยังใช้ในภาคเรียนที่ ${term===1?2:1} กรุณาเปลี่ยนสถานที่ในภาคเรียนนั้นก่อนลบ`)
      const next={...current,places:config.rooms,subjects:current.subjects.map(subject=>({...subject,placeId:config.rules[subject.id]?.roomId??(config.rules[subject.id]?null:subject.placeId)}))}
      return put(year,term,next)
    })),
    setJointTeachingScheduleCell:(year,term,request)=>outcome(()=>mutate(year,term,async current=>{
      const changed=request.cancelGroup?prepareJointTeachingCancellation(devicePreparation(current),request):request.lessonIds?prepareJointTeachingSession(devicePreparation(current),request,year):null
      const rows=changed?.rows||applyJointTeachingLock(devicePreparation(current),request,year)
      const next={...current,teachingGroups:changed?.plan.teachingGroups||current.teachingGroups,timetable:localDraftCells({status:'complete',issues:[],rows,offerings:[],unlock:[],assigned:0,locked:0})}
      fixed(next);await put(year,term,next);return {rooms:request.expected.length}
    })),
    savePreparation:(year,term,hash,config)=>outcome(()=>mutate(year,term,async current=>{
      stale(current,hash);validatePlan(config,current.subjects.map(subject=>subject.id))
      if(deviceDataKey(config.activityGroups||[])!==deviceDataKey(current.activities.map(freeActivityGroup)))throw Error('แก้ทีมครูผ่านเมนูกิจกรรม')
      if(config.teacherIds?.some(id=>!current.teachers.some(teacher=>teacher.id===id)))throw Error('ไม่พบครูที่เลือก')
      const next={...current,teachingGroups:config.teachingGroups,days:config.days,teacherIds:config.teacherIds,places:config.rooms,reduceGaps:config.reduceGaps,maxContinuous:config.maxContinuous,subjects:current.subjects.map(subject=>{const rule=config.rules[subject.id];return rule?{...subject,periods:rule.count,pattern:rule.pattern,placeId:rule.roomId,spread:rule.spread,timePreference:rule.timePreference||(rule.morning?'morning' as const:'any' as const)}:subject})}
      fixed(next);return put(year,term,next)
    })),
    saveScheduleTeachingAssignments:(year,term,hash,rows)=>outcome(()=>mutate(year,term,async current=>{
      stale(current,hash)
      for(const row of rows)if(!current.subjects.some(subject=>subject.id===row.lessonId)||row.teacherId&&!current.teachers.some(teacher=>teacher.id===row.teacherId))throw Error('ไม่พบรายวิชาหรือครูผู้สอน')
      const next={...current,subjects:current.subjects.map(subject=>({...subject,teacherId:rows.find(row=>row.lessonId===subject.id)?.teacherId??subject.teacherId}))};fixed(next);return put(year,term,next)
    })),
    saveScheduleActivityName:(id,label,shortLabel,weeklyPeriods=1)=>outcome(()=>mutate(selectedYear,selectedTerm,async current=>{
      const catalog=[...(current.activityCatalog||[])],name=label.trim(),weekly=activityWeeklyPeriods(weeklyPeriods)
      if(!name||catalog.some(item=>item.id!==id&&item.label===name))throw Error('กรอกชื่อกิจกรรมที่ไม่ซ้ำ')
      if(id&&!catalog.some(item=>item.id===id))throw Error('ไม่พบกิจกรรมนี้')
      const item={id:id||newId(),label:name,short_label:(shortLabel.trim()||name).slice(0,40),weeklyPeriods:weekly}
      const next={...current,activityCatalog:[...catalog.filter(row=>row.id!==id),item],activities:current.activities.map(row=>(row.settingId||row.id)===id?{...row,name}:row)}
      await put(selectedYear,selectedTerm,next);return next.activityCatalog
    })),
    removeScheduleActivityName:id=>outcome(()=>mutate(selectedYear,selectedTerm,async current=>{
      if([current,plan(selectedYear,selectedTerm===1?2:1)].some(target=>target.activities.some(item=>(item.settingId||item.id)===id)))throw Error('นำกิจกรรมนี้ออกจากห้องทั้งสองภาคเรียนก่อน')
      const activityCatalog=(current.activityCatalog||[]).filter(item=>item.id!==id)
      await put(selectedYear,selectedTerm,{...current,activityCatalog});return activityCatalog
    })),
    previewScheduleActivityTeam:async(year,term,hash,group,remove)=>outcome(async()=>activityImpact(plan(year,term),hash,group,remove)),
    saveScheduleActivityTeam:(...args)=>outcome(()=>saveActivity(...args)),
    checkPreparation:async(year,term,rooms,clear)=>outcome(async()=>devicePreflight(plan(year,term),rooms,clear,currentTeacherLimit())),
    createScheduleDraft:async(year,term,rooms,clear)=>outcome(async()=>{
      await queue
      const current=structuredClone(plan(year,term)),base=deviceDataKey(current),issues=devicePreflight(current,rooms,clear,currentTeacherLimit())
      if(issues.some(issue=>issue.severity==='error'))return {status:'invalid' as const,issues,id:null,rows:[],assigned:0,locked:0}
      const controller=new AbortController();onComputing?.(controller)
      try {
        const draft=await solveScheduleOnDevice(toDeviceSnapshot(current,rooms),year,rooms,clear,controller.signal)
        const view=deviceDraftView(current,draft,rooms)!
        if(draft.status==='complete'){const id=newId();drafts.set(id,{year,term,base,draft,rooms});return {...view,id}}
        return view
      } finally {onComputing?.(null)}
    }),
    confirmScheduleDraft:(id,unlock=false)=>outcome(async()=>{
      const stored=drafts.get(id);if(!stored)throw Error('ฉบับร่างนี้ถูกยกเลิกหรือบันทึกแล้ว')
      return mutate(stored.year,stored.term,async current=>{
        if(current.teachers.length>currentTeacherLimit())throw Error(`จัดตารางฟรีรองรับครูสูงสุด ${currentTeacherLimit()} คน กรุณาลดจำนวนครูก่อนบันทึกตาราง`)
        stale(current,stored.base);if(stored.draft.locked&&!unlock)throw Error('ยืนยันแทนที่คาบล็อกก่อน')
        // Recheck the full returned assignment independently before making it durable.
        const verified=verifyCompleteSchedule(stored.draft.lessons||[],stored.draft.rows.map(row=>({classroomId:row.classroom_id,lessonId:row.activity_id?`activity:${row.activity_id}`:row.class_subject_id,day:row.day_of_week,period:row.period})),current.days,current.periods,toDeviceSnapshot(current,stored.rooms).blocks)
        const invalid=verified.find(issue=>issue.severity==='error');if(invalid)throw Error(invalid.message)
        const next={...current,timetable:localDraftCells(stored.draft)};fixed(next)
        await put(stored.year,stored.term,next);drafts.delete(id);return {committed:true}
      })
    }),
    discardScheduleDraft:id=>outcome(async()=>{drafts.delete(id);return {ok:true}}),
    fetchClassScheduleBundle:async(room,year,term=1)=>classBundle(year,term,room),
    fetchClassScheduleGrid:async(room,year,term=1)=>classBundle(year,term,room).grid,
    fetchClassScheduleSubjects:async(room,term=1)=>classBundle(selectedYear,term,room).subjects,
    fetchScheduleQuotas:async(room,year,term=1)=>classBundle(year,term,room).quotas,
    saveClassScheduleCell:(room,year,day,period,lesson,_note,term=1,expected)=>outcome(()=>mutate(year,term,async current=>{await put(year,term,changeDeviceCell(current,room,day,period,lesson,expected));return {ok:true}})),
    removeScheduleSubjectCell:(room,year,day,period,expected,term=1)=>outcome(()=>mutate(year,term,async current=>{await put(year,term,removeDeviceSubjectCell(current,room,day,period,expected));return {ok:true}})),
    moveClassScheduleCell:(room,year,fromDay,fromPeriod,day,period,expected,term=1)=>outcome(()=>mutate(year,term,async current=>{const source=current.timetable.find(cell=>cell.classroomId===room&&cell.day===fromDay&&cell.period===fromPeriod);if(!source||source.subjectId!==expected)throw Error('คาบต้นทางเปลี่ยนแล้ว');await put(year,term,moveDeviceCell(current,source,{day,period},true))})),
    toggleScheduleCellLock:(room,year,day,period,term=1)=>outcome(()=>mutate(year,term,async current=>{const next=lockDeviceCell(current,room,day,period);await put(year,term,next);return {locked:!!next.timetable.find(cell=>cell.classroomId===room&&cell.day===day&&cell.period===period)?.locked}})),
    setTeacherAvailabilityBlock:(year,term,teacher,day,period,blocked)=>outcome(()=>mutate(year,term,async current=>{await put(year,term,blockDeviceTeacher(current,teacher,day,period,blocked));return {ok:true}})),
    editTeacherScheduleCell:(year,term,teacher,room,day,period,expected,lesson)=>outcome(()=>mutate(year,term,async current=>{if(lesson&&!current.subjects.some(subject=>subject.id===lesson&&subject.teacherId===teacher&&subject.roomId===room))throw Error('วิชานี้ไม่ใช่ภาระของครูที่เลือก');await put(year,term,changeDeviceCell(current,room,day,period,lesson,expected));return {ok:true}})),
    previewScheduleClear:async(year,term,scope,room,selectedRooms,options)=>outcome(async()=>{
      const data=devicePreparation(plan(year,term)),result=planScheduleClear(data,scheduleClearRooms(data,scope,room,selectedRooms),options)
      return {hash:data.hash,rooms:result.rooms,removed:result.removed,unlockedRemoved:planScheduleClear(data,scheduleClearRooms(data,scope,room,selectedRooms),{...options,includeLocked:false}).removed,locked:result.locked,extraRooms:result.extraRooms.map(id=>plan(year,term).rooms.find(room=>room.id===id)?.label||id)}
    }),
    clearScheduleScope:(year,term,kind,room,selectedRooms,options)=>outcome(()=>mutate(year,term,async current=>{
      if(options){
        if(!options.expectedHash)throw Error('กรุณาตรวจสอบข้อมูลก่อนล้างตาราง')
        stale(current,options.expectedHash)
        const data=devicePreparation(current),result=planScheduleClear(data,scheduleClearRooms(data,kind,room,selectedRooms),options),retained=new Set(result.rows.map(row=>`${row.classroom_id}:${row.day_of_week}:${row.period}`))
        const isActivity=options.kind==='activities'
        const timetable=current.timetable.filter(cell=>retained.has(`${cell.classroomId}:${cell.day}:${cell.period}`))
        const activities=isActivity?current.activities.map(activity=>({...activity,cells:result.plan.activityGroups?.find(group=>group.id===activity.id)?.cells||activity.cells})):current.activities
        await put(year,term,{...current,timetable,activities,teachingGroups:result.plan.teachingGroups})
        return {rooms:result.rooms,removed:result.removed}
      }
      if(!['room','level','school','selected'].includes(kind))throw Error('ขอบเขตการล้างไม่ถูกต้อง')
      const selected=current.rooms.find(item=>item.id===room);if(!selected)throw Error('เลือกห้องเรียนก่อนล้างตาราง')
      if(kind==='selected'&&(!Array.isArray(selectedRooms)||!selectedRooms.length||selectedRooms.some(id=>!current.rooms.some(room=>room.id===id))))throw Error('เลือกห้องเรียนในเครื่องนี้ก่อนล้างรายวิชา')
      const level=selected.label.split('/')[0],rooms=current.rooms.filter(item=>kind==='selected'?selectedRooms!.includes(item.id):kind==='school'||(kind==='room'?item.id===room:item.label.split('/')[0]===level)),ids=new Set(rooms.map(room=>room.id))
      const next={...current,timetable:current.timetable.filter(cell=>cell.locked||!!cell.activityId||!cell.subjectId||!ids.has(cell.classroomId)||!!deviceActivityAt(current,cell.classroomId,cell.day,cell.period))}
      await put(year,term,next);return {rooms:rooms.length,removed:current.timetable.length-next.timetable.length}
    })),
    clearTeacherSchedule:(year,term,teacher)=>outcome(()=>mutate(year,term,async current=>{const next=clearDeviceCells(current,{kind:'teacher',id:teacher});await put(year,term,next);return {removed:current.timetable.length-next.timetable.length}})),
    copyClassSchedule:(source,target,year,term=1)=>outcome(()=>mutate(year,term,async current=>{
      if(source===target||!current.rooms.some(room=>room.id===target))throw Error('เลือกห้องต้นทางและปลายทางให้ถูกต้อง')
      const next={...current,timetable:current.timetable.filter(cell=>cell.classroomId!==target||cell.locked)};let copied=0
      for(const cell of allCells(current).filter(cell=>cell.classroomId===source&&(cell.subjectId||cell.activityId))){
        if(next.timetable.some(row=>row.classroomId===target&&row.day===cell.day&&row.period===cell.period))continue
        if(cell.activityId){
          const activity=current.activities.find(item=>item.id===cell.activityId),match=current.activities.find(item=>item.roomIds.includes(target)&&(item.settingId||item.id)===(activity?.settingId||activity?.id))
          if(!match)throw Error(`ห้องปลายทางไม่มีกิจกรรม ${activity?.name||''}`)
          if(match.cells.length&&!match.cells.some(target=>target.day===cell.day&&target.period===cell.period))throw Error('กิจกรรมของห้องปลายทางกำหนดเวลาไว้ต่างกัน กรุณาแก้ที่ขั้นกิจกรรม')
          next.timetable.push({...cell,classroomId:target,activityId:match.id,locked:false})
        }else{
          const subject=current.subjects.find(subject=>subject.id===cell.subjectId),match=current.subjects.find(item=>item.roomId===target&&item.code.trim().toLowerCase()===subject?.code.trim().toLowerCase())
          if(!match)throw Error(`ห้องปลายทางไม่มีรายวิชา ${subject?.code||''}`)
          if(deviceActivityAt(next,target,cell.day,cell.period))throw Error('คาบปลายทางกำหนดกิจกรรมไว้ กรุณาแก้ที่ขั้นกิจกรรม')
          next.timetable.push({...cell,classroomId:target,subjectId:match.id,locked:false})
        }
        copied++
      }
      if(!copied)throw Error('ไม่มีคาบให้คัดลอก หรือคาบปลายทางถูกล็อกทั้งหมด')
      fixed(next);await put(year,term,next);return {ok:true,copied}
    })),
    fetchTeacherAvailability:async(year,term=1)=>{
      const current=plan(year,term),data=preparation(year,term),busy=busyCells(current),quotas=new Map<string,{id:string;teacherId:string;label:string;activity:boolean;target:number;used:number}>()
      for(const lesson of data.lessons)for(const teacherId of lessonTeachers(lesson))for(const part of teachingQuotaParts(lesson)){const id=part.id,key=id+':'+teacherId,used=allCells(current).filter(cell=>lessonId(cell)===lesson.id&&(part.cell?part.cell===`${cell.day}:${cell.period}`:!lesson.jointTeachingCells?.[`${cell.day}:${cell.period}`])).length,old=quotas.get(key);if(old){old.used=Math.max(old.used,used);old.target=Math.max(old.target,part.count);old.label+=' / '+lesson.label}else quotas.set(key,{id,teacherId,label:lesson.label,activity:!!lesson.activity,target:part.count,used})}
      return {teachers:current.teachers,blocks:current.blocks,supported:true,lessons:data.lessons.filter(lesson=>!lesson.activity).map(lesson=>({id:lesson.id,teacherId:lesson.teacherId,classroomId:lesson.classroomId,label:lesson.label})),slots:allCells(current).map(cell=>({classroomId:cell.classroomId,day:cell.day,period:cell.period,lessonId:lessonId(cell),locked:!!cell.locked})),busy,quotas:[...quotas.values()]}
    },
    fetchTeachingScheduleGrid:async(teacher,year,term=1)=>scheduleTeachingView(deviceDisplaySchedule(plan(year,term)),teacher),
    getTeacherConflictAt:async(year,teacher,day,period,ignore,term=1)=>{const current=plan(year,term),rooms=[...new Set(busyCells(current).filter(cell=>cell.teacherId===teacher&&cell.day===day&&cell.period===period&&cell.classroomId!==ignore).map(cell=>current.rooms.find(room=>room.id===cell.classroomId)?.label||''))];return {busy:rooms.length>0,rooms}},
    fetchScheduleConflicts:async(year,term=1)=>{
      const current=plan(year,term),busy=busyCells(current),conflicts:Awaited<ReturnType<ScheduleOperations['fetchScheduleConflicts']>>['conflicts']=[]
      for(const teacher of current.teachers)for(const day of current.days)for(const period of current.periods.filter(row=>!row.is_break).map(row=>row.period)){
        const cells=busy.filter(cell=>cell.teacherId===teacher.id&&cell.day===day&&cell.period===period),groups=new Set(cells.map(cell=>cell.group||cell.lessonId))
        if(groups.size>1)conflicts.push({teacher_id:teacher.id,teacher_name:teacher.name,day,period,day_label:SCHEDULE_DAYS.find(item=>item.value===day)?.label||'',rooms:cells.map(cell=>({room:current.rooms.find(room=>room.id===cell.classroomId)?.label||'',subject:cell.label}))})
      }
      return {conflicts,count:conflicts.length}
    },
    fetchScheduleWorkload:async(year,term=1)=>deviceWorkload(plan(year,term)),
    fetchScheduleExportContext:async()=>exportContext(),
    fetchSchedulePdfGrids:async(year,term,kind,ids)=>{
      if(kind==='class')return Object.fromEntries(deviceDocumentPages(plan(year,term),'class',ids,term,year).map((page,index)=>[ids[index],page.gridData]))
      return Object.fromEntries(deviceDocumentPages(plan(year,term),'teacher',ids,term,year).map((page,index)=>[ids[index],page.gridData]))
    },
    fetchSubstituteHistory:async(year,term=1,before)=>{
      validateSubstituteHistoryScope(year,term,before)
      const current=plan(year,term)
      return {...pageSubstituteHistory(Object.entries(current.substitutes).map(([date,rows])=>({id:key(year,term,date),date,entries:rows.map(externalEntry)})),before),teacher_names:Object.fromEntries(current.teachers.map(teacher=>[teacher.id,teacher.name]))}
    },
    deleteSubstituteRosterEntries:(id,expected,ids)=>outcome(async()=>{
      const {year,term,date}=dayKey(id)
      return mutate(year,term,async current=>{
        const saved=current.substitutes[date]||[]
        if(JSON.stringify(substituteRosterSnapshot(saved.map(externalEntry)))!==JSON.stringify(substituteRosterSnapshot(expected)))throw Error('รายการสอนแทนเปลี่ยนแล้ว กรุณาโหลดรายการล่าสุดก่อนลบ')
        if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!saved.some(row=>row.id===id)))throw Error('ไม่พบรายการสอนแทนที่ต้องการลบ')
        const remaining=saved.filter(row=>!ids.includes(row.id)),substitutes={...current.substitutes,[date]:remaining}
        if(!remaining.length)delete substitutes[date]
        const bundle=read(),workspace=year===deviceYear(bundle)?bundle:bundle.archives?.[year]
        if(!workspace)throw Error('ไม่พบปีการศึกษา')
        const nextWorkspace={...workspace,terms:{...workspace.terms,[term]:{...workspace.terms[term as 1|2],substitutes}}}
        const next=year===deviceYear(bundle)?{...bundle,terms:nextWorkspace.terms}:{...bundle,archives:{...bundle.archives,[year]:nextWorkspace}}
        if(!await write(next))throw Error('ยังไม่ได้บันทึกลงเครื่อง กรุณาลองใหม่')
        return {deleted:ids.length}
      })
    }),
    fetchSubstituteDay:async(date,year,term=1)=>{
      const current=plan(year,term),day=weekday(date)
      return {day:{id:key(year,term,date),date,day_of_week:day,note:null},day_label:SCHEDULE_DAYS.find(item=>item.value===day)?.label||'',teacher_names:Object.fromEntries(current.teachers.map(teacher=>[teacher.id,teacher.name])),classrooms:current.rooms.map(room=>({id:room.id,label:room.label})),busy:rosterBusy(current,day),entries:(current.substitutes[date]||[]).map(externalEntry)}
    },
    loadSubstituteRosterSlots:async(date,year,teachers,term=1)=>{
      const current=plan(year,term)
      if(!teachers.length||teachers.length>200||new Set(teachers).size!==teachers.length||teachers.some(id=>!current.teachers.some(teacher=>teacher.id===id)))throw Error('กรุณาเลือกครูที่ลาให้ถูกต้อง')
      const slots=teachers.flatMap(absent_teacher_id=>teacherSlots(date,year,absent_teacher_id,term).map(slot=>({...slot,absent_teacher_id})))
      return {slots,missing:teachers.filter(id=>!slots.some(slot=>slot.absent_teacher_id===id))}
    },
    saveSubstituteRoster:(id,expected,rows)=>outcome(async()=>{
      const {year,term,date}=dayKey(id)
      return mutate(year,term,async current=>{
        const saved=current.substitutes[date]||[]
        if(JSON.stringify(substituteRosterSnapshot(saved.map(externalEntry)))!==JSON.stringify(substituteRosterSnapshot(expected)))throw Error('ตารางสอนแทนเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด')
        const normalized=rows.map(row=>({...row,subject_label:row.subject_label?.trim()||null,note:row.note?.trim()||null,room_label:current.rooms.find(room=>room.id===row.classroom_id)?.label||null}))
        validateSubstituteRoster(normalized,new Set(current.teachers.map(teacher=>teacher.id)),new Set(current.rooms.map(room=>room.id)),new Set(current.periods.filter(row=>!row.is_break).map(row=>row.period)))
        for(const row of normalized)if(row.class_subject_id&&!current.subjects.some(subject=>subject.id===row.class_subject_id&&subject.roomId===row.classroom_id&&subject.teacherId===row.absent_teacher_id))throw Error('รายวิชาไม่ตรงกับครูหรือห้อง')
        const checked=validateSubstituteAcknowledgements(normalized,rosterBusy(current,weekday(date)),Object.fromEntries(current.teachers.map(teacher=>[teacher.id,teacher.name])))
        const next:FreeSubstituteEntry[]=checked.map(row=>({id:row.id,absentTeacherId:row.absent_teacher_id,period:row.period,subjectId:row.class_subject_id||'',roomId:row.classroom_id!,subjectLabel:row.subject_label!,roomLabel:row.room_label!,substituteTeacherId:row.substitute_teacher_id,leaveType:row.leave_type,note:row.note,overrideConflicts:row.override_conflicts,conflictDetails:row.conflict_details,conflictConfirmedAt:row.override_conflicts?new Date().toISOString():null}))
        const substitutes={...current.substitutes,[date]:next}
        if(!next.length)delete substitutes[date]
        const bundle=read(),workspace=year===deviceYear(bundle)?bundle:bundle.archives?.[year]
        if(!workspace)throw Error('ไม่พบปีการศึกษา')
        const nextWorkspace={...workspace,terms:{...workspace.terms,[term]:{...workspace.terms[term as 1|2],substitutes}}}
        const nextBundle=year===deviceYear(bundle)?{...bundle,terms:nextWorkspace.terms}:{...bundle,archives:{...bundle.archives,[year]:nextWorkspace}}
        if(!await write(nextBundle))throw Error('ยังไม่ได้บันทึกลงเครื่อง กรุณาดาวน์โหลดสำเนาก่อนปิดหน้านี้')
        return {ok:true}
      })
    }),
    loadSubstituteSlotsForTeacher:async(date,year,teacher,term=1)=>teacherSlots(date,year,teacher,term),
    importSubstituteFromSchedule:(dayId,date,year,teacher,leaveType,term=1)=>outcome(()=>mutate(year,term,async current=>{
      if(dayId!==key(year,term,date))throw Error('วันที่นำเข้าเปลี่ยนแล้ว')
      if((current.substitutes[date]||[]).some(entry=>entry.substituteTeacherId===teacher))throw Error('ครูที่ลายังถูกกำหนดให้สอนแทน กรุณานำออกก่อน')
      const slots=teacherSlots(date,year,teacher,term),entries=slots.map(slot=>({id:newId(),absentTeacherId:teacher,period:slot.period,subjectId:slot.class_subject_id||'',roomId:slot.classroom_id,subjectLabel:slot.subject_label,roomLabel:slot.room_label,substituteTeacherId:null,leaveType,note:null}))
      if(!slots.length)throw Error('ครูท่านนี้ไม่มีคาบสอนในวันที่และภาคเรียนที่เลือก กรุณาตรวจวันที่และภาคเรียน')
      await put(year,term,{...current,substitutes:{...current.substitutes,[date]:[...(current.substitutes[date]||[]).filter(row=>row.absentTeacherId!==teacher),...entries]}});return {ok:true,count:slots.length}
    })),
    saveSubstituteDay:(id,expected,rows)=>outcome(async()=>{
      const {year,term,date}=dayKey(id)
      return mutate(year,term,async current=>{
        const entries=current.substitutes[date]||[],changes=entries.map(entry=>({id:entry.id,substitute_teacher_id:entry.substituteTeacherId,leave_type:entry.leaveType,note:entry.note}))
        if(deviceDataKey(changes)!==deviceDataKey(expected)||new Set(rows.map(row=>row.id)).size!==rows.length||rows.length!==entries.length||rows.some(row=>!entries.some(entry=>entry.id===row.id)))throw Error('ตารางสอนแทนเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด')
        const next=entries.map(entry=>{const row=rows.find(row=>row.id===entry.id)!;return {...entry,substituteTeacherId:row.substitute_teacher_id,leaveType:row.leave_type,note:row.note}}),external=next.map(externalEntry),day=weekday(date),busy=[...current.blocks,...busyCells(current)].filter(row=>row.day===day)
        for(const row of external)if(row.substitute_teacher_id&&!availableSubstitutes(current.teachers,busy,external,row).some(teacher=>teacher.id===row.substitute_teacher_id))throw Error('ครูสอนแทนมีคาบชนกันหรือเป็นครูที่ลา')
        await put(year,term,{...current,substitutes:{...current.substitutes,[date]:next}});return {ok:true}
      })
    }),
    fetchSubstitutePdfContext:async()=>({...exportContext(),academicHead:plan().document?.academicHeadName||''}),
    deleteSubstituteEntries:(id,expected,ids)=>outcome(async()=>{
      const {year,term,date}=dayKey(id)
      return mutate(year,term,async current=>{
        const entries=current.substitutes[date]||[],changes=entries.map(entry=>({id:entry.id,substitute_teacher_id:entry.substituteTeacherId,leave_type:entry.leaveType,note:entry.note}))
        if(deviceDataKey(changes)!==deviceDataKey(expected))throw Error('มีการแก้ไขตารางสอนแทน กรุณาโหลดใหม่ก่อนลบ')
        if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!entries.some(entry=>entry.id===id)))throw Error('ไม่พบรายการสอนแทนที่ต้องการลบ')
        const substitutes={...current.substitutes,[date]:entries.filter(entry=>!ids.includes(entry.id))}
        if(!substitutes[date].length)delete substitutes[date]
        await put(year,term,{...current,substitutes});return {ok:true}
      })
    }),
    fetchActivityLevelOptions:async(year,term)=>({levels:[...new Set(plan(year,term).rooms.map(room=>room.label.split('/')[0]))],activities:(plan(year,term).activityCatalog||[]).map(item=>({id:item.id,name:item.label}))}),
    saveActivityLevelSchedule:(year,term,setting,levels,day,period)=>outcome(async()=>{
      const current=plan(year,term),rooms=current.rooms.filter(room=>levels.includes(room.label.split('/')[0])).map(room=>room.id)
      await saveActivity(year,term,deviceDataKey(current),{id:newId(),settingId:setting,roomIds:rooms,teacherIds:[],roomTeachers:{},mode:'joint',weeklyPeriods:1,cells:[{day,period}]},false,false,true);return {added:rooms.length,rooms:rooms.length}
    }),
    fetchScheduleActivities:async(year,room,term=1)=>{const current=plan(year,term);return {settings:(current.activityCatalog||[]).map(item=>({...item,hours_per_year:item.weeklyPeriods*40})),teachers:devicePreparation(current).teachers,offerings:current.activities.filter(item=>item.roomIds.includes(room)).map(item=>({id:item.id,evaluation_setting_id:item.settingId||item.id,teacher_id:freeActivityTeachers(item,room)[0]||null,weekly_periods:item.weeklyPeriods||1}))}},
    saveScheduleActivity:async(year,room,setting,teacher,count,term=1)=>{const current=plan(year,term);await saveActivity(year,term,deviceDataKey(current),{id:newId(),settingId:setting,roomIds:[room],teacherIds:teacher?[teacher]:[],roomTeachers:{},mode:'joint',weeklyPeriods:count,cells:[]},false,false,true);return {ok:true}},
  }
  return services
}
