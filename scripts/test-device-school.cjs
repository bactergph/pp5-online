const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict')
const cache={}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,crypto,structuredClone,AbortController,Date,Intl,console,require(name){if(name==='./schedule-device-run')return {};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(abs),name+'.ts'));throw Error(name)}});return exports}
const school=load('lib/schedule-device-school.ts'),free=load('lib/schedule-device-free.ts'),backup=load('lib/schedule-device-backup.ts'),{createDeviceScheduleServices}=load('lib/schedule-device-services.ts')
async function run(){
 const plan={...free.normalizePlan({rooms:[{id:'r',label:'ป.1/1'}],teachers:[{id:'t',name:'ครูทดสอบ'}],subjects:[{id:'s',roomId:'r',code:'ท11101',name:'ภาษาไทย',teacherId:'t',periods:1,pattern:[1],placeId:null}],timetable:[{classroomId:'r',day:1,period:1,subjectId:'s',locked:true}],document:{schoolName:'เดิม',academicYear:'2569',directorName:'เดิม',academicHeadName:'เดิม',printDate:'2026-10-29'}}),substitutes:{}}
 const original={year:'2569',semester:2,terms:{1:structuredClone(plan),2:structuredClone(plan)}}
 const settings={schoolName:' โรงเรียนทดสอบ ',directorName:'นาย ผอ.',academicHeadName:'นาง หัวหน้าวิชาการ',academicYear:'2569',logoDataUrl:'data:image/png;base64,aGVsbG8='}
 const edited=school.applyDeviceSchoolBasics(original,settings)
 assert.equal(original.terms[2].document.schoolName,'เดิม');assert.equal(edited.terms[1].document.schoolName,'โรงเรียนทดสอบ');assert.equal(edited.terms[2].document.printDate,'2026-10-29');assert.equal(JSON.stringify(edited.terms[2].timetable),JSON.stringify(plan.timetable))
 const imported=backup.readDeviceBackup(JSON.parse(JSON.stringify({format:'jarnsek-device-schedule',version:1,data:edited})),25)
 assert.equal(imported.terms[2].document.logoDataUrl,settings.logoDataUrl)
 const services=createDeviceScheduleServices({read:()=>edited,write:async()=>true});await services.fetchScheduleInit();const context=await services.fetchScheduleExportContext();assert.equal(context.school.logo_url,settings.logoDataUrl);assert.equal(context.school.director_name,settings.directorName);assert.equal(context.school.academic_head_name,settings.academicHeadName)
 const next=school.applyDeviceSchoolBasics(edited,{...settings,academicYear:'2570'})
 assert.equal(next.year,'2570');assert.equal(next.archives['2569'].terms[2].timetable.length,1);assert.equal(next.terms[2].timetable.length,0)
 const back=school.applyDeviceSchoolBasics(next,settings);assert.equal(back.year,'2569');assert.equal(back.terms[2].timetable[0].locked,true)
 for(const patch of [{schoolName:''},{academicYear:'256A'},{academicYear:'25699'},{directorName:'x'.repeat(201)},{logoDataUrl:'javascript:alert(1)'},{logoDataUrl:'data:image/svg+xml;base64,aGVsbG8='},{logoDataUrl:'data:image/png;base64,'+'a'.repeat(800000)}])assert.throws(()=>school.validateDeviceSchoolBasics({...settings,...patch}))
 const invalid=structuredClone(edited);invalid.terms[1].document.logoDataUrl='https://example.test/tracking.png';assert.throws(()=>backup.readDeviceBackup({format:'jarnsek-device-schedule',version:1,data:invalid},25))
 console.log('PASS: school settings preserve both terms, yearly archives and locked schedules; logo/signatories reach export and backup; invalid school data and logo payloads rejected')
}
run().catch(error=>{console.error(error);process.exitCode=1})
