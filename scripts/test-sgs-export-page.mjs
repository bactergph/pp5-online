// Real Export page with synthetic authorized score responses; no school data or writes.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage,root=process.cwd(),out=path.resolve('tmp/sgs-export-page')
fs.mkdirSync(out,{recursive:true})
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const actions=write('actions.js',`
window.requests=[];window.entryWaiters=[];window.holdEntries=false;let release;window.holdTermTwo=false;window.releaseTermTwo=()=>release?.();
export async function fetchScoreInit(){return {activeYearId:'year',years:[{id:'year',year_be:2569,is_active:true},{id:'empty-year',year_be:2568,is_active:false}],subjects:[{id:'thai',code:'ท21101',name:'ภาษาไทย'}]}}
export async function fetchScoreClassrooms(year){return year==='year'?[{id:'a',level:'ม.1',room:1},{id:'b',level:'ม.1',room:2}]:[]}
export async function fetchScoreSubjects(room,term){window.requests.push(['subjects',room,term]);if(term===2&&window.holdTermTwo)await new Promise(resolve=>release=resolve);return [{id:room+'-'+term,classroom_id:room,subject_id:'thai'}]}
export async function fetchScoreEntryData(room,offering,term){window.requests.push(['entry',room,offering,term]);if(window.holdEntries)await new Promise(resolve=>window.entryWaiters.push(resolve));return {config:room==='b'?null:{between_scores:[20,0],midterm_max:0,final_max:30},students:[{id:'student',student_code:'00101',prefix:'เด็กชาย',first_name:'ตัวอย่าง',last_name:'ทดสอบ'}],scores:[{student_id:'student',unit_scores:{'1':0},final_score:15}],entryOpen:false}}
`)
const nav=write('navigation.js',`export function usePathname(){return '/seka/export/sgs'}`)
const link=write('link.js',`import React from'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`)
const entry=write('entry.js',`import React from'react';import{createRoot}from'react-dom/client';import Page from ${JSON.stringify(path.join(root,'app/(shell)/export/sgs/page.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Page));`)
const loader=write('ts.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
const cssLoader=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style);'`)
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js',publicPath:''},resolve:{extensions:['.tsx','.ts','.js'],alias:{'../../scores/actions$':actions,'next/navigation$':nav,'next/link$':link,'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:cssLoader}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]});compiler.run((e,s)=>compiler.close(()=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()))})
const styles=['app/globals.css','app/screen-brand-colors.css','app/workspace-theme.css','app/workspace-controls.css'].map(file=>fs.readFileSync(file,'utf8').replace(/@import[^;]*;|@source[^;]*;/g,'')).join('\n')
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-first-run','--disable-gpu','--no-proxy-server']})
try{
  const page=await browser.newPage(),errors=[];page.setDefaultNavigationTimeout(120000);page.on('pageerror',error=>errors.push(error.message))
  await page.setViewport({width:1440,height:1000});await page.setRequestInterception(true)
  page.on('request',request=>request.url().startsWith('https://sgs-export-test.invalid/')?request.respond({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'body{margin:0;padding:16px;box-sizing:border-box}</style><body class="workspace-theme"><div id="root"></div></body></html>'}):request.abort())
  await page.goto('https://sgs-export-test.invalid/',{waitUntil:'domcontentloaded'});await page.addScriptTag({content:fs.readFileSync(path.join(out,'bundle.js'),'utf8')})
  const ready='.sgs-page-ready button',select='.sgs-page-fields select'
  await page.waitForSelector(ready+':not(:disabled)');assert.equal(await page.$eval('.sgs-page-notice a',el=>el.getAttribute('href')),'/seka/scores')
  assert.ok(await page.$eval('.sgs-page-heading a',el=>el.href.endsWith('/downloads/jarnsek-sgs-extension.zip')))
  const choose=async(index,value)=>{const selects=await page.$$(select);await selects[index].select(value)}
  await page.click(ready);await page.waitForSelector('.sgs-export-dialog[open]');assert.equal(await page.$('.sgs-export-warning'),null,'Only persisted scores are exported')
  await page.evaluate(()=>{const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.exportedBlob=blob;return original(blob)}})
  await page.click('.sgs-export-dialog footer .btn-primary');const packet=await page.evaluate(async()=>JSON.parse(await window.exportedBlob.text()))
  assert.equal(packet.context.classroom,'ม.1/1');assert.equal(packet.context.term,1);assert.equal(packet.students[0].studentCode,'00101');assert.deepEqual(packet.students[0].values,[0,15])
  await page.click('.sgs-export-dialog header button')
  await page.evaluate(()=>window.holdTermTwo=true);await choose(1,'2');assert.equal(await page.$eval(ready,el=>el.disabled),true,'Old term cannot be exported while new term is loading')
  await page.waitForFunction(()=>window.requests.some(row=>row[0]==='subjects'&&row[2]===2));await choose(1,'1');await page.waitForSelector(ready+':not(:disabled)');await page.evaluate(()=>window.releaseTermTwo());await page.waitForFunction(()=>document.querySelector('.sgs-page-ready').textContent.includes('ภาคเรียนที่ 1'))
  await page.click(ready);await page.waitForSelector('.sgs-export-dialog[open]');assert.ok(await page.$eval('.sgs-export-meta',el=>el.textContent.includes('ภาคเรียน 1')));await page.click('.sgs-export-dialog header button')
  await page.evaluate(()=>{window.holdTermTwo=false;window.holdEntries=true});await choose(2,'b');await page.waitForFunction(()=>window.entryWaiters.length===1);await choose(2,'a');await page.waitForFunction(()=>window.entryWaiters.length===2);assert.equal(await page.$eval(ready,el=>el.disabled),true,'Returning to an earlier room must fetch fresh scores before exporting');await page.evaluate(()=>{window.holdEntries=false;window.entryWaiters.forEach(resolve=>resolve())});await page.waitForSelector(ready+':not(:disabled)');
  for(const width of [320,390,768,1440]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflow '+width);await page.click(ready);await page.waitForSelector('.sgs-export-dialog[open]');assert.equal(await page.$eval('.sgs-export-dialog',el=>el.scrollWidth>el.clientWidth),false,'Dialog overflow '+width);await page.click('.sgs-export-dialog header button');await page.screenshot({path:path.join(out,'export-sgs-'+width+'.png'),fullPage:true})}
  await choose(2,'b');await page.waitForSelector('[role="alert"]');assert.equal(await page.$eval(ready,el=>el.disabled),true);assert.ok(await page.$eval('[role="alert"]',el=>el.textContent.includes('สัดส่วนคะแนน')))
  await choose(0,'empty-year');await page.waitForFunction(()=>document.querySelector('.sgs-page-selection').textContent.includes('ยังไม่มีห้องเรียนที่คุณมีสิทธิ์'));assert.equal(await page.$eval(ready,el=>el.disabled),true)
  assert.deepEqual(errors,[]);console.log('PASS: actual SGS Export page, saved zero/blank scores, student codes, closed entry period, stale term cancellation, empty rooms/config, scoped score link, extension download and 320–1440px')
}finally{await browser.close()}
