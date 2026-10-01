const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function moduleFrom(path, requireFn) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:requireFn})
  return exports
}
let data, writes, role='admin'
const solver = moduleFrom('lib/schedule-solver.ts')
const store = {
  loadSchedule: async()=>data,
  requireScheduleClass: (d,id)=>{const c=d.classrooms.find(c=>c.id===id);if(!c)throw Error('room');return c},
  lessonKey:s=>s.activity_id?'activity:'+s.activity_id:s.class_subject_id,
  lessonColumns:id=>({class_subject_id:id&&!id.startsWith('activity:')?id:null,activity_id:id?.startsWith('activity:')?id.slice(9):null}),
  persistSchedule:async(s,y,before,after)=>{writes++;data={...data,slots:after}},
}
const api=moduleFrom('lib/schedule-operations.ts',name=>({
  'server-only':{},'@/lib/session':{getSession:async()=>({schoolId:'s',role,userId:'u'})},
  '@/lib/supabase':{createServerClient:()=>{throw Error('Unexpected DB call')}},
  '@/lib/audit':{logActivity:async()=>{}},'@/lib/schedules':{SCHEDULE_EDIT_ROLES:['admin']},
  '@/lib/schedule-store':store,'@/lib/schedule-solver':solver,
  '@/lib/schedule-activity':{LEARNER_DEVELOPMENT_KEY:'learner-development'},
}[name]))
function reset(){writes=0;data={classrooms:[{id:'a',level:'ป.1',room:1},{id:'b',level:'ป.2',room:1},{id:'empty',level:'อ.2',room:1}],lessons:[{id:'l1',classroomId:'a',teacherId:'t',count:2,label:'a · math',subjectId:'math',name:'math',activity:false},{id:'l2',classroomId:'b',teacherId:'t',count:2,label:'b · math',subjectId:'math',name:'math',activity:false}],slots:[]}}
const slot=(room,id,period,locked=false)=>({classroom_id:room,academic_year_id:'y',day_of_week:1,period,class_subject_id:id,activity_id:null,note:null,locked})
;(async()=>{
  reset();data.slots=[slot('a','l1',1),slot('a','l1',2)]
  const rebuilt=await api.autoSchedule('y','a',true)
  assert.equal(rebuilt.assigned,2,'clear-first must recompute full quotas')
  reset();const whole=await api.autoSchedule('y',null,true)
  assert.equal(whole.assigned,4);assert.equal(whole.skipped.length,1);assert.equal(writes,1)
  reset();data.slots=[slot('a','l1',1,true)]
  await assert.rejects(api.saveCell('a','y',1,1,null,null),/ล็อก/);assert.equal(writes,0)
  await api.clearRoom('a','y');assert.equal(data.slots.length,1)
  reset();data.slots=[slot('a','l1',1),slot('b','l2',2,true)]
  await api.copyRoom('a','b','y');assert.equal(data.slots.filter(s=>s.classroom_id==='b').length,2);assert.ok(data.slots.find(s=>s.classroom_id==='b'&&s.period===2).locked)
  reset();data.slots=[slot('a','l1',1)];data.lessons[1].subjectId='different'
  await assert.rejects(api.copyRoom('a','b','y'),/ไม่มี/);assert.equal(writes,0)
  reset();await assert.rejects(api.saveCell('foreign','y',1,1,'l1',null));assert.equal(writes,0)
  reset();data.lessons.push({id:'activity:manual',classroomId:'a',teacherId:null,count:0,label:'แนะแนว',subjectId:'guide',name:'แนะแนว',activity:true,teacherOptional:true})
  data.slots=[{...slot('a',null,1),activity_id:'manual'}]
  const manual=await api.autoSchedule('y','a',true)
  assert.equal(manual.assigned,2)
  assert.equal(data.slots.filter(s=>s.activity_id==='manual').length,1)
  assert.equal(data.slots.find(s=>s.activity_id==='manual').period,1)
  assert.ok(!data.slots.some(s=>s.class_subject_id && s.day_of_week===1 && s.period===1))
  reset();data.lessons.push({id:'activity:manual',classroomId:'a',teacherId:null,count:0,label:'แนะแนว',activity:true,teacherOptional:true})
  await api.autoSchedule('y',null,true)
  assert.ok(data.slots.every(s=>!s.activity_id),'automatic scheduling must never add an activity')
  reset();role='teacher';await assert.rejects(api.autoSchedule('y',null,true),/สิทธิ์/);assert.equal(writes,0)
  console.log('PASS: rebuild quota regression, school scope/empty rooms, lock preservation, copy matching, school/role authorization')
})().catch(e=>{console.error(e);process.exitCode=1})
