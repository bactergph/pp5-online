const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const mod={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/school-settings-boot.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod})
async function run(){
  let reads=0
  const protectedRead=async()=>{reads++;throw Error('school required')}
  const first=await mod.loadSchoolSettings(async()=>null,protectedRead,protectedRead);assert.equal(first.data,null);assert.equal(first.staff.length,0);assert.equal(reads,0)
  const existing=await mod.loadSchoolSettings(async()=>({id:'school'}),async()=>({math:'Teacher'}),async()=>[{id:'staff'}]);assert.equal(existing.data.id,'school');assert.equal(existing.heads.math,'Teacher');assert.equal(existing.staff.length,1)
  await assert.rejects(mod.loadSchoolSettings(async()=>{throw Error('school failed')},protectedRead,protectedRead),/school failed/);assert.equal(reads,0)
  await assert.rejects(mod.loadSchoolSettings(async()=>({id:'school'}),protectedRead,async()=>[]),/school required/)
  console.log('PASS: unassigned onboarding skips protected resources; existing membership loads them; failures propagate for recovery instead of permanent loading')
}
run().catch(e=>{console.error(e);process.exitCode=1})
