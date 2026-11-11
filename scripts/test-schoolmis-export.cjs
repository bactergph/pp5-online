const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),XLSX=require('xlsx')
let session={schoolId:'school',role:'admin',userId:'admin'}
const tables={
 academic_years:[{id:'year',school_id:'school',year_be:2569},{id:'foreign-year',school_id:'foreign',year_be:2569}],
 classrooms:[{id:'r1',school_id:'school',academic_year_id:'year',level:'ป.1',room:1},{id:'r4',school_id:'school',academic_year_id:'year',level:'ป.4',room:1},{id:'foreign-room',school_id:'foreign',academic_year_id:'foreign-year',level:'ป.1',room:1}],
 students:Array.from({length:1001},(_,i)=>({id:'s'+i,classroom_id:'r1',student_number:i+1,student_code:String(i).padStart(5,'0'),prefix:'เด็กชาย',first_name:i===0?'ชื่อ,ทดสอบ':'ตัวอย่าง',last_name:'นักเรียน'})).concat([{id:'s4',classroom_id:'r4',student_number:1,student_code:'00444',prefix:'เด็กหญิง',first_name:'ตัวอย่าง',last_name:'ป4'},{id:'secret',classroom_id:'foreign-room',student_number:1,student_code:'SECRET',first_name:'ต่างโรงเรียน'}]),
 class_subjects:[{id:'cs1',classroom_id:'r1',academic_year_id:'year',order_number:1,subjects:{code:'ท11101',name:'ภาษาไทย1'}},{id:'cs4',classroom_id:'r4',academic_year_id:'year',order_number:1,subjects:{code:'ท14101',name:'ภาษาไทย4'}},{id:'activity',classroom_id:'r4',academic_year_id:'year',order_number:2,subjects:{code:'ก14901',name:'กิจกรรม'}}],
 scores:[{student_id:'s0',class_subject_id:'cs1',term:1,grade:2,result:'เรียน'},{student_id:'s0',class_subject_id:'cs1',term:2,grade:3.5,result:'เรียน'},{student_id:'s4',class_subject_id:'cs4',term:2,grade:4,result:'เรียน'}]
}
const db={from(name){let rows=tables[name];const q={select(){return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return q},order(){return q},range(a,b){return Promise.resolve({data:rows.slice(a,b+1),error:null})},maybeSingle(){return Promise.resolve({data:rows[0]||null,error:null})}};return q}}
const cache={};function load(path){if(cache[path])return cache[path];const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>name==='server-only'?{}:name==='@/lib/session'?{getSession:async()=>session}:name==='@/lib/supabase'?{createServerClient:()=>db}:name.startsWith('@/')?load(name.slice(2)+'.ts'):require(name),m,m.exports);return cache[path]=m.exports}
const parse=csv=>XLSX.utils.sheet_to_json(XLSX.read(csv.replace(/^\uFEFF/,''),{type:'string',raw:true}).Sheets.Sheet1,{header:1,defval:''})
;(async()=>{
 const api=load('lib/schoolmis-export.ts'),csv=load('lib/schoolmis-csv.ts')
 assert.equal(csv.subjectCodeGradeNumber('ท14101'),4);assert.equal(csv.subjectCodeGradeNumber('ค12101'),2);assert.equal(csv.subjectCodeGradeNumber('ท21101'),1)
 const whole=await api.buildSchoolMisSchoolExport('year');assert.equal(whole.error,null);assert.ok(whole.csv.startsWith('\uFEFF'))
 const rows=parse(whole.csv);assert.equal(rows.length,1003);assert.deepEqual(rows[0],['#','ชั้น','ห้อง','รหัสนักเรียน','ชื่อ-สกุล','ท11101 ภาษาไทย1','ท14101 ภาษาไทย4']);assert.equal(rows[1][3],'00000');assert.equal(rows[1][4],'เด็กชายชื่อ,ทดสอบนักเรียน');assert.equal(rows[1][5],'3.5');assert.equal(rows[1][6],'');assert.equal(rows.at(-1)[6],'4');assert.ok(!whole.csv.includes('SECRET'));assert.ok(!whole.csv.includes('ก14901'))
 const room=await api.buildSchoolMisGradesExport({academicYearId:'year',classroomId:'r4'});assert.equal(room.error,null);assert.equal(parse(room.csv)[0].length,4);assert.equal(parse(room.csv)[1][3],'4')
 assert.ok((await api.buildSchoolMisSchoolExport('foreign-year')).error)
 tables.classrooms.push({id:'m1',school_id:'school',academic_year_id:'year',level:'ม.1',room:1})
 tables.students.push({id:'ms',classroom_id:'m1',student_number:1,student_code:'99001',first_name:'ตัวอย่าง',last_name:'มัธยม'})
 const secondarySubject={id:'common',code:'ท21101',name:'ภาษาไทย'}
 tables.class_subjects.push(
   {id:'ms1',classroom_id:'m1',academic_year_id:'year',semester:1,order_number:1,subjects:secondarySubject},
   {id:'ms2',classroom_id:'m1',academic_year_id:'year',semester:2,order_number:1,subjects:secondarySubject},
   {id:'legacy',classroom_id:'m1',academic_year_id:'year',semester:0,order_number:0,subjects:secondarySubject},
 )
 tables.scores.push(
   {student_id:'ms',class_subject_id:'ms1',term:1,grade:4,result:'เรียน'},
   {student_id:'ms',class_subject_id:'ms2',term:2,grade:2,result:'เรียน'},
   {student_id:'ms',class_subject_id:'legacy',term:1,grade:0,result:'เรียน'},
 )
 assert.match((await api.buildSchoolMisGradesExport({academicYearId:'year',classroomId:'m1'})).error,/ภาคเรียน/)
 assert.match((await api.buildSchoolMisSchoolExport('year')).error,/ภาคเรียน/)
 for(const [term,expected] of [[1,'4'],[2,'2']]){
   const classroom=await api.buildSchoolMisGradesExport({academicYearId:'year',classroomId:'m1',term})
   assert.equal(classroom.error,null);assert.match(classroom.fileName,new RegExp('เทอม'+term))
   const local=parse(classroom.csv)
   assert.equal(local[0].filter(v=>v.includes('ท21101')).length,1)
   assert.equal(local[1].at(-1),expected)
   const mixed=await api.buildSchoolMisSchoolExport('year',term)
   assert.equal(mixed.error,null);assert.match(mixed.fileName,new RegExp('เทอม'+term))
   const all=parse(mixed.csv)
   const ix=all[0].findIndex(v=>v.includes('ท21101'))
   assert.equal(all.find(row=>row[3]==='99001')[ix],expected)
   assert.equal(all.find(row=>row[3]==='00000')[5],'3.5','Primary exports retain annual grades')
 }
 session={...session,role:'teacher'};assert.ok((await api.buildSchoolMisSchoolExport('year')).error.includes('สิทธิ์'))
 session=null;assert.ok((await api.buildSchoolMisSchoolExport('year')).error.includes('สิทธิ์'))
 console.log('PASS: school/year isolation, role authorization, 1,002 students across rooms, grade columns/blank cells, CSV escaping and room export compatibility')
})().catch(e=>{console.error(e);process.exitCode=1})
