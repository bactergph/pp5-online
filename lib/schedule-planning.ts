import type { ActivityTeam } from './schedule-activity-teams'
const lessonTeachers=(l:{teacherId:string|null;teacherIds?:string[]})=>l.teacherIds??(l.teacherId?[l.teacherId]:[])
import type { PeriodTimeRow } from './schedule-helpers'
export type LessonRule = { count: number; pattern: number[]; roomId: string | null; morning: boolean; spread: boolean }
export type SchedulePlan = { days: number[]; rooms: { id: string; name: string }[]; rules: Record<string, LessonRule>; reduceGaps: boolean; maxContinuous: number; teacherIds?: string[]; activityGroups?: ActivityTeam[] }
export type PlannedLesson = { id: string; classroomId: string; teacherId: string | null; count: number; label: string; activity?: boolean; teacherOptional?: boolean; roomId?: string | null; pattern?: number[]; morning?: boolean; spread?: boolean; fixedOnly?: boolean; teacherIds?: string[]; activityGroupId?: string }
export type PlannedSlot = { classroomId: string; lessonId: string | null; day: number; period: number }
export type PlanningIssue = { severity: 'error' | 'warning'; message: string; step: number }
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
    if(!Number.isInteger(l.count)||l.count<0||(!l.activity&&l.count===0))err(l.label+' ยังไม่มีภาระสอนที่ถูกต้อง',5)
    if(l.pattern&&(l.pattern.reduce((a,b)=>a+b,0)!==l.count||l.pattern.some(n=>!Number.isInteger(n)||n<1)))err(l.label+' รูปแบบคาบรวมไม่ตรงภาระสอน',5)
    if(l.pattern?.some(n=>!blocksFor(n,days,times).some(b=>!b.periods.some(p=>unavailable.some(u=>u.teacherId===l.teacherId&&u.day===b.day&&u.period===p)))))err(l.label+' ไม่มีช่วงว่างต่อเนื่องสำหรับรูปแบบคาบ',4)
    if(fixed.filter(s=>s.lessonId===l.id).length>l.count)err(l.label+' คาบเดิมเกินเป้าหมาย',5)
  }
  for(const room of new Set(lessons.map(l=>l.classroomId))){const need=lessons.filter(l=>l.classroomId===room).reduce((n,l)=>n+l.count,0)+fixed.filter(s=>s.classroomId===room&&!s.lessonId).length;if(need>capacity)err(`${lessons.find(l=>l.classroomId===room)?.label.split(' · ')[0]} ต้องการ ${need} คาบ แต่มี ${capacity} ช่อง`,5)}
  for(const teacher of new Set(lessons.flatMap(l=>lessonTeachers(l)))){const load=new Map<string,number>();for(const l of lessons.filter(l=>lessonTeachers(l).includes(teacher)))load.set(l.activityGroupId||l.id,Math.max(load.get(l.activityGroupId||l.id)||0,l.count));const need=[...load.values()].reduce((n,v)=>n+v,0),free=capacity-new Set(unavailable.filter(b=>b.teacherId===teacher&&days.includes(b.day)&&periods.includes(b.period)).map(b=>`${b.day}:${b.period}`)).size;if(need>free)err(`ครูของ ${lessons.find(l=>lessonTeachers(l).includes(teacher))?.label} ต้องสอน ${need} คาบ แต่มีเวลาว่าง ${free} คาบ`,4)}

  return issues
}
/** Bounded block search. Fixed lessons may be completed into a double block. */
export function solvePlannedSchedule(lessons:PlannedLesson[],fixed:PlannedSlot[],plan:SchedulePlan,times:PeriodTimeRow[],unavailable:{teacherId:string;day:number;period:number}[],maxNodes=500000,timeLimitMs=30000){
  const issues=checkPlanning(lessons,fixed,plan.days,times,unavailable)
  if(issues.some(i=>i.severity==='error'))return {status:'invalid' as const,assignments:[] as PlannedSlot[],issues,nodes:0}
  const deadline=Date.now()+timeLimitMs;let nodes=0,limited=false
  const cell=(r:string,d:number,p:number)=>`${r}:${d}:${p}`
  const occupied=new Map<string,string>(),teacherBusy=new Map<string,string>(),roomBusy=new Map<string,string>(),covered=new Set<string>()
  const byId=new Map(lessons.map(l=>[l.id,l]));const result:PlannedSlot[]=[]
  for(const s of fixed){const owner=s.lessonId||'locked';occupied.set(cell(s.classroomId,s.day,s.period),owner);const l=byId.get(owner);if(l)for(const id of lessonTeachers(l))teacherBusy.set(cell(id,s.day,s.period),l.activityGroupId||owner);if(l?.roomId)roomBusy.set(cell(l.roomId,s.day,s.period),owner)}
  for(const b of unavailable)teacherBusy.set(cell(b.teacherId,b.day,b.period),'unavailable')
  const tasks=lessons.flatMap(l=>(l.pattern||Array(l.count).fill(1)).map((length:number,index:number)=>({l,length,index}))).sort((a,b)=>b.length-a.length||Number(!!b.l.roomId)-Number(!!a.l.roomId))
  const usedTask=new Set<number>();const chosen=new Map<string,number>();const chosenEquivalentBlock=new Map<string,number>()
  function candidates(task:typeof tasks[number]){const {l,length}=task,group=l.id+':'+length,last=chosenEquivalentBlock.get(group);return blocksFor(length,plan.days,times).map((b,ordinal)=>({ ...b,ordinal })).filter(b=>(last===undefined||b.ordinal>last)&&b.periods.every(p=>{
    const k=cell(l.classroomId,b.day,p),o=occupied.get(k),busy=lessonTeachers(l).map(id=>teacherBusy.get(cell(id,b.day,p))),r=l.roomId?roomBusy.get(cell(l.roomId,b.day,p)):null
    return (!l.fixedOnly||o===l.id)&&!covered.has(k)&&(!o||o===l.id)&&busy.every(t=>!t||t===(l.activityGroupId||l.id))&&(!r||r===l.id)
  })).sort((a,b)=>rank(l,a)-rank(l,b))}
  function rank(l:PlannedLesson,b:{day:number;periods:number[]}){let value=b.periods[0]/100-b.periods.filter(p=>occupied.get(cell(l.classroomId,b.day,p))===l.id).length*100;const lunch=times.findIndex(t=>t.is_break);if(l.morning&&times.findIndex(t=>t.period===b.periods[0]&&!t.is_break)>lunch)value+=20;if(l.spread)value+=(chosen.get(l.id+':'+b.day)||0)*10
    const occupiedPeriods=times.filter(t=>!t.is_break&&l.teacherId&&teacherBusy.has(cell(l.teacherId,b.day,t.period))).map(t=>t.period)
    if(plan.reduceGaps&&occupiedPeriods.length){const all=[...occupiedPeriods,...b.periods];value+=Math.max(...all)-Math.min(...all)+1-all.length}
    if(plan.maxContinuous&&l.teacherId){let run=0,max=0;for(const t of times){run=!t.is_break&&(occupiedPeriods.includes(t.period)||b.periods.includes(t.period))?run+1:0;max=Math.max(max,run)}value+=Math.max(0,max-plan.maxContinuous)*20}return value}
  function search():boolean{if(++nodes>maxNodes||Date.now()>deadline){limited=true;return false}if(usedTask.size===tasks.length)return fixed.every(s=>!s.lessonId||covered.has(cell(s.classroomId,s.day,s.period)))
    let best=-1,options:ReturnType<typeof candidates>=[]
    for(let i=0;i<tasks.length;i++){if(usedTask.has(i))continue;const c=candidates(tasks[i]);if(!c.length)return false;if(best<0||c.length<options.length){best=i;options=c}}
    const {l}=tasks[best];usedTask.add(best)
    for(const b of options){const changes:{map:Map<string,string>;key:string}[]=[];const added:PlannedSlot[]=[],group=l.id+':'+tasks[best].length,previousBlock=chosenEquivalentBlock.get(group);chosenEquivalentBlock.set(group,b.ordinal)
      for(const p of b.periods){const k=cell(l.classroomId,b.day,p);covered.add(k);if(!occupied.has(k)){occupied.set(k,l.id);changes.push({map:occupied,key:k});added.push({classroomId:l.classroomId,lessonId:l.id,day:b.day,period:p})}for(const [map,id] of [...lessonTeachers(l).map(id=>[teacherBusy,id] as const),[roomBusy,l.roomId] as const]){if(id){const key=cell(id,b.day,p);if(!map.has(key)){map.set(key,map===teacherBusy?(l.activityGroupId||l.id):l.id);changes.push({map,key})}}}}
      result.push(...added);const dk=l.id+':'+b.day;chosen.set(dk,(chosen.get(dk)||0)+1)
      if(search())return true
      chosen.set(dk,chosen.get(dk)!-1);if(previousBlock===undefined)chosenEquivalentBlock.delete(group);else chosenEquivalentBlock.set(group,previousBlock);result.splice(result.length-added.length,added.length);for(const p of b.periods)covered.delete(cell(l.classroomId,b.day,p));for(const c of changes)c.map.delete(c.key);if(limited)break
    }usedTask.delete(best);return false
  }
  const solved=search();return {status:solved?'complete' as const:limited?'timeout' as const:'conflict' as const,assignments:solved?result:[],issues,nodes}
}
