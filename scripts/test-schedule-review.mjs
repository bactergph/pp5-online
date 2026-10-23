import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,console,require:name=>deps[name]||(['react','react/jsx-runtime'].includes(name)?require(name):{})});return exports}
const solver=load('lib/schedule-solver.ts'),planning=load('lib/schedule-planning.ts',{'./schedule-solver':solver})
const {verifyCompleteSchedule}=load('lib/schedule-verification.ts',{'./schedule-planning':planning})
const periods=[{period:1,start_time:'08:00',end_time:'09:00',is_break:false},{period:2,start_time:'09:00',end_time:'10:00',is_break:false},{period:0,start_time:'10:00',end_time:'11:00',is_break:true},{period:3,start_time:'11:00',end_time:'12:00',is_break:false}]
const lesson={id:'math',classroomId:'A',teacherId:'T',count:2,label:'A · คณิต',pattern:[2]}
const slot=(lessonId,day,period,room='A')=>({lessonId,day,period,classroomId:room})
assert.equal(verifyCompleteSchedule([lesson],[slot('math',1,1),slot('math',1,2)],[1],periods,[]).length,0)
assert.ok(verifyCompleteSchedule([lesson],[slot('math',1,1)],[1],periods,[]).some(i=>i.message.includes('จัดได้ 1 จาก 2')))
assert.ok(verifyCompleteSchedule([lesson],[slot('math',1,2),slot('math',1,3)],[1],periods,[]).some(i=>i.message.includes('รูปแบบคาบ')))
assert.ok(verifyCompleteSchedule([lesson],[slot('math',1,1,'B'),slot('math',1,2)],[1],periods,[]).some(i=>i.message.includes('ไม่ตรงกับรายวิชา')))
assert.ok(verifyCompleteSchedule([lesson],[slot('math',1,1),slot('math',1,2)],[1],periods,[{teacherId:'T',day:1,period:1}]).some(i=>i.message.includes('ไม่ว่าง')))
const activities=['A','B'].map(room=>({id:'activity-'+room,classroomId:room,teacherId:null,teacherOptional:true,teacherIds:['T'],activity:true,activityGroupId:'joint',count:1,label:room}))
assert.ok(verifyCompleteSchedule(activities,[slot('activity-A',1,1),slot('activity-B',1,2,'B')],[1],periods,[]).some(i=>i.message.includes('พร้อมกันทุกห้อง')))
assert.equal(verifyCompleteSchedule(activities,[slot('activity-A',1,1),slot('activity-B',1,1,'B')],[1],periods,[]).length,0)
assert.ok(planning.checkPlanning([{...lesson,id:'first',count:2,roomId:'lab'},{...lesson,id:'second',classroomId:'B',teacherId:'T2',count:2,roomId:'lab'}],[],[1],periods,[]).some(i=>i.message.includes('สถานที่ของ')))
const lockedOther={id:'other',classroomId:'A',teacherId:'Other',count:1,label:'Other',fixedOnly:true}
assert.ok(planning.checkPlanning([lesson,lockedOther],[slot('other',1,1)],[1],periods,[]).some(i=>i.message.includes('ไม่มีช่วงว่างต่อเนื่อง')))

// Substitution reservations are scoped, paginated and deduplicated with blocks.
const substitutionRows=Array.from({length:1001},(_,index)=>({id:index,substitute_teacher_id:'T',period:index%3+1,schedule_substitute_days:{school_id:'school',academic_year_id:'year',semester:2,day_of_week:1}}))
substitutionRows.push({id:1002,substitute_teacher_id:'Foreign',period:1,schedule_substitute_days:{school_id:'other-school',academic_year_id:'year',semester:2,day_of_week:1}},{id:1003,substitute_teacher_id:'Term1',period:1,schedule_substitute_days:{school_id:'school',academic_year_id:'year',semester:1,day_of_week:1}})
let pages=0
const db={from(table){const filters=[];const query={select(){return query},order(){return query},eq(key,value){filters.push([key,value]);return query},not(){return query},then(resolve){return Promise.resolve({data:table==='school_period_times'?[{period:1},{period:2},{period:3}]:[{teacher_id:'T',day_of_week:1,period:1}],error:null}).then(resolve)},async range(from,to){pages++;const rows=substitutionRows.filter(row=>filters.every(([key,value])=>key.split('.').reduce((current,part)=>current?.[part],row)===value));return {data:rows.slice(from,to+1),error:null}}};return query}}
const store=load('lib/schedule-store.ts',{'@/lib/supabase':{createServerClient:()=>db}})
const constraints=await store.loadScheduleConstraints('school','year',2)
assert.equal(pages,3)
assert.equal(constraints.blocks.length,3)
assert.ok(constraints.blocks.every(block=>block.teacherId==='T'))

const helper=load('lib/schedule-helpers.ts',{'@/lib/schedules':{SCHEDULE_DAYS:[]}})
const teams=load('lib/schedule-activity-teams.ts')
let renderedGrid
const Review=load('components/schedules/ScheduleReviewStep.tsx',{'@/lib/schedules':{SCHEDULE_DAYS:[{value:1,label:'จันทร์'}]},'@/lib/schedule-helpers':helper,'@/lib/schedule-activity-teams':teams,'./ScheduleGridTable':{__esModule:true,default:props=>{renderedGrid=props;return React.createElement('table',null,React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',null,props.renderCell(1,1)))))}}}).default
const data={classrooms:[{id:'A',level:'ป.1',name:'1',room:1},{id:'B',level:'ป.1',name:'2',room:2}],lessons:[{...lesson,name:'คณิต',code:'ค11101'}],activities:[{id:'guide',label:'แนะแนว'}],teachers:[],periods,plan:{days:[1],activityGroups:[{id:'joint',settingId:'guide',roomIds:['A','B'],weeklyPeriods:1,cells:[{day:1,period:1}],mode:'joint',teacherIds:[],roomTeachers:{}}]}}
const props={data,rooms:['A'],clear:false,issues:null,draft:null,blocked:false,onRooms(){},onClear(){},onCheck(){},onGenerate(){},onConfirm(){},onDiscard(){},onFix(){}}
const html=patch=>renderToStaticMarkup(React.createElement(Review,{...props,...patch}))
assert.ok(!html({}).includes('บันทึกใช้ตารางนี้'))
assert.ok(!html({draft:{status:'timeout',id:null,rows:[],issues:[],assigned:0,locked:0,message:'ครูมีช่วงว่างไม่ตรงกัน'}}).includes('บันทึกใช้ตารางนี้'))
assert.ok(html({draft:{status:'conflict',id:null,rows:[],issues:[],assigned:0,locked:0,message:'สถานที่ชนกัน'}}).includes('สถานที่ชนกัน'))
const ready={status:'complete',id:'draft',rows:[{classroom_id:'A',day_of_week:1,period:1,class_subject_id:'math',activity_id:null,locked:false}],issues:[],assigned:1,locked:0,affectedRooms:['B']}
const preview=html({draft:ready})
assert.ok(preview.includes('บันทึกใช้ตารางนี้'))
assert.ok(preview.includes('คณิต'))
assert.ok(!preview.includes('prep-slot-activity')) // Never invent a missing activity from its config cell.
assert.ok(preview.includes('กิจกรรมร่วม')) // Cross-scope changes are available for review.
const currentPreview={lessons:[{id:'math',name:'วิทยาศาสตร์ล่าสุด',code:'ว11101',teacherName:'นางสาว ใหม่ ล่าสุด',roomName:'ห้องทดลองใหม่'}],days:[1,3],periods:[{...periods[0],start_time:'07:30'}],classrooms:[{...data.classrooms[0],name:'ห้องใหม่'}]}
const fresh=html({draft:{...ready,preview:currentPreview}})
assert.ok(fresh.includes('วิทยาศาสตร์ล่าสุด'));assert.ok(fresh.includes('ล่าสุด'));assert.ok(fresh.includes('ห้องทดลองใหม่'));assert.ok(fresh.includes('ห้องใหม่'))
assert.ok(!fresh.includes('<b>คณิต</b>'))
assert.deepEqual(renderedGrid.days,currentPreview.days);assert.deepEqual(renderedGrid.periodTimes,currentPreview.periods)
assert.ok(!html({draft:ready,blocked:true}).includes('บันทึกใช้ตารางนี้'))
assert.ok(!html({draft:ready,issues:[{severity:'error',message:'ข้อมูลล่าสุดยังไม่พร้อม',step:6}]}).includes('บันทึกใช้ตารางนี้'))
const warningsOnly=html({issues:[{severity:'warning',message:'สถานที่ยังไม่ผูกรหัส',step:6}]})
assert.ok(warningsOnly.includes('ผ่านการตรวจเบื้องต้น'))
const many=html({issues:Array.from({length:100},(_,index)=>({severity:'error',message:`ยังไม่มีครู ${index}`,step:6}))})
assert.ok(many.includes('ต้องแก้ 100 รายการ'))
assert.ok(many.includes('แสดงเพิ่มอีก'))
console.log('PASS: independent quota/pattern/room/teacher/joint verification; venue readiness; draft/timeout/conflict UI; true activity cells; outside-scope review and bounded issue lists')
