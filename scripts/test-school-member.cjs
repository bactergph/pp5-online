const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
let src={id:'catalog',name:'โรงเรียนตัวอย่าง',province:'ทดสอบ',is_catalog:true,director_name:'Not copied',moe_school_id:'Not copied'},created=[],readError=null,collision=false,insertError=null
const db={from:()=>{
  let payload
  const q={select:()=>q,eq:()=>q,insert:value=>{payload=value;return q},maybeSingle:async()=>({data:src,error:readError}),single:async()=>{
    assert.ok(!('moe_school_id' in payload));assert.ok(!('director_name' in payload));assert.ok(!('google_drive_refresh_token' in payload))
    if(collision){collision=false;return {data:null,error:{code:'23505',message:'schools_member_code_uidx'}}}
    if(insertError)return {data:null,error:insertError}
    const row={id:'new-'+created.length,...payload};created.push(row);return {data:row,error:null}
  }};return q
}}
const mod={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/school-member.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod,require:n=>({'server-only':{},'@/lib/supabase':{createServerClient:()=>db}})[n]})
async function run(){
  const first=await mod.createMemberSchoolFromCatalog('catalog');const second=await mod.createMemberSchoolFromCatalog('catalog')
  assert.notEqual(first.id,src.id);assert.notEqual(first.id,second.id);assert.equal(created[0].is_catalog,false);assert.match(first.member_code,/^MS-/);assert.equal(created[0].province,'ทดสอบ')
  src={id:'member',name:'สมาชิกเดิม',is_catalog:false,member_code:'MS-EXIST'};await assert.rejects(mod.createMemberSchoolFromCatalog('member'),/บัญชีอื่น/);assert.equal(created.length,2);assert.equal((await mod.resolveMemberSchoolId('member')).id,'member')
  src={id:'catalog',name:'โรงเรียน',is_catalog:true};collision=true;await mod.createMemberSchoolFromCatalog('catalog');assert.equal(created.length,3)
  insertError={code:'PGRST204',message:"Could not find 'member_code' column"};await assert.rejects(mod.createMemberSchoolFromCatalog('catalog'),/044_member_schools/);assert.equal(created.length,3);insertError=null
  readError={message:'is_catalog missing'};await assert.rejects(mod.createMemberSchoolFromCatalog('catalog'),/044_member_schools/)
  console.log('PASS: catalog cloning without ministry/optional columns, isolated member IDs, no copied private settings, existing-member onboarding rejection, district resolution and safe schema/collision handling')
}
run().catch(e=>{console.error(e);process.exitCode=1})
