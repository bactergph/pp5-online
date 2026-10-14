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
assert.equal(onlyRetained.status,'complete');assert.equal(onlyRetained.assignments.length,0);assert.ok(onlyRetained.nodes<=1)
result=solve([lesson('A','T','A',1),lesson('outside','T','B',1,{fixedOnly:true})],[slot('outside','B',1,1)],plan,times,[{teacherId:'T',day:1,period:2}]);assert.equal(result.status,'complete');assert.ok(result.assignments.every(s=>s.period>2||s.day===2));assert.ok(result.assignments.every(s=>s.classroomId==='A'))
assert.equal(solve([lesson('A','T','A',9)],[],plan,times,[]).status,'invalid')
const nodeLimited=solve([lesson('A','T','A',2)],[],plan,times,[],0);assert.equal(nodeLimited.status,'timeout');assert.equal(nodeLimited.limitReason,'node_limit')
const timeLimited=solve([lesson('A','T','A',2)],[],plan,times,[],500000,0);assert.equal(timeLimited.status,'timeout');assert.equal(timeLimited.limitReason,'time_limit')
assert.ok(checkPlanning([lesson('A',null)],[],plan.days,times,[]).some(i=>i.message.includes('ครู')))
assert.ok(checkPlanning([lesson('A','T','A',2,{pattern:[3]})],[],plan.days,times,[]).some(i=>i.message.includes('รูปแบบ')))
const activities=[lesson('act',null,'A',1,{activity:true,teacherOptional:true,fixedOnly:true}),lesson('actB',null,'B',1,{activity:true,teacherOptional:true,fixedOnly:true})];result=solve([...activities,lesson('A','T','A',2),lesson('B','T','B',2)],[slot('act','A',1,1),slot('actB','B',1,1)],plan,times,[]);assert.equal(result.status,'complete');assert.ok(result.assignments.every(s=>s.day!==1||s.period!==1));
console.log('PASS: shared teacher/venue; actual lunch boundaries; locked doubles; outside scope; teacher unavailable; capacity; timeout; activity preservation')
const week=emptyPlan()
const morning=solve([lesson('math','TM','R',10,{preferMorning:true}),lesson('art','TA','R',10)],[],week,times,[])
assert.equal(morning.status,'complete')
assert.ok(morning.assignments.filter(s=>s.lessonId==='math').every(s=>s.period<=2),JSON.stringify(morning.assignments.filter(s=>s.lessonId==='math')))
console.log('PASS: morning preference keeps core subjects before lunch',morning.solver)

const helpers={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-helpers.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:helpers,require:()=>({})});
for(const [date,term] of [['2026-03-31T16:59:00Z',2],['2026-03-31T17:00:00Z',1],['2026-09-30T16:59:00Z',1],['2026-09-30T17:00:00Z',2],['2027-01-15T00:00:00Z',2]])assert.equal(helpers.currentScheduleSemester(new Date(date)),term);
const storedTimes=helpers.DEFAULT_PERIOD_TIMES.map(t=>({...t,start_time:t.start_time+':00',end_time:t.end_time+':00'}));
const editorTimes=helpers.normalizePeriodTimes(storedTimes);assert.equal(helpers.validatePeriodTimes(editorTimes),null);assert.equal(storedTimes[0].start_time,'08:30:00');assert.equal(editorTimes[0].start_time,'08:30');
assert.equal(helpers.validatePeriodTimes(helpers.moveLunchBreak(editorTimes,4)),null);
assert.equal(helpers.teacherGivenName('นายสมชาย ใจดี, นางสาวสมหญิง รักเรียน'),'สมชาย, สมหญิง');
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
// Regression for an adverse retained timetable: these anonymized per-room,
// per-teacher loads match the school's six-room load matrix, with courses
// taught by the same teacher in one room combined (same hard constraints).
// A shuffled feasible full timetable can make chronological slot search
// exhaust its budget; constrained periods must be attempted first.
const retainedLoadByRoom={1:{2:3,4:5,6:17},2:{2:3,3:17,4:5},3:{1:2,2:3,4:5,5:5,7:8,8:2},4:{1:11,2:2,4:3,5:4,7:3,8:2},5:{1:3,2:2,3:1,4:3,5:4,7:3,8:9},6:{1:4,2:2,3:1,4:3,5:7,7:6,8:2}};
const retainedPlan=emptyPlan(),retainedLessons=[],retainedActivities=[];
for(let room=1;room<=6;room++){
  for(const [teacher,count] of Object.entries(retainedLoadByRoom[room]))retainedLessons.push(lesson(`Q${room}T${teacher}`,`T${teacher}`,`Q${room}`,count,{spread:true}));
  for(let day=1;day<=5;day++){const id=`Q${room}A${day}`;retainedLessons.push(lesson(id,null,`Q${room}`,1,{activity:true,fixedOnly:true,teacherOptional:true,teacherIds:[`Activity${day}`],activityGroupId:`Activity${day}`}));retainedActivities.push(slot(id,`Q${room}`,day,6))}
}
function shuffleSeed(values,seed){const copy=values.slice();let state=seed;for(let index=copy.length-1;index>0;index--){state=(state*1664525+1013904223)>>>0;const other=state%(index+1);[copy[index],copy[other]]=[copy[other],copy[index]]}return copy}
const adverseLessons=shuffleSeed(retainedLessons,16),feasibleFull=solve(adverseLessons,retainedActivities,retainedPlan,schoolTimes,[]);
assert.equal(feasibleFull.status,'complete','adverse six-room load must have a feasible full schedule');
const adverseFixed=[...retainedActivities,...feasibleFull.assignments.filter(s=>s.classroomId==='Q5'||s.classroomId==='Q6')],adverseStart=Date.now();
const adversePartial=solve(adverseLessons,adverseFixed,retainedPlan,schoolTimes,[],500_000,1_000);
assert.equal(adversePartial.status,'complete',`dense partial rebuild must complete for the retained load; got ${adversePartial.status} (${adversePartial.nodes} nodes)`);
assert.equal(adversePartial.assignments.length,100);
assert.ok(Date.now()-adverseStart<1_000,`adverse retained rebuild took ${Date.now()-adverseStart}ms`);
console.log(`PASS: adverse six-room retained schedule completed in ${Date.now()-adverseStart}ms (${adversePartial.nodes} search nodes)`);
// Mirror the production six-room load shape: one classroom has ten course
// rows sharing one venue for 22 weekly periods and another venue-constrained
// course for two periods. A second room also uses the first venue so the
// solver must avoid venue collisions across classrooms. Keep two rooms fixed
// to exercise the normal Quick Wizard rebuild path.
const venuePlan=emptyPlan();venuePlan.days=[1,2,3,4,5];
const venueLessons=[],venueFixed=[];
function addVenueLesson(id,teacher,room,count,roomId=null){venueLessons.push(lesson(id,teacher,room,count,{roomId}))}
for(let room=1;room<=6;room++){
  const classroom=`V${room}`;
  if(room===1){
    addVenueLesson('V1T2plain','T2',classroom,1);addVenueLesson('V1T2venueB','T2',classroom,2,'venue-B');
    for(const [i,count] of [2,2,1].entries())addVenueLesson(`V1T4venueA${i}`,'T4',classroom,count,'venue-A');
    for(const [i,count] of [3,3,3,2,2,2,2].entries())addVenueLesson(`V1T6venueA${i}`,'T6',classroom,count,'venue-A');
  }else if(room===2){
    addVenueLesson('V2T2','T2',classroom,3);addVenueLesson('V2T3venueA','T3',classroom,2,'venue-A');addVenueLesson('V2T3','T3',classroom,15);addVenueLesson('V2T4','T4',classroom,5);
  }else for(const [teacher,count] of Object.entries(retainedLoadByRoom[room]))addVenueLesson(`V${room}T${teacher}`,`T${teacher}`,classroom,count);
  for(let day=1;day<=5;day++){const id=`${classroom}A${day}`;venueLessons.push(lesson(id,null,classroom,1,{activity:true,fixedOnly:true,teacherOptional:true,teacherIds:[`Activity${day}`],activityGroupId:`Activity${day}`}));venueFixed.push(slot(id,classroom,day,6))}
}
const venueStart=Date.now(),venueFull=solve(venueLessons,venueFixed,venuePlan,schoolTimes,[]);
assert.equal(venueFull.status,'complete',`dense solver with venue constraints should complete; got ${venueFull.status} (${venueFull.limitReason||'no limit'}): ${venueFull.message||''}`);
assert.equal(venueFull.solver,'dense_slot_matching','venue constraints must use the fast dense solver');
assert.equal(venueFull.assignments.length,150);
const venueTeachers=new Map(venueLessons.map(l=>[l.id,l.teacherId])),venueById=new Map(venueLessons.map(l=>[l.id,l.roomId])),venueClassCells=new Set(),venueTeacherCells=new Set(),venueUsed=new Set(),venueCounts=new Map();
for(const s of [...venueFixed,...venueFull.assignments]){const time=`${s.day}:${s.period}`,classCell=`${s.classroomId}:${time}`;assert.ok(!venueClassCells.has(classCell),`venue case class collision at ${classCell}`);venueClassCells.add(classCell);const teacher=venueTeachers.get(s.lessonId);if(teacher){const teacherCell=`${teacher}:${time}`;assert.ok(!venueTeacherCells.has(teacherCell),`venue case teacher collision at ${teacherCell}`);venueTeacherCells.add(teacherCell);venueCounts.set(s.lessonId,(venueCounts.get(s.lessonId)||0)+1)}const place=venueById.get(s.lessonId);if(place){const placeCell=`${place}:${time}`;assert.ok(!venueUsed.has(placeCell),`venue collision at ${placeCell}`);venueUsed.add(placeCell)}}
for(const l of venueLessons.filter(l=>!l.activity))assert.equal(venueCounts.get(l.id),l.count,`${l.id} quota should be met`);
const venueRetained=[...venueFixed,...venueFull.assignments.filter(s=>s.classroomId==='V5'||s.classroomId==='V6')],venuePartialStart=Date.now(),venuePartial=solve(venueLessons,venueRetained,venuePlan,schoolTimes,[]);
assert.equal(venuePartial.status,'complete',`venue-aware partial rebuild should complete with two fixed rooms; got ${venuePartial.status} (${venuePartial.limitReason||'no limit'}): ${venuePartial.message||''}`);
assert.equal(venuePartial.solver,'dense_slot_matching');assert.equal(venuePartial.assignments.length,100);
const combinedVenueRows=[...venueRetained,...venuePartial.assignments],combinedVenueCells=new Set(),combinedTeacherCells=new Set(),combinedClassCells=new Set(),combinedCounts=new Map();
for(const s of combinedVenueRows){const time=`${s.day}:${s.period}`,classCell=`${s.classroomId}:${time}`;assert.ok(!combinedClassCells.has(classCell),`partial rebuild class collision at ${classCell}`);combinedClassCells.add(classCell);const teacher=venueTeachers.get(s.lessonId);if(teacher){const teacherCell=`${teacher}:${time}`;assert.ok(!combinedTeacherCells.has(teacherCell),`partial rebuild teacher collision at ${teacherCell}`);combinedTeacherCells.add(teacherCell);combinedCounts.set(s.lessonId,(combinedCounts.get(s.lessonId)||0)+1)}const venue=venueById.get(s.lessonId);if(venue){const venueCell=`${venue}:${time}`;assert.ok(!combinedVenueCells.has(venueCell),`partial rebuild venue collision at ${venueCell}`);combinedVenueCells.add(venueCell)}}
for(const l of venueLessons.filter(l=>!l.activity))assert.equal(combinedCounts.get(l.id),l.count,`${l.id} retained and generated quota should be met`);
assert.ok(Date.now()-venuePartialStart<8_000,`venue-aware retained rebuild took ${Date.now()-venuePartialStart}ms`);
// Also make one of the venue-using rooms fixed, and verify its venue is
// reserved while the other open rooms are rebuilt.
const pinnedVenueRows=[...venueFixed,...venueFull.assignments.filter(s=>s.classroomId==='V1'||s.classroomId==='V5')],pinnedVenueStart=Date.now(),pinnedVenueDraft=solve(venueLessons,pinnedVenueRows,venuePlan,schoolTimes,[]);
assert.equal(pinnedVenueDraft.status,'complete',`fixed venue reservation should leave a solution; got ${pinnedVenueDraft.status}`);
assert.equal(pinnedVenueDraft.solver,'dense_slot_matching');
const pinnedVenueCells=new Set(pinnedVenueRows.flatMap(s=>venueById.get(s.lessonId)?[`${venueById.get(s.lessonId)}:${s.day}:${s.period}`]:[]));
assert.ok(pinnedVenueDraft.assignments.every(s=>!venueById.get(s.lessonId)||!pinnedVenueCells.has(`${venueById.get(s.lessonId)}:${s.day}:${s.period}`)),'rebuilt lessons cannot collide with venues reserved by fixed rooms');
console.log(`PASS: production-shaped six-room case via ${venueFull.solver} in ${venueFull.elapsedMs}ms/${venueFull.nodes} nodes; P5/P6-style retained rebuild in ${venuePartial.elapsedMs}ms/${venuePartial.nodes} nodes; fixed venue exclusion in ${pinnedVenueDraft.elapsedMs}ms`);
const slackPlan=emptyPlan();slackPlan.days=[1,2,3,4];
const slackLessons=[];
for(let room=0;room<8;room++)for(let subject=0;subject<5;subject++)slackLessons.push(lesson(`S${room}-${subject}`,`ST${subject}`,`SR${room}`,2));
const slackStart=Date.now(),slack=solve(slackLessons,[],slackPlan,schoolTimes,[{teacherId:'ST0',day:1,period:1}]);
assert.equal(slack.status,'complete',`slack timetable should complete quickly; got ${slack.status} (${slack.limitReason||''}) ${slack.message||''}`);
assert.equal(slack.assignments.length,80);
assert.ok(Date.now()-slackStart<2000,`8-room slack timetable took ${Date.now()-slackStart}ms`);
const slackClass=new Set(),slackTeacher=new Set(),slackTeacherById=new Map(slackLessons.map(l=>[l.id,l.teacherId]));
for(const s of slack.assignments){const classKey=`${s.classroomId}:${s.day}:${s.period}`,teacher=slackTeacherById.get(s.lessonId),teacherKey=`${teacher}:${s.day}:${s.period}`;assert.ok(!slackClass.has(classKey));slackClass.add(classKey);assert.ok(!slackTeacher.has(teacherKey));slackTeacher.add(teacherKey);assert.ok(!(teacher==='ST0'&&s.day===1&&s.period===1))}
console.log(`PASS: 8-room timetable with empty slots and a blocked teacher via ${slack.solver} in ${Date.now()-slackStart}ms`);
