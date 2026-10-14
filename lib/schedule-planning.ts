import type { ActivityTeam } from './schedule-activity-teams'
import { solveSchoolSchedule } from './schedule-solver'
const lessonTeachers=(l:{teacherId:string|null;teacherIds?:string[]})=>l.teacherIds??(l.teacherId?[l.teacherId]:[])
import type { PeriodTimeRow } from './schedule-helpers'
export type LessonRule = { count: number; pattern: number[]; roomId: string | null; morning: boolean; spread: boolean }
export type SchedulePlan = { days: number[]; rooms: { id: string; name: string }[]; rules: Record<string, LessonRule>; reduceGaps: boolean; maxContinuous: number; teacherIds?: string[]; activityGroups?: ActivityTeam[] }
export type PlannedLesson = { id: string; classroomId: string; teacherId: string | null; count: number; label: string; activity?: boolean; teacherOptional?: boolean; roomId?: string | null; pattern?: number[]; morning?: boolean; spread?: boolean; fixedOnly?: boolean; teacherIds?: string[]; activityGroupId?: string }
export type PlannedSlot = { classroomId: string; lessonId: string | null; day: number; period: number }
export type PlanningIssue = { severity: 'error' | 'warning'; message: string; step: number }
export type PlannedScheduleResult = {status:'invalid'|'complete'|'timeout'|'conflict';assignments:PlannedSlot[];issues:PlanningIssue[];nodes:number;limitReason?:'node_limit'|'time_limit'|null;message?:string;solver?:'edge_coloring'|'dense_slot_matching'|'legacy_backtracking'|'block_backtracking';elapsedMs?:number;timeLimitMs?:number}
export const SCHEDULE_SEARCH_MAX_NODES = 2_000_000
export const SCHEDULE_SEARCH_TIME_LIMIT_MS = 45_000
export const emptyPlan = (): SchedulePlan => ({ days: [1,2,3,4,5], rooms: [], rules: {}, reduceGaps: false, maxContinuous: 0 })
export function validatePlan(plan: SchedulePlan, lessonIds: string[]) {
  if (!Array.isArray(plan.days) || !plan.days.length || new Set(plan.days).size !== plan.days.length || plan.days.some(d=>!Number.isInteger(d)||d<1||d>5)) throw Error('เลือกวันเรียนจันทร์–ศุกร์อย่างน้อยหนึ่งวัน')
  if (!Array.isArray(plan.rooms) || plan.rooms.length>500 || new Set(plan.rooms.map(r=>r.id)).size!==plan.rooms.length || plan.rooms.some(r=>!/^[-0-9a-f]{36}$/i.test(r.id)||!r.name.trim()||r.name.length>100)) throw Error('ข้อมูลห้องสถานที่ไม่ถูกต้อง')
  if (typeof plan.reduceGaps!=='boolean' || !Number.isInteger(plan.maxContinuous)||plan.maxContinuous<0||plan.maxContinuous>8) throw Error('เงื่อนไขคาบต่อเนื่องไม่ถูกต้อง')
  if (!plan.rules || typeof plan.rules!=='object') throw Error('ข้อมูลภาระสอนไม่ถูกต้อง')
  if (plan.teacherIds && (!Array.isArray(plan.teacherIds) || plan.teacherIds.length>1000 || new Set(plan.teacherIds).size!==plan.teacherIds.length || plan.teacherIds.some(id=>!/^[-0-9a-f]{36}$/i.test(id)))) throw Error('รายการครูที่เลือกไม่ถูกต้อง')
  for(const [id,r] of Object.entries(plan.rules)) {
    if (!lessonIds.includes(id) || !Number.isInteger(r.count)||r.count<1||r.count>40 || !Array.isArray(r.pattern)||!r.pattern.length||r.pattern.some(n=>!Number.isInteger(n)||n<1||n>8)||r.pattern.reduce((a,b)=>a+b,0)!==r.count) throw Error('ภาระสอนและผลรวมรูปแบบคาบต้องตรงกัน')
    if (r.roomId && !plan.rooms.some(room=>room.id===r.roomId)) throw Error('ไม่พบห้องสถานที่ที่เลือก')
    if(typeof r.morning!=='boolean'||typeof r.spread!=='boolean')throw Error('เงื่อนไขรายวิชาไม่ถูกต้อง')
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
  const occupied=new Set<string>(),teachers=new Map<string,string>(),places=new Set<string>()
  for(const slot of fixed){const l=lessons.find(l=>l.id===slot.lessonId);const key=`${slot.day}:${slot.period}`
    if(!days.includes(slot.day)||!periods.includes(slot.period))err('คาบเดิมอยู่นอกวันหรือเวลาที่เลือก',1)
    if(occupied.has(slot.classroomId+':'+key))err('มีคาบนักเรียนซ้ำ');occupied.add(slot.classroomId+':'+key)
    if(slot.lessonId&&!l)err('คาบเดิมอ้างถึงรายวิชาที่ไม่พบ',3)
    if(l)for(const id of lessonTeachers(l)){const owner=l.activityGroupId||l.id,busy=teachers.get(id+':'+key);if((busy&&busy!==owner)||unavailable.some(b=>b.teacherId===id&&b.day===slot.day&&b.period===slot.period))err(l.label+' ครูชนหรือไม่ว่าง',4);teachers.set(id+':'+key,owner)}
    if(l?.roomId){if(places.has(l.roomId+':'+key))err(l.label+' ห้องสถานที่ชน',5);places.add(l.roomId+':'+key)}
  }
  for(const l of lessons){
    if(!lessonTeachers(l).length&&!l.teacherOptional&&l.count>0)err(l.label+' ยังไม่มีครู',5)
    if(!Number.isInteger(l.count)||l.count<0||(!l.activity&&!l.fixedOnly&&l.count===0))err(l.label+' ยังไม่มีภาระสอนที่ถูกต้อง',5)
    if(l.pattern&&(l.pattern.reduce((a,b)=>a+b,0)!==l.count||l.pattern.some(n=>!Number.isInteger(n)||n<1)))err(l.label+' รูปแบบคาบรวมไม่ตรงภาระสอน',5)
    if(l.pattern?.some(n=>!blocksFor(n,days,times).some(b=>!b.periods.some(p=>unavailable.some(u=>u.teacherId===l.teacherId&&u.day===b.day&&u.period===p)))))err(l.label+' ไม่มีช่วงว่างต่อเนื่องสำหรับรูปแบบคาบ',4)
    if(fixed.filter(s=>s.lessonId===l.id).length>l.count)err(l.label+' คาบเดิมเกินเป้าหมาย',5)
  }
  for(const room of new Set(lessons.map(l=>l.classroomId))){const need=lessons.filter(l=>l.classroomId===room).reduce((n,l)=>n+l.count,0)+fixed.filter(s=>s.classroomId===room&&!s.lessonId).length;if(need>capacity)err(`${lessons.find(l=>l.classroomId===room)?.label.split(' · ')[0]} ต้องการ ${need} คาบ แต่มี ${capacity} ช่อง`,5)}
  for(const teacher of new Set(lessons.flatMap(l=>lessonTeachers(l)))){const load=new Map<string,number>();for(const l of lessons.filter(l=>lessonTeachers(l).includes(teacher)))load.set(l.activityGroupId||l.id,Math.max(load.get(l.activityGroupId||l.id)||0,l.count));const need=[...load.values()].reduce((n,v)=>n+v,0),free=capacity-new Set(unavailable.filter(b=>b.teacherId===teacher&&days.includes(b.day)&&periods.includes(b.period)).map(b=>`${b.day}:${b.period}`)).size;if(need>free)err(`ครูของ ${lessons.find(l=>lessonTeachers(l).includes(teacher))?.label} ต้องสอน ${need} คาบ แต่มีเวลาว่าง ${free} คาบ`,4)}

  return issues
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
  const colors=[...common]
  for(let round=0;round<maxDegree;round++){
    let matched:Map<string,{left:string;edge:{left:string;right:string;lessonId:string|null;serial:number}}>|null=null
    let color=''
    for(let ci=0;ci<colors.length;ci++){
      const candidate=colors[ci]
      const allowed=edges.filter(e=>e.right.startsWith('__dummy_teacher_')||!blocked.has(`${e.right}:${candidate}`))
      const adj=new Map<string,typeof allowed>()
      for(const edge of allowed){const list=adj.get(edge.left)||[];list.push(edge);adj.set(edge.left,list)}
      const trial=new Map<string,{left:string;edge:typeof allowed[number]}>()
      function augment(room:string,seen:Set<string>):boolean{for(const edge of adj.get(room)||[]){if(seen.has(edge.right))continue;seen.add(edge.right);const old=trial.get(edge.right);if(!old||augment(old.left,seen)){trial.set(edge.right,{left:room,edge});return true}}return false}
      if(left.every(room=>augment(room,new Set()))){matched=trial;color=candidate;colors.splice(ci,1);break}
    }
    if(!matched)return null
    const [day,period]=color.split(':').map(Number)
    for(const room of left){const pair=[...matched.values()].find(x=>x.left===room);if(!pair)return null
      const alternatives=edges.filter(e=>e.left===room&&e.right===pair.edge.right)
      if(!alternatives.length)return null
      const real=alternatives.filter(e=>e.lessonId).sort((a,b)=>{const la=byId.get(a.lessonId!)!,lb=byId.get(b.lessonId!)!;if(la.spread!==lb.spread)return Number(!!lb.spread)-Number(!!la.spread);return (dayUse.get(`${a.lessonId}:${day}`)||0)-(dayUse.get(`${b.lessonId}:${day}`)||0)||a.serial-b.serial})
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
      for(const room of slotRooms){if(usedRooms.has(room))continue;for(const t of tasks){const l=t.lesson;if(l.classroomId!==room||!l.teacherId||usedTeachers.has(l.teacherId)||(l.roomId&&(usedVenues.has(l.roomId)||venueBusy.has(`${l.roomId}:${day}:${period}`)))||(remainingByLesson.get(l.id)||0)<=0)continue;const teacherCell=`${l.teacherId}:${day}:${period}`;if(teacherBlocked.has(teacherCell)||assignedTeacher.has(teacherCell))continue;const spreadPenalty=l.spread?(dayUse.get(`${l.id}:${day}`)||0)*100:0;options.push({room,lesson:l,rank:spreadPenalty-(remainingByLesson.get(l.id)||0)})}}
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
        options.sort((a,b)=>Number(a.id.startsWith('__free__:'))-Number(b.id.startsWith('__free__:'))||(rem.get(b.id)||0)-(rem.get(a.id)||0))
        const lesson=options[0];chosen.push({room:pending[best],lesson});pending.splice(best,1);pickedTeachers.add(lesson.teacherId!);if(lesson.roomId)pickedVenues.add(lesson.roomId)
      }
      for(const choice of chosen){rem.set(choice.lesson.id,(rem.get(choice.lesson.id)||0)-1);usedTeacher.add(`${choice.lesson.teacherId}:${day}:${period}`);if(choice.lesson.roomId)usedVenue.add(`${choice.lesson.roomId}:${day}:${period}`);if(!choice.lesson.id.startsWith('__free__:'))out.push({classroomId:choice.room,lessonId:choice.lesson.id,day,period})}
    }
    return tasks.every(task=>task.lesson.id.startsWith('__free__:')||(rem.get(task.lesson.id)||0)===0)?out:null
  }
  const greedy=greedyFill()
  if(greedy)return {status:'complete' as const,assignments:greedy,issues:[],nodes:0,solver:'dense_slot_matching' as const,elapsedMs:Date.now()-started,timeLimitMs:searchLimitMs}
  const solved=searchSlot(0)
  return {status:solved?'complete' as const:limited?'timeout' as const:'conflict' as const,limitReason:limited,assignments:solved?assignments.filter(slot=>!String(slot.lessonId).startsWith('__free__:')):[],issues:[],nodes,message:solved?undefined:'ครูผู้สอนที่ยังว่างไม่พอสำหรับห้องที่เลือก หรือใช้เวลาค้นหาเกินกำหนด',solver:'dense_slot_matching' as const,elapsedMs:Date.now()-started,timeLimitMs:searchLimitMs}
}
/** Bounded block search. Fixed lessons may be completed into a double block. */
export function solvePlannedSchedule(lessons:PlannedLesson[],fixed:PlannedSlot[],plan:SchedulePlan,times:PeriodTimeRow[],unavailable:{teacherId:string;day:number;period:number}[],maxNodes=SCHEDULE_SEARCH_MAX_NODES,timeLimitMs=SCHEDULE_SEARCH_TIME_LIMIT_MS):PlannedScheduleResult{
  const started=Date.now()
  const issues=checkPlanning(lessons,fixed,plan.days,times,unavailable)
  if(issues.some(i=>i.severity==='error'))return {status:'invalid' as const,assignments:[] as PlannedSlot[],issues,nodes:0}
  // Most school timetables use one-period lessons. Route this common case,
  // including lessons that need a shared venue, through the slot-based solver: the general
  // block CSP rescans every subject domain at every node and can spend its
  // entire search budget rediscovering combinations the legacy solver handles
  // quickly. Keep advanced plans on the block solver below.
  const teachingPeriods=times.filter(t=>!t.is_break).map(t=>t.period)
  const singlePeriod=!plan.reduceGaps&&plan.maxContinuous===0
    &&lessons.every(l=>!l.morning&&(!l.pattern||l.pattern.every(n=>n===1))&&(!l.teacherIds||l.teacherIds.length<=1||l.activity))
  const fullWeek=plan.days.length===5&&[1,2,3,4,5].every((d,i)=>plan.days[i]===d)
    &&teachingPeriods.length>0&&teachingPeriods.every((p,i)=>p===i+1)
  if(singlePeriod&&maxNodes>0&&timeLimitMs>0){
    const matched=solveSinglePeriodMatching(lessons,fixed,plan,times,unavailable)
    if(matched!==null)return matched.message?{status:'conflict' as const,message:matched.message,assignments:[] as PlannedSlot[],issues,nodes:0,solver:'edge_coloring',elapsedMs:Date.now()-started}:{status:'complete' as const,assignments:matched.assignments,issues,nodes:0,solver:'edge_coloring',elapsedMs:Date.now()-started}
    const dense=solveDenseWithRetainedRooms(lessons,fixed,plan,times,unavailable,maxNodes,timeLimitMs)
    if(dense)return {...dense,issues}
    if(fullWeek){
      const activityBlocks=fixed.flatMap(s=>{const l=s.lessonId?lessons.find(x=>x.id===s.lessonId):undefined;return l?.activity?lessonTeachers(l).map(teacherId=>({teacherId,day:s.day,period:s.period})):[]})
      const teacherBlocks=[...unavailable,...activityBlocks]
      const legacy=solveSchoolSchedule(lessons.map(l=>({id:l.id,classroomId:l.classroomId,teacherId:l.activity?null:l.teacherId,count:l.count,label:l.label,teacherOptional:l.teacherOptional||l.activity})),fixed,Math.min(maxNodes,1_000_000),teachingPeriods.length,teacherBlocks)
      if(!legacy.error)return {status:'complete' as const,assignments:legacy.assignments,issues,nodes:0,solver:'legacy_backtracking',elapsedMs:Date.now()-started,timeLimitMs:8000}
      const timedOut=legacy.error.includes('ค้นหาไม่ทัน')
      return {status:timedOut?'timeout' as const:'conflict' as const,limitReason:timedOut?'time_limit' as const:null,message:legacy.error,assignments:[] as PlannedSlot[],issues,nodes:0,solver:'legacy_backtracking',elapsedMs:Date.now()-started,timeLimitMs:8000}
    }
  }
  const deadline=Date.now()+timeLimitMs;let nodes=0,limitReason:'node_limit'|'time_limit'|null=null
  const cell=(r:string,d:number,p:number)=>`${r}:${d}:${p}`
  const occupied=new Map<string,string>(),teacherBusy=new Map<string,string>(),roomBusy=new Map<string,string>(),covered=new Set<string>()
  const byId=new Map(lessons.map(l=>[l.id,l]));const result:PlannedSlot[]=[]
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
    for(const b of blocksByLength.get(length)||[]){if(last!==undefined&&b.ordinal<=last)continue;let valid=true
      for(const p of b.periods){const k=cell(l.classroomId,b.day,p),o=occupied.get(k);if((l.fixedOnly&&o!==l.id)||covered.has(k)||(o&&o!==l.id)){valid=false;break}
        for(const id of teachers){const busy=teacherBusy.get(cell(id,b.day,p));if(busy&&busy!==owner){valid=false;break}}if(!valid)break
        if(l.roomId){const roomOwner=roomBusy.get(cell(l.roomId,b.day,p));if(roomOwner&&roomOwner!==l.id){valid=false;break}}
      }
      if(valid)available.push(b)
    }return available
  }
  function rank(l:PlannedLesson,b:{day:number;periods:number[]}){let value=b.periods[0]/100-b.periods.filter(p=>occupied.get(cell(l.classroomId,b.day,p))===l.id).length*100;const lunch=times.findIndex(t=>t.is_break);if(l.morning&&times.findIndex(t=>t.period===b.periods[0]&&!t.is_break)>lunch)value+=20;if(l.spread)value+=(chosen.get(l.id+':'+b.day)||0)*10
    const occupiedPeriods=times.filter(t=>!t.is_break&&l.teacherId&&teacherBusy.has(cell(l.teacherId,b.day,t.period))).map(t=>t.period)
    if(plan.reduceGaps&&occupiedPeriods.length){const all=[...occupiedPeriods,...b.periods];value+=Math.max(...all)-Math.min(...all)+1-all.length}
    if(plan.maxContinuous&&l.teacherId){let run=0,max=0;for(const t of times){run=!t.is_break&&(occupiedPeriods.includes(t.period)||b.periods.includes(t.period))?run+1:0;max=Math.max(max,run)}value+=Math.max(0,max-plan.maxContinuous)*20}return value}
  function search():boolean{nodes++;if(nodes>maxNodes){limitReason='node_limit';return false}if(Date.now()>=deadline){limitReason='time_limit';return false}if(usedTask.size===tasks.length)return fixed.every(s=>!s.lessonId||covered.has(cell(s.classroomId,s.day,s.period)))
    let best=-1,options:ReturnType<typeof candidates>=[]
    for(let i=0;i<tasks.length;i++){if(usedTask.has(i))continue;const c=candidates(tasks[i]);if(!c.length)return false;if(best<0||c.length<options.length){best=i;options=c}}
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
  const solved=search();return {status:solved?'complete' as const:limitReason?'timeout' as const:'conflict' as const,limitReason,assignments:solved?result:[],issues,nodes,solver:'block_backtracking',elapsedMs:Date.now()-started,timeLimitMs}
}
