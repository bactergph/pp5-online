const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
let allowed=true,users=[{id:'a',role:'admin',is_active:false,school_id:'s',full_name:'A'},{id:'b',role:'admin',is_active:true,school_id:'s',full_name:'B'},{id:'c',role:'teacher',is_active:false,school_id:'s',full_name:'C'},{id:'d',role:'admin',is_active:false,school_id:null,full_name:'D'},{id:'e',role:'admin',is_active:false,school_id:'fail',full_name:'E'}],seeds=[],logs=[]
const db={from:()=>{
  const filters=[];let patch
  const q={select:()=>q,in:(k,vals)=>{filters.push(r=>vals.includes(r[k]));return q},eq:(k,v)=>{filters.push(r=>r[k]===v);return q},update:v=>{patch=v;return q},then:(resolve,reject)=>Promise.resolve().then(()=>{const found=users.filter(r=>filters.every(f=>f(r)));if(patch)found.forEach(r=>Object.assign(r,patch));return {data:found.map(r=>({...r})),error:null}}).then(resolve,reject)};return q
}}
const mod={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/approve-admins.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod,require:n=>({'server-only':{},'@/lib/district':{requireDistrict:async()=>{if(!allowed)throw Error('denied');return {role:'district'}}},'@/lib/supabase':{createServerClient:()=>db},'@/lib/evaluation-settings-seed':{seedEvaluationSettingsForSchool:async s=>{seeds.push(s);return {error:s==='fail'?'seed failed':null}}},'@/lib/audit':{logActivity:async a=>logs.push(a)}})[n]})
async function run(){
  const r=await mod.approveSelectedAdmins(['a','a','b','c','d','e','missing'])
  assert.deepEqual(Array.from(r.approved),['a']);assert.deepEqual(Array.from(r.skipped),['b']);assert.equal(r.failed.length,4)
  assert.equal(users[0].is_active,true);assert.equal(users[2].is_active,false);assert.equal(users[3].is_active,false);assert.equal(users[4].is_active,false);assert.equal(logs.length,1);assert.deepEqual(seeds,['s','fail'])
  const retry=await mod.approveSelectedAdmins(['a']);assert.equal(retry.approved.length,0);assert.equal(retry.skipped.length,1);assert.equal(logs.length,1)
  await assert.rejects(mod.approveSelectedAdmins([]),/1–200/);allowed=false;await assert.rejects(mod.approveSelectedAdmins(['a']),/denied/)
  console.log('PASS: approval authorization, deduplication, active-account skipping, admin-only scope, missing school, seed failure, per-item results and idempotent retries')
}
run().catch(e=>{console.error(e);process.exitCode=1})
