const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
}
function load(filename, source) {
  const compiled = new Module(filename, module)
  compiled.filename = filename
  compiled.paths = Module._nodeModulePaths(path.dirname(filename))
  Module._cache[filename] = compiled
  compiled._compile(compile(source), filename)
  return compiled.exports
}
const root = path.resolve(__dirname, '..')
const dailyFile = path.join(root, 'lib/daily-attendance.ts')
const homeFile = path.join(root, 'lib/homeroom-activity.ts')
load(dailyFile, fs.readFileSync(dailyFile, 'utf8'))
const original = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === '@/lib/daily-attendance') return dailyFile
  return original.call(this, request, parent, isMain, options)
}
const api = load(homeFile, fs.readFileSync(homeFile, 'utf8'))

assert.equal(api.homeroomClassTitle('ป.3', 2), 'ชั้นประถมศึกษาปีที่ 3 ห้อง 2')
assert.equal(api.homeroomClassTitle('ม.1', 1), 'ชั้นมัธยมศึกษาปีที่ 1 ห้อง 1')
assert.equal(api.thaiHomeroomDate('2024-10-28'), 'วันจันทร์ที่ 28 ตุลาคม พ.ศ. 2567')
assert.equal(api.homeroomWeekKey('2024-10-30'), api.homeroomWeekKey('2024-10-28'))
assert.deepEqual(api.groupHomeroomWeeks(['2024-11-01', '2024-10-28', '2024-11-04']), [['2024-10-28', '2024-11-01'], ['2024-11-04']])
assert.deepEqual(api.normalizeHomeroomTopics(['  ระเบียบวินัย  ', '', '  การออกกำลังกาย  ', 'เกิน']), ['ระเบียบวินัย', 'การออกกำลังกาย'])
assert.equal(api.homeroomCountText(0), '-')
assert.equal(api.homeroomCountText(3), '3')
assert.deepEqual(api.homeroomDayAttendance(['ม', 'ล', 'ข', 'ป', '-'], '2024-10-28', '2024-10-28'), {
  total: 5, present: 1, leave: 1, absent: 1, sick: 1,
})
assert.equal(api.homeroomDayAttendance([null], '2024-11-20', '2024-10-28').present, 0)
console.log('PASS: homeroom activity topics, weeks and attendance counts')
