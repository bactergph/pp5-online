const fs = require('fs')
const vm = require('vm')
const ts = require('typescript')
const assert = require('node:assert/strict')

function compile(path, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(code, { exports, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
    return imports[name]
  }, console })
  return exports
}
const profile = compile('lib/school-education-type.ts')
assert.equal(profile.schoolLevels('primary').length, 11)
assert.equal(profile.schoolLevels('secondary').length, 6)
assert(!profile.schoolLevels('primary').includes('ม.4'))
assert(!profile.schoolLevels('secondary').includes('ป.1'))
assert.equal(profile.resolveSchoolEducationType(null, ['ม.6']), 'secondary')
assert.equal(profile.resolveSchoolEducationType('primary', ['ม.6']), 'primary')

function fixture({ role = 'admin', type = 'secondary', year = true, studentError = false } = {}) {
  const writes = []
  const reads = []
  const db = { from(table) {
    let operation = 'select', payload, filters = []
    const query = {
      select() { return query }, update(row) { operation = 'update'; payload = row; return query },
      insert(rows) { operation = 'insert'; payload = rows; return query }, delete() { operation = 'delete'; return query },
      eq(key, value) { filters.push([key, value]); return query }, in(key, value) { filters.push([key, value]); return query },
      maybeSingle() { return query },
      then(resolve, reject) {
        let result
        if (operation !== 'select') { writes.push({ table, operation, payload, filters }); result = { data: { id: 'school-a' }, error: null } }
        else {
          reads.push({ table, filters })
          result = { error: null, data: table === 'schools' ? { education_type: type } : table === 'academic_years' ? (year ? { id: 'year-a' } : null) : table === 'students' ? [] : [
            { id: 'legacy-primary', level: 'ป.1', room: 1 },
            { id: 'secondary-room', level: 'ม.1', room: 1 },
          ] }
          if (table === 'students' && studentError) result.error = { message: 'offline' }
        }
        return Promise.resolve(result).then(resolve, reject)
      },
    }
    return query
  } }
  const actions = compile('app/(shell)/classrooms/actions.ts', {
    '@/lib/school-education-type': profile,
    '@/lib/supabase': { createServerClient: () => db },
    '@/lib/session': { getSession: async () => ({ role, schoolId: 'school-a' }) },
    '@/lib/audit': { logActivity: async () => {} },
  })
  return { actions, writes, reads }
}

async function test() {
  let f = fixture({ role: 'teacher' })
  assert((await f.actions.saveSchoolEducationType('secondary')).error)
  assert.equal(f.writes.length, 0)
  f = fixture()
  assert.equal((await f.actions.saveSchoolEducationType('secondary')).error, null)
  assert.equal(f.writes[0].filters[0][1], 'school-a')
  f = fixture()
  assert((await f.actions.applyClassroomLevels('year-a', [{ level: 'ป.1', rooms: 1 }])).error)
  assert.equal(f.writes.length, 0)
  f = fixture({ year: false })
  assert((await f.actions.applyClassroomLevels('other-school-year', [{ level: 'ม.1', rooms: 1 }])).error)
  assert.equal(f.writes.length, 0)
  f = fixture({ studentError: true })
  assert((await f.actions.applyClassroomLevels('year-a', [{ level: 'ม.1', rooms: 0 }])).error)
  assert.equal(f.writes.length, 0)
  f = fixture()
  assert.equal((await f.actions.applyClassroomLevels('year-a', [{ level: 'ม.1', rooms: 0 }])).error, null)
  const removed = f.writes.find(write => write.operation === 'delete')
  assert.equal(removed.filters[0][1].join(','), 'secondary-room')
  assert(removed.filters.some(([key, value]) => key === 'school_id' && value === 'school-a'))
  console.log('PASS: school level ranges, fallback, roles, school scope, year ownership, failed reads, legacy preservation')
}
test().catch(error => { console.error(error); process.exit(1) })
