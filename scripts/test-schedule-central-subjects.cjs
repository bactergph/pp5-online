const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={}
function load(file,mocks={}){
  const absolute=path.resolve(file)
  if(cache[absolute]&&!Object.keys(mocks).length)return cache[absolute]
  const exports={};if(!Object.keys(mocks).length)cache[absolute]=exports
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,console,require(name){if(name in mocks)return mocks[name];if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(absolute),name+'.ts'));throw Error('Unexpected import '+name)}})
  return exports
}
const api=load('lib/schedule-central-subjects.ts')
const thai={code:'ท11101',name:'ภาษาไทย',subject_group:'ภาษาไทย',type:'พื้นฐาน',hours_per_year:200,sort_order:1}
const math={...thai,code:'ค11101',name:'คณิตศาสตร์',subject_group:'คณิตศาสตร์',hours_per_year:160}
const p2={...thai,code:'ท12101'},secondary={...thai,code:'ท21101'}
const rooms=[{id:'p1a',level:'ป.1',name:'1',room:1},{id:'p1ip',level:'ป.1',name:'IP',room:2},{id:'p2',level:'ป.2',name:'1',room:1},{id:'m1',level:'ม.1',name:'1',room:1}]
const catalog=[thai,math,p2,secondary]
for(let grade=1;grade<=6;grade++)assert.equal(api.primarySubjectGrade(`ท1${grade}101`),grade)
for(const code of ['ท21101','ท31101','ท17101','I20201',''])assert.equal(api.primarySubjectGrade(code),null)
assert.equal(api.primaryRoomGrade('ประถมศึกษาปีที่ 3'),3);assert.equal(api.primaryRoomGrade('ม.1'),null)
for(const [label,grade] of [['ชั้นประถมศึกษาปีที่ ๑',1],['ประถมศึกษา 2',2],['ป.\u200b๓',3],['ประถม 4',4],['ชั้น ป.5',5],['ป 6',6]])assert.equal(api.primaryRoomGrade(label),grade)
for(const label of ['ชั้นมัธยมศึกษาปีที่ ๑','อ.1','1','ป.7'])assert.equal(api.primaryRoomGrade(label),null)
assert.equal(api.centralSubjectPeriods(thai),5);assert.equal(api.centralSubjectPeriods(math),4)
assert.ok(api.centralSubjectProblem({...thai,hours_per_year:0}));assert.ok(api.centralSubjectProblem({...thai,subject_group:'กิจกรรม'}))
const preview=api.prepareCentralSubjects(catalog,rooms,rooms.map(room=>room.id),catalog.map(s=>s.code),[{classroomId:'p1a',code:'ท11101'}],[['ป.1/IP','ค11101','ชื่อที่ครูแก้ไว้','7','คณิตศาสตร์','พื้นฐาน']])
assert.equal(preview.rows.length,3);assert.equal(preview.skipped,2)
assert.equal(preview.rows.find(row=>row[0]==='ป.1/IP'&&row[1]==='ท11101')[3],'5')
assert.ok(!preview.rows.some(row=>row[0].startsWith('ม.')||row[1]==='ท21101'))
assert.equal(api.prepareCentralSubjects(catalog,rooms,[],catalog.map(s=>s.code),[],[]).rows.length,0)
assert.equal(api.prepareCentralSubjects([thai,thai],rooms,['p1a'],[thai.code],[],[]).rows.length,1)
assert.equal(api.prepareCentralSubjects([thai],rooms,['p1a'],[thai.code],[],Array.from({length:2000},()=>['ป.2/1','ค12101','คณิต','4','คณิตศาสตร์','พื้นฐาน'])).overLimit,true)
const sixGrades=Array.from({length:6},(_,i)=>({...thai,code:`ท1${i+1}101`,hours_per_year:(i+1)*40}))
const twelveRooms=Array.from({length:6},(_,i)=>[1,2].map(room=>({id:`g${i+1}r${room}`,level:`ป.${i+1}`,name:String(room),room}))).flat()
const wholePrimary=api.prepareCentralSubjects(sixGrades,twelveRooms,twelveRooms.map(room=>room.id),sixGrades.map(subject=>subject.code),[],[])
assert.equal(wholePrimary.rows.length,12)
for(const row of wholePrimary.rows){assert.equal(row[0].slice(2,3),row[1].slice(2,3));assert.equal(row[3],row[0].slice(2,3))}

async function run(){
  let session=null,created=0,identityFlag=false,fail=false,offsets=[]
  const catalogAction=load('app/schedules/catalog-actions.ts',{
    '@/lib/session':{getSession:async flag=>{identityFlag=flag;return session}},
    '@/lib/schedule-action-result':{scheduleResult:async work=>{try{return {data:await work(),error:null}}catch(e){return {data:null,error:e.message}}}},
    '@/lib/supabase':{createServerClient:()=>{created++;return {from(table){assert.equal(table,'global_subjects');const query={select(fields){assert.equal(fields,'code,name,subject_group,type,hours_per_year,sort_order');return query},eq(key,value){assert.equal(key,'is_active');assert.equal(value,true);return query},like(key,value){assert.equal(key,'code');assert.equal(value,'_1%');return query},order(key){assert.equal(key,'code');return query},async range(from,to){offsets.push(from);assert.equal(to,from+499);return fail?{error:{message:'private diagnostic'},data:null}:{error:null,data:from===0?Array.from({length:500},(_,i)=>({...thai,code:`ท11${String(i).padStart(3,'0')}`})):[p2,secondary]}}};return query}}}},
  })
  assert.ok((await catalogAction.fetchPrimaryScheduleSubjects()).error);assert.equal(created,0,'Anonymous requests never read the database')
  session={userId:'free-user',role:'teacher',schoolId:null};const result=await catalogAction.fetchPrimaryScheduleSubjects()
  assert.equal(result.error,null);assert.equal(identityFlag,true,'Free membership can read shared reference data')
  assert.equal(result.data.length,501);assert.equal(offsets.join(','),'0,500');assert.ok(!result.data.some(s=>s.code==='ท21101'))
  session.mustChangePassword=true;const before=created;assert.ok((await catalogAction.fetchPrimaryScheduleSubjects()).error);assert.equal(created,before)
  session.mustChangePassword=false;fail=true;assert.equal((await catalogAction.fetchPrimaryScheduleSubjects()).error,'โหลดโครงสร้างรายวิชากลางไม่สำเร็จ กรุณาลองอีกครั้ง')
  console.log('PASS: primary grade matching, annual hours, multi-room staging, existing/pending duplicate protection, row limit, signed-in Free access, inactive/password guard, paginated read-only catalog and safe errors')
}
run().catch(error=>{console.error(error);process.exitCode=1})
