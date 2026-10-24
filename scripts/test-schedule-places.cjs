const fs=require('fs'),vm=require('vm'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,crypto,structuredClone,AbortController,Date,Error,console,require(name){if(name==='./schedule-device-run')return {};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(abs),name+'.ts'));throw Error('Unexpected dependency '+name)}});return exports}
const {applySchedulePlaceChange,placeReferences}=load('lib/schedule-places.ts'),free=load('lib/schedule-device-free.ts'),{deviceDataKey,devicePreparation}=load('lib/schedule-device-view.ts'),{createDeviceScheduleServices}=load('lib/schedule-device-services.ts')
const uuid=i=>`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`
const r1=uuid(1),r2=uuid(2),p1=uuid(3),p2=uuid(4),p3=uuid(5),s1=uuid(6),s2=uuid(7)
const initial=free.normalizePlan({rooms:[{id:r1,label:'ม.1/1'},{id:r2,label:'ม.1/2'}],teachers:[{id:uuid(8),name:'ครูหนึ่ง'},{id:uuid(9),name:'ครูสอง'}],places:[{id:p1,name:'ห้องวิทยาศาสตร์'},{id:p2,name:'ห้องภาษา'}],subjects:[{id:s1,roomId:r1,code:'ว21102',name:'วิทยาศาสตร์',teacherId:uuid(8),periods:3,pattern:[2,1],placeId:p1,timePreference:'afternoon',spread:false},{id:s2,roomId:r2,code:'ว21102',name:'วิทยาศาสตร์',teacherId:uuid(9),periods:3,pattern:[2,1],placeId:p2}]})
const prep=devicePreparation(initial),before=JSON.stringify(prep)
const changed=applySchedulePlaceChange(prep,{kind:'assign',lessonId:s1,placeId:p2})
assert.equal(changed.rules[s1].roomId,p2);assert.equal(changed.rules[s2].roomId,p2)
assert.equal(changed.rules[s1].pattern.join('+'),'2+1');assert.equal(changed.rules[s1].timePreference,'afternoon');assert.equal(changed.rules[s1].spread,false);assert.equal(JSON.stringify(prep),before)
assert.equal(placeReferences(prep,p1).size,1)
assert.throws(()=>applySchedulePlaceChange(prep,{kind:'remove',id:p1,replacementId:null}),/ทดแทน/)
const removed=applySchedulePlaceChange(prep,{kind:'remove',id:p1,replacementId:p2});assert.equal(removed.rules[s1].roomId,p2);assert.equal(removed.rooms.length,1)
assert.throws(()=>applySchedulePlaceChange(prep,{kind:'rename',id:p1,name:'  ห้องภาษา  '}),/อยู่แล้ว/)
assert.throws(()=>applySchedulePlaceChange(prep,{kind:'add',place:{id:p1,name:'ซ้ำรหัส'}}),/รหัส/)
assert.throws(()=>applySchedulePlaceChange(prep,{kind:'assign',lessonId:'foreign',placeId:p1}),/ไม่พบรายวิชา/)
assert.throws(()=>applySchedulePlaceChange(prep,{kind:'assign',lessonId:s1,placeId:p3}),/ไม่พบสถานที่/)
const timetable=[{classroomId:r1,day:1,period:1,subjectId:s1,locked:true},{classroomId:r2,day:1,period:1,subjectId:s2}]
const placed=devicePreparation({...initial,timetable})
assert.throws(()=>applySchedulePlaceChange(placed,{kind:'assign',lessonId:s1,placeId:p2}),/ห้องภาษา ชนวันจันทร์ คาบ 1/)
assert.throws(()=>applySchedulePlaceChange(placed,{kind:'remove',id:p1,replacementId:p2}),/ชน/)
// Existing unrelated teacher collisions do not prevent repairing a venue.
const unrelated=structuredClone(placed);unrelated.lessons[1].teacherId=unrelated.lessons[0].teacherId
assert.equal(applySchedulePlaceChange(unrelated,{kind:'rename',id:p1,name:'ห้องทดลองใหม่'}).rooms[0].name,'ห้องทดลองใหม่')
async function run(){
 let bundle={year:'2569',semester:2,terms:{1:{...structuredClone(initial),substitutes:{}},2:{...structuredClone(initial),timetable,substitutes:{}}}},reject=false,writes=0
 const services=createDeviceScheduleServices({read:()=>bundle,write:async next=>{writes++;if(reject)return false;bundle=next;return true}})
 const get=()=>bundle.terms[2],hash=()=>deviceDataKey(get()),save=async change=>{const r=await services.saveSchedulePlaces('2569',2,hash(),change);assert.equal(r.error,null,r.error);return r.data}
 await services.fetchScheduleInit()
 const stale=hash();await save({kind:'rename',id:p1,name:'ห้องทดลองใหม่'})
 assert.equal(bundle.terms[1].places[0].name,'ห้องทดลองใหม่');assert.equal(get().places[0].name,'ห้องทดลองใหม่')
 const grid=await services.fetchClassScheduleBundle(r1,'2569',2);assert.equal(grid.subjects[0].room_name,'ห้องทดลองใหม่')
 assert.match((await services.saveSchedulePlaces('2569',2,stale,{kind:'assign',lessonId:s1,placeId:null})).error,/เปลี่ยนแล้ว/)
 const snapshot=JSON.stringify(bundle);assert.match((await services.saveSchedulePlaces('2569',2,hash(),{kind:'assign',lessonId:s1,placeId:p2})).error,/ชน/);assert.equal(JSON.stringify(bundle),snapshot)
 await save({kind:'assign',lessonId:s1,placeId:p3,place:{id:p3,name:'ห้องดนตรี'}})
 assert.equal(get().subjects[0].placeId,p3);assert.equal(get().subjects[0].teacherId,uuid(8));assert.equal(get().subjects[0].pattern.join('+'),'2+1');assert.equal(get().subjects[0].timePreference,'afternoon')
 const siblingBefore=JSON.stringify(bundle.terms[1].subjects)
 assert.match((await services.saveSchedulePlaces('2569',2,hash(),{kind:'remove',id:p1,replacementId:null})).error,/ภาคเรียนที่ 1/);assert.equal(JSON.stringify(bundle.terms[1].subjects),siblingBefore)
 await save({kind:'assign',lessonId:s1,placeId:null});assert.equal((await services.fetchClassScheduleBundle(r1,'2569',2)).subjects[0].room_name,'')
 await save({kind:'remove',id:p3,replacementId:null});assert.ok(!get().places.some(p=>p.id===p3))
 reject=true;const beforeFailure=JSON.stringify(bundle);assert.match((await services.saveSchedulePlaces('2569',2,hash(),{kind:'add',place:{id:p3,name:'ห้องใหม่'}})).error,/ยังไม่ได้บันทึก/);assert.equal(JSON.stringify(bundle),beforeFailure)
 assert.ok(writes>=5)
 console.log('PASS: place CRUD, per-offering assignments, duplicate and foreign IDs, unchanged quotas/teachers/preferences, explicit clearing, detailed timetable collision checks, local persistence, stale hashes, cross-term references and storage failure rollback')
}
run().catch(error=>{console.error(error);process.exitCode=1})
