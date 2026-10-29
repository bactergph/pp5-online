import {teachingEventAt,teachingQuotaParts,jointTeachingSlotErrors} from './schedule-joint-teaching'
import type { ActivityTeam } from './schedule-activity-teams'
import { solveSchoolSchedule } from './schedule-solver'
import { solveBlockRepair } from './schedule-block-repair'
import type {JointTeachingGroup} from './schedule-joint-teaching'
import {solveJointTeachingSchedule} from './schedule-joint-solver'
import { subjectDayIssue } from './schedule-subject-days'
import { remainingSlotCapacityIssues } from './schedule-resource-capacity'
import { spreadSubjectFamilies, subjectFamily } from './schedule-subject-families'
const lessonTeachers=(l:{teacherId:string|null;teacherIds?:string[]})=>l.teacherIds??(l.teacherId?[l.teacherId]:[])
import type { PeriodTimeRow } from './schedule-helpers'
export type TimePreference = 'any' | 'morning' | 'afternoon'
export type LessonRule = { count: number; pattern: number[]; roomId: string | null; morning: boolean; spread: boolean; timePreference?: TimePreference }
export type SchedulePlan = { days: number[]; rooms: { id: string; name: string }[]; rules: Record<string, LessonRule>; reduceGaps: boolean; maxContinuous: number; teacherIds?: string[]; activityGroups?: ActivityTeam[]; teachingGroups?:JointTeachingGroup[]; roomLabels?: Record<string, string> }
export type PlannedLesson = { id: string; classroomId: string; teacherId: string | null; count: number; label: string; activity?: boolean; teacherOptional?: boolean; roomId?: string | null; pattern?: number[]; morning?: boolean; timePreference?: TimePreference; preferMorning?: boolean; spread?: boolean; fixedOnly?: boolean; teacherIds?: string[]; activityGroupId?: string; jointTeachingCells?:Record<string,string>; subjectGroup?: string; fullName?: string; name?: string; teacherName?: string }
export function lessonPrefersMorning(lesson: { subjectGroup?: string; fullName?: string; name?: string; label?: string }) {
  return /ภาษาไทย|คณิต|วิทยาศาสตร์|วิทย์|ฟิสิกส์|เคมี|ชีววิทยา|สังคมศึกษา|ภาษาอังกฤษ|ภาษาต่างประเทศ/.test(`${lesson.subjectGroup || ''} ${lesson.fullName || ''} ${lesson.name || ''}`)
}
/** Explicit session choices come first, then Thai/maths/sciences. "Any" allows
 * either session; it does not disable the school's automatic subject priority. */
export function lessonMorningPriority(lesson: {subjectGroup?:string;fullName?:string;name?:string;label?:string;morning?:boolean;timePreference?:TimePreference;preferMorning?:boolean;activity?:boolean;fixedOnly?:boolean}) {
  if(lesson.activity||lesson.fixedOnly)return 0
  if(lesson.timePreference==='morning')return 3
  if(lesson.timePreference==='afternoon')return -3
  if(!lesson.timePreference&&lesson.morning)return 3
  if(/ภาษาไทย|คณิต|วิทยาศาสตร์|วิทย์|ฟิสิกส์|เคมี|ชีววิทยา/.test(`${lesson.subjectGroup||''} ${lesson.fullName||lesson.name||lesson.label||''}`))return 2
  return lesson.preferMorning||lessonPrefersMorning(lesson)?1:0
}
function isMorningPeriod(period: number, times: PeriodTimeRow[]) {
  const breakAt = times.findIndex(t => t.is_break)
  const index = times.findIndex(t => !t.is_break && t.period === period)
  if (breakAt < 0) return index >= 0 && index < Math.ceil(times.filter(t => !t.is_break).length / 2)
  return index >= 0 && index < breakAt
}
export type PlannedSlot = { classroomId: string; lessonId: string | null; day: number; period: number }
export type FixedScheduleIssueCode = 'fixed_outside' | 'fixed_classroom_collision' | 'fixed_unknown_lesson' | 'fixed_classroom_mismatch' | 'fixed_teacher_conflict' | 'fixed_venue_conflict' | 'fixed_over_quota' | 'fixed_joint_mismatch' | 'subject_day'
export type PlanningIssue = { severity: 'error' | 'warning'; message: string; step: number; manageStep?:number; code?: FixedScheduleIssueCode; details?: string[] }
export type PlannedScheduleResult = {status:'invalid'|'complete'|'timeout'|'conflict';assignments:PlannedSlot[];issues:PlanningIssue[];nodes:number;limitReason?:'node_limit'|'time_limit'|null;message?:string;solver?:'edge_coloring'|'dense_slot_matching'|'legacy_backtracking'|'block_backtracking'|'block_repair';elapsedMs?:number;timeLimitMs?:number}
export const SCHEDULE_SEARCH_MAX_NODES = 2_000_000
export const SCHEDULE_SEARCH_TIME_LIMIT_MS = 45_000
export const emptyPlan = (): SchedulePlan => ({ days: [1,2,3,4,5], rooms: [], rules: {}, reduceGaps: false, maxContinuous: 0 })
export function validatePlan(plan: SchedulePlan, lessonIds: string[]) {
  if (!Array.isArray(plan.days) || !plan.days.length || new Set(plan.days).size !== plan.days.length || plan.days.some(d=>!Number.isInteger(d)||d<1||d>5)) throw Error('เลือกวันเรียนจันทร์–ศุกร์อย่างน้อยหนึ่งวัน')
  if (!Array.isArray(plan.rooms) || plan.rooms.length>500 || new Set(plan.rooms.map(r=>r.id)).size!==plan.rooms.length || plan.rooms.some(r=>!/^[-0-9a-f]{36}$/i.test(r.id)||!r.name.trim()||r.name.length>100)) throw Error('ข้อมูลห้องสถานที่ไม่ถูกต้อง')
  if (typeof plan.reduceGaps!=='boolean' || !Number.isInteger(plan.maxContinuous)||plan.maxContinuous<0||plan.maxContinuous>8) throw Error('เงื่อนไขคาบต่อเนื่องไม่ถูกต้อง')
  if (!plan.rules || typeof plan.rules!=='object') throw Error('ข้อมูลภาระสอนไม่ถูกต้อง')
  if (plan.teacherIds && (!Array.isArray(plan.teacherIds) || plan.teacherIds.length>1000 || new Set(plan.teacherIds).size!==plan.teacherIds.length || plan.teacherIds.some(id=>!/^[-0-9a-f]{36}$/i.test(id)))) throw Error('รายการครูที่เลือกไม่ถูกต้อง')
  if (plan.roomLabels && (typeof plan.roomLabels !== 'object' || Array.isArray(plan.roomLabels) || Object.keys(plan.roomLabels).length > 500 || Object.entries(plan.roomLabels).some(([id, name]) => !/^[-0-9a-f]{36}$/i.test(id) || typeof name !== 'string' || !name.trim() || name.trim().length > 20))) throw Error('ชื่อห้องไม่ถูกต้อง')
  for(const [id,r] of Object.entries(plan.rules)) {
    if (!lessonIds.includes(id) || !Number.isInteger(r.count)||r.count<1||r.count>40 || !Array.isArray(r.pattern)||!r.pattern.length||r.pattern.some(n=>!Number.isInteger(n)||n<1||n>8)||r.pattern.reduce((a,b)=>a+b,0)!==r.count) throw Error('ภาระสอนและผลรวมรูปแบบคาบต้องตรงกัน')
    if (r.roomId && !plan.rooms.some(room=>room.id===r.roomId)) throw Error('ไม่พบห้องสถานที่ที่เลือก')
    if(typeof r.morning!=='boolean'||typeof r.spread!=='boolean')throw Error('เงื่อนไขรายวิชาไม่ถูกต้อง')
    if(r.timePreference!==undefined&&!['any','morning','afternoon'].includes(r.timePreference))throw Error('ช่วงเวลาที่ต้องการไม่ถูกต้อง')
  }
}
/** Consecutive teaching IDs alone are insufficient: lunch/gaps split blocks. */
export function blocksFor(length: number, days: number[], times: PeriodTimeRow[]) {
  const blocks: {day:number;periods:number[]}[]=[]
  for(const day of days) for(let i=0;i<times.length;i++) {
    const block=times.slice(i,i+length)
    if(block.length!==length||block.some(t=>t.is_break)||block.some((t,j)=>j>0&&block[j-1].end_time!==t.start_time))continue
    blocks.push({day,periods:block.map(t=>t.period)})
  }
  return blocks
}
export function checkPlanning(lessons: PlannedLesson[], fixed: PlannedSlot[], days:number[], times:PeriodTimeRow[], unavailable:{teacherId:string;day:number;period:number}[]):PlanningIssue[] {
  const issues:PlanningIssue[]=[];const periods=times.filter(t=>!t.is_break).map(t=>t.period),capacity=periods.length*days.length
  const err=(message:string,step=6)=>issues.push({severity:'error',message,step})
  const fixedError=(code:FixedScheduleIssueCode,message:string,step=6)=>issues.push({severity:'error',message,step,code})
  const occupied=new Set<string>(),slotOwners=new Map<string,string>(),teachers=new Map<string,string>(),places=new Map<string,string>()
  const blocked=new Set(unavailable.map(block=>`${block.teacherId}:${block.day}:${block.period}`))
  for(const slot of fixed){const l=lessons.find(l=>l.id===slot.lessonId);const key=`${slot.day}:${slot.period}`
    if(!days.includes(slot.day)||!periods.includes(slot.period))fixedError('fixed_outside','คาบเดิมอยู่นอกวันหรือเวลาที่เลือก',1)
    if(occupied.has(slot.classroomId+':'+key))fixedError('fixed_classroom_collision','มีคาบนักเรียนซ้ำ');occupied.add(slot.classroomId+':'+key);slotOwners.set(slot.classroomId+':'+key,slot.lessonId||'locked-empty')
    if(slot.lessonId&&!l)fixedError('fixed_unknown_lesson','คาบเดิมอ้างถึงรายวิชาที่ไม่พบ',3)
    if(l&&l.classroomId!==slot.classroomId)fixedError('fixed_classroom_mismatch',l.label+' ถูกลงในห้องนักเรียนที่ไม่ตรงกับรายวิชา',3)
    if(l)for(const id of lessonTeachers(l)){const owner=teachingEventAt(l,slot.day,slot.period),busy=teachers.get(id+':'+key);if((busy&&busy!==owner)||unavailable.some(b=>b.teacherId===id&&b.day===slot.day&&b.period===slot.period))fixedError('fixed_teacher_conflict',l.label+' ครูชนหรือไม่ว่าง',4);teachers.set(id+':'+key,owner)}
    if(l?.roomId){const owner=teachingEventAt(l,slot.day,slot.period),held=places.get(l.roomId+':'+key);if(held&&held!==owner)fixedError('fixed_venue_conflict',l.label+' ห้องสถานที่ชน',5);places.set(l.roomId+':'+key,owner)}
  }
  for(const l of lessons){
    const dayIssue=subjectDayIssue(l,fixed,days,times)
    if(dayIssue)issues.push({severity:'error',message:dayIssue,step:5,manageStep:5,code:'subject_day' as const})
    if(!lessonTeachers(l).length&&!l.teacherOptional&&l.count>0)err(l.label+' ยังไม่มีครู',5)
    if(!Number.isInteger(l.count)||l.count<0||(!l.activity&&!l.fixedOnly&&l.count===0))err(l.label+' ยังไม่มีภาระสอนที่ถูกต้อง',5)
    if(l.pattern&&(l.pattern.reduce((a,b)=>a+b,0)!==l.count||l.pattern.some(n=>!Number.isInteger(n)||n<1)))err(l.label+' รูปแบบคาบรวมไม่ตรงภาระสอน',5)
    if(!l.fixedOnly&&l.pattern?.length){
      const available=new Set<string>();let impossible=false
      for(const length of new Set(l.pattern)){
        const choices=blocksFor(length,days,times).filter(block=>block.periods.every(period=>{
          const key=`${block.day}:${period}`,roomOwner=slotOwners.get(`${l.classroomId}:${key}`),venueOwner=l.roomId?places.get(`${l.roomId}:${key}`):undefined
          return (!roomOwner||roomOwner===l.id)&&(!venueOwner||venueOwner===teachingEventAt(l,block.day,period))&&lessonTeachers(l).every(id=>{const owner=teachers.get(`${id}:${key}`);return !blocked.has(`${id}:${key}`)&&(!owner||owner===teachingEventAt(l,block.day,period))})
        }))
        if(!choices.length)impossible=true
        for(const block of choices)for(const period of block.periods)available.add(`${block.day}:${period}`)
      }
      if(impossible)err(l.label+' ไม่มีช่วงว่างต่อเนื่องสำหรับรูปแบบคาบ กรุณาตรวจคาบล็อก ครูไม่ว่าง และห้องสถานที่',4)
      else if(available.size<l.count)err(`${l.label} ต้องการ ${l.count} คาบ แต่มีช่องที่ครู ห้องนักเรียน และสถานที่ว่างตรงกัน ${available.size} คาบ`,5)
    }
    if(fixed.filter(s=>s.lessonId===l.id).length>l.count)fixedError('fixed_over_quota',l.label+' คาบเดิมเกินเป้าหมาย',5)
  }
  for(const room of new Set(lessons.map(l=>l.classroomId))){const need=lessons.filter(l=>l.classroomId===room).reduce((n,l)=>n+l.count,0)+fixed.filter(s=>s.classroomId===room&&!s.lessonId).length;if(need>capacity)err(`${lessons.find(l=>l.classroomId===room)?.label.split(' · ')[0]} ต้องการ ${need} คาบ แต่มี ${capacity} ช่อง`,5)}
  for(const teacher of new Set(lessons.flatMap(l=>lessonTeachers(l)))) {
    const taught=lessons.filter(l=>lessonTeachers(l).includes(teacher)),load=new Map<string,{count:number;activity:boolean;labels:Set<string>}>()
    for(const l of taught) for(const part of teachingQuotaParts(l)) {
      const key=part.id,entry=load.get(key)||{count:0,activity:!!l.activity,labels:new Set<string>()}
      entry.count=Math.max(entry.count,part.count);entry.labels.add(l.label);load.set(key,entry)
    }
    const entries=[...load.values()],need=entries.reduce((n,v)=>n+v.count,0)
    const blockedCount=new Set(unavailable.filter(b=>b.teacherId===teacher&&days.includes(b.day)&&periods.includes(b.period)).map(b=>`${b.day}:${b.period}`)).size,free=capacity-blockedCount
    if(!(need>free))continue
    // A classroom/subject label identifies only one assignment, not the teacher
    // whose combined load is over capacity. Prefer an unambiguous single-teacher name.
    const named=taught.find(l=>lessonTeachers(l).length===1&&l.teacherName?.trim())
    let name=named?.teacherName?.trim()
    if(!name)for(const l of taught){const names=l.teacherName?.split(/[,、]/).map(n=>n.trim()),ids=lessonTeachers(l);if(names?.length===ids.length&&names[ids.indexOf(teacher)]){name=names[ids.indexOf(teacher)];break}}
    const subjects=entries.filter(e=>!e.activity).reduce((n,e)=>n+e.count,0),activities=need-subjects
    issues.push({severity:'error',step:4,message:`${name||`ครูรหัส ${teacher}`} ต้องสอน ${need} คาบ แต่มีเวลาว่าง ${free} คาบ (รายวิชา ${subjects} · กิจกรรม ${activities} · คาบไม่ว่าง ${blockedCount})`,
      details:entries.filter(e=>e.count>0).map(e=>`${[...e.labels].join(' / ')}: ${e.count} คาบ/สัปดาห์${e.labels.size>1?' (รวมกลุ่ม นับครั้งเดียว)':''}`)})
  }
  for(const venue of new Set(lessons.flatMap(l=>l.roomId?[l.roomId]:[]))){const uses=lessons.filter(l=>l.roomId===venue),events=new Map<string,number>();for(const l of uses)for(const part of teachingQuotaParts(l))events.set(part.id,Math.max(events.get(part.id)||0,part.count));const need=[...events.values()].reduce((a,b)=>a+b,0);if(need>capacity)err(`สถานที่ของ ${uses[0]?.label} ต้องใช้ ${need} คาบ แต่มี ${capacity} ช่อง`,5)}

  for(const message of jointTeachingSlotErrors(lessons.map(lesson=>({...lesson,activityGroupId:undefined})),fixed))issues.push({severity:'error',message,step:6,code:'fixed_joint_mismatch'})
  if(!issues.some(issue=>issue.severity==='error'))issues.push(...remainingSlotCapacityIssues(lessons,fixed,days,times,unavailable))
  return issues
}
/** Improve a complete answer; never move retained cells, activities or multi-period blocks. */
export function improveMorningAssignments(lessons:PlannedLesson[],fixed:PlannedSlot[],assignments:PlannedSlot[],days:number[],times:PeriodTimeRow[],unavailable:{teacherId:string;day:number;period:number}[],preferences:{reduceGaps?:boolean;maxContinuous?:number}={}) {
  const byId=new Map(lessons.map(lesson=>[lesson.id,lesson])),priority=new Map(lessons.map(lesson=>[lesson.id,lessonMorningPriority(lesson)]))
  if(!assignments.some(row=>!!(row.lessonId&&priority.get(row.lessonId))))return assignments
  const result=assignments.map(row=>({...row})),cell=(room:string,day:number,period:number)=>`${room}:${day}:${period}`
  const retained=new Set(fixed.map(row=>cell(row.classroomId,row.day,row.period))),occupied=new Map<string,PlannedSlot>()
  const teachers=new Map<string,Set<PlannedSlot>>(),venues=new Map<string,Set<PlannedSlot>>(),dayCount=new Map<string,number>()
  const blocked=new Set(unavailable.map(block=>cell(block.teacherId,block.day,block.period)))
  const single=(lesson:PlannedLesson|undefined)=>!!lesson&&!lesson.activity&&!lesson.activityGroupId&&!Object.keys(lesson.jointTeachingCells||{}).length&&!lesson.fixedOnly&&(!lesson.pattern||lesson.pattern.every(size=>size===1))
  const register=(row:PlannedSlot,add:boolean)=>{
    const lesson=row.lessonId?byId.get(row.lessonId):undefined,key=cell(row.classroomId,row.day,row.period)
    if(add)occupied.set(key,row);else occupied.delete(key)
    if(!lesson)return
    const countKey=`${lesson.id}:${row.day}`;dayCount.set(countKey,(dayCount.get(countKey)||0)+(add?1:-1))
    for(const [map,id] of [...lessonTeachers(lesson).map(id=>[teachers,id] as const),[venues,lesson.roomId] as const]){
      if(!id)continue
      const k=cell(id,row.day,row.period),set=map.get(k)||new Set<PlannedSlot>()
      if(add)set.add(row);else set.delete(row)
      if(set.size)map.set(k,set);else map.delete(k)
    }
  }
  for(const row of [...fixed,...result])register(row,true)
  const available=(lesson:PlannedLesson,day:number,period:number,ignore:Set<PlannedSlot>)=>{
    for(const teacher of lessonTeachers(lesson)){const key=cell(teacher,day,period);if(blocked.has(key)||[...teachers.get(key)||[]].some(row=>!ignore.has(row)))return false}
    return !lesson.roomId||![...venues.get(cell(lesson.roomId,day,period))||[]].some(row=>!ignore.has(row))
  }
  const spreadDelta=(lesson:PlannedLesson,from:number,to:number)=>!lesson.spread||from===to?0:(dayCount.get(`${lesson.id}:${to}`)||0)-(dayCount.get(`${lesson.id}:${from}`)||0)+1
  const teacherPenalty=(teacher:string,day:number,changes:Map<PlannedSlot,{day:number;period:number}>)=>{
    let run=0,longest=0;const occupiedIndexes:number[]=[];let index=0
    for(const time of times){
      if(time.is_break){run=0;continue}
      const busy=[...teachers.get(cell(teacher,day,time.period))||[]].some(row=>!changes.has(row))||[...changes].some(([row,next])=>next.day===day&&next.period===time.period&&lessonTeachers(byId.get(row.lessonId!)!).includes(teacher))
      if(busy)occupiedIndexes.push(index);run=busy?run+1:0;longest=Math.max(longest,run);index++
    }
    const gaps=occupiedIndexes.length?occupiedIndexes[occupiedIndexes.length-1]-occupiedIndexes[0]+1-occupiedIndexes.length:0
    return (preferences.reduceGaps?gaps:0)+(preferences.maxContinuous?Math.max(0,longest-preferences.maxContinuous)*20:0)
  }
  const teachingCells=days.flatMap(day=>times.filter(time=>!time.is_break).map(time=>({day,period:time.period})))
  const misplaced=(row:PlannedSlot)=>{const value=priority.get(row.lessonId||'')||0;return value>0?!isMorningPeriod(row.period,times):value<0&&isMorningPeriod(row.period,times)}
  const deadline=Date.now()+150
  for(let pass=0;pass<3;pass++){
    let changed=false
    const candidates=result.filter(row=>row.lessonId&&misplaced(row)&&single(byId.get(row.lessonId)!)).sort((a,b)=>Math.abs(priority.get(b.lessonId!)||0)-Math.abs(priority.get(a.lessonId!)||0))
    for(const row of candidates){
      if(Date.now()>=deadline)return result
      const lesson=byId.get(row.lessonId!)!,value=priority.get(lesson.id)||0
      if(!value||!misplaced(row)||retained.has(cell(row.classroomId,row.day,row.period)))continue
      const direction=Math.sign(value)
      const destinations=teachingCells.filter(target=>isMorningPeriod(target.period,times)===(value>0)).sort((a,b)=>{
        const first=occupied.get(cell(row.classroomId,a.day,a.period)),second=occupied.get(cell(row.classroomId,b.day,b.period))
        return direction*((priority.get(first?.lessonId||'')||0)-(priority.get(second?.lessonId||'')||0))||Number(!!first)-Number(!!second)||Number(a.day!==row.day)-Number(b.day!==row.day)||a.day-b.day||a.period-b.period
      })
      for(const destination of destinations){
        const key=cell(row.classroomId,destination.day,destination.period)
        if(retained.has(key))continue
        const other=occupied.get(key),otherLesson=other?.lessonId?byId.get(other.lessonId):undefined
        if(other&&(!otherLesson||!single(otherLesson)))continue
        if(otherLesson&&direction*((priority.get(otherLesson.id)||0)-value)>=0)continue
        if(row.day!==destination.day&&((dayCount.get(`${lesson.id}:${destination.day}`)||0)>0||otherLesson&&(dayCount.get(`${otherLesson.id}:${row.day}`)||0)>0))continue
        if(spreadDelta(lesson,row.day,destination.day)+(otherLesson?spreadDelta(otherLesson,destination.day,row.day):0)>0)continue
        const ignore=new Set(other?[row,other]:[row])
        if(!available(lesson,destination.day,destination.period,ignore)||otherLesson&&!available(otherLesson,row.day,row.period,ignore))continue
        const previous={day:row.day,period:row.period}
        if(preferences.reduceGaps||preferences.maxContinuous){
          const changes=new Map<PlannedSlot,{day:number;period:number}>([[row,destination]]);if(other)changes.set(other,previous)
          let before=0,after=0
          for(const teacher of new Set([...lessonTeachers(lesson),...(otherLesson?lessonTeachers(otherLesson):[])]))for(const day of new Set([row.day,destination.day])){before+=teacherPenalty(teacher,day,new Map());after+=teacherPenalty(teacher,day,changes)}
          if(after>before)continue
        }
        register(row,false);if(other)register(other,false)
        row.day=destination.day;row.period=destination.period
        if(other){other.day=previous.day;other.period=previous.period}
        register(row,true);if(other)register(other,true)
        changed=true;break
      }
    }
    if(!changed)break
  }
  return result
}
/** Improve teacher session or daily free-period equity after feasibility is established. Whole subject
 * blocks move together; retained cells, activities, shared teaching and explicit
 * morning/afternoon requests never move to the other session. This bounded
 * pass never reruns search. Daily moves stay within the original session and
 * cannot worsen another teacher's daily balance or subject-family distribution. */
export function balanceTeacherSessions(lessons:PlannedLesson[],fixed:PlannedSlot[],assignments:PlannedSlot[],days:number[],times:PeriodTimeRow[],unavailable:{teacherId:string;day:number;period:number}[],preferences:{reduceGaps?:boolean;maxContinuous?:number}={},objective:'session'|'daily'='session') {
  const result=assignments.map(row=>({...row})),byId=new Map(lessons.map(lesson=>[lesson.id,lesson]))
  const key=(id:string,day:number,period:number)=>id+':'+day+':'+period
  const occupied=new Map<string,PlannedSlot>(),teacherBusy=new Map<string,Set<PlannedSlot>>(),venueBusy=new Map<string,Set<PlannedSlot>>(),dayCount=new Map<string,number>()
  const blocked=new Set(unavailable.map(row=>key(row.teacherId,row.day,row.period))),retained=new Set(fixed.map(row=>key(row.classroomId,row.day,row.period)))
  const familyDays=new Map<string,Map<string,number>>()
  const register=(row:PlannedSlot,add:boolean)=>{
    const position=key(row.classroomId,row.day,row.period),lesson=row.lessonId?byId.get(row.lessonId):undefined
    if(add)occupied.set(position,row);else occupied.delete(position)
    if(!lesson)return
    if(objective==='daily'){const family=subjectFamily(lesson);if(family){const k=key(row.classroomId+':'+family,row.day,0),counts=familyDays.get(k)||new Map<string,number>(),n=(counts.get(lesson.id)||0)+(add?1:-1);if(n)counts.set(lesson.id,n);else counts.delete(lesson.id);familyDays.set(k,counts)}}
    const day=key(lesson.id,row.day,0);dayCount.set(day,(dayCount.get(day)||0)+(add?1:-1))
    for(const [map,id]of [...lessonTeachers(lesson).map(id=>[teacherBusy,id]as const),[venueBusy,lesson.roomId]as const])if(id){
      const k=key(id,row.day,row.period),rows=map.get(k)||new Set<PlannedSlot>();if(add)rows.add(row);else rows.delete(row)
      if(rows.size)map.set(k,rows);else map.delete(k)
    }
  }
  for(const row of [...fixed,...result])register(row,true)
  const teaching=times.filter(time=>!time.is_break),morningPeriods=new Set(teaching.filter(time=>isMorningPeriod(time.period,times)).map(time=>time.period))
  if(objective==='session'&&(!morningPeriods.size||morningPeriods.size===teaching.length))return assignments
  const stats=new Map<string,{morning:number;total:number;target:number;both:boolean}>()
  for(const teacher of new Set(lessons.flatMap(lessonTeachers))){
    let morning=0,total=0,availableMorning=0,available=0
    for(const day of days)for(const time of teaching){const k=key(teacher,day,time.period),am=morningPeriods.has(time.period);if(!blocked.has(k)){available++;if(am)availableMorning++}if(teacherBusy.has(k)){total++;if(am)morning++}}
    stats.set(teacher,{morning,total,target:available?total*availableMorning/available:0,both:availableMorning>0&&availableMorning<available})
  }
  const penalty=(teacher:string,morning?:number)=>{const stat=stats.get(teacher)!;if(stat.total<2||!stat.both)return 0;const m=morning??stat.morning;return 8*(m-stat.target)**2/stat.total+(stat.total>=4&&(m===0||m===stat.total)?2:0)}
  const daily=new Map<string,Map<number,{used:number;capacity:number;target:number}>>()
  const dailyScore=(teacher:string,changes?:Map<PlannedSlot,{day:number;period:number}>)=>{
    const table=daily.get(teacher);if(!table)return 0
    const delta=new Map<number,number>()
    for(const [row,next]of changes||[]){if(!lessonTeachers(byId.get(row.lessonId!)!).includes(teacher))continue;delta.set(row.day,(delta.get(row.day)||0)-1);delta.set(next.day,(delta.get(next.day)||0)+1)}
    let total=0,free=0;for(const [day,stat]of table){total+=(stat.used+(delta.get(day)||0)-stat.target)**2;free+=stat.capacity-stat.used}
    // A teacher with only five free periods needs the daily spread more than a
    // lightly loaded teacher with many free periods. Keep the objective per person.
    return total*(1+2/(1+Math.max(0,free)/Math.max(1,days.length)))
  }
  // Equalise free capacity, counting simultaneous shared lessons once. Locked
  // absences are unavailable, and pinned teaching caps how many periods can be
  // free on that day. Water-filling gives a reachable target for uneven days.
  if(objective==='daily')for(const teacher of stats.keys()){
    const table=new Map<number,{used:number;capacity:number;target:number}>(),limits=new Map<number,number>();let free=0
    for(const day of days){let capacity=0,used=0,pinned=0;for(const time of teaching){const cell=key(teacher,day,time.period),rows=[...teacherBusy.get(cell)||[]];if(!blocked.has(cell))capacity++;if(rows.length)used++;if(rows.some(row=>retained.has(key(row.classroomId,row.day,row.period))||(()=>{const lesson=byId.get(row.lessonId!)!;return lesson.activity||lesson.fixedOnly||lesson.activityGroupId||Object.keys(lesson.jointTeachingCells||{}).length})()))pinned++}table.set(day,{used,capacity,target:0});limits.set(day,Math.max(0,capacity-pinned));free+=capacity-used}
    let low=0,high=teaching.length;for(let i=0;i<32;i++){const middle=(low+high)/2,available=[...limits.values()].reduce((sum,limit)=>sum+Math.min(limit,middle),0);if(available<free)low=middle;else high=middle}
    for(const [day,stat]of table)stat.target=stat.capacity-Math.min(limits.get(day)!,high)
    daily.set(teacher,table)
  }
  const familyScore=(counts:Map<string,number>)=>{const values=[...counts.values()];let score=0;for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++)if(values[i]===1||values[j]===1)score++;return score}
  const worsensFamilies=(changes:Map<PlannedSlot,{day:number;period:number}>)=>{
    const next=new Map<string,Map<string,number>>()
    for(const [row,target]of changes){const lesson=byId.get(row.lessonId!)!,family=subjectFamily(lesson);if(!family)continue;for(const [day,delta]of [[row.day,-1],[target.day,1]]){const k=key(row.classroomId+':'+family,day,0),counts=next.get(k)||new Map(familyDays.get(k)||[]),n=(counts.get(lesson.id)||0)+delta;if(n)counts.set(lesson.id,n);else counts.delete(lesson.id);next.set(k,counts)}}
    let delta=0;for(const [k,counts]of next)delta+=familyScore(counts)-familyScore(familyDays.get(k)||new Map());return delta>0
  }
  type Unit={lesson:PlannedLesson;rows:PlannedSlot[]}
  const grouped=new Map<string,PlannedSlot[]>()
  for(const row of result){const lesson=row.lessonId?byId.get(row.lessonId):undefined;if(!lesson||lesson.activity||lesson.fixedOnly||lesson.activityGroupId||Object.keys(lesson.jointTeachingCells||{}).length)continue;const k=key(lesson.id,row.day,0);grouped.set(k,[...grouped.get(k)||[],row])}
  const units:Unit[]=[],owner=new Map<PlannedSlot,Unit>(),choices=new Map<number,ReturnType<typeof blocksFor>>()
  for(const rows of grouped.values()){
    rows.sort((a,b)=>times.findIndex(time=>!time.is_break&&time.period===a.period)-times.findIndex(time=>!time.is_break&&time.period===b.period))
    const lesson=byId.get(rows[0].lessonId!)!,length=rows.length
    if((dayCount.get(key(lesson.id,rows[0].day,0))||0)!==length||rows.some(row=>retained.has(key(row.classroomId,row.day,row.period))))continue
    if(!choices.has(length))choices.set(length,blocksFor(length,days,times).filter(block=>block.periods.every(period=>morningPeriods.has(period)===morningPeriods.has(block.periods[0]))))
    if(!choices.get(length)!.some(block=>block.day===rows[0].day&&block.periods.every((period,index)=>period===rows[index].period)))continue
    const unit={lesson,rows};units.push(unit);for(const row of rows)owner.set(row,unit)
  }
  const available=(lesson:PlannedLesson,day:number,period:number,ignore:Set<PlannedSlot>)=>{
    for(const teacher of lessonTeachers(lesson))if(blocked.has(key(teacher,day,period))||[...teacherBusy.get(key(teacher,day,period))||[]].some(row=>!ignore.has(row)))return false
    return !lesson.roomId||![...venueBusy.get(key(lesson.roomId,day,period))||[]].some(row=>!ignore.has(row))
  }
  const dayPenalty=(teacher:string,day:number,changes:Map<PlannedSlot,{day:number;period:number}>)=>{
    let first=-1,last=-1,count=0,run=0,longest=0,index=0
    for(const time of times){if(time.is_break){run=0;continue}const busy=[...teacherBusy.get(key(teacher,day,time.period))||[]].some(row=>!changes.has(row))||[...changes].some(([row,next])=>next.day===day&&next.period===time.period&&lessonTeachers(byId.get(row.lessonId!)!).includes(teacher));if(busy){if(first<0)first=index;last=index;count++;longest=Math.max(longest,++run)}else run=0;index++}
    return {gaps:first<0?0:last-first+1-count,longest}
  }
  const deadline=Date.now()+200
  for(let pass=0;pass<4;pass++){
    let improved=false
    units.sort((a,b)=>Math.max(0,...lessonTeachers(b.lesson).map(teacher=>objective==='daily'?dailyScore(teacher):penalty(teacher)))-Math.max(0,...lessonTeachers(a.lesson).map(teacher=>objective==='daily'?dailyScore(teacher):penalty(teacher))))
    for(const unit of units){
      if(Date.now()>=deadline)return result
      const from=unit.rows[0],am=morningPeriods.has(from.period),length=unit.rows.length
      let best:{changes:Map<PlannedSlot,{day:number;period:number}>;deltas:Map<string,number>}|undefined,bestDelta=-1e-6
      for(const destination of choices.get(length)||[]){
        if(Date.now()>=deadline)return result
        if((objective==='daily'?destination.day===from.day:morningPeriods.has(destination.periods[0])===am)||destination.periods.some(period=>retained.has(key(from.classroomId,destination.day,period))))continue
        const targets=destination.periods.map(period=>occupied.get(key(from.classroomId,destination.day,period))),present=targets.filter((row):row is PlannedSlot=>!!row),other=present.length?owner.get(present[0]):undefined
        if(present.length&&(!other||other===unit||present.length!==length||other.rows.length!==length||present.some(row=>owner.get(row)!==other)))continue
        if(from.day!==destination.day&&((dayCount.get(key(unit.lesson.id,destination.day,0))||0)>0||other&&(dayCount.get(key(other.lesson.id,from.day,0))||0)>0))continue
        const ignore=new Set([...unit.rows,...other?.rows||[]])
        if(destination.periods.some(period=>!available(unit.lesson,destination.day,period,ignore))||other&&unit.rows.some(row=>!available(other.lesson,row.day,row.period,ignore)))continue
        const changes=new Map<PlannedSlot,{day:number;period:number}>(),deltas=new Map<string,number>()
        unit.rows.forEach((row,index)=>changes.set(row,{day:destination.day,period:destination.periods[index]}))
        other?.rows.forEach((row,index)=>changes.set(row,{day:unit.rows[index].day,period:unit.rows[index].period}))
        let delta=0,explicitGain=0,violatesRequest=false
        for(const [row,next]of changes){const lesson=byId.get(row.lessonId!)!,change=Number(morningPeriods.has(next.period))-Number(morningPeriods.has(row.period)),request=lesson.timePreference==='morning'||!lesson.timePreference&&lesson.morning?true:lesson.timePreference==='afternoon'?false:undefined;if(request!==undefined){const before=morningPeriods.has(row.period)===request,after=morningPeriods.has(next.period)===request;if(before&&!after)violatesRequest=true;if(!before&&after)explicitGain++}delta-=lessonMorningPriority(lesson)*change;for(const teacher of lessonTeachers(lesson))deltas.set(teacher,(deltas.get(teacher)||0)+change)}
        let balanceDelta=0
        for(const [teacher,change]of deltas){const difference=objective==='daily'?dailyScore(teacher,changes)-dailyScore(teacher):penalty(teacher,stats.get(teacher)!.morning+change)-penalty(teacher);if(objective==='daily'&&difference>1e-6)violatesRequest=true;balanceDelta+=difference}
        if(objective==='daily'){
          if(balanceDelta>=-1e-6)continue
          // Daily free time can cross sessions when no explicit session is lost.
          // Allow up to two periods around the weekly morning target, while
          // never turning a mixed teacher timetable into all mornings/afternoons.
          for(const [teacher,change]of deltas){const stat=stats.get(teacher)!,next=stat.morning+change;if(Math.abs(next-stat.target)>Math.max(2,Math.abs(stat.morning-stat.target))+1e-6||stat.total>=4&&stat.morning>0&&stat.morning<stat.total&&(next===0||next===stat.total))violatesRequest=true;delta+=.15*(penalty(teacher,next)-penalty(teacher))}
        }
        if(objective==='daily'&&worsensFamilies(changes))continue
        if(violatesRequest||balanceDelta>1e-6&&!explicitGain)continue
        delta+=balanceDelta-explicitGain*1000
        if(delta>=bestDelta)continue
        let worsens=false
        if(preferences.reduceGaps||preferences.maxContinuous)for(const teacher of deltas.keys())for(const day of new Set([from.day,destination.day])){const before=dayPenalty(teacher,day,new Map()),after=dayPenalty(teacher,day,changes);if(preferences.reduceGaps&&after.gaps>before.gaps||preferences.maxContinuous&&Math.max(0,after.longest-preferences.maxContinuous)>Math.max(0,before.longest-preferences.maxContinuous))worsens=true}
        if(!worsens){best={changes,deltas};bestDelta=delta}
      }
      if(best){if(objective==='daily')for(const [row,next]of best.changes)for(const teacher of lessonTeachers(byId.get(row.lessonId!)!)){const table=daily.get(teacher)!;table.get(row.day)!.used--;table.get(next.day)!.used++}for(const row of best.changes.keys())register(row,false);for(const [row,next]of best.changes){row.day=next.day;row.period=next.period}for(const row of best.changes.keys())register(row,true);for(const [teacher,change]of best.deltas)stats.get(teacher)!.morning+=change;improved=true}
    }
    if(!improved)break
  }
  return result
}
/** Fast exact edge-colouring for dense, single-period timetables. Each lesson
 * period is an edge between a classroom and its teacher; one matching is one
 * timetable slot. Bipartite multigraphs can be coloured in max-degree rounds. */
function solveSinglePeriodMatching(lessons:PlannedLesson[],fixed:PlannedSlot[],plan:SchedulePlan,times:PeriodTimeRow[],unavailable:{teacherId:string;day:number;period:number}[]):{assignments:PlannedSlot[];message?:string}|null{
  const active=lessons.filter(l=>!l.fixedOnly&&!l.activity&&l.count>0)
  if(!active.length)return {assignments:[]}
  if(active.some(l=>!l.teacherId||l.roomId||l.morning||l.teacherIds&&l.teacherIds.length>1||l.pattern?.some(n=>n!==1)))return null
  const rooms=[...new Set(active.map(l=>l.classroomId))],roomSet=new Set(rooms),byId=new Map(lessons.map(l=>[l.id,l]))
  if(fixed.some(s=>roomSet.has(s.classroomId)&&s.lessonId&&(!byId.get(s.lessonId)?.activity)))return null
  const allSlots=plan.days.flatMap(day=>times.filter(t=>!t.is_break).map(t=>`${day}:${t.period}`))
  const roomDomains=rooms.map(room=>new Set(allSlots.filter(key=>{const [day,period]=key.split(':').map(Number);return !fixed.some(s=>s.classroomId===room&&s.day===day&&s.period===period)})))
  const common=[...roomDomains[0]].filter(key=>roomDomains.every(domain=>domain.has(key)))
  if(roomDomains.some(domain=>domain.size!==common.length)||!common.length)return null
  const teacherIds=[...new Set(active.map(l=>l.teacherId!))],blocked=new Set(unavailable.map(b=>`${b.teacherId}:${b.day}:${b.period}`))
  for(const s of fixed){const l=s.lessonId?byId.get(s.lessonId):undefined;if(l)for(const id of lessonTeachers(l))blocked.add(`${id}:${s.day}:${s.period}`)}
  const retained=new Map<string,number>();for(const s of fixed)if(s.lessonId)retained.set(s.lessonId,(retained.get(s.lessonId)||0)+1)
  const edges:{left:string;right:string;lessonId:string|null;serial:number}[]=[];let serial=0
  for(const l of active)for(let n=0;n<Math.max(0,l.count-(retained.get(l.id)||0));n++)edges.push({left:l.classroomId,right:l.teacherId!,lessonId:l.id,serial:serial++})
  const maxDegree=Math.max(0,...rooms.map(room=>edges.filter(e=>e.left===room).length),...teacherIds.map(id=>edges.filter(e=>e.right===id).length))
  if(maxDegree>common.length){const over=teacherIds.map(id=>({id,need:edges.filter(e=>e.right===id).length})).find(t=>t.need>common.length);return {assignments:[],message:over?`${lessons.find(l=>l.teacherId===over.id)?.label||'ครูผู้สอน'} ต้องสอน ${over.need} คาบ แต่ห้องที่เลือกมีเวลาร่วมกันว่าง ${common.length} คาบ`:'ภาระสอนของห้องที่เลือกมากกว่าช่องเรียนที่ว่าง'}}
  const size=Math.max(rooms.length,teacherIds.length),left=[...rooms],right=[...teacherIds]
  while(left.length<size)left.push(`__dummy_room_${left.length}`)
  while(right.length<size)right.push(`__dummy_teacher_${right.length}`)
  const degree=(side:'left'|'right',id:string)=>edges.filter(e=>e[side]===id).length
  const leftDef=left.map(id=>({id,missing:maxDegree-degree('left',id)})).filter(x=>x.missing>0).sort((a,b)=>b.missing-a.missing)
  const rightDef=right.map(id=>({id,missing:maxDegree-degree('right',id)})).filter(x=>x.missing>0).sort((a,b)=>b.missing-a.missing)
  let li=0,ri=0
  while(li<leftDef.length&&ri<rightDef.length){const count=Math.min(leftDef[li].missing,rightDef[ri].missing);for(let i=0;i<count;i++)edges.push({left:leftDef[li].id,right:rightDef[ri].id,lessonId:null,serial:serial++});leftDef[li].missing-=count;rightDef[ri].missing-=count;if(!leftDef[li].missing)li++;if(!rightDef[ri].missing)ri++}
  if(leftDef.some(x=>x.missing)||rightDef.some(x=>x.missing))return null
  const dayUse=new Map<string,number>(),allAssignments:PlannedSlot[]=[]
  const priority=new Map(lessons.map(lesson=>[lesson.id,lessonMorningPriority(lesson)]))
  const colors=[...common]
  for(let round=0;round<maxDegree;round++){
    let matched:Map<string,{left:string;edge:{left:string;right:string;lessonId:string|null;serial:number}}>|null=null
    let color=''
    const preference=edges.reduce((total,e)=>total+(e.lessonId?priority.get(e.lessonId)||0:0),0)
    if(preference)colors.sort((a,b)=>Math.sign(preference)*(Number(isMorningPeriod(Number(b.split(':')[1]),times))-Number(isMorningPeriod(Number(a.split(':')[1]),times))))
    for(let ci=0;ci<colors.length;ci++){
      const candidate=colors[ci]
      const morningSlot=isMorningPeriod(Number(candidate.split(':')[1]),times)
      const pools=edges.some(e=>e.lessonId&&(morningSlot?1:-1)*(priority.get(e.lessonId)||0)>0)?[true,false]:[false]
      for(const restrict of pools){
        const allowed=edges.filter(e=>(e.right.startsWith('__dummy_teacher_')||!blocked.has(`${e.right}:${candidate}`))&&(!restrict||!e.lessonId||(morningSlot?1:-1)*(priority.get(e.lessonId)||0)>0))
        const adj=new Map<string,typeof allowed>()
        for(const edge of allowed){const list=adj.get(edge.left)||[];list.push(edge);adj.set(edge.left,list)}
        for(const list of adj.values())list.sort((a,b)=>{const pa=a.lessonId?priority.get(a.lessonId)||0:0,pb=b.lessonId?priority.get(b.lessonId)||0:0;if(pa!==pb)return morningSlot?pb-pa:pa-pb;return Number(!a.lessonId)-Number(!b.lessonId)||a.serial-b.serial})
        const trial=new Map<string,{left:string;edge:typeof allowed[number]}>()
        function augment(room:string,seen:Set<string>):boolean{for(const edge of adj.get(room)||[]){if(seen.has(edge.right))continue;seen.add(edge.right);const old=trial.get(edge.right);if(!old||augment(old.left,seen)){trial.set(edge.right,{left:room,edge});return true}}return false}
        if(left.every(room=>augment(room,new Set()))){matched=trial;color=candidate;colors.splice(ci,1);break}
      }
      if(matched)break
    }
    if(!matched)return null
    const [day,period]=color.split(':').map(Number)
    for(const room of left){const pair=[...matched.values()].find(x=>x.left===room);if(!pair)return null
      const alternatives=edges.filter(e=>e.left===room&&e.right===pair.edge.right)
      if(!alternatives.length)return null
      const morningSlot=isMorningPeriod(period,times)
      const real=alternatives.filter(e=>e.lessonId).sort((a,b)=>{const la=byId.get(a.lessonId!)!,lb=byId.get(b.lessonId!)!,pa=priority.get(a.lessonId!)||0,pb=priority.get(b.lessonId!)||0;if(pa!==pb)return morningSlot?pb-pa:pa-pb;if(la.spread!==lb.spread)return Number(!!lb.spread)-Number(!!la.spread);return (dayUse.get(`${a.lessonId}:${day}`)||0)-(dayUse.get(`${b.lessonId}:${day}`)||0)||a.serial-b.serial})
      const chosen=real[0]||alternatives[0],index=edges.findIndex(e=>e.serial===chosen.serial);edges.splice(index,1)
      if(chosen.lessonId){allAssignments.push({classroomId:chosen.left,lessonId:chosen.lessonId,day,period});const key=`${chosen.lessonId}:${day}`;dayUse.set(key,(dayUse.get(key)||0)+1)}
    }
  }
  return {assignments:allAssignments}
}
/** Handles a common partial-rebuild case: some rooms already have fixed
 * subjects, while the remaining rooms are completely full once planned. */
function solveDenseWithRetainedRooms(lessons:PlannedLesson[],fixed:PlannedSlot[],plan:SchedulePlan,times:PeriodTimeRow[],unavailable:{teacherId:string;day:number;period:number}[],maxNodes:number,timeLimitMs:number){
  const allSlots=plan.days.flatMap(day=>times.filter(t=>!t.is_break).map(t=>`${day}:${t.period}`)),byId=new Map(lessons.map(l=>[l.id,l]))
  const priority=new Map(lessons.map(lesson=>[lesson.id,lessonMorningPriority(lesson)]))
  const fixedCounts=new Map<string,number>();for(const s of fixed)if(s.lessonId)fixedCounts.set(s.lessonId,(fixedCounts.get(s.lessonId)||0)+1)
  const tasks=lessons.filter(l=>!l.fixedOnly&&!l.activity&&l.count>(fixedCounts.get(l.id)||0)).map(l=>({lesson:l,remaining:l.count-(fixedCounts.get(l.id)||0)}))
  if(!tasks.length||tasks.some(({lesson:l})=>!l.teacherId||l.morning||l.teacherIds&&l.teacherIds.length>1||l.pattern?.some(n=>n!==1)))return null
  const rooms=[...new Set(tasks.map(t=>t.lesson.classroomId))]
  const occupiedByRoom=new Map<string,Set<string>>(),roomSlots=new Map<string,string[]>()
  for(const room of rooms){const occupied=new Set(fixed.filter(s=>s.classroomId===room).map(s=>`${s.day}:${s.period}`));occupiedByRoom.set(room,occupied);roomSlots.set(room,allSlots.filter(key=>!occupied.has(key)))}
  const remainingByRoom=new Map<string,number>();for(const room of rooms)remainingByRoom.set(room,tasks.filter(t=>t.lesson.classroomId===room).reduce((n,t)=>n+t.remaining,0))
  if(rooms.some(room=>(remainingByRoom.get(room)||0)>(roomSlots.get(room)?.length||0)))return null
  for(const room of rooms){const slack=(roomSlots.get(room)?.length||0)-(remainingByRoom.get(room)||0);for(let i=0;i<slack;i++)tasks.push({lesson:{id:`__free__:${room}:${i}`,classroomId:room,teacherId:`__free_teacher__:${room}:${i}`,count:1,label:'ว่าง'},remaining:1})}
  const teacherBlocked=new Set(unavailable.map(b=>`${b.teacherId}:${b.day}:${b.period}`)),venueBusy=new Set<string>()
  for(const s of fixed){const l=s.lessonId?byId.get(s.lessonId):undefined;if(l){for(const id of lessonTeachers(l))teacherBlocked.add(`${id}:${s.day}:${s.period}`);if(l.roomId)venueBusy.add(`${l.roomId}:${s.day}:${s.period}`)}}
  // Schedule the most constrained periods first. Chronological order is a poor
  // search heuristic when retained schedules block different teachers at
  // different times: it can commit flexible lessons early and backtrack across
  // almost the entire week before discovering a narrow period near the end.
  const searchSlots=allSlots.map((key,index)=>{
    const [day,period]=key.split(':').map(Number)
    const options=rooms.flatMap(room=>occupiedByRoom.get(room)!.has(key)?[]:tasks.filter(({lesson,remaining})=>lesson.classroomId===room&&remaining>0&&!teacherBlocked.has(`${lesson.teacherId}:${day}:${period}`)&&(!lesson.roomId||!venueBusy.has(`${lesson.roomId}:${day}:${period}`))).map(({lesson})=>`${room}:${lesson.teacherId}:${lesson.roomId||''}`))
    return {key,index,optionCount:options.length,teacherChoices:new Set(options).size}
  }).sort((a,b)=>a.optionCount-b.optionCount||a.teacherChoices-b.teacherChoices||a.index-b.index).map(slot=>slot.key)
  const teacherIds=[...new Set(tasks.map(t=>t.lesson.teacherId!).filter(id=>!id.startsWith('__free_teacher__')))],venueIds=[...new Set(tasks.map(t=>t.lesson.roomId).filter((id):id is string=>!!id))],assignedTeacher=new Set<string>(),remainingByLesson=new Map(tasks.map(t=>[t.lesson.id,t.remaining])),dayUse=new Map<string,number>(),assignments:PlannedSlot[]=[]
  const started=Date.now(),searchLimitMs=Math.min(timeLimitMs,8000),deadline=started+searchLimitMs;let nodes=0,limited:'node_limit'|'time_limit'|null=null
  function feasible(next:number){
    const future=searchSlots.slice(next)
    for(const room of rooms){const need=tasks.filter(t=>t.lesson.classroomId===room).reduce((n,t)=>n+(remainingByLesson.get(t.lesson.id)||0),0),spaces=future.filter(key=>!occupiedByRoom.get(room)!.has(key)).length;if(need>spaces)return false}
    for(const {lesson} of tasks){const need=remainingByLesson.get(lesson.id)||0;if(!need)continue;const spaces=future.filter(key=>{if(occupiedByRoom.get(lesson.classroomId)!.has(key))return false;const [day,period]=key.split(':');const tkey=`${lesson.teacherId}:${day}:${period}`;return !teacherBlocked.has(tkey)&&!assignedTeacher.has(tkey)&&(!lesson.roomId||!venueBusy.has(`${lesson.roomId}:${day}:${period}`))}).length;if(need>spaces)return false}
    for(const teacher of teacherIds){const need=tasks.filter(t=>t.lesson.teacherId===teacher).reduce((n,t)=>n+(remainingByLesson.get(t.lesson.id)||0),0);if(!need)continue;const spaces=future.filter(key=>{const [day,period]=key.split(':');const cell=`${teacher}:${day}:${period}`;return !teacherBlocked.has(cell)&&!assignedTeacher.has(cell)&&tasks.some(({lesson})=>lesson.teacherId===teacher&&!occupiedByRoom.get(lesson.classroomId)!.has(key)&&(!lesson.roomId||!venueBusy.has(`${lesson.roomId}:${day}:${period}`)))}).length;if(need>spaces)return false}
    // A shared venue can be used by only one class in each period. Check its
    // remaining demand against the remaining usable periods, or the search
    // can waste many branches before discovering that a lab has no slot left.
    for(const venue of venueIds){const need=tasks.filter(t=>t.lesson.roomId===venue).reduce((n,t)=>n+(remainingByLesson.get(t.lesson.id)||0),0);if(!need)continue;const spaces=future.filter(key=>{if(venueBusy.has(`${venue}:${key}`))return false;const [day,period]=key.split(':');return tasks.some(({lesson})=>lesson.roomId===venue&&(remainingByLesson.get(lesson.id)||0)>0&&!occupiedByRoom.get(lesson.classroomId)!.has(key)&&!teacherBlocked.has(`${lesson.teacherId}:${day}:${period}`)&&!assignedTeacher.has(`${lesson.teacherId}:${day}:${period}`))}).length;if(need>spaces)return false}
    return true
  }
  function searchSlot(index:number):boolean{
    if(++nodes>maxNodes){limited='node_limit';return false}if(Date.now()>=deadline){limited='time_limit';return false}if(index>=allSlots.length)return tasks.every(t=>remainingByLesson.get(t.lesson.id)===0)
    const key=searchSlots[index],[day,period]=key.split(':').map(Number),slotRooms=rooms.filter(room=>!occupiedByRoom.get(room)!.has(key))
    if(!slotRooms.length)return searchSlot(index+1)
    const picked:{room:string;lesson:PlannedLesson}[]=[]
    function matchRoom():boolean{
      if(++nodes>maxNodes){limited='node_limit';return false}if(Date.now()>=deadline){limited='time_limit';return false}
      if(picked.length===slotRooms.length){for(const x of picked){const id=x.lesson.id;remainingByLesson.set(id,remainingByLesson.get(id)!-1);const teacherCell=`${x.lesson.teacherId}:${day}:${period}`;assignedTeacher.add(teacherCell);if(x.lesson.roomId)venueBusy.add(`${x.lesson.roomId}:${day}:${period}`);assignments.push({classroomId:x.room,lessonId:id,day,period});const dk=`${id}:${day}`;dayUse.set(dk,(dayUse.get(dk)||0)+1)}if(feasible(index+1)&&searchSlot(index+1))return true;for(const x of picked){const id=x.lesson.id;remainingByLesson.set(id,remainingByLesson.get(id)!+1);const teacherCell=`${x.lesson.teacherId}:${day}:${period}`;assignedTeacher.delete(teacherCell);if(x.lesson.roomId)venueBusy.delete(`${x.lesson.roomId}:${day}:${period}`);assignments.pop();const dk=`${id}:${day}`;dayUse.set(dk,dayUse.get(dk)!-1)}return false}
      const usedRooms=new Set(picked.map(x=>x.room)),usedTeachers=new Set(picked.map(x=>x.lesson.teacherId)),usedVenues=new Set(picked.flatMap(x=>x.lesson.roomId?[x.lesson.roomId]:[])),options:{room:string;lesson:PlannedLesson;rank:number}[]=[]
      for(const room of slotRooms){if(usedRooms.has(room))continue;for(const t of tasks){const l=t.lesson;if(l.classroomId!==room||!l.teacherId||usedTeachers.has(l.teacherId)||(l.roomId&&(usedVenues.has(l.roomId)||venueBusy.has(`${l.roomId}:${day}:${period}`)))||(remainingByLesson.get(l.id)||0)<=0)continue;const teacherCell=`${l.teacherId}:${day}:${period}`;if(teacherBlocked.has(teacherCell)||assignedTeacher.has(teacherCell))continue;const spreadPenalty=l.spread?(dayUse.get(`${l.id}:${day}`)||0)*100:0;const morningPenalty=(isMorningPeriod(period,times)?-1:1)*(priority.get(l.id)||0)*40;options.push({room,lesson:l,rank:spreadPenalty+morningPenalty-(remainingByLesson.get(l.id)||0)})}}
      // Choose the next classroom with the fewest eligible teachers (MRV).
      const byRoom=new Map<string,typeof options>();for(const o of options){const list=byRoom.get(o.room)||[];list.push(o);byRoom.set(o.room,list)}
      const nextRoom=[...byRoom].sort((a,b)=>a[1].length-b[1].length)[0];if(!nextRoom)return false
      for(const o of nextRoom[1].sort((a,b)=>a.rank-b.rank||a.lesson.id.localeCompare(b.lesson.id))){picked.push(o);if(matchRoom())return true;picked.pop();if(limited)break}return false
    }
    if(matchRoom())return true
    return false
  }
  const lessonsByRoom=new Map<string,PlannedLesson[]>()
  for(const task of tasks){const list=lessonsByRoom.get(task.lesson.classroomId)||[];list.push(task.lesson);lessonsByRoom.set(task.lesson.classroomId,list)}
  function greedyFill():PlannedSlot[]|null{
    const rem=new Map(remainingByLesson),usedTeacher=new Set<string>(),usedVenue=new Set(venueBusy),out:PlannedSlot[]=[]
    for(const key of searchSlots){
      const [day,period]=key.split(':').map(Number),must=rooms.filter(room=>!occupiedByRoom.get(room)!.has(key))
      if(!must.length)continue
      const pending=[...must],pickedTeachers=new Set<string>(),pickedVenues=new Set<string>(),chosen:{room:string;lesson:PlannedLesson}[]=[]
      while(pending.length){
        let best=0,options:PlannedLesson[]=[]
        for(let i=0;i<pending.length;i++){const opts=(lessonsByRoom.get(pending[i])||[]).filter(l=>!!l.teacherId&&(rem.get(l.id)||0)>0&&!pickedTeachers.has(l.teacherId)&&!teacherBlocked.has(`${l.teacherId}:${day}:${period}`)&&!usedTeacher.has(`${l.teacherId}:${day}:${period}`)&&(!l.roomId||!pickedVenues.has(l.roomId)&&!usedVenue.has(`${l.roomId}:${day}:${period}`)));if(!options.length||opts.length<options.length){best=i;options=opts}}
        if(!options.length)return null
        const morningSlot=isMorningPeriod(period,times)
        options.sort((a,b)=>Number(a.id.startsWith('__free__:'))-Number(b.id.startsWith('__free__:'))||(morningSlot?-1:1)*((priority.get(a.id)||0)-(priority.get(b.id)||0))||(rem.get(b.id)||0)-(rem.get(a.id)||0))
        const lesson=options[0];chosen.push({room:pending[best],lesson});pending.splice(best,1);pickedTeachers.add(lesson.teacherId!);if(lesson.roomId)pickedVenues.add(lesson.roomId)
      }
      for(const choice of chosen){rem.set(choice.lesson.id,(rem.get(choice.lesson.id)||0)-1);usedTeacher.add(`${choice.lesson.teacherId}:${day}:${period}`);if(choice.lesson.roomId)usedVenue.add(`${choice.lesson.roomId}:${day}:${period}`);if(!choice.lesson.id.startsWith('__free__:'))out.push({classroomId:choice.room,lessonId:choice.lesson.id,day,period})}
    }
    return tasks.every(task=>task.lesson.id.startsWith('__free__:')||(rem.get(task.lesson.id)||0)===0)?out:null
  }
  const greedy=greedyFill()
  if(greedy)return {status:'complete' as const,assignments:greedy,issues:[],nodes:0,solver:'dense_slot_matching' as const,elapsedMs:Date.now()-started,timeLimitMs:searchLimitMs}
  // Near-full schools are expensive to search one period at a time: an early
  // matching can leave a teacher's last lesson with no usable cell days later.
  // Match each room independently, then repair resource collisions by swapping
  // two movable periods within that room. Quotas and fixed cells cannot change.
  function repairFill():PlannedSlot[]|null{
    type Unit={lesson:PlannedLesson;room:number;teacher:number;venue:number;allowed:number[]}
    const roomIndex=new Map(rooms.map((room,index)=>[room,index])),teacherIndex=new Map(teacherIds.map((teacher,index)=>[teacher,index])),venueIndex=new Map(venueIds.map((venue,index)=>[venue,index]))
    const slots=allSlots.map(key=>{const [day,period]=key.split(':').map(Number);return {key,day,period}}),size=slots.length,units:Unit[]=[],perRoom=rooms.map(()=>[] as number[])
    for(const {lesson,remaining} of tasks){
      const room=roomIndex.get(lesson.classroomId)!,teacher=teacherIndex.get(lesson.teacherId!)??-1,venue=lesson.roomId?venueIndex.get(lesson.roomId)!:-1
      const allowed=slots.flatMap((slot,index)=>!occupiedByRoom.get(lesson.classroomId)!.has(slot.key)&&!teacherBlocked.has(`${lesson.teacherId}:${slot.key}`)&&(!lesson.roomId||!venueBusy.has(`${lesson.roomId}:${slot.key}`))?[index]:[])
      for(let i=0;i<remaining;i++){perRoom[room].push(units.length);units.push({lesson,room,teacher,venue,allowed})}
    }
    const allowed=units.map(unit=>new Set(unit.allowed)),positions=new Int16Array(units.length),grid=rooms.map(()=>new Int32Array(size).fill(-1))
    const teacherUse=new Int16Array(teacherIds.length*size),venueUse=new Int16Array(venueIds.length*size),tabuSlot=new Int16Array(units.length).fill(-1),tabuUntil=new Int32Array(units.length)
    let randomState=0x6d2b79f5
    const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296}
    const usage=(counts:Int16Array,resource:number,slot:number)=>resource<0?0:counts[resource*size+slot]
    const update=(unit:Unit,slot:number,delta:number)=>{if(unit.teacher>=0)teacherUse[unit.teacher*size+slot]+=delta;if(unit.venue>=0)venueUse[unit.venue*size+slot]+=delta}
    const cost=(counts:Int16Array)=>counts.reduce((sum,count)=>sum+count*(count-1)/2,0)
    // Difference in pair collisions when A and B exchange their time cells.
    const difference=(counts:Int16Array,a:number,b:number,from:number,to:number)=>a===b?0:(a<0?0:usage(counts,a,to)-usage(counts,a,from)+1)+(b<0?0:usage(counts,b,from)-usage(counts,b,to)+1)
    function initialize():boolean{
      teacherUse.fill(0);venueUse.fill(0);tabuUntil.fill(0);for(const row of grid)row.fill(-1)
      const order=rooms.map((_,room)=>({room,tie:random()})).sort((a,b)=>a.tie-b.tie)
      for(const {room} of order){
        if(Date.now()>=deadline)return false
        const choices=new Map(perRoom[room].map(id=>{const unit=units[id];return [id,unit.allowed.map(slot=>({slot,rank:(usage(teacherUse,unit.teacher,slot)+usage(venueUse,unit.venue,slot))*100+(isMorningPeriod(slots[slot].period,times)?-1:1)*(priority.get(unit.lesson.id)||0)*4+random()})).sort((a,b)=>a.rank-b.rank).map(choice=>choice.slot)]}))
        const match=new Int32Array(size).fill(-1)
        const augment=(id:number,seen:Uint8Array):boolean=>{for(const slot of choices.get(id)||[]){if(seen[slot])continue;seen[slot]=1;if(match[slot]<0||augment(match[slot],seen)){match[slot]=id;return true}}return false}
        for(const id of [...perRoom[room]].sort((a,b)=>units[a].allowed.length-units[b].allowed.length))if(!augment(id,new Uint8Array(size)))return false
        for(let slot=0;slot<size;slot++)if(match[slot]>=0){const id=match[slot];grid[room][slot]=id;positions[id]=slot;update(units[id],slot,1)}
      }
      return true
    }
    if(!initialize())return null
    let score=cost(teacherUse)+cost(venueUse),best=score,lastImprovement=nodes
    while(nodes<maxNodes&&Date.now()<deadline){
      if(score===0)return units.flatMap((unit,id)=>unit.lesson.id.startsWith('__free__:')?[]:[{classroomId:unit.lesson.classroomId,lessonId:unit.lesson.id,day:slots[positions[id]].day,period:slots[positions[id]].period}])
      if(nodes-lastImprovement>Math.max(500,units.length)){
        if(!initialize())return null
        score=cost(teacherUse)+cost(venueUse);best=score;lastImprovement=nodes
      }
      nodes++
      const conflicts=units.flatMap((unit,id)=>usage(teacherUse,unit.teacher,positions[id])>1||usage(venueUse,unit.venue,positions[id])>1?[id]:[])
      if(!conflicts.length)continue
      const id=conflicts[Math.floor(random()*conflicts.length)],unit=units[id],from=positions[id]
      let target=-1,bestDelta=Infinity,ties=0
      for(const to of unit.allowed){
        const otherId=grid[unit.room][to]
        if(to===from||otherId<0||!allowed[otherId].has(from))continue
        const other=units[otherId],delta=difference(teacherUse,unit.teacher,other.teacher,from,to)+difference(venueUse,unit.venue,other.venue,from,to)
        if(score+delta>=best&&((tabuUntil[id]>nodes&&tabuSlot[id]===to)||(tabuUntil[otherId]>nodes&&tabuSlot[otherId]===from)))continue
        if(delta<bestDelta){bestDelta=delta;target=to;ties=1}else if(delta===bestDelta&&random()<1/++ties)target=to
      }
      if(target<0){tabuUntil.fill(0);continue}
      const otherId=grid[unit.room][target],other=units[otherId]
      update(unit,from,-1);update(other,target,-1);update(unit,target,1);update(other,from,1)
      grid[unit.room][from]=otherId;grid[unit.room][target]=id;positions[id]=target;positions[otherId]=from
      tabuSlot[id]=from;tabuSlot[otherId]=target;tabuUntil[id]=tabuUntil[otherId]=nodes+7+Math.floor(random()*11)
      score+=bestDelta;if(score<best){best=score;lastImprovement=nodes}
    }
    return null
  }
  const repaired=repairFill()
  if(repaired)return {status:'complete' as const,assignments:repaired,issues:[],nodes,solver:'dense_slot_matching' as const,elapsedMs:Date.now()-started,timeLimitMs:searchLimitMs}
  const solved=searchSlot(0)
  return {status:solved?'complete' as const:limited?'timeout' as const:'conflict' as const,limitReason:limited,assignments:solved?assignments.filter(slot=>!String(slot.lessonId).startsWith('__free__:')):[],issues:[],nodes,message:solved?undefined:'ครูผู้สอนที่ยังว่างไม่พอสำหรับห้องที่เลือก หรือใช้เวลาค้นหาเกินกำหนด',solver:'dense_slot_matching' as const,elapsedMs:Date.now()-started,timeLimitMs:searchLimitMs}
}
/** Place flexible activities as simultaneous multi-room events, then solve subjects.
 * A subject conflict backtracks the activity choices within the same search budget. */
function solveFlexibleActivities(lessons:PlannedLesson[],fixed:PlannedSlot[],plan:SchedulePlan,times:PeriodTimeRow[],unavailable:{teacherId:string;day:number;period:number}[],maxNodes:number,timeLimitMs:number):PlannedScheduleResult {
  const started=Date.now(),deadline=started+timeLimitMs
  const byId=new Map(lessons.map(l=>[l.id,l])),cell=(id:string,day:number,period:number)=>`${id}:${day}:${period}`
  const occupied=new Map<string,string>(),teacherBusy=new Map<string,string>(),roomBusy=new Map<string,string>()
  for(const slot of fixed){
    occupied.set(cell(slot.classroomId,slot.day,slot.period),slot.lessonId||'locked')
    const lesson=slot.lessonId?byId.get(slot.lessonId):undefined
    if(lesson){for(const id of lessonTeachers(lesson))teacherBusy.set(cell(id,slot.day,slot.period),lesson.activityGroupId||lesson.id);if(lesson.roomId)roomBusy.set(cell(lesson.roomId,slot.day,slot.period),lesson.id)}
  }
  for(const block of unavailable)teacherBusy.set(cell(block.teacherId,block.day,block.period),'unavailable')
  const groups=new Map<string,PlannedLesson[]>()
  for(const lesson of lessons.filter(l=>l.activity&&!l.fixedOnly&&l.count>0)){
    const id=lesson.activityGroupId||lesson.id
    groups.set(id,[...(groups.get(id)||[]),lesson])
  }
  const units=[...groups].map(([id,members])=>{
    const allIds=new Set(lessons.filter(l=>(l.activityGroupId||l.id)===id).map(l=>l.id))
    const mandatory=[...new Map(fixed.filter(s=>s.lessonId&&allIds.has(s.lessonId)).map(s=>[`${s.day}:${s.period}`,{day:s.day,period:s.period}])).values()]
    return {id,members,count:members[0].count,mandatory,chosen:new Set<string>(),teachers:[...new Set(members.flatMap(lessonTeachers))]}
  })
  for(const unit of units)if(unit.mandatory.length>unit.count||unit.members.some(l=>l.count!==unit.count))return {status:'conflict',assignments:[],issues:[],nodes:0,message:'กิจกรรมรวมกลุ่มมีจำนวนคาบหรือคาบล็อกไม่ตรงกัน'}
  const allCells=plan.days.flatMap(day=>times.filter(t=>!t.is_break).map(t=>({day,period:t.period})))
  const tasks=units.flatMap(unit=>[
    ...unit.mandatory.map(position=>({unit,position:position as {day:number;period:number}|null})),
    ...Array.from({length:unit.count-unit.mandatory.length},()=>({unit,position:null as {day:number;period:number}|null})),
  ])
  const added:PlannedSlot[]=[],used=new Set<number>(),lastFree=new Map<string,number>()
  let nodes=0,limitReason:'node_limit'|'time_limit'|null=null,answer:PlannedScheduleResult|null=null,sawChildTimeout=false
  function candidates(task:typeof tasks[number]){
    const {unit}=task
    return (task.position?[task.position]:allCells).filter(position=>{
      const {day,period}=position,key=`${day}:${period}`
      if(unit.chosen.has(key)||(!task.position&&unit.mandatory.some(p=>p.day===day&&p.period===period)))return false
      if(!task.position&&lastFree.has(unit.id)&&day*10+period<=lastFree.get(unit.id)!)return false
      if(unit.teachers.some(id=>{const owner=teacherBusy.get(cell(id,day,period));return owner!==undefined&&owner!==unit.id}))return false
      return unit.members.every(lesson=>{
        const owner=occupied.get(cell(lesson.classroomId,day,period))
        const placeOwner=lesson.roomId?roomBusy.get(cell(lesson.roomId,day,period)):undefined
        return (!owner||owner===lesson.id)&&(!placeOwner||placeOwner===lesson.id)
      })
    })
  }
  function search():boolean{
    if(++nodes>maxNodes){limitReason='node_limit';return false}
    if(Date.now()>=deadline){limitReason='time_limit';return false}
    if(used.size===tasks.length){
      const normalized=lessons.map(lesson=>lesson.activity&&!lesson.fixedOnly?{...lesson,fixedOnly:true}:lesson)
      const remainder=solvePlannedSchedule(normalized,[...fixed,...added],plan,times,unavailable,Math.max(0,maxNodes-nodes),Math.max(0,deadline-Date.now()))
      nodes+=remainder.nodes
      if(remainder.status==='complete'){answer={...remainder,assignments:[...added,...remainder.assignments],nodes,elapsedMs:Date.now()-started,timeLimitMs};return true}
      if(remainder.status==='timeout'){
        sawChildTimeout=true
        if(nodes>=maxNodes)limitReason='node_limit'
        else if(Date.now()>=deadline)limitReason='time_limit'
      }
      return false
    }
    let best=-1,options:{day:number;period:number}[]=[]
    for(let index=0;index<tasks.length;index++){
      if(used.has(index))continue
      // Equivalent free occurrences are indistinguishable; try them in order.
      if(!tasks[index].position&&tasks.some((task,earlier)=>earlier<index&&task.unit===tasks[index].unit&&!task.position&&!used.has(earlier)))continue
      const choices=candidates(tasks[index]);if(!choices.length)return false
      if(best<0||choices.length<options.length){best=index;options=choices}
    }
    const task=tasks[best],{unit}=task
    options.sort((a,b)=>{
      const sameDay=(day:number)=>[...unit.chosen].filter(key=>key.startsWith(day+':')).length
      return sameDay(a.day)-sameDay(b.day)||a.day-b.day||a.period-b.period
    })
    used.add(best)
    for(const position of options){
      const {day,period}=position,key=`${day}:${period}`,changes:{map:Map<string,string>;key:string}[]=[]
      const from=added.length
      const previousFree=lastFree.get(unit.id)
      if(!task.position)lastFree.set(unit.id,day*10+period)
      const remember=(map:Map<string,string>,k:string,owner:string)=>{if(!map.has(k)){map.set(k,owner);changes.push({map,key:k})}}
      unit.chosen.add(key)
      for(const lesson of unit.members){
        const k=cell(lesson.classroomId,day,period)
        if(!occupied.has(k)){remember(occupied,k,lesson.id);added.push({classroomId:lesson.classroomId,lessonId:lesson.id,day,period})}
        if(lesson.roomId)remember(roomBusy,cell(lesson.roomId,day,period),lesson.id)
      }
      for(const id of unit.teachers)remember(teacherBusy,cell(id,day,period),unit.id)
      if(search())return true
      added.length=from;unit.chosen.delete(key);for(const change of changes)change.map.delete(change.key)
      if(!task.position){if(previousFree===undefined)lastFree.delete(unit.id);else lastFree.set(unit.id,previousFree)}
      if(limitReason)break
    }
    used.delete(best)
    return false
  }
  search()
  return answer||{status:limitReason||sawChildTimeout?'timeout':'conflict',assignments:[],issues:[],nodes,limitReason:limitReason||(sawChildTimeout?'time_limit':null),elapsedMs:Date.now()-started,timeLimitMs,message:'ไม่พบช่วงว่างร่วมสำหรับกิจกรรมและรายวิชา กรุณาตรวจชั่วโมงกิจกรรม ครูไม่ว่าง และคาบล็อก'}
}

/** Bounded block search. Fixed lessons may be completed into a double block. */
export function solvePlannedSchedule(lessons:PlannedLesson[],fixed:PlannedSlot[],plan:SchedulePlan,times:PeriodTimeRow[],unavailable:{teacherId:string;day:number;period:number}[],maxNodes=SCHEDULE_SEARCH_MAX_NODES,timeLimitMs=SCHEDULE_SEARCH_TIME_LIMIT_MS):PlannedScheduleResult{
  const started=Date.now(),requestedTimeLimitMs=timeLimitMs
  let repairNodes=0
  const finish=(result:PlannedScheduleResult):PlannedScheduleResult=>{
    let assignments=result.assignments
    if(result.status==='complete'){
      assignments=improveMorningAssignments(lessons,fixed,assignments,plan.days,times,unavailable,plan)
      assignments=balanceTeacherSessions(lessons,fixed,assignments,plan.days,times,unavailable,plan)
      assignments=spreadSubjectFamilies(lessons,fixed,assignments,plan.days,times,unavailable,plan)
      assignments=balanceTeacherSessions(lessons,fixed,assignments,plan.days,times,unavailable,plan,'daily')
    }
    return {...result,assignments,nodes:result.nodes+repairNodes,elapsedMs:Date.now()-started,timeLimitMs:requestedTimeLimitMs}
  }
  const issues=checkPlanning(lessons,fixed,plan.days,times,unavailable)
  if(issues.some(i=>i.severity==='error'))return {status:'invalid' as const,assignments:[] as PlannedSlot[],issues,nodes:0}
  if(lessons.some(lesson=>!lesson.activity&&(lesson.activityGroupId||Object.keys(lesson.jointTeachingCells||{}).length))){
    const joint=solveJointTeachingSchedule(lessons,fixed,plan,times,unavailable,blocksFor,lessonMorningPriority,maxNodes,timeLimitMs)
    return finish({...joint,issues:[...issues,...joint.issues]})
  }
  if(!plan.reduceGaps&&plan.maxContinuous===0&&lessons.some(l=>!l.fixedOnly&&(l.activity||l.count>1))&&maxNodes>0&&timeLimitMs>0){
    const repairStarted=Date.now(),repair=solveBlockRepair(lessons,fixed,plan,times,unavailable,lessonMorningPriority,Math.min(maxNodes,120_000),Math.min(timeLimitMs,6000))
    if(repair?.status==='complete')return finish({...repair,issues,solver:'block_repair',timeLimitMs})
    if(repair?.status==='conflict')return finish({...repair,issues:[...issues,{severity:'error',step:6,manageStep:6,message:repair.message!,details:repair.details}],solver:'block_repair',timeLimitMs})
    repairNodes=repair?.nodes||0
    timeLimitMs=Math.max(0,timeLimitMs-(Date.now()-repairStarted));maxNodes=Math.max(0,maxNodes-repairNodes)
    if(!timeLimitMs||!maxNodes)return finish({status:'timeout',assignments:[],issues,nodes:0,solver:'block_repair',limitReason:!maxNodes?'node_limit':'time_limit'})
  }
  if(lessons.some(l=>l.activity&&!l.fixedOnly&&l.count>0))return finish(solveFlexibleActivities(lessons,fixed,plan,times,unavailable,maxNodes,timeLimitMs))
  // Most school timetables use one-period lessons. Route this common case,
  // including lessons that need a shared venue, through the slot-based solver: the general
  // block CSP rescans every subject domain at every node and can spend its
  // entire search budget rediscovering combinations the legacy solver handles
  // quickly. Keep advanced plans on the block solver below.
  const teachingPeriods=times.filter(t=>!t.is_break).map(t=>t.period)
  const singlePeriod=!plan.reduceGaps&&plan.maxContinuous===0
    &&lessons.every(l=>l.activity||l.fixedOnly||l.count<=1)
    &&lessons.every(l=>!l.morning&&(!l.pattern||l.pattern.every(n=>n===1))&&(!l.teacherIds||l.teacherIds.length<=1||l.activity))
  const fullWeek=plan.days.length===5&&[1,2,3,4,5].every((d,i)=>plan.days[i]===d)
    &&teachingPeriods.length>0&&teachingPeriods.every((p,i)=>p===i+1)
  if(singlePeriod&&maxNodes>0&&timeLimitMs>0){
    const matched=solveSinglePeriodMatching(lessons,fixed,plan,times,unavailable)
    if(matched!==null)return finish(matched.message?{status:'conflict' as const,message:matched.message,assignments:[] as PlannedSlot[],issues,nodes:0,solver:'edge_coloring',elapsedMs:Date.now()-started}:{status:'complete' as const,assignments:matched.assignments,issues,nodes:0,solver:'edge_coloring',elapsedMs:Date.now()-started})
    const dense=solveDenseWithRetainedRooms(lessons,fixed,plan,times,unavailable,maxNodes,timeLimitMs)
    if(dense)return finish({...dense,issues})
    if(fullWeek){
      const activityBlocks=fixed.flatMap(s=>{const l=s.lessonId?lessons.find(x=>x.id===s.lessonId):undefined;return l?.activity?lessonTeachers(l).map(teacherId=>({teacherId,day:s.day,period:s.period})):[]})
      const teacherBlocks=[...unavailable,...activityBlocks]
      const legacy=solveSchoolSchedule(lessons.map(l=>({id:l.id,classroomId:l.classroomId,teacherId:l.activity?null:l.teacherId,count:l.count,label:l.label,teacherOptional:l.teacherOptional||l.activity})),fixed,Math.min(maxNodes,1_000_000),teachingPeriods.length,teacherBlocks)
      if(!legacy.error)return finish({status:'complete' as const,assignments:legacy.assignments,issues,nodes:0,solver:'legacy_backtracking',elapsedMs:Date.now()-started,timeLimitMs:8000})
      const timedOut=legacy.error.includes('ค้นหาไม่ทัน')
      return finish({status:timedOut?'timeout' as const:'conflict' as const,limitReason:timedOut?'time_limit' as const:null,message:legacy.error,assignments:[] as PlannedSlot[],issues,nodes:0,solver:'legacy_backtracking'})
    }
  }
  const deadline=Date.now()+timeLimitMs;let nodes=0,limitReason:'node_limit'|'time_limit'|null=null
  const cell=(r:string,d:number,p:number)=>`${r}:${d}:${p}`
  const occupied=new Map<string,string>(),teacherBusy=new Map<string,string>(),roomBusy=new Map<string,string>(),covered=new Set<string>()
  const byId=new Map(lessons.map(l=>[l.id,l])),priority=new Map(lessons.map(lesson=>[lesson.id,lessonMorningPriority(lesson)]));const result:PlannedSlot[]=[]
  // Candidate positions depend only on the requested block length and school
  // period layout. Building them inside the recursive search dominated the
  // cost for large plans (hundreds of rooms), so prepare each length once.
  const blocksByLength=new Map<number,{day:number;periods:number[];ordinal:number}[]>()
  for(const length of new Set(lessons.flatMap(l=>l.pattern||Array(l.count).fill(1))))
    blocksByLength.set(length,blocksFor(length,plan.days,times).map((b,ordinal)=>({...b,ordinal})))
  const teachersByLesson=new Map(lessons.map(l=>[l.id,lessonTeachers(l)]))
  for(const s of fixed){const owner=s.lessonId||'locked';occupied.set(cell(s.classroomId,s.day,s.period),owner);const l=byId.get(owner);if(l)for(const id of lessonTeachers(l))teacherBusy.set(cell(id,s.day,s.period),l.activityGroupId||owner);if(l?.roomId)roomBusy.set(cell(l.roomId,s.day,s.period),owner)}
  for(const b of unavailable)teacherBusy.set(cell(b.teacherId,b.day,b.period),'unavailable')
  // Existing retained placements are already the answer for those periods.
  // Do not ask the backtracking search to rediscover them: in a six-room plan,
  // that needlessly adds every retained activity and subject period to every
  // recursive MRV scan. Single-period lessons can safely consume their current
  // placements directly. Keep the existing block search for mixed/double
  // patterns, where a retained slot must still be matched to a valid block.
  const fixedCounts=new Map<string,number>()
  for(const s of fixed)if(s.lessonId)fixedCounts.set(s.lessonId,(fixedCounts.get(s.lessonId)||0)+1)
  for(const s of fixed){
    const l=s.lessonId?byId.get(s.lessonId):undefined
    const pattern=l?.pattern||Array(l?.count||0).fill(1)
    if(l&&(l.fixedOnly||l.activity||pattern.every(length=>length===1)))covered.add(cell(s.classroomId,s.day,s.period))
  }
  const tasks=lessons.flatMap(l=>{
    if(l.fixedOnly||l.activity)return []
    const pattern=l.pattern||Array(l.count).fill(1)
    const retained=pattern.every(length=>length===1)?(fixedCounts.get(l.id)||0):0
    return pattern.slice(0,Math.max(0,pattern.length-retained)).map((length:number,index:number)=>({l,length,index}))
  }).sort((a,b)=>b.length-a.length||Number(!!b.l.roomId)-Number(!!a.l.roomId))
  const usedTask=new Set<number>();const chosen=new Map<string,number>();const chosenEquivalentBlock=new Map<string,number>()
  function candidates(task:typeof tasks[number]){const {l,length}=task,group=l.id+':'+length,last=chosenEquivalentBlock.get(group),teachers=teachersByLesson.get(l.id)||[],owner=l.activityGroupId||l.id,available:{day:number;periods:number[];ordinal:number}[]=[]
    for(const b of blocksByLength.get(length)||[]){if(last!==undefined&&b.ordinal<=last)continue;if(!l.activity&&((chosen.get(l.id+':'+b.day)||0)>0||fixed.some(row=>row.lessonId===l.id&&row.day===b.day&&!b.periods.includes(row.period))))continue;let valid=true
      for(const p of b.periods){const k=cell(l.classroomId,b.day,p),o=occupied.get(k);if((l.fixedOnly&&o!==l.id)||covered.has(k)||(o&&o!==l.id)){valid=false;break}
        for(const id of teachers){const busy=teacherBusy.get(cell(id,b.day,p));if(busy&&busy!==owner){valid=false;break}}if(!valid)break
        if(l.roomId){const roomOwner=roomBusy.get(cell(l.roomId,b.day,p));if(roomOwner&&roomOwner!==l.id){valid=false;break}}
      }
      if(valid)available.push(b)
    }return available
  }
  function rank(l:PlannedLesson,b:{day:number;periods:number[]}){let value=b.periods[0]/100-b.periods.filter(p=>occupied.get(cell(l.classroomId,b.day,p))===l.id).length*100;value+=(isMorningPeriod(b.periods[0],times)?-1:1)*(priority.get(l.id)||0)*12;if(l.spread)value+=(chosen.get(l.id+':'+b.day)||0)*10
    const occupiedPeriods=times.filter(t=>!t.is_break&&l.teacherId&&teacherBusy.has(cell(l.teacherId,b.day,t.period))).map(t=>t.period)
    if(plan.reduceGaps&&occupiedPeriods.length){const all=[...occupiedPeriods,...b.periods];value+=Math.max(...all)-Math.min(...all)+1-all.length}
    if(plan.maxContinuous&&l.teacherId){let run=0,max=0;for(const t of times){run=!t.is_break&&(occupiedPeriods.includes(t.period)||b.periods.includes(t.period))?run+1:0;max=Math.max(max,run)}value+=Math.max(0,max-plan.maxContinuous)*20}return value}
  function search():boolean{nodes++;if(nodes>maxNodes){limitReason='node_limit';return false}if(Date.now()>=deadline){limitReason='time_limit';return false}if(usedTask.size===tasks.length)return fixed.every(s=>!s.lessonId||covered.has(cell(s.classroomId,s.day,s.period)))
    let best=-1,options:ReturnType<typeof candidates>=[]
    // Keep the most constrained task first; with equal domains, give preferred
    // sessions a chance before neutral lessons consume their available cells.
    for(let i=0;i<tasks.length;i++){if(usedTask.has(i))continue;const c=candidates(tasks[i]);if(!c.length)return false;if(best<0||c.length<options.length||c.length===options.length&&Math.abs(priority.get(tasks[i].l.id)||0)>Math.abs(priority.get(tasks[best].l.id)||0)){best=i;options=c}}
    // MRV needs only domain sizes while comparing tasks. Rank (which consults
    // current teacher occupancy) only the chosen task's options.
    options.sort((a,b)=>rank(tasks[best].l,a)-rank(tasks[best].l,b))
    const {l}=tasks[best];usedTask.add(best)
    for(const b of options){const changes:{map:Map<string,string>;key:string}[]=[];const added:PlannedSlot[]=[],group=l.id+':'+tasks[best].length,previousBlock=chosenEquivalentBlock.get(group);chosenEquivalentBlock.set(group,b.ordinal)
      for(const p of b.periods){const k=cell(l.classroomId,b.day,p);covered.add(k);if(!occupied.has(k)){occupied.set(k,l.id);changes.push({map:occupied,key:k});added.push({classroomId:l.classroomId,lessonId:l.id,day:b.day,period:p})}for(const [map,id] of [...lessonTeachers(l).map(id=>[teacherBusy,id] as const),[roomBusy,l.roomId] as const]){if(id){const key=cell(id,b.day,p);if(!map.has(key)){map.set(key,map===teacherBusy?(l.activityGroupId||l.id):l.id);changes.push({map,key})}}}}
      result.push(...added);const dk=l.id+':'+b.day;chosen.set(dk,(chosen.get(dk)||0)+1)
      if(search())return true
      chosen.set(dk,chosen.get(dk)!-1);if(previousBlock===undefined)chosenEquivalentBlock.delete(group);else chosenEquivalentBlock.set(group,previousBlock);result.splice(result.length-added.length,added.length);for(const p of b.periods)covered.delete(cell(l.classroomId,b.day,p));for(const c of changes)c.map.delete(c.key);if(limitReason)break
    }usedTask.delete(best);return false
  }
  const solved=search();return finish({status:solved?'complete' as const:limitReason?'timeout' as const:'conflict' as const,limitReason,assignments:solved?result:[],issues,nodes,solver:'block_backtracking',elapsedMs:Date.now()-started,timeLimitMs})
}
