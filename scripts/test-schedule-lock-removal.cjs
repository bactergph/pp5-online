const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const cache={}
function load(file){
 const abs=path.resolve(file);if(cache[abs])return cache[abs]
 const exports={};cache[abs]=exports
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,crypto,structuredClone,AbortController,Date,console,require(name){
  if(name==='server-only')return {}
  if(name==='./supabase')return {createServerClient(){throw Error('Removal must not run the completion search')}}
  if(name==='./schedule-store')return {loadSchedule(){throw Error('Unexpected schedule load')},loadScheduleConstraints(){throw Error('Unexpected constraint load')},lessonKey:row=>row.class_subject_id}
  if(name==='./schedule-device-run')return {solveScheduleOnDevice(){throw Error('Removal must not solve a timetable')}}
  if(name.startsWith('@/'))return load(name.slice(2)+'.ts')
  if(name.startsWith('.'))return load(path.resolve(path.dirname(abs),name+'.ts'))
  throw Error('Unexpected dependency '+name)
 }})
 return exports
}
const {normalizePlan}=load('lib/schedule-device-free.ts'),{removeDeviceSubjectCell}=load('lib/schedule-device-operations.ts'),{createDeviceScheduleServices}=load('lib/schedule-device-services.ts')
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const fixture=normalizePlan({teachers:[{id:id(1),name:'ครู ก.'}],rooms:[{id:id(10),label:'ป.4/1'},{id:id(11),label:'ป.5/1'}],subjects:[{id:id(30),roomId:id(10),teacherId:id(1),code:'ง14101',name:'การงาน',periods:2,pattern:[2],placeId:null}],timetable:[{classroomId:id(10),subjectId:id(30),day:1,period:1,locked:true},{classroomId:id(11),subjectId:'',day:5,period:1,locked:true}]})
async function run(){
 const original=JSON.stringify(fixture),removed=removeDeviceSubjectCell(fixture,id(10),1,1,id(30))
 assert.equal(JSON.stringify(fixture),original);assert.equal(removed.timetable.length,1);assert.ok(removed.timetable[0].locked);assert.deepEqual(removed.subjects,fixture.subjects)
 assert.throws(()=>removeDeviceSubjectCell(fixture,id(10),1,1,'stale'),/เปลี่ยน/)
 assert.throws(()=>removeDeviceSubjectCell({...fixture,teachingGroups:[{id:id(90),lessonIds:[id(30),id(31)]}]},id(10),1,1,id(30)),/สอนรวม/)
 assert.throws(()=>removeDeviceSubjectCell({...fixture,teachingGroups:[{id:id(90),lessonIds:[id(30),id(31)],cells:[{day:1,period:1}]}]},id(10),1,1,id(30)),/สอนรวม/)
 assert.equal(removeDeviceSubjectCell({...fixture,teachingGroups:[{id:id(90),lessonIds:[id(30),id(31)],cells:[{day:2,period:1}]}]},id(10),1,1,id(30)).timetable.length,1)
 assert.throws(()=>removeDeviceSubjectCell({...fixture,timetable:fixture.timetable.map(row=>({...row,activityId:id(99)}))},id(10),1,1,id(30)),/กิจกรรม/)
 let bundle={year:'2569',semester:2,terms:{1:{...normalizePlan(),substitutes:{}},2:{...fixture,substitutes:{}}}},writes=0,fail=true
 const services=createDeviceScheduleServices({read:()=>bundle,write:async next=>{writes++;if(fail)return false;bundle=next;return true}})
 const before=JSON.stringify(bundle)
 assert.ok((await services.removeScheduleSubjectCell(id(10),'2569',1,1,id(30),2)).error)
 assert.equal(JSON.stringify(bundle),before,'A failed save must keep both the course and its lock')
 fail=false
 assert.equal((await services.removeScheduleSubjectCell(id(10),'2569',1,1,id(30),2)).error,null)
 assert.equal(writes,2);assert.equal(bundle.terms[2].timetable.length,1);assert.equal(bundle.terms[1].timetable.length,0)
 assert.ok((await services.removeScheduleSubjectCell(id(10),'2569',1,1,id(30),2)).error);assert.equal(writes,2)
 const {validateManualPlan}=load('lib/schedule-plan-validation.ts')
 const rows=fixture.timetable.map(row=>({classroom_id:row.classroomId,academic_year_id:'y',day_of_week:row.day,period:row.period,class_subject_id:row.subjectId,activity_id:null,note:null,locked:row.locked}))
 await validateManualPlan('school','year',2,rows,[rows[1]])
 await assert.rejects(validateManualPlan('school','year',2,rows,[{...rows[1],locked:false}]),/completion search/)
 console.log('PASS: local locked-cell removal, workload/other locks preserved, stale and joint/activity guards, failed IndexedDB save rollback, retry/semester isolation and no solver during removal-only repair')
}
run().catch(error=>{console.error(error);process.exitCode=1})
