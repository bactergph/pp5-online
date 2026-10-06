/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS regression runner. */
const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict')
let session, classroom, record, race=false, writes=0, audit=0
const db={from(table){let filters=[],payload=null;const chain={select(){return chain},eq(key,val){filters.push([key,val]);return chain},is(key,val){filters.push([key,val]);return chain},update(value){payload=value;return chain},maybeSingle:async()=>({data:table==='class_subjects'?{id:'subject',teacher_id:classroom.homeroom_teacher_id,classrooms:{school_id:classroom.school_id}}:table==='approval_signatures'?(filters.every(([key,val])=>record[key]===val)?record:null):classroom&&filters.every(([key,val])=>classroom[key]===val)?classroom:null}),then(resolve,reject){if(!['class_document_approvals','approval_signatures'].includes(table))throw new Error('unexpected mutation');if(race||!filters.every(([key,val])=>(record[key]??null)===val))return Promise.resolve({data:[],error:null}).then(resolve,reject);Object.assign(record,payload);writes++;return Promise.resolve({data:[{id:record.id}],error:null}).then(resolve,reject)}};return chain}}
const moduleStub={exports:{}};const code=ts.transpileModule(fs.readFileSync('app/(shell)/sign/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
new Function('require','module','exports',code)(name=>{
 if(name==='@/lib/supabase')return {createServerClient:()=>db}
 if(name==='@/lib/session')return {getSession:async()=>session}
 if(name==='@/lib/audit')return {logActivity:async()=>{audit++}}
 if(name==='@/lib/approvals/class-doc-lookup')return {findClassDocumentApproval:async(_db,params)=>params.docType===record.doc_type&&params.term===record.term&&((record.month??null)===(params.month??null)||record.month==null)?record:null,findClassDocumentApprovalExact:async(_db,params)=>params.docType===record.doc_type&&params.term===record.term&&(params.month??null)===(record.month??null)?record:null}
 if(name==='@/lib/approvals/cancel-proposal')return {pp5SubjectHasApproverSignatures:r=>Boolean(r.subject_head_signed_at||r.measurement_head_signed_at||r.academic_head_signed_at||r.vice_director_signed_at||r.director_signed_at),classDocHasApproverSignatures:r=>Boolean(r.academic_head_signed_at||r.vice_director_signed_at||r.director_signed_at)}
 return {}
},moduleStub,moduleStub.exports)
const remove=moduleStub.exports.removePp6DocumentSignature
function reset(){session={userId:'teacher',schoolId:'school',role:'teacher'};classroom={id:'room',school_id:'school',homeroom_teacher_id:'teacher',homeroom_teacher2_id:null};record={id:'approval',school_id:'school',doc_type:'pp6',term:1,status:'draft',homeroom_id:'teacher',homeroom_signed_at:'signed',academic_head_signed_at:null,vice_director_signed_at:null,director_signed_at:null};race=false;writes=0;audit=0}
async function testToggleButton(variant='pp6'){
 let signature=false, currentState, busy=false, puts=0, removes=0, previews=0, cursor=0
 const state=()=>({status:'draft',status_label:'ร่าง',isInitiator:true,hasDocumentSignature:signature,canPutSignature:true,canRemoveSignature:signature,canPropose:signature,canShowPropose:true,canSign:false,isDirectorStep:false,next_step:null})
 currentState=state()
 const m={exports:{}}
 const code=ts.transpileModule(fs.readFileSync('components/sign/DocumentSignaturePanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',code)(name=>{
  if(name==='react')return {useCallback:fn=>fn,useEffect:()=>{},useState:initial=>{const i=cursor++;return [i===0?currentState:i===3?busy:initial,value=>{if(i===0)currentState=value;if(i===3)busy=value}]}}
  if(name==='react/jsx-runtime')return require(name)
  if(name==='@/lib/use-app-alert')return {useAppAlert:()=>({notify:()=>{},confirm:async()=>true,AlertModal:()=>null})}
  if(name==='@/lib/approvals/types')return {approvalTermFromReport:()=>1}
  if(name==='@/lib/thaiDate')return {getThaiMonthShort:()=>''}
  if(name==='@/app/sign/actions')return {fetchPp5SubjectApprovalStatus:async()=>state(),fetchClassDocApprovalStatus:async()=>state(),putPp5SubjectSignature:async()=>{puts++;signature=true;return {}},removePp5SubjectSignature:async()=>{removes++;signature=false;return {}},putClassDocumentSignature:async()=>{puts++;signature=true;return {}},removeClassDocumentSignature:async()=>{removes++;signature=false;return {}}}
  return {}
 },m,m.exports)
 const button=()=>{cursor=0;const tree=m.exports.default({variant,classSubjectId:'subject',classroomId:'room',reportTerm:1,reportMonth:5,compact:true,onSignatureChange:()=>{previews++}});let found;function visit(node){if(!node||typeof node!=='object')return;if(Array.isArray(node))return node.forEach(visit);if(node.type==='button'&&String(node.props.className).includes('--signature'))found=node;visit(node.props?.children)}visit(tree);return found}
 assert.equal(button().props.children,'ใส่ลายเซ็น');assert.equal(button().props['aria-pressed'],false)
 await button().props.onClick();assert.equal(puts,1);assert.equal(button().props.children,'เอาลายเซ็นออก');assert.equal(button().props['aria-pressed'],true)
 await button().props.onClick();assert.equal(removes,1);assert.equal(button().props.children,'ใส่ลายเซ็น');assert.equal(previews,2)
 currentState={...state(),status:'approved',hasDocumentSignature:true,canRemoveSignature:false};assert.equal(button().props.disabled,true)
 console.log('PP6 button tests passed: add/remove/add labels, pressed state, action routing and preview refresh')
}
;(async()=>{
 for(const variant of ['pp6','pp5_subject','pp5_class','classroom_admin']) await testToggleButton(variant)
 for(const docType of ['pp5_class','classroom_admin']){reset();record.doc_type=docType;record.month=docType==='classroom_admin'?5:null;assert.equal((await moduleStub.exports.removeClassDocumentSignature(docType,'room',1,record.month)).success,true);assert.equal(record.homeroom_signed_at,null)}
 reset();record.doc_type='classroom_admin';record.month=5;assert.equal((await moduleStub.exports.removeClassDocumentSignature('classroom_admin','room',1,6)).success,true);assert.equal(writes,0);assert.equal(record.homeroom_signed_at,'signed')
 for(const status of ['draft','in_review','approved']){reset();record.class_subject_id='subject';record.teacher_id='teacher';record.teacher_signed_at='signed';record.status=status;const result=await moduleStub.exports.removePp5SubjectSignature('subject',1);if(status==='draft'){assert.equal(result.success,true);assert.equal(record.teacher_signed_at,null);assert.equal(record.teacher_id,null)}else{assert.match(result.error,/ไม่สามารถ/);assert.equal(writes,0)}}
 reset();assert.equal((await remove('room',1)).success,true);assert.equal(record.homeroom_signed_at,null);assert.equal(record.homeroom_id,null);assert.equal(record.status,'draft');assert.equal(writes,1);assert.equal(audit,1)
 reset();session.userId='other';assert.match((await remove('room',1)).error,/ครูประจำชั้น/);assert.equal(writes,0)
 reset();session.schoolId='other-school';assert.match((await remove('room',1)).error,/ไม่พบห้อง/);assert.equal(writes,0)
 for(const status of ['in_review','approved']){reset();record.status=status;assert.match((await remove('room',1)).error,/ไม่สามารถ/);assert.equal(writes,0)}
 reset();record.director_signed_at='signed';assert.match((await remove('room',1)).error,/ไม่สามารถ/);assert.equal(writes,0)
 reset();race=true;assert.match((await remove('room',1)).error,/สถานะเอกสารเปลี่ยน/);assert.equal(writes,0)
 reset();assert.equal((await remove('room',2)).success,true);assert.equal(writes,0);assert.equal(record.homeroom_signed_at,'signed')
 reset();session.role='admin';session.userId='admin';assert.equal((await remove('room',1)).success,true)
 console.log('PP6 signature removal tests passed: draft, initiator/admin, school/term isolation, approval locks and concurrent status changes.')
})().catch(error=>{console.error(error);process.exitCode=1})
