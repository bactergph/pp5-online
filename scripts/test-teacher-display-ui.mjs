import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import puppeteer from 'puppeteer-core'
import pkg from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=pkg,root=process.cwd(),out=path.resolve('tmp/teacher-display-ui')
fs.mkdirSync(out,{recursive:true})
const write=(name,text)=>{const file=path.join(out,name);fs.writeFileSync(file,text);return file}
execFileSync(process.execPath,['scripts/test-teacher-display-clock.cjs'],{cwd:root,stdio:'pipe',windowsHide:true})
const fixture=JSON.parse(fs.readFileSync('tmp/pdfs/teacher-display/fixture.json','utf8'))
const entry=write('entry.js',`
import React from 'react';import {createRoot} from 'react-dom/client';
import Timeline from ${JSON.stringify(path.join(root,'components/schedules/TeacherTimeline.tsx'))};
import Grid from ${JSON.stringify(path.join(root,'components/schedules/ScheduleGridTable.tsx'))};
const pages=${JSON.stringify(fixture.pages.slice(0,3))};const root=createRoot(document.getElementById('root'));
window.show=index=>{const p=pages[index];root.render(p.layout==='teacher-timeline'?React.createElement(Timeline,{times:p.periodTimes,cells:p.gridData,days:[1,2,3,4,5]}):React.createElement(Grid,{periodTimes:p.periodTimes,days:[1,2,3,4,5],renderCell:(day,period)=>p.gridData[day+'-'+period]?.line1||'—'}))};window.show(0);
`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader}]}});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))})
let browser
try {
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu','--no-proxy-server']})
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.setViewport({width:1440,height:900});await page.setContent('<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Tahoma;margin:16px}#root{overflow:auto}*{box-sizing:border-box}</style><div id="root"></div>')
 await page.addScriptTag({content:fs.readFileSync(path.join(out,'bundle.js'),'utf8')})
 await page.waitForSelector('.schedule-grid-table')
 assert.equal(await page.$$eval('thead th',els=>els.length),8,'Primary-only view: day + six lessons + lunch')
 assert.match(await page.$eval('thead',el=>el.textContent),/คาบที่ 4/)
 assert.doesNotMatch(await page.$eval('thead',el=>el.textContent),/09:10|16:30/)
 await page.evaluate(()=>window.show(1));await page.waitForSelector('[aria-label="ตารางสอนรายสัปดาห์ตามเวลาจริง"]')
 assert.equal(await page.$$eval('tbody tr',els=>els.length),5)
 assert.equal(await page.$$eval('[data-period]',els=>els.length),3,'Both lessons and PLC visible')
 const positions=await page.$$eval('[data-period]',els=>els.map(el=>({text:el.textContent,left:parseFloat(el.style.left),width:parseFloat(el.style.width)})))
 assert.equal(positions[0].left,0);assert.ok(Math.abs(positions[0].width-100*40/480)<0.01)
 assert.ok(Math.abs(positions[1].left-100*60/480)<0.01);assert.match(positions[2].text,/PLC/)
 await page.screenshot({path:path.join(out,'mixed-desktop.png'),fullPage:true})
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'mixed-mobile.png'),fullPage:true})
 assert.ok(await page.$eval('table',el=>el.parentElement.scrollWidth>el.parentElement.clientWidth),'Mobile timeline scrolls locally')
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No page-wide overflow')
 await page.evaluate(()=>window.show(2));await page.waitForFunction(()=>document.querySelector('ol')?.textContent.includes('ประชุมย่อย'))
 assert.match(await page.$eval('ol',el=>el.textContent),/09:15–09:25/)
 assert.deepEqual(errors,[])
 console.log('PASS: primary-only headings, real-time proportional cross-band UI, PLC, five weekdays, mobile scroll, short-event notes, no browser errors')
} finally {if(browser)await browser.close()}
