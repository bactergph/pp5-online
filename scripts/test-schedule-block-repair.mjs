import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'

const cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute)
  const exports = {}; cache.set(absolute, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, { exports, require: name => name.startsWith('.') ? load(path.join(path.dirname(absolute), name + '.ts')) : {} })
  return exports
}
const planning = load('lib/schedule-planning.ts')
const { verifyCompleteSchedule } = load('lib/schedule-verification.ts')
const { solveBlockRepair } = load('lib/schedule-block-repair.ts')
const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/schedule-block-school-63.json', 'utf8'))
const lessons = fixture.lessons.map(([room, teachers, count, pattern, fixedOnly, activity, group, venue, priority, spread], i) => ({
  id: `L${i}`, classroomId: `R${room}`, teacherId: !activity && teachers.length === 1 ? `T${teachers[0]}` : null,
  teacherIds: activity || teachers.length > 1 ? teachers.map(id => `T${id}`) : undefined,
  count, pattern: pattern || undefined, fixedOnly: !!fixedOnly, activity: !!activity, teacherOptional: !!activity,
  activityGroupId: group < 0 ? undefined : `G${group}`, roomId: venue < 0 ? null : `V${venue}`,
  name: fixture.afternoonSimulationKinds?.[i] === 'pe' ? 'พลศึกษา' : fixture.afternoonSimulationKinds?.[i] === 'music' ? 'ดนตรี' : priority === 2 ? 'คณิตศาสตร์' : priority === 1 ? 'ภาษาอังกฤษ' : 'ศิลปะ',
  timePreference: priority === 3 ? 'morning' : priority === -3 ? 'afternoon' : 'any',
  label: `R${room} · วิชา ${i}`, spread: !!spread,
}))
const fixed = fixture.fixed.map(([room, lesson, day, period]) => ({ classroomId: `R${room}`, lessonId: lesson < 0 ? null : `L${lesson}`, day, period }))
const plan = { ...planning.emptyPlan(), days: fixture.days }, periods = fixture.periods
const teachers = lesson => lesson.teacherIds ?? (lesson.teacherId ? [lesson.teacherId] : [])
assert.equal(fixture.rooms, 63); assert.equal(fixture.teachers, 119)
assert.equal(lessons.filter(lesson => lesson.pattern?.some(n => n > 1)).length, 183)
assert.equal(lessons.filter(lesson => lesson.activity && !lesson.fixedOnly).length, 100)

function check(label, locks = fixed, blocks = [], inputLessons = lessons) {
  const before = JSON.stringify({ lessons: inputLessons, locks, blocks }), start = Date.now()
  const result = planning.solvePlannedSchedule(inputLessons, locks, plan, periods, blocks)
  assert.equal(result.status, 'complete', `${label}: ${result.status}`)
  assert.equal(result.solver, 'block_repair')
  const rows = [...locks, ...result.assignments]
  assert.equal(rows.length, 2205)
  assert.equal(verifyCompleteSchedule(inputLessons, rows, plan.days, periods, blocks).length, 0)
  assert.equal(JSON.stringify({ lessons: inputLessons, locks, blocks }), before, 'No mutation of saved timetable or input')
  assert.ok(Date.now() - start < 10000, 'Mixed blocks/activities must not fall back to the 45-second search')
  console.log(`PASS: ${label}; 63 rooms / 119 teachers / 183 double-pattern lessons / 100 flexible activities; ${result.elapsedMs}ms/${result.nodes} moves`)
  return rows
}
const rows = check('previously timed-out mixed school')
// School-shaped simulation: request afternoons for PE and music without changing
// teachers, quotas, rooms, block patterns, fixed activities or the saved input.
const afternoonLessons = lessons.map((lesson, i) => fixture.afternoonSimulationKinds[i]
  ? {...lesson, timePreference:'afternoon', morning:false} : lesson)
const afternoonRows = check('PE/music prefer afternoons', fixed, [], afternoonLessons)
const lunchIndex = periods.findIndex(period => period.is_break)
const afternoonPeriods = new Set(periods.slice(lunchIndex + 1).filter(period => !period.is_break).map(period => period.period))
function sessionStats(rows, kind) {
  const ids = new Set(lessons.filter((_,i) => fixture.afternoonSimulationKinds[i] === kind).map(lesson => lesson.id))
  const selected = rows.filter(row => ids.has(row.lessonId))
  return {periods:selected.length, afternoon:selected.filter(row => afternoonPeriods.has(row.period)).length}
}
for (const kind of ['pe','music']) {
  const before = sessionStats(rows,kind), after = sessionStats(afternoonRows,kind)
  assert.equal(after.periods,kind==='pe'?54:2)
  assert.ok(after.afternoon > before.afternoon,`${kind}: the afternoon request should improve its assigned session`)
  console.log('PASS: afternoon simulation',JSON.stringify({kind,before,after}))
}
// Choose blocked cells from a verified answer's spare teacher time. A valid
// answer is therefore known to exist; no production teacher records are changed.
const byId = new Map(lessons.map(lesson => [lesson.id, lesson])), busy = new Map()
for (const row of rows) for (const teacher of teachers(byId.get(row.lessonId))) {
  const set = busy.get(teacher) || new Set(); set.add(`${row.day}:${row.period}`); busy.set(teacher, set)
}
const cells = plan.days.flatMap(day => periods.filter(period => !period.is_break).map(period => ({ day, period: period.period })))
const blocks = []
for (const [teacherId, used] of [...busy].sort()) {
  const free = cells.filter(cell => !used.has(`${cell.day}:${cell.period}`))
  if (free.length < 2) continue
  blocks.push(...free.slice(-2).map(cell => ({ teacherId, ...cell })))
  if (blocks.length === 60) break
}
assert.equal(blocks.length, 60); assert.equal(new Set(blocks.map(block => block.teacherId)).size, 30)
check('30 teachers with two unavailable periods each', fixed, blocks)
const blockedAfternoon = check('PE/music afternoons with 30 blocked teachers',fixed,blocks,afternoonLessons)
console.log('PASS: afternoon simulation with blocks',JSON.stringify({pe:sessionStats(blockedAfternoon,'pe'),music:sessionStats(blockedAfternoon,'music')}))
// Broader school configuration: explicitly request afternoons for arts/music,
// PE/health and practical career subjects. Core subjects retain their defaults.
const broadKinds=fixture.broadAfternoonSimulationKinds
assert.equal(broadKinds.length,lessons.length)
const broadLessons=lessons.map((lesson,i)=>broadKinds[i]?{...lesson,timePreference:'afternoon',morning:false}:lesson)
const broadRows=check('arts/music, PE/health and career prefer afternoons',fixed,[],broadLessons)
const broadBlockedRows=check('broad afternoon preferences with 30 blocked teachers',fixed,blocks,broadLessons)
for(const kind of ['arts','pe-health','career']){
  const ids=new Set(lessons.filter((_,i)=>broadKinds[i]===kind).map(lesson=>lesson.id))
  const stats=source=>{const selected=source.filter(row=>ids.has(row.lessonId));return {total:selected.length,afternoon:selected.filter(row=>afternoonPeriods.has(row.period)).length}}
  const before=stats(rows),after=stats(broadRows),blocked=stats(broadBlockedRows)
  assert.equal(after.total,kind==='arts'?124:kind==='pe-health'?110:97)
  assert.ok(after.afternoon>before.afternoon,`${kind}: the requested session should improve`)
  console.log('PASS: broad afternoon simulation',JSON.stringify({kind,before,after,blocked}))
}
const requestedLoads=new Map()
for(const [i,lesson] of lessons.entries())if(broadKinds[i]){
  assert.equal(teachers(lesson).length,1)
  for(const teacher of teachers(lesson))requestedLoads.set(teacher,(requestedLoads.get(teacher)||0)+lesson.count)
}
const pmCapacity=plan.days.length*afternoonPeriods.size,tooMany=[...requestedLoads.values()].filter(count=>count>pmCapacity)
assert.equal(pmCapacity,15);assert.equal(tooMany.length,13)
assert.equal(tooMany.reduce((sum,count)=>sum+count-pmCapacity,0),32)
console.log('PASS: broad preferences remain soft; 13 teachers exceed the 15-period afternoon capacity, requiring at least 32 of the requested periods outside afternoons')
const subjectLocks = rows.filter(row => !fixed.includes(row) && byId.get(row.lessonId).pattern?.every(n => n === 1)).slice(0, 10)
check('ten retained single subject cells', [...fixed, ...subjectLocks])

const smallPeriods = [1, 2, 0, 3, 4].map((period, i) => ({ period, is_break: period === 0, start_time: `${8+i}:00`, end_time: `${9+i}:00` }))
const padding = Array.from({ length: 50 }, (_, i) => ({ id: `idle${i}`, classroomId: 'unused', teacherId: null, fixedOnly: true, teacherOptional: true, count: 0, label: 'unused' }))
const double = { id: 'double', classroomId: 'A', teacherId: 'T', count: 2, pattern: [2], label: 'A · คณิตศาสตร์' }
const partial = [{ classroomId: 'A', lessonId: 'double', day: 1, period: 2 }]
assert.equal(solveBlockRepair([double], partial, plan, smallPeriods, [], planning.lessonMorningPriority, 1000, 1000), null)
assert.equal(solveBlockRepair([double], [], {...plan,reduceGaps:true}, smallPeriods, [], planning.lessonMorningPriority, 1000, 1000), null)
const fallback = planning.solvePlannedSchedule([double, ...padding], partial, plan, smallPeriods, [])
assert.equal(fallback.status, 'complete')
assert.equal(verifyCompleteSchedule([double, ...padding], [...partial, ...fallback.assignments], plan.days, smallPeriods, []).length, 0)
const simplePeriods=[1,2,3,0,4,5].map((period,i)=>({period,is_break:period===0,start_time:`${8+i}:00`,end_time:`${9+i}:00`}))
const simpleLessons=['ภาษาไทย','คณิตศาสตร์','วิทยาศาสตร์','พลศึกษา','ดนตรี'].map((name,i)=>({id:`session${i}`,classroomId:'session-room',teacherId:`session-teacher${i}`,count:1,label:name,name,timePreference:i>=3?'afternoon':'any'}))
const simplePlan={...plan,days:[1]}
const simple=planning.solvePlannedSchedule(simpleLessons,[],simplePlan,simplePeriods,[])
assert.equal(simple.status,'complete')
assert.ok(simple.assignments.filter(row=>['session3','session4'].includes(row.lessonId)).every(row=>row.period>=4),'PE and music use afternoons when compatible slots are available')
assert.ok(simple.assignments.filter(row=>['session0','session1','session2'].includes(row.lessonId)).every(row=>row.period<=3))
const afternoonUnavailable=[3,4].flatMap(i=>[4,5].map(period=>({teacherId:`session-teacher${i}`,day:1,period})))
const forcedMorning=planning.solvePlannedSchedule(simpleLessons,[],simplePlan,simplePeriods,afternoonUnavailable)
assert.equal(forcedMorning.status,'complete')
assert.equal(verifyCompleteSchedule(simpleLessons,forcedMorning.assignments,simplePlan.days,simplePeriods,afternoonUnavailable).length,0)
assert.ok(forcedMorning.assignments.filter(row=>['session3','session4'].includes(row.lessonId)).every(row=>row.period<=3),'Afternoon preferences must not override teacher unavailability')
const joint = ['A', 'B'].map(room => ({ id: `joint${room}`, classroomId: room, teacherId: null, teacherIds: ['T1', 'T2'], teacherOptional: true, activity: true, activityGroupId: 'joint', count: 1, label: room }))
const grouped = planning.solvePlannedSchedule([...joint, ...padding], [], plan, smallPeriods, [{ teacherId: 'T1', day: 1, period: 1 }])
assert.equal(grouped.status, 'complete'); assert.equal(grouped.solver, 'block_repair')
assert.equal(verifyCompleteSchedule([...joint, ...padding], grouped.assignments, plan.days, smallPeriods, [{ teacherId: 'T1', day: 1, period: 1 }]).length, 0)
const labs = Array.from({length:6},(_,i)=>({id:`lab${i}`,classroomId:`lab-room${i}`,teacherId:`lab-teacher${i}`,count:4,pattern:[2,2],roomId:'shared-lab',label:'วิทยาศาสตร์',name:'วิทยาศาสตร์'}))
const reservation = [{classroomId:'lab-room0',lessonId:null,day:1,period:1}]
const shared = planning.solvePlannedSchedule([...labs,...padding],reservation,plan,periods,[])
assert.equal(shared.status,'complete');assert.equal(shared.solver,'block_repair')
assert.equal(verifyCompleteSchedule([...labs,...padding],[...reservation,...shared.assignments],plan.days,periods,[]).length,0)
const limited = planning.solvePlannedSchedule(lessons, fixed, plan, periods, [], 1, 1000)
assert.equal(limited.status, 'timeout'); assert.equal(limited.limitReason, 'node_limit'); assert.equal(limited.assignments.length, 0)
const expired = planning.solvePlannedSchedule(lessons, fixed, plan, periods, [], 100000, 0)
assert.equal(expired.status, 'timeout'); assert.equal(expired.assignments.length, 0)
console.log('PASS: joint/multi-teacher synchronization; shared labs with double blocks and empty reservations; locked double fallback; node/time limits never return a partial timetable')
