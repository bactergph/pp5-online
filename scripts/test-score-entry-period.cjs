const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')

const source = ts.transpileModule(readFileSync('lib/score-entry-period.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
let records, personal = false
const db = { from(table) {
  const filters = {}
  return {
    select() { return this },
    eq(key, value) { filters[key] = value; return this },
    async maybeSingle() {
      const row = records[table]
      return { data: row && Object.entries(filters).every(([key, value]) => row[key] === value) ? row : null }
    },
  }
} }
const exportsObject = {}
runInNewContext(source, {
  exports: exportsObject,
  require: name => name === 'server-only' ? {} : name === '@/lib/personal-data-scope' ? {limitsToOwnSubjects:async session=>!['admin','academic_head','deputy_principal','principal','district'].includes(session.role)&&(session.role==='teacher'||personal)} : { createServerClient: () => db },
})
const session = { schoolId: 'school-a', role: 'teacher', userId: 'teacher-a' }
async function check() {
  records = {
    class_subjects: { id: 'subject-a', academic_year_id: 'year-a', classroom_id: 'class-a', teacher_id: 'teacher-a', classrooms: {level:'ป.1',school_id:'school-a',academic_year_id:'year-a'} },
    academic_years: { id: 'year-a', school_id: 'school-a', year_be: 2569, term1_scores_open: false, term2_scores_open: true },
  }
  const get = (s = session, term = 1, classroom) => exportsObject.getScoreEntryPeriod(s, 'subject-a', term, classroom)
  assert.equal((await get()).open, false)
  assert.equal((await get(session, 2)).open, true)
  assert.ok((await get({ ...session, schoolId: 'school-b' })).error)
  assert.ok((await get({ ...session, userId: 'teacher-b' })).error)
  assert.ok((await get(session, 3)).error)
  assert.ok((await get(session, 2, 'class-b')).error)
  assert.equal((await get({ ...session, role: 'admin' })).open, false)
  personal=true
  assert.equal((await get({...session,role:'admin'})).open,false)
  assert.equal((await get({...session,role:'admin',userId:'other-owner'},2)).open,true,'School managers retain access to all subjects')
  assert.ok((await get({...session,role:'teacher',userId:'other-owner'},2)).error,'Teachers still need their own subject assignment')
  personal=false
  records.class_subjects.academic_year_id = 'year-b'
  assert.ok((await get(session, 2)).error)
  records.class_subjects.academic_year_id = 'year-a'
  records.academic_years.term1_scores_open = true
  assert.equal((await get()).open, true)
  records.class_subjects.semester = 1
  assert.ok((await get(session, 2)).error, 'Reject a semester-1 offering in semester 2')
  records.class_subjects.classrooms.level = 'ม.1'
  assert.equal((await get()).classroomLevel, 'ม.1')
  console.log('PASS: 9 score-entry period checks (term, year, school, teacher, classroom, admin, reopening)')
}
check().catch(error => { console.error(error); process.exitCode = 1 })
