const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-input.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api});
const {parseSchedulePaste,validateSubjectInputs}=api;
assert.equal(JSON.stringify(parseSchedulePaste('นาย\tสมชาย\tครู\r\nนาง\tสมหญิง\tครู\r\n')),JSON.stringify([['นาย','สมชาย','ครู'],['นาง','สมหญิง','ครู']]));
assert.equal(JSON.stringify(parseSchedulePaste('"ชื่อ\tมีแท็บ"\t"สอง\nบรรทัด"\t"พูด ""ดี"""')),JSON.stringify([['ชื่อ\tมีแท็บ','สอง\nบรรทัด','พูด "ดี"']]));
assert.equal(parseSchedulePaste('\n\t\n').length,0);
const row={classroomId:'c1',code:'ค21101',name:'คณิต',teacherId:'t1',count:3,pattern:[2,1],venue:'',group:'คณิตศาสตร์',type:'พื้นฐาน'};
validateSubjectInputs([row,{...row,classroomId:'c2'}]);assert.throws(()=>validateSubjectInputs([row,row]),/ซ้ำ/);assert.throws(()=>validateSubjectInputs([{...row,pattern:[2]}]),/รูปแบบ/);assert.throws(()=>validateSubjectInputs([{...row,count:0}]),/รูปแบบ/);
console.log('PASS: Excel CRLF, quoted multiline/tab cells, escaped quotes, blank rows, duplicate offerings, weekly pattern validation');

function loadServer(deps){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-input-server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out,require:name=>deps[name]||{}});return out}
;(async()=>{
let session={schoolId:'school',role:'admin',userId:'actor'},staffCalls=0,rpcCalls=0,lastRows=null;
const current={hash:'hash',classrooms:[{id:'c1'}],teachers:[{id:'t1',prefix:'นาย',full_name:'ครูเดิม'},{id:'t2',prefix:'นาง',full_name:'ครูสอง'}],plan:{teacherIds:['t1','t2'],rooms:[],rules:{l1:{count:3,pattern:[2,1]}}},lessons:[{id:'l1',classroomId:'c1',code:row.code,name:row.name,fullName:row.name,subjectGroup:row.group,subjectType:row.type,count:3,activity:false}]};
const server=loadServer({'./session':{getSession:async()=>session},'./supabase':{createServerClient:()=>({rpc:async(name,args)=>{rpcCalls++;lastRows=args.p_rows;return {error:null}}})},'./schedules':{SCHEDULE_EDIT_ROLES:['admin','academic_head']},'./schedule-preparation':{preparation:async()=>current},'./schedule-input':api,'./staff-table':{saveStaffRows:async rows=>{staffCalls++;assert.equal(rows.length,1);assert.equal(rows[0].username,'');assert.equal(rows[0].role,'');assert.equal(rows[0].password,'');return rows.map(r=>({key:r.key,id:'new'}))}}});
const reused=await server.importScheduleTeachers('year',1,[{key:'1',prefix:'นาย',name:'ครูเดิม',position:'ครู'}]);assert.equal(reused.reused,1);assert.equal(staffCalls,0);
await server.importScheduleTeachers('year',1,[{key:'1',prefix:'นาง',name:'ครูใหม่',position:'ครู'},{key:'2',prefix:'นาง',name:'ครูใหม่',position:'ครู'}]);assert.equal(staffCalls,1);
await assert.rejects(server.importScheduleSubjects('year',1,'stale',[row]),/ข้อมูลเปลี่ยน/);await assert.rejects(server.importScheduleSubjects('year',1,'hash',[{...row,teacherId:'foreign'}]),/โรงเรียน/);assert.equal(rpcCalls,0);
await assert.rejects(server.saveTeachingAssignments('year',1,'stale',[{lessonId:'l1',teacherId:'t2'}]),/ข้อมูลเปลี่ยน/);
await assert.rejects(server.saveTeachingAssignments('year',1,'hash',[{lessonId:'foreign',teacherId:'t2'}]),/ขอบเขต/);
await assert.rejects(server.saveTeachingAssignments('year',1,'hash',[{lessonId:'l1',teacherId:'foreign'}]),/ขอบเขต/);
await assert.rejects(server.saveTeachingAssignments('year',1,'hash',[{lessonId:'l1',teacherId:'t2'},{lessonId:'l1',teacherId:'t2'}]),/ซ้ำ/);
await server.saveTeachingAssignments('year',1,'hash',[{lessonId:'l1',teacherId:'t2'}]);assert.equal(rpcCalls,1);assert.equal(lastRows[0].teacherId,'t2');assert.equal(lastRows[0].name,row.name);assert.equal(lastRows[0].pattern.join('+'),'2+1');rpcCalls=0;
console.log('PASS: teaching assignment rejects stale/foreign/duplicate rows and reuses server curriculum and saved workload');
session={...session,role:'teacher'};await assert.rejects(server.importScheduleSubjects('year',1,'hash',[row]),/สิทธิ์/);session={...session,role:'admin',mustChangePassword:true};await assert.rejects(server.importScheduleSubjects('year',1,'hash',[row]),/สิทธิ์/);assert.equal(rpcCalls,0);
console.log('PASS: reuse staff, duplicate input names, no account activation, stale/foreign/role/password guard before writes');
})().catch(error=>{console.error(error);process.exitCode=1});
