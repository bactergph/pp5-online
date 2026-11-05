// Real import actions and batching, backed by an isolated in-memory database only.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict')
function compile(file, imports = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Date, Set, Map, Error, require: name => imports[name] || {} })
  return exports
}
const tables = { academic_years: [{ id: 'year', school_id: 'school' }, { id: 'foreign-year', school_id: 'other' }], classrooms: [], students: [] }
let actor = { userId: 'admin', role: 'admin', schoolId: 'school' }, serial = 0, studentWrites = 0, readFailure = false, writeFailure = false
const queries = [], invalidated = [], audits = []
function from(table) {
  const filters = []; let payload, isInsert = false, start = 0, end = Infinity
  const execute = () => {
    if (!isInsert) {
      if (table === 'students' && readFailure) return { error: { message: 'read failed' }, data: null }
      const data = tables[table].filter(row => filters.every(fn => fn(row))).sort((a,b) => a.id.localeCompare(b.id)).slice(start, end + 1)
      return { data, error: null }
    }
    const rows = Array.isArray(payload) ? payload : [payload]
    if (table === 'students') {
      studentWrites++; queries.push(rows.length)
      if (writeFailure) return { data: null, error: { code: '', message: 'connection lost' } }
      if (rows.some(row => row.birth_date === 'bad-date')) return { data: null, error: { code: '22007', message: 'invalid birth date' } }
      const keys = new Set(tables.students.map(s => `${s.classroom_id}|${s.student_number}`))
      for (const row of rows) { const key = `${row.classroom_id}|${row.student_number}`; if (keys.has(key)) return { data: null, error: { code: '23505', message: 'duplicate seat number' } }; keys.add(key) }
    }
    const data = rows.map(row => ({ ...row, id: 'id-' + String(++serial).padStart(6, '0') }))
    tables[table].push(...data)
    return { data, error: null }
  }
  const query = {
    select: () => query, order: () => query,
    eq: (key,value) => { filters.push(row => row[key] === value); return query },
    in: (key,values) => { filters.push(row => values.includes(row[key])); return query },
    range: (a,b) => { start=a; end=b; return query },
    insert: rows => { payload=rows; isInsert=true; return query },
    then: (yes,no) => Promise.resolve().then(execute).then(yes,no),
  }
  return query
}
const db = { from }
const scope = compile('lib/school-record-scope.ts')
const core = compile('lib/student-import.ts')
const runner = compile('lib/dmc-import-progress.ts')
const actions = compile('app/(shell)/settings/actions.ts', {
  '@/lib/session': { getSession: async () => actor }, '@/lib/supabase': { createServerClient: () => db },
  '@/lib/school-record-scope': scope, '@/lib/student-import': core,
  '@/lib/audit': { logActivity: async event => audits.push(event) },
  '@/lib/students-cache': { invalidateClassroomStudents: id => invalidated.push(id), invalidateClassroomStudentsMany: ids => invalidated.push(...ids) },
})
const rows = Array.from({ length: 1500 }, (_, i) => ({ student_code: String(900001+i), national_id: null, prefix: i%2 ? 'เด็กหญิง' : 'เด็กชาย',
  first_name: 'นักเรียน', last_name: 'จำลอง'+i, gender: i%2 ? 'F' : 'M', birth_date: '2013-01-01', status: 'เรียน', level: `ม.${Math.floor(i/250)+1}`, room: Math.floor(i%250/50)+1 }))
;(async () => {
  const states=[]
  const result=await runner.runDmcImport(rows, batch => actions.importStudentsWholeSchool('year',batch), p=>states.push({...p}), row=>`${row.level}/${row.room}`)
  assert.equal(result.error,null); assert.equal(result.inserted,1500); assert.equal(result.processed,1500)
  assert.equal(tables.students.length,1500); assert.equal(tables.classrooms.length,30)
  assert.equal(studentWrites,8,'1,500 inserts become eight bulk statements')
  assert.ok(queries.every(n=>n<=200)); assert.equal(states.at(-1).status,'done')
  assert.ok(states.some(p=>p.processed===200)); assert.ok(states.some(p=>p.processed===1400))
  for(const room of tables.classrooms){const students=tables.students.filter(s=>s.classroom_id===room.id);assert.equal(students.length,50);assert.equal(new Set(students.map(s=>s.student_number)).size,50)}
  const duplicate=await actions.importStudentsWholeSchool('year',rows)
  assert.equal(duplicate.inserted,0);assert.equal(duplicate.duplicate,1500,'Pagination and student codes protect retries beyond row 1,000, even without national IDs')
  assert.equal(studentWrites,8)
  const room=tables.classrooms[0].id
  const single=await actions.importStudents(room,[{...rows[0],student_code:'new',national_id:'1234567890123'},{...rows[0],student_code:'new2',national_id:'1234567890123'}])
  assert.equal(single.inserted,1);assert.equal(single.duplicate,1);assert.equal(tables.students.at(-1).student_number,51)
  const malformed=Array.from({length:200},(_,i)=>({...rows[0],student_code:'bad-test-'+i,birth_date:i===99?'bad-date':'2013-01-01'}))
  const partial=await actions.importStudents(room,malformed)
  assert.equal(partial.inserted,199);assert.equal(partial.failed,1);assert.match(partial.firstError,/birth date/)
  assert.ok(invalidated.includes(room));assert.ok(audits.length>0)
  const before=tables.students.length
  readFailure=true;assert.match((await actions.importStudents(room,[{...rows[0],student_code:'read-error'}])).error,/ตรวจสอบ/);assert.equal(tables.students.length,before);readFailure=false
  writeFailure=true;const oldWrites=studentWrites;const failure=await actions.importStudents(room,[{...rows[0],student_code:'network-error'}]);assert.ok(failure.error);assert.equal(studentWrites,oldWrites+1,'Never split/retry unknown network outcomes');writeFailure=false
  assert.ok((await actions.importStudentsWholeSchool('foreign-year',rows)).error)
  assert.ok((await actions.importStudents('foreign-room',rows)).error)
  actor={...actor,role:'teacher'};assert.ok((await actions.importStudents(room,rows)).error);assert.ok((await actions.importStudentsWholeSchool('year',rows)).error)
  let calls=0;const interrupted=[]
  const stopped=await runner.runDmcImport(rows.slice(0,500),async batch=>{if(++calls===2)throw Error('offline');return{inserted:batch.length}},p=>interrupted.push({...p}),()=> 'ม.1/1')
  assert.equal(stopped.processed,200);assert.equal(stopped.inserted,200);assert.equal(stopped.status,'error');assert.equal(calls,2);assert.ok(interrupted.every(p=>p.status!=='done'))
  const rejected=await runner.runDmcImport(rows.slice(0,3),async()=>({inserted:2,failed:1,firstError:'invalid date'}),()=>{},()=> 'ม.1/1')
  assert.equal(rejected.status,'error');assert.equal(rejected.inserted,2);assert.match(rejected.error,/invalid date/)
  console.log('PASS: real DMC actions import 1,500 students into 30 rooms in eight bulk writes; pagination, duplicate codes/IDs, numbering, malformed-row isolation, cache/audit, tenant/role guards, incremental progress and interrupted connections')
})().catch(error=>{console.error(error);process.exitCode=1})
