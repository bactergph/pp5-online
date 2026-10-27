const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,crypto,structuredClone,AbortController,Date,console,require(name){if(name==='./schedule-device-run')return {solveScheduleOnDevice(){throw Error('Edits must not run the solver')}};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(abs),name+'.ts'));throw Error('Unexpected dependency '+name)}});return exports}
const {normalizePlan,freeActivityGroup}=load('lib/schedule-device-free.ts'),{activityTeamKeepsSchedule}=load('lib/schedule-activity-teams.ts'),{createDeviceScheduleServices}=load('lib/schedule-device-services.ts')
const fixture=normalizePlan(JSON.parse(fs.readFileSync('scripts/fixtures/schedule-activity-edits.json','utf8')))
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
async function run(){
 let bundle={year:'2569',semester:2,terms:{1:{...structuredClone(fixture),substitutes:{}},2:{...structuredClone(fixture),substitutes:{}}}},writes=0,fail=false
 const ops=createDeviceScheduleServices({read:()=>bundle,write:async next=>{writes++;if(fail)return false;bundle=next;return true}}),plan=()=>bundle.terms[2]
 const data=async()=>{const result=await ops.fetchPreparation('2569',2);assert.equal(result.error,null);return result.data}
 const original=JSON.stringify(plan().timetable),originalOfferings=JSON.stringify(plan().subjects),sibling=JSON.stringify(bundle.terms[1]),group=freeActivityGroup(plan().activities[0]),added={...group,teacherIds:[id(1),id(2)]}
 assert.equal(activityTeamKeepsSchedule(group,added),true)
 assert.equal(activityTeamKeepsSchedule(group,{...added,weeklyPeriods:2}),false)
 assert.equal(activityTeamKeepsSchedule(group,{...added,cells:[{day:2,period:2}]}),false)
 let snapshot=await data();const preview=await ops.previewScheduleActivityTeam('2569',2,snapshot.hash,added)
 assert.equal(preview.data.locked,0);assert.equal(preview.data.affected,0)
 fail=true;assert.ok((await ops.saveScheduleActivityTeam('2569',2,snapshot.hash,added)).error);assert.equal(JSON.stringify(plan().timetable),original);assert.deepEqual(plan().activities.find(activity=>activity.id===id(40)).teacherIds,[id(1)])
 fail=false;assert.equal((await ops.saveScheduleActivityTeam('2569',2,snapshot.hash,added)).error,null);assert.equal(JSON.stringify(plan().timetable),original);assert.deepEqual(plan().activities.find(activity=>activity.id===id(40)).teacherIds,added.teacherIds)
 assert.ok((await ops.saveScheduleActivityTeam('2569',2,snapshot.hash,group)).error,'Stale team updates must fail')
 const grid=await ops.fetchClassScheduleBundle(id(10),'2569',2);assert.ok(grid.subjects.some(subject=>subject.activity&&subject.teacher_name.includes('ครู ข.')))
 // Fixed-time activities also retain their saved cells when adding another teacher.
 const pinned=freeActivityGroup(plan().activities.find(activity=>activity.id===id(41))),pinnedAdded={...pinned,teacherIds:[id(3),id(2)]};snapshot=await data();assert.equal((await ops.previewScheduleActivityTeam('2569',2,snapshot.hash,pinnedAdded)).data.locked,0);assert.equal((await ops.saveScheduleActivityTeam('2569',2,snapshot.hash,pinnedAdded)).error,null);assert.equal(JSON.stringify(plan().timetable),original)
 const activities=JSON.stringify(plan().activities),blocks=JSON.stringify(plan().blocks),writeBefore=writes;snapshot=await data()
 const selected=await ops.clearScheduleScope('2569',2,'selected',id(10),[id(10)])
 assert.equal(selected.error,null);assert.equal(selected.data.rooms,1);assert.equal(selected.data.removed,1);assert.equal(writes,writeBefore+1)
 assert.ok(plan().timetable.some(cell=>cell.subjectId===id(31)),'Other rooms must be unchanged')
 assert.equal(plan().timetable.filter(cell=>cell.activityId).length,3);assert.ok(plan().timetable.some(cell=>cell.subjectId===id(30)&&cell.locked))
 assert.equal(JSON.stringify(plan().activities),activities);assert.equal(JSON.stringify(plan().subjects),originalOfferings);assert.equal(JSON.stringify(plan().blocks),blocks);assert.equal(JSON.stringify(bundle.terms[1]),sibling)
 assert.equal((await ops.clearScheduleScope('2569',2,'school',id(10))).data.removed,1);assert.equal(plan().timetable.length,4);assert.equal(plan().timetable.filter(cell=>cell.activityId).length,3)
 const before=JSON.stringify(bundle);assert.ok((await ops.clearScheduleScope('2569',2,'selected',id(10),[id(999)])).error);assert.equal(JSON.stringify(bundle),before)
 console.log('PASS: fixed/flexible activity co-teachers preserve all saved cells/locks, durable failure and stale rollback; immediate teacher labels; one atomic clear for selected rooms; locked subjects, pinned/unlocked activities, teacher blocks, workload and other term preserved')
}
run().catch(error=>{console.error(error);process.exitCode=1})
