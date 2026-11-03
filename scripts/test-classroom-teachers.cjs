const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
let session = { userId: 'owner', schoolId: 'school', role: 'admin' }, failTeachers = false, reads = 0
const users = [
  { id: 'owner', school_id: 'school', role: 'admin', prefix: 'นาย', full_name: 'เจ้าของบัญชี', is_active: true, email: 'owner@example.test', is_homeroom: false },
  ...Array.from({ length: 17 }, (_, i) => ({ id: `draft${i}`, school_id: 'school', role: 'teacher', prefix: 'นางสาว', full_name: `บุคลากร ${i}`, is_active: false, email: `pending-${i}@example.test`, is_homeroom: true })),
  { id: 'suspended', school_id: 'school', role: 'teacher', is_active: false, email: 'suspended@example.test' },
  { id: 'foreign', school_id: 'other', role: 'teacher', is_active: false, email: 'pending-foreign@example.test' },
  { id: 'director', school_id: 'school', role: 'principal', is_active: true },
]
const tables = {
  users,
  academic_years: [{ id: 'year', school_id: 'school', year_be: 2569, is_active: true }],
  schools: [{ id: 'school', education_type: 'primary' }],
  classrooms: [{ id: 'room', school_id: 'school', level: 'ป.1', room: 1, academic_year_id: 'year' }],
  students: [],
}
function query(table) {
  reads++
  const filters = []; let columns = '*', patch
  const result = () => {
    if (table === 'users' && !patch && failTeachers) return { data: null, error: { message: 'offline' } }
    const rows = (tables[table] || []).filter(row => filters.every(f => f(row)))
    if (patch) rows.forEach(row => Object.assign(row, patch))
    return { data: rows.map(row => columns === '*' ? { ...row } : Object.fromEntries(columns.split(',').map(k => [k.trim(), row[k.trim()]]))), error: null }
  }
  const q = {
    select: value => { columns = value; return q },
    eq: (key, value) => { filters.push(row => row[key] === value); return q },
    in: (key, values) => { filters.push(row => values.includes(row[key])); return q },
    or: value => { assert.equal(value, 'is_active.eq.true,email.like.pending-%'); filters.push(row => row.is_active === true || row.email?.startsWith('pending-')); return q },
    order: () => q, limit: () => q,
    update: value => { patch = value; return q },
    maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] || null } },
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
  }
  return q
}
const scope = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/school-record-scope.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:scope})
const api = {}, db = { from: query }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/(shell)/classrooms/actions.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: api, require: name => ({
  '@/lib/session': { getSession: async () => session },
  '@/lib/school-record-scope': scope,
  '@/lib/supabase': { createServerClient: () => db },
  '@/lib/audit': { logActivity: async () => {} },
  '@/lib/school-education-type': { schoolLevels: () => ['ป.1'] },
}[name] || {}) })
;(async () => {
  const before = users.map(row => row.is_active)
  const initial = await api.fetchClassroomInit()
  assert.equal(initial.teachers.length, 18, 'All 17 personnel plus owner, without activating accounts')
  assert.deepEqual(Array.from(initial.teachers, row => row.id).sort(), ['owner', ...Array.from({ length: 17 }, (_, i) => `draft${i}`)].sort())
  assert.ok(initial.teachers.every(row => !('email' in row)), 'Picker exposes only display fields')
  users.push({ ...users[1], id: 'new', full_name: 'เพิ่มภายหลัง', email: 'pending-new@example.test' })
  assert.equal((await api.fetchClassroomTeachers()).length, 19, 'Refresh includes personnel added after opening page')
  const saved = await api.saveClassroom('room', { level: 'ป.1', room: 1, academic_year_id: 'year', homeroom_teacher_id: 'draft0', homeroom_teacher2_id: 'draft1' })
  assert.equal(saved.error, null)
  assert.equal(tables.classrooms[0].homeroom_teacher_id, 'draft0')
  assert.equal(tables.classrooms[0].homeroom_teacher2_id, 'draft1')
  assert.deepEqual(users.slice(0, before.length).map(row => row.is_active), before, 'Assigning homeroom never grants login access')
  failTeachers = true
  await assert.rejects(api.fetchClassroomTeachers(), /โหลดรายชื่อครู/)
  failTeachers = false
  session = { ...session, schoolId: null }
  const count = reads
  assert.equal((await api.fetchClassroomTeachers()).length, 0)
  assert.equal(reads, count, 'No-school session cannot query another school')
  session = null
  await assert.rejects(api.fetchClassroomTeachers(), /ไม่มีสิทธิ์/)
  console.log('PASS: draft personnel available, active/school/role filters, refreshed list, both homeroom slots saved without login activation, failure and auth guards')
})().catch(error => { console.error(error); process.exitCode = 1 })
