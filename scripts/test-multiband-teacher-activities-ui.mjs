import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import pkg from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=pkg,root=process.cwd(),out=path.resolve('tmp/multiband-ui')
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
window.writes=0;window.rejectWrite=false;const ops=createDeviceScheduleServices({read:()=>bundle,write:async next=>{if(window.rejectWrite)return false;bundle=next;window.writes++;return true}});window.read=()=>bundle;window.ops=ops;
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

 page.on('dialog',dialog=>dialog.accept())
 const click=async(selector,text)=>{await page.waitForFunction((selector,text)=>[...document.querySelectorAll(selector)].some(el=>el.textContent.includes(text)&&!el.disabled&&el.getClientRects().length),{},selector,text);await page.evaluate((selector,text)=>[...document.querySelectorAll(selector)].find(el=>el.textContent.includes(text)&&!el.disabled&&el.getClientRects().length).click(),selector,text)}
 const step=async n=>{await page.click('.prep-steps li:nth-child('+n+') button')}
 const fill=async(selector,value)=>{await page.$eval(selector,(el,value)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))},value)}
 for(const local of [true,false]){
  if(!local){await page.evaluate(()=>window.mount(false));await page.waitForSelector('.prep-classrooms')}
  assert.deepEqual(await page.$$eval('.prep-steps strong',els=>els.slice(0,2).map(el=>el.textContent)),['กำหนดชั้น','วันและเวลา'])
  for(const band of ['อนุบาล','ประถม','มัธยม']){await click('.prep-classrooms .schedule-clock-tabs button',band);await click('.prep-room-editor-bar button','เปิดชั้นนี้')}
  await click('.prep-classrooms button','บันทึกชั้นเรียน');await page.waitForFunction(()=>window.read().terms[2].rooms.length===3)
  assert.equal(await page.evaluate(()=>window.read().terms[1].rooms.length),3)
  await step(2);await click('.schedule-clock-tabs button','อนุบาล');await click('button','ใช้ตัวอย่างเวลาอนุบาล')
  await click('.schedule-clock-picker .schedule-clock-tabs button','มัธยม');await click('.schedule-clock-add button','+ ช่วงเรียน')
  for(const width of [320,390,768,1440]){await page.setViewport({width,height:1000});assert.equal(await page.$eval('.schedule-clock-editor',el=>el.scrollWidth>el.clientWidth+1),false,'Clock overflow '+width);if(width===390)await page.screenshot({path:path.join(out,'clock-'+local+'.png'),fullPage:true})}
  await click('.schedule-clock-editor button','บันทึกวันและเวลา');await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm');await page.waitForFunction(()=>window.read().terms[2].periods[0].profiles?.secondary?.filter(row=>!row.is_break).length===7&&!document.querySelector('.swal2-container'))
  assert.equal(await page.evaluate(()=>window.read().terms[2].periods[0].profiles.kindergarten.filter(row=>row.is_break).length),3)
  await step(4);await click('.schedule-activities-tabs button','กิจกรรมครู');await click('button','+ เพิ่มกิจกรรมครู')
  await fill('.schedule-teacher-activity-fields .full input','PLC ทดสอบ');await click('.schedule-teacher-activity-form button','เลือกครูทั้งหมด')
  await step(2);await page.waitForSelector('.swal2-cancel');await page.click('.swal2-cancel');await page.waitForFunction(()=>!document.querySelector('.swal2-container'));assert.equal(await page.$eval('.schedule-teacher-activity-fields .full input',el=>el.value),'PLC ทดสอบ','Cancelling step navigation preserves the unsubmitted form')
  await click('.schedule-teacher-activity-form button','บันทึกกิจกรรมครู');await page.waitForFunction(()=>window.read().terms[2].teacherActivities?.[0]?.name==='PLC ทดสอบ'&&!document.querySelector('.schedule-teacher-activity-form'))
  assert.equal(await page.evaluate(()=>window.read().terms[1].teacherActivities?.length||0),0,'Teacher activity is term-scoped')
  await click('.schedule-teacher-activity-item button','แก้ไข');await fill('.schedule-teacher-activity-fields .full input','PLC แก้ไข');await page.evaluate(()=>window.rejectWrite=true);await click('.schedule-teacher-activity-form button','บันทึกกิจกรรมครู');await page.waitForFunction(()=>[...document.querySelectorAll('[role="alert"]')].some(el=>el.textContent.includes('ยังไม่ได้บันทึก')))
  assert.equal(await page.$eval('.schedule-teacher-activity-fields .full input',el=>el.value),'PLC แก้ไข');await page.evaluate(()=>window.rejectWrite=false)
  await click('.schedule-teacher-activity-form button','บันทึกกิจกรรมครู');await page.waitForFunction(()=>window.read().terms[2].teacherActivities?.[0]?.name==='PLC แก้ไข'&&!document.querySelector('.schedule-teacher-activity-form'))
  for(const width of [320,390,768]){await page.setViewport({width,height:1000});assert.equal(await page.$eval('[aria-label="จัดการกิจกรรมครู"]',el=>el.scrollWidth>el.clientWidth+1),false,'Activity overflow '+width)}
  await page.screenshot({path:path.join(out,'activities-'+local+'.png'),fullPage:true})
  await click('.schedule-teacher-activity-item button','ลบ');await page.waitForFunction(()=>window.read().terms[2].teacherActivities?.length===0)
 }
 await page.evaluate(async()=>{const result=await window.ops.fetchPreparation('2569',2);const data=result.data;await window.ops.savePreparation('2569',2,data.hash,{...data.plan,teacherActivities:[{id:crypto.randomUUID(),name:'PLC ทดสอบเวลา',days:[3],teacherIds:[data.teachers[0].id],start_time:'15:30',end_time:'16:30'}]});window.mountTeacher()})
 await page.waitForSelector('.schedule-filters select');const filters=await page.$$('.schedule-filters select');await filters[2].select('00000000-0000-4000-8000-000000000001');await page.waitForFunction(()=>document.querySelector('.teacher-availability-panel')?.textContent.includes('PLC ทดสอบเวลา'))
 await page.setViewport({width:390,height:1000});assert.ok(await page.$('.teacher-availability-panel .availability-cell'));assert.ok((await page.$eval('.teacher-availability-panel',el=>el.textContent)).includes('15:30'));await page.screenshot({path:path.join(out,'teacher-agenda-390.png'),fullPage:true})
 assert.deepEqual(errors,[]);console.log('PASS: actual Free/Pro wizard shared UI: classes-first/3 bands/unequal clocks/multiple breaks, PLC add/edit/delete, retained draft on navigation/write failure, term separation and 320/390/768/1440 widths')
}finally{if(browser)await browser.close()}
