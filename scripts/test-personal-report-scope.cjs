// Test the actual report scope against synthetic room/subject data.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
let personal=true
const session={schoolId:'s',userId:'owner',role:'admin'},room={id:'home',level:'ม.1',room:1,school_id:'s',academic_year_id:'y',homeroom_teacher_id:'other',homeroom_teacher2_id:null},teaching={...room,id:'teach',room:2}
const subjects=[{id:'mine',classroom_id:'teach',academic_year_id:'y',teacher_id:'owner',order_number:1,subjects:{id:'math',code:'ค',name:'คณิตศาสตร์'},users:{}},{id:'theirs',classroom_id:'teach',academic_year_id:'y',teacher_id:'other',order_number:2,subjects:{id:'eng',code:'อ',name:'อังกฤษ'},users:{}}]
const db={from(table){const filters=[];return{select(){return this},eq(k,v){filters.push([k,v]);return this},in(){return this},order(){return this},maybeSingle(){const id=filters.find(([k])=>k==='id')?.[1];return Promise.resolve({data:id==='home'?room:id==='teach'?teaching:{...room,id:'foreign',school_id:'different'}})},then(resolve,reject){return Promise.resolve({data:table==='class_subjects'?subjects.filter(row=>filters.every(([k,v])=>row[k]===v)):[]}).then(resolve,reject)}}}}
const deps={'server-only':{},'@/lib/supabase':{createServerClient:()=>db},'@/lib/session':{getSession:async()=>session},'@/lib/personal-data-scope':{isPersonalSubjectAccess:async()=>personal,personalHomeroomIds:async()=>personal?['home']:null,assertPersonalHomeroom:async(_,id)=>{if(personal&&id!=='home')throw Error('outside homeroom scope')}},'@/lib/supabase-paginate':{fetchAllRows:async build=>(await build()).data}}
const exportsObject={}
const source=ts.transpileModule(fs.readFileSync('lib/report-data-server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
vm.runInNewContext(source+';exports.test={filterClassroomsForSession,requireReportClassroom};',{exports:exportsObject,require:n=>deps[n]||{}})
;(async()=>{
 const api=exportsObject.test
 assert.deepEqual(Array.from(await api.filterClassroomsForSession([room,teaching],session,db,'s','pp6')).map(r=>r.id),['home'])
 await api.requireReportClassroom(db,session,'home','pp6')
 await assert.rejects(api.requireReportClassroom(db,session,'teach','pp6'),/outside homeroom/)
 await assert.rejects(api.requireReportClassroom(db,session,'foreign','pp5-subject'),/ไม่มีสิทธิ์/)
 assert.deepEqual(Array.from(await exportsObject.fetchReportSubjects({classroomId:'teach',academicYearId:'y',mode:'pp5-subject'})).map(r=>r.class_subject_id),['mine'])
 personal=false
 assert.equal((await api.filterClassroomsForSession([room,teaching],session,db,'s','pp6')).length,2)
 assert.equal((await exportsObject.fetchReportSubjects({classroomId:'teach',academicYearId:'y',mode:'pp5-subject'})).length,2)
 await assert.rejects(api.requireReportClassroom(db,{...session,role:'teacher'},'home','pp6'),/ไม่มีสิทธิ์/)
 const actions=fs.readFileSync('app/(shell)/reports/actions.ts','utf8')
 assert.ok(!actions.includes('loadReportDataForArchive')&&!actions.includes('loadReportDataForAccess'),'Untrusted Server Action callers must not supply their own access role')
 console.log('PASS: personal PP6/homeroom scope, own-subject-only report list, School admin/teacher scope unchanged, tenant guard and server-only archive loader')
})().catch(error=>{console.error(error);process.exitCode=1})
