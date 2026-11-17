const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),pure=require('./helpers/load-pure-ts.cjs')
function compile(file,dependencies){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,console:{error(){}},require:name=>dependencies[name]||{} });return exports}
let rpcError=null,writes=[],session={schoolId:'school',role:'admin'}
const profiles=pure('lib/schedule-period-profiles.ts'),helpers=pure('lib/schedule-helpers.ts')
const extended=compile('app/(shell)/schedules/extended-actions.ts',{
  '@/lib/schedule-period-profiles':profiles,
  '@/lib/session':{getSession:async()=>session},
  '@/lib/supabase':{createServerClient:()=>({rpc:async(name,args)=>{writes.push({name,args});return {error:rpcError}}})},
  '@/lib/audit':{logActivity:async()=>{}},
  '@/lib/schedules':{SCHEDULE_VIEW_ROLES:['admin','teacher'],SCHEDULE_EDIT_ROLES:['admin']},
})
const result=compile('lib/schedule-action-result.ts',{})
const actions=compile('app/(shell)/schedules/actions.ts',{'@/lib/schedule-action-result':result,'./extended-actions':extended})
;(async()=>{
  const raw=structuredClone(helpers.DEFAULT_PERIOD_TIMES).map(row=>({...row,profiles:null}))
  raw[0].profiles={kindergarten:structuredClone(helpers.DEFAULT_PERIOD_TIMES)}
  let saved=await actions.savePeriodTimes(raw)
  assert.equal(saved.ok,true);assert.equal(saved.error,null)
  assert.equal(writes[0].name,'save_school_period_times');assert.equal(writes[0].args.p_school_id,'school')
  assert.equal(writes[0].args.p_rows.slice(1).some(row=>'profiles' in row),false)
  rpcError={message:'คาบอยู่นอกเวลาเรียนของระดับชั้น'}
  saved=await actions.savePeriodTimes(raw)
  assert.equal(saved.ok,false);assert.equal(saved.error,rpcError.message,'Expected Thai validation survives Server Action serialization')
  rpcError={message:'internal SQL diagnostic'};saved=await actions.savePeriodTimes(raw)
  assert.equal(saved.ok,false);assert.ok(!saved.error.includes('internal SQL'))
  const count=writes.length;session=null;saved=await actions.savePeriodTimes(raw)
  assert.equal(saved.ok,false);assert.equal(writes.length,count)
  session={schoolId:'school',role:'teacher'};saved=await actions.savePeriodTimes(raw)
  assert.equal(saved.ok,false);assert.equal(writes.length,count)
  console.log('PASS: actual server action cleans DB clock rows, returns readable validation failures, hides internal diagnostics and rejects unauthorized saves')
})().catch(error=>{console.error(error);process.exitCode=1})
