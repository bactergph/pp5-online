// Execute real server actions against isolated school A/B fixtures, never Supabase.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
function compile(file,imports={}) {const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api,Date,require:name=>imports[name]||{}});return api}
const guard=compile('lib/school-record-scope.ts')
let actor={userId:'owner',schoolId:'a',role:'admin'},failure=null,next=0
const writes=[],rpcCalls=[]
const tables={
 schools:[{id:'a',education_type:'primary'},{id:'b',education_type:'primary'}],
 academic_years:[{id:'ya',school_id:'a',year_be:2569,is_active:true},{id:'ya2',school_id:'a',year_be:2570,is_active:false},{id:'yb',school_id:'b',year_be:2569,is_active:true}],
 classrooms:[{id:'ra',school_id:'a',academic_year_id:'ya',level:'ป.1',room:1},{id:'rb',school_id:'b',academic_year_id:'yb',level:'ป.1',room:1},{id:'empty',school_id:'a',academic_year_id:'ya',level:'ป.2',room:1}],
 users:[{id:'owner',school_id:'a',role:'admin',is_active:true},{id:'ta',school_id:'a',role:'teacher',is_active:false,email:'pending-a@example.test'},{id:'tb',school_id:'b',role:'teacher',is_active:true}],
 subjects:[{id:'sa',school_id:'a'},{id:'sa2',school_id:'a'},{id:'sb',school_id:'b'}],
 students:[{id:'sta',classroom_id:'ra',student_number:1},{id:'stb',classroom_id:'rb',student_number:1}],
 class_subjects:[{id:'csa',classroom_id:'ra',subject_id:'sa',teacher_id:'owner',academic_year_id:'ya',order_number:1,semester:0},{id:'csb',classroom_id:'rb',subject_id:'sb',teacher_id:'tb',academic_year_id:'yb',order_number:1}],
 holidays:[{id:'ha',academic_year_id:'ya',date:'2026-11-04',name:'Local'},{id:'hb',academic_year_id:'yb',date:'2026-11-04',name:'Foreign'}],
 weekend_school_days:[{id:'wa',academic_year_id:'ya'},{id:'wb',academic_year_id:'yb'}],
 teacher_permissions:[{id:'pa',teacher_id:'ta',classroom_id:'ra',subject_id:'sa'},{id:'pb',teacher_id:'tb',classroom_id:'rb',subject_id:'sb'}],
 clubs:[{id:'ca',school_id:'a',code:'C1',name:'Local'},{id:'cb',school_id:'b',code:'C2',name:'Foreign'}],
 student_club_assignments:[],period_config:[],scores:[],score_configs:[],evaluation_settings:[],
}
function joined(table,row){const out={...row};if(row.classroom_id)out.classrooms=tables.classrooms.find(c=>c.id===row.classroom_id);if(row.academic_year_id)out.academic_years=tables.academic_years.find(y=>y.id===row.academic_year_id);return out}
function query(table){
 const filters=[];let operation='read',payload,countOnly=false,conflicts
 const execute=()=>{
  const selected=(tables[table]||[]).map(row=>joined(table,row)).filter(row=>filters.every(f=>f(row)))
  if(operation!=='read'){
   if(failure===table)return {data:null,error:{message:'simulated write failure'},count:0}
   writes.push({table,operation,payload:structuredClone(payload)})
   if(operation==='delete')tables[table]=tables[table].filter(row=>!selected.some(item=>item.id===row.id))
   if(operation==='update')for(const row of tables[table])if(selected.some(item=>item.id===row.id))Object.assign(row,payload)
   if(operation==='insert'||operation==='upsert')for(const row of Array.isArray(payload)?payload:[payload]){
    const existing=conflicts&&tables[table].find(item=>conflicts.every(key=>item[key]===row[key]))
    if(existing)Object.assign(existing,row);else tables[table].push({id:'created'+(++next),...row})
   }
  }
  return {data:countOnly?null:operation==='insert'?(Array.isArray(payload)?payload:[payload]).map(row=>({...row,id:row.id||'created'+next})):selected,error:null,count:selected.length}
 }
 const q={select:(_fields,options)=>{countOnly=!!options?.head;return q},eq:(key,value)=>{filters.push(row=>key.split('.').reduce((v,k)=>v?.[k],row)===value);return q},in:(key,values)=>{filters.push(row=>values.includes(row[key]));return q},neq:(key,value)=>{filters.push(row=>row[key]!==value);return q},order:()=>q,limit:()=>q,
 update:value=>{operation='update';payload=value;return q},insert:value=>{operation='insert';payload=value;return q},upsert:(value,options)=>{operation='upsert';payload=value;conflicts=options?.onConflict?.split(',');return q},delete:()=>{operation='delete';return q},
 maybeSingle:async()=>{const result=execute();return {...result,data:result.data?.[0]||null}},single:async()=>{const result=execute();return {...result,data:result.data?.[0]||null}},then:(resolve,reject)=>Promise.resolve().then(execute).then(resolve,reject)}
 return q
}
const db={from:query,rpc:async(name,args)=>{rpcCalls.push({name,args});if(failure==='rpc')return {error:{message:'simulated RPC failure'}};assert.equal(name,'set_school_active_year');for(const row of tables.academic_years)if(row.school_id===args.p_school)row.is_active=row.id===args.p_year;return {error:null}}}
const imports={
 crypto:require('node:crypto'),'@/lib/session':{getSession:async()=>actor},'@/lib/supabase':{createServerClient:()=>db},'@/lib/school-record-scope':guard,
 '@/lib/audit':{logActivity:async()=>{},resolveClassroomSchoolId:async id=>tables.classrooms.find(r=>r.id===id)?.school_id,resolveClassSubjectContext:async id=>({schoolId:tables.classrooms.find(r=>r.id===tables.class_subjects.find(cs=>cs.id===id)?.classroom_id)?.school_id})},
 '@/lib/personal-data-scope':{limitsToOwnSubjects:async()=>false},'@/lib/students-cache':{invalidateClassroomStudents:()=>{},invalidateClassroomStudentsMany:()=>{}},'@/lib/school-calendar-cache':{invalidateSchoolCalendar:()=>{}},
 '@/lib/school-shell':{getSchoolShell:async()=>({education_type:'primary'})},'@/lib/school-education-type':{schoolLevels:()=>['ป.1','ป.2']},'@/lib/class-subject-term':{classSubjectSemesterForLevel:()=>0},
}
const api=compile('app/(shell)/settings/actions.ts',imports),rooms=compile('app/(shell)/classrooms/actions.ts',imports)
let checks=0
async function denied(call,label){const before=writes.length,beforeData=JSON.stringify(tables);const result=await call();assert.ok(result?.error,label);assert.equal(writes.length,before,label+' must not write');assert.equal(JSON.stringify(tables),beforeData,label+' must preserve data');checks++}
async function ok(call,label){const result=await call();assert.ok(result&&typeof result==='object'&&!result.error,label+': '+result?.error);checks++;return result}
;(async()=>{
 await denied(()=>api.saveSchool(null,{name:'Another school'}),'no second tenant via legacy school form')
 await denied(()=>api.updateSchoolActingDirector({acting_director:'Wrong',acting_director_position:'ครู',acting_director_user_id:'tb'}),'foreign acting director')
 await denied(()=>api.saveSchool('a',{membership_kind:'school',member_plan:'school'}),'school form cannot change package')
 await denied(()=>api.saveSchoolLeaders({member_plan:'school'}),'leader form cannot change package')
 await denied(()=>api.saveAcademicYear('yb',{year_be:2571}),'foreign year edit')
 await denied(()=>api.saveAcademicYear(null,{year_be:2571,school_id:'b'}),'foreign year create')
 await denied(()=>api.saveAcademicYear('ya',{id:'yb'}),'year primary key edit')
 await ok(()=>api.saveAcademicYear(null,{year_be:2571}),'create local year');assert.equal(tables.academic_years.at(-1).school_id,'a')
 await ok(()=>api.saveAcademicYear('ya2',{year_be:2572}),'edit local year')
 await denied(()=>api.setActiveAcademicYear('yb','b'),'activate foreign school year')
 await ok(()=>api.setActiveAcademicYear('ya2','a'),'atomic activation');assert.equal(tables.academic_years.find(r=>r.id==='ya').is_active,false);assert.equal(tables.academic_years.find(r=>r.id==='yb').is_active,true)
 failure='rpc';await denied(()=>api.setActiveAcademicYear('ya','a'),'activation failure preserves current year');failure=null
 await denied(()=>api.addHoliday('yb','2026-11-10','Foreign'),'foreign holiday create')
 await denied(()=>api.bulkAddHolidays('yb',[{date:'2026-11-10',name:'Foreign'}]),'foreign holiday import')
 await denied(()=>api.deleteHoliday('hb'),'foreign holiday delete')
 await denied(()=>api.deleteHoliday('missing'),'missing holiday delete')
 await denied(()=>api.deleteWeekendSchoolDay('wb'),'foreign weekend delete')
 failure='holidays';await denied(()=>api.deleteHoliday('ha'),'failed holiday delete reports error and preserves data');failure=null
 await ok(()=>api.addHoliday('ya','2026-11-10','Local'),'local holiday create');await ok(()=>api.deleteHoliday('ha'),'local holiday delete')
 await denied(()=>api.addPermission('tb','ra','sa'),'foreign teacher assignment');await denied(()=>api.addPermission('ta','rb','sa'),'foreign classroom assignment');await denied(()=>api.addPermission('ta','ra','sb'),'foreign subject assignment')
 await denied(()=>api.addPermissions([{teacher_id:'ta',classroom_id:'ra',subject_id:'sb'}]),'foreign batch permission');await denied(()=>api.removePermission('pb'),'foreign permission delete')
 await ok(()=>api.addPermission('ta','ra','sa'),'local permission create');await ok(()=>api.removePermission('pa'),'local permission delete')
 const hours={mon:6,tue:6,wed:6,thu:6,fri:6,sat:0,sun:0}
 await denied(()=>api.savePeriodConfig('rb',hours),'foreign period edit');await denied(()=>api.savePeriodConfig('ra',{...hours,mon:-1}),'invalid period count');await ok(()=>api.savePeriodConfig('ra',hours),'local period edit')
 await denied(()=>api.importStudents('rb',[{first_name:'Wrong'}]),'foreign student import');await denied(()=>api.importStudentsWholeSchool('yb',[{first_name:'Wrong'}]),'foreign school import')
 await denied(()=>api.addClassSubjects('ra','ya',['sb']),'foreign course import');await denied(()=>api.addClassSubjects('ra','ya2',['sa2']),'wrong year course import')
 const added=await ok(()=>api.addClassSubjects('ra','ya',['sa2','sa2']),'deduplicated course import');assert.equal(added.added,1)
 await denied(()=>api.removeClassSubject('csb'),'foreign course delete');await denied(()=>api.removeAllClassSubjects('rb'),'foreign course clear')
 const cfg={class_subject_id:'csa',term:1,unit_count:1,between_scores:[60],midterm_max:20,final_max:20,total_max:100}
 await denied(()=>api.saveScoreConfigs([{...cfg,class_subject_id:'csb'}]),'foreign score config');await denied(()=>api.saveScoreConfigs([{...cfg,term:3}]),'invalid config term');await ok(()=>api.saveScoreConfigs([cfg]),'create local score config');await ok(()=>api.saveScoreConfigs([{...cfg,between_scores:[50],midterm_max:25,final_max:25}]),'edit local score config');assert.equal(tables.score_configs.length,1)
 await denied(()=>api.saveClub('cb',{code:'X',name:'Wrong'}),'foreign club edit');await denied(()=>api.deleteClub('missing'),'missing club delete')
 await denied(()=>api.saveClubAssignments('ya',[{student_id:'stb',club_id:'ca'}]),'foreign student club assignment');await denied(()=>api.saveClubAssignments('ya',[{student_id:'sta',club_id:'cb'}]),'foreign club assignment')
 failure='student_club_assignments';const failedAssignment=await api.saveClubAssignments('ya',[{student_id:'sta',club_id:'ca'}]);assert.ok(failedAssignment.error);assert.equal(failedAssignment.count,0);checks++;failure=null
 await ok(()=>api.saveClubAssignments('ya',[{student_id:'sta',club_id:'ca'}]),'assign local club');await denied(()=>api.deleteClub('ca'),'club with students delete');await ok(()=>api.saveClubAssignments('ya',[{student_id:'sta',club_id:null}]),'clear local club');await ok(()=>api.deleteClub('ca'),'delete unused local club')
 const classroom={level:'ป.1',room:1,academic_year_id:'ya',homeroom_teacher_id:'ta',homeroom_teacher2_id:null}
 await denied(()=>rooms.saveClassroom('rb',classroom),'foreign classroom edit');await denied(()=>rooms.saveClassroom('ra',{...classroom,homeroom_teacher_id:'tb'}),'foreign homeroom teacher');await denied(()=>rooms.saveClassroom('ra',{...classroom,homeroom_teacher2_id:'ta'}),'duplicate homeroom teacher')
 await denied(()=>rooms.deleteClassroom('rb'),'foreign classroom delete');await denied(()=>rooms.deleteClassroom('ra'),'classroom with students delete');await ok(()=>rooms.deleteClassroom('empty'),'delete empty local classroom')
 actor={...actor,role:'teacher'};await denied(()=>api.saveAcademicYear('ya',{year_be:2571}),'teacher cannot edit academic year');await denied(()=>api.deleteHoliday('hb'),'teacher cannot delete holiday')
 actor={...actor,role:'admin',mustChangePassword:true};const beforeForced=writes.length
 await assert.rejects(api.saveAcademicYear('ya',{year_be:2571}),/ไม่มีสิทธิ์/)
 await assert.rejects(rooms.saveClassroom('ra',classroom),/ไม่มีสิทธิ์/)
 assert.equal(writes.length,beforeForced,'Forced password change blocks settings and classroom writes')
 assert.ok(rpcCalls.every(call=>call.args.p_school==='a'))
 console.log(`PASS: ${checks} real CRUD action scenarios, create/edit/delete/import/assign, foreign-school guards, invalid references, duplicate course IDs, occupied deletes, stable activation and preserved data`)
})().catch(error=>{console.error(error);process.exitCode=1})
