import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>deps[name]||{}});return exports}
const solver=load('lib/schedule-solver.ts')
const planning=load('lib/schedule-planning.ts',{'./schedule-solver':solver})
const {verifyCompleteSchedule}=load('lib/schedule-verification.ts',{'./schedule-planning':planning})
const times=[
 {period:1,start_time:'08:00',end_time:'09:00',is_break:false},
 {period:2,start_time:'09:00',end_time:'10:00',is_break:false},
 {period:0,start_time:'10:00',end_time:'11:00',is_break:true},
 {period:3,start_time:'11:00',end_time:'12:00',is_break:false},
 {period:4,start_time:'12:00',end_time:'13:00',is_break:false},
]
const plan={...planning.emptyPlan(),days:[1]}
const lesson=(id,name,count=1,extra={})=>({id,name,fullName:name,label:`A · ${name}`,classroomId:'A',teacherId:`T-${id}`,count,...extra})
const slot=(id,period,extra={})=>({lessonId:id,classroomId:'A',day:1,period,...extra})
function solve(lessons,fixed=[],blocks=[],config=plan,periods=times){
 const before=JSON.stringify(fixed),result=planning.solvePlannedSchedule(lessons,fixed,config,periods,blocks)
 assert.equal(result.status,'complete',JSON.stringify({status:result.status,message:result.message,issues:result.issues}))
 assert.equal(JSON.stringify(fixed),before,'retained input must not change')
 assert.equal(verifyCompleteSchedule(lessons,[...fixed,...result.assignments],config.days,periods,blocks).length,0)
 return result
}
for(const name of ['คณิตศาสตร์ 4','วิทยาศาสตร์ 2','วิทย์พื้นฐาน','ฟิสิกส์','เคมี','ชีววิทยา'])assert.equal(planning.lessonMorningPriority({name}),2)
assert.equal(planning.lessonMorningPriority({name:'ภาษาอังกฤษ'}),1)
assert.equal(planning.lessonMorningPriority({name:'ศิลปะ',morning:true}),3)
assert.equal(planning.lessonMorningPriority({name:'วิทยาศาสตร์',activity:true}),0)
assert.equal(planning.lessonMorningPriority({name:'คณิตศาสตร์',timePreference:'any'}),0)
assert.equal(planning.lessonMorningPriority({name:'คณิตศาสตร์',timePreference:'afternoon'}),-3)
assert.equal(planning.lessonMorningPriority({name:'ศิลปะ',timePreference:'morning'}),3)
assert.throws(()=>planning.validatePlan({...planning.emptyPlan(),rules:{invalid:{count:1,pattern:[1],roomId:null,morning:false,spread:true,timePreference:'evening'}}},['invalid']),/ช่วงเวลา/)
const basic=[lesson('english','ภาษาอังกฤษ'),lesson('art','ศิลปะ'),lesson('math','คณิตศาสตร์'),lesson('science','วิทยาศาสตร์')]
const prioritized=solve(basic)
assert.ok(prioritized.assignments.filter(row=>['math','science'].includes(row.lessonId)).every(row=>row.period<=2))
const fallbackLessons=[lesson('math','คณิตศาสตร์',2),lesson('art','ศิลปะ',2)]
const blocked=[1,2].map(period=>({teacherId:'T-math',day:1,period}))
const fallback=solve(fallbackLessons,[],blocked)
assert.ok(fallback.assignments.filter(row=>row.lessonId==='math').every(row=>row.period>=3))
const retained=solve([lesson('math','คณิตศาสตร์'),lesson('art','ศิลปะ')],[slot('math',4)])
assert.ok(!retained.assignments.some(row=>row.lessonId==='math'))

const doubles=[lesson('math','คณิตศาสตร์',2,{pattern:[2]}),lesson('art','ศิลปะ',2)]
assert.deepEqual(Array.from(solve(doubles).assignments.filter(row=>row.lessonId==='math').map(row=>row.period).sort()),[1,2])
assert.deepEqual(Array.from(solve(doubles,[],blocked).assignments.filter(row=>row.lessonId==='math').map(row=>row.period).sort()),[3,4])
const explicit=solve([lesson('math','คณิตศาสตร์',2),lesson('art','ศิลปะ',2,{morning:true})])
assert.ok(explicit.assignments.filter(row=>row.lessonId==='art').every(row=>row.period<=2))

// Explicit afternoon overrides subject-based morning defaults on both singles and doubles.
for(const extra of [{pattern:[1,1]},{pattern:[2]}]){
 const afternoon=solve([lesson('math','คณิตศาสตร์',2,{...extra,timePreference:'afternoon'}),lesson('art','ศิลปะ',2,{timePreference:'morning'})])
 assert.ok(afternoon.assignments.filter(row=>row.lessonId==='math').every(row=>row.period>=3))
 assert.ok(afternoon.assignments.filter(row=>row.lessonId==='art').every(row=>row.period<=2))
}
const afternoonBlocked=[3,4].map(period=>({teacherId:'T-math',day:1,period}))
assert.ok(solve([lesson('math','คณิตศาสตร์',2,{timePreference:'afternoon'})],[],afternoonBlocked).assignments.every(row=>row.period<=2),'Session choice is soft; teacher blocks remain mandatory')
const preferredAfternoon=planning.improveMorningAssignments([lesson('math','คณิตศาสตร์',1,{timePreference:'afternoon'}),lesson('art','ศิลปะ',1,{timePreference:'morning'})],[],[slot('math',1),slot('art',4)],[1],times,[])
assert.equal(preferredAfternoon.find(row=>row.lessonId==='math').period,4)
assert.equal(preferredAfternoon.find(row=>row.lessonId==='art').period,1)
const fullWeekAfternoon=solve([lesson('math','คณิตศาสตร์',10,{timePreference:'afternoon'}),lesson('art','ศิลปะ',10,{timePreference:'morning'})],[],[],planning.emptyPlan())
assert.equal(fullWeekAfternoon.solver,'edge_coloring')
assert.ok(fullWeekAfternoon.assignments.filter(row=>row.lessonId==='math').every(row=>row.period>=3))
console.log('PASS: explicit morning / afternoon / either sessions; single and double periods; edge-colouring and block solver; validation; fallback preserves hard constraints')

const venueLessons=[lesson('math','คณิตศาสตร์',1,{roomId:'lab'}),lesson('outside','อื่น',1,{classroomId:'B',teacherId:'Outside',roomId:'lab',fixedOnly:true})]
const venueRows=[slot('outside',1,{classroomId:'B'})]
const venueBlocked=[{teacherId:'T-math',day:1,period:2}]
assert.ok(solve(venueLessons,venueRows,venueBlocked).assignments.every(row=>row.period>=3))
const reserved=[slot(null,1),slot(null,2)]
assert.ok(solve([lesson('math','คณิตศาสตร์')],reserved).assignments.every(row=>row.period>=3))
const continuousLessons=[lesson('math','คณิตศาสตร์'),lesson('outside','อื่น',1,{classroomId:'B',teacherId:'T-math',fixedOnly:true})]
const beforeImprovement=[slot('math',3)],outsideMorning=[slot('outside',2,{classroomId:'B'})]
const unrestricted=planning.improveMorningAssignments(continuousLessons,outsideMorning,beforeImprovement,[1],times,[])
assert.equal(unrestricted[0].period,1)
const preserveContinuous=planning.improveMorningAssignments(continuousLessons,outsideMorning,beforeImprovement,[1],times,[],{maxContinuous:1})
assert.equal(preserveContinuous[0].period,3)
assert.equal(beforeImprovement[0].period,3,'optimization must not mutate caller input')
const preserveGaps=planning.improveMorningAssignments(continuousLessons,[slot('outside',3,{classroomId:'B'})],[slot('math',4)],[1],times,[],{reduceGaps:true})
assert.equal(preserveGaps[0].period,2)

// Six fully assigned classrooms, shared teachers, and an all-school fixed activity.
const denseTimes=[...times.slice(0,2),{period:3,start_time:'10:00',end_time:'11:00',is_break:false},
 {period:0,start_time:'11:00',end_time:'12:00',is_break:true},
 ...[4,5,6].map(period=>({period,start_time:`${period+8}:00`,end_time:`${period+9}:00`,is_break:false}))]
const densePlan={...planning.emptyPlan(),days:[1,2,3,4,5]},denseLessons=[],fixed=[]
for(let room=0;room<6;room++){
 for(let subject=0;subject<6;subject++)denseLessons.push(lesson(`R${room}-S${subject}`,['คณิตศาสตร์','วิทยาศาสตร์','ภาษาไทย','ภาษาอังกฤษ','ศิลปะ','สุขศึกษา'][subject],[5,5,5,5,5,4][subject],{classroomId:`R${room}`,teacherId:`T${(subject+room)%6}`,spread:true}))
 denseLessons.push(lesson(`activity-${room}`,'ชุมนุม',1,{classroomId:`R${room}`,teacherId:null,teacherIds:['T0','T1','T2','T3','T4','T5'],teacherOptional:true,activity:true,activityGroupId:'joint',fixedOnly:true}))
 fixed.push(slot(`activity-${room}`,6,{classroomId:`R${room}`,day:5}))
}
const dense=solve(denseLessons,fixed,[],densePlan,denseTimes)
assert.equal(dense.assignments.length+fixed.length,180)
const stemIds=new Set(denseLessons.filter(lesson=>planning.lessonMorningPriority(lesson)===2).map(lesson=>lesson.id))
const stemMorning=dense.assignments.filter(row=>stemIds.has(row.lessonId)&&row.period<=3).length
assert.ok(stemMorning>=50,`Expected at least 50/60 maths/science periods before lunch; got ${stemMorning}`)
const retainedDense=solve(denseLessons,[...fixed,slot('R0-S0',6,{classroomId:'R0',day:1})],[],densePlan,denseTimes)
assert.equal(retainedDense.solver,'dense_slot_matching')
assert.equal(retainedDense.assignments.length+fixed.length+1,180)
const retainedMorning=retainedDense.assignments.filter(row=>stemIds.has(row.lessonId)&&row.period<=3).length
assert.ok(retainedMorning>=49,`Expected maths/science preference with a retained afternoon lesson; got ${retainedMorning}`)
console.log(`PASS: maths/science morning priority; afternoon fallback; explicit choices; fixed/lunch/teacher/venue/blank reservations; six-room complete timetable with ${stemMorning}/60 STEM periods before lunch (${dense.solver}), ${retainedMorning}/59 movable periods with a fixed afternoon maths lesson (${retainedDense.solver})`)
