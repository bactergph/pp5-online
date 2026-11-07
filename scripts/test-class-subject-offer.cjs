const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function load(file) {
  const api = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports: api })
  return api
}

const offer = load('lib/class-subject-offer.ts')
const roster = load('lib/substitute-roster.ts')

assert.equal(JSON.stringify(offer.readContentUnits([{ name: ' ฟิสิกส์ ' }, 'เคมี', 'ชีวะ', ''])), JSON.stringify(['ฟิสิกส์', 'เคมี']))
assert.equal(offer.subjectWithUnits('วิทยาศาสตร์', ['ฟิสิกส์', 'เคมี']), 'วิทยาศาสตร์ (ฟิสิกส์ · เคมี)')
assert.throws(() => offer.assertContentUnits(['ยาว'.repeat(41)]), /80/)
assert.throws(() => offer.assertContentUnits(['หนึ่ง', 'สอง', 'สาม']), /2/)
assert.equal(JSON.stringify(offer.assertScoreTerms([2, 1, 2])), JSON.stringify([1, 2]))
assert.throws(() => offer.assertScoreTerms([]), /อย่างน้อย 1/)
assert.equal(offer.scoreTermVisible(0, [2], 1), false)
assert.equal(offer.scoreTermVisible(0, [2], 2), true)
assert.equal(offer.scoreTermVisible(1, [1, 2], 2), false)
assert.equal(offer.scoreTermVisible(2, [1], 2), true)
const teachers = offer.splitOfferingTeachers(['a', 'a', 'b'])
assert.equal(JSON.stringify(teachers), JSON.stringify({ teacherId: 'a', coTeacherIds: ['b'] }))
assert.equal(offer.teacherOwnsOffering({ teacher_id: 'a', co_teacher_ids: ['b'] }, 'b'), true)
assert.equal(offer.teacherOwnsOffering({ teacher_id: 'a', co_teacher_ids: ['b'] }, 'c'), false)
assert.throws(() => offer.splitOfferingTeachers(['1', '2', '3', '4', '5', '6', '7']), /6/)
assert.equal(offer.weeklyOfferingPeriods('ป.5', 0, 120), 3)
const units = offer.assertContentUnitRows([
  { name: 'วิทยาศาสตร์', periods: 2, useMainTeacher: true },
  { name: 'คอมพิวเตอร์', periods: 1, useMainTeacher: false, teacherId: 'teacher-com' },
], 3)
assert.equal(JSON.stringify(units.map(unit => [unit.name, unit.periods, unit.useMainTeacher, unit.teacherId])), JSON.stringify([['วิทยาศาสตร์', 2, true, null], ['คอมพิวเตอร์', 1, false, 'teacher-com']]))
assert.throws(() => offer.assertContentUnitRows([{ name: 'พลศึกษา', periods: 1, useMainTeacher: true }, { name: 'สุขศึกษา', periods: 2, useMainTeacher: true }], 2), /2 คาบ/)
assert.equal(offer.scheduledLessonId({ class_subject_id: 'abc', note: 'unit:1' }), 'abc#1')
const slots = [
  { class_subject_id: 'abc', activity_id: null, day_of_week: 1, period: 1, note: null },
  { class_subject_id: 'abc', activity_id: null, day_of_week: 2, period: 1, note: null },
  { class_subject_id: 'abc', activity_id: null, day_of_week: 3, period: 1, note: 'unit:1' },
]
offer.assignScheduledUnits(slots, [{ id: 'abc#0', count: 1 }, { id: 'abc#1', count: 2 }])
assert.equal(JSON.stringify(slots.map(slot => slot.content_unit)), JSON.stringify([0, 1, 1]))

const busy = [
  { teacherId: 'a', period: 1, kind: 'lesson' },
  { teacherId: 'a', period: 1, kind: 'activity' },
  { teacherId: 'a', period: 2, kind: 'block' },
  { teacherId: 'b', period: 3, kind: 'lesson' },
]
assert.equal(roster.teachingPeriodCount(busy, 'a'), 1)
assert.equal(roster.teachingPeriodCount(busy, 'b'), 1)
assert.equal(JSON.stringify(roster.summarizeSubstituteTeachers([
  { entries: [{ substitute_teacher_id: 'b' }, { substitute_teacher_id: 'a' }, { substitute_teacher_id: null }] },
  { entries: [{ substitute_teacher_id: 'a' }] },
])), JSON.stringify([{ teacherId: 'a', periods: 2 }, { teacherId: 'b', periods: 1 }]))

console.log('PASS: content units, score terms, co-teachers, substitute period counts and term stats')
