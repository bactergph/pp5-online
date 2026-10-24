const fs=require('fs'),vm=require('vm'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,crypto,structuredClone,AbortController,Date,console,require(name){if(name==='./schedule-device-run')return {solveScheduleOnDevice:async(...args)=>load('lib/schedule-device-build.ts').buildDeviceDraft(...args)};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(abs),name+'.ts'));throw Error('Unexpected dependency '+name)}});return exports}
const free=load('lib/schedule-device-free.ts'),view=load('lib/schedule-device-view.ts'),backup=load('lib/schedule-device-backup.ts'),{createDeviceScheduleServices}=load('lib/schedule-device-services.ts')
const uuid=i=>`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`
const base=free.normalizePlan({rooms:[{id:uuid(1),label:'ม.1/IP'},{id:uuid(2),label:'ม.1/2PL'}]})
let bundle={year:'2569',semester:2,terms:{1:{...structuredClone(base),substitutes:{}},2:{...structuredClone(base),substitutes:{}}}},writes=0,reject=false
const services=createDeviceScheduleServices({read:()=>bundle,write:async next=>{writes++;if(reject)return false;bundle=next;return true}})
const get=()=>bundle.terms[2],hash=()=>view.deviceDataKey(get()),saved=async result=>{const value=await result;assert.equal(value.error,null,JSON.stringify(value));return value.data}
async function run(){
 const blank={...free.normalizePlan(),substitutes:{}}
 let emptyBundle={year:'2569',semester:2,terms:{1:structuredClone(blank),2:structuredClone(blank)}}
 const setup=createDeviceScheduleServices({read:()=>emptyBundle,write:async next=>{emptyBundle=next;return true}})
 await setup.fetchScheduleInit();await saved(setup.saveTimetableClassrooms('2569',2,[{level:'ป.1',names:['1','IP']},{level:'ม.1',names:['2PL']}]))
 assert.equal(emptyBundle.terms[1].rooms.length,3);assert.equal(new Set(emptyBundle.terms[2].rooms.map(room=>room.id)).size,3)
 assert.equal((await saved(setup.fetchPreparation('2569',2))).classrooms[1].name,'IP')
 const copyPlan={...free.normalizePlan({rooms:base.rooms,teachers:[{id:'copy-t1',name:'ครูหนึ่ง'},{id:'copy-t2',name:'ครูสอง'}],subjects:base.rooms.map((room,i)=>({id:'copy-s'+i,roomId:room.id,code:'ท21101',name:'ภาษาไทย',teacherId:'copy-t'+(i+1),periods:1,pattern:[1],placeId:null})),activities:[{id:uuid(900),name:'กิจกรรมร่วม',mode:'joint',roomIds:base.rooms.map(room=>room.id),teacherId:'',teacherIds:[],roomTeachers:{},weeklyPeriods:1,cells:[]}],timetable:[{classroomId:base.rooms[0].id,day:1,period:1,subjectId:'copy-s0'},{classroomId:base.rooms[0].id,day:1,period:2,subjectId:'',activityId:uuid(900)},{classroomId:base.rooms[1].id,day:2,period:3,subjectId:'copy-s1'}]}),substitutes:{}}
 let copyBundle={year:'2569',semester:2,terms:{1:structuredClone(copyPlan),2:structuredClone(copyPlan)}}
 const copyService=createDeviceScheduleServices({read:()=>copyBundle,write:async next=>{copyBundle=next;return true}});await copyService.fetchScheduleInit()
 assert.equal((await saved(copyService.copyClassSchedule(base.rooms[0].id,base.rooms[1].id,'2569',2))).copied,2)
 assert.ok(copyBundle.terms[2].timetable.some(cell=>cell.classroomId===base.rooms[1].id&&cell.day===1&&cell.period===2&&cell.activityId===uuid(900)))
 assert.ok(!copyBundle.terms[2].timetable.some(cell=>cell.classroomId===base.rooms[1].id&&cell.day===2&&cell.period===3))
 await services.fetchScheduleInit()
 const names=Array.from({length:25},(_,i)=>({key:String(i),prefix:'นางสาว',name:'ทดสอบ '+i,position:'ครู'}))
 await saved(services.saveScheduleInputTeachers('2569',2,names));assert.equal(get().teachers.length,25);assert.equal(bundle.terms[1].teachers.length,25)
 const before=JSON.stringify(bundle);const over=await services.saveScheduleInputTeachers('2569',2,[{key:'26',prefix:'นาย',name:'คนที่26',position:'ครู'}]);assert.match(over.error,/25/);assert.equal(JSON.stringify(bundle),before,'Over-limit import must not partially commit')
 await saved(services.saveScheduleInputTeachers('2569',2,names));assert.equal(get().teachers.length,25)
 const teacher=get().teachers[0],teacher2=get().teachers[1]
 assert.equal(view.devicePreparation(get()).teachers[0].full_name,'ทดสอบ 0');assert.equal(view.devicePreparation(get()).teachers[0].prefix,'นางสาว')
 const rows=base.rooms.map(room=>({classroomId:room.id,code:'ว21101',name:'วิทยาศาสตร์',teacherId:'',count:3,pattern:[2,1],venue:'ห้องทดลอง',group:'วิทยาศาสตร์และเทคโนโลยี',type:'เพิ่มเติม'}))
 await saved(services.saveScheduleInputSubjects('2569',2,hash(),rows));assert.equal(get().subjects.length,2);assert.equal(get().places.length,1)
 assert.equal(view.devicePreparation(get()).lessons[0].subjectType,'เพิ่มเติม')
 const stale=hash();await saved(services.saveScheduleTeachingAssignments('2569',2,hash(),get().subjects.map((subject,i)=>({lessonId:subject.id,teacherId:i?teacher2.id:teacher.id}))))
 assert.match((await services.saveScheduleInputSubjects('2569',2,stale,rows)).error,/เปลี่ยน/)
 let prepared=view.devicePreparation(get());prepared.plan.rules[get().subjects[0].id].timePreference='afternoon';await saved(services.savePreparation('2569',2,hash(),prepared.plan))
 assert.equal(get().subjects[0].timePreference,'afternoon');assert.equal(get().subjects[0].pattern.join('+'),'2+1')
 // Separate catalog IDs and team IDs persist through the shared activity editor and solver.
 const catalog=await saved(services.saveScheduleActivityName(null,'ลูกเสือ','ลูกเสือ',1)),setting=catalog[0].id
 const group={id:uuid(200),settingId:setting,mode:'joint',roomIds:base.rooms.map(room=>room.id),teacherIds:[get().teachers[2].id],roomTeachers:{},weeklyPeriods:1,cells:[]}
 assert.equal((await saved(services.previewScheduleActivityTeam('2569',2,hash(),group))).locked,0,'A new automatic activity must not count unrelated subject locks');await saved(services.saveScheduleActivityTeam('2569',2,hash(),group));assert.equal(get().activities[0].settingId,setting)
 assert.equal((await saved(services.previewScheduleActivityTeam('2569',2,hash(),{...group,id:uuid(201)}))).overwrites.length,1)
 assert.match((await services.saveScheduleActivityTeam('2569',2,hash(),{...group,id:uuid(201)})).error,/บันทึกทับ/)
 await saved(services.saveScheduleActivityTeam('2569',2,hash(),{...group,id:uuid(201)},false,false,true));assert.equal(get().activities.length,1)
 const draft=await saved(services.createScheduleDraft('2569',2,base.rooms.map(room=>room.id),true));assert.equal(draft.status,'complete',JSON.stringify(draft));assert.equal(get().timetable.length,0)
 await saved(services.confirmScheduleDraft(draft.id));assert.equal(get().timetable.length,8);assert.equal(get().timetable.filter(row=>row.activityId).length,2)
 const classView=await services.fetchClassScheduleBundle(base.rooms[0].id,'2569',2);assert.equal(Object.keys(classView.grid).length,4);assert.equal(classView.quotas.items[0].used,3)
 assert.equal((await services.fetchScheduleConflicts('2569',2)).count,0)
 assert.equal((await services.fetchTeacherAvailability('2569',2)).quotas.filter(row=>row.activity).length,1,'Joint workload must count once')
 const pages=await services.fetchSchedulePdfGrids('2569',2,'class',base.rooms.map(room=>room.id));assert.equal(Object.keys(pages).length,2)
 const roundtrip=backup.readDeviceBackup({format:'jarnsek-device-schedule',version:1,data:bundle},25);assert.equal(roundtrip.terms[2].activityCatalog[0].id,setting);assert.equal(roundtrip.terms[2].subjects[0].subjectType,'เพิ่มเติม')
 const firstCell=get().timetable.find(cell=>cell.subjectId),dayDate=['','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30'][firstCell.day]
 const sub=await services.fetchSubstituteDay(dayDate,'2569',2);await saved(services.importSubstituteFromSchedule(sub.day.id,dayDate,'2569',teacher.id,'ลากิจ',2))
 const loaded=await services.fetchSubstituteDay(dayDate,'2569',2);assert.ok(loaded.entries.length);const changes=loaded.entries.map(({id,substitute_teacher_id,leave_type,note})=>({id,substitute_teacher_id,leave_type,note}))
 await saved(services.saveSubstituteDay(loaded.day.id,changes,changes.map(row=>({...row,substitute_teacher_id:get().teachers[24].id}))));assert.ok(get().substitutes[dayDate].every(row=>row.substituteTeacherId===get().teachers[24].id))
 assert.equal((await services.fetchScheduleInit()).defaultSemester,2)
 const assignedDay=await services.fetchSubstituteDay(dayDate,'2569',2),assignedChanges=assignedDay.entries.map(({id,substitute_teacher_id,leave_type,note})=>({id,substitute_teacher_id,leave_type,note}))
 await saved(services.saveSubstituteDay(loaded.day.id,assignedChanges,assignedChanges))
 assert.match((await services.importSubstituteFromSchedule(loaded.day.id,dayDate,'2569',get().teachers[24].id,'ลาป่วย',2)).error,/ครูที่ลา/)
 assert.match((await services.deleteSubstituteEntries(loaded.day.id,changes,[changes[0].id])).error,/โหลดใหม่/)
 assert.match((await services.deleteSubstituteEntries(loaded.day.id,assignedChanges,[changes[0].id,'missing'])).error,/ไม่พบรายการ/)
 const beforeDelete=JSON.stringify(get().timetable)
 await saved(services.deleteSubstituteEntries(loaded.day.id,assignedChanges,[changes[0].id]))
 assert.equal(get().substitutes[dayDate]?.length||0,assignedChanges.length-1)
 const remainingDay=await services.fetchSubstituteDay(dayDate,'2569',2),remaining=remainingDay.entries.map(({id,substitute_teacher_id,leave_type,note})=>({id,substitute_teacher_id,leave_type,note}))
 if(remaining.length)await saved(services.deleteSubstituteEntries(loaded.day.id,remaining,remaining.map(row=>row.id)))
 assert.equal(get().substitutes[dayDate],undefined)
 assert.equal(JSON.stringify(get().timetable),beforeDelete)
 assert.match((await services.importSubstituteFromSchedule('2569:2:2026-10-25','2026-10-25','2569',teacher.id,'ลากิจ',2)).error,/ไม่มีคาบสอน/)
 const pending=await saved(services.createScheduleDraft('2569',2,base.rooms.map(room=>room.id),true));assert.equal(pending.status,'complete');await saved(services.toggleScheduleCellLock(base.rooms[0].id,'2569',5,6,2));assert.match((await services.confirmScheduleDraft(pending.id)).error,/เปลี่ยน/)
 assert.match((await services.localTeachers.remove([teacher.id])).error,/ภาระสอน/)
 const spare=get().teachers[23].id;await services.localTeachers.save(spare,'นาย','แก้ไขรายชื่อ','ครูพิเศษ');assert.equal(view.devicePreparation(get()).teachers.find(row=>row.id===spare).full_name,'แก้ไขรายชื่อ')
 await services.localTeachers.remove([spare]);assert.equal(get().teachers.length,24);assert.equal(bundle.terms[1].teachers.length,24)
const beforeClear=get().timetable.length,clear=await saved(services.clearScheduleScope('2569',2,'school',base.rooms[0].id));assert.equal(clear.removed,beforeClear-1);assert.equal(get().timetable.length,1);assert.ok(get().timetable[0].locked);assert.ok(get().activities.length,'Clearing placed activity cells must preserve their configuration for the next draft')
 assert.match((await services.copyClassSchedule(base.rooms[0].id,base.rooms[1].id,'2569',2)).error,/ไม่มีคาบ/)
 const beforeFailure=JSON.stringify(bundle);reject=true;const failure=await services.setTeacherAvailabilityBlock('2569',2,get().teachers[0].id,5,5,true);assert.match(failure.error,/ยังไม่ได้บันทึก/);assert.equal(JSON.stringify(bundle),beforeFailure)
 assert.ok(writes>10)
 console.log('PASS: shared Pro service contract backed by local data: teacher metadata/25 cap, subject workbook fields, venue/double/afternoon persistence, stale writes, activity catalog/team overwrite, draft+explicit commit, joint workload, PDF grids, substitute validation, backups and durable failure feedback')
}
run().catch(error=>{console.error(error);process.exitCode=1})
