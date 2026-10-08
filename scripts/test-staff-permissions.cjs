const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
function load(path,requireFn){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:requireFn,TextEncoder,Date,process:{env:{SESSION_SECRET:'test-secret'}}});return exports}
const perms=load('lib/staff-permissions.ts',()=>({}))
let actor={userId:'owner',role:'admin',schoolId:null},writes=0,authWrites=0,filtersRead=[]
let users=[{id:'owner',role:'admin',school_id:'school',is_active:true,full_name:'Owner',email:'owner@test.com'},{id:'local',role:'teacher',school_id:'school',full_name:'Local',email:'local@test.com'},{id:'foreign',role:'teacher',school_id:'other',full_name:'Foreign'},{id:'district',role:'district',school_id:'school',full_name:'District'}]
function query(table){const filters=[];let mutation=false;const q={select:()=>q,order:()=>q,eq:(k,v)=>{filters.push(r=>r[k]===v);filtersRead.push([k,v]);return q},neq:(k,v)=>{filters.push(r=>r[k]!==v);return q},update:()=>{mutation=true;return q},delete:()=>{mutation=true;return q},maybeSingle:async()=>({data:users.find(r=>filters.every(f=>f(r)))||null,error:null}),single:async()=>({data:users.find(r=>filters.every(f=>f(r)))||null,error:null}),then:(resolve,reject)=>Promise.resolve().then(()=>{if(mutation)writes++;return {data:table==='users'?users.filter(r=>filters.every(f=>f(r))):[],error:null}}).then(resolve,reject)};return q}
const db={from:query,auth:{admin:{updateUserById:async()=>{authWrites++;return {error:null}},deleteUser:async()=>{authWrites++;return {error:null}}}}}
const actions=load('app/(shell)/settings/actions.ts',n=>({
  crypto:require('node:crypto'),'@/lib/session':{getSession:async()=>actor},'@/lib/supabase':{createServerClient:()=>db},'@/lib/staff-permissions':perms,'@/lib/school-leaders':{syncUserRoleToSchoolLeaders:async()=>{},clearUserFromLeaderSlots:async()=>{}},'@/lib/audit':{logActivity:async()=>{}},'@/lib/school-temp-password':{SCHOOL_TEMP_PASSWORD:'temporary'},
})[n]||{})
async function run(){
  const empty=await actions.fetchSchoolUsers();assert.equal(empty.users.length,0);assert.equal(empty.canManage,false);assert.equal(filtersRead.length,0)
  for(const call of [()=>actions.updateUser('foreign',{full_name:'Changed'}),()=>actions.toggleUserActive('foreign',true),()=>actions.deleteSchoolUser('foreign'),()=>actions.resetTeacherPassword('foreign')]) await assert.rejects(call,/กำหนดโรงเรียน/)
  assert.equal(writes,0);assert.equal(authWrites,0)
  actor.schoolId='school';const scoped=await actions.fetchSchoolUsers();assert.equal(scoped.users.length,2);assert.ok(scoped.users.every(u=>u.id==='local'||u.id==='owner'));assert.ok(filtersRead.some(([k,v])=>k==='school_id'&&v==='school'))
  for(const call of [()=>actions.updateUser('foreign',{full_name:'Changed'}),()=>actions.toggleUserActive('foreign',true),()=>actions.deleteSchoolUser('foreign'),()=>actions.resetTeacherPassword('foreign'),()=>actions.updateUser('district',{role:'teacher'}),()=>actions.updateUser('local',{school_id:'other'}),()=>actions.updateUser('local',{role:'district'}),()=>actions.toggleUserActive('owner',false)]) assert.ok((await call()).error)
  assert.equal(writes,0);assert.equal(authWrites,0)
  const local=await actions.updateUser('local',{full_name:'Changed',role:'teacher'});assert.equal(local.error,undefined);assert.equal(writes,1)
  actor.role='teacher';assert.ok((await actions.resetTeacherPassword('local')).error);assert.equal(authWrites,0)
  actor.role='district';actor.schoolId=null;assert.equal((await actions.fetchSchoolUsers()).users.length,0);await assert.rejects(()=>actions.deleteSchoolUser('foreign'),/กำหนดโรงเรียน/)
  actor.schoolId='school';assert.ok((await actions.resetTeacherPassword('foreign')).error);assert.ok((await actions.resetTeacherPassword('district')).error)
  let jwt={userId:'owner',role:'district',schoolId:'other',email:'old',fullName:'Old',expiresAt:new Date()},profile={...users[0],role:'teacher',school_id:'school',is_homeroom:true,must_change_password:false},missingColumn=false
  const sessionDb={from:()=>{let columns='';const q={select:s=>{columns=s;return q},eq:()=>q,maybeSingle:async()=>missingColumn&&columns.includes('must_change_password')?{error:{message:'must_change_password missing'},data:null}:{error:null,data:profile}};return q}}
  const sessionModule=load('lib/session.ts',n=>({'server-only':{},react:{cache:f=>f},jose:{jwtVerify:async()=>({payload:jwt})},'next/headers':{cookies:async()=>({get:()=>({value:'signed'})})},'@/lib/supabase':{createServerClient:()=>sessionDb}})[n]||{})
  const fresh=await sessionModule.getSession();assert.equal(fresh.role,'teacher');assert.equal(fresh.schoolId,'school');assert.equal(fresh.fullName,'Owner')
  profile.is_active=false;assert.equal(await sessionModule.getSession(),null);profile.is_active=true;profile.school_id=null;assert.equal((await sessionModule.getSession()).schoolId,null)
  profile.must_change_password=true;assert.equal((await sessionModule.getSession()).mustChangePassword,true);profile=null;assert.equal(await sessionModule.getSession(),null)
  console.log('PASS: no-school reads and writes blocked, tenant-scoped reads, foreign/district targets blocked, payload allowlist, valid local edits, live role/school/status refresh and deleted-account rejection')
}
run().catch(e=>{console.error(e);process.exitCode=1})
