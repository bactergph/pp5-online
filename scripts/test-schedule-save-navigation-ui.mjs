import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import pkg from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=pkg,root=process.cwd(),out=path.resolve('tmp/save-feedback-ui')
fs.mkdirSync(out,{recursive:true})
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const fixture={teachers:[{id:'00000000-0000-4000-8000-000000000001',name:'นาย ครูหนึ่ง ทดสอบ',prefix:'นาย',fullName:'ครูหนึ่ง ทดสอบ',position:'ครู'},{id:'00000000-0000-4000-8000-000000000002',name:'นางสาว ครูสอง ทดสอบ',prefix:'นางสาว',fullName:'ครูสอง ทดสอบ',position:'ครู'}],rooms:[],subjects:[],timetable:[]}
const entry=write('entry.js',`
import React from 'react';import{createRoot}from'react-dom/client';
import Prep from ${JSON.stringify(path.join(root,'components/schedules/SchedulePreparation.tsx'))};
import Teaching from ${JSON.stringify(path.join(root,'components/schedules/TeachingScheduleEntry.tsx'))};
import{ScheduleServicesProvider}from ${JSON.stringify(path.join(root,'components/schedules/ScheduleServices.tsx'))};
import{normalizePlan}from ${JSON.stringify(path.join(root,'lib/schedule-device-free.ts'))};
import{createDeviceScheduleServices}from ${JSON.stringify(path.join(root,'lib/schedule-device-services.ts'))};
const plan={...normalizePlan(${JSON.stringify(fixture)}),substitutes:{}};let bundle={year:'2569',semester:2,terms:{1:structuredClone(plan),2:structuredClone(plan)}};
window.writes=0;window.rejectWrite=false;const ops=createDeviceScheduleServices({read:()=>bundle,write:async next=>{if(window.rejectWrite)return false;bundle=next;window.writes++;return true}});const fetchSaved=ops.fetchPreparation;ops.fetchPreparation=async(...args)=>{if(window.failReload){window.failReload=false;return {data:null,error:'โหลดข้อมูลทดสอบไม่สำเร็จ'}}return fetchSaved(...args)};window.read=()=>bundle;window.ops=ops;
const root=createRoot(document.getElementById('root'));window.mount=async local=>{const fresh={...normalizePlan(${JSON.stringify(fixture)}),substitutes:{}};bundle={year:'2569',semester:2,terms:{1:structuredClone(fresh),2:structuredClone(fresh)}};window.rejectWrite=false;await ops.fetchScheduleInit();root.render(React.createElement(ScheduleServicesProvider,{key:String(local),operations:local?ops:{...ops,localTeachers:undefined},local},React.createElement('div',{className:'workspace-theme'},React.createElement(Prep,{yearId:'2569',semester:2,initialStep:1,onChanged:()=>{}}))))};window.mountTeacher=()=>root.render(React.createElement(ScheduleServicesProvider,{operations:ops,local:true},React.createElement(Teaching)));void window.mount(true);`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
const cssLoader=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s.replace(/@import[^;]*;|@source[^;]*;/g,''))+';document.head.appendChild(style);'`)
const catalog=write('catalog.js',`export async function fetchScheduleCentralSubjects(){throw Error('Unused catalogue')}`)
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`)
const navigation=write('navigation.js',`export function usePathname(){return '/schedules/device/manage'}export function useRouter(){return {push(){},refresh(){}}}`)
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js',publicPath:''},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/app/schedules/catalog-actions$':catalog,'next/link$':link,'next/navigation$':navigation,'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:cssLoader}]}});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))})
const css=['app/globals.css','app/screen-brand-colors.css','app/workspace-theme.css','app/workspace-controls.css'].map(file=>fs.readFileSync(file,'utf8')).join('\n').replace(/@import[^;]*;|@source[^;]*;/g,'')
let browser
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu','--no-proxy-server']})
 const page=await browser.newPage(),errors=[];page.setDefaultNavigationTimeout(120000);page.on('pageerror',error=>errors.push(error.message))
 await page.setRequestInterception(true);page.on('request',request=>request.url()==='https://teacher-edit.test/'?request.respond({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;padding:14px;font-family:Tahoma,sans-serif}*{box-sizing:border-box}</style><div id="root"></div>'}):request.abort())
 await page.goto('https://teacher-edit.test/',{waitUntil:'domcontentloaded'});await page.addScriptTag({content:fs.readFileSync(path.join(out,'bundle.js'),'utf8')})


 const click=async(selector,text)=>{await page.waitForFunction((selector,text)=>[...document.querySelectorAll(selector)].some(el=>el.textContent.includes(text)&&!el.disabled&&el.getClientRects().length),{},selector,text);await page.evaluate((selector,text)=>[...document.querySelectorAll(selector)].find(el=>el.textContent.includes(text)&&!el.disabled&&el.getClientRects().length).click(),selector,text)}
 const fill=async(selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))},value)
 const at=async n=>page.waitForFunction(n=>document.querySelector('.prep-steps li:nth-child('+n+') [aria-current="step"]'),{},n)
 const step=async n=>page.click('.prep-steps li:nth-child('+n+') button')
 const next=async()=>click('.prep-wizard-footer button','ขั้นถัดไป')
 const choose=async choice=>{await page.waitForSelector('.swal2-popup');assert.match(await page.$eval('.swal2-popup',el=>el.textContent),/ยังไม่ได้บันทึก/);await page.click('.swal2-'+choice);await page.waitForFunction(()=>!document.querySelector('.swal2-container'))}
 for(const local of [true,false]){
  await page.setViewport({width:390,height:1100})
  if(!local){await page.evaluate(()=>window.mount(false));await at(1)}
  await page.waitForSelector('.prep-classrooms')
  await click('.prep-classrooms .schedule-clock-tabs button','ประถม');await click('.prep-room-editor-bar button','เปิดชั้นนี้')
  assert.match(await page.$eval('.prep-persist-state',el=>el.textContent),/ยังไม่ได้บันทึก/)
  await next();await choose('cancel');await at(1);assert.equal(await page.evaluate(()=>window.read().terms[2].rooms.length),0)
  assert.equal(await page.$eval('.prep-room-names input',el=>el.value),'1','Cancel retains the edited room')
  await next();await choose('deny');await at(2);assert.equal(await page.evaluate(()=>window.read().terms[2].rooms.length),0)
  await step(1);await at(1);assert.equal(await page.$$('.prep-room-names input').then(els=>els.length),0,'Discard resets the form')
  await click('.prep-room-editor-bar button','เปิดชั้นนี้');await next();await choose('confirm');await at(2)
  assert.equal(await page.evaluate(()=>window.read().terms[1].rooms.length),1)
  await step(1);await at(1);await click('.prep-room-editor-bar button','เพิ่มห้อง');await fill('.prep-room-names label:nth-child(2) input',' EP ')
  await click('.prep-classrooms button','บันทึกชั้นเรียน');await page.waitForFunction(()=>document.querySelector('.prep-persist-state')?.textContent.includes('บันทึกชั้นเรียนเรียบร้อย'))
  assert.equal(await page.evaluate(()=>window.read().terms[2].rooms[1].label),'ป.1/EP');assert.equal(await page.$eval('.prep-classrooms .prep-primary',el=>el.disabled),true)
  await fill('.prep-room-names label:first-child input','IP');await page.evaluate(()=>window.failReload=true);await click('.prep-classrooms button','บันทึกชั้นเรียน')
  await page.waitForFunction(()=>document.querySelector('.prep-persist-state')?.textContent.includes('บันทึกแล้ว · ยังโหลด'))
  const writesAfterCommit=await page.evaluate(()=>window.writes);assert.equal(await page.evaluate(()=>window.read().terms[2].rooms[0].label),'ป.1/IP')
  await click('.prep-classrooms button','โหลดข้อมูลล่าสุด');await page.waitForFunction(()=>document.querySelector('.prep-persist-state')?.textContent.includes('บันทึกชั้นเรียนเรียบร้อย'));assert.equal(await page.evaluate(()=>window.writes),writesAfterCommit,'Reload retry must not repeat a successful write')
  await click('.prep-room-editor-bar button','ปิดชั้นนี้');await page.evaluate(()=>window.rejectWrite=true);await next();await choose('confirm');await at(1)
  await page.waitForFunction(()=>document.querySelector('.prep-persist-state')?.textContent.includes('ยังบันทึกไม่สำเร็จ'))
  assert.equal(await page.evaluate(()=>window.read().terms[2].rooms.filter(r=>r.enabled!==false).length),2)
  await page.screenshot({path:path.join(out,'save-failure-'+local+'.png'),fullPage:true})
  await page.evaluate(()=>window.rejectWrite=false);await click('.prep-classrooms button','บันทึกชั้นเรียน');await page.waitForFunction(()=>document.querySelector('.prep-persist-state')?.textContent.includes('บันทึกชั้นเรียนเรียบร้อย'))
  await click('.prep-room-editor-bar button','เปิดชั้นนี้');await next();await choose('confirm');await at(2)
  // Guard both the footer and direct numbered-step buttons for plan/time edits.
  await page.click('.prep-body .prep-checks input');await step(7);await choose('deny');await at(7);assert.ok(await page.evaluate(()=>window.read().terms[2].days.includes(1)),'Discard keeps the stored school days')
  await step(3);await at(3);await page.click('.prep-teacher-card input');await next();await choose('confirm');await at(4)
  assert.equal(await page.evaluate(()=>window.read().terms[2].teacherIds.length),1)
  await click('.schedule-activities-tabs button','กิจกรรมครู');await click('button','+ เพิ่มกิจกรรมครู');await fill('.schedule-teacher-activity-fields .full input','PLC บันทึกก่อนเปลี่ยนขั้น');await click('.schedule-teacher-activity-form button','เลือกครูทั้งหมด')
  await next();await choose('cancel');await at(4);assert.equal(await page.$eval('.schedule-teacher-activity-fields .full input',el=>el.value),'PLC บันทึกก่อนเปลี่ยนขั้น')
  await next();await choose('confirm');await at(5);assert.equal(await page.evaluate(()=>window.read().terms[2].teacherActivities[0].name),'PLC บันทึกก่อนเปลี่ยนขั้น')
  // Import rows remain unsaved when the add dialog closes, then save via navigation.
  await step(3);await at(3);await click('.prep-teacher-tools button','เพิ่มครู');await page.waitForSelector('dialog[open] input[data-row="0"][data-col="1"]')
  await fill('dialog[open] input[data-row="0"][data-col="1"]','ครูนำเข้าค้าง');await click('dialog[open] header button','ปิด')
  await next();await choose('confirm');await at(4);assert.ok(await page.evaluate(()=>window.read().terms[2].teachers.some(t=>t.name.includes('ครูนำเข้าค้าง'))))
  await click('.schedule-activities-tabs button','กิจกรรมครู');await click('button','+ เพิ่มกิจกรรมครู');await next();await choose('confirm');await at(4)
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="alert"]')].some(el=>el.textContent.includes('กิจกรรม')))
  assert.equal(await page.$eval('.schedule-teacher-activity-fields .full input',el=>el.value),'','Invalid pending form remains editable')
  await click('.schedule-teacher-activity-form button','ยกเลิก');await next();await at(5)
  assert.equal(await page.$('.swal2-container'),null)
 }
 assert.deepEqual(errors,[]);console.log('PASS: Free/Pro save feedback, pending/saving/saved/error states, save/discard/cancel navigation, native direct-step/footer guards, failed-write retention, normalized room labels, time/roster/import/teacher-activity forms and validation stay on current step')
}finally{if(browser)await browser.close()}
