import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'
function load(file, deps = {}, footer = '') {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8') + footer, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => name === 'react/jsx-runtime' ? jsxRuntime : deps[name] || {} })
  return exports
}
const teams = load('lib/schedule-activity-teams.ts'), helpers = load('lib/schedule-helpers.ts'), summary = load('lib/schedule-workload.ts', { './schedule-activity-teams': teams, './schedule-helpers': helpers })
const teacher = id => ({ id, prefix: 'ครู ', full_name: `ตัวอย่าง${id} ใจดี`, position: null, school_id: 'school', role: 'teacher' })
const teachers = ['T1', 'T2', 'T3', 'idle'].map(teacher)
const lesson = (id, classroomId, teacherId, count, extra = {}) => ({ id, classroomId, teacherId, count, activity: false, ...extra })
const slot = (id, room, day, period, activity = false) => ({ classroom_id: room, day_of_week: day, period, class_subject_id: activity ? null : id, activity_id: activity ? id : null })
const data = { lessons: [lesson('mathA', 'A', 'T1', 3), lesson('mathB', 'B', 'T1', 2), lesson('art', 'A', 'T2', 1), lesson('unassigned', 'C', null, 4),
  lesson('activity:jointA', 'A', null, 2, { activity: true, subjectId: 'guide', teacherIds: ['T1', 'T2'] }), lesson('activity:jointB', 'B', null, 2, { activity: true, subjectId: 'guide', teacherIds: ['T1', 'T2'] }),
  lesson('activity:legacy', 'C', 'T3', 0, { activity: true, subjectId: 'legacy' })],
  slots: [slot('mathA', 'A', 1, 1), slot('mathB', 'B', 1, 2), slot('art', 'A', 3, 1), slot('legacy', 'C', 5, 4, true), ...[1, 2].flatMap(day => [slot('jointA', 'A', day, 3, true), slot('jointB', 'B', day, 3, true)])],
  activityGroups: [{ id: 'joint', settingId: 'guide', mode: 'joint', roomIds: ['A', 'B'], teacherIds: ['T1', 'T2'], roomTeachers: {}, weeklyPeriods: 2, cells: [] },
    { id: 'separate', settingId: 'club', mode: 'separate', roomIds: ['A', 'B'], teacherIds: [], roomTeachers: { A: ['T2'], B: ['T2'] }, weeklyPeriods: 1, cells: [] },
    { id: 'fixed', settingId: 'fixed', mode: 'joint', roomIds: ['A'], teacherIds: ['T3'], roomTeachers: {}, weeklyPeriods: 1, cells: [{ day: 1, period: 1 }] }] }
const before = JSON.stringify(data), rows = summary.summarizeScheduleWorkload(data, teachers), byId = new Map(rows.map(row => [row.id, row]))
assert.equal(JSON.stringify(data), before)
assert.equal(rows.length, 3)
for (const [id, hours, subjects, activities, scheduled, remaining] of [['T1', 7, 5, 2, 3, 4], ['T2', 5, 1, 4, 3, 2], ['T3', 2, 0, 2, 2, 0]]) {
  const row = byId.get(id)
  assert.deepEqual([row.hours, row.subject_hours, row.activity_hours, row.scheduled_hours, row.remaining], [hours, subjects, activities, scheduled, remaining])
  assert.ok(row.name.startsWith('ครูตัวอย่าง'))
}
const unplaced = summary.summarizeScheduleWorkload({ ...data, slots: [] }, teachers)
assert.equal(unplaced.find(row => row.id === 'T1').hours, 7, 'Assignments remain visible before automatic generation')
assert.equal(unplaced.find(row => row.id === 'T1').scheduled_hours, 0)
console.log('PASS: assigned and scheduled workloads; flexible/joint/separate/legacy activities; effective pinned overlays; teacher-name prefixes; immutable inputs')

let session = { schoolId: 'school', role: 'admin' }, failTeachers = false, loads = 0
const filters = []
const query = { select() { return query }, eq(key, value) { filters.push([key, value]); return query }, in() { return query }, order() { return query }, then(resolve) { return Promise.resolve({ data: teachers, error: failTeachers ? { message: 'offline' } : null }).then(resolve) } }
const api = load('app/(shell)/schedules/extended-actions.ts', {
  '@/lib/session': { getSession: async () => session }, '@/lib/schedules': { SCHEDULE_VIEW_ROLES: ['admin', 'teacher'] },
  '@/lib/supabase': { createServerClient: () => ({ from(table) { assert.equal(table, 'users'); return query } }) },
  '@/lib/schedule-store': { loadSchedule: async (school, year, term) => { loads++; assert.equal(school, 'school'); assert.equal(year, 'year'); assert.equal(term, 2); return data } },
  '@/lib/schedule-workload': summary,
})
assert.equal((await api.fetchScheduleWorkload('year', 2)).length, 3)
assert.ok(filters.some(([key, value]) => key === 'school_id' && value === 'school'))
failTeachers = true; await assert.rejects(api.fetchScheduleWorkload('year', 2), /โหลดรายชื่อครู/)
const previousLoads = loads; session = null; await assert.rejects(api.fetchScheduleWorkload('year', 2), /ไม่มีสิทธิ์/); assert.equal(loads, previousLoads)
session = { schoolId: null, role: 'admin' }; await assert.rejects(api.fetchScheduleWorkload('year', 2), /ไม่พบโรงเรียน/)
console.log('PASS: workload report authorization, year/term/school scope and explicit read failures')

const navigation = load('components/layout/Sidebar.tsx', {}, '\nexport { buildNav };')
for (const role of ['admin', 'principal', 'academic_head', 'teacher']) {
  for (const homeroom of [false, true]) {
    const paths = []
    function visit(items, parents = []) {
      for (const item of items) {
        const path = [...parents, item.label]
        if (item.href === '/schedules/workload') paths.push(path)
        visit(item.items || item.children || [], path)
      }
    }
    visit(navigation.buildNav(role, homeroom))
    assert.equal(paths.length, 1, `${role}: one workload link`)
    assert.ok(paths[0].includes('พิมพ์เอกสาร'), `${role}: workload under document printing`)
  }
}
console.log('PASS: workload menu moved under document printing for all existing school roles')
