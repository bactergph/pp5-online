const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const modules=new Map();function load(file,deps={}){file=path.resolve(file);if(modules.has(file))return modules.get(file);const api={};modules.set(file,api);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api,Date,Error,require:name=>name in deps?deps[name]:name==='server-only'?{}:name.startsWith('@/')?load(name.slice(2)+'.ts',deps):require(name)});return api}
const model=load('lib/secondary-academic.ts'),transfer=load('lib/score-transfer.ts');
const catalog=JSON.parse(fs.readFileSync('data/seka-secondary-subjects.json','utf8'));
assert.equal(catalog.source,'โรงเรียนเซกา');assert.equal(new Set(catalog.subjects.map(s=>s.level)).size,6);
for(const level of ['ม.1','ม.2','ม.3','ม.4','ม.5','ม.6']) {
 const subjects=catalog.subjects.filter(s=>s.level===level).map((subject,i)=>({class_subject_id:'c'+i,semester:2,subject:{...subject,id:'s'+i,max_score:100}}));
 const scores=subjects.map((s,i)=>({student_id:'learner',class_subject_id:s.class_subject_id,term:2,term_total:i%2?75:80,result:'เรียน'})),scoreConfigs=subjects.map(s=>({class_subject_id:s.class_subject_id,term:2,total_max:100}));
 const summary=model.secondaryTermSummary({subjects,scores,scoreConfigs},'learner',2);
 const credits=subjects.reduce((n,s)=>n+s.subject.credits,0),points=subjects.reduce((n,s,i)=>n+s.subject.credits*(i%2?3.5:4),0);
 assert.equal(summary.rows.length,subjects.length,level);assert.equal(summary.registeredCredits,credits,level);assert.equal(summary.gpa,Math.floor((points/credits+Number.EPSILON)*100)/100,level);
 assert.equal(model.secondaryTermSummary({subjects,scores,scoreConfigs},'learner',1).rows.length,0,level+' must not leak semester 2 into 1');
}
const courses=[{class_subject_id:'thai1',semester:1,subject:{code:'ท21101',name:'ไทย 1',type:'พื้นฐาน',credits:1.5,max_score:100}},{class_subject_id:'math1',semester:1,subject:{code:'ค21101',name:'คณิต 1',type:'พื้นฐาน',credits:1,max_score:100}},{class_subject_id:'thai2',semester:2,subject:{code:'ท21102',name:'ไทย 2',type:'พื้นฐาน',credits:1.5,max_score:100}}];
const data={subjects:courses,scores:[{student_id:'a',class_subject_id:'thai1',term:1,term_total:80,year_total:180,grade:null,result:'เรียน'},{student_id:'a',class_subject_id:'math1',term:1,term_total:70,grade:0,result:'เรียน'},{student_id:'a',class_subject_id:'thai2',term:2,term_total:50,year_total:180,grade:4,result:'เรียน'}],scoreConfigs:courses.map((s,i)=>({class_subject_id:s.class_subject_id,term:i===2?2:1,total_max:100})),evaluations:{character:[],reading:[],competency:[],activities:[]},activitySettings:[]};
const original=JSON.stringify(data);assert.equal(model.secondaryTermSummary(data,'a',1).gpa,3.6);assert.equal(model.secondaryTermSummary(data,'a',2).gpa,1);assert.equal(model.secondaryTermSummary(data,'a',1).registeredCredits,2.5);assert.equal(model.secondaryTermSummary(data,'a',1).earnedCredits,2.5);assert.equal(JSON.stringify(data),original,'Read/print must not rewrite historical scores');
data.scores[1].term_total=0;assert.equal(model.secondaryTermSummary(data,'a',1).gpa,2.4,'Zero grade remains in GPA denominator');assert.equal(model.secondaryTermSummary(data,'a',1).earnedCredits,1.5);
data.scores[1].result='ร';assert.equal(model.secondaryTermSummary(data,'a',1).gpa,null);assert.equal(model.secondaryTermSummary(data,'a',1).pendingCount,1);
data.scores[1].result='เรียน';data.subjects[1].subject.credits=null;assert.equal(model.secondaryTermSummary(data,'a',1).gpa,null);assert.equal(model.secondaryTermSummary(data,'a',1).missingCreditCount,1);
const config={between_scores:[20,30],midterm_max:20,final_max:30,total_max:100};const input={unit_scores:{1:20,2:30},midterm_score:20,final_score:10,result:'เรียน',term_total:999,year_total:200,grade:0};
assert.equal(model.normalizeSecondaryScore(input,config).grade,4);assert.equal(model.normalizeSecondaryScore(input,config).term_total,80);assert.equal(model.normalizeSecondaryScore(input,config).year_total,null);assert.equal(model.normalizeSecondaryScore({...input,unit_scores:{},midterm_score:null,final_score:null},config).grade,null);
assert.equal(model.normalizeSecondaryScore({...input,result:'มส'},config).grade,null);assert.throws(()=>model.normalizeSecondaryScore({...input,unit_scores:{1:21}},config));assert.throws(()=>model.normalizeSecondaryScore({...input,unit_scores:{99:1}},config));assert.throws(()=>model.normalizeSecondaryScore({...input,final_score:-1},config));
const legacy={...courses[0],semester:0};assert.equal(model.secondarySubjects([legacy],1).length,1);assert.equal(model.secondarySubjects([legacy],2).length,1);
const students=[{id:'a',student_number:1,first_name:'ทดสอบ',last_name:'มัธยม',prefix:null}],rows={a:{unit_scores:[20,30],midterm:20,final:10,result:'ร'}};
const excel=transfer.scoreTransferData(students,rows,config,1,true);assert.equal(transfer.parseScoreTransfer(excel,students,config,1,['เรียน','ร'],true).a.result,'ร');assert.equal(transfer.scoreTransferHeaders(config,1).includes('ผลการเรียน'),false,'Primary term-1 Excel format remains unchanged');
const activities=model.secondaryActivityRows([{student_id:'a',term:0,field_key:'x',value_text:'ผ่าน'},{student_id:'a',term:1,field_key:'x',value_text:'ผ่าน'},{student_id:'a',term:2,field_key:'x',value_text:'ไม่ผ่าน'}],[{field_key:'x',is_active:true},{field_key:'y',is_active:true}]);assert.equal(activities.length,2);assert.equal(activities[0].overall_result,null,'Incomplete activity assessment must not claim pass');assert.equal(activities[1].overall_result,'ไม่ผ่าน');
// Actual server action: score formula cannot be forged by the browser.
let writes = [], locked = false, latest = [], simulateRetry = false, attempts = 0
const session = { role: 'teacher', schoolId: 'school', userId: 'teacher' }
const tables = { students: [{ id: 'a', classroom_id: 'room' }], score_configs: [config] }
function query(table){const filters=[];const result=()=>({data:table==='class_subjects'?[{id:'course'}]:(table==='scores'?latest:tables[table]||[]).filter(row=>filters.every(fn=>fn(row))),error:null});const q={select:()=>q,eq:(key,v)=>{if(table==='score_configs'||key==='class_subject_id'||key==='term')return q;filters.push(r=>r[key]===v);return q},in:(key,vs)=>{filters.push(r=>vs.includes(r[key]));return q},maybeSingle:async()=>({...result(),data:result().data[0]||null}),then:(yes,no)=>Promise.resolve(result()).then(yes,no)};return q}
const api=load('app/(shell)/scores/actions.ts',{'@/lib/supabase':{createServerClient:()=>({from:query, rpc})},'@/lib/session':{getSession:async()=>session},'@/lib/audit':{logActivity:async()=>{},resolveClassSubjectContext:async()=>({schoolId:'school'})},'@/lib/personal-data-scope':{isPersonalSubjectAccess:async()=>false,limitsToOwnSubjects:async()=>false},'@/lib/score-entry-period':{getScoreEntryPeriod:async()=>({classroomId:'room',classroomLevel:'ม.1',scoreTerms:[1,2],open:true})}});
async function rpc(name, payload) {
  assert.equal(name, 'save_score_edits')
  attempts++
  if (simulateRetry && attempts === 1) {
    latest = [{ student_id: 'a', ...input, unit_scores: { 1: 19, 2: 30 }, final_score: null }]
    return { error: { code: '40001' } }
  }
  if (locked) return { error: { message: 'คะแนนถูกล็อก' } }
  writes = payload.p_rows
  return { error: null }
}
;(async () => {
  const before = { unit_scores: {}, midterm_score: null, final_score: null, result: 'เรียน' }
  const edit = { student_id: 'a', before, after: input }
  assert.equal((await api.saveScores('course', 1, [edit])).count, 1)
  assert.equal(writes[0].grade, 4)
  assert.equal(writes[0].term_total, 80)
  assert.equal(writes[0].year_total, null)
  assert.ok((await api.saveScores('course', 2, [{ ...edit, student_id: 'wrong' }])).error)
  locked = true
  assert.match((await api.saveScores('course', 1, [edit])).error, /ล็อก/)
  locked = false
  latest = [{ student_id: 'a', ...input, final_score: null }]
  attempts = 0
  simulateRetry = true
  const raceEdit = { student_id: 'a', before: { ...input, final_score: null }, after: input }
  assert.equal((await api.saveScores('course', 1, [raceEdit])).count, 1)
  assert.equal(attempts, 2)
  assert.equal(writes[0].unit_scores[1], 19, 'Retry merges an edit in a different cell')
  assert.equal(writes[0].term_total, 79)
  assert.match((await api.saveScores('course', 1, [edit])).error, /คะแนนช่องเดียวกัน/)
  console.log('PASS: secondary grading, reports, Excel and activities, score normalization, roster/lock guards, concurrent edits and retry')
})().catch(error => { console.error(error); process.exitCode = 1 })
