// Reproduce a hidden annual offering from the other semester. No production services.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
function compile(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>deps[name]||{},crypto:require('node:crypto')});return exports}
const input=compile('lib/schedule-input.ts')
const subject={id:'subject',school_id:'school',code:'ท11101',name:'ภาษาไทย',level:'ป.1'}
const state={subjects:[subject],class_subjects:[{id:'annual',classroom_id:'room',subject_id:'subject',teacher_id:'teacher',academic_year_id:'year',semester:0}],schedule_plans:[{school_id:'school',academic_year_id:'year',semester:2,config:{days:[1,2,3,4,5],rooms:[],rules:{annual:{count:5,pattern:[1,1,1,1,1],morning:false,spread:true,roomId:null}},reduceGaps:false,maxContinuous:0}}],class_schedule_slots:[]}
let next=0,writes=0,readsFail=false,actor={schoolId:'school',role:'admin'},level='ป.1'
const basePlan=()=>({days:[1,2,3,4,5],rooms:[],rules:{},reduceGaps:false,maxContinuous:0})
const plan=term=>state.schedule_plans.find(p=>p.semester===term)?.config||basePlan()
async function preparation(year,term){const other=term===1?2:1,cfg=structuredClone(plan(term));return{hash:'hash',classrooms:[{id:'room',level}],teachers:[{id:'teacher'},{id:'teacher2'}],slots:state.class_schedule_slots.filter(s=>s.semester===term),plan:cfg,lessons:state.class_subjects.filter(s=>[0,term].includes(s.semester)).filter(s=>!plan(other).rules[s.id]||cfg.rules[s.id]).map(s=>({id:s.id,classroomId:s.classroom_id,subjectId:s.subject_id,teacherId:s.teacher_id,code:subject.code,name:subject.name,fullName:subject.name,count:cfg.rules[s.id]?.count||1,activity:false}))}}
function from(table){const filters=[];let operation='read',payload,start=0,end=999;const execute=()=>{
  if(operation==='read'){if(readsFail&&table==='class_subjects')return{data:null,error:{message:'read unavailable'}};return{data:state[table].filter(row=>filters.every(f=>f(row))).slice(start,end+1),error:null,count:state[table].filter(row=>filters.every(f=>f(row))).length}}
  if(operation==='upsert'){writes++;const existing=state[table].find(p=>p.semester===payload.semester);if(existing)Object.assign(existing,structuredClone(payload));else state[table].push(structuredClone(payload));return{data:[],error:null}}
  if(operation==='update'){writes++;for(const row of state[table].filter(row=>filters.every(f=>f(row))))Object.assign(row,payload);return{data:[],error:null}}
  const batch=Array.isArray(payload)?payload:[payload]
  if(table==='class_subjects'){
    const keys=new Set(state[table].map(row=>[row.classroom_id,row.subject_id,row.academic_year_id,row.semester].join('|')))
    for(const row of batch){const key=[row.classroom_id,row.subject_id,row.academic_year_id,row.semester].join('|');if(keys.has(key))return{data:null,error:{code:'23505',message:'duplicate key violates class_subjects_room_subject_year_term'}};keys.add(key)}
  }
  writes++;const added=batch.map(row=>({...row,id:'new-'+(++next)}));state[table].push(...added);return{data:added,error:null}
};const q={select:()=>q,eq:(key,value)=>{filters.push(row=>row[key]===value);return q},in:(key,values)=>{filters.push(row=>values.includes(row[key]));return q},order:()=>q,range:(a,b)=>{start=a;end=b;return q},insert:rows=>{operation='insert';payload=rows;return q},update:value=>{operation='update';payload=value;return q},upsert:value=>{operation='upsert';payload=value;return q},then:(yes,no)=>Promise.resolve().then(execute).then(yes,no)};return q}
const api=compile('lib/schedule-input-server.ts',{'./session':{getSession:async()=>actor},'./supabase':{createServerClient:()=>({from})},'./schedules':{SCHEDULE_EDIT_ROLES:['admin']},'./schedule-preparation':{preparation},'./schedule-input':input,'./class-level':compile('lib/class-level.ts')})
const row={classroomId:'room',code:'ท11101',name:'ภาษาไทย',teacherId:'teacher',count:4,pattern:[1,1,1,1],venue:'',group:'ภาษาไทย',type:'พื้นฐาน'}
;(async()=>{
  const secondBefore=JSON.stringify(plan(2))
  assert.equal((await preparation('year',1)).lessons.length,0,'Term 2 rule hides the existing annual row from the term 1 projection')
  await api.importScheduleSubjects('year',1,'hash',[row])
  assert.equal(state.class_subjects.length,1,'Primary must reuse its annual offering instead of inserting semester 0 twice')
  assert.equal(plan(1).rules.annual.count,4);assert.equal(JSON.stringify(plan(2)),secondBefore,'Other semester rules remain unchanged')
  assert.equal((await preparation('year',1)).lessons[0].id,'annual')
  await api.importScheduleSubjects('year',2,'hash',[{...row,count:3,pattern:[2,1]}])
  assert.equal(state.class_subjects.length,1);assert.equal(plan(1).rules.annual.count,4);assert.equal(plan(2).rules.annual.count,3)
  await api.importScheduleSubjects('year',1,'hash',[row]);assert.equal(state.class_subjects.length,1,'Retry is idempotent')
  state.class_schedule_slots.push({id:'locked',class_subject_id:'annual',semester:2})
  await assert.rejects(()=>api.importScheduleSubjects('year',1,'hash',[{...row,teacherId:'teacher2'}]),/มีคาบสอน/)
  assert.equal(state.class_subjects[0].teacher_id,'teacher','An annual offering cannot change the teacher of an existing timetable in another term')
  state.class_schedule_slots=[]
  const before=writes;readsFail=true;await assert.rejects(()=>api.importScheduleSubjects('year',1,'hash',[row]),/โหลด/);readsFail=false;assert.equal(writes,before,'Failed authoritative read never becomes a duplicate insert')
  // Secondary uses the same code but independent offering IDs in each semester.
  state.class_subjects=[];state.schedule_plans=[];level='ม.1';subject.level='ม.1'
  await api.importScheduleSubjects('year',2,'hash',[row]);const term2=state.class_subjects.find(s=>s.semester===2).id
  await api.importScheduleSubjects('year',1,'hash',[{...row,count:2,pattern:[2]}]);const term1=state.class_subjects.find(s=>s.semester===1).id
  assert.notEqual(term1,term2);assert.equal(state.class_subjects.length,2);assert.equal(plan(1).rules[term1].count,2);assert.equal(plan(2).rules[term2].count,4)
  // A hidden term-specific row must also be reused after an interrupted plan save.
  state.schedule_plans=[];await api.importScheduleSubjects('year',1,'hash',[row]);assert.equal(state.class_subjects.length,2)
  // Duplicate legacy annual + semester offering prefers the exact semester.
  state.class_subjects.push({id:'legacy',classroom_id:'room',subject_id:'subject',teacher_id:'teacher',academic_year_id:'year',semester:0})
  await api.importScheduleSubjects('year',1,'hash',[{...row,count:6,pattern:[1,1,1,1,1,1]}]);assert.equal(plan(1).rules[term1].count,6);assert.equal(plan(1).rules.legacy,undefined)
  state.class_subjects=state.class_subjects.filter(item=>item.id!==term2)
  await api.importScheduleSubjects('year',2,'hash',[{...row,teacherId:'teacher2'}])
  assert.equal(state.class_subjects.find(item=>item.semester===2).teacher_id,'teacher2')
  assert.equal(state.class_subjects.find(item=>item.id==='legacy').teacher_id,'teacher','New secondary term never changes legacy ownership')
  actor={...actor,role:'teacher'};await assert.rejects(()=>api.importScheduleSubjects('year',1,'hash',[row]),/สิทธิ์/)
  console.log('PASS: primary annual code reused across both semesters; independent workloads and other-term data; retry and read-failure guards; secondary term isolation and exact-term preference')
})().catch(error=>{console.error(error);process.exitCode=1})
