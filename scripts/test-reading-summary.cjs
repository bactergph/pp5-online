const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const cache = new Map(), overrides = {}
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const exports = {}; cache.set(file, exports)
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, require(name) {
      if (name in overrides) return overrides[name]
      return load(name.startsWith('@/') ? name.slice(2) + '.ts' : path.resolve(path.dirname(file), name) + '.ts')
    },
  })
  return exports
}
const settings = load('lib/evaluation-settings.ts')
const summary = load('lib/reading-summary.ts')
let session = { schoolId: 'school' }, secondary = false, deny = false, fail = false, roomFail = false
const calls = []
overrides['@/lib/session'] = { getSession: async () => session }
overrides['@/lib/supabase'] = { createServerClient: () => ({ from: () => {
  const filters = {}
  const q = { select: () => q, eq: (key, value) => { filters[key] = value; return q }, maybeSingle: async () => ({
    data: filters.school_id === 'school' && filters.id === 'room' && filters.academic_year_id === 'year' ? { id: 'room', level: secondary ? 'ม.1' : 'ป.1', room: 1 } : null,
    error: roomFail ? { message: 'unavailable' } : null,
  }) }
  return q
} }) }
overrides['../../actions'] = { fetchEvaluationData: async (kind, room, year, term) => {
  calls.push(term)
  if (deny) throw Error('ไม่มีสิทธิ์ห้องประจำชั้น')
  return { students: [{ id: 'a' }], rows: [{ student_id: 'a', ...Object.fromEntries(summaryKeys.map(key => [key, term === 1 ? 3 : 0])) }], settings: defaults, error: fail ? 'โหลดผลประเมินไม่สำเร็จ' : null }
} }
const defaults = settings.readingDefaultSettingsForBand('1')
const summaryKeys = settings.activeScorableEvaluationSettings(defaults, 'reading').map(item => item.field_key)
const row = (id, values) => ({ student_id: id, ...Object.fromEntries(summaryKeys.map((key, i) => [key, values[i]])) })
const rows = summary.summarizeReading(['excellent', 'good', 'pass', 'zero', 'partial', 'missing'], [
  row('excellent', [3,3,3,3,3]), row('good', [2,2,2,2,2]), row('pass', [2,2,2,1,1]), row('zero', [0,0,0,0,0]), row('partial', [3,null,3,3,3]),
], defaults)
assert.deepEqual(Array.from(rows, item => item.result), ['ดีเยี่ยม', 'ดี', 'ผ่าน', 'ไม่ผ่าน', 'ยังไม่ครบ', 'ยังไม่ครบ'])
assert.equal(rows[3].total, 0); assert.equal(rows[4].total, null); assert.equal(rows[5].total, null)
assert.deepEqual(Array.from(summary.countReadingResults(rows), item => item.count), [1,1,1,1,2])
assert.equal(summary.summarizeReading(['a'], [row('a', [3,3,3,3,99])], defaults)[0].total, null)
assert.equal(summary.summarizeReading(['a'], [row('a', [3,3,3,3,' '])], defaults)[0].total, null)
assert.equal(summary.summarizeReading(['a'], [], [])[0].result, 'ยังไม่ครบ')
const custom = [...defaults, { ...defaults.find(item => item.field_key === summaryKeys[0]), field_key: 'custom', short_label: '1.3', max_score: 5 }]
assert.equal(summary.summarizeReading(['a'], [{...row('a',[3,3,3,3,3]),custom:5}], custom)[0].max, 20)
assert.equal(summary.summarizeReading(['a'], [row('a',[3,3,3,3,3])], custom)[0].result, 'ยังไม่ครบ')
;(async () => {
  const api = load('app/(shell)/evaluation/summary/reading/actions.ts')
  const get = (room='room', year='year', term=1) => api.fetchReadingSummary(room,year,term)
  let result = await get(); assert.deepEqual(Array.from(result.periods, item => item.term), [1,2]); assert.equal(result.periods[0].rows[0].total,15); assert.equal(result.periods[1].rows[0].total,0)
  secondary = true; calls.length = 0; result = await get('room','year',2); assert.deepEqual(calls,[2]); assert.equal(result.periods[0].rows[0].total,0)
  await assert.rejects(get('room','wrong'), /ไม่พบห้อง/); await assert.rejects(get('other'), /ไม่พบห้อง/); await assert.rejects(get('room','year',3), /ภาคเรียน/)
  fail = true; await assert.rejects(get(), /โหลดผล/); fail = false
  roomFail = true; await assert.rejects(get(), /โหลดห้อง/); roomFail = false
  deny = true; await assert.rejects(get(), /ไม่มีสิทธิ์/); deny = false
  session = {schoolId:'other'}; await assert.rejects(get(), /ไม่มีสิทธิ์/)
  session = {schoolId:'school',mustChangePassword:true}; await assert.rejects(get(), /ไม่มีสิทธิ์/)
  session = null; await assert.rejects(get(), /ไม่มีสิทธิ์/)
  console.log('PASS: missing versus zero, thresholds, custom criteria, primary two-term overview, secondary term isolation, year/school/personal permissions and read failures')
})().catch(error => { console.error(error); process.exitCode = 1 })
