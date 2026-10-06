/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS regression runner. */
const fs = require('fs'), ts = require('typescript'), assert = require('node:assert/strict')
function load(path, imports = {}) { const m = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(name => imports[name] || {}, m, m.exports); return m.exports }
const hourly = load('lib/hourly-attendance.ts')
const report = load('lib/subject-hourly-report.ts', { '@/lib/hourly-attendance': hourly })
for (const [hours, hpw] of [[40, 1], [80, 2], [120, 3], [160, 4], [200, 5], [240, 6]]) {
  for (const weeks of [18, 20]) assert.equal(hourly.hoursPerWeek(hours, weeks), hpw)
  assert.equal(report.displaySlotsPerWeek(true, hpw), hpw)
  assert.equal(report.displaySlotsPerWeek(false, hpw), hpw)
  assert.equal(report.primaryGlobalSlotNumber(20, hpw, hpw), 20 * hpw)
}
const teachingWeeks = report.subjectHourlyTermWeeks('2026-05-16', '2026-10-09')
assert.equal(teachingWeeks.length, 20)
assert.equal(teachingWeeks.length * report.subjectHourlyHpw(40, teachingWeeks), 20)
let failInsert = false, failDelete = false
const tables = {
  academic_years: [{ id: 'year', school_id: 'school', year_be: 2569, term1_start_date: '2026-05-16', term1_end_date: '2026-10-09' }],
  subjects: [{ id: 'curriculum', hours_per_year: 40 }],
  class_subjects: [{ id: 'subject', subject_id: 'curriculum', classroom_id: 'room', academic_year_id: 'year', subjects: { code: 'ส15221', name: 'ต้านทุจริตศึกษา5', hours_per_year: 40 } }],
  students: [{ id: 'student', classroom_id: 'room', student_number: 1 }],
  holidays: [], weekend_school_days: [], class_schedule_slots: [{ classroom_id: 'room', academic_year_id: 'year', class_subject_id: 'subject', semester: 1, period: 1 }],
  hourly_attendance: [{ id: 'old', student_id: 'student', class_subject_id: 'subject', term: 1, week_number: 1, hour_number: 5, status: 'ข', date: '2026-05-18' }],
}
const db = { from(table) {
  let filters = [], operation = 'select', rows, offset = 0, end = Infinity
  function execute() {
    const found = (tables[table] || []).filter(row => filters.every(match => match(row)))
    if (operation === 'insert') {
      if (failInsert) return { error: { message: 'insert failed' }, data: null }
      if (tables[table].some(row => row.student_id === rows.student_id && row.class_subject_id === rows.class_subject_id && row.date === rows.date && row.hour_number === rows.hour_number)) return { error: { message: 'duplicate' }, data: null }
      tables[table].push({ ...rows, id: 'new-' + tables[table].length }); return { error: null, data: [rows] }
    }
    if (operation === 'delete') {
      if (failDelete) return { error: { message: 'delete failed' }, data: null }
      tables[table] = tables[table].filter(row => !found.includes(row))
    }
    return { data: found.slice(offset, end + 1), error: null, count: found.length }
  }
  const chain = {
    select() { return chain }, eq(key, val) { filters.push(row => row[key] === val); return chain },
    gte(key, val) { filters.push(row => row[key] >= val); return chain }, lte(key, val) { filters.push(row => row[key] <= val); return chain },
    in(key, values) { filters.push(row => values.includes(row[key])); return chain }, order() { return chain },
    range(from, to) { offset = from; end = to; return chain }, insert(value) { operation = 'insert'; rows = value; return chain },
    delete() { operation = 'delete'; return chain }, maybeSingle: async () => { const result = execute(); return { ...result, data: result.data?.[0] || null } },
    then: (resolve, reject) => Promise.resolve(execute()).then(resolve, reject),
  }; return chain
} }
const actions = load('app/(shell)/attendance/actions.ts', {
  '@/lib/supabase': { createServerClient: () => db }, '@/lib/session': { getSession: async () => ({ role: 'admin', schoolId: 'school', userId: 'teacher' }) },
  '@/lib/hourly-attendance': hourly, '@/lib/supabase-paginate': load('lib/supabase-paginate.ts'),
  '@/lib/audit': { logActivity: async () => {}, resolveClassSubjectContext: async () => ({ schoolId: 'school' }) },
})
const base = { classroomId: 'room', classSubjectId: 'subject', academicYearId: 'year', term: 1 }
;(async () => {
  assert.match((await actions.saveHourlyCell({ ...base, studentId: 'student', weekNumber: 1, slot: 5, anchorDate: '2026-05-18', status: 'ข' })).error, /เกินเวลาเรียน/)
  const grid = await actions.fetchHourlyGrid(base)
  assert.equal(grid.hoursPerWeek, 1); assert.equal(grid.weeks.length, 20); assert.equal(grid.legacyRecords.length, 1); assert.equal(grid.scheduleWarning, '')
  tables.class_schedule_slots.push({ ...tables.class_schedule_slots[0], period: 2 })
  assert.match((await actions.fetchHourlyGrid(base)).scheduleWarning, /2 คาบ.*1 คาบ/)
  await actions.fillHourlyPresentAll(base)
  assert.ok(tables.hourly_attendance.some(row => row.id === 'old'), 'Fill present must preserve legacy slots')
  await actions.clearHourlyAttendanceAll(base)
  assert.ok(tables.hourly_attendance.some(row => row.id === 'old'), 'Clear current grid must preserve legacy slots')
  const move = { ...base, recordId: 'old', weekNumber: 1, slot: 1 }
  failInsert = true
  assert.match((await actions.moveLegacyHourlyRecord(move)).error, /ข้อมูลเดิมยังอยู่/)
  assert.equal(tables.hourly_attendance.length, 1)
  failInsert = false; failDelete = true
  assert.match((await actions.moveLegacyHourlyRecord(move)).error, /ทั้งสองรายการยังอยู่/)
  assert.equal(tables.hourly_attendance.length, 2)
  assert.match((await actions.moveLegacyHourlyRecord(move)).error, /ปลายทางมีข้อมูล/)
  failDelete = false
  assert.equal((await actions.moveLegacyHourlyRecord({ ...move, weekNumber: 2 })).error, null)
  assert.ok(!tables.hourly_attendance.some(row => row.id === 'old'))
  assert.ok(tables.hourly_attendance.some(row => row.week_number === 2 && row.hour_number === 1 && row.status === 'ข'))
  const statuses = teachingWeeks.map(week => hourly.resolveHourlyStatus(grid.records[hourly.hourlyCellKey('student', week.weekNumber, 1)]))
  assert.equal(hourly.summarizeHourlyStatuses(statuses).total, 20)
  console.log('Hourly curriculum tests passed: real 1–6 weekly slots, 20 term slots, report numbering, schedule warnings, legacy preservation and safe move failures.')
})().catch(error => { console.error(error); process.exitCode = 1 })
