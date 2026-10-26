const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>name.startsWith('.')?load(path.resolve(path.dirname(abs),name+'.ts')):{}});return exports}
const planning=load('lib/schedule-planning.ts'),verify=load('lib/schedule-verification.ts').verifyCompleteSchedule,repair=load('lib/schedule-block-repair.ts').solveBlockRepair
const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/schedule-six-room-locked-double.json','utf8'))
const lessons=fixture.lessons.map(([room,teachers,count,pattern,fixedOnly,activity,group,venue,priority,spread],i)=>({id:'L'+i,classroomId:'R'+room,teacherId:!activity&&teachers.length===1?'T'+teachers[0]:null,teacherIds:activity||teachers.length>1?teachers.map(t=>'T'+t):undefined,count,pattern:pattern||undefined,fixedOnly,activity,teacherOptional:activity,activityGroupId:group<0?undefined:'G'+group,roomId:venue<0?null:'V'+venue,name:priority===2?'คณิตศาสตร์':priority===1?'ภาษาอังกฤษ':'การงานอาชีพ',timePreference:priority===3?'morning':priority===-3?'afternoon':'any',label:'R'+room+' · วิชา '+i,spread}))
const fixed=fixture.fixed.map(([room,lesson,day,period])=>({classroomId:'R'+room,lessonId:lesson<0?null:'L'+lesson,day,period})),plan={...planning.emptyPlan(),days:fixture.days},periods=fixture.periods
assert.equal(fixture.rooms,6);assert.equal(fixture.teachers,7);assert.equal(fixed.length,55)
const completedDouble=lessons.find(l=>l.pattern?.includes(2)&&fixed.filter(row=>row.lessonId===l.id).length===l.count)
assert.ok(completedDouble,'Regression must contain an already completed locked double')
const before=JSON.stringify({lessons,fixed,plan}),started=Date.now(),result=planning.solvePlannedSchedule(lessons,fixed,plan,periods,[])
assert.equal(result.status,'complete');assert.equal(result.solver,'block_repair');assert.ok(Date.now()-started<3000,'Do not fall back to the 45-second activity search')
const rows=[...fixed,...result.assignments]
assert.equal(rows.length,178);assert.equal(verify(lessons,rows,plan.days,periods,[]).length,0)
assert.equal(JSON.stringify({lessons,fixed,plan}),before,'Never change retained slots or lesson constraints')
const complete=planning.solvePlannedSchedule(lessons,rows,plan,periods,[])
assert.equal(complete.status,'complete');assert.equal(complete.assignments.length,0,'A completely filled schedule must not be rebuilt')
const partial=fixed.filter((row,i)=>row.lessonId!==completedDouble.id||fixed.findIndex(other=>other.lessonId===completedDouble.id)===i)
assert.equal(repair(lessons,partial,plan,periods,[],planning.lessonMorningPriority,10000,1000),null,'A partially retained double still needs the exact-cover fallback')
console.log(`PASS: six rooms / seven teachers, 55 retained cells including a complete double; 178 placements verified, no teacher/venue/quota/pattern errors, immutable locks, already-complete reuse and partial-double fallback; ${result.elapsedMs}ms`)
