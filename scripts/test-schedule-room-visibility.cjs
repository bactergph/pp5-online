const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict'),cache={}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,crypto,structuredClone,AbortController,Date,console,require(name){if(name==='./schedule-device-run')return {solveScheduleOnDevice:async(...args)=>load('lib/schedule-device-build.ts').buildDeviceDraft(...args)};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(abs),name+'.ts'));throw Error('Unexpected '+name)}});return exports}
const {normalizePlan}=load('lib/schedule-device-free.ts'),{createDeviceScheduleServices}=load('lib/schedule-device-services.ts'),{devicePreparation}=load('lib/schedule-device-view.ts'),{readDeviceBackup}=load('lib/schedule-device-backup.ts'),{deviceDisplaySchedule,deviceWorkload}=load('lib/schedule-device-documents.ts')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,json=value=>JSON.parse(JSON.stringify(value))
async function run(){
 const rooms=[{id:id(1),label:'ป.1/IP'},{id:id(2),label:'ป.1/EP'},{id:id(3),label:'อ.3/1'}],teachers=[{id:id(10),name:'ครู ก'},{id:id(11),name:'ครู ข'}],subjects=rooms.slice(0,2).map((room,i)=>({id:id(20+i),roomId:room.id,code:'ท'+i,name:'ภาษาไทย',teacherId:teachers[i].id,periods:2,pattern:[1,1]}))
 const plan={...normalizePlan({rooms,teachers,subjects,timetable:[{classroomId:rooms[0].id,subjectId:subjects[0].id,day:1,period:1,locked:true},{classroomId:rooms[1].id,subjectId:subjects[1].id,day:2,period:2,locked:true}],activities:[{id:id(30),settingId:id(31),name:'ลูกเสือ',mode:'joint',roomIds:rooms.slice(0,2).map(r=>r.id),teacherId:teachers[0].id,teacherIds:[teachers[0].id],roomTeachers:{},roomTeacherIds:{},weeklyPeriods:1,cells:[{day:5,period:6}]}]}),substitutes:{}}
 let bundle={year:'2569',semester:2,terms:{1:structuredClone(plan),2:structuredClone(plan)}},fail=false
 const ops=createDeviceScheduleServices({read:()=>bundle,write:async next=>{if(fail)return false;bundle=next;return true}}),get=()=>bundle.terms[2],ok=async result=>{const r=await result;assert.equal(r.error,null,JSON.stringify(r));return r.data},prep=()=>devicePreparation(get())
 await ops.fetchScheduleInit();const archived=json(get().timetable.filter(c=>c.classroomId===rooms[1].id)),allSubjects=json(get().subjects),term1=json(bundle.terms[1])
 await ok(ops.saveTimetableClassrooms('2569',2,[{level:'ป.1',names:['IP']},{level:'อ.3',names:[]}]))
 assert.equal(get().rooms.length,3);assert.equal(prep().classrooms.length,1);assert.equal(prep().lessons.length,2);assert.equal(prep().allClassrooms.length,3);assert.equal(prep().plan.activityGroups[0].roomIds.length,1)
 assert.deepEqual(json(get().subjects),allSubjects);assert.deepEqual(json({...bundle.terms[1],rooms:term1.rooms}),term1,'Room switches must not touch other term content')
 assert.equal(deviceDisplaySchedule(get()).classrooms.length,1);assert.ok(!JSON.stringify(deviceWorkload(get())).includes(subjects[1].id))
 assert.equal((await ops.fetchTeacherAvailability('2569',2)).busy.some(cell=>cell.classroomId===rooms[1].id),false)
 await assert.rejects(ops.fetchClassScheduleBundle(rooms[1].id,'2569',2),/ไม่พบห้อง/)
 await assert.rejects(ops.fetchSchedulePdfGrids('2569',2,'class',[rooms[1].id]),/ปิดอยู่/)
 // A dormant room with no subjects must not block whole-school generation.
 const draft=await ok(ops.createScheduleDraft('2569',2,prep().classrooms.map(r=>r.id),true));assert.equal(draft.status,'complete',JSON.stringify(draft))
 await ok(ops.confirmScheduleDraft(draft.id));assert.deepEqual(json(get().timetable.filter(c=>c.classroomId===rooms[1].id)),archived)
 await ok(ops.clearScheduleScope('2569',2,'school',rooms[0].id,undefined,{kind:'subjects',includeLocked:true,expectedHash:prep().hash}));assert.deepEqual(json(get().timetable.filter(c=>c.classroomId===rooms[1].id)),archived)
 const config=prep().plan;config.reduceGaps=true;await ok(ops.savePreparation('2569',2,prep().hash,config));assert.equal(get().activities[0].roomIds.length,2,'Unrelated config save must preserve hidden group members')
 const restored=readDeviceBackup({format:'jarnsek-device-schedule',version:1,data:json(bundle)},25);assert.equal(restored.terms[2].rooms[1].enabled,false);assert.deepEqual(json(restored.terms[2].timetable.filter(c=>c.classroomId===rooms[1].id)),archived)
 const corrupt=json(bundle);corrupt.terms[2].rooms[0].enabled='false';assert.throws(()=>readDeviceBackup({format:'jarnsek-device-schedule',version:1,data:corrupt},25),/ไม่ถูกต้อง/)
 await ok(ops.saveTimetableClassrooms('2569',2,[{level:'ป.1',names:['IP','EP']}]))
 assert.deepEqual(json(prep().classrooms.map(r=>r.id)),rooms.slice(0,2).map(r=>r.id));assert.deepEqual(json(get().subjects),allSubjects);assert.deepEqual(json(get().timetable.filter(c=>c.classroomId===rooms[1].id)),archived)
 assert.equal(prep().plan.activityGroups[0].roomIds.length,2)
 await ok(ops.saveTimetableClassrooms('2569',2,[{level:'ป.1',names:['IP','EP','3']}]))
 const three=json(get().rooms.filter(r=>r.label.startsWith('ป.1/')).map(r=>r.id));await ok(ops.saveTimetableClassrooms('2569',2,[{level:'ป.1',names:['IP']}]))
 await ok(ops.saveTimetableClassrooms('2569',2,[{level:'ป.1',names:['IP','EP','3']}]))
 assert.deepEqual(json(get().rooms.filter(r=>r.label.startsWith('ป.1/')).map(r=>r.id)),three)
 const before=JSON.stringify(bundle);fail=true;assert.match((await ops.saveTimetableClassrooms('2569',2,[{level:'ป.1',names:[]}])).error,/ยังไม่ได้บันทึก/);assert.equal(JSON.stringify(bundle),before)
 console.log('PASS: Free occupied-room closure/reopen, both terms, archived IDs/subjects/locks/activity teams, whole-school generation, active views/PDF/availability/workload, clear/save retention, backup compatibility and failed-write rollback')
}
run().catch(error=>{console.error(error);process.exitCode=1})
