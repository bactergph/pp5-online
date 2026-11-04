// Execute production handlers/actions against fault-injected fixtures. No external services.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict')
function load(file, deps = {}) {
  const api = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports: api, File, FormData, Uint8Array, ArrayBuffer, Date, Set, console,
    require(name) { if (!(name in deps)) throw Error('Unmocked dependency: ' + name); return deps[name] },
  })
  return api
}
const images = load('lib/upload-image.ts')
const relations = load('lib/postgrest-relation.ts')
const staff = load('lib/staff-permissions.ts')
const image = (mime = 'image/png', bytes = [137, 80, 78, 71, 13, 10, 26, 10, 0]) => new File([new Uint8Array(bytes)], 'misleading.svg', { type: mime })
let actor, target, targetError, uploadError, writeError, vanished, uploaded, removed, writes, audited
function reset() {
  actor = { userId: 'admin-a', role: 'admin', schoolId: 'school-a' }
  target = { id: 'school-a', school_id: 'school-a', role: 'teacher', full_name: 'Synthetic teacher' }
  targetError = uploadError = writeError = null; vanished = false
  uploaded = []; removed = []; writes = []; audited = []
}
const db = {
  storage: { from(bucket) {
    assert.equal(bucket, 'school-files')
    return {
      async upload(path, bytes, options) { uploaded.push({ path, bytes, options }); return { error: uploadError } },
      getPublicUrl(path) { return { data: { publicUrl: 'https://files.example.test/' + path } } },
      async remove(paths) { removed.push(...paths); return { error: null } },
    }
  } },
  from(table) {
    let payload; const filters = []
    const q = {
      select() { return q }, eq(k, v) { filters.push([k, v]); return q }, is(k, v) { filters.push([k, v]); return q },
      update(value) { payload = value; return q },
      async maybeSingle() {
        if (!payload) return { data: target, error: targetError }
        writes.push({ table, payload, filters }); return { data: vanished || writeError ? null : { id: 'updated' }, error: writeError }
      },
    }; return q
  },
}
const deps = {
  'next/server': { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } },
  'node:crypto': require('node:crypto'), '@/lib/upload-image': images, '@/lib/staff-permissions': staff,
  '@/lib/session': { getSession: async () => actor }, '@/lib/supabase': { createServerClient: () => db },
  '@/lib/audit': { logActivity: async input => audited.push(input) },
}
const school = load('app/api/upload/school-file/route.ts', deps)
const signature = load('app/api/upload/user-signature/route.ts', deps)
function request(fields, file = image()) {
  const form = new FormData(); for (const [k, v] of Object.entries(fields)) form.set(k, v)
  if (file) form.set('file', file)
  return { formData: async () => form }
}
const schoolRequest = (patch = {}, file) => request({ school_id: 'school-a', type: 'logo', ...patch }, file)
async function uploads() {
  reset()
  assert.equal((await school.POST(schoolRequest({ school_id: 'school-b' }))).status, 403)
  assert.equal((await school.POST(schoolRequest({ type: '../signature' }))).status, 400)
  assert.equal((await school.POST(schoolRequest({}, image('image/png', [1, 2, 3])))).status, 400)
  assert.equal((await school.POST(schoolRequest({}, new File([new Uint8Array(images.MAX_UPLOAD_IMAGE_BYTES + 1)], 'large.png', { type: 'image/png' })))).status, 400)
  assert.equal((await school.POST({ formData: async () => { throw Error('invalid multipart') } })).status, 400)
  actor.mustChangePassword = true; assert.equal((await school.POST(schoolRequest())).status, 403)
  assert.equal(uploaded.length, 0); assert.equal(writes.length, 0)
  reset(); target = null; assert.equal((await school.POST(schoolRequest())).status, 404); assert.equal(uploaded.length, 0)
  reset(); targetError = { message: 'read failed' }; assert.equal((await school.POST(schoolRequest())).status, 500); assert.equal(uploaded.length, 0)
  reset(); uploadError = { message: 'storage full' }; assert.equal((await school.POST(schoolRequest())).status, 500); assert.equal(writes.length, 0)
  for (const zeroRows of [false, true]) {
    reset(); writeError = zeroRows ? null : { message: 'write failed' }; vanished = zeroRows
    assert.equal((await school.POST(schoolRequest())).status, 500)
    assert.deepEqual(removed, [uploaded[0].path]); assert.equal(audited.length, 0)
    assert.equal(uploaded[0].options.upsert, false)
    assert.ok(!uploaded[0].path.endsWith('/logo.png'), 'Never overwrite the previous image')
  }
  reset(); const result = await school.POST(schoolRequest())
  assert.equal(result.status, 200); assert.equal(audited.length, 1); assert.equal(removed.length, 0)
  assert.ok(writes[0].filters.some(([k, v]) => k === 'id' && v === actor.schoolId))
  assert.ok(writes[0].payload.logo_url); assert.equal(uploaded[0].options.contentType, 'image/png')
  reset(); target.school_id = 'school-b'
  assert.equal((await signature.POST(request({ user_id: 'other' }))).status, 403); assert.equal(uploaded.length, 0)
  reset(); actor.role = 'teacher'
  assert.equal((await signature.POST(request({ user_id: 'other' }))).status, 403)
  const jpeg = image('image/jpeg', [255, 216, 255, 224])
  assert.equal((await signature.POST(request({ user_id: actor.userId }, jpeg))).status, 200)
  assert.equal(uploaded[0].options.contentType, 'image/jpeg'); assert.ok(uploaded[0].path.endsWith('.jpg'))
  assert.equal(uploaded[0].options.upsert, false)
  assert.ok(writes[0].filters.some(([k, v]) => k === 'school_id' && v === 'school-a'))
  reset(); writeError = { message: 'signature write failed' }
  assert.equal((await signature.POST(request({ user_id: actor.userId }))).status, 500)
  assert.deepEqual(removed, [uploaded[0].path]); assert.equal(audited.length, 0)
  reset(); vanished = true
  assert.equal((await signature.POST(request({ user_id: actor.userId }))).status, 500); assert.equal(removed.length, 1)
  for (const value of [null, 'text', new File([], 'empty.png', { type: 'image/png' }), image('image/svg+xml')]) assert.ok((await images.readUploadImage(value)).error)
  assert.equal((await images.readUploadImage(image('image/webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]))).ext, 'webp')
}
async function scores() {
  let lockError = null, failed = false, locked = [], count = 0
  const scoreDb = { from(table) {
    let mutation = false
    let id
    const q = { select() { return q }, eq(k, v) { if (k === 'id') id = v; return q }, in() { return q }, order() { return q }, upsert() { mutation = true; return q },
      async maybeSingle() { return { data: table === 'classrooms' && id === 'room-a' ? { id } : null, error: null } },
      then(resolve, reject) { if (mutation) count++; return Promise.resolve(mutation ? { error: failed ? { message: 'write failed' } : null } : table === 'students' ? { data: [{ id: 'student' }] } : { data: locked, error: lockError }).then(resolve, reject) },
    }; return q
  } }
  reset()
  const api = load('app/(shell)/scores/actions.ts', {
    '@/lib/supabase': { createServerClient: () => scoreDb }, '@/lib/session': { getSession: async () => actor },
    '@/lib/audit': { logActivity: async () => {}, resolveClassSubjectContext: async () => ({ schoolId: 'school-a' }) },
    '@/lib/personal-data-scope': { isPersonalSubjectAccess: async () => false },
    '@/lib/score-entry-period': { getScoreEntryPeriod: async () => ({ classroomId: 'room-a' }) },
  })
  const rows = [{ student_id: 'student', unit_scores: {}, between_total: 0, midterm_score: null, final_score: null, term_total: 0, grade: null, result: '' }]
  lockError = { message: 'database unavailable' }; assert.ok((await api.saveScores('subject', 1, rows)).error); assert.equal(count, 0)
  lockError = null; locked = [{ student_id: 'student' }]; assert.ok((await api.saveScores('subject', 1, rows)).error); assert.equal(count, 0)
  locked = []; assert.ok((await api.saveScores('subject', 1, [...rows, ...rows])).error); assert.equal(count, 0)
  failed = true; let result = await api.saveScores('subject', 1, rows); assert.ok(result.error); assert.equal(result.count, 0)
  failed = false; result = await api.saveScores('subject', 1, rows); assert.equal(result.error, undefined); assert.equal(result.count, 1)
  await assert.rejects(api.fetchScoreSubjects('foreign-room'), /สิทธิ์/)
  assert.equal((await api.fetchScoreSubjects('room-a')).length, 0)
  actor.mustChangePassword = true; await assert.rejects(api.saveScores('subject', 1, rows), /สิทธิ์/)
}
async function passwords() {
  let authError = null, flagError = null, changes = 0, flagWrites = 0, logs = 0
  reset()
  const api = load('app/(shell)/settings/profile/actions.ts', {
    'next/cache': { revalidatePath() {} }, '@/lib/session': { getSession: async () => actor },
    '@/lib/supabase': { createServerClient: () => ({
      auth: { admin: { async updateUserById(id) { assert.equal(id, actor.userId); changes++; return { error: authError } } } },
      from: () => ({ update() { flagWrites++; return this }, async eq(k, v) { assert.equal(k, 'id'); assert.equal(v, actor.userId); return { error: flagError } } }),
    }) },
    '@/lib/audit': { logActivity: async () => { logs++ } }, '@/lib/roles': {}, '@/lib/profile-name': {},
  })
  assert.ok((await api.changeOwnPassword('short', 'short')).error)
  assert.ok((await api.changeOwnPassword('long-password', 'different')).error); assert.equal(changes, 0)
  authError = { message: 'auth unavailable' }
  assert.ok((await api.changeOwnPassword('long-password', 'long-password')).error); assert.equal(flagWrites, 0)
  authError = null; flagError = { message: 'profile unavailable' }
  assert.match((await api.changeOwnPassword('long-password', 'long-password')).error, /เปลี่ยนรหัสผ่านแล้ว/); assert.equal(logs, 0)
  flagError = null; assert.equal((await api.changeOwnPassword('long-password', 'long-password')).success, true); assert.equal(logs, 1)
}
async function cleanup() {
  let failedTable, deleted = 0
  const tables = { users: [{ id: 'user', school_id: 'active' }], classrooms: [], schools: [{ id: 'active' }, { id: 'orphan' }] }
  const cleanDb = { from(table) {
    let mutation = false
    const q = { select() { return q }, order() { return q }, in(_key, ids) { assert.ok(!ids.includes('active')); return q }, range() { return q }, delete() { mutation = true; return q },
      then(resolve, reject) { if (mutation) deleted++; return Promise.resolve(failedTable === table ? { data: null, error: { message: 'read failure' } } : { data: tables[table] || [], count: mutation ? 2 : 0, error: null }).then(resolve, reject) },
    }; return q
  } }
  const api = load('app/(shell)/district/school-cleanup/actions.ts', {
    '@/lib/supabase': { createServerClient: () => cleanDb }, '@/lib/district': { requireDistrict: async () => ({ role: 'district' }) },
    '@/lib/audit': { logActivity: async () => {} }, '@/lib/evaluation-settings-seed': { deleteEvaluationSettingsForSchool: async () => { deleted++; return { count: 1 } } },
  })
  for (const table of ['users', 'classrooms']) {
    failedTable = table
    await assert.rejects(api.cleanupAllOrphanEvaluationSettings(), /ตรวจสอบ/)
    await assert.rejects(api.cleanupEvaluationSettings(['active']), /ตรวจสอบ/)
    assert.equal(deleted, 0)
  }
  failedTable = 'schools'; assert.ok((await api.cleanupAllOrphanEvaluationSettings()).error); assert.equal(deleted, 0)
  failedTable = null; assert.ok((await api.cleanupEvaluationSettings(['active'])).error); assert.equal(deleted, 0)
  const result = await api.cleanupAllOrphanEvaluationSettings(); assert.equal(result.error, null); assert.equal(result.orphanSchools, 1); assert.equal(result.deleted, 2)
}
async function documentSignatures() {
  reset()
  let classroom, writeFailure = false, mutations = 0, existingError = null
  const file = 'app/(shell)/sign/actions.ts'
  // Unused workflow dependencies are deliberately empty; a called unimplemented dependency fails.
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
  const imports = Object.fromEntries(source.statements.filter(ts.isImportDeclaration).map(row => [row.moduleSpecifier.text, {}]))
  Object.assign(imports, {
    '@/lib/session': { getSession: async () => actor }, '@/lib/postgrest-relation': relations,
    '@/lib/audit': { logActivity: async () => {} }, '@/lib/supabase': { createServerClient: () => ({ from(table) {
      let mutation = false
      const q = { select() { return q }, eq() { return q }, update() { mutation = true; return q }, insert() { mutation = true; return q },
        async maybeSingle() { return { data: table === 'class_subjects' ? { id: 'course', teacher_id: actor.userId, classrooms: classroom } : table === 'users' ? { signature_url: 'https://files.example.test/signature.png' } : null, error: table === 'approval_signatures' ? existingError : null } },
        then(resolve, reject) { if (mutation) mutations++; return Promise.resolve({ error: writeFailure ? { message: 'write unavailable' } : null }).then(resolve, reject) },
      }; return q
    } }) },
  })
  const api = load(file, imports)
  for (const value of [null, [], [{ school_id: 'school-a' }, { school_id: 'school-b' }], { school_id: 'school-b' }]) {
    classroom = value; assert.ok((await api.putPp5SubjectSignature('course', 1)).error); assert.equal(mutations, 0)
  }
  for (const value of [{ school_id: 'school-a' }, [{ school_id: 'school-a' }]]) {
    classroom = value; assert.equal((await api.putPp5SubjectSignature('course', 1)).success, true)
  }
  existingError = { message: 'read unavailable' }; const before = mutations
  assert.ok((await api.putPp5SubjectSignature('course', 1)).error); assert.equal(mutations, before)
  existingError = null
  writeFailure = true; assert.ok((await api.putPp5SubjectSignature('course', 1)).error)
  actor.mustChangePassword = true; await assert.rejects(api.putPp5SubjectSignature('course', 1), /สิทธิ์/)
}
;(async () => {
  const row = { school_id: 'a' }
  assert.equal(relations.relationOne(row), row); assert.equal(relations.relationOne([row]), row)
  for (const value of [null, undefined, [], [row, { school_id: 'b' }]]) assert.equal(relations.relationOne(value), null)
  await uploads(); await scores(); await passwords(); await cleanup(); await documentSignatures()
  console.log('PASS: tenant-scoped image uploads, file validation, compensation without overwriting old assets, score-lock read failures, accurate save counts, cleanup read failures and unambiguous to-one joins')
})().catch(error => { console.error(error); process.exitCode = 1 })
