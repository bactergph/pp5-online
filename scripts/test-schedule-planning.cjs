const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const exportsObject={},legacySolver={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-solver.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:legacySolver,require:()=>({})});vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-planning.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,require:name=>name==='./schedule-solver'?legacySolver:{}});
const {solvePlannedSchedule:solve,emptyPlan,checkPlanning,blocksFor}=exportsObject
const times=[1,2,0,3,4].map((period,i)=>({period,is_break:period===0,sort_order:i+1,start_time:`${8+i}:00`,end_time:`${9+i}:00`,label:''}))
const plan=emptyPlan();plan.days=[1,2];
const lesson=(id,teacher='teacher',room='classA',count=2,extra={})=>({id,teacherId:teacher,classroomId:room,count,label:id,pattern:Array(count).fill(1),...extra})
const slot=(id,room,day,period)=>({lessonId:id,classroomId:room,day,period})
let result=solve([lesson('A'),lesson('B','teacher','classB')],[],plan,times,[]);assert.equal(result.status,'complete');assert.equal(new Set(result.assignments.map(s=>s.day+':'+s.period)).size,4)
result=solve([lesson('A','T1','A',2,{roomId:'lab'}),lesson('B','T2','B',2,{roomId:'lab'})],[],plan,times,[]);assert.equal(result.status,'complete');assert.equal(new Set(result.assignments.map(s=>s.day+':'+s.period)).size,4)
assert.ok(blocksFor(2,[1],times).every(b=>!b.periods.includes(2)||!b.periods.includes(3)))
result=solve([lesson('A','T','A',2,{pattern:[2]})],[slot('A','A',1,2)],plan,times,[]);assert.equal(result.status,'complete');assert.ok(result.assignments.some(s=>s.day===1&&s.period===1))
result=solve([lesson('A','T','A',2,{pattern:[2]})],[slot('A','A',1,2),slot('A','A',1,3)],plan,times,[]);assert.equal(result.status,'conflict')
// Retained single lessons and activities are fixed starting data, not search
// tasks to rediscover. Only the missing subject period should be generated.
const retainedActivity=lesson('retained-activity',null,'A',1,{activity:true,teacherOptional:true,fixedOnly:true})
const retainedSubject=lesson('retained-subject','T1','A',2)
result=solve([retainedActivity,retainedSubject],[slot('retained-activity','A',1,1),slot('retained-subject','A',1,2)],plan,times,[])
assert.equal(result.status,'complete');assert.equal(result.assignments.length,1);assert.ok(!result.assignments.some(s=>s.day===1&&s.period===1||s.day===1&&s.period===2))
const onlyRetained=solve([retainedActivity,lesson('fixed-only','T1','B',1,{fixedOnly:true})],[slot('retained-activity','A',1,1),slot('fixed-only','B',1,2)],plan,times,[])
assert.equal(onlyRetained.status,'complete');assert.equal(onlyRetained.assignments.length,0);assert.equal(onlyRetained.nodes,1)
result=solve([lesson('A','T','A',1),lesson('outside','T','B',1,{fixedOnly:true})],[slot('outside','B',1,1)],plan,times,[{teacherId:'T',day:1,period:2}]);assert.equal(result.status,'complete');assert.ok(result.assignments.every(s=>s.period>2||s.day===2));assert.ok(result.assignments.every(s=>s.classroomId==='A'))
assert.equal(solve([lesson('A','T','A',9)],[],plan,times,[]).status,'invalid')
const nodeLimited=solve([lesson('A','T','A',2)],[],plan,times,[],0);assert.equal(nodeLimited.status,'timeout');assert.equal(nodeLimited.limitReason,'node_limit')
const timeLimited=solve([lesson('A','T','A',2)],[],plan,times,[],500000,0);assert.equal(timeLimited.status,'timeout');assert.equal(timeLimited.limitReason,'time_limit')
assert.ok(checkPlanning([lesson('A',null)],[],plan.days,times,[]).some(i=>i.message.includes('ครู')))
assert.ok(checkPlanning([lesson('A','T','A',2,{pattern:[3]})],[],plan.days,times,[]).some(i=>i.message.includes('รูปแบบ')))
const activities=[lesson('act',null,'A',1,{activity:true,teacherOptional:true,fixedOnly:true}),lesson('actB',null,'B',1,{activity:true,teacherOptional:true,fixedOnly:true})];result=solve([...activities,lesson('A','T','A',2),lesson('B','T','B',2)],[slot('act','A',1,1),slot('actB','B',1,1)],plan,times,[]);assert.equal(result.status,'complete');assert.ok(result.assignments.every(s=>s.day!==1||s.period!==1));
console.log('PASS: shared teacher/venue; actual lunch boundaries; locked doubles; outside scope; teacher unavailable; capacity; timeout; activity preservation')

const helpers={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-helpers.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:helpers,require:()=>({})});
for(const [date,term] of [['2026-03-31T16:59:00Z',2],['2026-03-31T17:00:00Z',1],['2026-09-30T16:59:00Z',1],['2026-09-30T17:00:00Z',2],['2027-01-15T00:00:00Z',2]])assert.equal(helpers.currentScheduleSemester(new Date(date)),term);
const storedTimes=helpers.DEFAULT_PERIOD_TIMES.map(t=>({...t,start_time:t.start_time+':00',end_time:t.end_time+':00'}));
const editorTimes=helpers.normalizePeriodTimes(storedTimes);assert.equal(helpers.validatePeriodTimes(editorTimes),null);assert.equal(storedTimes[0].start_time,'08:30:00');assert.equal(editorTimes[0].start_time,'08:30');
assert.equal(helpers.validatePeriodTimes(helpers.moveLunchBreak(editorTimes,4)),null);
console.log('PASS: April/October term boundaries in Bangkok, January term 2, database time seconds normalized without mutating data, lunch editor validation');

const joint=[lesson('act1',null,'A',1,{activity:true,teacherOptional:true,fixedOnly:true,teacherIds:['T1','T2'],activityGroupId:'joint'}),lesson('act2',null,'B',1,{activity:true,teacherOptional:true,fixedOnly:true,teacherIds:['T1','T2'],activityGroupId:'joint'})];
const jointSlots=[slot('act1','A',1,1),slot('act2','B',1,1)];
result=solve([...joint,lesson('math','T2','A',1)],jointSlots,plan,times,[]);assert.equal(result.status,'complete');assert.ok(result.assignments.every(s=>s.day!==1||s.period!==1));
assert.ok(checkPlanning(joint.map(l=>({...l,activityGroupId:undefined})),jointSlots,plan.days,times,[]).some(i=>i.message.includes('ครูชน')));
assert.ok(checkPlanning(joint,jointSlots,plan.days,times,[{teacherId:'T2',day:1,period:1}]).some(i=>i.message.includes('ไม่ว่าง')));
console.log('PASS: joint multi-teacher activity occupies every teacher once; subject solver preserves joint fixed cells; separate-room and blocked-teacher conflicts');
// Dense six-room schedule: each room has 25 subject periods and five fixed
// activity periods. The ordinary wizard path must finish this in one solve.
const schoolPlan=emptyPlan();schoolPlan.days=[1,2,3,4,5];schoolPlan.spread=true;
const schoolTimes=[1,2,3,0,4,5,6].map((period,i)=>({period,is_break:period===0,sort_order:i+1,start_time:`${8+i}:00`,end_time:`${9+i}:00`,label:period===0?'พักกลางวัน':`คาบ ${period}`}));
const schoolLessons=[],schoolFixed=[],schoolTeacherLoad=Array(8).fill(0);
for(let room=0;room<6;room++){
  for(let subject=0;subject<12;subject++){const count=subject===0?3:2,teacher=schoolTeacherLoad.indexOf(Math.min(...schoolTeacherLoad));schoolTeacherLoad[teacher]+=count;schoolLessons.push(lesson(`R${room}S${subject}`,`T${teacher}`,`R${room}`,count));}
  for(let day=1;day<=5;day++){
    const id=`R${room}A${day}`;schoolLessons.push(lesson(id,null,`R${room}`,1,{activity:true,teacherOptional:true,fixedOnly:true,teacherIds:[`T${day+1}`],activityGroupId:`A${day}`}));
    schoolFixed.push(slot(id,`R${room}`,day,6));
  }
}
const schoolStart=Date.now();result=solve(schoolLessons,schoolFixed,schoolPlan,schoolTimes,[]);
assert.equal(result.status,'complete',`dense six-room schedule should complete; got ${result.status} (${result.limitReason||'no limit'}): ${result.message||''}`);
assert.equal(result.assignments.length,150);
assert.ok(Date.now()-schoolStart<8000,`dense six-room solve took ${Date.now()-schoolStart}ms`);
const schoolTeacherByLesson=new Map(schoolLessons.map(l=>[l.id,l.teacherId])),schoolClassCells=new Map(),schoolTeacherCells=new Set(),schoolCounts=new Map();
for(const s of [...schoolFixed,...result.assignments]){const time=`${s.day}:${s.period}`,classCell=`${s.classroomId}:${time}`;assert.ok(!schoolClassCells.has(classCell),`class collision at ${classCell}: ${schoolClassCells.get(classCell)} / ${s.lessonId}`);schoolClassCells.set(classCell,s.lessonId);if(s.period!==6){const teacher=schoolTeacherByLesson.get(s.lessonId),teacherCell=`${teacher}:${time}`;assert.ok(!schoolTeacherCells.has(teacherCell),`teacher collision at ${teacherCell}`);schoolTeacherCells.add(teacherCell);schoolCounts.set(s.lessonId,(schoolCounts.get(s.lessonId)||0)+1)}}
for(const l of schoolLessons.filter(l=>!l.activity))assert.equal(schoolCounts.get(l.id),l.count,`${l.id} target periods must be met`);
console.log(`PASS: dense six-room wizard case completed in ${Date.now()-schoolStart}ms (${result.assignments.length} subjects; activities and lunch-free slots preserved)`);
const partiallyRetained=[...schoolFixed,...result.assignments.filter(s=>s.classroomId==='R4'||s.classroomId==='R5')],retainedStart=Date.now();
const retainedResult=solve(schoolLessons,partiallyRetained,schoolPlan,schoolTimes,[]);
assert.equal(retainedResult.status,'complete',`six-room schedule with two already-filled rooms should complete; got ${retainedResult.status} (${retainedResult.message||''})`);
assert.equal(retainedResult.assignments.length,100);
const retainedClassCells=new Set(),retainedTeacherCells=new Set(),retainedCounts=new Map();
for(const s of [...partiallyRetained,...retainedResult.assignments]){const key=`${s.classroomId}:${s.day}:${s.period}`;assert.ok(!retainedClassCells.has(key),`retained class collision at ${key}`);retainedClassCells.add(key);if(s.period!==6){const teacher=schoolTeacherByLesson.get(s.lessonId),teacherCell=`${teacher}:${s.day}:${s.period}`;assert.ok(!retainedTeacherCells.has(teacherCell),`retained teacher collision at ${teacherCell}`);retainedTeacherCells.add(teacherCell);retainedCounts.set(s.lessonId,(retainedCounts.get(s.lessonId)||0)+1)}}
for(const l of schoolLessons.filter(l=>!l.activity))assert.equal(retainedCounts.get(l.id),l.count,`${l.id} retained and generated periods must meet target`);
console.log(`PASS: six-room wizard case with two retained rooms completed in ${Date.now()-retainedStart}ms`);
