// Actual local desk, IndexedDB, Web Worker and solver. Synthetic data; no backend mock or production access.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage,root=process.cwd(),out=path.resolve('tmp/free-schedule-ui')
fs.mkdirSync(out,{recursive:true})
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';import Desk from ${JSON.stringify(path.join(root,'components/schedules/FreeScheduleDesk.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Desk,{tier:new URLSearchParams(location.search).get('tier')||'free'}));`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText}`)
const css=write('css.cjs',`module.exports=function(source){return 'const style=document.createElement("style");style.textContent='+JSON.stringify(source)+';document.head.appendChild(style);'}`)
const navigation=write('navigation.js',`for(const method of ['pushState','replaceState']){const original=history[method].bind(history);history[method]=(...args)=>{original(...args);window.dispatchEvent(new PopStateEvent('popstate'))}};import{useSyncExternalStore}from'react';const subscribe=f=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f)};const router={push(path){history.pushState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'))},replace(path){history.replaceState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'))}};export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname,()=>'/schedules/device')}export function useRouter(){return router}`)
const link=write('link.js',`import React from 'react';export default function Link({href,children,...rest}){return React.createElement('a',{href,...rest},children)}`)
await new Promise((resolve,reject)=>{
  const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js',publicPath:'/'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root,'next/navigation':navigation,'next/link':link}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]})
  compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))
})
const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/fonts/')){const font=path.resolve('public'+req.url);if(fs.existsSync(font)){res.setHeader('Content-Type','font/ttf');res.end(fs.readFileSync(font));return}}
  const file=path.join(out,path.basename((req.url||'').split('?')[0]))
  if(req.url?.endsWith('.js')&&fs.existsSync(file)){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));return}
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:20px;font-family:Tahoma,sans-serif;background:#f4f7fc}button,input,select,textarea{font:inherit}*{box-sizing:border-box}</style><div id="root"></div><script src="/bundle.js"></script></html>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
const rooms=Array.from({length:6},(_,i)=>({id:`room-${i+1}`,label:`ป.${i+1}/1`}))
const teachers=Array.from({length:8},(_,i)=>({id:`teacher-${i+1}`,name:`ครูตัวอย่าง ${i+1}`}))
const periods=[1,2,3,0,4,5,6].map((period,i)=>({period,label:period?`คาบ ${period}`:'พักกลางวัน',start_time:`${String(8+i).padStart(2,'0')}:00`,end_time:`${String(9+i).padStart(2,'0')}:00`,is_break:!period,sort_order:i+1}))
const fixture={teachers,rooms,places:[],subjects:rooms.map((room,i)=>({id:`subject-${i+1}`,roomId:room.id,code:'ค21101',name:'คณิตศาสตร์',teacherId:teachers[i].id,periods:4,pattern:[1,1,1,1],placeId:null})),timetable:[{classroomId:rooms[0].id,day:1,period:1,subjectId:'subject-1',locked:true}],days:[1,2,3,4,5],periods,blocks:[{teacherId:'teacher-7',day:1,period:1}],activities:[],substitutes:{}}
let browser,page
const errors=[],requests=[],workers=[],report={widths:[]}
const loadPlan=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('pp5-schedule-device',1);r.onsuccess=()=>{const db=r.result,read=db.transaction('snapshots').objectStore('snapshots').get('free-plan');read.onsuccess=()=>{resolve(read.result);db.close()};read.onerror=()=>reject(read.error)}}))
const seed=async(page,data)=>page.evaluate(data=>new Promise((resolve,reject)=>{const r=indexedDB.open('pp5-schedule-device',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>{const db=r.result,tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({data,savedAt:'2026-10-23T00:00:00.000Z'},'free-plan');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}}),data)
const click=async(selector,text)=>{
 await page.waitForFunction((selector,text)=>Array.from(document.querySelectorAll(selector)).some(el=>el.textContent.includes(text)&&!el.disabled&&el.getClientRects().length),{},selector,text)
 await page.evaluate((selector,text)=>Array.from(document.querySelectorAll(selector)).find(el=>el.textContent.includes(text)&&!el.disabled&&el.getClientRects().length).click(),selector,text)
}
const route=async view=>{await page.evaluate(view=>history.pushState(null,'','/schedules/device/'+view),view)}
const idle=async()=>page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('บันทึกบนเครื่องแล้ว'))
const paste=async(selector,text)=>page.$eval(selector,(el,text)=>{const clipboard=new DataTransfer();clipboard.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clipboard}))},text)
const exportPdf=async(filename,selector)=>{
 await click(selector,'บันทึก PDF');await page.waitForFunction(()=>window.__pp5PdfExportStore?.jobs[0]?.status==='ready'||window.__pp5PdfExportStore?.jobs[0]?.status==='error',{timeout:60000})
 assert.equal(await page.evaluate(()=>window.__pp5PdfExportStore.jobs[0].status),'ready',await page.evaluate(()=>window.__pp5PdfExportStore.jobs[0].error))
 fs.writeFileSync(path.join(out,filename),Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await window.__pp5PdfExportStore.blobs.get(window.__pp5PdfExportStore.jobs[0].id).arrayBuffer())))))
}
const step=async n=>page.evaluate(n=>document.querySelectorAll('.prep-steps button')[n-1].click(),n)
const confirm=async()=>{await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm')}
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']})
 page=await browser.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(120000);page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>requests.push({url:request.url(),method:request.method()}));page.on('workercreated',worker=>workers.push(worker.url()))
 await page.setViewport({width:1440,height:1000});await page.goto(origin+'/schedules/device/manage',{waitUntil:'domcontentloaded'})
 await seed(page,{year:'2569',semester:2,terms:{1:fixture,2:fixture}});await page.reload({waitUntil:'domcontentloaded'})
 await page.waitForSelector('.prep-steps');assert.equal(await page.$$eval('.prep-steps li',els=>els.length),7)
 console.log('Shared Pro wizard mounted; importing teachers with the real paste grid')
 await step(3);await click('.prep-teacher-tools button','เพิ่มครู');await page.waitForSelector('.prep-teacher-dialog[open]')
 await paste('dialog[open] input[data-row="0"][data-col="0"]',Array.from({length:17},(_,i)=>'นางสาว\tครูเพิ่ม '+(i+9)+'\tครู').join('\n'))
 await click('dialog[open] footer button','บันทึก 17');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await idle()
 assert.equal((await loadPlan(page)).data.terms[2].teachers.length,25)
 assert.equal((await loadPlan(page)).data.terms[2].teachers[8].prefix,'นางสาว')
 await click('.prep-teacher-tools button','เพิ่มครู');await paste('dialog[open] input[data-row="0"][data-col="0"]','นาย\tคนที่26\tครู');await click('dialog[open] footer button','บันทึก 1')
 await page.waitForFunction(()=>document.querySelector('dialog[open] .prep-error')?.textContent.includes('25'));assert.equal((await loadPlan(page)).data.terms[2].teachers.length,25)
 await click('dialog[open] footer button','ยกเลิก')
 // Unsaved input persists when moving among wizard steps; clear it before arranging.
 await step(4);await click('.prep-subject-tools button','เพิ่มรายวิชา');await page.waitForSelector('.prep-subject-dialog[open]')
 const XLSX=await import('xlsx'),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ห้องนักเรียน','รหัสวิชา','ชื่อวิชา','คาบต่อสัปดาห์','กลุ่มสาระ','ประเภท'],['ป.1/1','ค21101','คณิตศาสตร์',4,'คณิตศาสตร์','พื้นฐาน']]),'รายวิชา')
 const workbook=path.join(out,'subjects.xlsx');XLSX.writeFile(book,workbook);await (await page.$('dialog[open] input[type=file]')).uploadFile(workbook)
 await page.waitForFunction(()=>document.querySelector('dialog[open] input[data-row="0"][data-col="1"]')?.value==='ค21101')
 assert.ok(await page.$eval('dialog[open]',el=>el.textContent.includes('โหลดเทมเพลต')&&el.textContent.includes('นำออก')))
 await click('dialog[open] footer button','บันทึก 1');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await idle()
 assert.equal((await loadPlan(page)).data.terms[2].subjects[0].subjectGroup,'คณิตศาสตร์');assert.equal((await loadPlan(page)).data.terms[2].subjects[0].teacherId,'teacher-1')
 // Clear the retained failed teacher row through the same grid controls.
 await step(3);await click('.prep-teacher-tools button','เพิ่มครู');await page.click('dialog[open] button[aria-label="นำแถว 1 ออกจากรายการนำเข้า"]');await click('dialog[open] footer button','ยกเลิก')
 console.log('Teacher cap and XLSX import passed; checking shared activity editor')
 await step(5);await click('button','เพิ่มกิจกรรม');await page.type('.prep-catalog-dialog[open] input','ลูกเสือ');await click('.prep-catalog-dialog[open] footer button','บันทึก');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await idle()
 await click('.prep-activity-assign-tools button','กำหนดกิจกรรม');await page.waitForSelector('.prep-team-dialog[open]');await click('dialog[open] button','เลือกทุกห้อง')
 await page.click('dialog[open] input[aria-label="ครูตัวอย่าง 7"]');await page.click('dialog[open] input[aria-label="ครูตัวอย่าง 8"]')
 await click('dialog[open] footer button','บันทึกกิจกรรม');await confirm();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await idle()
 let configured=await loadPlan(page);assert.equal(configured.data.terms[2].activities[0].roomIds.length,6);assert.equal(configured.data.terms[2].activities[0].teacherIds.length,2);assert.equal(configured.data.terms[2].activities[0].cells.length,0)
 // The actual management menu shares the same venue editor, with durable local writes.
 await click('.schedule-workspace-nav button','สถานที่');await page.waitForSelector('.schedule-places .places-table tbody tr');await page.waitForFunction(()=>!document.querySelector('.schedule-places')?.getAttribute('aria-busy')?.includes('true'))
 for(let i=1;i<=6;i++){
  const input=`.places-table tr[data-lesson-id="subject-${i}"] input[role=combobox]`
  await page.click(input);await page.type(input,'สถานที่ห้อง '+i);await click(`.places-table tr[data-lesson-id="subject-${i}"] [role=option]`,'+ เพิ่มสถานที่ “สถานที่ห้อง '+i+'”')
  await page.waitForFunction(()=>document.querySelector('.schedule-places')?.getAttribute('aria-busy')==='false')
 }
 const venuePlan=await loadPlan(page);assert.equal(new Set(venuePlan.data.terms[2].subjects.map(s=>s.placeId)).size,6);assert.equal(venuePlan.data.terms[2].places.length,6)
 assert.ok(venuePlan.data.terms[2].subjects.every(s=>s.periods===4&&s.pattern.join('+')==='1+1+1+1'))
 await page.$eval('.places-catalog',el=>el.open=true);const venue=venuePlan.data.terms[2].places[0]
 await page.$eval('.places-catalog-row input',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'ห้องทดลองที่แก้ชื่อ');el.dispatchEvent(new Event('input',{bubbles:true}))});await page.waitForFunction(()=>!document.querySelector('.places-catalog-row button').disabled);await click('.places-catalog-row button','บันทึกชื่อ');await page.waitForFunction(()=>document.querySelector('.schedule-places')?.getAttribute('aria-busy')==='false')
 assert.equal((await loadPlan(page)).data.terms[2].places.find(p=>p.id===venue.id).name,'ห้องทดลองที่แก้ชื่อ')
 await click('.places-catalog-row button','ลบ');await page.waitForSelector('.places-dialog[open]');assert.ok(await page.$eval('.places-dialog',el=>el.textContent.includes('เลือกสถานที่ทดแทน')));await click('.places-dialog footer button','ยกเลิก')
 for(const width of [360,1440]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Places overflow at '+width)}
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.prep-steps');await click('.schedule-workspace-nav button','สถานที่');await page.waitForSelector('.places-table tr[data-lesson-id="subject-1"] input');assert.equal(await page.$eval('.places-table tr[data-lesson-id="subject-1"] input',el=>el.value),'ห้องทดลองที่แก้ชื่อ')
 await click('.schedule-workspace-nav button','จัดตาราง');await page.waitForSelector('.prep-steps');report.venues=true
 for(const n of [1,2,3,4,5,6]){await step(n);for(const width of [360,1440]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Step '+n+' overflow at '+width)}}
 await page.setViewport({width:1440,height:1000});await step(7);await click('button','สร้างตารางฉบับร่าง');await page.waitForSelector('.prep-review-save',{timeout:65000})
 assert.ok(workers.length);assert.equal((await loadPlan(page)).data.terms[2].timetable.length,1,'Draft is never committed implicitly')
 for(const width of [360,390,768,1024,1440]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Review overflow at '+width);report.widths.push(width)}
 await page.screenshot({path:path.join(out,'shared-review.png'),fullPage:true})
 await click('button','บันทึกใช้ตารางนี้');await confirm();await page.waitForFunction(()=>document.querySelector('.swal2-title')?.textContent==='บันทึกตารางแล้ว');await confirm();await idle()
 const saved=await loadPlan(page);assert.equal(saved.data.terms[2].timetable.length,30);assert.equal(saved.data.terms[2].timetable.filter(row=>row.activityId).length,6)
 await route('class');await page.waitForSelector('.schedule-board');await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.schedule-board');assert.ok((await page.$eval('body',el=>el.innerText)).includes('ลูกเสือ'))
 await route('teaching');await page.waitForSelector('.teacher-availability-panel');assert.ok(await page.$('button.availability-cell'))
 await route('conflicts');await page.waitForSelector('.no-conflicts');assert.ok((await page.$eval('.no-conflicts',el=>el.innerText)).includes('ไม่พบ'))
 await route('workload');await page.waitForSelector('.workload-report table');await page.waitForFunction(()=>document.querySelectorAll('.workload-report tbody tr').length>1);assert.equal(await page.$$eval('.workload-report tbody tr',els=>els.length),8);await exportPdf('shared-workload.pdf','.workload-report-head button')
 await route('substitute');await page.waitForSelector('.sub-actions');await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(el=>el.textContent.includes('นำเข้าจากตารางเรียน')&&!el.disabled))
 await page.select('.schedule-filters select:nth-of-type(1)','2569').catch(()=>{});await page.$eval('input[type=date]',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-10-26');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});await page.waitForFunction(()=>document.querySelector('.sub-day-label')?.textContent.includes('2026-10-26'));await click('button','นำเข้าจากตารางเรียน');await page.waitForSelector('.sub-table');await page.screenshot({path:path.join(out,'shared-substitute.png'),fullPage:true})
 await route('period-times');await page.waitForSelector('.period-table');assert.equal(await page.$$eval('.period-table tbody tr',els=>els.length),7)
 console.log('Shared timetable, availability, conflicts, workload, substitute and period screens passed')
 await route('print');await page.waitForSelector('.sched-export-page');await page.waitForFunction(()=>document.querySelectorAll('.sched-print-table tbody tr').length>0)
 await page.select('#schedule-print-day','29');await page.select('#schedule-print-month','10');await page.select('#schedule-print-year','2026')
 assert.equal(await page.$$eval('.sched-print-sign',els=>els.filter(el=>el.textContent.includes('29 ตุลาคม 2569')).length),1)
 await click('.sched-export-picks-head button','เลือกทั้งหมด');await exportPdf('shared-classes.pdf','.sched-export-head button')
 await click('.sched-export-type button','ตารางสอน');await page.waitForFunction(()=>document.querySelectorAll('.sched-print-table tbody tr').length>0);await exportPdf('shared-teacher.pdf','.sched-export-head button')
 await page.screenshot({path:path.join(out,'shared-print.png'),fullPage:true})
 // Actual offline worker calculation and cancellation/discard keep IndexedDB unchanged.
 await route('manage');await page.waitForSelector('.prep-steps');await step(7);await page.setOfflineMode(true);await click('button','สร้างตารางฉบับร่าง');await page.waitForSelector('.prep-review-save',{timeout:65000});await page.setOfflineMode(false)
 assert.equal((await loadPlan(page)).data.terms[2].timetable.length,30)
 await click('button','ทิ้งฉบับร่าง');await confirm();await page.waitForFunction(()=>!document.querySelector('.prep-review-save'))
 // Two tabs must never silently overwrite one another; a failed storage transaction must not report success.
 const other=await browser.newPage();await other.goto(origin+'/schedules/device/manage',{waitUntil:'domcontentloaded'});await other.waitForSelector('.prep-steps')
 const metadata=async(target,name)=>{await target.bringToFront();await target.$eval('.device-school-settings',el=>el.open=true);await target.$eval('.device-school-settings input',(el,name)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,name);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},name);await target.waitForFunction(()=>Array.from(document.querySelectorAll('.device-school-settings button')).some(el=>el.textContent.includes('บันทึกข้อมูลโรงเรียน')&&!el.disabled),{polling:100});await target.$$eval('.device-school-settings button',els=>els.find(el=>el.textContent.includes('บันทึกข้อมูลโรงเรียน')).click())}
 await metadata(page,'โรงเรียนข้อมูลสมมติ');await page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('บันทึกบนเครื่องแล้ว'),{polling:100});const canonical=await loadPlan(page)
 await metadata(other,'ข้อมูลแท็บเก่า');await other.waitForFunction(()=>document.querySelector('.prep-error')?.textContent.includes('แท็บอื่น'));assert.equal((await loadPlan(page)).savedAt,canonical.savedAt)
 await other.close();await page.evaluate(()=>{window.originalDeviceTransaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')throw new DOMException('พื้นที่จำลองเต็ม','QuotaExceededError');return window.originalDeviceTransaction.apply(this,args)}})
 await metadata(page,'ยังไม่บันทึก');await page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('ยังไม่บันทึก'));await page.evaluate(()=>IDBDatabase.prototype.transaction=window.originalDeviceTransaction)
 assert.equal((await loadPlan(page)).savedAt,canonical.savedAt);report.crossTabGuard=true;report.storageFailure=true
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(requests.filter(request=>request.method!=='GET').length,0)
 assert.equal(requests.filter(request=>/^https?:/.test(request.url)&&!request.url.startsWith(origin)).length,0)
 report.workerCount=workers.length;report.networkWrites=0;report.sharedScreens=8;report.teacherLimit=25;report.xlsxImport=true;report.offlineWorker=true;report.errors=errors
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('PASS: same Pro components across all 7 steps/8 menus, paste/XLSX imports, 25-teacher cap, multi-room/two-teacher activities, worker draft + explicit commit, IndexedDB reload, offline calculation, responsive widths and zero backend requests')
}catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error(await page.$eval('body',el=>el.innerText).catch(()=>''));console.error(errors)}throw error}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
