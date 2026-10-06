/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test runner loads TypeScript fixtures. */
const fs = require('fs')
const ts = require('typescript')
const assert = require('node:assert/strict')
const XLSX = require('xlsx')
const compiled = ts.transpileModule(fs.readFileSync('lib/score-transfer.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const moduleStub = { exports: {} }
new Function('module', 'exports', compiled)(moduleStub, moduleStub.exports)
const { scoreTransferData, parseScoreTransfer } = moduleStub.exports
const students = [{ id: 'student-a', student_number: 1, prefix: 'เด็กชาย', first_name: 'ทดสอบ', last_name: 'หนึ่ง' }, { id: 'student-b', student_number: 2, prefix: null, first_name: 'ทดสอบ', last_name: 'สอง' }]
const config = { between_scores: [20, 30], midterm_max: 20, final_max: 30 }
const rows = { 'student-a': { unit_scores: [0, 12.5], midterm: 0, final: 29, result: 'เรียน' }, 'student-b': { unit_scores: [NaN, 30], midterm: null, final: null, result: 'ร' } }
const results = ['เรียน', 'ร', 'มส', 'มผ']
function roundtrip(term, cfg = config) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(scoreTransferData(students, rows, cfg, term)), 'คะแนน')
  const read = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
  return XLSX.utils.sheet_to_json(read.Sheets['คะแนน'], { header: 1, defval: '', raw: true })
}
const data = roundtrip(2)
const parsed = parseScoreTransfer(data, students, config, 2, results)
assert.equal(parsed['student-a'].unit_scores[0], 0)
assert.equal(parsed['student-a'].unit_scores[1], 12.5)
assert.equal(parsed['student-a'].midterm, 0)
assert.ok(Number.isNaN(parsed['student-b'].unit_scores[0]))
assert.equal(parsed['student-b'].final, null)
assert.equal(parsed['student-b'].result, 'ร')
assert.equal(parseScoreTransfer(roundtrip(1), students, config, 1, results)['student-b'].result, 'เรียน')
const noMidterm = { ...config, midterm_max: 0 }
assert.equal(parseScoreTransfer(roundtrip(2, noMidterm), students, noMidterm, 2, results)['student-a'].midterm, null)
function invalid(change, message) {
  const modified = data.map(row => [...row])
  change(modified)
  assert.throws(() => parseScoreTransfer(modified, students, config, 2, results), message)
}
invalid(d => { d[1][0] = 'other-school-student' }, /ไม่อยู่ในห้อง/)
invalid(d => { d[2][0] = d[1][0] }, /ซ้ำ/)
invalid(d => { d[1][3] = 21 }, /เกินช่วง/)
invalid(d => { d[1][3] = -1 }, /ตัวเลข/)
invalid(d => { d[1][3] = 'abc' }, /ตัวเลข/)
invalid(d => { d[1][3] = true }, /ตัวเลข/)
invalid(d => { d[1][7] = 'ผิด' }, /ผลการเรียนไม่ถูกต้อง/)
invalid(d => { d[0][3] = 'ระหว่างเรียน' }, /หัวตาราง/)
invalid(d => { d[1].push(100) }, /เกินคอลัมน์/)
assert.equal(Object.keys(parseScoreTransfer(data.slice(0, 2), students, config, 2, results)).length, 1)
assert.throws(() => parseScoreTransfer([data[0]], students, config, 2, results), /ไม่มีข้อมูล/)
console.log('Score Excel transfer tests passed: roundtrip, blanks, decimals, special results, term 1/2, partial import and invalid data.')
