/* eslint-disable @typescript-eslint/no-require-imports -- Run the TS solver in isolated CommonJS test contexts. */
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const ts = require('typescript'), assert = require('node:assert/strict')
const cache = new Map()
function load(file) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute)
  const exports = {}; cache.set(absolute, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText, { exports, Date, console, require(name) {
    if (name.startsWith('.')) return load(path.resolve(path.dirname(absolute), name + '.ts'))
    throw Error('Unexpected dependency ' + name)
  } })
  return exports
}
const planning = load('lib/schedule-planning.ts')
const verify = load('lib/schedule-verification.ts').verifyCompleteSchedule
const { findSlotBottleneck, remainingSlotCapacityIssues } = load('lib/schedule-resource-capacity.ts')
function scenario() {
  const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/schedule-six-room-subset-capacity.json', 'utf8'))
  const groups = fixture.teachingGroups.map((group, i) => ({
    id: '00000000-0000-0000-0000-' + String(i + 1).padStart(12, '0'),
    lessonIds: group.lessonIndices.map(n => 'L' + n), cells: group.cells,
  }))
  const lessons = load('lib/schedule-joint-teaching.ts').withJointTeachingGroups(fixture.lessons.map(([
    room, teachers, count, pattern, fixedOnly, activity, group, venue, priority, spread,
  ], i) => ({
    id: 'L' + i, classroomId: 'R' + room,
    teacherId: !activity && teachers.length === 1 ? 'T' + teachers[0] : null,
    teacherIds: activity || teachers.length > 1 ? teachers.map(n => 'T' + n) : undefined,
    teacherName: teachers.map(n => 'ทดสอบ ' + n).join(', '),
    count, pattern: pattern || undefined, fixedOnly, activity, teacherOptional: activity,
    activityGroupId: group < 0 ? undefined : 'G' + group, roomId: venue < 0 ? null : 'V' + venue,
    label: 'R' + room + ' · วิชา ' + i, spread,
    name: priority === 2 ? 'คณิตศาสตร์' : priority === 1 ? 'ภาษาอังกฤษ' : 'การงานอาชีพ',
  })), { teachingGroups: groups }, true)
  return { fixture, lessons, fixed: fixture.fixed.map(([room, lesson, day, period]) => ({
    classroomId: 'R' + room, lessonId: lesson < 0 ? null : 'L' + lesson, day, period,
  })), plan: { ...planning.emptyPlan(), days: fixture.days, teachingGroups: groups } }
}
const original = scenario(), before = JSON.stringify(original), started = Date.now()
const issues = planning.checkPlanning(original.lessons, original.fixed, original.plan.days, original.fixture.periods, [])
assert.ok(issues.some(issue => issue.message.includes('12 คาบ') && issue.message.includes('11 ช่อง')))
assert.ok(issues.some(issue => issue.message.includes('ทดสอบ 4')), 'Identify the teacher with the subset shortage')
assert.ok(issues.some(issue => issue.details?.filter(line => line.includes('ยังต้องจัด')).length === 9))
assert.ok(issues.some(issue => issue.details?.some(line => line.includes('ไม่ใช่ภาระสอนรวมทั้งหมด'))))
const help = issues.find(issue => issue.capacity)?.capacity
assert.ok(help); assert.equal(help.kind, 'teacher'); assert.equal(help.needed, 12); assert.equal(help.available, 11)
assert.equal(help.weekly.subjects, 26); assert.equal(help.weekly.activities, 3); assert.equal(help.weekly.total, 29)
assert.equal(help.weekly.slots, 30); assert.equal(help.rooms.length, 3)
assert.equal(help.suggestion.day, 2); assert.equal(help.suggestion.period, 4)
assert.ok(help.suggestion.lesson.startsWith('R3 · '), 'Suggest the movable PE period in another classroom, never a shared session or configured activity')
const rejected = planning.solvePlannedSchedule(original.lessons, original.fixed, original.plan, original.fixture.periods, [])
assert.equal(rejected.status, 'invalid'); assert.equal(rejected.assignments.length, 0)
assert.ok(Date.now() - started < 1000, 'Detect this subset during preflight without the 45-second search')
assert.equal(JSON.stringify(original), before)
console.log('PASS: reported six-room / seven-teacher case detects the 12-period/11-slot subset; all 80 retained cells untouched')

const released = scenario(), cell = released.fixed.find(row => row.classroomId === 'R3' && row.day === 2 && row.period === 4)
assert.ok(cell); released.fixed = released.fixed.filter(row => row !== cell)
const releasedBefore = JSON.stringify(released), releasedAt = Date.now()
const answer = planning.solvePlannedSchedule(released.lessons, released.fixed, released.plan, released.fixture.periods, [])
assert.equal(answer.status, 'complete')
assert.equal([...released.fixed, ...answer.assignments].length, 178)
assert.equal(verify(released.lessons, [...released.fixed, ...answer.assignments], released.plan.days, released.fixture.periods, []).length, 0)
assert.equal(JSON.stringify(released), releasedBefore)
assert.ok(Date.now() - releasedAt < 10000)
console.log('PASS: releasing only Tuesday period 4 PE gives 178 verified cells; all other 79 locks retained; ' + answer.elapsedMs + 'ms')

function brute(demands) {
  const rows = demands.flatMap(d => Array.from({ length: d.count }, () => d.slots))
  function search(at, used) {
    if (at === rows.length) return true
    for (const slot of rows[at]) if (!used.has(slot)) {
      used.add(slot); if (search(at + 1, used)) return true; used.delete(slot)
    }
    return false
  }
  return search(0, new Set())
}
let seed = 12345
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
for (let trial = 0; trial < 500; trial++) {
  const demands = Array.from({ length: 1 + Math.floor(random() * 4) }, () => ({
    count: 1 + Math.floor(random() * 2), slots: [0, 1, 2, 3, 4, 5].filter(() => random() < .6),
  }))
  const copy = JSON.stringify(demands), witness = findSlotBottleneck(demands)
  assert.equal(witness === null, brute(demands), 'Matching must agree with exhaustive search in trial ' + trial)
  assert.equal(JSON.stringify(demands), copy)
  if (witness) {
    const selected = Array.from(witness.indices, i => demands[i]), slots = new Set(selected.flatMap(d => d.slots))
    assert.equal(witness.need, selected.reduce((sum, d) => sum + d.count, 0))
    assert.equal(witness.slots.length, slots.size); assert.ok(witness.need > slots.size)
  }
}
console.log('PASS: 500 randomized matching problems agree with exhaustive search; every shortage has a checkable subset witness')

// The capacity model is deliberately optimistic about pairs and shared groups.
// It must never reject a known complete solution because a double was partly
// retained or because a shared teacher/venue was counted once per classroom.
const times = [1, 2, 3].map((period, i) => ({ period, is_break: false, start_time: `0${8+i}:00`, end_time: `${9+i}:00` }))
const double = { id: 'double', classroomId: 'A', teacherId: 'T', count: 2, pattern: [2], label: 'A · double' }
assert.equal(remainingSlotCapacityIssues([double], [{ classroomId: 'A', lessonId: 'double', day: 1, period: 1 }], [1], times, []).length, 0)
const shared = ['A', 'B'].map(id => ({ id, classroomId: id, teacherId: 'T', roomId: 'V', count: 3, pattern: [1, 1, 1], label: id, activityGroupId: 'teaching:g' }))
assert.equal(remainingSlotCapacityIssues(shared, [], [1, 2, 3], times.slice(0, 1), []).length, 0)
assert.equal(remainingSlotCapacityIssues(shared, [{ classroomId: 'A', lessonId: 'A', day: 1, period: 1 }], [1, 2, 3], times.slice(0, 1), []).length, 0)
console.log('PASS: partial doubles and synchronized groups never become false capacity deficits; joint teachers and venues count once')

for (let trial = 0; trial < 100; trial++) {
  const rows = [], lessons = new Map()
  for (const day of [1, 2, 3, 4, 5]) for (const period of [1, 2, 3]) for (let room = 0; room < 3; room++) {
    const teacher = (room + period + day + trial) % 4, id = `r${room}t${teacher}`
    if (!lessons.has(id)) lessons.set(id, { id, classroomId: 'R' + room, teacherId: 'T' + teacher, roomId: 'V' + teacher, count: 0, pattern: [], label: id })
    const lesson = lessons.get(id); lesson.count++; lesson.pattern.push(1)
    rows.push({ classroomId: lesson.classroomId, lessonId: id, day, period })
  }
  const offered = [...lessons.values()], retained = rows.filter(() => random() < .6)
  const blocks = [1, 2, 3, 4, 5].flatMap(day => [1, 2, 3].flatMap(period => [0, 1, 2, 3].flatMap(teacher =>
    rows.some(row => row.day === day && row.period === period && lessons.get(row.lessonId).teacherId === 'T' + teacher) ? [] : [{ teacherId: 'T' + teacher, day, period }])))
  assert.equal(verify(offered, rows, [1, 2, 3, 4, 5], times, blocks).length, 0)
  assert.equal(remainingSlotCapacityIssues(offered, retained, [1, 2, 3, 4, 5], times, blocks).length, 0,
    'Never reject a partially locked input with a known complete timetable in trial ' + trial)
}
console.log('PASS: 100 known feasible timetables with randomized locks, teacher blocks and shared venues have no false capacity errors')
