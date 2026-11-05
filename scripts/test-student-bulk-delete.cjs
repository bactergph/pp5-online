const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
function compile(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,require:name=>deps[name]||{}});return exports}
let actor={schoolId:'school',role:'admin',userId:'admin'},deletes=0,deleteError=false
const tables={academic_years:[{id:'year',school_id:'school',year_be:2569,is_active:true},{id:'old',school_id:'school',year_be:2568},{id:'foreign',school_id:'other',year_be:2569}],
  classrooms:Array.from({length:30},(_,i)=>({id:'room-'+i,school_id:'school',academic_year_id:'year',level:'ม.'+(Math.floor(i/5)+1),room:i%5+1})).concat([{id:'old-room',school_id:'school',academic_year_id:'old'},{id:'other-room',school_id:'other',academic_year_id:'foreign'}]),students:[]}
tables.students=Array.from({length:1500},(_,i)=>({id:'student-'+i,classroom_id:'room-'+Math.floor(i/50),student_number:i%50+1})).concat([{id:'old-student',classroom_id:'old-room'},{id:'other-student',classroom_id:'other-room'}])
const invalidated=[],audit=[]
function from(table){const filters=[];let operation='read',head=false;const execute=()=>{const selected=tables[table].filter(row=>filters.every(fn=>fn(row)));if(operation==='delete'){deletes++;if(deleteError)return{error:{message:'blocked delete'},data:null,count:0};tables[table]=tables[table].filter(row=>!selected.includes(row));return{data:null,error:null,count:selected.length}}return{data:head?null:selected.slice(0,1000),error:null,count:selected.length}};
  const q={select:(fields,options)=>{head=!!options?.head;return q},eq:(key,value)=>{filters.push(row=>row[key]===value);return q},in:(key,values)=>{filters.push(row=>values.includes(row[key]));return q},order:()=>q,delete:()=>{operation='delete';return q},maybeSingle:async()=>{const result=execute();return{...result,data:result.data?.[0]||null}},then:(yes,no)=>Promise.resolve().then(execute).then(yes,no)};return q}
const api=compile('app/(shell)/students/actions.ts',{'@/lib/supabase':{createServerClient:()=>({from})},'@/lib/session':{getSession:async()=>actor},'@/lib/students-cache':{invalidateClassroomStudentsMany:ids=>invalidated.push(...ids)},'@/lib/audit':{logActivity:async event=>audit.push(event)}})
;(async()=>{
  const summary=await api.fetchStudentDeleteSummary('year');assert.equal(summary.count,1500);assert.equal(summary.classrooms,30,'Exact count is not truncated at 1,000')
  for(const phrase of ['', 'ลบ', 'ลบทั้งหมด '])assert.ok((await api.deleteAllStudents('year',phrase)).error)
  assert.equal(deletes,0,'Server independently enforces exact typed confirmation')
  assert.ok((await api.deleteAllStudents('foreign','ลบทั้งหมด')).error);assert.ok((await api.fetchStudentDeleteSummary('foreign')).error);assert.equal(deletes,0)
  for(const role of ['teacher','principal','academic_head','deputy_principal']){actor={...actor,role};assert.ok((await api.deleteAllStudents('year','ลบทั้งหมด')).error);assert.ok((await api.fetchStudentDeleteSummary('year')).error)}
  actor={...actor,role:'admin',mustChangePassword:true};await assert.rejects(()=>api.deleteAllStudents('year','ลบทั้งหมด'),/ไม่มีสิทธิ์/);actor={...actor,mustChangePassword:false}
  deleteError=true;assert.ok((await api.deleteAllStudents('year','ลบทั้งหมด')).error);assert.equal(tables.students.length,1502);assert.equal(invalidated.length,0);deleteError=false
  const deleted=await api.deleteAllStudents('year','ลบทั้งหมด');assert.equal(deleted.error,null);assert.equal(deleted.deleted,1500)
  assert.deepEqual(tables.students.map(s=>s.id),['old-student','other-student']);assert.equal(tables.classrooms.length,32,'Keep classrooms and preserve other years/schools')
  assert.equal(invalidated.length,30);assert.equal(audit.length,1);assert.equal(audit[0].metadata.deleted,1500)
  assert.equal((await api.fetchStudentDeleteSummary('year')).count,0);assert.equal((await api.deleteAllStudents('year','ลบทั้งหมด')).deleted,0)
  console.log('PASS: exact 1,500-person preview; server-side typed confirmation; school/year isolation; admin-only access; forced-password block; failed-delete preservation; exact deletion count; cache invalidation and audit')
})().catch(error=>{console.error(error);process.exitCode=1})
