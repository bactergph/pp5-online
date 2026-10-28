const fs=require('fs'),vm=require('vm'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={};function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Date,performance,console,require:name=>name.startsWith('.')?load(path.resolve(path.dirname(abs),name+'.ts')):{}});return exports}
const {subjectFamily,spreadSubjectFamilies}=load('lib/schedule-subject-families.ts'),planning=load('lib/schedule-planning.ts'),verify=load('lib/schedule-verification.ts').verifyCompleteSchedule
const times=[1,2,0,3,4].map((period,i)=>({period,start_time:String(8+i).padStart(2,'0')+':00',end_time:String(9+i).padStart(2,'0')+':00',is_break:!period,sort_order:i+1})),days=[1,2,3,4,5]
const lesson=(id,name,count=1,extra={})=>({id,name,label:name,classroomId:'A',teacherId:id,count,pattern:Array(count).fill(1),...extra})
const row=(id,day,period,room='A')=>({lessonId:id,classroomId:room,day,period})
const sessionCounts=(lessons,rows)=>Object.fromEntries(lessons.map(l=>[l.id,rows.filter(r=>r.lessonId===l.id&&r.period<=2).length]))
function check(lessons,fixed,rows,blocks=[],preferences={}){const before=JSON.stringify({lessons,fixed,rows,blocks}),result=spreadSubjectFamilies(lessons,fixed,rows,days,times,blocks,preferences);assert.equal(JSON.stringify({lessons,fixed,rows,blocks}),before);assert.equal(verify(lessons,[...fixed,...result],days,times,blocks).length,0);assert.deepEqual(sessionCounts(lessons,result),sessionCounts(lessons,rows),'Morning priorities and teacher session balance stay intact');return result}
const core=lesson('core','คณิตศาสตร์'),extra=lesson('extra','คณิตศาสตร์เพิ่มเติม'),art=lesson('art','ศิลปะ'),english=lesson('en','ภาษาอังกฤษ'),englishExtra=lesson('en2','English Conversation')
assert.equal(subjectFamily(core),subjectFamily(extra));assert.equal(subjectFamily(english),subjectFamily(englishExtra));assert.notEqual(subjectFamily({...english,subjectGroup:'ภาษาต่างประเทศ'}),subjectFamily(lesson('cn','ภาษาจีน',1,{subjectGroup:'ภาษาต่างประเทศ'})))
assert.equal(subjectFamily({...core,activity:true}),null)
let result=check([core,extra,art],[],[row('core',1,1),row('extra',1,2),row('art',2,1)])
assert.notEqual(result.find(r=>r.lessonId==='core').day,result.find(r=>r.lessonId==='extra').day)
result=check([english,englishExtra],[],[row('en',1,1),row('en2',1,2)]);assert.notEqual(result[0].day,result[1].day)
// A full timetable improves by swapping singles across days, not dropping a lesson.
const fill=lesson('fill','ประวัติศาสตร์',1),full=[row('core',1,1),row('extra',1,2),row('art',2,1),row('fill',2,2)]
result=check([core,extra,art,fill],[],full);assert.notEqual(result.find(r=>r.lessonId==='core').day,result.find(r=>r.lessonId==='extra').day);assert.equal(result.length,4)
// If all other days are unavailable, related subjects may still share a day.
const blocked=days.slice(1).flatMap(day=>['core','extra'].flatMap(teacherId=>[1,2,3,4].map(period=>({teacherId,day,period}))))
result=check([core,extra],[],[row('core',1,1),row('extra',1,2)],blocked);assert.equal(result[0].day,result[1].day)
const locked=[row('core',1,1),row('extra',1,2)];assert.deepEqual(JSON.parse(JSON.stringify(check([core,extra],locked,[]))),[])
const double=lesson('double','คณิตศาสตร์เพิ่มเติม',2,{pattern:[2]});result=check([core,double],[],[row('core',1,1),row('double',1,3),row('double',1,4)]);assert.equal(result.filter(r=>r.lessonId==='double'&&r.day===1).length,2)
const joint=[{...core,activityGroupId:'teaching:g'},{...extra,classroomId:'B',activityGroupId:'teaching:g',teacherId:'core'}],jointRows=[row('core',1,1),row('extra',1,1,'B')];assert.deepEqual(JSON.parse(JSON.stringify(check(joint,[],jointRows))),jointRows)
// Shared venues and an outside fixed lesson must not be double booked.
const outside=lesson('outside','อื่นๆ',1,{classroomId:'B',roomId:'lab',fixedOnly:true});result=check([{...core,roomId:'lab'},extra,outside],[row('outside',2,1,'B')],[row('core',1,1),row('extra',1,2)]);assert.equal(result.length,2)
result=check([core,extra,art,fill],[],full,[],{reduceGaps:true,maxContinuous:2});assert.equal(result.length,4)
const dense=[lesson('math','คณิตศาสตร์',5),lesson('mathExtra','คณิตศาสตร์เพิ่มเติม',5)],solved=planning.solvePlannedSchedule(dense,[],{...planning.emptyPlan(),days},times,[]);assert.equal(solved.status,'complete','Soft family preference cannot make a feasible schedule fail');assert.equal(solved.assignments.length,10);assert.equal(verify(dense,solved.assignments,days,times,[]).length,0)
console.log('PASS: related maths/English separate days, swaps in full grids, necessary same-day overlap allowed, language distinction, immutable input, fixed/joint/double/venue/block constraints, morning equity and solver feasibility')
