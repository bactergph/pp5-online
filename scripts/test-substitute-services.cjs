const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={}
const session={schoolId:'school',userId:'admin',role:'admin'}
const schedule={classrooms:[{id:'r1',level:'ม.1',room:'1'},{id:'r2',level:'ม.1',room:'2'}],teacherNames:{},activityGroups:[{id:'group',settingId:'guide',roomIds:['r1','r2'],mode:'joint',teacherIds:['lead','team'],roomTeachers:{},weeklyPeriods:1,cells:[{day:1,period:3}]}],lessons:[{id:'math',classroomId:'r1',subjectId:'math',name:'คณิต',code:'ค21101',teacherId:'absent',activity:false}],slots:[{classroom_id:'r1',day_of_week:1,period:1,class_subject_id:'math',activity_id:null}]}
const existing=[{id:'sub1',absent_teacher_id:'absent',substitute_teacher_id:'free',period:1,leave_type:'ลากิจ',note:null}]
const tables=[],rpc=[]
const db={from(table){tables.push(table);const q={select(){return q},eq(){return q},order(){return q},async maybeSingle(){return {data:{id:'day',date:'2026-10-26',academic_year_id:'year',day_of_week:1},error:null}},async single(){return {data:{academic_year_id:'year'},error:null}},then(resolve,reject){return Promise.resolve({data:table==='schedule_substitute_entries'?existing:table==='schedule_teacher_blocks'?[{teacher_id:'blocked',period:1}]:[],error:null}).then(resolve,reject)}};return q},async rpc(name,args){rpc.push({name,args});return {error:null}}}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,console,Date,require(name){
 if(name==='server-only')return {}
 if(name==='@/lib/supabase')return {createServerClient:()=>db}
 if(name==='@/lib/session')return {getSession:async()=>session}
 if(name==='@/lib/audit'||name==='@/lib/schedule-operations')return {}
 if(name==='@/lib/schedule-store')return {loadSchedule:async(school,year,term)=>{assert.equal(school,'school');assert.equal(year,'year');assert.equal(term,2);return schedule},loadScheduleConstraints:async()=>{throw Error('Do not include all-date substitutes as recurring teacher blocks')}}
 if(name.startsWith('@/'))return load(name.slice(2)+'.ts')
 if(name.startsWith('.'))return load(path.resolve(path.dirname(abs),name+'.ts'))
 throw Error('Unexpected dependency '+name)
 }});return exports}
;(async()=>{
 const api=load('app/(shell)/schedules/extended-actions.ts'),{availableSubstitutes}=load('lib/substitute-availability.ts')
 const day=await api.fetchSubstituteDay('2026-10-26','year',2)
 assert.ok(day.busy.some(row=>row.teacherId==='blocked'&&row.period===1))
 assert.ok(day.busy.some(row=>row.teacherId==='team'&&row.period===3),'Activity team members must be busy, including fixed activity overlays')
 assert.equal(day.busy.some(row=>row.teacherId==='free'),false,'A saved substitute must not conflict with itself or substitutes on another date')
 assert.ok(availableSubstitutes([{id:'free'},{id:'blocked'},{id:'absent'}],day.busy,day.entries,existing[0]).some(row=>row.id==='free'))
 assert.equal(tables.includes('schedule_teacher_blocks'),true)
 const ordinary=await api.loadSubstituteSlotsForTeacher('2026-10-26','year','absent',2)
 assert.equal(ordinary.length,1);assert.equal(ordinary[0].class_subject_id,'math')
 const team=await api.loadSubstituteSlotsForTeacher('2026-10-26','year','team',2)
 assert.equal(team.length,2);assert.ok(team.every(row=>row.class_subject_id===null&&row.period===3),'Activity identifiers must never be sent to the subject UUID foreign key')
 assert.equal((await api.loadSubstituteSlotsForTeacher('2026-10-25','year','absent',2)).length,0)
 await assert.rejects(api.fetchSubstituteDay('2026-02-30','year',2),/วันที่/)
 await api.saveSubstituteDay('day',existing,existing)
 await api.deleteSubstituteEntries('day',existing,['sub1'])
 assert.equal(rpc[0].name,'save_substitute_day');assert.equal(rpc[1].name,'delete_substitute_entries');assert.equal(rpc[1].args.p_school_id,'school');assert.equal(rpc[1].args.p_day_id,'day')
 session.role='teacher';await assert.rejects(api.deleteSubstituteEntries('day',existing,['sub1']),/สิทธิ์/)
 console.log('PASS: online substitute reads term-scoped lessons and activity teams, preserves current assignments, excludes recurring blocks, validates dates and protects deletion permissions')
})().catch(error=>{console.error(error);process.exitCode=1})
