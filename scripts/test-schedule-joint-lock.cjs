const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,crypto,structuredClone,AbortController,Date,console,performance,require(name){if(name==='./schedule-device-run')return{solveScheduleOnDevice:async(...args)=>load('lib/schedule-device-build.ts').buildDeviceDraft(...args)};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(abs),name+'.ts'));throw Error('Unexpected dependency '+name)}});return exports}

const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'),free=load('lib/schedule-device-free.ts'),view=load('lib/schedule-device-view.ts'),lock=load('lib/schedule-joint-lock.ts').applyJointTeachingLock;
const plan=free.normalizePlan({teachers:[{id:id(1),name:'ครูทดสอบ'}],rooms:[{id:id(10),label:'ป.4/1'},{id:id(11),label:'ป.5/1'}],subjects:[10,11].map((room,i)=>({id:id(30+i),roomId:id(room),teacherId:id(1),code:'course-'+i,name:'การงาน',periods:2,pattern:[2],placeId:null})),teachingGroups:[{id:id(40),lessonIds:[id(30),id(31)]}]});
const request={lessonId:id(30),day:1,period:1,locked:true,expected:[10,11].map(room=>({classroomId:id(room),lessonId:null,locked:false}))};
const data=view.devicePreparation(plan),rows=lock(data,request,'2569');assert.equal(rows.length,2);assert.ok(rows.every(row=>row.locked&&row.day_of_week===1&&row.period===1));assert.equal(plan.timetable.length,0);
assert.throws(()=>lock({...data,blocks:[{teacherId:id(1),day:1,period:1}]},request,'2569'),/ไม่ว่าง/);
assert.throws(()=>lock({...data,slots:[{classroom_id:id(11),academic_year_id:'2569',day_of_week:1,period:1,class_subject_id:null,activity_id:null,locked:true,note:null}]},request,'2569'),/เปลี่ยน/);
assert.throws(()=>lock(data,{...request,expected:[request.expected[0]]},'2569'),/เปลี่ยน/);
assert.throws(()=>lock({...data,blocks:[{teacherId:id(1),day:1,period:2}]},{...request,period:3},'2569'),/รูปแบบ/,'A double cannot straddle lunch or leave an isolated retained period');
;(async()=>{let saved={year:'2569',semester:2,terms:{1:{...free.normalizePlan(),substitutes:{}},2:{...plan,substitutes:{}}}},writes=0;const services=load('lib/schedule-device-services.ts').createDeviceScheduleServices({read:()=>saved,write:async next=>{saved=next;writes++;return true}});
const result=await services.setJointTeachingScheduleCell('2569',2,request);assert.equal(result.error,null);assert.equal(writes,1);assert.equal(saved.terms[2].timetable.filter(cell=>cell.locked).length,2);
const expected=[10,11].map((room,i)=>({classroomId:id(room),lessonId:id(30+i),locked:true}));
assert.ok((await services.setJointTeachingScheduleCell('2569',2,request)).error,'A stale second write must fail');assert.equal(writes,1);
assert.equal((await services.setJointTeachingScheduleCell('2569',2,{...request,locked:false,expected})).error,null);assert.ok(saved.terms[2].timetable.every(cell=>!cell.locked));
const removal=await services.setJointTeachingScheduleCell('2569',2,{...request,locked:false,remove:true,expected:expected.map(row=>({...row,locked:false}))});assert.equal(removal.error,null);assert.equal(saved.terms[2].timetable.length,0);
console.log('PASS: atomic joint placement/lock/unlock/remove in both rooms, one durable write, stale requests and unrelated locks rejected, teacher blocks/lunch/double completion preserved');
})().catch(error=>{console.error(error);process.exitCode=1});
