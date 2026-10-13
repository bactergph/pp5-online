const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-planning.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,require:()=>({})});
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
result=solve([lesson('A','T','A',1),lesson('outside','T','B',1,{fixedOnly:true})],[slot('outside','B',1,1)],plan,times,[{teacherId:'T',day:1,period:2}]);assert.equal(result.status,'complete');assert.ok(result.assignments.every(s=>s.period>2||s.day===2));assert.ok(result.assignments.every(s=>s.classroomId==='A'))
assert.equal(solve([lesson('A','T','A',9)],[],plan,times,[]).status,'invalid')
assert.equal(solve([lesson('A','T','A',2)],[],plan,times,[],0).status,'timeout')
assert.ok(checkPlanning([lesson('A',null)],[],plan.days,times,[]).some(i=>i.message.includes('ครู')))
assert.ok(checkPlanning([lesson('A','T','A',2,{pattern:[3]})],[],plan.days,times,[]).some(i=>i.message.includes('รูปแบบ')))
const activities=[lesson('act',null,'A',1,{activity:true,teacherOptional:true,fixedOnly:true}),lesson('actB',null,'B',1,{activity:true,teacherOptional:true,fixedOnly:true})];result=solve([...activities,lesson('A','T','A',2),lesson('B','T','B',2)],[slot('act','A',1,1),slot('actB','B',1,1)],plan,times,[]);assert.equal(result.status,'complete');assert.ok(result.assignments.every(s=>s.day!==1||s.period!==1));
console.log('PASS: shared teacher/venue; actual lunch boundaries; locked doubles; outside scope; teacher unavailable; capacity; timeout; activity preservation')
