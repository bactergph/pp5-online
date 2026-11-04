const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const modules = new Map()
function load(file, overrides = {}) {
  file = path.resolve(file)
  if (modules.has(file)) return modules.get(file)
  const api = {}; modules.set(file, api)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports: api, Date, require: name => {
    if (name in overrides) return overrides[name]
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts')
    throw Error('Unexpected import: ' + name)
  } })
  return api
}
const settings = load('lib/evaluation-settings.ts')
const physicalTraits = Array.from({ length: 8 }, (_, i) => `trait${i + 1}_score`)
assert.deepEqual(Array.from(settings.evaluationStoredFieldKeys('character')), physicalTraits)
assert.ok(settings.characterDefaultSettingsForBand('1').some(row => row.field_key === 'trait1_1_indicator'), 'Descriptions remain available for the assessment UI')
let session = { userId: 'teacher', schoolId: 'school', role: 'teacher' }, denyScope = false, failSettings = false, failWrite = null
const tables = { classrooms: [{ id: 'room', level: 'ป.1', academic_year_id: 'year' }], students: [{ id: 'student', classroom_id: 'room' }], evaluation_settings: [], character_traits: [], evaluation_custom_scores: [] }
const writes = []
function query(table) {
  const filters = []; let columns = '*'
  const result = () => table === 'evaluation_settings' && failSettings
    ? { data: null, error: { message: 'settings unavailable' } }
    : { data: (tables[table] || []).filter(row => filters.every(f => f(row))).map(row => ({ ...row })), error: null }
  const q = {
    select: value => { columns = value; return q },
    eq: (key, value) => { filters.push(row => row[key] === value); return q },
    in: (key, values) => { filters.push(row => values.includes(row[key])); return q },
    order: () => q,
    maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] || null } },
    upsert: async (rows, options) => {
      if (failWrite === table) return { error: { message: 'simulated write unavailable' } }
      if (table === 'character_traits') {
        const allowed = new Set(['student_id', 'academic_year_id', 'term', 'total_score', 'percentage', 'result_level', ...physicalTraits])
        const unknown = rows.flatMap(row => Object.keys(row)).find(key => !allowed.has(key))
        if (unknown) return { error: { code: 'PGRST204', message: `Could not find the '${unknown}' column of 'character_traits' in the schema cache` } }
      }
      writes.push({ table, rows: JSON.parse(JSON.stringify(rows)) })
      const keys = options.onConflict.split(',')
      for (const row of rows) {
        const existing = tables[table].find(item => keys.every(key => item[key] === row[key]))
        if (existing) Object.assign(existing, row)
        else tables[table].push({ ...row })
      }
      return { error: null }
    },
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
  }
  return q
}
const api = load('app/(shell)/evaluation/actions.ts', {
  '@/lib/supabase': { createServerClient: () => ({ from: query }) },
  '@/lib/session': { getSession: async () => session },
  '@/lib/audit': { logActivity: async () => {}, resolveClassroomSchoolId: async () => 'school' },
  '@/lib/personal-data-scope': { assertPersonalHomeroom: async () => { if (denyScope) throw Error('ไม่มีสิทธิ์ห้องประจำชั้น') }, personalHomeroomIds: async () => null },
  '@/lib/evaluation-settings': settings,
})
;(async () => {
  for (const [level, band] of [['ป.1', '1'], ['ป.4', '2'], ['ม.1', '3'], ['ม.4', '4']]) {
    tables.classrooms[0].level = level
    tables.evaluation_settings = settings.characterDefaultSettingsForBand(band).map(row => ({ ...row, school_id: 'school' }))
    tables.evaluation_settings.push({ ...tables.evaluation_settings[0], field_key: `custom_${band}`, short_label: '9', sort_order: 9000 })
    const values = Object.fromEntries(physicalTraits.map(key => [key, 3]))
    values[`custom_${band}`] = 3
    values.trait1_1_indicator = 999 // A descriptor must never be sent as a physical column or counted as a score.
    const saved = await api.saveEvaluationRows('character', 'room', 'year', 1, [{ student_id: 'student', values }])
    assert.equal(saved.error, null, level)
    assert.equal(saved.count, 1)
    const stored = tables.character_traits[0]
    assert.equal(stored.total_score, 27, 'Use the same band-specific criteria as the screen')
    assert.equal(stored.percentage, 100)
    assert.equal(stored.result_level, 'ดีเยี่ยม')
    assert.equal(Object.hasOwn(stored, 'trait1_1_indicator'), false)
    const fetched = await api.fetchEvaluationData('character', 'room', 'year', 1)
    assert.equal(fetched.error, null)
    assert.equal(fetched.rows[0].trait1_score, 3)
    assert.equal(fetched.rows[0][`custom_${band}`], 3, 'Custom school criteria round-trip through the custom score table')
  }
  // Repeated saves update the same student/year/term rather than duplicating records.
  const cleared = await api.saveEvaluationRows('character', 'room', 'year', 1, [{ student_id: 'student', values: {} }])
  assert.equal(cleared.error, null); assert.equal(tables.character_traits.length, 1); assert.equal(tables.character_traits[0].total_score, 0)
  const save = () => api.saveEvaluationRows('character', 'room', 'year', 1, [{ student_id: 'student', values: {} }])
  failWrite = 'character_traits'
  let failed = await save(); assert.ok(failed.error); assert.equal(failed.count, 0)
  failWrite = 'evaluation_custom_scores'
  failed = await save(); assert.match(failed.error, /บันทึกค่าประเมินหลักแล้ว/); assert.equal(failed.count, 0); assert.equal(failed.partial, true)
  failWrite = null; assert.equal((await save()).error, null)
  session.mustChangePassword = true; await assert.rejects(save(), /ไม่มีสิทธิ์/); session.mustChangePassword = false
  let count = writes.length
  failSettings = true
  assert.ok((await api.saveEvaluationRows('character', 'room', 'year', 1, [{ student_id: 'student', values: {} }])).error)
  assert.equal(writes.length, count, 'Do not silently overwrite scores with fallback settings after a load error')
  failSettings = false; denyScope = true
  assert.match((await api.saveEvaluationRows('character', 'room', 'year', 1, [{ student_id: 'student', values: {} }])).error, /ไม่มีสิทธิ์/)
  assert.equal(writes.length, count)
  denyScope = false; session = { ...session, role: 'principal' }
  assert.ok((await api.saveEvaluationRows('character', 'room', 'year', 1, [{ student_id: 'student', values: {} }])).error)
  session = null
  await assert.rejects(api.saveEvaluationRows('character', 'room', 'year', 1, [{ student_id: 'student', values: {} }]), /ไม่มีสิทธิ์/)
  console.log('PASS: actual assessment save/load for all four education bands, no nonexistent indicator columns, totals and custom criteria preserved, idempotent saves, clear, load failure and permission guards')
})().catch(error => { console.error(error); process.exitCode = 1 })
