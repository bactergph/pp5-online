const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const api = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/daily-attendance.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: api, Intl, Date })
const { dailyCellText: cell, summarizeDailyStatuses: summary, dailyAttendanceToday: today, syncedActivityDone: done } = api
const asOf = '2026-11-03'
assert.equal(cell(undefined, '2026-11-02', asOf), '✓')
assert.equal(cell(undefined, asOf, asOf), '✓')
assert.equal(cell(undefined, '2026-11-04', asOf), '')
assert.equal(cell(undefined, '2026-12-01', asOf), '')
assert.equal(cell(undefined, '2026-10-30', asOf), '✓')
assert.equal(cell('ม', '2026-11-04', asOf), '✓', 'Saved present still displays as a check')
for (const value of ['ล', 'ป', 'ข']) {
  assert.equal(cell(value, '2026-11-04', asOf), value, 'Never hide explicit saved records')
}
assert.equal(cell('-', asOf, asOf), '')
assert.equal(cell('-', '2026-11-04', asOf), '')
const records = { 2: 'ล', 5: 'ข', 6: '-' }, before = JSON.stringify(records)
assert.deepEqual({ ...summary([2, 3, 4, 5, 6], records, '2026-11', asOf) }, { ม: 1, ป: 0, ล: 1, ข: 1 })
assert.equal(JSON.stringify(records), before, 'Display never creates or edits database rows')
assert.equal(summary([2, 3, 4], {}, '2026-11', '2026-11-04').ม, 3, 'Next day defaults advance without writes')
assert.equal(summary([1, 2], {}, '2026-12', asOf).ม, 0)
assert.equal(cell(undefined), '✓', 'Undated sparse readers show present as a check')
assert.equal(api.toDailyDb('ม'), 'ม')
assert.equal(today(new Date('2026-11-02T16:59:59Z')), '2026-11-02')
assert.equal(today(new Date('2026-11-02T17:00:00Z')), '2026-11-03', 'Cutoff follows Thailand midnight, not UTC')
assert.equal(done(undefined, '2026-11-02', asOf), true)
assert.equal(done(undefined, asOf, asOf), true)
assert.equal(done(undefined, '2026-11-04', asOf), false)
assert.equal(done('ข', '2026-11-02', asOf), false)
assert.equal(done('ม', '2026-11-04', asOf), true, 'An explicit saved present still counts')
assert.equal(done('-', asOf, asOf), false)
console.log('PASS: today-inclusive display, future defaults blank, saved rows preserved, totals, rollover and Bangkok midnight')
