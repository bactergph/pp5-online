const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
const source=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const plain=file=>{const exports={};vm.runInNewContext(source(file),{exports,require:()=>({})});return exports}
const helpers=plain('lib/student-value-ledger.ts'),{fetchAllRows}=plain('lib/supabase-paginate.ts')
let session={userId:'teacher',role:'teacher',schoolId:'school',fullName:'ครูทดสอบ'},personal=null,fail=false
const rooms=[{id:'room',level:'ป.1',room:1,academic_year_id:'year',school_id:'school',homeroom_teacher_id:'teacher'},{id:'other',academic_year_id:'other-year',school_id:'other-school',homeroom_teacher_id:'other'}]
const students=Array.from({length:20},(_,i)=>({id:'s'+i,classroom_id:'room',student_number:i+1,prefix:'เด็กชาย',first_name:'ทดสอบ'+i,last_name:'สรุป'}))
const records=[{student_id:'s0',classroom_id:'room',date:'2026-11-03',activity_type:'saving',value:10.25},{student_id:'s0',classroom_id:'room',date:'2026-11-03',activity_type:'merit',value:5}]
const calls=[],writes=[]
class Query {
 constructor(table){this.table=table;this.filters=[];this.bounds=null;this.single=false;this.payload=null;calls.push(this)}
 select(){return this}order(){return this}limit(){return this}eq(key,value){this.filters.push(row=>row[key]===value);return this}gte(key,value){this.filters.push(row=>row[key]>=value);return this}lte(key,value){this.filters.push(row=>row[key]<=value);return this}range(from,to){this.bounds=[from,to];return this}maybeSingle(){this.single=true;return this}upsert(payload){this.payload=payload;return this}
 then(resolve,reject){return Promise.resolve().then(()=>{
  if(this.payload){if(fail)return {error:{message:'จำลองบันทึกไม่สำเร็จ'},data:null};for(const row of this.payload){const index=records.findIndex(old=>old.student_id===row.student_id&&old.date===row.date&&old.activity_type===row.activity_type);if(index>=0)records[index]={...records[index],...row};else records.push(row)}writes.push(this.payload);return {error:null,data:null}}
  let rows=this.table==='classrooms'?rooms:this.table==='students'?students:this.table==='daily_activities'?records:this.table==='academic_years'?[{id:'year',school_id:'school',year_be:2569}]:[]
  rows=rows.filter(row=>this.filters.every(filter=>filter(row)));if(this.bounds)rows=rows.slice(this.bounds[0],this.bounds[1]+1)
  return {data:this.single?rows[0]||null:rows,error:null}
 }).then(resolve,reject)}
}
const api={},db={from:table=>new Query(table)}
const imports={
 '@/lib/session':{getSession:async()=>session},'@/lib/supabase':{createServerClient:()=>db},'@/lib/audit':{logActivity:async()=>{}},
 '@/lib/student-value-ledger':helpers,'@/lib/supabase-paginate':{fetchAllRows},
 '@/lib/personal-data-scope':{personalHomeroomIds:async()=>personal,assertPersonalHomeroom:async(_s,id)=>{if(personal&&!personal.includes(id))throw Error('ห้องประจำชั้นไม่อยู่ในสิทธิ์')}},
 '@/lib/students-cache':{getClassroomStudentsCached:async(_id,loader)=>loader()},'@/lib/term-calendar-server':{fetchTermClosedDays:async()=>[]},
 '@/lib/school-calendar-cache':{getHolidaysCached:async(_y,_s,_e,loader)=>loader(),getWeekendSchoolDaysCached:async(_y,_s,_e,loader)=>loader()},
 '@/lib/classroom-admin-records-cache':{getMonthlyActivityRowsCached:async(_r,_m,_t,loader)=>loader(),invalidateMonthlyActivityCache:()=>{}},
}
vm.runInNewContext(source('app/(shell)/classroom-admin/actions.ts'),{exports:api,require:name=>imports[name]||{},console,Date,Map,Set,Promise})
;(async()=>{
 let result=await api.fetchMonthlyActivity('room','year','2026-11','merit');assert.equal(result.records.s0[3],5);assert.equal(result.records.s1,undefined,'Merit does not default from attendance')
 result=await api.saveMonthlyActivity('room','2026-11',2,'merit',[{student_id:'s0',day:3,value:9}]);assert.equal(result.error,null);assert.equal(records.find(row=>row.activity_type==='saving').value,10.25)
 let count=writes.length
 for(const value of [-1,1.5,NaN,Infinity])assert.ok((await api.saveMonthlyActivity('room','2026-11',2,'merit',[{student_id:'s0',day:3,value}])).error)
 assert.ok((await api.saveMonthlyActivity('room','2026-11',2,'saving',[{student_id:'s0',day:3,value:.111}])).error)
 assert.ok((await api.saveMonthlyActivity('room','2026-11',2,'merit',[{student_id:'foreign',day:3,value:2}])).error)
 assert.ok((await api.saveDailyActivity('room','2026-11-03',2,'merit',[{student_id:'foreign',value:2}])).error)
 assert.equal(writes.length,count)
 fail=true;assert.ok((await api.saveMonthlyActivity('room','2026-11',2,'merit',[{student_id:'s0',day:3,value:20}])).error);fail=false;assert.equal(records.find(row=>row.activity_type==='merit').value,9)
 assert.equal((await api.fetchStudentValueSummary('room','year','saving','month','2026-11')).summary.total,10.25)
 assert.equal((await api.fetchStudentValueSummary('room','year','merit','month','2026-11')).summary.total,9)
 assert.ok((await api.fetchStudentValueSummary('room','bad-year','saving','year','2026-11')).error)
 assert.ok((await api.fetchStudentValueSummary('room','year','saving','month','2026-04')).error)
 const before=calls.length;assert.ok((await api.fetchStudentValueSummary('other','other-year','saving','year','2026-11')).error);assert.ok(!calls.slice(before).some(query=>query.table==='daily_activities'),'No cross-school ledger read')
 personal=[];assert.ok((await api.fetchStudentValueSummary('room','year','saving','year','2026-11')).error);personal=null
 session={...session,role:'principal'};assert.ok((await api.saveMonthlyActivity('room','2026-11',2,'merit',[{student_id:'s0',day:3,value:2}])).error);assert.equal((await api.fetchStudentValueSummary('room','year','merit','month','2026-11')).summary.total,9)
 records.splice(0,records.length,...Array.from({length:1205},(_,i)=>({student_id:'s'+i%20,classroom_id:'room',activity_type:'merit',date:new Date(Date.UTC(2026,4,1+Math.floor(i/20))).toISOString().slice(0,10),value:1})))
 const pages=calls.length;result=await api.fetchStudentValueSummary('room','year','merit','year','2026-11');assert.equal(result.summary.total,1205);assert.equal(calls.slice(pages).filter(query=>query.table==='daily_activities'&&query.bounds).length,2,'No 1000-row truncation')
 session=null;await assert.rejects(api.fetchStudentValueSummary('room','year','merit','year','2026-11'),/ไม่มีสิทธิ์/)
 console.log('PASS: actual server actions, independent numeric kinds, precision/student validation, failed writes, school/homeroom/principal/auth scope, academic year range and complete pagination')
})().catch(error=>{console.error(error);process.exitCode=1})
