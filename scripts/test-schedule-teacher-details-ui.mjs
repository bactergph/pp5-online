import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import pkg from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=pkg,root=process.cwd(),out=path.resolve('tmp/teacher-details-ui')
fs.mkdirSync(out,{recursive:true})
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const fixture={teachers:[{id:'t1',name:'นาย ชื่อเดิม ทดสอบ',prefix:'นาย',fullName:'ชื่อเดิม ทดสอบ',position:'ครู'},{id:'t2',name:'นางสาว อีกท่าน',prefix:'นางสาว',fullName:'อีกท่าน',position:'ครู'}],rooms:[{id:'r1',label:'ป.1/1'}],subjects:[{id:'s1',roomId:'r1',code:'ท11101',name:'ภาษาไทย',teacherId:'t1',periods:1,pattern:[1],placeId:null}],timetable:[{classroomId:'r1',subjectId:'s1',day:1,period:1,locked:true}]}
const entry=write('entry.js',`
import React from 'react';import{createRoot}from'react-dom/client';
import Prep from ${JSON.stringify(path.join(root,'components/schedules/SchedulePreparation.tsx'))};
import{ScheduleServicesProvider}from ${JSON.stringify(path.join(root,'components/schedules/ScheduleServices.tsx'))};
import{normalizePlan}from ${JSON.stringify(path.join(root,'lib/schedule-device-free.ts'))};
import{createDeviceScheduleServices}from ${JSON.stringify(path.join(root,'lib/schedule-device-services.ts'))};
const plan={...normalizePlan(${JSON.stringify(fixture)}),substitutes:{}};let bundle={year:'2569',semester:2,terms:{1:structuredClone(plan),2:structuredClone(plan)}};
window.writes=0;window.rejectWrite=false;const ops=createDeviceScheduleServices({read:()=>bundle,write:async next=>{if(window.rejectWrite)return false;bundle=next;window.writes++;return true}});window.read=()=>bundle;window.ops=ops;
const root=createRoot(document.getElementById('root'));window.mount=async local=>{await ops.fetchScheduleInit();root.render(React.createElement(ScheduleServicesProvider,{key:String(local),operations:local?ops:{...ops,localTeachers:undefined},local},React.createElement('div',{className:'workspace-theme'},React.createElement(Prep,{yearId:'2569',semester:2,initialStep:3,onChanged:()=>{}}))))};void window.mount(true);`)
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
 const card='[data-teacher="t1"]',dialog='.prep-teacher-edit-dialog[open]'
 const fill=async(name,value)=>{const selector=dialog+` [name="${name}"]`;await page.click(selector);await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Backspace');if(value)await page.type(selector,value)}
 await page.waitForSelector(card+' .prep-teacher-rename');const selected=await page.$eval(card+' input',input=>input.checked)
 await page.click(card+' .prep-teacher-rename');await page.waitForSelector(dialog);assert.equal(await page.$eval(card+' input',input=>input.checked),selected,'Edit must not change teacher selection')
 await fill('prefix','นางสาว');await fill('name','ชื่อใหม่ ทดสอบ');await fill('position','ครูชำนาญการ')
 for(const width of [320,390,768,1440]){await page.setViewport({width,height:900});assert.equal(await page.$eval(dialog,element=>element.scrollWidth>element.clientWidth+1),false,'Modal overflow '+width);await (await page.$(dialog)).screenshot({path:path.join(out,'teacher-editor-'+width+'.png')})}
 await page.click(dialog+' button[type=submit]');await page.waitForFunction(()=>window.writes===1);await page.waitForSelector(dialog,{hidden:true});assert.ok((await page.$eval(card,card=>card.textContent)).includes('ชื่อใหม่ ทดสอบ'))
 let data=await page.evaluate(()=>window.read());assert.equal(data.terms[1].teachers[0].fullName,'ชื่อใหม่ ทดสอบ');assert.equal(data.terms[2].teachers.length,2);assert.equal(data.terms[2].subjects[0].teacherId,'t1');assert.deepEqual(data.terms[2].timetable,fixture.timetable)
 await page.click(card+' .prep-teacher-rename');await fill('name','ยกเลิกชื่อ');await page.keyboard.press('Escape');await page.waitForSelector(dialog,{hidden:true});assert.equal(await page.evaluate(()=>window.writes),1)
 await page.click(card+' .prep-teacher-rename');await fill('name','ลองบันทึกใหม่');await page.evaluate(()=>window.rejectWrite=true);await page.click(dialog+' button[type=submit]');await page.waitForSelector(dialog+' .prep-error');assert.equal(await page.evaluate(()=>window.writes),1);await page.evaluate(()=>window.rejectWrite=false);await page.click(dialog+' button[type=submit]');await page.waitForFunction(()=>window.writes===2);await page.waitForSelector(dialog,{hidden:true})
 await page.evaluate(()=>window.mount(false));await page.waitForSelector(card+' .prep-teacher-rename');await page.click(card+' .prep-teacher-rename');await fill('name','ชื่อจากหน้ารุ่นโปร');await page.click(dialog+' button[type=submit]');await page.waitForFunction(()=>window.writes===3);await page.waitForSelector(dialog,{hidden:true});assert.ok((await page.$eval(card,card=>card.textContent)).includes('ชื่อจากหน้ารุ่นโปร'));assert.equal(await page.$eval(card+' input',input=>input.checked),selected);assert.deepEqual(errors,[])
 console.log('PASS: step-three rename/save/cancel/retry on Free and online UI; 320–1440 widths; stable teacher ID, both terms, selection, subject assignment and locked timetable preserved')
}finally{if(browser)await browser.close()}
