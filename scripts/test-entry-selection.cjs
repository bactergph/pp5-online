/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test runner. */
const assert = require('node:assert/strict')
const fs = require('fs')
const ts = require('typescript')
const jsx = require('react/jsx-runtime')
function compile(path, requireMock) {
  const moduleStub = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)(requireMock, moduleStub, moduleStub.exports)
  return moduleStub.exports
}
function harness(path, actions, libs) {
  const hooks = []; let cursor = 0; let queued = false; let tree; let component; let effects = []
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  function render() { queued = false; cursor = 0; effects = []; tree = component(); for (const run of effects) run() }
  function queue() { if (!queued) { queued = true; queueMicrotask(render) } }
  const react = {
    useState(initial) { const i = cursor++; if (!hooks[i]) hooks[i] = { value: typeof initial === 'function' ? initial() : initial }; return [hooks[i].value, value => { const next = typeof value === 'function' ? value(hooks[i].value) : value; if (!Object.is(next, hooks[i].value)) { hooks[i].value = next; queue() } }] },
    useRef(initial) { const i = cursor++; return hooks[i] ||= { current: initial } },
    useMemo(fn, deps) { const i = cursor++; if (!hooks[i] || !same(hooks[i].deps, deps)) hooks[i] = { value: fn(), deps }; return hooks[i].value },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const i = cursor++; const old = hooks[i]; if (!old || !same(old.deps, deps)) { effects.push(() => { old?.cleanup?.(); hooks[i] = { deps, cleanup: fn() } }) } },
  }
  component = compile(path, name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return jsx
    if (name === 'react-dom') return { flushSync: fn => fn() }
    if (name.includes('/actions') || name === './actions') return actions
    if (name === 'next/navigation') return { usePathname: () => '/phonoi/scores' }
    if (libs[name]) return libs[name]
    return { default: () => null }
  }).default
  function visit(node, found) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(item => visit(item, found)); if (node.type === 'select') found.push(node); visit(node.props?.children, found) }
  render()
  return { selects: () => { const found = []; visit(tree, found); return found } }
}
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)) }
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function testPage(path, hourly) {
  const requests = []; const pending = new Map()
  const classrooms = [1, 2, 3].map(i => ({ id: `c${i}`, level: `ป.${i}`, room: 1 }))
  const subject = i => [{ id: `s${i}`, classroom_id: `c${i}`, subject_id: 'subject', order_number: 1 }]
  const data = id => ({ canEdit: true, entryOpen: true, students: [], config: null, scores: [], weeks: [], hoursPerWeek: 1, subject: { code: id, name: id, hoursPerYear: 40 }, records: {}, termStart: '', termEnd: '' })
  const actions = {
    fetchScoreInit: async () => ({ canEdit: true, role: 'teacher', years: [{ id: 'year1', year_be: 2569, is_active: true }, { id: 'year2', year_be: 2568 }], subjects: [], activeYearId: 'year1', classrooms, classSubjects: subject(1) }),
    fetchScoreClassrooms: async () => classrooms,
    fetchScoreSubjects: id => { const deferred = defer(); pending.set(id, deferred); return deferred.promise },
    fetchHourlyGrid: async params => { requests.push(params); return data(params.classSubjectId) },
    fetchScoreEntryData: async (classroomId, classSubjectId, term) => { requests.push({ classroomId, classSubjectId, term }); return data(classSubjectId) },
  }
  const libs = {
    '@/lib/hourly-attendance': compile('lib/hourly-attendance.ts', () => ({})),
    '@/lib/thaiDate': { formatThaiDate: x => x },
    '@/lib/grade': compile('lib/grade.ts', () => ({})),
    '@/lib/score-transfer': compile('lib/score-transfer.ts', () => ({})),
  }
  const page = harness(path, actions, libs)
  await settle()
  assert.equal(requests.length, 1)
  page.selects()[1].props.onChange({ target: { value: 'c2' } }); await settle()
  assert.equal(requests.length, 1, 'Must not request new classroom with old subject')
  page.selects()[1].props.onChange({ target: { value: 'c3' } }); await settle()
  pending.get('c3').resolve(subject(3)); await settle()
  pending.get('c2').resolve(subject(2)); await settle()
  assert.equal(page.selects()[1].props.value, 'c3')
  assert.equal(page.selects()[2].props.value, 's3', 'Late old subject response must not overwrite current selection')
  page.selects()[0].props.onChange({ target: { value: 'year2' } }); await settle()
  assert.ok(pending.has('c1'), 'Changing year must also load subjects for its first classroom')
  pending.get('c1').resolve(subject(1)); await settle()
  for (const request of requests) assert.equal(request.classSubjectId, request.classroomId.replace('c', 's'))
  assert.equal(page.selects()[0].props.value, 'year2')
  console.log(`${hourly ? 'Hourly attendance' : 'Score entry'}: classroom/year switching and delayed response tests passed`)
}
async function testHourlyValidation() {
  const records = {
    class_subjects: { id: 's1', classroom_id: 'c1', academic_year_id: 'year1' },
    academic_years: { id: 'year1', term1_start_date: null, term1_end_date: null },
  }
  const db = { from(table) {
    const chain = { select() { return chain }, eq() { return chain }, order() { return chain },
      maybeSingle: async () => ({ data: records[table] || null }),
      then: (resolve, reject) => Promise.resolve({ data: records[table] || [] }).then(resolve, reject),
    }
    return chain
  } }
  const actions = compile('app/(shell)/attendance/actions.ts', name => {
    if (name === '@/lib/supabase') return { createServerClient: () => db }
    if (name === '@/lib/session') return { getSession: async () => ({ role: 'admin', schoolId: 'school' }) }
    if (name === '@/lib/supabase-paginate') return { fetchAllRows: async () => [] }
    if (name === '@/lib/hourly-attendance') return compile('lib/hourly-attendance.ts', () => ({}))
    return {}
  })
  const base = { classroomId: 'c1', classSubjectId: 's1', academicYearId: 'year1', term: 1 }
  assert.match((await actions.fetchHourlyGrid({ ...base, classroomId: 'c2' })).error, /ห้องเรียนไม่ตรง/)
  assert.match((await actions.fetchHourlyGrid({ ...base, academicYearId: 'year2' })).error, /ปีการศึกษาไม่ตรง/)
  assert.match((await actions.fetchHourlyGrid(base)).error, /วันเปิด–ปิดภาคเรียน/)
  assert.match((await actions.clearHourlyPresentColumn({ ...base, weekNumber: 1, slot: 1 })).error, /วันเปิด–ปิดภาคเรียน/)
  console.log('Hourly server validation: expected errors return Thai messages without throwing or writing data')
}
(async () => {
  await testHourlyValidation()
  await testPage('components/attendance/HourlyAttendanceEntry.tsx', true)
  await testPage('app/(shell)/scores/page.tsx', false)
})().catch(error => { console.error(error); process.exitCode = 1 })

