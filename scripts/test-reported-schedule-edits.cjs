const assert=require('node:assert/strict'),load=require('./helpers/load-pure-ts.cjs')
const {DEFAULT_PERIOD_TIMES,moveLunchBreak}=load('lib/schedule-helpers.ts')
const {periodTimesForSave,validatePeriodProfiles}=load('lib/schedule-period-profiles.ts')
const raw=structuredClone(DEFAULT_PERIOD_TIMES).map(row=>({...row,profiles:null}))
raw[0].profiles={secondary:moveLunchBreak(DEFAULT_PERIOD_TIMES,4)}
raw[0].teacherActivities=[{id:'display-only',name:'PLC'}]
const original=JSON.stringify(raw),clean=periodTimesForSave(raw)
assert.equal(JSON.stringify(raw),original)
assert.equal(clean.slice(1).some(row=>'profiles' in row),false)
assert.equal(clean.some(row=>'teacherActivities' in row),false)
assert.equal(validatePeriodProfiles(clean),null)
assert.deepEqual(JSON.parse(JSON.stringify(clean[0].profiles.secondary)),JSON.parse(JSON.stringify(raw[0].profiles.secondary)))
assert.equal(periodTimesForSave(raw.map(row=>({...row,profiles:null}))).some(row=>'profiles' in row),false)
assert.throws(()=>periodTimesForSave([...raw.slice(0,1),{...raw[1],profiles:raw[0].profiles},...raw.slice(2)]),/แถวแรก/)
assert.throws(()=>periodTimesForSave([{...raw[0],start_time:'11:00'},...raw.slice(1)]),/เวลา/)

const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const free=load('lib/schedule-device-free.ts'),view=load('lib/schedule-device-view.ts'),editor=load('lib/schedule-subject-details.ts')
function dataFor(band){
  const level=band==='secondary'?'ม.1':'อ.1'
  const periods=structuredClone(DEFAULT_PERIOD_TIMES);periods[0].profiles={[band]:moveLunchBreak(DEFAULT_PERIOD_TIMES,4)}
  return view.devicePreparation(free.normalizePlan({periods,teachers:[{id:id(1),name:'ครูทดสอบ'}],rooms:[{id:id(10),label:level+'/1'}],subjects:[{id:id(30),roomId:id(10),teacherId:id(1),code:'TEST',name:'วิชาทดสอบ',periods:2,pattern:[2],placeId:null}],timetable:[3,4].map(period=>({classroomId:id(10),subjectId:id(30),day:1,period,locked:true}))}))
}
const details={code:'TEST',name:'แก้ชื่อเท่านั้น',shortName:'',group:'',type:'พื้นฐาน',count:2,periodMode:'double'}
for(const band of ['secondary','kindergarten']){
  const data=dataFor(band),before=JSON.stringify(data)
  assert.equal(editor.prepareSubjectDetails(data,id(30),details).details.name,details.name)
  assert.equal(JSON.stringify(data),before)
  const crossesLunch=structuredClone(data);crossesLunch.slots.forEach((slot,i)=>slot.period=4+i)
  assert.throws(()=>editor.prepareSubjectDetails(crossesLunch,id(30),details),/คาบเดิม|รูปแบบคาบ/)
}
console.log('PASS: DB null-profile roundtrip, display metadata removed, no input mutation, kindergarten/secondary subject edits use their own lunch, real break crossings still rejected')
