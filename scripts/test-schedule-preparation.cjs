const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
function moduleFrom(path,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:n=>deps[n]||{}});return exports}
const schedules=moduleFrom('lib/schedules.ts',{});
const teams=moduleFrom('lib/schedule-activity-teams.ts',{'./schedule-helpers':{}});
for(const level of ['อ.2','อ.3','อ2','อนุบาล 2'])assert.equal(schedules.isTimetableClassroom(level),false);
for(const level of ['ป.1','ป.6','ม.1','ม.6'])assert.equal(schedules.isTimetableClassroom(level),true);
const solver=moduleFrom('lib/schedule-solver.ts',{});const planning=moduleFrom('lib/schedule-planning.ts',{'./schedule-solver':solver,'./schedule-block-repair':moduleFrom('lib/schedule-block-repair.ts',{})});const periods=[1,0,2].map((period,i)=>({period,is_break:period===0,sort_order:i+1,label:'คาบ',start_time:'0'+(8+i)+':00',end_time:(9+i<10?'0':'')+(9+i)+':00'}));periods[2].start_time='10:00';
let session={schoolId:'school',userId:'admin',role:'admin'},captured=null,liveWrites=0,planConfig=null,planWrites=0;
const data={classrooms:[{id:'A',level:'ป.1',room:1},{id:'B',level:'ป.1',room:2}],lessons:[{id:'math',classroomId:'A',teacherId:'T',count:1,label:'Math',name:'คณิต',activity:false}],slots:[{classroom_id:'A',academic_year_id:'year',day_of_week:1,period:1,class_subject_id:'math',activity_id:null,note:null,locked:true}]};
const db={rpc:async(name,args)=>{if(name==='save_schedule_plan'){planWrites++;planConfig=structuredClone(args.p_config)}return {data:name==='schedule_snapshot'?'snapshot':true,error:null}},from(table){let inserted;const q={select(){return q},eq(){return q},or(){return q},in(){return q},limit(){return q},order(){return q},is(){return q},insert(value){assert.equal(table,'schedule_drafts');captured=value;inserted=value;return q},update(){return q},async single(){return {data:{id:'draft'},error:null}},async maybeSingle(){return {data:table==='schedule_plans'&&planConfig?{config:planConfig}:null,error:null}},then(resolve){resolve({data:table==='users'?[{id:'T',prefix:'ครู',full_name:'ทดสอบ'}]:table==='school_period_times'?periods:table==='evaluation_settings'?[{id:'activity',label:'แนะแนว'}]:[],error:null})}};return q}};
const key=s=>s.activity_id?'activity:'+s.activity_id:s.class_subject_id;
const api=moduleFrom('lib/schedule-preparation.ts',{'./schedule-joint-teaching':moduleFrom('lib/schedule-joint-teaching.ts',{}),'node:crypto':require('crypto'),'./session':{getSession:async()=>session},'./supabase':{createServerClient:()=>db},'./schedules':schedules,'./schedule-activity-teams':teams,'./schedule-store':{loadSchedule:async()=>structuredClone(data),loadScheduleConstraints:async()=>({blocks:[]}),lessonKey:key,lessonColumns:id=>({class_subject_id:id&&!id.startsWith('activity:')?id:null,activity_id:id?.startsWith('activity:')?id.slice(9):null})},'./schedule-helpers':{DEFAULT_PERIOD_TIMES:periods,normalizePeriodTimes:times=>times.map(r=>({...r,start_time:r.start_time.slice(0,5),end_time:r.end_time.slice(0,5)})),validatePeriodTimes:()=>null},'./schedule-planning':planning,'./schedule-places':moduleFrom('lib/schedule-places.ts',{}),'./schedule-verification':moduleFrom('lib/schedule-verification.ts',{'./schedule-planning':planning})});
(async()=>{
// Reproduce the reported save: unrelated ม.6 subjects containing “ชน” have no teacher.
const originalData=structuredClone(data),venue='11111111-1111-4111-8111-111111111199';
for(const [index,room] of ['2PL','3PS','1PA'].entries()){
 const classroomId='six-'+index;data.classrooms.push({id:classroomId,level:'ม.6',room:index+1});
 data.lessons.push({id:'community-'+index,classroomId,teacherId:null,count:1,label:'ม.6/'+room+' · การพูดต่อหน้าชุมชน',name:'การพูดต่อหน้าชุมชน',activity:false});
}
let config={...planning.emptyPlan(),rooms:[{id:venue,name:'ห้อง ป.1/1'}],rules:{math:{count:2,pattern:[1,1],roomId:venue,morning:false,spread:true,timePreference:'any'}}};
await api.savePlan('year',1,'snapshot',config);assert.equal(planWrites,1,'An unrelated missing teacher must not block an incremental workload save');
assert.equal(planConfig.rules.math.roomId,venue);assert.equal(planConfig.rules.math.count,2);
const partialCheck=await api.preflight('year',1,data.classrooms.map(room=>room.id),true);
assert.equal(partialCheck.issues.filter(issue=>issue.message.includes('การพูดต่อหน้าชุมชน')&&issue.message.includes('ยังไม่มีครู')).length,3,'Final readiness still requires teachers for all selected subjects');
const partialDraft=await api.generate('year',1,data.classrooms.map(room=>room.id),true);assert.equal(partialDraft.status,'invalid','Saving partial inputs must not allow incomplete timetables');
// Real timetable conflicts still block preparation saves without writing.
const existing=structuredClone(data.slots),writeCount=planWrites;
data.lessons.push({id:'other',classroomId:'B',teacherId:'T',count:1,label:'Other',activity:false});
const second={...data.slots[0],classroom_id:'B',class_subject_id:'other'};data.slots.push(second);
await assert.rejects(api.savePlan('year',1,'snapshot',config),/ครูชน/);assert.equal(planWrites,writeCount);
data.lessons.find(row=>row.id==='other').teacherId='T2';
config={...config,rules:{...config.rules,other:{count:1,pattern:[1],roomId:venue,morning:false,spread:true}}};
await assert.rejects(api.savePlan('year',1,'snapshot',config),/สถานที่ชน/);assert.equal(planWrites,writeCount);
data.slots=structuredClone(existing);delete config.rules.other;
await assert.rejects(api.savePlan('year',1,'snapshot',{...config,days:[2,3,4,5]}),/นอกวัน/);assert.equal(planWrites,writeCount);
data.slots.push({...existing[0],day_of_week:2});
await assert.rejects(api.savePlan('year',1,'snapshot',{...config,rules:{math:{...config.rules.math,count:1,pattern:[1]}}}),/คาบเดิมเกิน/);assert.equal(planWrites,writeCount);
data.classrooms=originalData.classrooms;data.lessons=originalData.lessons;data.slots=originalData.slots;planConfig=null;
console.log('PASS: community-named subjects without teachers do not block saving other workloads; final readiness and generation still reject missing teachers; teacher/venue/day/quota conflicts still block saves');
const before=JSON.stringify(data.slots);const draft=await api.generate('year',1,['A'],true);assert.equal(draft.status,'complete');assert.equal(JSON.stringify(data.slots),before);assert.ok(captured.after_rows);assert.equal(captured.actor_id,'admin');assert.equal(captured.school_id,'school');
const bulk=await api.activityDraft('year',1,'activity',['A','B'],[{day:1,period:1},{day:2,period:2}],false);assert.equal(bulk.locked,1);assert.equal(bulk.affected,1);assert.equal(captured.after_rows.length,4);assert.equal(captured.offerings.length,2);assert.equal(captured.unlock_cells.length,1);assert.equal(JSON.stringify(data.slots),before);
await assert.rejects(api.activityDraft('year',1,'activity',['foreign'],[{day:1,period:1}],false),/เลือก/);await assert.rejects(api.activityDraft('year',1,'activity',['A'],[{day:1,period:0}],false),/นอกเวลา/);await assert.rejects(api.activityDraft('year',1,'activity',['A','A'],[{day:1,period:1}],false),/ซ้ำ/);
data.classrooms.push({id:'K2',level:'อ.2',room:1},{id:'K3',level:'อ.3',room:1});
let prepared=await api.preparation('year',1);assert.equal(prepared.classrooms.length,2);assert.ok(prepared.classrooms.every(c=>c.level.startsWith('ป.')));
let checked=await api.preflight('year',1,prepared.classrooms.map(c=>c.id),true);assert.ok(!checked.issues.some(i=>/อ\.[23]/.test(i.message)));
await assert.rejects(api.generate('year',1,['K2'],true),/ไม่รวมอนุบาล/);await assert.rejects(api.activityDraft('year',1,'activity',['K3'],[{day:1,period:1}],false),/เลือก/);
// Existing kindergarten teaching still occupies the shared teacher's time and is preserved.
data.lessons.push({id:'kindergarten',classroomId:'K2',teacherId:'T',count:1,label:'อนุบาล',name:'อนุบาล',activity:false});
data.slots.push({classroom_id:'K2',academic_year_id:'year',day_of_week:1,period:1,class_subject_id:'kindergarten',activity_id:null,note:null,locked:false});
prepared=await api.preparation('year',1);assert.ok(prepared.slots.some(s=>s.classroom_id==='K2'));checked=await api.preflight('year',1,['A'],true);assert.ok(checked.issues.some(i=>i.severity==='error'&&/ครูชน/.test(i.message)));
console.log('PASS: kindergarten excluded from wizard and server scope; existing kindergarten timetable retained for teacher conflicts');
data.lessons=data.lessons.filter(l=>l.id!=='kindergarten');data.slots=data.slots.filter(s=>s.class_subject_id!=='kindergarten');
planConfig={days:[1,2,3,4,5],rooms:[],rules:{},reduceGaps:false,maxContinuous:0,activityGroups:[{id:'11111111-1111-4111-8111-111111111111',settingId:'activity',mode:'joint',roomIds:['A','B'],teacherIds:['T'],roomTeachers:{},weeklyPeriods:1,cells:[{day:2,period:2}]}]};
data.slots.push({classroom_id:'A',academic_year_id:'year',day_of_week:2,period:2,class_subject_id:'math',activity_id:null,note:null,locked:true});
const withActivity=await api.generate('year',1,['A'],true);assert.equal(withActivity.status,'complete');assert.equal(withActivity.locked,1);assert.equal(captured.offerings.length,2);assert.equal(captured.unlock_cells.length,1);
assert.ok(captured.after_rows.some(r=>r.classroom_id==='A'&&r.day_of_week===2&&r.period===2&&r.activity_id&&!r.class_subject_id));
assert.ok(captured.after_rows.some(r=>r.classroom_id==='B'&&r.day_of_week===2&&r.period===2&&r.activity_id&&!r.class_subject_id));
assert.ok(captured.after_rows.some(r=>r.classroom_id==='A'&&r.day_of_week===1&&r.period===1&&r.class_subject_id==='math'));
console.log('PASS: activity teams are pinned into the draft, including rooms outside the selected scope');
// Empty cells turn the same activity into an automatically placed weekly workload.
data.slots=data.slots.filter(s=>!(s.classroom_id==='A'&&s.day_of_week===2&&s.period===2));
planConfig.activityGroups[0]={...planConfig.activityGroups[0],cells:[],weeklyPeriods:2};
const beforeFlexible=JSON.stringify(data.slots);
const automaticActivity=await api.generate('year',1,['A'],true);
assert.equal(automaticActivity.status,'complete');assert.equal(JSON.stringify(data.slots),beforeFlexible);
const automaticRows=captured.after_rows.filter(row=>row.activity_id);
assert.equal(automaticRows.length,4);
const activityCells=room=>automaticRows.filter(row=>row.classroom_id===room).map(row=>`${row.day_of_week}:${row.period}`).sort().join(',');
assert.equal(activityCells('A'),activityCells('B'));assert.ok(automaticRows.every(row=>row.period!==0));
assert.equal(automaticActivity.activityLessons.length,2);
assert.ok(automaticActivity.preview.lessons.some(l=>l.id==='math'));
assert.deepEqual(Array.from(automaticActivity.preview.days),planConfig.days);
assert.equal(automaticActivity.preview.periods[0].start_time,'08:00');
// Pinned activities must be checked before generation too, even outside the selected rooms:
// the database validates every configured activity group when committing the whole timetable.
const savedGroup=planConfig.activityGroups[0],savedDraft=captured;
planConfig.activityGroups[0]={...savedGroup,cells:[{day:2,period:2}],weeklyPeriods:1,teacherIds:['Inactive']};
let badActivity=await api.generate('year',1,['A'],true);
assert.equal(badActivity.status,'invalid');assert.equal(captured,savedDraft);
assert.ok(badActivity.issues.some(i=>i.step===5&&/ครู/.test(i.message)));
planConfig.activityGroups[0]={...savedGroup,settingId:'deleted-activity'};
badActivity=await api.generate('year',1,['A'],true);
assert.equal(badActivity.status,'invalid');assert.equal(captured,savedDraft);
assert.ok(badActivity.issues.some(i=>i.step===5&&/กิจกรรม/.test(i.message)));
planConfig.activityGroups[0]={...savedGroup,roomIds:['missing-room']};
badActivity=await api.generate('year',1,['A'],true);
assert.equal(badActivity.status,'invalid');assert.equal(captured,savedDraft);
planConfig.activityGroups[0]=savedGroup;
data.lessons.push({id:'activity:existing',classroomId:'A',teacherId:null,count:2,label:'A · แนะแนว',subjectId:'activity',name:'แนะแนว',teacherName:'',activity:true,teacherOptional:true});
data.slots.push({classroom_id:'A',academic_year_id:'year',day_of_week:4,period:2,class_subject_id:null,activity_id:'existing',note:null,locked:true});
const lockedActivity=await api.generate('year',1,['A'],true);
assert.equal(lockedActivity.status,'complete');
assert.ok(captured.after_rows.some(row=>row.classroom_id==='A'&&row.activity_id==='existing'&&row.locked&&row.day_of_week===4&&row.period===2));
assert.ok(captured.after_rows.some(row=>row.classroom_id==='B'&&row.activity_id&&row.day_of_week===4&&row.period===2));
console.log('PASS: flexible activity weekly quota included in draft; joint rooms outside selected scope synchronize; locked activity retained; live timetable unchanged');
assert.ok(automaticActivity.affectedRooms.includes('B'));
assert.equal(automaticActivity.summary[0].target,automaticActivity.summary[0].scheduled);
await assert.rejects(api.preflight('year',1,['A','A'],true),/ซ้ำ/);
// Selected teachers constrain the selected work, not retained work in other rooms.
planConfig={...planning.emptyPlan(),teacherIds:['T']};
data.lessons=[{id:'math',classroomId:'A',teacherId:'T',count:1,label:'A · Math',name:'คณิต',activity:false},{id:'outside',classroomId:'B',teacherId:'Other',count:1,label:'B · Outside',activity:false}];
data.slots=[{classroom_id:'A',academic_year_id:'year',day_of_week:1,period:1,class_subject_id:'math',activity_id:null,note:null,locked:false},{classroom_id:'B',academic_year_id:'year',day_of_week:2,period:2,class_subject_id:'outside',activity_id:null,note:null,locked:false}];
const scoped=await api.preflight('year',1,['A'],true);assert.ok(!scoped.issues.some(i=>i.severity==='error'));
const fill=await api.generate('year',1,['A'],false);assert.equal(fill.status,'complete');assert.ok(fill.issues.some(i=>i.severity==='warning'&&/เติมเฉพาะ/.test(i.message)));
data.lessons[0].teacherId=null;
const missing=await api.preflight('year',1,['A'],true);assert.equal(missing.issues.filter(i=>/ยังไม่มีครู/.test(i.message)).length,1);assert.ok(!missing.issues.some(i=>/รายการครู/.test(i.message)));
data.lessons[0].teacherId='T';data.lessons[0].count=2;data.slots=data.slots.filter(s=>s.classroom_id!=='A');
const realSolver=planning.solvePlannedSchedule,previousDraft=captured;
planning.solvePlannedSchedule=()=>({status:'complete',issues:[],assignments:[],nodes:0});
const incomplete=await api.generate('year',1,['A'],true);assert.equal(incomplete.status,'invalid');assert.equal(incomplete.id,null);assert.equal(captured,previousDraft);assert.ok(incomplete.issues.some(i=>/จัดได้ 0 จาก 2/.test(i.message)));
planning.solvePlannedSchedule=realSolver;
await assert.rejects(api.cancelDraft('committed-or-foreign'),/ถูกบันทึกใช้แล้ว/);
console.log('PASS: scope-safe teacher selection, missing-teacher deduplication, retained warnings, outside activity impact, duplicate scope rejection, independent answer validation and truthful cancellation');
// Venue-only mutations reuse the authorized, atomic snapshot-checked plan RPC.
data.classrooms=structuredClone(originalData.classrooms);data.lessons=structuredClone(originalData.lessons);data.slots=structuredClone(originalData.slots);planConfig=null;
const placeId='11111111-1111-4111-8111-111111111198';
let locations=await api.savePlaces('year',1,'snapshot',{kind:'add',place:{id:placeId,name:'ห้องทดลอง'}});assert.equal(locations.plan.rooms[0].name,'ห้องทดลอง');
locations=await api.savePlaces('year',1,'snapshot',{kind:'assign',lessonId:'math',placeId});assert.equal(locations.lessons[0].roomName,'ห้องทดลอง');assert.equal(locations.plan.rules.math.count,1);
locations=await api.savePlaces('year',1,'snapshot',{kind:'rename',id:placeId,name:'ห้องทดลองใหม่'});assert.equal(locations.lessons[0].roomName,'ห้องทดลองใหม่');
data.lessons[0].roomName='ชื่อสถานที่เดิม';locations=await api.savePlaces('year',1,'snapshot',{kind:'assign',lessonId:'math',placeId:null});assert.equal(locations.lessons[0].roomName,'','An explicit clear must not resurrect the legacy place name');
const writesBeforeStale=planWrites;await assert.rejects(api.savePlaces('year',1,'stale',{kind:'rename',id:placeId,name:'ห้ามเขียน'}),/เปลี่ยนแล้ว/);assert.equal(planWrites,writesBeforeStale);
locations=await api.savePlaces('year',1,'snapshot',{kind:'remove',id:placeId,replacementId:null});assert.equal(locations.plan.rooms.length,0);
session={...session,role:'teacher'};await assert.rejects(api.savePlaces('year',1,'snapshot',{kind:'add',place:{id:placeId,name:'ห้ามเขียน'}}),/สิทธิ์/);
console.log('PASS: online place CRUD uses school/role authorization and atomic plan snapshots, preserves quotas, refreshes labels and explicitly clears legacy names');
session={...session,role:'teacher'};await assert.rejects(api.generate('year',1,['A'],true),/สิทธิ์/);session=null;await assert.rejects(api.confirmDraft('draft'),/สิทธิ์/);assert.equal(liveWrites,0);console.log('PASS: preparation authorization, auto writes draft only, multi-room/multi-cell activity preview and locked impact, scope/duplicate/break rejection')})().catch(e=>{console.error(e);process.exitCode=1});
