// Synthetic fixtures only: exercise the actual server helper/actions with no network.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),path=require('node:path')
function load(file,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require(name){if(name in deps)return deps[name];if(name.startsWith('./'))return load(path.resolve(path.dirname(file),name+'.ts'),deps);throw Error(name)}});return exports}
const membership=load('lib/membership.ts',{})
let plan={kind:'individual',plan:'pro_plus'},owner='owner',rooms=[],readError=null,session={schoolId:'school',userId:'owner',role:'admin'},rpcCalls=[]
const db={from(table){const filters={};return{select(){return this},eq(k,v){filters[k]=v;return this},order(){return this},maybeSingle(){return Promise.resolve(table==='schools'?{data:{membership_owner_id:owner}}:{data:null})},then(resolve,reject){const data=table==='personal_homeroom_rooms'?rooms:table==='academic_years'?[{id:'year',year_be:2569,is_active:true}]:[{id:'room',level:'ม.1',room:1,academic_year_id:'year'}];return Promise.resolve({data,error:readError}).then(resolve,reject)}}},async rpc(name,args){rpcCalls.push({name,args});return{error:null}}}
const deps={'server-only':{},react:{cache:fn=>fn},'@/lib/supabase':{createServerClient:()=>db},'@/lib/member-plan':{readMembership:async()=>plan},'@/lib/membership':membership,'@/lib/session':{getSession:async()=>session}}
const scope=load('lib/personal-data-scope.ts',deps),api=load('app/(shell)/classroom-admin/personal-actions.ts',deps)
;(async()=>{
 assert.equal(membership.personalHomeroomLimit({kind:'individual',plan:'pro'}),1)
 assert.equal(membership.personalHomeroomLimit(plan),3)
 assert.equal(membership.personalHomeroomLimit({kind:'school'}),null)
 assert.equal(membership.personalHomeroomLimit({kind:'individual',plan:'free'}),0)
 rooms=[{classroom_id:'a',academic_year_id:'year'},{classroom_id:'b',academic_year_id:'year'},{classroom_id:'c',academic_year_id:'year'},{classroom_id:'old',academic_year_id:'old-year'}]
 assert.deepEqual(Array.from(await scope.personalHomeroomIds(session,'year')),['a','b','c'])
 await scope.assertPersonalHomeroom(session,'c','year')
 await assert.rejects(scope.assertPersonalHomeroom(session,'d','year'),/เฉพาะห้อง/)
 await assert.rejects(scope.assertPersonalHomeroom(session,'old','year'),/เฉพาะห้อง/)
 plan={kind:'individual',plan:'pro'};await assert.rejects(scope.personalHomeroomIds(session,'year'),/1 ห้อง/)
 assert.deepEqual(Array.from(await scope.personalHomeroomIds(session,'old-year')),['old'])
 owner='someone-else';await assert.rejects(scope.isPersonalSubjectAccess(session),/เจ้าของ/);owner='owner'
 readError={message:'missing SQL'};await assert.rejects(scope.personalHomeroomIds(session),/087/);readError=null
 plan={kind:'school'};assert.equal(await scope.isPersonalSubjectAccess(session),false);assert.equal(await scope.personalHomeroomIds(session),null);assert.equal(await api.fetchPersonalHomeroomSettings(),null)
 await scope.assertPersonalHomeroom(session,'arbitrary')
 plan={kind:'individual',plan:'free'};await assert.rejects(scope.personalHomeroomIds(session),/สมาชิกฟรี/)
 assert.equal(await scope.personalHomeroomIds({...session,role:'district'}),null)
 plan={kind:'individual',plan:'pro_plus'}
 assert.equal((await api.fetchPersonalHomeroomSettings()).limit,3)
 assert.equal((await api.savePersonalHomeroomSettings('year',['a','b','c'])).error,null)
 assert.equal(rpcCalls[0].name,'set_personal_homeroom_rooms');assert.equal(rpcCalls[0].args.p_actor,'owner');assert.equal(rpcCalls[0].args.p_school,'school')
 assert.match((await api.savePersonalHomeroomSettings('year',['a','b','c','d'])).error,/3 ห้อง/)
 assert.match((await api.savePersonalHomeroomSettings('year',['a','a'])).error,/3 ห้อง/)
 assert.equal(rpcCalls.length,1)
 plan={kind:'individual',plan:'pro'};assert.match((await api.savePersonalHomeroomSettings('year',['a','b'])).error,/1 ห้อง/)
 session={...session,mustChangePassword:true};assert.match((await api.savePersonalHomeroomSettings('year',['a'])).error,/เข้าสู่ระบบ/)
 session=null;await assert.rejects(api.fetchPersonalHomeroomSettings(),/เข้าสู่ระบบ/)
 console.log('PASS: actual personal scope helper/actions, Pro 1/Plus 3, owner/year checks, downgrade, missing SQL fail-closed, School/district unchanged, RPC session identity and input validation')
})().catch(error=>{console.error(error);process.exitCode=1})
