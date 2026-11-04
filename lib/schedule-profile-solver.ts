import type {PlannedLesson,PlannedSlot,PlanningIssue,PlannedScheduleResult,SchedulePlan} from './schedule-planning'
import type {PeriodTimeRow} from './schedule-helpers'
import {clockMinute,levelPeriodTimes,periodInterval,intervalsOverlap} from './schedule-period-profiles'
import {teachingEventAt,jointTeachingSlotErrors} from './schedule-joint-teaching'
import {subjectDayIssue} from './schedule-subject-days'
import {solveBlockRepair} from './schedule-block-repair'
type Block={teacherId:string;day:number;period:number}
const staff=(l:PlannedLesson)=>l.teacherIds??(l.teacherId?[l.teacherId]:[])
const same=(a:PlannedSlot,b:PlannedSlot)=>a.classroomId===b.classroomId&&a.day===b.day&&a.period===b.period&&a.lessonId===b.lessonId
function interval(l:PlannedLesson|undefined,period:number,times:PeriodTimeRow[]){return periodInterval(levelPeriodTimes(times,l?.classroomLevel||''),period)}
function conflict(a:PlannedSlot,b:PlannedSlot,byId:Map<string,PlannedLesson>,times:PeriodTimeRow[]) {
 if(a.day!==b.day||same(a,b))return false
 if(a.classroomId===b.classroomId)return a.period===b.period
 const la=byId.get(a.lessonId||''),lb=byId.get(b.lessonId||'');if(!la||!lb)return false
 const ta=interval(la,a.period,times),tb=interval(lb,b.period,times)
 if(!ta||!tb||!intervalsOverlap(ta,tb))return false
 const shared=teachingEventAt(la,a.day,a.period)===teachingEventAt(lb,b.day,b.period)&&ta.start===tb.start&&ta.end===tb.end
 return !shared&&(staff(la).some(id=>staff(lb).includes(id))||!!la.roomId&&la.roomId===lb.roomId)
}
export function profileTeacherConflicts(lessons:PlannedLesson[],rows:PlannedSlot[],times:PeriodTimeRow[]){
 const byId=new Map(lessons.map(l=>[l.id,l])),result:{teacherId:string;day:number;period:number;lessonIds:string[]}[]=[]
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(conflict(rows[i],rows[j],byId,times)){
  const a=byId.get(rows[i].lessonId||''),b=byId.get(rows[j].lessonId||'');if(!a||!b)continue
  for(const teacherId of staff(a).filter(id=>staff(b).includes(id)))result.push({teacherId,day:rows[i].day,period:rows[i].period,lessonIds:[a.id,b.id]})
 }
 return result
}
export function checkProfilePlanning(lessons:PlannedLesson[],fixed:PlannedSlot[],days:number[],times:PeriodTimeRow[],blocks:Block[]):PlanningIssue[]{
 const issues:PlanningIssue[]=[],byId=new Map(lessons.map(l=>[l.id,l]))
 const error=(message:string,code?:PlanningIssue['code'])=>issues.push({severity:'error',message,step:6,code})
 for(const [i,row]of fixed.entries()){
  const l=byId.get(row.lessonId||''),time=interval(l,row.period,times)
  if(!days.includes(row.day)||!time)error('คาบเดิมอยู่นอกวันหรือเวลาเรียนของระดับชั้น','fixed_outside')
  if(row.lessonId&&!l)error('ไม่พบวิชาของคาบเดิม','fixed_unknown_lesson')
  if(l&&l.classroomId!==row.classroomId)error(`${l.label} ไม่ตรงกับห้องเรียน`,'fixed_classroom_mismatch')
  if(fixed.slice(0,i).some(other=>conflict(row,other,byId,times)))error(`${l?.label||'คาบเดิม'} ชนกับคาบอื่นเมื่อเทียบเวลาจริง`,'fixed_teacher_conflict')
  if(l&&time&&blocks.some(b=>b.day===row.day&&staff(l).includes(b.teacherId)&&!!periodInterval(times,b.period)&&intervalsOverlap(time,periodInterval(times,b.period)!)))error(`${l.label} ตรงกับเวลาที่ครูล็อกไม่ว่าง`,'fixed_teacher_conflict')
 }
 for(const l of lessons){
  if(!staff(l).length&&!l.teacherOptional&&l.count>0)error(`${l.label} ยังไม่มีครู`)
  if(!Number.isInteger(l.count)||l.count<0)error(`${l.label} จำนวนคาบไม่ถูกต้อง`)
  if(l.pattern&&(l.pattern.reduce((a,b)=>a+b,0)!==l.count||l.pattern.some(n=>!Number.isInteger(n)||n<1)))error(`${l.label} รูปแบบคาบรวมไม่ตรงภาระสอน`)
  if(fixed.filter(row=>row.lessonId===l.id).length>l.count)error(`${l.label} คาบเดิมเกินเป้าหมาย`,'fixed_over_quota')
  const dayIssue=subjectDayIssue(l,fixed,days,levelPeriodTimes(times,l.classroomLevel||''));if(dayIssue)error(dayIssue,'subject_day')
 }
 for(const message of jointTeachingSlotErrors(lessons,fixed))error(message,'fixed_joint_mismatch')
 const sharedTimes=new Map<string,string>()
 for(const row of fixed){const l=byId.get(row.lessonId||'');if(!l)continue;const key=`${teachingEventAt(l,row.day,row.period)}:${row.day}:${row.period}`,time=interval(l,row.period,times),clock=time?`${time.start}-${time.end}`:'';if(sharedTimes.has(key)&&sharedTimes.get(key)!==clock)error(`${l.label} สอนรวมได้เฉพาะเวลาที่เริ่มและสิ้นสุดตรงกันทุกห้อง`,'fixed_joint_mismatch');sharedTimes.set(key,clock)}
 for(const room of new Set(lessons.map(l=>l.classroomId))){const local=lessons.filter(l=>l.classroomId===room),capacity=levelPeriodTimes(times,local[0]?.classroomLevel||'').filter(t=>!t.is_break).length*days.length;if(local.reduce((sum,l)=>sum+l.count,0)+fixed.filter(row=>row.classroomId===room&&!row.lessonId).length>capacity)error(`${local[0]?.label.split(' · ')[0]} มีคาบเกินเวลาเรียนของระดับชั้น`)}
 return issues
}
/** Separate bell schedules use real intervals for shared teachers and venues. */
export function solveProfileSchedule(lessons:PlannedLesson[],fixed:PlannedSlot[],plan:SchedulePlan,times:PeriodTimeRow[],blocks:Block[],maxNodes:number,timeLimitMs:number):PlannedScheduleResult{
 const started=Date.now(),issues=checkProfilePlanning(lessons,fixed,plan.days,times,blocks),byId=new Map(lessons.map(l=>[l.id,l]))
 const result=(status:PlannedScheduleResult['status'],rows:PlannedSlot[],nodes:number):PlannedScheduleResult=>({status,assignments:rows,issues,nodes,elapsedMs:Date.now()-started,timeLimitMs,solver:'profile_backtracking'})
 if(issues.some(issue=>issue.severity==='error'))return result('invalid',[],0)
 // Shared bell boundaries can use the existing fast block solver on a common
 // clock axis. A room's lunch is an unavailable room cell on that axis.
 if(!lessons.some(l=>Object.keys(l.jointTeachingCells||{}).length)){
  const clocks=new Map<string,PeriodTimeRow>()
  for(const rows of [times,...Object.values(times.find(row=>row.profiles)?.profiles||{})])for(const row of rows||[])if(!row.is_break)clocks.set(`${row.start_time}-${row.end_time}`,row)
  const axis=[...clocks.values()].sort((a,b)=>a.start_time.localeCompare(b.start_time)).map((row,i)=>({...row,profiles:undefined,period:i+1,is_break:false,sort_order:i+1}))
  if(!axis.some((a,i)=>axis.slice(i+1).some(b=>a.start_time<b.end_time&&b.start_time<a.end_time))){
   const levels=new Map(lessons.map(l=>[l.classroomId,l.classroomLevel||'']))
   const toAxis=(room:string,period:number)=>{const source=levelPeriodTimes(times,levels.get(room)||'').find(t=>!t.is_break&&t.period===period);return axis.find(t=>t.start_time===source?.start_time&&t.end_time===source?.end_time)?.period}
   const fromAxis=(room:string,period:number)=>{const source=axis.find(t=>t.period===period);return levelPeriodTimes(times,levels.get(room)||'').find(t=>!t.is_break&&t.start_time===source?.start_time&&t.end_time===source?.end_time)?.period}
   const retained=fixed.map(row=>({...row,period:toAxis(row.classroomId,row.period)||0})),mappedBlocks=blocks.map(block=>{const source=times.find(t=>!t.is_break&&t.period===block.period);return {...block,period:axis.find(t=>t.start_time===source?.start_time&&t.end_time===source?.end_time)?.period||0}})
   if(retained.every(row=>row.period)&&mappedBlocks.every(row=>row.period)){
    for(const room of levels.keys())for(const day of plan.days)for(const clock of axis)if(!fromAxis(room,clock.period))retained.push({classroomId:room,lessonId:null,day,period:clock.period})
    const fast=solveBlockRepair(lessons,retained,plan,axis,mappedBlocks,l=>l.morning||l.preferMorning?2:l.timePreference==='afternoon'?-2:0,Math.min(maxNodes,120000),Math.min(timeLimitMs,6000))
    if(fast?.status==='complete'){
     const mapped=[...fixed,...fast.assignments.map(row=>({...row,period:fromAxis(row.classroomId,row.period)||0}))]
     if(mapped.every(row=>row.period)&&lessons.every(l=>mapped.filter(row=>row.lessonId===l.id).length===l.count)&&!checkProfilePlanning(lessons,mapped,plan.days,times,blocks).length)return result('complete',mapped,fast.nodes)
    }
   }
  }
 }
 type Task={lessons:PlannedLesson[];size:number;choices:PlannedSlot[][]}
 const tasks:Task[]=[],grouped=new Set<string>()
 for(const l of lessons){
  if(l.fixedOnly||grouped.has(l.id))continue
  const group=l.activityGroupId?lessons.filter(other=>other.activityGroupId===l.activityGroupId):[l];group.forEach(item=>grouped.add(item.id))
  if(group.some(item=>item.count!==l.count)){issues.push({severity:'error',step:4,message:'กิจกรรมสอนรวมต้องมีจำนวนคาบตรงกันทุกห้อง'});return result('invalid',[],0)}
  const pattern=l.pattern||Array(l.count).fill(1)
  for(const size of pattern){
   const choices:PlannedSlot[][]=[],local=levelPeriodTimes(times,l.classroomLevel||'')
   for(const day of plan.days)for(let i=0;i<local.length;i++){
    const run=local.slice(i,i+size);if(run.length!==size||run.some(t=>t.is_break)||run.some((t,j)=>j>0&&run[j-1].end_time!==t.start_time))continue
    if(group.some(item=>run.some(t=>{const other=interval(item,t.period,times);return !other||other.start!==clockMinute(t.start_time)||other.end!==clockMinute(t.end_time)})))continue
    const rows=group.flatMap(item=>run.map(t=>({classroomId:item.classroomId,lessonId:item.id,day,period:t.period})))
    if(group.some(item=>{const locked=fixed.filter(row=>row.lessonId===item.id&&row.day===day);return locked.some(row=>!rows.some(next=>same(row,next)))}))continue
    if(rows.some(row=>{const item=byId.get(row.lessonId!)!,time=interval(item,row.period,times)!;return fixed.some(other=>conflict(row,other,byId,times))||blocks.some(b=>b.day===day&&staff(item).includes(b.teacherId)&&!!periodInterval(times,b.period)&&intervalsOverlap(time,periodInterval(times,b.period)!))}))continue
    choices.push(rows)
   }
   tasks.push({lessons:group,size,choices})
  }
 }
 const minuteEdges=[...new Set([times,...Object.values(times.find(row=>row.profiles)?.profiles||{})].flatMap(rows=>(rows||[]).flatMap(row=>[clockMinute(row.start_time),clockMinute(row.end_time)])))].sort((a,b)=>a-b)
 const tokens=(day:number,start:number,end:number)=>minuteEdges.slice(0,-1).flatMap((edge,i)=>edge<end&&minuteEdges[i+1]>start?[`${day}:${i}`]:[])
 type Resource={key:string;owner:string}
 const occupancy=new Map<string,{owner:string;count:number}>(),fixedKeys=new Set(fixed.map(row=>`${row.lessonId}:${row.day}:${row.period}`))
 const resources=(row:PlannedSlot):Resource[]=>{
  const l=byId.get(row.lessonId||''),clock=interval(l,row.period,times),owner=row.lessonId||'locked-empty',result=[{key:`class:${row.classroomId}:${row.day}:${row.period}`,owner}]
  if(!l||!clock)return result
  const event=`${teachingEventAt(l,row.day,row.period)}:${clock.start}:${clock.end}`
  for(const cell of tokens(row.day,clock.start,clock.end)){
   for(const id of staff(l))result.push({key:`teacher:${id}:${cell}`,owner:event})
   if(l.roomId)result.push({key:`venue:${l.roomId}:${cell}`,owner:event})
  }
  return result
 }
 function occupy(items:Resource[],delta:number){for(const item of items){const old=occupancy.get(item.key),count=(old?.count||0)+delta;if(count)occupancy.set(item.key,{owner:item.owner,count});else occupancy.delete(item.key)}}
 for(const row of fixed)occupy(resources(row),1)
 for(const block of blocks){const clock=periodInterval(times,block.period);if(clock)occupy(tokens(block.day,clock.start,clock.end).map(cell=>({key:`teacher:${block.teacherId}:${cell}`,owner:'unavailable'})),1)}
 const candidateResources=new Map<PlannedSlot[],Resource[]>(),extraRows=new Map<PlannedSlot[],PlannedSlot[]>()
 for(const task of tasks)for(const choice of task.choices){candidateResources.set(choice,choice.flatMap(resources));extraRows.set(choice,choice.filter(row=>!fixedKeys.has(`${row.lessonId}:${row.day}:${row.period}`)))}
 let nodes=0,timedOut=false;let answer:PlannedSlot[]|null=null
 const selected=new Set<Task>(),usedDays=new Set<string>(),usedCells=new Set<string>(),counts=new Map(lessons.map(l=>[l.id,fixed.filter(row=>row.lessonId===l.id).length]))
 const cellKey=(row:PlannedSlot)=>`${row.lessonId}:${row.day}:${row.period}`
 function fits(task:Task,choice:PlannedSlot[]){
  return !choice.some(row=>usedCells.has(cellKey(row)))&&task.lessons.every(l=>l.activity||!usedDays.has(`${l.id}:${choice[0].day}`))
   &&candidateResources.get(choice)!.every(item=>!occupancy.has(item.key)||occupancy.get(item.key)!.owner===item.owner)
   &&task.lessons.every(l=>(counts.get(l.id)||0)+extraRows.get(choice)!.filter(row=>row.lessonId===l.id).length<=l.count)
 }
 function search(rows:PlannedSlot[]):boolean{
  if(++nodes>maxNodes||Date.now()-started>timeLimitMs){timedOut=true;return false}
  if(selected.size===tasks.length){if(lessons.every(l=>counts.get(l.id)===l.count)&&!jointTeachingSlotErrors(lessons,rows).length){answer=rows;return true}return false}
  let next:Task|undefined,options:PlannedSlot[][]=[]
  for(const task of tasks){if(selected.has(task))continue;const possible=task.choices.filter(choice=>fits(task,choice));if(!possible.length)return false;if(!next||possible.length<options.length){next=task;options=possible}}
  if(!next)return false
  const task=next,dayLoad=new Map<string,number>(),sessionLoad=new Map<string,number>()
  for(const row of rows){const l=byId.get(row.lessonId||'');if(!l)continue;const clock=interval(l,row.period,times),lunch=levelPeriodTimes(times,l.classroomLevel||'').find(t=>t.is_break),session=clock&&lunch&&clock.start>=clockMinute(lunch.end_time)?'afternoon':'morning';for(const id of staff(l)){const key=id+':'+row.day;dayLoad.set(key,(dayLoad.get(key)||0)+1);sessionLoad.set(id+':'+session,(sessionLoad.get(id+':'+session)||0)+1)}}
  function score(choice:PlannedSlot[]){
   const day=choice[0].day,teachers=new Set(task.lessons.flatMap(staff)),lesson=task.lessons[0],time=interval(lesson,choice[0].period,times)!,lunch=levelPeriodTimes(times,lesson.classroomLevel||'').find(t=>t.is_break),afternoon=!!lunch&&time.start>=clockMinute(lunch.end_time)
   const wrongSession=lesson.timePreference==='afternoon'?!afternoon:(lesson.morning||lesson.preferMorning||lesson.timePreference==='morning')?afternoon:false
   let score=-choice.filter(row=>fixedKeys.has(cellKey(row))).length*100+(wrongSession?4:0)
   for(const id of teachers){score+=(dayLoad.get(id+':'+day)||0)*3+(sessionLoad.get(id+':'+(afternoon?'afternoon':'morning'))||0)*0.5}
   return score
  }
  options.sort((a,b)=>score(a)-score(b));selected.add(task)
  for(const choice of options){
   const day=choice[0].day,extra=extraRows.get(choice)!,items=candidateResources.get(choice)!
   task.lessons.filter(l=>!l.activity).forEach(l=>usedDays.add(`${l.id}:${day}`));choice.forEach(row=>usedCells.add(cellKey(row)));occupy(items,1);extra.forEach(row=>counts.set(row.lessonId!,(counts.get(row.lessonId!)||0)+1))
   if(search([...rows,...extra]))return true
   extra.forEach(row=>counts.set(row.lessonId!,counts.get(row.lessonId!)!-1));occupy(items,-1);task.lessons.filter(l=>!l.activity).forEach(l=>usedDays.delete(`${l.id}:${day}`));choice.forEach(row=>usedCells.delete(cellKey(row)));if(timedOut)break
  }
  selected.delete(task);return false
 }
 search([...fixed]);return result(answer?'complete':timedOut?'timeout':'conflict',answer||[],nodes)
}
