const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
let users=[],authUsers=new Map(),session={userId:'admin',schoolId:'school',role:'admin'},quota=15,failProfile=false,failAuth=false
function query() {
  const filters=[];let patch=null,countOnly=false
  const q={
    select:(_fields,options)=>{countOnly=!!options?.head;return q},
    eq:(key,value)=>{filters.push(r=>r[key]===value);return q},
    neq:(key,value)=>{filters.push(r=>r[key]!==value);return q},
    update:value=>{patch=value;return q},
    upsert:async value=>{if(failProfile)return {error:{message:'profile failure'}};users.push({...value});return {error:null}},
    maybeSingle:async()=>{const found=users.find(r=>filters.every(f=>f(r)));return {data:found?{...found}:null,error:null}},
    then:(resolve,reject)=>Promise.resolve().then(()=>{
      const found=users.filter(r=>filters.every(f=>f(r)))
      if(patch)found.forEach(r=>Object.assign(r,patch))
      return {count:countOnly?found.length:null,error:null}
    }).then(resolve,reject),
  };return q
}
const db={from:()=>query(),auth:{admin:{
  getUserById:async()=>({data:{user:{app_metadata:{user_quota:quota}}},error:null}),
  createUser:async value=>{const id='u'+authUsers.size;authUsers.set(id,value);return {data:{user:{id}},error:null}},
  updateUserById:async(id,value)=>{if(failAuth)return {error:{message:'auth failure'}};authUsers.set(id,{...authUsers.get(id),...value});return {error:null}},
  deleteUser:async id=>{authUsers.delete(id);users=users.filter(u=>u.id!==id);return {error:null}},
}}}
const exportsObject={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/staff-table.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,require:name=>({
  'server-only':{},crypto:require('node:crypto'),'@/lib/supabase':{createServerClient:()=>db},'@/lib/session':{getSession:async()=>session},'@/lib/schoolAuth':{schoolMemberEmail:(u,s)=>`${u}@${s}.pp5.local`},'@/lib/school-leaders':{syncUserRoleToSchoolLeaders:async()=>{}},'@/lib/audit':{logActivity:async()=>{}},
})[name]})
const row=(overrides={})=>({key:'r',prefix:'นาย',full_name:'สมชาย ใจดี',position:'ครู',role:'',username:'',password:'',is_homeroom:false,...overrides})
async function run(){
  const [draft]=await exportsObject.saveStaffRows([row()]);assert.ok(draft.id);assert.equal(users[0].is_active,false);assert.equal(users[0].username,null);assert.match(users[0].email,/^pending-/);assert.ok(authUsers.get(draft.id).password.length>32)
  assert.equal(authUsers.get(draft.id).app_metadata.staff_role_pending,true)
  const [roleOnly]=await exportsObject.saveStaffRows([row({id:draft.id,role:'academic_head'})]);assert.equal(roleOnly.error,undefined);assert.equal(users[0].is_active,false);assert.equal(authUsers.get(draft.id).app_metadata.staff_role_pending,false)
  const [ready]=await exportsObject.saveStaffRows([row({id:draft.id,role:'teacher',username:'somchai',password:'secret123'})]);assert.equal(ready.error,undefined);assert.equal(users[0].is_active,true);assert.equal(users[0].username,'somchai');assert.equal(authUsers.get(draft.id).email,'somchai@school.pp5.local');assert.equal(authUsers.size,1)
  const [update]=await exportsObject.saveStaffRows([row({id:draft.id,full_name:'แก้ชื่อ',role:'academic_head',username:'somchai'})]);assert.equal(update.error,undefined);assert.equal(users[0].full_name,'แก้ชื่อ');assert.equal(authUsers.get(draft.id).password,'secret123')
  const results=await exportsObject.saveStaffRows([row({key:'bad',username:'somchai',password:'123456',role:'teacher'}),row({key:'good',full_name:'อีกคน'})]);assert.match(results[0].error,/ถูกใช้/);assert.ok(results[1].id);assert.equal(authUsers.size,2)
  users.push({id:'foreign',school_id:'other',role:'teacher'});const [foreign]=await exportsObject.saveStaffRows([row({id:'foreign'})]);assert.match(foreign.error,/โรงเรียนนี้/)
  const [elevate]=await exportsObject.saveStaffRows([row({role:'district'})]);assert.match(elevate.error,/บทบาท/)
  failAuth=true;const [failed]=await exportsObject.saveStaffRows([row({id:draft.id,username:'newname',role:'teacher',password:'changed123'})]);assert.match(failed.error,/auth failure/);assert.equal(users[0].username,'somchai');assert.equal(users[0].role,'academic_head');failAuth=false
  failProfile=true;const before=authUsers.size;const [rollback]=await exportsObject.saveStaffRows([row()]);assert.match(rollback.error,/profile failure/);assert.equal(authUsers.size,before);failProfile=false
  quota=1;const [over]=await exportsObject.saveStaffRows([row()]);assert.match(over.error,/โควต้า/)
  session.role='teacher';await assert.rejects(exportsObject.saveStaffRows([row()]),/สิทธิ์/)
  console.log('PASS: deferred credentials, activation, batch profile editing, unchanged password, partial failures, duplicate prevention, school/role authorization, quota and compensation')
}
run().catch(e=>{console.error(e);process.exitCode=1})
