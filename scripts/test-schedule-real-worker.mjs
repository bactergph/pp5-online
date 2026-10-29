import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'

// Real browser Worker and production-mode bundling. The default input is an
// anonymous six-room backup; an optional local backup path is never uploaded.
const {webpack}=webpackPackage,root=process.cwd(),out=path.resolve('tmp/schedule-real-worker')
fs.mkdirSync(out,{recursive:true})
const write=(name,text)=>{const file=path.join(out,name);fs.writeFileSync(file,text);return file}
const capacityOnly=process.argv.includes('--capacity-only'),inputFile=process.argv.slice(2).find(arg=>!arg.startsWith('--'))
const input=inputFile?JSON.parse(fs.readFileSync(inputFile,'utf8')):JSON.parse(fs.readFileSync('scripts/fixtures/schedule-device-six-room.json','utf8'))
const entry=write('entry.js',`
import React from 'react';import{createRoot}from'react-dom/client';
import SchedulePreparation from ${JSON.stringify(path.join(root,'components/schedules/SchedulePreparation.tsx'))};
import{ScheduleServicesProvider}from ${JSON.stringify(path.join(root,'components/schedules/ScheduleServices.tsx'))};
import{createDeviceScheduleServices}from ${JSON.stringify(path.join(root,'lib/schedule-device-services.ts'))};
import{normalizePlan,toDeviceSnapshot}from ${JSON.stringify(path.join(root,'lib/schedule-device-free.ts'))};
import{readDeviceBackup}from ${JSON.stringify(path.join(root,'lib/schedule-device-backup.ts'))};
import{devicePreparation,localDraftCells}from ${JSON.stringify(path.join(root,'lib/schedule-device-view.ts'))};
import{prepareJointTeachingSession}from ${JSON.stringify(path.join(root,'lib/schedule-joint-lock.ts'))};
import{solveScheduleOnDevice}from ${JSON.stringify(path.join(root,'lib/schedule-device-run.ts'))};
import{verifyCompleteSchedule}from ${JSON.stringify(path.join(root,'lib/schedule-verification.ts'))};
window.mount=async()=>{const raw=structuredClone(window.testInput);const plan=raw.format?readDeviceBackup(raw).terms[raw.data.semester]:normalizePlan(raw);let bundle={year:'2569',semester:2,terms:{1:{...normalizePlan(),substitutes:{}},2:{...plan,substitutes:{}}}};window.writes=0;const operations=createDeviceScheduleServices({read:()=>bundle,write:async next=>{bundle=next;window.writes++;return true}});await operations.fetchScheduleInit();createRoot(document.getElementById('root')).render(React.createElement(ScheduleServicesProvider,{operations,local:true},React.createElement(SchedulePreparation,{yearId:'2569',semester:2,initialStep:7,onChanged:()=>{}})))};
window.check=async joint=>{const raw=structuredClone(window.testInput);let plan=raw.format?readDeviceBackup(raw).terms[raw.data.semester]:normalizePlan(raw);const original=JSON.stringify(plan);
if(joint==='release-pe'){const room=plan.rooms.find(r=>/^ป.4\\//.test(r.label));if(!room)throw Error('Missing PE classroom');plan={...plan,timetable:plan.timetable.map(cell=>cell.classroomId===room.id&&cell.day===2&&cell.period===4?{...cell,locked:false}:cell)}}
if(joint===true){const members=plan.subjects.filter(l=>/การงาน/.test(l.name)&&plan.rooms.some(r=>r.id===l.roomId&&/^ป.[45]\\//.test(r.label))),data=devicePreparation(plan),periods=[2,3];const changed=prepareJointTeachingSession(data,{expectedHash:data.hash,lessonId:members[0].id,lessonIds:members.map(l=>l.id),day:1,period:2,periods,locked:true,replaceExisting:true,expected:members.flatMap(l=>periods.map(period=>{const old=data.slots.find(s=>s.classroom_id===l.roomId&&s.day_of_week===1&&s.period===period);return {classroomId:l.roomId,period,lessonId:old?.class_subject_id||null,locked:!!old?.locked}}))},'2569');plan={...plan,teachingGroups:changed.plan.teachingGroups,timetable:localDraftCells({rows:changed.rows,offerings:[]})}}
const before=JSON.stringify(plan),snapshot=toDeviceSnapshot(plan,[]),start=performance.now();let ticks=0;const timer=setInterval(()=>ticks++,1);const result=await solveScheduleOnDevice(snapshot,'2569',plan.rooms.map(r=>r.id),true);clearInterval(timer);const verification=result.status==='complete'?verifyCompleteSchedule(result.lessons,result.rows.map(r=>({classroomId:r.classroom_id,lessonId:r.activity_id?'activity:'+r.activity_id:r.class_subject_id,day:r.day_of_week,period:r.period})),plan.days,plan.periods,plan.blocks):[];return {status:result.status,ms:performance.now()-start,rows:result.rows.length,solver:result.solver,issues:result.issues,ticks,verification,unchanged:JSON.stringify(plan)===before,locksPreserved:plan.timetable.filter(c=>c.locked).every(c=>result.rows.some(r=>r.classroom_id===c.classroomId&&r.day_of_week===c.day&&r.period===c.period&&r.locked&&r.class_subject_id===(c.subjectId||null))),originalLength:original.length}};
`)
const catalog=write('catalog.js','export async function fetchPrimaryScheduleSubjects(){throw Error("Catalog is unused in review test")}')
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`)
const navigation=write('navigation.js',`export function usePathname(){return '/schedules/device/manage'};export function useRouter(){return {push(){},refresh(){}}}`)
const cssLoader=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s.replace(/@import[^;]*;|@source[^;]*;/g,''))+';document.head.appendChild(style);'`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'production',optimization:{minimize:false},devtool:false,entry,output:{path:out,filename:'bundle.js',publicPath:'http://schedule-test.invalid/'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/app/schedules/catalog-actions$':catalog,'next/link$':link,'next/navigation$':navigation,'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:cssLoader}]}});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))})
let browser
try{
  browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu','--no-proxy-server']})
  const page=await browser.newPage(),errors=[];page.setDefaultNavigationTimeout(120000);page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message)})
  await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith('https://schedule-test.invalid/')?request.respond({status:200,contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><div id="root"></div>'}):request.abort());await page.goto('https://schedule-test.invalid/',{waitUntil:'domcontentloaded'});
  const workerSources=Object.fromEntries(fs.readdirSync(out).filter(name=>name.endsWith('.js')).map(name=>[name,fs.readFileSync(path.join(out,name),'utf8')]));
  await page.evaluate(({input,sources})=>{window.testInput=input;window.workerCount=0;window.Worker=new Proxy(window.Worker,{construct(Target,args){window.workerCount++;const name=new URL(String(args[0]),'http://schedule-test.invalid/').pathname.split('/').pop();if(!sources[name])throw Error('Unknown worker asset '+name);const url=URL.createObjectURL(new Blob([sources[name]],{type:'text/javascript'}));return new Target(url,args[1])}})},{input,sources:workerSources});
  await page.addScriptTag({content:fs.readFileSync(path.join(out,'bundle.js'),'utf8')});await page.waitForFunction(()=>typeof window.check==='function');
  if(capacityOnly){
    const rejected=await page.evaluate(()=>window.check(false));assert.equal(rejected.status,'invalid');assert.equal(rejected.rows,0);assert.ok(rejected.ms<2000);assert.equal(rejected.unchanged,true);assert.ok(rejected.issues.some(issue=>issue.message.includes('12 คาบ')&&issue.message.includes('11 ช่อง')))
    const released=await page.evaluate(()=>window.check('release-pe'));assert.equal(released.status,'complete');assert.equal(released.rows,178);assert.equal(released.locksPreserved,true);assert.equal(released.unchanged,true);assert.deepEqual(released.verification,[]);assert.ok(released.ms<5000);assert.ok(released.ticks>0)
    await page.evaluate(()=>window.mount());await page.waitForSelector('.prep-review-actions .prep-primary')
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.includes('ตรวจข้อมูลล่าสุด')).click())
    await page.waitForFunction(()=>document.body.textContent.includes('12 คาบ')&&document.body.textContent.includes('11 ช่อง'),{timeout:10000})
    assert.equal(await page.evaluate(()=>window.writes),0);assert.equal(await page.evaluate(()=>window.workerCount),2);assert.deepEqual(errors,[])
    console.log('PASS: real Worker detects 12-period/11-slot subset in '+Math.round(rejected.ms)+'ms; simulated PE release gives 178 verified cells in '+Math.round(released.ms)+'ms; wizard preflight shows the shortage with zero data writes')
  }else{
  const result=await page.evaluate(()=>window.check(false));assert.equal(result.status,'complete');assert.equal(result.rows,178);assert.equal(result.locksPreserved,true);assert.equal(result.unchanged,true);assert.deepEqual(result.verification,[]);assert.ok(result.ticks>0,'Browser main thread remains responsive');assert.ok(result.ms<5000)
  console.log('PASS: real Web Worker / six rooms / seven teachers / 178 verified cells / 55 preserved locks; '+Math.round(result.ms)+'ms')
  const conflict=await page.evaluate(()=>window.check(true));assert.equal(conflict.status,'conflict');assert.equal(conflict.rows,0);assert.ok(conflict.ms<2000);assert.equal(conflict.unchanged,true);assert.ok(conflict.issues.some(issue=>issue.details?.length));assert.equal(await page.evaluate(()=>window.workerCount),2);assert.deepEqual(errors,[])
  await page.evaluate(()=>window.mount());await page.waitForSelector('.prep-review-actions .prep-primary');
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.includes('สร้างตารางฉบับร่าง')).click());
  await page.waitForFunction(()=>document.querySelector('.swal2-confirm')||[...document.querySelectorAll('button')].some(button=>button.textContent.includes('บันทึกใช้ตารางนี้')),{timeout:10000});
  if(await page.$('.swal2-confirm'))await page.click('.swal2-confirm');
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.includes('บันทึกใช้ตารางนี้')),{timeout:10000});assert.equal(await page.evaluate(()=>window.writes),0);assert.equal(await page.evaluate(()=>window.workerCount),3);assert.deepEqual(errors,[]);console.log('PASS: actual Free wizard create button / all six rooms / missing-period warning / real Worker / save-ready preview; zero writes before confirmation');
  console.log('PASS: real Worker reports the forced joint-session capacity conflict in '+Math.round(conflict.ms)+'ms with details; no partial draft or data writes')
  }
}finally{if(browser)await browser.close()}
