const assert=require('node:assert/strict')
const load=require('./helpers/load-pure-ts.cjs')
const {DEFAULT_PERIOD_TIMES,moveLunchBreak}=load('lib/schedule-helpers.ts')
const {levelPeriodTimes,validatePeriodProfiles}=load('lib/schedule-period-profiles.ts')
const {checkPlanning,solvePlannedSchedule,emptyPlan}=load('lib/schedule-planning.ts')
const {verifyCompleteSchedule}=load('lib/schedule-verification.ts')
const times=structuredClone(DEFAULT_PERIOD_TIMES)
times[0].profiles={primary:structuredClone(DEFAULT_PERIOD_TIMES),secondary:moveLunchBreak(DEFAULT_PERIOD_TIMES,4)}
assert.equal(validatePeriodProfiles(times),null)
assert.equal(levelPeriodTimes(times,'ป.4')[3].is_break,true)
assert.equal(levelPeriodTimes(times,'ม.1')[3].period,4)
const lesson=(id,classroomLevel,teacherId='t')=>({id,classroomId:id,classroomLevel,teacherId,count:1,pattern:[1],label:id})
const lessons=[lesson('p','ป.4'),lesson('s','ม.1')]
// Same numbered period is at a different time: allowed.
assert.equal(checkPlanning(lessons,[{classroomId:'p',lessonId:'p',day:1,period:4},{classroomId:'s',lessonId:'s',day:1,period:4}],[1],times,[]).length,0)
// Different numbered periods overlap in real time: rejected.
const overlap=[{classroomId:'p',lessonId:'p',day:1,period:3},{classroomId:'s',lessonId:'s',day:1,period:3}]
assert.ok(checkPlanning(lessons,overlap,[1],times,[]).some(issue=>issue.code==='fixed_teacher_conflict'))
const solved=solvePlannedSchedule(lessons,[],{...emptyPlan(),days:[1]},times,[],10000,1500)
assert.equal(solved.status,'complete',JSON.stringify(solved))
assert.equal(verifyCompleteSchedule(lessons,solved.assignments,[1],times,[]).length,0)
const pair={...lesson('p','ป.4'),count:2,pattern:[2]},pairRows=[3,4].map(period=>({classroomId:'p',lessonId:'p',day:1,period}))
assert.ok(checkPlanning([pair],pairRows,[1],times,[]).some(issue=>issue.severity==='error'),'Primary double cannot cross its own lunch')
assert.equal(checkPlanning([{...pair,classroomLevel:'ม.1'}],pairRows,[1],times,[]).length,0,'Secondary double can precede its later lunch')
const activity={...lesson('a','ป.4'),activity:true,count:6,pattern:Array(6).fill(1)}
assert.equal(solvePlannedSchedule([activity],[],{...emptyPlan(),days:[1]},times,[],10000,1500).status,'complete','Activities may repeat on a day')
const family=Array.from({length:5},(_,i)=>({...lesson('r'+i,i<3?'ป.4':'ม.1','t'+i%3),count:5,pattern:Array(5).fill(1)}))
const school=solvePlannedSchedule(family,[],emptyPlan(),times,[],100000,2000)
assert.equal(school.status,'complete');assert.equal(verifyCompleteSchedule(family,school.assignments,emptyPlan().days,times,[]).length,0)
const dense=Array.from({length:6},(_,room)=>Array.from({length:6},(_,subject)=>({id:`r${room}s${subject}`,classroomId:'room'+room,classroomLevel:room<3?'ป.4':'ม.1',teacherId:'t'+(room+subject)%6,count:5,pattern:Array(5).fill(1),label:`room ${room} subject ${subject}`}))).flat()
const started=Date.now(),full=solvePlannedSchedule(dense,[],emptyPlan(),times,[],100000,10000)
assert.equal(full.status,'complete',JSON.stringify({status:full.status,nodes:full.nodes,elapsed:Date.now()-started}));assert.equal(verifyCompleteSchedule(dense,full.assignments,emptyPlan().days,times,[]).length,0)
console.log(`PASS: six-room primary/secondary whole school; ${full.assignments.length} cells in ${Date.now()-started}ms`)
console.log('PASS: separate primary/secondary lunch, actual-time conflicts, generation and independent verification')
