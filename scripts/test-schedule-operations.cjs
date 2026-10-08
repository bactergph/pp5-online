const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function moduleFrom(path, requireFn) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:requireFn})
  return exports
}
let data, writes, loadedTerm, writtenTerm, role='admin'
const solver = moduleFrom('lib/schedule-solver.ts')
const timing = moduleFrom('lib/schedule-helpers.ts',()=>({SCHEDULE_DAYS:[],SCHEDULE_PERIOD_COUNT:6}))
for (const morning of [2,3,4]) {
  const shifted=timing.moveLunchBreak(timing.DEFAULT_PERIOD_TIMES,morning)
  assert.equal(shifted.findIndex(t=>t.is_break),morning)
  assert.equal(shifted[morning].start_time,`${String(8+morning).padStart(2,'0')}:30`)
  assert.equal(shifted[shifted.length-1].end_time,'15:30')
  assert.equal(timing.validatePeriodTimes(shifted),null)
  assert.deepEqual(Array.from(shifted,t=>t.sort_order),[1,2,3,4,5,6,7])
}
assert.throws(()=>timing.moveLunchBreak(timing.DEFAULT_PERIOD_TIMES,9))
console.log('PASS: lunch can follow periods 2, 3, 4 with valid ordered times and unchanged teaching durations')
const store = {
  loadScheduleConstraints:async()=>({periodCount:6,blocks:[],blocksSupported:true}),
  loadSchedule: async(s,y,term)=>{loadedTerm=term;return data},
  requireScheduleClass: (d,id)=>{const c=d.classrooms.find(c=>c.id===id);if(!c)throw Error('room');return c},
  lessonKey:s=>s.activity_id?'activity:'+s.activity_id:s.class_subject_id,
  lessonColumns:id=>({class_subject_id:id&&!id.startsWith('activity:')?id:null,activity_id:id?.startsWith('activity:')?id.slice(9):null}),
  persistSchedule:async(s,y,before,after,unlock,term)=>{writtenTerm=term;writes++;data={...data,slots:after}},
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
  reset();await api.autoSchedule('y','a',true,2);assert.equal(loadedTerm,2);assert.equal(writtenTerm,2)
  reset();await api.saveCell('a','y',1,1,'l1',null,2);assert.equal(loadedTerm,2);assert.equal(writtenTerm,2)
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

  reset();data.slots=[slot('a','l1',1)]
  await api.editTeacherCell('y',2,'t','a',1,1,'l1',null)
  assert.equal(data.slots.length,0,'removing from teacher timetable must remove classroom slot')
  await api.editTeacherCell('y',2,'t','a',1,1,null,'l1')
  assert.equal(data.slots[0].class_subject_id,'l1')
  assert.equal(writtenTerm,2)
  await assert.rejects(api.editTeacherCell('y',2,'other','a',1,1,'l1',null),/ไม่ใช่คาบ/)
  await assert.rejects(api.editTeacherCell('y',2,'t','a',1,1,null,null),/ถูกแก้ไข/)
  await assert.rejects(api.editTeacherCell('y',2,'t','a',1,1,'l1','l2'),/ไม่ได้กำหนด/)
  data.slots[0].locked=true
  await assert.rejects(api.editTeacherCell('y',2,'t','a',1,1,'l1',null),/ปลดล็อก/)
  console.log('PASS: teacher timetable removal/addition updates classroom, expected lesson protects stale edits, teacher/room/term/lock validation')
  reset();data.slots=[slot('a','l1',1),slot('a','l1',2)]
  await assert.rejects(api.saveCell('a','y',1,3,'l1',null,2),/ครบ 2 คาบ/);assert.equal(writes,0)
  await assert.rejects(api.editTeacherCell('y',2,'t','a',1,3,null,'l1'),/ครบ 2 คาบ/);assert.equal(writes,0)
  await api.saveCell('a','y',1,1,'l1',null,2);assert.equal(writes,1,'saving unchanged full lesson remains allowed')
  data.slots.push(slot('a','l1',3))
  await api.saveCell('a','y',1,3,null,null,2);assert.equal(data.slots.length,2,'legacy over-quota timetable can be repaired')
  reset();data.lessons.push({id:'activity:a',classroomId:'a',teacherId:null,count:0,label:'scout',activity:true})
  await api.saveCell('a','y',1,1,'activity:a',null)
  await assert.rejects(api.saveCell('a','y',1,2,'activity:a',null),/ครบ 1 คาบ/)
  console.log('PASS: manual and teacher edits cannot exceed weekly quota; unchanged and repair edits allowed; activities capped at one period')
  reset();data.classrooms.push({id:'a2',level:'ป.1',room:2});data.slots=[slot('a','l1',1),slot('a','l1',2,true),slot('a2','l1',1),slot('b','l2',1)]
  const clearLevel=await api.clearScope('y',2,'level','a')
  assert.equal(clearLevel.rooms,2);assert.equal(clearLevel.removed,2);assert.equal(writes,1);assert.equal(writtenTerm,2)
  assert.equal(data.slots.length,2);assert.ok(data.slots.some(s=>s.classroom_id==='b'));assert.ok(data.slots.some(s=>s.locked))
  const clearSchool=await api.clearScope('y',2,'school','a');assert.equal(clearSchool.removed,1);assert.equal(data.slots.length,1);assert.ok(data.slots[0].locked)
  await assert.rejects(api.clearScope('y',2,'school','foreign'),/room/)
  reset();data.slots=[slot('a','l1',1),slot('b','l2',1)];await api.clearScope('y',1,'room','a');assert.equal(data.slots.length,1);assert.equal(data.slots[0].classroom_id,'b')
  console.log('PASS: atomic room/level/school clearing retains locked periods, other levels and term isolation')
  reset();data.lessons[1].teacherId='other';data.slots=[slot('a','l1',1),slot('a','l1',2,true),slot('b','l2',1)]
  const teacherClear=await api.clearTeacher('y',2,'t');assert.equal(teacherClear.removed,1);assert.equal(data.slots.length,2);assert.ok(data.slots.some(s=>s.classroom_id==='b'));assert.ok(data.slots.some(s=>s.locked));assert.equal(writtenTerm,2)
  console.log('PASS: clearing selected teacher preserves other teachers and locked periods')
  reset();role='teacher';await assert.rejects(api.clearTeacher('y',1,'t'),/สิทธิ์/);assert.equal(writes,0)
  await assert.rejects(api.clearScope('y',1,'school','a'),/สิทธิ์/);assert.equal(writes,0)
  await assert.rejects(api.autoSchedule('y',null,true),/สิทธิ์/);assert.equal(writes,0)
  console.log('PASS: rebuild quota regression, school scope/empty rooms, lock preservation, copy matching, school/role authorization')
})().catch(e=>{console.error(e);process.exitCode=1})
