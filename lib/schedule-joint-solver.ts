import {teachingEventAt} from './schedule-joint-teaching'
import type {PlannedLesson, PlannedSlot, PlannedScheduleResult, SchedulePlan} from './schedule-planning'
import type {PeriodTimeRow} from './schedule-helpers'
import {solveBlockRepair} from './schedule-block-repair'

type Block={day:number;periods:number[]}
const teachers=(lesson:PlannedLesson)=>lesson.teacherIds??(lesson.teacherId?[lesson.teacherId]:[])
const owner=(lesson:PlannedLesson)=>lesson.activityGroupId||lesson.id

/** Multi-class offerings are indivisible search units. The ordinary fast
 * graph solvers remain unchanged for schools without joint teaching. */
export function solveJointTeachingSchedule(lessons:PlannedLesson[],fixed:PlannedSlot[],plan:SchedulePlan,times:PeriodTimeRow[],unavailable:{teacherId:string;day:number;period:number}[],blocksFor:(n:number,days:number[],times:PeriodTimeRow[])=>Block[],priority:(lesson:PlannedLesson)=>number,maxNodes:number,timeLimitMs:number):PlannedScheduleResult {
  const started=Date.now(),deadline=started+timeLimitMs
  let nodes=0,limitReason:'node_limit'|'time_limit'|null=null
  if(lessons.length>=40&&maxNodes>0&&timeLimitMs>0){
    const repaired=solveBlockRepair(lessons,fixed,plan,times,unavailable,priority,Math.min(maxNodes,120000),Math.min(timeLimitMs,6000))
    if(repaired?.status==='complete')return {...repaired,issues:[],solver:'block_repair'}
    if(repaired?.status==='conflict')return {...repaired,issues:[{severity:'error',step:6,manageStep:6,message:repaired.message!,details:repaired.details}],solver:'block_repair'}
    nodes=repaired?.nodes||0
  }
  const byId=new Map(lessons.map(lesson=>[lesson.id,lesson])),cell=(r:string,d:number,p:number)=>`${r}:${d}:${p}`
  const occupied=new Map<string,string>(),busy=new Map<string,string>(),venues=new Map<string,string>(),covered=new Set<string>(),result:PlannedSlot[]=[]
  const fixedByLesson=new Map<string,Set<string>>()
  for(const row of fixed){
    const lesson=row.lessonId?byId.get(row.lessonId):undefined
    occupied.set(cell(row.classroomId,row.day,row.period),row.lessonId||'locked-empty')
    if(!lesson)continue
    const keys=fixedByLesson.get(lesson.id)||new Set<string>();keys.add(`${row.day}:${row.period}`);fixedByLesson.set(lesson.id,keys)
    if(lesson.fixedOnly)covered.add(cell(row.classroomId,row.day,row.period))
    for(const teacher of teachers(lesson))busy.set(cell(teacher,row.day,row.period),teachingEventAt(lesson,row.day,row.period))
    if(lesson.roomId)venues.set(cell(lesson.roomId,row.day,row.period),teachingEventAt(lesson,row.day,row.period))
  }
  for(const block of unavailable)busy.set(cell(block.teacherId,block.day,block.period),'unavailable')
  const groups=new Map<string,PlannedLesson[]>()
  for(const lesson of lessons)if(!lesson.fixedOnly&&lesson.count>0)groups.set(owner(lesson),[...groups.get(owner(lesson))||[],lesson])
  const units=[...groups].map(([id,members])=>({id,members,pattern:members[0].activity?Array(members[0].count).fill(1):members[0].pattern||Array(members[0].count).fill(1),priority:members.reduce((n,l)=>n+priority(l),0)/members.length}))
  const tasks=units.flatMap(unit=>{
    if(unit.members.every(lesson=>(fixedByLesson.get(lesson.id)?.size||0)===lesson.count)){
      for(const lesson of unit.members)for(const key of fixedByLesson.get(lesson.id)||[])covered.add(`${lesson.classroomId}:${key}`)
      return []
    }
    const common=[...fixedByLesson.get(unit.members[0].id)||[]].filter(key=>unit.members.every(lesson=>fixedByLesson.get(lesson.id)?.has(key)))
    const retained=unit.pattern.every(n=>n===1)?common.length:0
    if(retained)for(const lesson of unit.members)for(const key of common)covered.add(`${lesson.classroomId}:${key}`)
    return unit.pattern.slice(retained).map((length,index)=>({unit,length,index}))
  })
  const domains=new Map([...new Set(tasks.map(task=>task.length))].map(length=>[length,blocksFor(length,plan.days,times).map((block,ordinal)=>({...block,ordinal}))]))
  const used=new Set<number>(),equivalent=new Map<string,number>(),dayUse=new Map<string,number>()
  function candidates(task:typeof tasks[number]){
    const last=equivalent.get(`${task.unit.id}:${task.length}`)
    return (domains.get(task.length)||[]).filter(block=>(last===undefined||block.ordinal>last)&&task.unit.members.every(lesson=>(lesson.activity||(!(dayUse.get(`${lesson.id}:${block.day}`)||0)&&![...fixedByLesson.get(lesson.id)||[]].some(key=>{const [day,period]=key.split(':').map(Number);return day===block.day&&!block.periods.includes(period)})))&&block.periods.every(period=>{
      const key=cell(lesson.classroomId,block.day,period),existing=occupied.get(key)
      if(covered.has(key)||existing&&existing!==lesson.id)return false
      if(teachers(lesson).some(teacher=>{const held=busy.get(cell(teacher,block.day,period));return held&&held!==teachingEventAt(lesson,block.day,period)}))return false
      const held=lesson.roomId?venues.get(cell(lesson.roomId,block.day,period)):undefined
      return !held||held===teachingEventAt(lesson,block.day,period)
    })))
  }
  const breakAt=times.findIndex(time=>time.is_break)
  function rank(task:typeof tasks[number],block:Block){
    const first=times.findIndex(time=>!time.is_break&&time.period===block.periods[0]),morning=breakAt<0?first<Math.ceil(times.filter(t=>!t.is_break).length/2):first<breakAt
    let score=(morning?-1:1)*task.unit.priority*12+block.periods[0]/100
    for(const lesson of task.unit.members){
      if(lesson.spread)score+=(dayUse.get(`${lesson.id}:${block.day}`)||0)*10
      for(const period of block.periods)if(occupied.get(cell(lesson.classroomId,block.day,period))===lesson.id)score-=100
    }
    for(const teacher of new Set(task.unit.members.flatMap(teachers))){
      const periods=new Set(times.filter(time=>!time.is_break&&busy.has(cell(teacher,block.day,time.period))&&busy.get(cell(teacher,block.day,time.period))!=='unavailable').map(time=>time.period))
      for(const period of block.periods)periods.add(period)
      let run=0,first=-1,last=-1
      for(let i=0;i<=times.length;i++){
        const time=times[i]
        if(!time||time.is_break){if(plan.reduceGaps&&first>=0)score+=(last-first+1-times.slice(first,last+1).filter(time=>periods.has(time.period)).length)*2;first=-1;last=-1;run=0;continue}
        if(periods.has(time.period)){if(first<0)first=i;last=i;run++;if(plan.maxContinuous&&run>plan.maxContinuous)score+=5}else run=0
      }
    }
    return score
  }
  function search():boolean{
    if(++nodes>maxNodes){limitReason='node_limit';return false}
    if(Date.now()>=deadline){limitReason='time_limit';return false}
    if(used.size===tasks.length)return fixed.every(row=>!row.lessonId||covered.has(cell(row.classroomId,row.day,row.period)))
    let best=-1,options:ReturnType<typeof candidates>=[]
    for(let i=0;i<tasks.length;i++){
      if(used.has(i)||tasks.some((task,j)=>j<i&&!used.has(j)&&task.unit===tasks[i].unit&&task.length===tasks[i].length))continue
      const available=candidates(tasks[i]);if(!available.length)return false
      if(best<0||available.length<options.length||available.length===options.length&&Math.abs(tasks[i].unit.priority)>Math.abs(tasks[best].unit.priority)){best=i;options=available}
    }
    const task=tasks[best],key=`${task.unit.id}:${task.length}`,previous=equivalent.get(key);used.add(best)
    options.sort((a,b)=>rank(task,a)-rank(task,b))
    for(const block of options){
      const changes:{map:Map<string,string>;key:string}[]=[],positions:string[]=[],start=result.length
      equivalent.set(key,block.ordinal)
      for(const lesson of task.unit.members){
        for(const period of block.periods){
          const position=cell(lesson.classroomId,block.day,period);covered.add(position);positions.push(position)
          if(!occupied.has(position)){occupied.set(position,lesson.id);changes.push({map:occupied,key:position});result.push({classroomId:lesson.classroomId,lessonId:lesson.id,day:block.day,period})}
          for(const [map,id]of [...teachers(lesson).map(id=>[busy,id]as const),[venues,lesson.roomId]as const])if(id){const k=cell(id,block.day,period);if(!map.has(k)){map.set(k,teachingEventAt(lesson,block.day,period));changes.push({map,key:k})}}
        }
        const dayKey=`${lesson.id}:${block.day}`;dayUse.set(dayKey,(dayUse.get(dayKey)||0)+1)
      }
      if(search())return true
      result.splice(start);positions.forEach(key=>covered.delete(key));changes.forEach(({map,key})=>map.delete(key))
      for(const lesson of task.unit.members){const dayKey=`${lesson.id}:${block.day}`;dayUse.set(dayKey,dayUse.get(dayKey)!-1)}
      if(limitReason)break
    }
    if(previous===undefined)equivalent.delete(key);else equivalent.set(key,previous)
    used.delete(best);return false
  }
  const complete=search()
  return {status:complete?'complete':limitReason?'timeout':'conflict',assignments:complete?result:[],issues:[],nodes,limitReason,solver:'block_backtracking',elapsedMs:Date.now()-started,timeLimitMs}
}
