const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
let actor={userId:'admin',role:'admin',schoolId:'s'},writes=0
const tables={classrooms:[{id:'local',school_id:'s'},{id:'foreign',school_id:'other'}],students:[{id:'a',classroom_id:'local'},{id:'b',classroom_id:'foreign'}]}
const db={from:table=>{
  const filters=[];let mutation=false
  const q={select:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);return q},order:()=>q,update:()=>{mutation=true;return q},insert:()=>{mutation=true;return q},delete:()=>{mutation=true;return q},maybeSingle:async()=>({data:tables[table].find(r=>filters.every(f=>f(r)))||null,error:null}),single:async()=>{if(mutation)writes++;return {data:{id:'new'},error:null}},then:(resolve,reject)=>Promise.resolve().then(()=>{if(mutation)writes++;return {data:tables[table].filter(r=>filters.every(f=>f(r))),error:null}}).then(resolve,reject)};return q
}}
const mod={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/(shell)/students/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod,require:n=>({'@/lib/supabase':{createServerClient:()=>db},'@/lib/session':{getSession:async()=>actor},'@/lib/audit':{logActivity:async()=>{},resolveStudentSchoolId:async()=>actor.schoolId,resolveClassroomSchoolId:async()=>actor.schoolId},'@/lib/students-cache':{invalidateClassroomStudents:()=>{}}})[n]||{}})
async function run(){
  await assert.rejects(mod.fetchStudents('foreign'),/สิทธิ์/);assert.equal((await mod.fetchStudents('local')).length,1)
  for(const call of [()=>mod.saveStudent('b',{first_name:'Changed'}),()=>mod.saveStudent('a',{classroom_id:'foreign'}),()=>mod.saveStudent(null,{classroom_id:'foreign'}),()=>mod.deleteStudent('b'),()=>mod.saveStudent('a',{id:'b'})])assert.ok((await call()).error)
  assert.equal(writes,0);await mod.saveStudent('a',{first_name:'Changed'});assert.equal(writes,1)
  actor.schoolId=null;await assert.rejects(mod.fetchStudents('local'),/สิทธิ์/);await assert.rejects(mod.deleteStudent('a'),/สิทธิ์/);assert.equal(writes,1)
  console.log('PASS: student reads, updates, inserts, classroom transfers and deletion reject foreign-school and unassigned accounts; local edits remain allowed')
}
run().catch(e=>{console.error(e);process.exitCode=1})
