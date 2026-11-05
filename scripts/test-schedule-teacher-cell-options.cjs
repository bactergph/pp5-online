const assert=require('node:assert/strict'),load=require('./helpers/load-pure-ts.cjs')
const {DEFAULT_PERIOD_TIMES,moveLunchBreak}=load('lib/schedule-helpers.ts'),{teacherPeriodTimes}=load('lib/schedule-period-profiles.ts'),{teacherCellOptions,teacherCellEvents,teacherCellBlocks}=load('lib/schedule-teacher-cell-options.ts')
const times=structuredClone(DEFAULT_PERIOD_TIMES);times[0].profiles={primary:structuredClone(DEFAULT_PERIOD_TIMES),secondary:moveLunchBreak(DEFAULT_PERIOD_TIMES,4)}
const data={classroomLevels:{p:'ป.4',m:'ม.1'},lessons:[{id:'thai',teacherId:'a',classroomId:'p',label:'ไทย ป.4/1'},{id:'math',teacherId:'a',classroomId:'m',label:'คณิต ม.1/1'},{id:'other',teacherId:'b',classroomId:'p',label:'ครูอื่น'}],slots:[],busy:[],blocks:[],quotas:[{id:'thai',target:2,used:0},{id:'math',target:2,used:0}]}
const axis=teacherPeriodTimes(times),period=clock=>axis.find(t=>t.start_time===clock).period
let choices=teacherCellOptions(data,times,'a',1,period('13:30'));assert.equal(choices.length,2);assert.ok(choices.every(c=>c.period===5),'The display index must map back to local period 5')
assert.deepEqual(Array.from(teacherCellOptions(data,times,'a',1,period('11:30')).map(c=>c.id)),['math'],'Primary lunch is not a lesson option')
assert.deepEqual(Array.from(teacherCellOptions(data,times,'a',1,period('12:30')).map(c=>c.id)),['thai'],'Secondary lunch is not a lesson option')
const occupied={...data,slots:[{classroomId:'p',day:1,period:5,lessonId:'other',locked:false}]};assert.deepEqual(Array.from(teacherCellOptions(occupied,times,'a',1,period('13:30')).map(c=>c.id)),['math'])
const locked={...data,slots:[{classroomId:'m',day:1,period:5,lessonId:null,locked:true}]};assert.deepEqual(Array.from(teacherCellOptions(locked,times,'a',1,period('13:30')).map(c=>c.id)),['thai'])
assert.equal(teacherCellOptions({...data,slots:[{classroomId:'p',day:2,period:1,lessonId:'thai',locked:false},{classroomId:'p',day:3,period:1,lessonId:'thai',locked:false}]},times,'a',1,period('12:30')).length,0,'Full quota must not offer another period')
assert.equal(teacherCellOptions(data,times,'a',1,period('12:30'),undefined,['thai','thai']).length,0,'Queued writes reserve quota')
const current={teacherId:'a',classroomId:'m',day:1,period:5,lessonId:'math',label:'คณิต',locked:false,activity:false}
assert.equal(teacherCellEvents({...data,busy:[current]},times,'a',1,period('13:30'))[0].period,5)
assert.equal(teacherCellOptions(data,times,'a',1,period('13:30'),current)[0].period,5)
assert.equal(teacherCellBlocks({...data,blocks:[{teacherId:'a',day:1,period:5}]},times,'a',1,period('13:30'))[0].period,5)
times[0].teacherActivities=[{id:'plc',name:'PLC',teacherIds:['a'],days:[3],start_time:'15:30',end_time:'16:30'}]
const plc={teacherId:'a',classroomId:'',day:3,period:0,lessonId:'teacher-activity:plc',label:'PLC',locked:true,activity:true,teacherActivityId:'plc',start_time:'15:30',end_time:'16:30'}
assert.equal(teacherCellEvents({...data,busy:[plc,{...plc,period:1}]},times,'a',3,teacherPeriodTimes(times).find(t=>t.start_time==='15:30').period).length,1,'One PLC event, even if availability contains several overlap blocks')
assert.equal(teacherCellOptions(data,times,'a',3,teacherPeriodTimes(times).find(t=>t.start_time==='15:30').period).length,0,'No subject inserted after school')
const uneven=structuredClone(times);uneven[0].profiles.kindergarten=[{period:1,start_time:'08:30',end_time:'09:10',is_break:false,label:'1',sort_order:1},{period:2,start_time:'09:10',end_time:'09:50',is_break:false,label:'2',sort_order:2},{period:3,start_time:'09:50',end_time:'10:30',is_break:false,label:'3',sort_order:3}]
const kindergarten={...data,classroomLevels:{...data.classroomLevels,k:'อ.3'},lessons:[...data.lessons,{id:'k',teacherId:'a',classroomId:'k',label:'กิจกรรมเสริมประสบการณ์'}],busy:[{...current,classroomId:'k',period:2,lessonId:'k2'},{...current,classroomId:'k',period:3,lessonId:'k3'}]}
const longSlot=teacherPeriodTimes(uneven).find(t=>t.start_time==='09:30').period
assert.equal(teacherCellEvents(kindergarten,uneven,'a',1,longSlot).length,2,'A long display slot may overlap two shorter local periods')
const shortSlot=teacherPeriodTimes(uneven).find(t=>t.start_time==='09:10').period
assert.equal(teacherCellOptions(kindergarten,uneven,'a',2,shortSlot).find(c=>c.id==='k').period,2,'Shorter kindergarten periods also keep their real local index')
console.log('PASS: actual-clock options, shifted local indices, grade lunches, ownership, room occupancy, locks, remaining/reserved quota, mapped edits/blocks and deduplicated teacher PLC')
