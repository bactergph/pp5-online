const fs = require('fs'), vm = require('vm'), ts = require('typescript'), assert = require('node:assert/strict')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/subject-credit-hours.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject })
for (const credits of [0.5, 1, 1.5, 2, 3]) {
  const hours = exportsObject.secondaryCreditHours(credits)
  assert.equal(hours.weekly, credits * 2)
  assert.equal(hours.semester, hours.weekly * 20)
  assert.equal(hours.annual / 40, hours.weekly)
  assert.equal(hours.annual / 2, hours.semester)
}
for (const invalid of [0, -1, 0.25, 0.75, NaN, Infinity, 'abc', 51]) assert.throws(() => exportsObject.secondaryCreditHours(invalid))
console.log('PASS: credit conversions, semester/weekly/annual compatibility, invalid credits')
async function testSave() {
  let inserted = null, schoolType = 'secondary'
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }), insert: row => { inserted = row; return query }, single: async () => ({ data: { id: 'subject' }, error: null }) }
  const source = fs.readFileSync('app/(shell)/settings/actions.ts', 'utf8').split('export async function saveSubject(')[1].split('export async function deleteAllSubjects')[0]
  const context = { requireSchoolSession: async () => ({ role: 'admin', schoolId: 'school-a' }), hasRole: () => true, ACADEMIC_MANAGE_ROLES: [], getSchoolShell: async () => ({ education_type: schoolType }), secondaryCreditHours: exportsObject.secondaryCreditHours, createServerClient: () => ({ from: () => query }), logActivity: async () => {} }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule('async function saveSubject(' + source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context)
  const payload = { code: 'ท21101', name: 'ภาษาไทย', credits: 0.5, hours_per_year: 999 }
  assert.equal((await context.saveSubject(null, payload)).error, undefined)
  assert.equal(inserted.hours_per_year, 40)
  assert.equal(inserted.school_id, 'school-a')
  inserted = null
  assert((await context.saveSubject(null, { ...payload, credits: 0.25 })).error)
  assert.equal(inserted, null)
  schoolType = 'primary'
  await context.saveSubject(null, { ...payload, hours_per_year: 200 })
  assert.equal(inserted.hours_per_year, 200)
  console.log('PASS: server derives hours from credits, rejects invalid credits before writing, primary unchanged')
}
testSave().catch(error => { console.error(error); process.exit(1) })
