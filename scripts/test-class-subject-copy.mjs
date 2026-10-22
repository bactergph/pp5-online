import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

function load(path, deps = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, console, require: name => deps[name] || {} })
  return exports
}
const levels = load('lib/class-level.ts')
const terms = load('lib/class-subject-term.ts', { '@/lib/class-level': levels })
const copy = load('lib/class-subject-copy.ts', { '@/lib/class-subject-term': terms })
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const school = id(100), year = id(101)
const input = { sourceClassroomId: id(1), targetClassroomId: id(2), academicYearId: year, term: 2 }
const db = new PGlite()

// Execute the service's real filtered reads and single upsert against PostgreSQL.
const client = { from(table) {
  let columns = '*', filters = [], sort = '', inserts = null
  const values = []
  const arg = value => { values.push(value); return `$${values.length}` }
  const query = {
    select(value) { columns = value; return query },
    eq(column, value) { filters.push(`${column}=${arg(value)}`); return query },
    in(column, items) { filters.push(`${column} in (${items.map(arg).join(',')})`); return query },
    order(column) { sort = ` order by ${column}`; return query },
    upsert(rows, options) {
      assert.equal(options.onConflict, 'classroom_id,subject_id,academic_year_id,semester')
      assert.equal(options.ignoreDuplicates, true)
      inserts = rows
      return query
    },
    then(resolve, reject) {
      let sql
      if (inserts) {
        const keys = Object.keys(inserts[0])
        const tuples = inserts.map(row => `(${keys.map(key => arg(row[key])).join(',')})`)
        sql = `insert into ${table} (${keys.join(',')}) values ${tuples.join(',')} on conflict (classroom_id,subject_id,academic_year_id,semester) do nothing returning ${columns}`
      } else sql = `select ${columns} from ${table}${filters.length ? ` where ${filters.join(' and ')}` : ''}${sort}`
      return db.query(sql, values).then(result => ({ data: result.rows, error: null }), error => ({ data: null, error: { message: error.message } })).then(resolve, reject)
    },
  }
  return query
} }

try {
  await db.exec(`
    create table classrooms (id uuid primary key, school_id uuid, academic_year_id uuid, level text, room int);
    create table subjects (id uuid primary key, school_id uuid);
    create table class_subjects (id uuid primary key default gen_random_uuid(), classroom_id uuid references classrooms,
      subject_id uuid references subjects, academic_year_id uuid, semester int, teacher_id uuid, order_number int,
      unique(classroom_id,subject_id,academic_year_id,semester));
    create table scores (class_subject_id uuid references class_subjects, score int);
  `)
  for (const n of [1,2,3,4,5,6,7,8]) await db.query('insert into classrooms values ($1,$2,$3,$4,1)', [id(n), n === 4 ? id(200) : school, n === 5 ? id(201) : year, [6,7].includes(n) ? 'ม.1' : n === 3 ? 'ป.2' : 'ป.1'])
  for (const n of [11,12,13,14]) await db.query('insert into subjects values ($1,$2)', [id(n), n === 13 ? id(200) : school])
  await db.query(`insert into class_subjects (id,classroom_id,subject_id,academic_year_id,semester,teacher_id,order_number) values
    ($1,$2,$3,$4,0,$5,1),($6,$2,$7,$4,0,$5,2),($8,$9,$3,$4,0,$10,9),
    ($11,$12,$3,$4,1,$5,1),($13,$12,$7,$4,2,$5,1),($14,$15,$3,$4,1,$10,1)`,
    [id(30),id(1),id(11),year,id(40),id(31),id(12),id(32),id(2),id(41),id(33),id(6),id(34),id(35),id(7)])
  await db.query('insert into scores values ($1,87)', [id(32)])
  const preview = await copy.prepareClassSubjectCopy(client, school, input)
  assert.equal(preview.total, 2)
  assert.equal(preview.added, 1)
  assert.equal(preview.skipped, 1)
  assert.match(preview.sourceLabel, /ป\.1\/1.*ทั้งปี/)
  assert.deepEqual({ ...await copy.executeClassSubjectCopy(client, school, input, preview.subjectIds) }, { added: 1, skipped: 1 })
  assert.deepEqual({ ...await copy.executeClassSubjectCopy(client, school, input, preview.subjectIds) }, { added: 0, skipped: 2 })
  const existing = (await db.query('select teacher_id,order_number from class_subjects where id=$1', [id(32)])).rows[0]
  assert.deepEqual(existing, { teacher_id: id(41), order_number: 9 })
  assert.equal((await db.query('select score from scores')).rows[0].score, 87)
  const created = (await db.query('select teacher_id,order_number from class_subjects where classroom_id=$1 and subject_id=$2', [id(2),id(12)])).rows[0]
  assert.deepEqual(created, { teacher_id: null, order_number: 10 })

  const crossGrade = { ...input, targetClassroomId: id(3) }
  const repeated = await Promise.all([1,2].map(() => copy.executeClassSubjectCopy(client, school, crossGrade, preview.subjectIds)))
  assert.equal(repeated.reduce((sum,result) => sum + result.added, 0), 2)
  assert.equal((await db.query('select count(*)::int as count from class_subjects where classroom_id=$1', [id(3)])).rows[0].count, 2)
  // Secondary copies use only the chosen term, leaving term 1 untouched.
  const secondary = { ...input, sourceClassroomId: id(6), targetClassroomId: id(7) }
  const termPreview = await copy.prepareClassSubjectCopy(client, school, secondary)
  assert.deepEqual(Array.from(termPreview.subjectIds), [id(12)])
  await copy.executeClassSubjectCopy(client, school, secondary, termPreview.subjectIds)
  assert.deepEqual((await db.query('select semester,subject_id from class_subjects where classroom_id=$1 order by semester', [id(7)])).rows, [{semester:1,subject_id:id(11)},{semester:2,subject_id:id(12)}])

  await assert.rejects(copy.prepareClassSubjectCopy(client, school, { ...input, targetClassroomId: id(1) }), /คนละห้อง/)
  for (const n of [4,5]) await assert.rejects(copy.prepareClassSubjectCopy(client, school, { ...input, sourceClassroomId: id(n) }), /โรงเรียนและปีการศึกษา/)
  await assert.rejects(copy.prepareClassSubjectCopy(client, school, { ...input, term: 3 }), /ให้ถูกต้อง/)
  await assert.rejects(copy.prepareClassSubjectCopy(client, school, { ...input, sourceClassroomId: id(8) }), /ยังไม่มีรายวิชา/)
  await assert.rejects(copy.executeClassSubjectCopy(client, school, input, [id(11)]), /เปลี่ยนแล้ว/)
  await db.query('insert into class_subjects (classroom_id,subject_id,academic_year_id,semester) values ($1,$2,$3,0)', [id(1),id(14),year])
  await assert.rejects(copy.executeClassSubjectCopy(client, school, input, preview.subjectIds), /เปลี่ยนแล้ว/)
  await db.query('delete from class_subjects where classroom_id=$1 and subject_id=$2', [id(1),id(14)])
  await db.query('insert into class_subjects (classroom_id,subject_id,academic_year_id,semester) values ($1,$2,$3,0)', [id(1),id(13),year])
  await assert.rejects(copy.prepareClassSubjectCopy(client, school, input), /ไม่อยู่ในโรงเรียน/)
  await db.query('delete from class_subjects where subject_id=$1', [id(13)])

  // A failure on one offering rolls back the entire batch, including earlier rows.
  await db.exec(`create function reject_test_copy() returns trigger language plpgsql as $$ begin
    if new.classroom_id='${id(8)}' and new.subject_id='${id(12)}' then raise exception 'test batch rejected'; end if;
    return new; end $$;
    create trigger reject_copy before insert on class_subjects for each row execute function reject_test_copy();`)
  await assert.rejects(copy.executeClassSubjectCopy(client, school, { ...input, targetClassroomId: id(8) }, preview.subjectIds), /test batch rejected/)
  assert.equal((await db.query('select count(*)::int as count from class_subjects where classroom_id=$1', [id(8)])).rows[0].count, 0)

  let session = null, calls = 0
  const actions = load('app/(shell)/settings/actions.ts', {
    '@/lib/session': { getSession: async () => session }, '@/lib/supabase': { createServerClient: () => client },
    '@/lib/class-subject-copy': { prepareClassSubjectCopy: async (_db, scopedSchool) => { assert.equal(scopedSchool,school); calls++; return preview },
      executeClassSubjectCopy: async (_db, scopedSchool) => { assert.equal(scopedSchool,school); calls++; return {added:0,skipped:2} } },
  })
  assert.ok((await actions.previewClassSubjectCopy(input)).error)
  session = {schoolId:school,role:'teacher'}
  assert.ok((await actions.copyClassSubjects(input,preview.subjectIds)).error)
  assert.equal(calls,0)
  session = {schoolId:null,role:'admin'}
  assert.ok((await actions.copyClassSubjects(input,preview.subjectIds)).error)
  session = {schoolId:school,role:'admin',mustChangePassword:true}
  assert.ok((await actions.copyClassSubjects(input,preview.subjectIds)).error)
  assert.equal(calls,0)
  session.mustChangePassword = false
  session.role = 'academic_head'
  assert.equal((await actions.previewClassSubjectCopy(input)).error,null)
  assert.equal((await actions.copyClassSubjects(input,preview.subjectIds)).error,null)
  assert.equal(calls,2)
  console.log('PASS: scoped classroom copy, all subjects, existing teachers/scores, term isolation, concurrent retries, stale confirmation, atomic rollback, server authorization')
} finally { await db.close() }
