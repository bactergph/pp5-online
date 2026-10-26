import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'

function load(file,deps={}){
  const exports={}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>deps[name]||(name==='./schedule-joint-teaching'?load('lib/schedule-joint-teaching.ts'):{})})
  return exports
}
const solver=load('lib/schedule-solver.ts'),planning=load('lib/schedule-planning.ts',{'./schedule-solver':solver,'./schedule-block-repair':load('lib/schedule-block-repair.ts')})
const {verifyCompleteSchedule}=load('lib/schedule-verification.ts',{'./schedule-planning':planning})
// Numeric identifiers, subject categories and counts only; no staff/student data.
const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/schedule-dense-school-63.json','utf8'))
const lessons=fixture.lessons.map(([room,teacher,count,priority,fixed,activity,group,spread,venue],index)=>({
  id:`L${index}`,classroomId:`R${room}`,teacherId:teacher<0?null:`T${teacher}`,count,label:`R${room} · วิชา ${index}`,
  name:priority===2?'คณิตศาสตร์':priority===1?'ภาษาอังกฤษ':'ศิลปะ',fixedOnly:!!fixed,activity:!!activity,teacherOptional:!!activity,
  activityGroupId:group<0?undefined:`G${group}`,spread:!!spread,roomId:venue<0?null:`V${venue}`,pattern:fixed?undefined:Array(count).fill(1),
}))
const fixed=fixture.fixed.map(([room,lesson,day,period])=>({classroomId:`R${room}`,lessonId:lesson<0?null:`L${lesson}`,day,period}))
const blocks=fixture.blocks.map(([teacher,day,period])=>({teacherId:`T${teacher}`,day,period}))
const plan={...planning.emptyPlan(),days:fixture.days}
assert.equal(fixture.rooms,63);assert.equal(fixture.teachers,119)
assert.equal(fixture.periods.filter(period=>!period.is_break).length,7)
assert.equal(new Set(blocks.map(block=>block.teacherId)).size,30)
assert.equal(blocks.length,60)
for(const teacher of new Set(blocks.map(block=>block.teacherId)))assert.equal(blocks.filter(block=>block.teacherId===teacher).length,2)

function check(input,label){
  const before=JSON.stringify({input,fixed,blocks}),started=Date.now()
  const result=planning.solvePlannedSchedule(input,fixed,plan,fixture.periods,blocks)
  assert.equal(result.status,'complete',`${label}: ${result.status} ${result.message||''}`)
  assert.equal(result.solver,'dense_slot_matching')
  const rows=[...fixed,...result.assignments]
  assert.equal(rows.length,2144);assert.equal(result.assignments.length,2045)
  const issues=verifyCompleteSchedule(input,rows,plan.days,fixture.periods,blocks)
  assert.equal(issues.length,0,JSON.stringify(issues.slice(0,5)))
  const byId=new Map(input.map(lesson=>[lesson.id,lesson])),classCells=new Set(),teacherCells=new Set(),venueCells=new Set()
  for(const row of rows){
    const time=`${row.day}:${row.period}`,classKey=`${row.classroomId}:${time}`,lesson=byId.get(row.lessonId)
    assert.ok(!classCells.has(classKey));classCells.add(classKey)
    assert.ok(lesson);assert.ok(fixture.periods.some(period=>!period.is_break&&period.period===row.period))
    if(lesson.teacherId){const key=`${lesson.teacherId}:${time}`;assert.ok(!teacherCells.has(key));teacherCells.add(key);assert.ok(!blocks.some(block=>block.teacherId===lesson.teacherId&&block.day===row.day&&block.period===row.period))}
    if(lesson.roomId){const key=`${lesson.roomId}:${time}`;assert.ok(!venueCells.has(key));venueCells.add(key)}
  }
  for(const room of new Set(input.map(lesson=>lesson.classroomId)))assert.ok(rows.filter(row=>row.classroomId===room).length<=35)
  assert.equal(JSON.stringify({input,fixed,blocks}),before,'Search must not mutate caller data')
  console.log(`PASS: ${label}; 63 rooms, 119 teachers, 35-cell cap, 60 teacher blocks, 2144 periods, fixed activities retained; ${Date.now()-started}ms/${result.nodes} repair/search steps`)
}
check(lessons,'near-full school regression that previously timed out')
const labs=new Set()
const withLabs=lessons.map(lesson=>{
  if(lesson.activity||labs.has(lesson.classroomId))return {...lesson}
  labs.add(lesson.classroomId)
  return {...lesson,roomId:`lab-${Math.floor(Number(lesson.classroomId.slice(1))/3)}`}
})
check(withLabs,'same dense school with shared venues')
