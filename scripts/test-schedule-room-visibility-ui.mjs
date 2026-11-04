import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import pkg from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=pkg,root=process.cwd(),out=path.resolve('tmp/room-visibility-ui')
fs.mkdirSync(out,{recursive:true})
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const entry=write('entry.js',`
import React,{useState} from'react';import{createRoot}from'react-dom/client';
import Editor from ${JSON.stringify(path.join(root,'components/schedules/ClassroomLevelEditor.tsx'))};
import{ScheduleServicesProvider}from ${JSON.stringify(path.join(root,'components/schedules/ScheduleServices.tsx'))};
import{normalizePlan}from ${JSON.stringify(path.join(root,'lib/schedule-device-free.ts'))};
import{devicePreparation}from ${JSON.stringify(path.join(root,'lib/schedule-device-view.ts'))};
import{createDeviceScheduleServices}from ${JSON.stringify(path.join(root,'lib/schedule-device-services.ts'))};
const initial={...normalizePlan({rooms:[{id:'r1',label:'ป.1/IP'},{id:'r2',label:'ป.1/EP'}],teachers:[{id:'t',name:'ครูหนึ่ง'}],subjects:[{id:'s',roomId:'r2',teacherId:'t',code:'ท11101',name:'ภาษาไทย',periods:1,pattern:[1]}],timetable:[{classroomId:'r2',subjectId:'s',day:1,period:1,locked:true}]}),substitutes:{}};
let bundle,ops;const root=createRoot(document.getElementById('root'));window.read=()=>bundle;
function Harness({local}){const[data,setData]=useState(devicePreparation(bundle.terms[2])),[busy,setBusy]=useState(false);return <ScheduleServicesProvider operations={ops} local={local}><div className="workspace-theme"><section className="schedule-prep"><Editor classrooms={data.allClassrooms} year="2569" term={2} locked={false} busy={busy} onBusy={setBusy} onSaved={async()=>setData((await ops.fetchPreparation('2569',2)).data)}/></section></div></ScheduleServicesProvider>}
window.mount=async local=>{bundle={year:'2569',semester:2,terms:{1:structuredClone(initial),2:structuredClone(initial)}};ops=createDeviceScheduleServices({read:()=>bundle,write:async next=>{bundle=next;return true}});await ops.fetchScheduleInit();root.render(<Harness key={String(local)} local={local}/>)};void window.mount(true);`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
const cssLoader=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s.replace(/@import[^;]*;|@source[^;]*;/g,''))+';document.head.appendChild(style);'`)
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js',publicPath:''},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/entry\.js$/,use:loader},{test:/\.css$/,use:cssLoader}]}});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))})
const css=['app/globals.css','app/workspace-theme.css','app/workspace-controls.css','components/schedules/schedule-preparation.css'].map(file=>fs.readFileSync(file,'utf8')).join('\n').replace(/@import[^;]*;|@source[^;]*;/g,'')
let browser
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu','--no-proxy-server']})
 const page=await browser.newPage(),errors=[];page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>r.url()==='https://room-state.test/'?r.respond({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;padding:12px;font-family:Tahoma,sans-serif}*{box-sizing:border-box}</style><div id="root"></div>'}):r.abort())
 await page.goto('https://room-state.test/',{waitUntil:'domcontentloaded'});await page.addScriptTag({content:fs.readFileSync(path.join(out,'bundle.js'),'utf8')})
 const click=async text=>{await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(el=>el.textContent===text&&!el.disabled&&el.getClientRects().length),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(el=>el.textContent===text&&!el.disabled&&el.getClientRects().length).click(),text)}
 const save=async enabled=>{await click('บันทึกชั้นเรียน');await page.waitForFunction(enabled=>window.read().terms[2].rooms.filter(r=>r.enabled!==false).length===enabled,{},enabled);await page.waitForFunction(()=>!document.querySelector('.prep-error'))}
 for(const local of [true,false]){
  if(!local){await page.evaluate(()=>window.mount(false));await page.waitForSelector('.prep-room-names input')}
  for(const width of [320,390,1440]){await page.setViewport({width,height:900});assert.equal(await page.$eval('.prep-classrooms',el=>el.scrollWidth>el.clientWidth+1),false,'Horizontal overflow '+width)}
  await click('ปิดชั้นนี้');await save(0);assert.match(await page.$eval('.prep-room-editor',el=>el.textContent),/ข้อมูลเดิมยังเก็บไว้/)
  assert.equal(await page.evaluate(()=>window.read().terms[1].rooms.filter(r=>r.enabled===false).length),2)
  assert.equal(await page.evaluate(()=>window.read().terms[2].subjects.length),1);assert.equal(await page.evaluate(()=>window.read().terms[2].timetable[0].locked),true)
  await click('เปิดชั้นนี้');assert.deepEqual(await page.$$eval('.prep-room-names input',els=>els.map(el=>el.value)),['IP','EP']);await save(2)
  await click('ปิดห้องสุดท้าย');await save(1);await click('เพิ่มห้อง');assert.deepEqual(await page.$$eval('.prep-room-names input',els=>els.map(el=>el.value)),['IP','EP']);await save(2)
  assert.deepEqual(await page.evaluate(()=>window.read().terms[2].rooms.map(r=>r.id)),['r1','r2']);await page.setViewport({width:390,height:900});await page.screenshot({path:path.join(out,`rooms-${local}.png`),fullPage:true})
 }
 assert.deepEqual(errors,[]);console.log('PASS: actual classroom editor, Free/online layouts, 320/390/1440px, occupied closure, preserved two-term data, restored labels and stable room IDs')
}finally{await browser?.close()}
