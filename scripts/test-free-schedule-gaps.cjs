const fs = require('fs')
const vm = require('vm')
const path = require('path')
const ts = require('typescript')
const assert = require('assert/strict')

const cache = {}
function load(file, extra = {}) {
  const abs = path.resolve(file)
  if (cache[abs]) return cache[abs]
  const source = fs.readFileSync(abs, 'utf8')
  const exports = {}
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(compiled, {
    exports,
    module: { exports },
    globalThis,
    crypto,
    require(name) {
      if (extra[name]) return extra[name]
      if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + (name.endsWith('.ts') ? '' : '.ts')))
      if (name.startsWith('.')) {
        const next = path.resolve(path.dirname(abs), name.endsWith('.ts') ? name : `${name}.ts`)
        return load(next)
      }
      return require(name)
    },
  })
  cache[abs] = exports
  return exports
}

const helpers = load('lib/schedule-helpers.ts')
const free = load('lib/schedule-device-free.ts', {
  './schedule-helpers': helpers,
  './schedule-planning': load('lib/schedule-planning.ts', { './schedule-solver': load('lib/schedule-solver.ts') }),
  './schedule-device-build': load('lib/schedule-device-build.ts', {
    './schedule-activity-teams': load('lib/schedule-activity-teams.ts'),
    './schedule-helpers': helpers,
    './schedule-planning': load('lib/schedule-planning.ts', { './schedule-solver': load('lib/schedule-solver.ts') }),
  }),
})
const build = load('lib/schedule-device-build.ts', {
  './schedule-activity-teams': load('lib/schedule-activity-teams.ts'),
  './schedule-helpers': helpers,
  './schedule-planning': load('lib/schedule-planning.ts', { './schedule-solver': load('lib/schedule-solver.ts') }),
})

function plan(extra = {}) {
  return free.normalizePlan({
    teachers: [{ id: 't1', name: 'ครูหนึ่ง' }, { id: 't2', name: 'ครูสอง' }],
    rooms: [{ id: 'r1', label: 'ม.4/1' }, { id: 'r2', label: 'ม.4/2' }],
    places: [{ id: 'lab', name: 'ห้องวิทย์' }],
    days: [1, 2, 3, 4, 5],
    periods: free.withTeachingPeriods(helpers.DEFAULT_PERIOD_TIMES, 7),
    ...extra,
  })
}

;(async () => {
  const seven = free.withTeachingPeriods(helpers.DEFAULT_PERIOD_TIMES, 7)
  assert.equal(seven.filter(row => !row.is_break).length, 7)
  assert.equal(free.slotCapacity({ days: [1, 2, 3, 4, 5], periods: seven }), 35)
  const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected))
  same(free.patternFor(4, 1), [2, 1, 1])
  const imported = free.importSubjectTable('\uFEFFห้อง\tรหัส\tรายวิชา\tครู\tคาบ\tคาบคู่\tสถานที่\nม.4/1\tว30201\tฟิสิกส์\tครูหนึ่ง\t4\t1\tห้องวิทย์', free.normalizePlan())
  assert.ok(!('error' in imported))
  assert.equal(imported.plan.subjects[0].periods, 4)
  same(imported.plan.subjects[0].pattern, [2, 1, 1])
  assert.equal(imported.plan.places[0].name, 'ห้องวิทย์')

  const upper = plan({
    subjects: [{ id: 'math', roomId: 'r1', code: '', name: 'คณิต', teacherId: 't1', periods: 33, pattern: free.patternFor(33, 0), placeId: null }],
    activities: [{ id: 'club', name: 'ชุมนุม', mode: 'joint', roomIds: ['r1'], teacherId: 't2', roomTeachers: {}, cells: [{ day: 5, period: 7 }] }],
  })
  assert.equal(free.roomNeed(upper, 'r1'), 34)
  const upperDraft = build.buildDeviceDraft(free.toDeviceSnapshot(upper, ['r1']), 'local', ['r1'], true)
  assert.equal(upperDraft.status, 'complete', upperDraft.issues[0]?.message || upperDraft.message)
  assert.equal(upperDraft.rows.filter(row => row.class_subject_id === 'math').length, 33)
  assert.ok(upperDraft.rows.some(row => row.activity_id && row.day_of_week === 5 && row.period === 7))

  const doubles = plan({
    subjects: [{ id: 'sci', roomId: 'r1', code: '', name: 'วิทย์ปฏิบัติ', teacherId: 't1', periods: 2, pattern: [2], placeId: null }],
  })
  const doubleDraft = build.buildDeviceDraft(free.toDeviceSnapshot(doubles, ['r1']), 'local', ['r1'], true)
  assert.equal(doubleDraft.status, 'complete', doubleDraft.issues[0]?.message || doubleDraft.message)
  const placed = doubleDraft.rows.filter(row => row.class_subject_id === 'sci').sort((a, b) => a.period - b.period)
  assert.equal(placed.length, 2)
  assert.equal(placed[0].day_of_week, placed[1].day_of_week)
  assert.equal(placed[1].period, placed[0].period + 1)

  const venue = plan({
    subjects: [
      { id: 'a', roomId: 'r1', code: '', name: 'วิทย์ 1', teacherId: 't1', periods: 1, pattern: [1], placeId: 'lab' },
      { id: 'b', roomId: 'r2', code: '', name: 'วิทย์ 2', teacherId: 't2', periods: 1, pattern: [1], placeId: 'lab' },
    ],
  })
  const venueDraft = build.buildDeviceDraft(free.toDeviceSnapshot(venue, ['r1', 'r2']), 'local', ['r1', 'r2'], true)
  assert.equal(venueDraft.status, 'complete', venueDraft.issues[0]?.message || venueDraft.message)
  const a = venueDraft.rows.find(row => row.class_subject_id === 'a')
  const b = venueDraft.rows.find(row => row.class_subject_id === 'b')
  assert.ok(!(a.day_of_week === b.day_of_week && a.period === b.period))

  const homeroom = plan({
    subjects: [
      { id: 's1', roomId: 'r1', code: '', name: 'คณิต', teacherId: 't1', periods: 1, pattern: [1], placeId: null },
      { id: 's2', roomId: 'r2', code: '', name: 'คณิต', teacherId: 't2', periods: 1, pattern: [1], placeId: null },
    ],
    activities: [{ id: 'hr', name: 'โฮมรูม', mode: 'separate', roomIds: ['r1', 'r2'], teacherId: '', roomTeachers: { r1: 't1', r2: 't2' }, cells: [{ day: 1, period: 1 }] }],
  })
  const homeDraft = build.buildDeviceDraft(free.toDeviceSnapshot(homeroom, ['r1', 'r2']), 'local', ['r1', 'r2'], true)
  assert.equal(homeDraft.status, 'complete', homeDraft.issues[0]?.message || homeDraft.message)
  assert.ok(homeDraft.rows.some(row => row.classroom_id === 'r1' && row.period === 1 && row.activity_id && !row.class_subject_id))
  assert.ok(homeDraft.rows.some(row => row.classroom_id === 'r2' && row.period === 1 && row.activity_id && !row.class_subject_id))

  const locked = plan({
    subjects: [{ id: 'thai', roomId: 'r1', code: '', name: 'ไทย', teacherId: 't1', periods: 2, pattern: [1, 1], placeId: null }],
    timetable: [{ classroomId: 'r1', day: 1, period: 3, subjectId: 'thai', locked: true }],
  })
  const lockDraft = build.buildDeviceDraft(free.toDeviceSnapshot(locked, ['r1']), 'local', ['r1'], true)
  assert.equal(lockDraft.status, 'complete', lockDraft.issues[0]?.message || lockDraft.message)
  assert.ok(lockDraft.rows.some(row => row.class_subject_id === 'thai' && row.day_of_week === 1 && row.period === 3 && row.locked))
  assert.equal(lockDraft.rows.filter(row => row.class_subject_id === 'thai').length, 2)

  const term2 = free.copyTermSubjects(upper, free.normalizePlan({ teachers: upper.teachers, rooms: upper.rooms, places: upper.places, periods: upper.periods }))
  assert.equal(term2.subjects[0].name, 'คณิต')
  assert.equal(term2.timetable.length, 0)
  assert.equal(term2.activities[0].name, 'ชุมนุม')

  console.log('PASS: free schedule covers 7 periods, doubles, shared rooms, per-room activities, lock, import, term copy')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
