const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-input.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api});
const {parseSchedulePaste,parseSubjectTable,validateSubjectInputs}=api;
assert.equal(JSON.stringify(parseSchedulePaste('นาย\tสมชาย\tครู\r\nนาง\tสมหญิง\tครู\r\n')),JSON.stringify([['นาย','สมชาย','ครู'],['นาง','สมหญิง','ครู']]));
assert.equal(JSON.stringify(parseSchedulePaste('"ชื่อ\tมีแท็บ"\t"สอง\nบรรทัด"\t"พูด ""ดี"""')),JSON.stringify([['ชื่อ\tมีแท็บ','สอง\nบรรทัด','พูด "ดี"']]));
assert.equal(parseSchedulePaste('\n\t\n').length,0);
const row={classroomId:'c1',code:'ค21101',name:'คณิต',teacherId:'t1',count:3,pattern:[2,1],venue:'',group:'คณิตศาสตร์',type:'พื้นฐาน'};
validateSubjectInputs([row,{...row,classroomId:'c2'}]);assert.throws(()=>validateSubjectInputs([row,row]),/ซ้ำ/);assert.throws(()=>validateSubjectInputs([{...row,pattern:[2]}]),/รูปแบบ/);assert.throws(()=>validateSubjectInputs([{...row,count:0}]),/รูปแบบ/);validateSubjectInputs([{...row,teacherId:''}]);
assert.equal(JSON.stringify(parseSubjectTable([['ห้องนักเรียน','รหัสวิชา','ชื่อวิชา','คาบต่อสัปดาห์','กลุ่มสาระ','ประเภท'],['ม.1/1','ท21101','ภาษาไทย','3','ภาษาไทย','พื้นฐาน'],['','','','','','']])),JSON.stringify([['ม.1/1','ท21101','ภาษาไทย','3','ภาษาไทย','พื้นฐาน']]));
console.log('PASS: Excel CRLF, quoted multiline/tab cells, escaped quotes, blank rows, duplicate offerings, weekly pattern validation');

function loadServer(deps){const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-input-server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out,require:name=>deps[name]||{}});return out}
;(async()=>{
let session={schoolId:'school',role:'admin',userId:'actor'},staffCalls=0,rpcCalls=0;
const current={hash:'hash',classrooms:[{id:'c1',level:'ม.1'}],teachers:[{id:'t1',prefix:'นาย',full_name:'ครูเดิม'},{id:'t2',prefix:'นาง',full_name:'ครูสอง'}],plan:{teacherIds:['t1','t2'],rooms:[],rules:{l1:{count:3,pattern:[2,1],roomId:null,morning:false,spread:true}},reduceGaps:false,maxContinuous:0,days:[1,2,3,4,5]},lessons:[{id:'l1',classroomId:'c1',code:row.code,name:row.name,fullName:row.name,subjectId:'sub1',subjectGroup:row.group,subjectType:row.type,count:3,activity:false,teacherId:'t1'}],slots:[]};
function sheetClient(capture){return {from(table){const state={op:'select',payload:null};const builder={select(){return builder},insert(payload){state.op='insert';state.payload=payload;return builder},update(payload){state.op='update';state.payload=payload;capture.updates.push([table,payload]);return builder},upsert(payload){state.op='upsert';state.payload=payload;capture.plans.push(payload);return builder},eq(){return builder},in(){return builder},range(){return builder},maybeSingle(){return Promise.resolve({data:null,error:null})},then(resolve,reject){let data=[];if(state.op==='insert'){const rows=(Array.isArray(state.payload)?state.payload:[state.payload]).map((item,index)=>({...item,id:`${table}-${capture.inserts.length}-${index}`}));capture.inserts.push([table,rows]);data=rows}else if(state.op==='select'&&table==='subjects')data=[{id:'sub1',code:row.code,name:row.name}];return Promise.resolve({data,error:null,count:0}).then(resolve,reject)}};return builder}}}
const capture={inserts:[],updates:[],plans:[]};
const server=loadServer({'./session':{getSession:async()=>session},'./supabase':{createServerClient:()=>sheetClient(capture)},'./schedules':{SCHEDULE_EDIT_ROLES:['admin','academic_head']},'./schedule-preparation':{preparation:async()=>current},'./schedule-input':api,'./staff-table':{saveStaffRows:async rows=>{staffCalls++;assert.equal(rows.length,1);assert.equal(rows[0].username,'');assert.equal(rows[0].role,'');assert.equal(rows[0].password,'');return rows.map(r=>({key:r.key,id:'new'}))}}});
const reused=await server.importScheduleTeachers('year',1,[{key:'1',prefix:'นาย',name:'ครูเดิม',position:'ครู'}]);assert.equal(reused.reused,1);assert.equal(staffCalls,0);
await server.importScheduleTeachers('year',1,[{key:'1',prefix:'นาง',name:'ครูใหม่',position:'ครู'},{key:'2',prefix:'นาง',name:'ครูใหม่',position:'ครู'}]);assert.equal(staffCalls,1);
await assert.rejects(server.importScheduleSubjects('year',1,'stale',[row]),/ข้อมูลเปลี่ยน/);await assert.rejects(server.importScheduleSubjects('year',1,'hash',[{...row,teacherId:'foreign'}]),/ครู/);assert.equal(capture.inserts.length,0);
await server.importScheduleSubjects('year',1,'hash',[{...row,teacherId:''}]);assert.equal(capture.inserts.length,0);assert.equal(capture.updates.length,0);assert.equal(capture.plans.at(-1).config.rules.l1.count,3);
const bulk=Array.from({length:501},(_,n)=>({...row,teacherId:'',code:`ค${String(n).padStart(5,'0')}`}));
validateSubjectInputs(bulk);assert.throws(()=>validateSubjectInputs(Array.from({length:2001},(_,n)=>({...row,code:`ค${n}`}))),/2000/);
const bulkCapture={inserts:[],updates:[],plans:[]};
const batched=loadServer({'./session':{getSession:async()=>session},'./supabase':{createServerClient:()=>sheetClient(bulkCapture)},'./schedules':{SCHEDULE_EDIT_ROLES:['admin','academic_head']},'./schedule-preparation':{preparation:async()=>current},'./schedule-input':api,'./staff-table':{}});
await batched.importScheduleSubjects('year',1,'hash',bulk);
const offeringRows=bulkCapture.inserts.filter(item=>item[0]==='class_subjects').flatMap(item=>item[1]);
assert.equal(offeringRows.length,501);assert.equal(offeringRows.every(item=>item.teacher_id===null),true);assert.equal(offeringRows.every(item=>item.semester===1),true);
await assert.rejects(server.saveTeachingAssignments('year',1,'stale',[{lessonId:'l1',teacherId:'t2'}]),/ข้อมูลเปลี่ยน/);
await assert.rejects(server.saveTeachingAssignments('year',1,'hash',[{lessonId:'foreign',teacherId:'t2'}]),/ขอบเขต/);
await assert.rejects(server.saveTeachingAssignments('year',1,'hash',[{lessonId:'l1',teacherId:'foreign'}]),/ขอบเขต/);
await assert.rejects(server.saveTeachingAssignments('year',1,'hash',[{lessonId:'l1',teacherId:'t2'},{lessonId:'l1',teacherId:'t2'}]),/ซ้ำ/);
capture.updates.length=0;capture.plans.length=0;await server.saveTeachingAssignments('year',1,'hash',[{lessonId:'l1',teacherId:'t2'}]);assert.equal(capture.updates.at(-1)[1].teacher_id,'t2');assert.equal(capture.plans.at(-1).config.rules.l1.pattern.join('+'),'2+1');
const calls=[];let scoreCount=0,slotCount=0;
const remover=loadServer({'./session':{getSession:async()=>session},'./supabase':{createServerClient:()=>({from(table){const result=table==='scores'?{count:scoreCount,error:null}:table==='class_schedule_slots'?{count:slotCount,error:null}:{error:null};const builder={select(){return builder},update(payload){calls.push(['update',payload]);return builder},eq(){return builder},in(_column,ids){calls.push(['in',table,ids]);return Promise.resolve(result)},delete(){return{in(_column,ids){calls.push(['delete',ids]);return Promise.resolve({error:null})}}},then(resolve,reject){return Promise.resolve(result).then(resolve,reject)}};return builder}})},'./schedules':{SCHEDULE_EDIT_ROLES:['admin','academic_head']},'./schedule-preparation':{preparation:async()=>current},'./schedule-input':api,'./staff-table':{}});
await assert.rejects(remover.removeScheduleSubjects('year',1,'stale',['l1']),/ข้อมูลเปลี่ยน/);
await assert.rejects(remover.removeScheduleSubjects('year',1,'hash',['missing']),/ห้อง/);
scoreCount=1;await assert.rejects(remover.removeScheduleSubjects('year',1,'hash',['l1']),/คะแนน/);scoreCount=0;
slotCount=2;await assert.rejects(remover.removeScheduleSubjects('year',1,'hash',['l1']),/คาบ/);slotCount=0;
await remover.removeScheduleSubjects('year',1,'hash',['l1']);assert.equal(calls.at(-1)[0],'delete');assert.equal(calls.at(-1)[1][0],'l1');assert.equal(calls.find(call=>call[0]==='update')[1].config.rules.l1,undefined);
console.log('PASS: teaching assignment rejects stale/foreign/duplicate rows and reuses server curriculum and saved workload');
const writes=capture.inserts.length+capture.updates.length;session={...session,role:'teacher'};await assert.rejects(server.importScheduleSubjects('year',1,'hash',[row]),/สิทธิ์/);session={...session,role:'admin',mustChangePassword:true};await assert.rejects(server.importScheduleSubjects('year',1,'hash',[row]),/สิทธิ์/);assert.equal(capture.inserts.length+capture.updates.length,writes);
console.log('PASS: reuse staff, duplicate input names, no account activation, stale/foreign/role/password guard before writes');
})().catch(error=>{console.error(error);process.exitCode=1});
