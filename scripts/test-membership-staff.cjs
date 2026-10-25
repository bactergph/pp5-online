/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict')
let membership={kind:'school'},session={role:'admin',userId:'owner',schoolId:'school'},created=0,deleted=0,profileFails=false
const api={},db={auth:{admin:{createUser:async()=>{created++;return{data:{user:{id:'new-user'}},error:null}},deleteUser:async()=>{deleted++;return{error:null}},getUserById:async()=>{throw Error('Obsolete quota lookup should not run')}}},from:()=>({upsert:async()=>({error:profileFails?{message:'profile failed'}:null})})}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/users/create/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api,require:name=>({'next/server':{NextResponse:{json:(data,options)=>({data,status:options?.status||200})}},'@/lib/session':{getSession:async()=>session},'@/lib/supabase':{createServerClient:()=>db},'@/lib/staff-permissions':{staffAccessError:actor=>actor.role!=='admin'||actor.mustChangePassword?'denied':null},'@/lib/member-plan':{readMembership:async()=>membership},'@/lib/staff-table':{},'@/lib/schoolAuth':{},'@/lib/audit':{logActivity:async()=>{}},'@/lib/school-leaders':{syncUserRoleToSchoolLeaders:async()=>{}}}[name]||{})})
const send=()=>api.POST({json:async()=>({email:'teacher@example.test',password:'secret123',full_name:'ครูทดสอบ',prefix:'นาย',position:'ครู',role:'teacher'})})
;(async()=>{
 assert.equal((await send()).status,200);assert.equal(created,1)
 membership={kind:'individual',plan:'pro'};assert.match((await send()).data.error,/1 บัญชี/);assert.equal(created,1)
 membership={kind:'individual',plan:'pro_plus'};assert.match((await send()).data.error,/1 บัญชี/);assert.equal(created,1)
 membership={kind:'school'};profileFails=true;assert.equal((await send()).status,400);assert.equal(deleted,1,'Failed profile creation rolls back the newly-created Auth identity')
 session=null;assert.equal((await send()).status,403);session={role:'teacher',userId:'teacher',schoolId:'school'};assert.equal((await send()).status,403)
 console.log('PASS: School personnel API has no obsolete 15-user cap, personal Pro/Plus reject extra logins before Auth creation, and profile failures compensate Auth')
})().catch(error=>{console.error(error);process.exitCode=1})
