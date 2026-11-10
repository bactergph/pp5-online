const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const assert = require('node:assert/strict')

function load(file) {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports, Intl, Date },
  )
  return exports
}

const format = load('lib/school-backup/format.ts')
const fileName = format.schoolBackupFileName('โรงเรียนโพนอย/1', 2568, new Date('2026-11-10T15:05:00Z'))
assert.equal(fileName, 'Database_โรงเรียน โรงเรียนโพนอย 1 ปีการศึกษา 2568 202611102205.json')
assert.equal(format.normalizeBackupFileName('Database_โรงเรียน โพนอย'), 'Database_โรงเรียน โพนอย.json')
assert.equal(format.normalizeBackupFileName('Database_โรงเรียน โพนอย.JSON'), 'Database_โรงเรียน โพนอย.JSON')
assert.throws(() => format.normalizeBackupFileName('สำรอง 2569'), /Database_/)
assert.throws(() => format.normalizeBackupFileName('   '), /ใส่ชื่อไฟล์/)
assert.equal(format.backupImportAccepted(true), true)
assert.equal(format.backupImportAccepted('yes'), false)
assert.equal(format.backupImportAccepted(false), false)

const schoolId = '11111111-1111-4111-8111-111111111111'
const yearId = '22222222-2222-4222-8222-222222222222'
const payload = {
  format: 'jarnsek-school-backup',
  version: 1,
  exportedAt: '2026-11-10T15:05:00.000Z',
  school: { id: schoolId, code: 'phonoi', name: 'โรงเรียนโพนอย' },
  academicYear: { id: yearId, yearBe: 2568 },
  counts: {},
  data: {
    school: format.schoolProfile({ name: 'โรงเรียนโพนอย', google_drive_refresh_token: 'secret', membership_kind: 'school' }),
    academicYear: { id: yearId, year_be: 2568 },
    users: [{ id: 'u' }],
    scores: [{ id: 's1' }, { id: 's2' }],
    daily_attendance: [{ id: 'a' }],
    students: [],
  },
}
assert.equal(Object.hasOwn(payload.data.school, 'google_drive_refresh_token'), false)
assert.equal(Object.hasOwn(payload.data.school, 'membership_kind'), false)
const summary = format.summarizeBackup(payload)
assert.equal(summary.sections.find(section => section.key === 'scores').count, 2)
assert.equal(summary.sections.find(section => section.key === 'attendance').count, 1)
assert.equal(summary.sections.find(section => section.key === 'staff').count, 1)
assert.equal(format.assertBackupPayload(payload, schoolId).school.code, 'phonoi')
assert.throws(() => format.assertBackupPayload(payload, '33333333-3333-4333-8333-333333333333'), /โรงเรียนอื่น/)
assert.throws(() => format.assertBackupPayload({ ...payload, format: 'other' }), /จารย์เสก/)
assert.throws(() => format.summarizeBackup({ ...payload, academicYear: { id: yearId, yearBe: 2569 } }), /ไม่ตรงกัน/)
assert.ok(format.BACKUP_IMPORT_NOTES.some(note => note.includes('ไม่เปลี่ยนรหัสโรงเรียน')))
console.log('PASS: backup file name, rename rules, acceptance flag, secret stripping and import summary')
