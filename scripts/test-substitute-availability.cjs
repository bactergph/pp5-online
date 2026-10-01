const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict')
const api = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/substitute-availability.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api})
const teachers = ['absent','busy','assigned','free'].map(id=>({id}))
const entries = [{id:'one',period:1,absent_teacher_id:'absent',substitute_teacher_id:null},{id:'two',period:1,absent_teacher_id:'absent',substitute_teacher_id:'assigned'}]
const available = api.availableSubstitutes(teachers,[{teacherId:'busy',period:1}],entries,entries[0])
assert.equal(available.map(t=>t.id).join(','),'free')
assert.equal(api.availableSubstitutes(teachers,[],entries,entries[1]).some(t=>t.id==='assigned'),true)
assert.equal(api.availableSubstitutes(teachers,[{teacherId:'busy',period:2}],entries,entries[0]).some(t=>t.id==='busy'),true)
console.log('PASS: substitutes exclude absent, regularly busy and draft-assigned teachers; current assignment and other periods remain available')
