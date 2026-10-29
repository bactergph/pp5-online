/* eslint-disable @typescript-eslint/no-require-imports -- Execute the shared TypeScript services in isolated test contexts. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict')
function loader(overrides={}){const cache=new Map();return function load(file){const absolute=path.resolve(file);if(cache.has(absolute))return cache.get(absolute);const exports={};cache.set(absolute,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,crypto,structuredClone,Date,console,AbortController,Error,require(name){if(name in overrides)return overrides[name];if(name==='server-only')return {};if(name==='./schedule-device-run')return {solveScheduleOnDevice(){throw Error('Solver must not run while renaming a teacher')}};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(absolute),name+'.ts'));throw Error('Unexpected dependency '+name)}});return exports}}
const load=loader(),free=load('lib/schedule-device-free.ts'),view=load('lib/schedule-device-view.ts')
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0')
const teachers=Array.from({length:25},(_,i)=>({id:id(i+1),name:'นาย ทดสอบ '+i,prefix:'นาย',fullName:'ทดสอบ '+i,position:'ครู'}))
const original=free.normalizePlan({teachers,rooms:[{id:id(50),label:'ป.1/1'}],subjects:[{id:id(60),roomId:id(50),teacherId:id(1),code:'ท11101',name:'ภาษาไทย',periods:1,pattern:[1],placeId:null}],blocks:[{teacherId:id(1),day:2,period:1}],timetable:[{classroomId:id(50),subjectId:id(60),day:1,period:1,locked:true}],activities:[{id:id(70),name:'แนะแนว',mode:'joint',roomIds:[id(50)],teacherId:id(1),teacherIds:[id(1)],roomTeachers:{},cells:[],weeklyPeriods:1}]})
original.substitutes={'2026-10-29':[{id:'doc',absentTeacherId:id(1),absentTeacherName:'นาย ชื่อประวัติเดิม',substituteTeacherId:id(2),period:1,subjectId:id(60),roomId:id(50),leaveType:'อื่นๆ',note:''}]}
let bundle={year:'2569',semester:2,terms:{1:structuredClone(original),2:structuredClone(original)}},writes=0,reject=false
const services=load('lib/schedule-device-services.ts').createDeviceScheduleServices({read:()=>bundle,write:async next=>{if(reject)return false;bundle=next;writes++;return true}})
const expected={prefix:'นาย',name:'ทดสอบ 0',position:'ครู'},input={prefix:'นางสาว',name:'ชื่อใหม่ ทดสอบ',position:'ครูชำนาญการ',expected}
;(async()=>{
 const before=JSON.stringify(bundle);reject=true;assert.ok((await services.saveScheduleTeacherDetails('2569',2,id(1),input)).error);assert.equal(JSON.stringify(bundle),before);reject=false
 assert.equal((await services.saveScheduleTeacherDetails('2569',2,id(1),input)).error,null);assert.equal(writes,1)
 for(const term of [1,2]){
  const next=bundle.terms[term];assert.equal(next.teachers.length,25);assert.equal(next.teachers[0].id,id(1));assert.equal(next.teachers[0].name,'นางสาว ชื่อใหม่ ทดสอบ')
  for(const field of ['subjects','timetable','blocks','activities','substitutes'])assert.equal(JSON.stringify(next[field]),JSON.stringify(original[field]),'Preserve '+field)
  assert.equal(view.devicePreparation(next).teachers[0].full_name,'ชื่อใหม่ ทดสอบ')
 }
 const renamed=JSON.stringify(bundle);const staleResult=await services.saveScheduleTeacherDetails('2569',2,id(1),input);assert.ok(staleResult.error?.includes('เปลี่ยนแล้ว'),JSON.stringify(staleResult));assert.ok((await services.saveScheduleTeacherDetails('2569',2,'missing',input)).error);assert.equal(JSON.stringify(bundle),renamed)
 assert.equal(load('lib/schedule-device-backup.ts').readDeviceBackup({format:'jarnsek-device-schedule',version:1,data:bundle}).terms[2].teachers[0].fullName,'ชื่อใหม่ ทดสอบ')
 console.log('PASS: rename at the 25-teacher limit keeps the same ID, both terms, subjects, locks, blocks, activities and document history; failed writes and stale names preserve data')

 let session=null,updates=[],race=false
 const target={id:id(1),school_id:id(90),role:'teacher',prefix:'นาย',full_name:'ทดสอบ 0',position:'ครู'}
 const db={from(table){
  assert.equal(table,'users');let update;const filters=[]
  const q={select(){return q},eq(field,value){filters.push([field,value]);return q},is(field,value){filters.push([field,value]);return q},update(value){update=value;return q},async maybeSingle(){
   assert.ok(filters.some(([field,value])=>field==='school_id'&&value===id(90)))
   if(update){updates.push({update,filters});return {data:race?null:{id:id(1)},error:null}}
   return {data:structuredClone(target),error:null}
  }}
  return q
 }}
 const serverLoad=loader({'./session':{getSession:async()=>session},'./supabase':{createServerClient:()=>db},'./staff-table':{},'./schedule-preparation':{preparation:async()=>({teachers:[{id:id(1)}]})}}),server=serverLoad('lib/schedule-input-server.ts')
 await assert.rejects(server.saveTeacherDetails('year',2,id(1),input),/สิทธิ์/)
 session={schoolId:id(90),userId:id(91),role:'academic_head'};await assert.rejects(server.saveTeacherDetails('year',2,id(1),input),/สิทธิ์/)
 session.role='admin';await assert.rejects(server.saveTeacherDetails('year',2,'foreign',input),/ไม่พบ/)
 await assert.rejects(server.saveTeacherDetails('year',2,id(1),{...input,name:' '}),/กรอก/)
 await assert.rejects(server.saveTeacherDetails('year',2,id(1),{...input,expected:{...expected,name:'stale'}}),/เปลี่ยนแล้ว/);assert.equal(updates.length,0)
 await server.saveTeacherDetails('year',2,id(1),{...input,role:'admin',username:'attempted',password:'attempted'})
 assert.equal(JSON.stringify(updates[0].update),JSON.stringify({prefix:input.prefix,full_name:input.name,position:input.position}));assert.ok(updates[0].filters.some(([field,value])=>field==='full_name'&&value===expected.name));assert.ok(updates[0].filters.some(([field,value])=>field==='id'&&value===id(1)))
 race=true;await assert.rejects(server.saveTeacherDetails('year',2,id(1),input),/เปลี่ยนแล้ว/)
 target.role='district';await assert.rejects(server.saveTeacherDetails('year',2,id(1),input),/ไม่พบ/)
 console.log('PASS: online rename uses personnel permissions, school ownership, field-level concurrency checks and a three-field whitelist; roles, login credentials and teacher IDs cannot change')
})().catch(error=>{console.error(error);process.exitCode=1})
