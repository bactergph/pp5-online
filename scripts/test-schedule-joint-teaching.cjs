const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,crypto,structuredClone,AbortController,Date,console,performance,require(name){if(name==='./schedule-device-run')return{solveScheduleOnDevice:async(...args)=>load('lib/schedule-device-build.ts').buildDeviceDraft(...args)};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(abs),name+'.ts'));throw Error('Unexpected dependency '+name)}});return exports}
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const free=load('lib/schedule-device-free.ts'),joint=load('lib/schedule-joint-teaching.ts'),engine=load('lib/schedule-device-build.ts'),view=load('lib/schedule-device-view.ts')
const plan=free.normalizePlan({teachers:[{id:id(1),name:'ครูทดสอบ'},{id:id(2),name:'ครูอีกคน'}],rooms:[{id:id(10),label:'ป.4/1'},{id:id(11),label:'ป.5/1'},{id:id(12),label:'ป.6/1'}],places:[{id:id(20),name:'ห้องสอนรวม'}],subjects:[
  {id:id(30),roomId:id(10),teacherId:id(1),code:'ง14101',name:'การงานอาชีพ',periods:2,pattern:[2],placeId:id(20)},
  {id:id(31),roomId:id(11),teacherId:id(1),code:'ง15101',name:'การงานอาชีพ',periods:2,pattern:[2],placeId:id(20)},
  {id:id(32),roomId:id(12),teacherId:id(1),code:'ง16101',name:'การงานอาชีพ',periods:2,pattern:[2],placeId:id(20)},
],teachingGroups:[{id:id(40),lessonIds:[id(30),id(31)]}],blocks:[{teacherId:id(1),day:1,period:1}]})
function positions(rows,lesson){return rows.filter(r=>r.class_subject_id===lesson).map(r=>`${r.day_of_week}:${r.period}`).sort().join(',')}
function verify(draft){assert.equal(draft.status,'complete',JSON.stringify(draft.issues));assert.equal(draft.rows.length,6);assert.equal(positions(draft.rows,id(30)),positions(draft.rows,id(31)));assert.notEqual(positions(draft.rows,id(30)),positions(draft.rows,id(32)));assert.ok(!draft.rows.some(r=>r.day_of_week===1&&r.period===1));assert.equal(load('lib/schedule-verification.ts').verifyCompleteSchedule(draft.lessons,draft.rows.map(r=>({classroomId:r.classroom_id,lessonId:r.class_subject_id,day:r.day_of_week,period:r.period})),plan.days,plan.periods,plan.blocks).length,0)}
const snapshot=free.toDeviceSnapshot(plan,[]),draft=engine.buildDeviceDraft(snapshot,'2569',plan.rooms.map(r=>r.id),true);verify(draft)
assert.deepEqual([...joint.jointTeachingScope([id(10)],snapshot.lessons,plan.teachingGroups)],[id(10),id(11)])
assert.equal(load('lib/schedule-workload.ts').summarizeScheduleWorkload(view.devicePreparation(plan),[{id:id(1),prefix:'',full_name:'ครูทดสอบ',position:null}])[0].hours,4,'2 joint + 2 ordinary, not 6')
const scoped=engine.buildDeviceDraft(snapshot,'2569',[id(10)],true);assert.equal(scoped.status,'complete');assert.equal(scoped.rows.length,4,'Rebuild the connected second room automatically')
const locked=structuredClone(plan);locked.timetable=[{classroomId:id(10),subjectId:id(30),day:2,period:1,locked:true}];const partial=engine.buildDeviceDraft(free.toDeviceSnapshot(locked,[]),'2569',plan.rooms.map(r=>r.id),true);verify(partial);assert.ok(partial.rows.some(r=>r.classroom_id===id(10)&&r.day_of_week===2&&r.period===1&&r.locked));assert.ok(positions(partial.rows,id(31)).includes('2:1'))
for(const patch of [{teacherId:id(2)},{count:3,pattern:[2,1]},{roomId:null},{timePreference:'afternoon'},{classroomId:id(10)},{count:Infinity}])assert.throws(()=>joint.validateJointTeachingGroups(plan.teachingGroups,snapshot.lessons.map(l=>l.id===id(31)?{...l,...patch}:l)))
assert.throws(()=>joint.validateJointTeachingGroups([...plan.teachingGroups,{id:id(41),lessonIds:[id(30),id(32)]}],snapshot.lessons))
assert.throws(()=>joint.validateJointTeachingGroups([{id:id(40),lessonIds:[id(30),'missing']}],snapshot.lessons))

const planning=load('lib/schedule-planning.ts'),verifyEngine=load('lib/schedule-verification.ts').verifyCompleteSchedule;
const largeLessons=joint.withJointTeachingGroups([...snapshot.lessons,...Array.from({length:42},(_,i)=>({id:'extra-'+i,classroomId:'extra-room-'+i,teacherId:'extra-teacher-'+i,count:1,pattern:[1],label:'extra'}))],snapshot.plan,true);
for(const fixedRows of [[],[{classroomId:id(10),lessonId:id(30),day:2,period:1}]]){
 const answer=planning.solvePlannedSchedule(largeLessons,fixedRows,snapshot.plan,plan.periods,plan.blocks,100000,3000);assert.equal(answer.status,'complete');assert.equal(verifyEngine(largeLessons,[...fixedRows,...answer.assignments],plan.days,plan.periods,plan.blocks).length,0)
}
for(const [nodes,time]of [[0,1000],[1000,0]]){const limited=planning.solvePlannedSchedule(snapshot.lessons,[],snapshot.plan,plan.periods,plan.blocks,nodes,time);assert.equal(limited.status,'timeout');assert.equal(limited.assignments.length,0)}

// Full small-school regression, anonymized from the supplied backup. Explicitly
// release only the old locks on the two offerings being converted to joint teaching.
const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/schedule-six-room-locked-double.json','utf8'));
const schoolLessons=fixture.lessons.map(([room,teachers,count,pattern,fixedOnly,activity,group,venue,priority,spread],i)=>({id:'L'+i,classroomId:'R'+room,teacherId:!activity&&teachers.length===1?'T'+teachers[0]:null,teacherIds:activity||teachers.length>1?teachers.map(t=>'T'+t):undefined,count,pattern:pattern||undefined,fixedOnly,activity,teacherOptional:activity,activityGroupId:group<0?undefined:'G'+group,roomId:venue<0?null:'V'+venue,name:priority===2?'คณิตศาสตร์':priority===1?'ภาษาอังกฤษ':'การงานอาชีพ',timePreference:priority===3?'morning':priority===-3?'afternoon':'any',label:'R'+room+' · วิชา '+i,spread}));
const combined=joint.withJointTeachingGroups(schoolLessons,{teachingGroups:[{id:id(800),lessonIds:['L47','L60']}]},true);
const kept=fixture.fixed.filter(row=>row[1]!==47&&row[1]!==60).map(([room,lesson,day,period])=>({classroomId:'R'+room,lessonId:lesson<0?null:'L'+lesson,day,period}));
assert.equal(kept.length,53);const schoolAnswer=planning.solvePlannedSchedule(combined,kept,{...planning.emptyPlan(),days:fixture.days},fixture.periods,[],1000000,5000);assert.equal(schoolAnswer.status,'complete');assert.equal([...kept,...schoolAnswer.assignments].length,178);assert.equal(verifyEngine(combined,[...kept,...schoolAnswer.assignments],fixture.days,fixture.periods,[]).length,0);
console.log('PASS: six-room school with two joint double offerings, all 178 cells verified, 53 unrelated locks preserved; '+schoolAnswer.elapsedMs+'ms');
const before=JSON.stringify(plan)
;(async()=>{
 let saved={year:'2569',semester:2,terms:{1:{...free.normalizePlan(),substitutes:{}},2:{...plan,substitutes:{}}}},writes=0
 const services=load('lib/schedule-device-services.ts').createDeviceScheduleServices({read:()=>saved,write:async next=>{saved=next;writes++;return true}})
 let data=(await services.fetchPreparation('2569',2)).data
 assert.equal(data.plan.teachingGroups.length,1)
 const config={...data.plan,teachingGroups:plan.teachingGroups}
 const savedConfig=await services.savePreparation('2569',2,data.hash,config);assert.equal(savedConfig.error,null)
 const generated=await services.createScheduleDraft('2569',2,plan.rooms.map(r=>r.id),true);assert.equal(generated.error,null);assert.equal(generated.data.status,'complete')
 const confirmed=await services.confirmScheduleDraft(generated.data.id);assert.equal(confirmed.error,null);assert.equal(writes,2)
 assert.equal(saved.terms[2].timetable.length,6);assert.equal(saved.terms[2].teachingGroups.length,1)
 const restored=load('lib/schedule-device-backup.ts').readDeviceBackup({format:'jarnsek-device-schedule',version:1,data:saved});assert.equal(restored.terms[2].teachingGroups.length,1)
 const cells=await services.fetchTeachingScheduleGrid(id(1),'2569',2);assert.ok(Object.values(cells).some(cell=>cell.room_line.includes('ป.4/1')&&cell.room_line.includes('ป.5/1')),'Teacher timetable must show both rooms')
 data=(await services.fetchPreparation('2569',2)).data
 const change=await services.saveScheduleTeachingAssignments('2569',2,data.hash,[{lessonId:id(30),teacherId:id(2)}]);assert.ok(change.error,'Do not silently break a group when changing only one teacher')
 const cell=saved.terms[2].timetable.find(cell=>cell.subjectId===id(30));const removal=await services.saveClassScheduleCell(id(10),'2569',cell.day,cell.period,null,null,2,id(30));assert.ok(removal.error,'Do not erase half a group')
 const ungroup=await services.savePreparation('2569',2,data.hash,{...data.plan,teachingGroups:[]});assert.ok(ungroup.error,'Ungrouping must not create teacher collisions')
 assert.equal(JSON.stringify(plan),before)
 console.log('PASS: different subject codes jointly taught, double blocks/lunch, shared venue, unavailable teacher, partial locks, connected scope, teacher load counted once, incompatible groups rejected, local save/build/confirm/backup round trip, teacher grid shows both rooms, unsafe manual changes rejected')
})().catch(error=>{console.error(error);process.exitCode=1})
