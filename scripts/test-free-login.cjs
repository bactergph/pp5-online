// Exercise the real login action with synthetic Auth, database and cookies.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict')
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
function load(file, dependencies) {
  const exports = {}
  vm.runInNewContext(transpile(file), {exports,require:name => {
    if (!(name in dependencies)) throw Error('Unexpected dependency: ' + name)
    return dependencies[name]
  },Date,String,Boolean,Promise,FormData})
  return exports
}
const entitlement = load('lib/free-schedule-entitlement.ts', {})
const membership = load('lib/membership.ts', {'./free-schedule-entitlement':entitlement})
async function run({plan='free',role='admin',active=true,changePassword=false,valid=true,wrongSchool=false}={}) {
  let session = null, reads = 0
  const profile = {id:'synthetic-user',role,school_id:'synthetic-school',email:'test@example.test',full_name:'สมาชิกทดสอบ',is_active:active,must_change_password:changePassword}
  const query = table => ({select(){return this},eq(){return this},async single(){return {data:profile}},async maybeSingle(){return {data:table==='schools'?{code:'example'}:profile}}})
  const auth = load('lib/actions/auth.ts', {
    'next/navigation':{redirect:href=>{throw Error('REDIRECT:' + href)}},
    '@/lib/supabase':{supabase:{auth:{signInWithPassword:async()=>({data:{user:valid?{id:profile.id,app_metadata:{}}:null},error:valid?null:Error('invalid')})}},createServerClient:()=>({from:query})},
    '@/lib/session':{createSession:async value=>{session=value}},
    '@/lib/member-plan':{readMembership:async()=>{reads++;return membership.membershipFromRow({membership_kind:plan==='school'?'school':'individual',member_plan:plan==='school'?null:plan==='expired'?'pro':plan,membership_started_on:plan==='expired'?'2020-01-01':'2026-01-01',membership_expires_on:plan==='expired'?'2020-12-31':'2099-12-31'},'2026-10-25')}},
    '@/lib/membership':membership,
    'next/headers':{cookies:async()=>({delete(){}})},
    '@/lib/onboarding-complete':{getAdminOnboardingGate:async()=>({complete:true})},
    '@/lib/school-path':{schoolDashboardPath:code=>'/'+code+'/dashboard'},
  })
  const form = new FormData(); form.set('email',profile.email);form.set('password','synthetic-password')
  if(wrongSchool)form.set('schoolId','other-school')
  let result
  try{result=await auth.login(undefined,form)}catch(error){result=error.message}
  return {result,session,reads}
}
;(async()=>{
  for(const role of ['admin','teacher']){
    const free=await run({role});assert.equal(free.result,'REDIRECT:/schedules/device/manage?welcome=1');assert.equal(free.session.role,role)
  }
  for(const plan of ['pro','pro_plus','school']){const paid=await run({plan});assert.equal(paid.result,'REDIRECT:/example/dashboard');assert.ok(paid.session)}
  const expired=await run({plan:'expired'});assert.equal(expired.result,'REDIRECT:/schedules/device/manage?welcome=1')
  const password=await run({changePassword:true});assert.equal(password.result,'REDIRECT:/auth/change-password');assert.equal(password.reads,0)
  const district=await run({role:'district'});assert.equal(district.result,'REDIRECT:/dashboard');assert.equal(district.reads,0)
  for(const options of [{valid:false},{active:false},{wrongSchool:true}]){const rejected=await run(options);assert.ok(rejected.result.error);assert.equal(rejected.session,null);assert.equal(rejected.reads,0)}
  console.log('PASS: authenticated Free login opens packages, paid login stays unchanged, password change takes priority, invalid and inactive accounts receive no session')
})().catch(error=>{console.error(error);process.exitCode=1})
