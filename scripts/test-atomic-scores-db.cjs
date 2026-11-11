const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { mergeScoreEdit, readScoreInputs } = require('./helpers/load-pure-ts.cjs')('lib/score-edits.ts')

const empty = readScoreInputs()
const original = { ...empty, unit_scores: { 1: 12, 2: 15 }, final_score: 20 }
const latest = { ...original, unit_scores: { 1: 18, 2: 15 } }
const edited = { ...original, final_score: 25 }
assert.deepEqual(JSON.parse(JSON.stringify(mergeScoreEdit(original, edited, latest).inputs)), {
  ...original, unit_scores: { 1: 18, 2: 15 }, final_score: 25,
})
assert.throws(() => mergeScoreEdit(original, edited, { ...latest, final_score: 30 }), /คะแนนช่องเดียวกัน/)
assert.equal(mergeScoreEdit(original, edited, edited).changed, false, 'Retrying an applied edit is idempotent')
assert.deepEqual(JSON.parse(JSON.stringify(mergeScoreEdit(original, { ...original, unit_scores: { 2: 15 } }, original).inputs.unit_scores)), { 2: 15 })

const uid = value => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
const [school, room, year, offering, student, secondStudent, signer, approval, submission, secondary, secondaryApproval] = Array.from({ length: 11 }, (_, index) => uid(index + 1))
const config = { between_scores: [60], midterm_max: 0, final_max: 40, total_max: 100 }
const schema = fs.readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8')
const functions = fs.readFileSync('supabase/migrations/003_functions.sql', 'utf8')
const ddl = table => schema.match(new RegExp('create table ' + table + ' \\([\\s\\S]*?\\n\\);'))[0].replaceAll('uuid_generate_v4()', 'gen_random_uuid()')
const migration = fs.readFileSync('supabase/migrations/113_atomic_scores_and_pp5_approval.sql', 'utf8')

async function main() {
  const db = new PGlite()
  try {
    await db.exec([
      'create role anon; create role authenticated; create role service_role;',
      'create table academic_years(id uuid primary key);',
      'create table classrooms(id uuid primary key, school_id uuid not null);',
      'create table class_subjects(id uuid primary key, classroom_id uuid, academic_year_id uuid, semester integer, score_terms smallint[]);',
      'create table students(id uuid primary key, classroom_id uuid not null);',
      'create table users(id uuid primary key);',
      ddl('score_configs'), ddl('scores'), ddl('approval_signatures'),
      'create table document_approval_submissions(id uuid primary key, school_id uuid, class_subject_id uuid, doc_kind text, term integer, month integer, status text, submitted_at timestamptz, completed_at timestamptz, rejection_note text);',
      functions.slice(functions.indexOf('create or replace function calculate_grade'), functions.indexOf('create or replace function handle_new_auth_user')),
      fs.readFileSync('supabase/migrations/052_score_entry_periods.sql', 'utf8'),
      migration,
    ].join('\n'))
    await db.query('insert into academic_years(id) values ($1)', [year])
    await db.query('insert into classrooms values ($1,$2)', [room, school])
    await db.query('insert into class_subjects values ($1,$2,$3,0,ARRAY[1,2]::smallint[]),($4,$2,$3,0,ARRAY[1,2]::smallint[])', [offering, room, year, secondary])
    await db.query('insert into students values ($1,$3),($2,$3)', [student, secondStudent, room])
    await db.query('insert into users values ($1)', [signer])
    await db.query('insert into score_configs(class_subject_id,term,between_scores,midterm_max,final_max,total_max) select x, t, $3,0,40,100 from unnest(array[$1::uuid,$2::uuid]) x cross join generate_series(1,2) t', [offering, secondary, JSON.stringify(config.between_scores)])
    const row = async (id, term, subject = offering) => (await db.query('select * from scores where student_id=$1 and term=$2 and class_subject_id=$3', [id, term, subject])).rows[0]
    const entry = (id, total, expected = null) => ({
      student_id: id, expected_updated_at: expected, unit_scores: total == null ? {} : { 1: Math.min(total, 60) },
      between_total: total == null ? 0 : Math.min(total, 60), midterm_score: null,
      final_score: total == null ? null : Math.max(total - 60, 0), term_total: total,
      grade: 4, result: 'เรียน',
    })
    const save = (term, rows, subject = offering, primary = true) => db.query(
      'select save_score_edits($1,$2,$3,$4,$5,$6)', [school, subject, term, primary, JSON.stringify(config), JSON.stringify(rows)],
    )
    const seedApproval = (id, subject) => db.query(
      "insert into approval_signatures(id,class_subject_id,term,status,teacher_signed_at) values ($1,$2,1,'in_review',now()) returning updated_at",
      [id, subject],
    )
    const approve = (id, subject, version, wholeYear) => db.query(
      'select approve_pp5_subject_and_lock_scores($1,$2,1,$3,$4,$5,now(),$6)', [school, subject, id, version, signer, wholeYear],
    )

    await save(1, [entry(student, 100)])
    assert.equal(await row(secondStudent, 1), undefined)
    await save(2, [entry(student, 70)])
    assert.equal(Number((await row(student, 2)).year_total), 170)
    assert.equal(Number((await row(student, 2)).grade), 4)
    await save(2, [entry(secondStudent, 0)])
    assert.equal((await row(secondStudent, 2)).grade, null, 'A missing first term is different from an explicit zero')
    await save(1, [entry(secondStudent, 0)])
    assert.equal(Number((await row(secondStudent, 2)).grade), 0)
    await save(1, [entry(secondStudent, null, (await row(secondStudent, 1)).updated_at)])
    assert.equal((await row(secondStudent, 2)).grade, null)
    const old = (await row(student, 1)).updated_at
    await db.query('update academic_years set term2_scores_open=false where id=$1', [year])
    await save(1, [entry(student, 60, old)])
    assert.equal(Number((await row(student, 2)).year_total), 130)
    assert.equal(Number((await row(student, 2)).grade), 2.5)
    await assert.rejects(save(1, [entry(student, 90, old)]), { code: '40001' })
    await assert.rejects(save(2, [entry(student, 90, (await row(student, 2)).updated_at)]), /ปิดการบันทึกคะแนน/)
    await assert.rejects(save(1, [entry(uid(101), 90)]), /ไม่ตรงกับห้องเรียน/)

    const version = (await seedApproval(approval, offering)).rows[0].updated_at
    await db.query("insert into document_approval_submissions(id,school_id,class_subject_id,doc_kind,term,status,submitted_at) values ($1,$2,$3,'pp5_subject',1,'in_review',now())", [submission, school, offering])
    await db.exec("create function fixture_lock_failure() returns trigger language plpgsql as $$ begin if new.locked then raise exception 'fixture failed lock'; end if; return new; end $$; create trigger fixture_lock_failure before update on scores for each row execute function fixture_lock_failure()")
    await assert.rejects(approve(approval, offering, version, true), /fixture failed lock/)
    assert.equal((await db.query('select status from approval_signatures where id=$1', [approval])).rows[0].status, 'in_review')
    assert.equal((await row(student, 1)).locked, false)
    await db.exec('drop trigger fixture_lock_failure on scores')
    await assert.rejects(approve(approval, offering, new Date(0), true), /สถานะเอกสารเปลี่ยนแล้ว/)
    assert.equal((await row(student, 2)).locked, false)
    await approve(approval, offering, version, true)
    assert.equal((await row(student, 1)).locked, true)
    assert.equal((await row(student, 2)).locked, true)
    assert.equal((await db.query('select status from document_approval_submissions where id=$1', [submission])).rows[0].status, 'approved')
    await assert.rejects(save(2, [entry(student, 20, (await row(student, 2)).updated_at)]), /ถูกล็อก/)

    await db.query('update academic_years set term2_scores_open=true where id=$1', [year])
    await save(1, [entry(student, 82)], secondary, false)
    await save(2, [entry(student, 88)], secondary, false)
    const secondaryVersion = (await seedApproval(secondaryApproval, secondary)).rows[0].updated_at
    await approve(secondaryApproval, secondary, secondaryVersion, false)
    assert.equal((await row(student, 1, secondary)).locked, true)
    assert.equal((await row(student, 2, secondary)).locked, false)
    assert.equal((await row(student, 2, secondary)).year_total, null)
    const privileges = await db.query("select has_function_privilege('authenticated','save_score_edits(uuid,uuid,integer,boolean,jsonb,jsonb)','EXECUTE') as allowed")
    assert.equal(privileges.rows[0].allowed, false)
    console.log('PASS: cell merge/conflict, untouched students, annual grades/clears, closed-term derived updates, stale versions, school roster, atomic PP5 approval rollback, annual/semester locking and RPC grants')
  } finally {
    await db.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
