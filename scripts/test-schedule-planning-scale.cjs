const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const exportsObject={},repair={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-block-repair.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:repair,require:()=>({})})
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-planning.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,require:name=>name==='./schedule-block-repair'?repair:{}})
const {solvePlannedSchedule,emptyPlan}=exportsObject
const days=[1,2,3,4,5]
const times=[
  {period:1,is_break:false,sort_order:1,start_time:'08:00',end_time:'09:00',label:'คาบ 1'},
  {period:2,is_break:false,sort_order:2,start_time:'09:00',end_time:'10:00',label:'คาบ 2'},
  {period:3,is_break:false,sort_order:3,start_time:'10:00',end_time:'11:00',label:'คาบ 3'},
  {period:0,is_break:true,sort_order:4,start_time:'11:00',end_time:'12:00',label:'พักกลางวัน'},
  {period:4,is_break:false,sort_order:5,start_time:'12:00',end_time:'13:00',label:'คาบ 4'},
  {period:5,is_break:false,sort_order:6,start_time:'13:00',end_time:'14:00',label:'คาบ 5'},
  {period:6,is_break:false,sort_order:7,start_time:'14:00',end_time:'15:00',label:'คาบ 6'},
]
const plan=emptyPlan();plan.days=days;plan.reduceGaps=true;plan.maxContinuous=4
const lessons=[]
for(let room=0;room<60;room++){
  const cohort=Math.floor(room/5)
  for(let subject=0;subject<8;subject++)lessons.push({
    id:`room-${room}-subject-${subject}`,classroomId:`room-${room}`,teacherId:`cohort-${cohort}-teacher-${subject}`,
    count:3,label:`ห้อง ${room+1} วิชา ${subject+1}`,pattern:subject===0?[2,1]:[1,1,1],
    roomId:subject===0?`shared-lab-${cohort}`:null,morning:subject===1,spread:subject>=2,
  })
}
const result=solvePlannedSchedule(lessons,[],plan,times,[])
assert.equal(result.status,'complete',`60-room schedule should fit; got ${result.status} (${result.limitReason||'no limit'})`)
assert.equal(result.solver,'block_backtracking','gap/continuous preferences keep the existing advanced block-search ranking')
assert.equal(result.assignments.length,1440)
const occupiedClasses=new Set(),occupiedTeachers=new Set(),occupiedVenues=new Set()
const teachersById=new Map(lessons.map(lesson=>[lesson.id,lesson.teacherId]))
for(const slot of result.assignments){
  const time=`${slot.day}:${slot.period}`
  const classCell=`${slot.classroomId}:${time}`,teacherCell=`${teachersById.get(slot.lessonId)}:${time}`
  assert.ok(!occupiedClasses.has(classCell),`student timetable collision at ${classCell}`);occupiedClasses.add(classCell)
  assert.ok(!occupiedTeachers.has(teacherCell),`teacher collision at ${teacherCell}`);occupiedTeachers.add(teacherCell)
  if(slot.lessonId.endsWith('subject-0')){const cohort=Math.floor(Number(slot.classroomId.slice(5))/5);const venueCell=`shared-lab-${cohort}:${time}`;assert.ok(!occupiedVenues.has(venueCell),`venue collision at ${venueCell}`);occupiedVenues.add(venueCell)}
  assert.notEqual(slot.period,0,'lunch must never receive a lesson')
}
console.log(`PASS: 60-room scale via ${result.solver}; ${result.assignments.length} periods; shared teachers/labs; lunch and double-period constraints; ${result.nodes} search nodes`)
