const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const api = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-solver.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api})
const solve = api.solveSchoolSchedule
function validate(lessons, fixed, result) {
  assert.equal(result.error, undefined, result.error)
  const rooms = new Set(), teachers = new Set(), counts = new Map()
  for (const a of [...fixed, ...result.assignments]) {
    const slot = `${a.day}:${a.period}`
    assert.ok(!rooms.has(a.classroomId+slot)); rooms.add(a.classroomId+slot)
    const l = lessons.find(l=>l.id===a.lessonId)
    if (!l) continue
    assert.ok(!teachers.has(l.teacherId+slot)); teachers.add(l.teacherId+slot)
    counts.set(l.id,(counts.get(l.id)||0)+1)
  }
  for (const l of lessons) assert.equal(counts.get(l.id)||0,l.count)
}
const lesson=(id,room,teacher,count)=>({id,classroomId:room,teacherId:teacher,count,label:`${room} · ${id}`})
const all=[]
for(let r=0;r<6;r++) for(let t=0;t<6;t++) all.push(lesson(`r${r}t${t}`,`r${r}`,`t${t}`,5))
validate(all,[],solve(all,[]))
const activity=[lesson('math','a','t',5),lesson('activity:scout','a','u',1),lesson('english','b','t',5)]
const fixed=[{classroomId:'a',lessonId:'activity:scout',day:3,period:6},{classroomId:'b',lessonId:null,day:1,period:1}]
validate(activity,fixed,solve(activity,fixed))
assert.ok(solve([lesson('a','a','t',20),lesson('b','b','t',20)],[]).error)
assert.ok(solve([lesson('a','a','t',20),lesson('b','a','u',20)],[]).error)
assert.ok(solve([lesson('a','a',null,1)],[]).error)
assert.ok(solve([lesson('a','a','t',1),lesson('b','b','t',1)],[{classroomId:'a',lessonId:'a',day:1,period:1},{classroomId:'b',lessonId:'b',day:1,period:1}]).error)
assert.ok(solve(activity,[],0).error)
assert.equal(solve([lesson('none','a','t',0)],[]).assignments.length,0)
console.log('PASS: dense 6-room/180-period school, activities, locked slots, teacher capacity, classroom capacity, missing teacher, fixed conflicts, bounded search, zero quota')


const activityLessons=[{...lesson('act1','r1',null,1),teacherOptional:true},{...lesson('act2','r2',null,1),teacherOptional:true}]
const activityResult=solve(activityLessons,[])
assert.equal(activityResult.error,undefined)
assert.equal(activityResult.assignments.length,2)
assert.equal(activityResult.assignments[0].day,activityResult.assignments[1].day)
assert.equal(activityResult.assignments[0].period,activityResult.assignments[1].period)

const reserve=solve([lesson('reserve','room','teacher',25)],[])
assert.equal(reserve.error,undefined)
assert.equal(reserve.assignments.filter(p=>p.period===6).length,0,'leave final periods empty when first 25 slots suffice')
const overflow=solve([lesson('overflow','room','teacher',26)],[])
assert.equal(overflow.error,undefined)
assert.equal(overflow.assignments.filter(p=>p.period===6).length,1,'use only the necessary final period')
const blockedFirst=Array.from({length:25},(_,i)=>({classroomId:'room',lessonId:null,day:Math.floor(i/5)+1,period:i%5+1}))
const required=solve([lesson('needed','room','teacher',1)],blockedFirst)
assert.equal(required.error,undefined)
assert.equal(required.assignments[0].period,6)
console.log('PASS: final period reserved when feasible, minimal overflow, mandatory last-period fallback')
