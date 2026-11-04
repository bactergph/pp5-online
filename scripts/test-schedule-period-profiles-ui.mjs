import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import pkg from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=pkg,root=process.cwd(),out=path.resolve('tmp/period-profiles-ui')
fs.mkdirSync(out,{recursive:true})
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const entry=write('entry.js',`
import React from 'react';import {createRoot} from 'react-dom/client';
import Periods from ${JSON.stringify(path.join(root,'components/schedules/PeriodTimesEntry.tsx'))};
import Wizard from ${JSON.stringify(path.join(root,'components/schedules/WizardPeriodEditor.tsx'))};
import {ScheduleServicesProvider} from ${JSON.stringify(path.join(root,'components/schedules/ScheduleServices.tsx'))};
import {createDeviceScheduleServices} from ${JSON.stringify(path.join(root,'lib/schedule-device-services.ts'))};
import {normalizePlan} from ${JSON.stringify(path.join(root,'lib/schedule-device-free.ts'))};
import {levelPeriodTimes,teacherPeriodTimes} from ${JSON.stringify(path.join(root,'lib/schedule-period-profiles.ts'))};
let bundle={year:'2569',semester:1,terms:{1:{...normalizePlan(),substitutes:{}},2:{...normalizePlan(),substitutes:{}}}};
const ops=createDeviceScheduleServices({read:()=>bundle,write:async next=>{bundle=next;window.writes++;return true}});window.writes=0;window.read=()=>bundle;window.ops=ops;
const root=createRoot(document.getElementById('root'));
function WizardView(){const [rows,setRows]=React.useState(bundle.terms[1].periods);return React.createElement(Wizard,{rows,onChange:setRows,configured:false,dirty:true,onSave:()=>ops.savePeriodTimes(rows)})}
window.mount=async wizard=>{await ops.fetchScheduleInit();root.render(React.createElement(ScheduleServicesProvider,{operations:ops,local:true},React.createElement(wizard?WizardView:Periods,{key:String(wizard)+window.writes})))};window.clock=()=>({primary:levelPeriodTimes(bundle.terms[1].periods,'ป.1'),secondary:levelPeriodTimes(bundle.terms[1].periods,'ม.1'),teacher:teacherPeriodTimes(bundle.terms[1].periods)});void window.mount(false);
`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js',publicPath:''},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))})
let browser
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu','--no-proxy-server']})
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setRequestInterception(true);page.on('request',r=>r.abort())
 await page.setContent('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Tahoma;margin:0;padding:16px}*{box-sizing:border-box}</style><div id="root"></div>',{waitUntil:'domcontentloaded'});await page.addScriptTag({content:fs.readFileSync(path.join(out,'bundle.js'),'utf8')});await page.waitForSelector('[aria-label="เวลาเรียนแยกระดับชั้น"] input')
 const clickText=async text=>{const handle=await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===t),text);assert.ok(handle.asElement(),text);await handle.asElement().click()}
 await page.click('[aria-label="เวลาเรียนแยกระดับชั้น"] input');await clickText('มัธยม ม.1–ม.6');await page.select('.period-lunch-setting select','4')
 for(const width of [360,390,768,1440]){await page.setViewport({width,height:1000});assert.equal(await page.$eval('.period-workspace',el=>el.scrollWidth>el.clientWidth+1),false,'Overflow '+width);if(width===390||width===1440)await page.screenshot({path:path.join(out,'periods-'+width+'.png'),fullPage:true})}
 const save=await page.$('.period-actions .primary');await save.click();await page.waitForFunction(()=>window.writes===1)
 const clock=await page.evaluate(()=>window.clock());assert.equal(clock.primary.find(row=>row.is_break).start_time,'11:30');assert.equal(clock.secondary.find(row=>row.is_break).start_time,'12:30');assert.ok(clock.teacher.some(row=>row.start_time==='11:30'&&!row.is_break))
 assert.equal(await page.evaluate(()=>JSON.stringify(window.read().terms[1].periods)===JSON.stringify(window.read().terms[2].periods)),true,'Both terms retain school clock profiles')
 await page.evaluate(()=>window.mount(true));await page.waitForSelector('.prep-period-editor');await clickText('ประถม ป.1–ป.6');assert.equal(await page.$eval('[aria-label="พักกลางวันหลังคาบเรียน"]',el=>el.value),'3');await clickText('มัธยม ม.1–ม.6');assert.equal(await page.$eval('[aria-label="พักกลางวันหลังคาบเรียน"]',el=>el.value),'4')
 await page.select('[aria-label="พักกลางวันหลังคาบเรียน"]','3');await clickText('บันทึกวันและเวลา');await page.waitForFunction(()=>window.writes===2);assert.equal((await page.evaluate(()=>window.clock())).secondary.find(row=>row.is_break).start_time,'11:30')
 assert.deepEqual(errors,[]);console.log('PASS: actual clock and wizard screens; split/tabs/lunch/save/reload; both terms; 360/390/768/1440 widths; actual teacher columns and preserved primary clock')
}finally{if(browser)await browser.close()}
