import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import pathModule from 'node:path'

function load(path,deps={}) {
  const exports={}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>deps[name]||(name.startsWith('.')?load(pathModule.resolve(pathModule.dirname(path),name+'.ts')):{})})
  return exports
}
const solver=load('lib/schedule-solver.ts')
const {solvePlannedSchedule}=load('lib/schedule-planning.ts',{'./schedule-solver':solver,'./schedule-block-repair':load('lib/schedule-block-repair.ts')})
const {validateActivityTeam}=load('lib/schedule-activity-teams.ts')
const periods=[
  {period:1,start_time:'08:00',end_time:'09:00',is_break:false},
  {period:2,start_time:'09:00',end_time:'10:00',is_break:false},
  {period:0,start_time:'10:00',end_time:'11:00',is_break:true},
  {period:3,start_time:'11:00',end_time:'12:00',is_break:false},
]
const plan={days:[1,2],rooms:[],rules:{},reduceGaps:false,maxContinuous:0}
const activity=(id,room,teachers=[],extra={})=>({id,classroomId:room,teacherId:null,teacherIds:teachers,teacherOptional:true,label:id,activity:true,count:2,...extra})
const positions=rows=>rows.map(s=>`${s.day}:${s.period}`).sort()
const solve=(lessons,fixed=[],blocks=[],settings=plan)=>solvePlannedSchedule(lessons,fixed,settings,periods,blocks)

const one=solve([activity('guide','A')])
assert.equal(one.status,'complete')
assert.equal(one.assignments.length,2)
assert.ok(one.assignments.every(s=>s.period!==0))

const jointLessons=[activity('scouts-A','A',['T1','T2'],{activityGroupId:'scouts'}),activity('scouts-B','B',['T1','T2'],{activityGroupId:'scouts'}),{id:'outside',classroomId:'C',teacherId:'T1',count:1,label:'outside',fixedOnly:true}]
const fixed=[{classroomId:'C',lessonId:'outside',day:1,period:1}]
const joint=solve(jointLessons,fixed,[{teacherId:'T1',day:1,period:2}])
assert.equal(joint.status,'complete')
assert.deepEqual(positions(joint.assignments.filter(s=>s.classroomId==='A')),positions(joint.assignments.filter(s=>s.classroomId==='B')))
assert.equal(joint.assignments.length,4)
assert.ok(joint.assignments.every(s=>!(s.day===1&&[1,2].includes(s.period))))

const separate=solve([activity('guide-A','A',['T']),activity('guide-B','B',['T'])])
assert.equal(separate.status,'complete')
assert.equal(new Set(positions(separate.assignments)).size,4)

const locked=solve([activity('A','A',['T'],{activityGroupId:'joint'}),activity('B','B',['T'],{activityGroupId:'joint'})],[{classroomId:'A',lessonId:'A',day:2,period:3}])
assert.equal(locked.status,'complete')
assert.ok(locked.assignments.some(s=>s.classroomId==='B'&&s.day===2&&s.period===3))
assert.equal(locked.assignments.length,3)

// First two activity choices block the only double lesson. Search must retry.
const backtracked=solve([activity('club','A',[],{count:1}),{id:'lab',classroomId:'A',teacherId:'LabTeacher',count:2,pattern:[2],label:'lab'}],[],[],{...plan,days:[1]})
assert.equal(backtracked.status,'complete')
assert.equal(backtracked.assignments.find(s=>s.lessonId==='club').period,3)
assert.deepEqual(Array.from(backtracked.assignments.filter(s=>s.lessonId==='lab').map(s=>s.period).sort()),[1,2])
const exhausted=solvePlannedSchedule([activity('club','A')],[],plan,periods,[],0,1000)
assert.equal(exhausted.status,'timeout')
assert.equal(exhausted.limitReason,'node_limit')
// Six full classrooms share six subject teachers and one joint activity team.
// Joint events occupy one teacher timeslot across all rooms, rather than six.
const fullPeriods=[1,2,3,4,5,6].map(period=>({period,start_time:`${String(7+period).padStart(2,'0')}:00`,end_time:`${String(8+period).padStart(2,'0')}:00`,is_break:false}))
const denseLessons=[]
for(let room=0;room<6;room++){
  denseLessons.push(activity(`joint-${room}`,`R${room}`,['T0','T1','T2','T3','T4','T5'],{activityGroupId:'all-school'}))
  for(let subject=0;subject<6;subject++)denseLessons.push({id:`subject-${room}-${subject}`,classroomId:`R${room}`,teacherId:`T${subject}`,count:[5,5,5,5,4,4][(subject+room)%6],label:'subject'})
}
const dense=solvePlannedSchedule(denseLessons,[],{...plan,days:[1,2,3,4,5]},fullPeriods,[])
assert.equal(dense.status,'complete')
assert.equal(dense.assignments.length,180)
const denseTeachers=new Map(denseLessons.map(l=>[l.id,l.teacherId]))
const teacherCells=new Set(),classCells=new Set()
for(const slot of dense.assignments){
  const classCell=`${slot.classroomId}:${slot.day}:${slot.period}`
  assert.ok(!classCells.has(classCell));classCells.add(classCell)
  const teacher=denseTeachers.get(slot.lessonId)
  if(teacher){const teacherCell=`${teacher}:${slot.day}:${slot.period}`;assert.ok(!teacherCells.has(teacherCell));teacherCells.add(teacherCell)}
}
const jointPositions=positions(dense.assignments.filter(s=>s.classroomId==='R0'&&s.lessonId==='joint-0'))
for(let room=1;room<6;room++)assert.deepEqual(positions(dense.assignments.filter(s=>s.lessonId===`joint-${room}`)),jointPositions)
assert.ok(dense.assignments.filter(s=>denseTeachers.get(s.lessonId)).every(s=>!jointPositions.includes(`${s.day}:${s.period}`)))
const uuid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const team={id:uuid(1),settingId:uuid(2),roomIds:[uuid(3)],mode:'joint',teacherIds:[],roomTeachers:{},weeklyPeriods:2,cells:[]}
validateActivityTeam(team,[uuid(3)],[],[uuid(2)],[1,2],periods)
assert.throws(()=>validateActivityTeam({...team,cells:[{day:1,period:1}]},[uuid(3)],[],[uuid(2)],[1,2],periods),/ครบ/)
assert.throws(()=>validateActivityTeam({...team,weeklyPeriods:1,cells:[{day:1,period:0}]},[uuid(3)],[],[uuid(2)],[1,2],periods),/พัก/)
console.log('PASS: flexible activities fill weekly quota; joint synchronization, separate teachers, outside scope, locks/lunch, subject backtracking, timeout and input validation')
