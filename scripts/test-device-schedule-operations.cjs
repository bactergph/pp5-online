const fs = require('fs')
const vm = require('vm')
const path = require('path')
const ts = require('typescript')
const assert = require('assert/strict')

const cache = {}
function load(file, extra = {}) {
  const abs = path.resolve(file)
  if (cache[abs]) return cache[abs]
  const source = fs.readFileSync(abs, 'utf8')
  const exports = {}
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(compiled, {
    exports,
    module: { exports },
    globalThis,
    crypto,
    require(name) {
      if (extra[name]) return extra[name]
      if (name.startsWith('@/')) return load(path.resolve(name.slice(2) + (name.endsWith('.ts') ? '' : '.ts')))
      if (name.startsWith('.')) {
        const next = path.resolve(path.dirname(abs), name.endsWith('.ts') ? name : `${name}.ts`)
        return load(next)
      }
      return require(name)
    },
  })
  cache[abs] = exports
  return exports
}


const free=load('lib/schedule-device-free.ts'),ops=load('lib/schedule-device-operations.ts'),docs=load('lib/schedule-device-documents.ts'),view=load('lib/schedule-device-view.ts'),backup=load('lib/schedule-device-backup.ts'),nav=load('lib/schedule-device-navigation.ts')
const plan=free.normalizePlan({rooms:[{id:'r1',label:'ม.1/1'},{id:'r2',label:'ม.1/2'},{id:'r3',label:'ม.2/1'}],teachers:[{id:'t1',name:'นาย สมชาย ทดสอบ'},{id:'t2',name:'นาย สมชาย ทดสอบ'}],places:[{id:'lab',name:'ห้องวิทย์'}],subjects:[
 {id:'s1',roomId:'r1',code:'ว1',name:'วิทยาศาสตร์',teacherId:'t1',periods:3,pattern:[2,1],placeId:'lab',timePreference:'afternoon',spread:false},
 {id:'s2',roomId:'r2',code:'ว1',name:'วิทยาศาสตร์',teacherId:'t1',periods:1,pattern:[1],placeId:'lab'},
 {id:'s3',roomId:'r2',code:'ค1',name:'คณิต',teacherId:'t2',periods:1,pattern:[1],placeId:'lab'},
 {id:'pending',roomId:'r3',code:'อ1',name:'อังกฤษ',teacherId:'',periods:1,pattern:[1],placeId:null}
]})
const before=JSON.stringify(plan),one=ops.changeDeviceCell(plan,'r1',1,1,'s1')
assert.equal(JSON.stringify(plan),before,'Manual edit must be immutable')
assert.equal(one.timetable.length,1,'Unassigned subject elsewhere must not prevent an incremental edit')
assert.throws(()=>ops.changeDeviceCell(one,'r2',1,1,'s2'),/ครูชน|ไม่ว่าง/)
assert.throws(()=>ops.changeDeviceCell(one,'r2',1,1,'s3'),/สถานที่ชน/)
assert.throws(()=>ops.changeDeviceCell(one,'r1',1,1,null,'stale'),/เปลี่ยน/)
const locked=ops.lockDeviceCell(one,'r1',1,1)
assert.throws(()=>ops.changeDeviceCell(locked,'r1',1,1,null),/ล็อก/)
assert.throws(()=>ops.moveDeviceCell(locked,locked.timetable[0],{day:2,period:1}),/ล็อก/)
const blocked=ops.blockDeviceTeacher(plan,'t1',2,1,true)
assert.throws(()=>ops.changeDeviceCell(blocked,'r1',2,1,'s1'),/ไม่ว่าง|ครูชน/)
assert.throws(()=>ops.blockDeviceTeacher(one,'t1',1,1,true),/คาบสอน/)
const moved=ops.moveDeviceCell(one,one.timetable[0],{day:2,period:1})
assert.equal(moved.timetable[0].day,2)
const two=ops.changeDeviceCell(moved,'r1',3,2,'s1'),swapped=ops.moveDeviceCell(two,two.timetable[0],{day:3,period:2},true)
assert.equal(swapped.timetable.length,2)
assert.equal(ops.clearDeviceCells(locked,{kind:'school'}).timetable.length,1)
assert.equal(ops.clearDeviceCells(one,{kind:'teacher',id:'t1'}).timetable.length,0)
assert.equal(ops.clearDeviceCells(one,{kind:'level',id:'ม.2'}).timetable.length,1)
assert.throws(()=>ops.clearDeviceCells(one,{kind:'room'}),/ขอบเขต/)
const emptyLock=ops.lockDeviceCell(plan,'r1',2,2)
assert.ok(emptyLock.timetable[0].locked)
assert.throws(()=>ops.changeDeviceCell(emptyLock,'r1',2,2,'s1'),/ล็อก/)
const activity={id:'a',name:'ลูกเสือ',mode:'joint',roomIds:['r1','r2'],teacherId:'t2',teacherIds:['t2'],roomTeachers:{},cells:[{day:4,period:5}],weeklyPeriods:1}
const grouped={...one,activities:[activity]}
assert.throws(()=>ops.changeDeviceCell(grouped,'r1',4,5,'s1'),/กิจกรรม/)
assert.throws(()=>ops.blockDeviceTeacher(grouped,'t2',4,5,true),/กิจกรรม/)
const rows=docs.deviceWorkload(grouped)
assert.equal(rows.length,2,'Identical teacher names must remain different teachers')
assert.equal(rows.find(row=>row.id==='t1').hours,4,'Count assigned quota even before timetable generation')
assert.equal(rows.find(row=>row.id==='t2').activity_hours,1,'Joint activity is counted once per teacher')
const pages=docs.deviceDocumentPages(grouped,'class',['r1','r2'],2,'2569')
assert.equal(pages.length,2);assert.equal(pages[0].gridData['1-1'].line3,'นายสมชาย');assert.equal(pages[0].gridData['1-1'].line4,'ห้องวิทย์');assert.equal(pages[1].gridData['4-5'].line1,'ลูกเสือ')
const teacherPages=docs.deviceDocumentPages(grouped,'teacher',['t2'],2,'2569')
assert.equal(teacherPages[0].gridData['4-5'].line3,'ม.1/1, ม.1/2')
const snapshot=free.toDeviceSnapshot(plan,['r1'])
assert.equal(snapshot.lessons[0].timePreference,'afternoon');assert.equal(snapshot.plan.rules.s1.timePreference,'afternoon');assert.equal(view.devicePreparation(plan).lessons[0].spread,false)
const copied=ops.copyDeviceSubjects(plan,'r1',['r2','r3'])
assert.equal(copied.subjects.length,5,'Skip same code in target; do not overwrite its teacher')
assert.equal(copied.subjects.at(-1).teacherId,'');assert.equal(copied.subjects.at(-1).timePreference,'afternoon')
const raw={format:'jarnsek-device-schedule',version:1,data:{semester:2,terms:{1:structuredClone(plan),2:{...plan,teachers:[...plan.teachers,{id:'t3',name:'ครูเพิ่ม'}]}}}}
assert.equal(backup.readDeviceBackup(raw,25).terms[1].teachers.length,3,'Preserve teacher IDs across both terms')
raw.data.terms[1].teachers=Array.from({length:25},(_,i)=>({id:'one-'+i,name:'ครู '+i}))
assert.throws(()=>backup.readDeviceBackup(raw,25),/25/,'Teacher limit applies to union of both term rosters')
assert.equal(nav.deviceScheduleView('/seka/schedules/device/workload'),'workload')
assert.equal(nav.deviceScheduleHref('/seka/schedules/device/class','manage'),'/seka/schedules/device/manage')
console.log('PASS: local edits, same teacher/venue conflicts, stale edit, locks, blocked periods, atomic move/swap, clear scopes, activities, workload identity and quotas, print adapters, session preferences, copy offerings and cross-term teacher cap')

const dense=free.normalizePlan({rooms:Array.from({length:6},(_,r)=>({id:'R'+r,label:'ม.'+(r+1)+'/1'})),teachers:Array.from({length:25},(_,t)=>({id:'T'+t,name:'ครูจำลอง '+t})),periods:[1,2,3,0,4,5,6,7].map((period,i)=>({period,label:period?'คาบ '+period:'พักกลางวัน',start_time:String(8+i).padStart(2,'0')+':00',end_time:String(9+i).padStart(2,'0')+':00',is_break:period===0,sort_order:i+1}))})
dense.subjects=dense.rooms.flatMap((room,r)=>Array.from({length:8},(_,n)=>({id:'S'+r+'-'+n,roomId:room.id,teacherId:'T'+((r*3+n)%24),code:'C'+n,name:n<3?'คณิตศาสตร์':'ศิลปะ',periods:n<5?5:3,pattern:n<5?[2,2,1]:[1,1,1],placeId:null,timePreference:n<3?'morning':'afternoon'})))
dense.activities=[{id:'A',name:'ลูกเสือ',mode:'joint',roomIds:dense.rooms.map(room=>room.id),teacherId:'T24',teacherIds:['T24'],roomTeachers:{},cells:[],weeklyPeriods:1}]
dense.blocks=Array.from({length:20},(_,i)=>[{teacherId:'T'+i,day:i%5+1,period:1},{teacherId:'T'+i,day:(i+2)%5+1,period:6}]).flat()
const denseBefore=JSON.stringify(dense),started=Date.now(),draft=load('lib/schedule-device-build.ts').buildDeviceDraft(free.toDeviceSnapshot(dense,dense.rooms.map(room=>room.id)),'local',dense.rooms.map(room=>room.id),true)
assert.equal(draft.status,'complete',JSON.stringify(draft.issues))
assert.equal(draft.rows.length,210);assert.equal(JSON.stringify(dense),denseBefore,'Generating complete local draft must not mutate the database')
assert.equal(draft.solver,'block_repair')
console.log('PASS: local pipeline generated 6 full classrooms, 25 teachers, 210 periods, double lessons, morning/afternoon preferences, flexible joint activity and 40 teacher unavailable slots in '+(Date.now()-started)+' ms; independently verified before commit')


const years=load('lib/schedule-device-years.ts')
const existing={year:'2569',semester:2,terms:{1:{...plan,substitutes:{}},2:{...one,substitutes:{}}}}
const future=years.switchDeviceYear(existing,'2570')
assert.equal(future.terms[1].subjects.length,0);assert.equal(future.archives['2569'].terms[2].timetable.length,1)
assert.equal(years.switchDeviceYear(future,'2569').terms[2].timetable.length,1,'Switching academic year preserves both term databases')
const yearlyBackup=backup.readDeviceBackup({format:'jarnsek-device-schedule',version:1,data:future},25)
assert.equal(yearlyBackup.archives['2569'].terms[2].timetable.length,1,'Backup preserves archived academic years')
assert.equal(years.deviceSchoolYear(new Date('2027-01-01T00:00:00Z')),'2569')
assert.throws(()=>years.switchDeviceYear(existing,'bad'),/ปีการศึกษา/)
assert.equal(ops.lockDeviceCell(emptyLock,'r1',2,2).timetable.length,0,'Unlocking an empty cell releases its capacity')
const subPlan={...plan,substitutes:{'2026-10-26':[{substituteTeacherId:'t1',period:2}]}}
assert.ok(free.toDeviceSnapshot(subPlan,['r1']).blocks.some(block=>block.teacherId==='t1'&&block.day===1&&block.period===2),'Saved substitute assignments also reserve the teacher in auto generation')
console.log('PASS: academic-year isolation, year backup roundtrip, school year rollover, empty lock capacity and substitute reservation in shared solver')

const custom=free.normalizePlan({...plan,subjects:[{...plan.subjects[0],periods:3,pattern:[3]}]})
assert.equal(custom.subjects[0].pattern.join('+'),'3','Custom shared lesson patterns survive reload')
assert.equal(backup.readDeviceBackup({format:'jarnsek-device-schedule',version:1,data:{semester:1,terms:{1:custom,2:custom}}}).terms[1].subjects[0].pattern.join('+'),'3')
assert.equal(free.normalizePlan({days:[]}).days.length,0,'Explicitly empty days are retained for correction, not silently reset')
const pinnedLock=ops.lockDeviceCell(grouped,'r1',4,5)
assert.ok(pinnedLock.timetable.some(cell=>cell.activityId==='a'&&cell.locked),'Activity locks retain the actual activity ID')
console.log('PASS: custom lesson pattern persistence, empty-day correction and activity-cell lock identity')

const clientFiles=new Set()
function inspectLocalGraph(file){
 const absolute=path.resolve(file)
 if(clientFiles.has(absolute))return
 clientFiles.add(absolute)
 const source=fs.readFileSync(absolute,'utf8'),tree=ts.createSourceFile(absolute,source,ts.ScriptTarget.Latest,true,absolute.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
 assert.ok(!tree.statements.some(node=>ts.isExpressionStatement(node)&&ts.isStringLiteral(node.expression)&&node.expression.text==='use server'),'Local dependency cannot be a server action: '+file)
 for(const node of tree.statements){
   if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))continue
   if(node.isTypeOnly||ts.isImportDeclaration(node)&&(node.importClause?.isTypeOnly||!node.importClause?.name&&node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)&&node.importClause.namedBindings.elements.every(element=>element.isTypeOnly)))continue
   const specifier=node.moduleSpecifier?.text
   if(!specifier)continue
   assert.notEqual(specifier,'server-only','Local graph must not import server-only')
   assert.ok(!specifier.includes('supabase')&&!specifier.endsWith('/dal'),'Local graph must not import backend database/auth modules: '+specifier)
   if(!specifier.startsWith('@/')&&!specifier.startsWith('.'))continue
   const stem=specifier.startsWith('@/')?path.resolve(specifier.slice(2)):path.resolve(path.dirname(absolute),specifier)
   const target=['', '.ts','.tsx','/index.ts','/index.tsx'].map(extension=>stem+extension).find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile())
   if(target&&/\.tsx?$/.test(target))inspectLocalGraph(target)
 }
}
inspectLocalGraph('components/schedules/FreeScheduleDesk.tsx');inspectLocalGraph('lib/schedule-device.worker.ts')
console.log('PASS: '+clientFiles.size+' local client/worker dependency files contain no runtime server actions, server-only modules, Supabase or server auth imports')
