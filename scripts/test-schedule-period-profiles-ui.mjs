import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import pkg from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=pkg,root=process.cwd(),out=path.resolve('tmp/period-profiles-ui')
fs.mkdirSync(out,{recursive:true})
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const fixture={teachers:[{id:'00000000-0000-4000-8000-000000000001',name:'นาย ครูหนึ่ง ทดสอบ',prefix:'นาย',fullName:'ครูหนึ่ง ทดสอบ',position:'ครู'},{id:'00000000-0000-4000-8000-000000000002',name:'นางสาว ครูสอง ทดสอบ',prefix:'นางสาว',fullName:'ครูสอง ทดสอบ',position:'ครู'}],rooms:[],subjects:[],timetable:[]}
const entry=write('entry.js',`
import React from 'react';import{createRoot}from'react-dom/client';
import Prep from ${JSON.stringify(path.join(root,'components/schedules/PeriodTimesEntry.tsx'))};
import{ScheduleServicesProvider}from ${JSON.stringify(path.join(root,'components/schedules/ScheduleServices.tsx'))};
import{normalizePlan}from ${JSON.stringify(path.join(root,'lib/schedule-device-free.ts'))};
import{createDeviceScheduleServices}from ${JSON.stringify(path.join(root,'lib/schedule-device-services.ts'))};
const plan={...normalizePlan(${JSON.stringify(fixture)}),substitutes:{}};let bundle={year:'2569',semester:2,terms:{1:structuredClone(plan),2:structuredClone(plan)}};
window.writes=0;window.rejectWrite=false;const ops=createDeviceScheduleServices({read:()=>bundle,write:async next=>{if(window.rejectWrite)return false;bundle=next;window.writes++;return true}});window.read=()=>bundle;window.ops=ops;
const root=createRoot(document.getElementById('root'));window.mount=async local=>{const fresh={...normalizePlan(${JSON.stringify(fixture)}),substitutes:{}};bundle={year:'2569',semester:2,terms:{1:structuredClone(fresh),2:structuredClone(fresh)}};window.rejectWrite=false;await ops.fetchScheduleInit();root.render(React.createElement(ScheduleServicesProvider,{key:String(local),operations:local?ops:{...ops,localTeachers:undefined},local},React.createElement('div',{className:'workspace-theme'},React.createElement(Prep,{yearId:'2569',semester:2,initialStep:1,onChanged:()=>{}}))))};void window.mount(true);`)
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
 await page.waitForSelector('.schedule-clock-editor')
 await click('.schedule-clock-tabs button','อนุบาล');await click('button','ใช้ตัวอย่างเวลาอนุบาล');await click('.schedule-clock-tabs button','มัธยม');await click('.schedule-clock-add button','+ ช่วงเรียน')
 for(const width of [320,390,768,1440]){await page.setViewport({width,height:1000});assert.equal(await page.$eval('.schedule-clock-editor',el=>el.scrollWidth>el.clientWidth+1),false,'Overflow '+width)}
 await click('.schedule-clock-editor button','บันทึกวันและเวลา');await page.waitForFunction(()=>window.read().terms[2].periods[0].profiles?.secondary?.filter(row=>!row.is_break).length===7)
 assert.equal(await page.evaluate(()=>window.read().terms[1].periods[0].profiles.secondary.filter(row=>!row.is_break).length),7,'School clocks shared by both terms')
 assert.equal(await page.evaluate(()=>window.read().terms[2].periods[0].profiles.kindergarten.filter(row=>row.is_break).length),3)
 await click('.schedule-clock-tabs button','ประถม');assert.equal(await page.$$eval('.schedule-clock-card .schedule-clock-row:not(.schedule-clock-columns)',els=>els.length),7,'Primary still six lessons and lunch')
 await click('.schedule-clock-tabs button','อนุบาล');assert.equal(await page.$$eval('.schedule-clock-card .schedule-clock-break',els=>els.length),3)
 assert.deepEqual(errors,[]);console.log('PASS: standalone school clock screen; independent three-band tabs/period counts/multiple breaks, school-wide save and 320/390/768/1440 widths')
}finally{if(browser)await browser.close()}
