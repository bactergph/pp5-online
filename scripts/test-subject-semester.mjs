import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const api = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/subject-semester.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: api })
const terms = input => Array.from(api.subjectSemesterTerms(input))
assert.equal(api.defaultSubjectSemester(2), 2)
assert.equal(api.defaultSubjectSemester(1), 1)
assert.equal(api.defaultSubjectSemester(0), 2)
assert.deepEqual(terms({ semester: 2, semesters: [1] }), [2])
assert.deepEqual(terms({ semester: 0, semesters: [2] }), [1, 2])
assert.deepEqual(terms({ semester: null, semesters: [2, 1, 2] }), [1, 2])
assert.deepEqual(terms({ semesters: [] }), [])
for (const input of [-1, 3, null, '2']) assert.throws(() => api.parseSubjectSemester(input))

;(async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table subjects (id integer primary key, school_id uuid not null);
      create table class_subjects (subject_id integer references subjects(id), semester smallint);
    `)
    const migration = fs.readFileSync('supabase/migrations/079_subject_catalog_semester.sql', 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const school = '11111111-1111-1111-1111-111111111111'
    const other = '22222222-2222-2222-2222-222222222222'
    await db.query(`insert into subjects (id, school_id, semester) values
      (1,$1,null), (2,$1,1), (3,$1,null), (4,$1,null), (5,$2,null), (6,$1,0)`, [school, other])
    await db.exec('insert into class_subjects values (3,1), (4,2)')
    assert.equal((await db.query('select set_missing_subject_semester_to_second($1) as count', [school])).rows[0].count, 1)
    assert.deepEqual((await db.query('select semester from subjects order by id')).rows.map(row => row.semester), [2, 1, null, null, null, 0])
    assert.equal((await db.query('select set_missing_subject_semester_to_second($1) as count', [school])).rows[0].count, 0)
    await assert.rejects(db.exec('update subjects set semester=3 where id=1'), /subjects_semester_check/)
    assert.equal((await db.query('select count(*)::int as count from class_subjects')).rows[0].count, 2)
    console.log('PASS: term defaults, editable catalog term, legacy offerings, scoped/idempotent backfill, invalid terms rejected')
  } finally { await db.close() }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
