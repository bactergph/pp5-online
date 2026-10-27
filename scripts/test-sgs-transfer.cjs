/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const core=require('../extensions/jarnsek-sgs/core.js')
const packet={format:core.FORMAT,version:1,context:{yearBe:2569,term:2,classroom:'ม.1/1',subjectCode:'ท21102',subjectName:'ภาษาไทย 2'},columns:[{key:'unit_1',label:'ระหว่างเรียน 1',max:20},{key:'final',label:'ปลายภาค',max:30}],students:[{studentCode:'00101',name:'นักเรียน ก',values:[0,15.5]},{studentCode:'00102',name:'นักเรียน ข',values:[12,null]}]}
const target=(studentCode,a='',b='')=>({studentCode,cells:[{label:'S1',value:a,editable:true,max:20},{label:'ปลายภาค',value:b,editable:true,max:30}]})
let targets=[target('00102'),target('00101')]
let plan=core.planPacket(packet,targets,[0,1]);assert.equal(plan.issueCount,0);assert.deepEqual(plan.changes.map(c=>[c.studentCode,c.row,c.column,c.value]),[['00101',1,0,0],['00101',1,1,15.5],['00102',0,0,12]])
assert.equal(core.planPacket(packet,[target('101'),target('102')],[0,1]).issueCount,2,'Leading zero identifiers must never be silently discarded')
assert.throws(()=>core.planPacket(packet,[target('00101'),target('00101')],[0,1]),/ซ้ำ/)
assert.throws(()=>core.planPacket(packet,targets,[0,0]),/สองคอลัมน์/)
assert.throws(()=>core.planPacket(packet,targets,[-1,-1]),/อย่างน้อย/)
assert.throws(()=>core.parsePacket({...packet,students:[packet.students[0],packet.students[0]]}),/ซ้ำ/)
assert.throws(()=>core.parsePacket({...packet,students:[{...packet.students[0],values:[21,0]}]}),/0–20/)
assert.throws(()=>core.parsePacket({...packet,students:[{...packet.students[0],values:[NaN,0]}]}),/0–20/)
assert.equal(core.studentCode('๐๐๑๐๑'),'00101')
assert.equal(core.planPacket(packet,[target('00101','9'),target('00102')],[0,1]).issueCount,1)
assert.equal(core.planPacket(packet,[target('00101','9'),target('00102')],[0,1],true).issueCount,0)
assert.equal(core.planPacket(packet,[target('00101','0','15.50'),target('00102','12','28')],[0,1]).changes.length,0,'Equal scores and blank source cells must remain untouched')
targets=[target('00101'),target('00102')];targets[0].cells[0].editable=false;assert.equal(core.planPacket(packet,targets,[0,1],true).issueCount,1)
targets=[target('00101'),target('00102')];targets[0].cells[0].max=10;assert.equal(core.planPacket(packet,targets,[0,1],true).issueCount,1)
assert.deepEqual(core.parseGrid('0\t\r\n2\t3\r\n'),[[0,null],[2,3]])
assert.throws(()=>core.parseGrid('1,5\t2'),/ตัวเลข/);assert.throws(()=>core.parseGrid('1\t2\n3'),/คอลัมน์/)
targets=[target('00101'),target('00102')];assert.equal(core.planGrid([[1,2],[3,4]],targets,0,0).issueCount,0)
assert.equal(core.planGrid([[1],[2]],targets,0,0).issueCount,2,'Column mismatch is blocked rather than spilling into later rows')
assert.throws(()=>core.planGrid([[1,2]],targets,0,0),/จำนวนแถว/)
const receipt={changes:core.planPacket(packet,targets,[0,1]).changes}
assert.equal(core.verifyReceipt(receipt,[target('00102','12'),target('00101','0','15.5')]).mismatches.length,0)
assert.equal(core.verifyReceipt(receipt,[target('00101','0','9'),target('00102','12')]).mismatches.length,1)

// Exercise the app's real exporter: use school registration codes, never UUID/roll number.
const exportsObject={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sgs-transfer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,require:()=>core})
const params={yearBe:2569,term:2,classroom:'ม.1/1',subjectCode:'ท21102',subjectName:'ภาษาไทย 2',config:{between_scores:[20,0],midterm_max:0,final_max:30},students:[{id:'internal-uuid',student_number:1,student_code:'00101',prefix:'เด็กชาย',first_name:'ทดสอบ',last_name:'หนึ่ง'}],rows:{'internal-uuid':{unit_scores:[0,NaN],midterm:null,final:15,result:'เรียน'}}}
const exported=exportsObject.buildSGSScorePacket(params)
assert.equal(exported.students[0].studentCode,'00101');assert.equal(exported.columns.length,2);assert.deepEqual(Array.from(exported.students[0].values),[0,15]);assert.ok(!JSON.stringify(exported).includes('internal-uuid'))
assert.throws(()=>exportsObject.buildSGSScorePacket({...params,students:[{...params.students[0],student_code:null}]}),/เลขประจำตัว/)
const persisted=exportsObject.buildSavedSGSScorePacket({...params,scores:[{student_id:'internal-uuid',unit_scores:{'1':0,'2':null},midterm_score:null,final_score:15}]})
assert.deepEqual(Array.from(persisted.students[0].values),[0,15]);assert.equal(persisted.students[0].studentCode,'00101')
const blankPersisted=exportsObject.buildSavedSGSScorePacket({...params,scores:[]});assert.deepEqual(Array.from(blankPersisted.students[0].values),[null,null])
assert.throws(()=>exportsObject.buildSavedSGSScorePacket({...params,scores:[{student_id:'internal-uuid',unit_scores:{'1':21}}]}),/คะแนน/)

// Service worker authorization, receipt isolation and expiry with synthetic Chrome APIs.
let messageHandler,actionHandler,removedHandler,now=Date.now(),storage={},injections=0
const chrome={action:{onClicked:{addListener:f=>actionHandler=f},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},scripting:{executeScript:async()=>{injections++}},runtime:{onMessage:{addListener:f=>messageHandler=f}},tabs:{onRemoved:{addListener:f=>removedHandler=f}},storage:{session:{get:async key=>({[key]:storage[key]}),set:async value=>Object.assign(storage,value),remove:async key=>{delete storage[key]}}}}
vm.runInNewContext(fs.readFileSync('extensions/jarnsek-sgs/service-worker.js','utf8'),{chrome,importScripts(){},JarnsekSGSCore:core,URL,Date:{now:()=>now}})
const sender={url:'https://sgs.bopp-obec.info/score',frameId:0,tab:{id:7}}
const send=(message,from=sender)=>new Promise(resolve=>{if(messageHandler(message,from,resolve)===false)resolve(null)})
;(async()=>{
 await actionHandler({id:7,url:sender.url});assert.equal(injections,1)
 await actionHandler({id:7,url:'https://sgs.bopp-obec.info.attacker.test'});assert.equal(injections,1)
 const saved={url:sender.url,docId:'document-a',fingerprint:'context',idColumn:1,changes:receipt.changes}
 assert.equal((await send({type:'jarnsek:receipt:set',receipt:saved})).ok,true)
 assert.equal((await send({type:'jarnsek:receipt:get'})).receipt.changes.length,3)
 assert.equal((await send({type:'jarnsek:receipt:get'},{...sender,tab:{id:8}})).receipt,null)
 assert.equal(await send({type:'jarnsek:receipt:get'},{...sender,frameId:1}),null)
 assert.equal(await send({type:'jarnsek:receipt:get'},{...sender,url:'https://attacker.test'}),null)
 now+=31*60*1000;assert.equal((await send({type:'jarnsek:receipt:get'})).receipt,null)
 await send({type:'jarnsek:receipt:set',receipt:saved});removedHandler(7);assert.equal(storage['sgs-receipt-7'],undefined)
 console.log('PASS: SGS student identity matching/reordering, blanks and zero, duplicate/overflow/locked/overwrite protection, grid dimension checks, saved-score comparisons, real app exporter and extension tab/session authorization')
})().catch(error=>{console.error(error);process.exitCode=1})
