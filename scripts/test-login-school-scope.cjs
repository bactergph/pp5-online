const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
let profile={id:'admin',role:'admin',school_id:null,full_name:'Admin',email:'admin@test.com',is_active:true,is_homeroom:false},sessions=[]
const db={from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:profile,error:null}),update:()=>{throw Error('login must not assign school')}};return q}}
const mod={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/actions/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod,Date,require:n=>({
  'next/navigation':{redirect:url=>{throw Error('redirect:'+url)}},
  '@/lib/supabase':{
    supabase:{auth:{signInWithPassword:async()=>({data:{user:{id:'admin',app_metadata:{}}},error:null})}},
    createServerClient:()=>db,
  },
  '@/lib/session':{createSession:async s=>sessions.push(s)},
  'next/headers':{cookies:async()=>({delete:()=>{}})},
  '@/lib/onboarding-complete':{getAdminOnboardingGate:async()=>({complete:false,step:1}),onboardingUrl:()=>'/settings/school'},
})[n]||{}})
const form={get:key=>({email:'admin@test.com',password:'secret',schoolId:'foreign-school'})[key]}
async function run(){
  await assert.rejects(mod.login(undefined,form),/redirect:\/settings\/school/);assert.equal(sessions[0].schoolId,null);assert.equal(profile.school_id,null)
  profile.school_id='my-school';const wrong=await mod.login(undefined,form);assert.match(wrong.error,/ไม่ได้อยู่ในโรงเรียน/);assert.equal(sessions.length,1)
  console.log('PASS: unassigned admin remains unassigned after school-link login; a different school link cannot create a school session')
}
run().catch(e=>{console.error(e);process.exitCode=1})
