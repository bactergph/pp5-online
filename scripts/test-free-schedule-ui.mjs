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
const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';import Desk from ${JSON.stringify(path.join(root,'components/schedules/FreeScheduleDesk.tsx'))};import Register from ${JSON.stringify(path.join(root,'app/register/page.tsx'))};createRoot(document.getElementById('root')).render(location.pathname==='/register'?React.createElement(Register):React.createElement(Desk,{tier:new URLSearchParams(location.search).get('tier')||'free',registrationOwner:'test-school-member',teacherLimit:Number(new URLSearchParams(location.search).get('limit'))||undefined}));`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText}`)
const css=write('css.cjs',`module.exports=function(source){return 'const style=document.createElement("style");style.textContent='+JSON.stringify(source)+';document.head.appendChild(style);'}`)
const navigation=write('navigation.js',`for(const method of ['pushState','replaceState']){const original=history[method].bind(history);history[method]=(...args)=>{original(...args);window.dispatchEvent(new PopStateEvent('popstate'))}};import{useSyncExternalStore}from'react';const subscribe=f=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f)};const router={push(path){history.pushState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'))},replace(path){history.replaceState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'))}};export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname,()=>'/schedules/device')}export function useRouter(){return router}`)
const link=write('link.js',`import React from 'react';export default function Link({href,children,...rest}){return React.createElement('a',{href,...rest},children)}`)
const image=write('image.js',`import React from 'react';export default function Image({priority,unoptimized,...props}){return React.createElement('img',props)}`)
await new Promise((resolve,reject)=>{
  const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js',publicPath:'/'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root,'next/navigation':navigation,'next/link':link,'next/image':image}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]})
  compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))
})
const registrations=[]
const server=http.createServer(async(req,res)=>{
  if(req.url==='/api/register'&&req.method==='POST'){let body='';for await(const part of req)body+=part;registrations.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,userId:'test-school-member'}));return}
  if(req.url?.startsWith('/brand/')){const file=path.resolve('public'+req.url);if(fs.existsSync(file)){res.end(fs.readFileSync(file));return}}
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
 const bytes=Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await window.__pp5PdfExportStore.blobs.get(window.__pp5PdfExportStore.jobs[0].id).arrayBuffer()))));fs.writeFileSync(path.join(out,filename),bytes);if(['shared-classes.pdf','shared-teacher.pdf'].includes(filename))assert.match(bytes.toString('latin1'),/\/Subtype\s*\/Image/,'School logo missing in '+filename)
}
const step=async n=>page.evaluate(n=>document.querySelectorAll('.prep-steps button')[n-1].click(),n)
const confirm=async()=>{await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm')}
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']})
 page=await browser.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(120000);page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>requests.push({url:request.url(),method:request.method()}));page.on('workercreated',worker=>workers.push(worker.url()))
 await page.setViewport({width:1440,height:1000});await page.goto(origin+'/register',{waitUntil:'domcontentloaded'});await page.waitForSelector('input[name=schoolName]')
 const field=async(selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},value)
 await field('#full_name','สมาชิกทดสอบ');await field('#email','school@example.test');await field('#password','test-password-123');await field('#password2','test-password-123');await field('input[name=schoolName]','โรงเรียนสมัครทดสอบ');await field('input[name=directorName]','นาย ผู้อำนวยการ');await field('input[name=academicHeadName]','นาง หัวหน้าวิชาการ');await field('input[name=academicYear]','2569')
 const logoFile=path.join(out,'school-logo.png');fs.writeFileSync(logoFile,Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const c=canvas.getContext('2d');c.fillStyle='#2563eb';c.fillRect(0,0,64,64);return canvas.toDataURL('image/png').split(',')[1]}),'base64'));await(await page.$('input[name=schoolLogo]')).uploadFile(logoFile);await page.waitForSelector('.device-school-logo-preview img');await page.waitForFunction(()=>!document.querySelector('button[type=submit]').disabled)
 for(const width of [360,1440]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Registration overflow '+width)}
 await click('button[type=submit]','สร้างบัญชี');await page.waitForFunction(()=>document.querySelector('h2')?.textContent==='สมัครเรียบร้อยแล้ว');assert.equal(registrations.length,1);assert.equal(registrations[0].email,'school@example.test');assert.equal(registrations[0].logoDataUrl,undefined)
 const seedFault=await page.evaluateOnNewDocument(()=>{const transaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')throw new DOMException('จำลองพื้นที่เต็มตอนเริ่มต้น','QuotaExceededError');return transaction.apply(this,args)}});await page.goto(origin+'/schedules/device/manage',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('ยังไม่บันทึก'));await page.waitForFunction(()=>!document.querySelector('.local-storage-bar button').disabled);assert.equal(await loadPlan(page),undefined);await page.removeScriptToEvaluateOnNewDocument(seedFault.identifier)
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.prep-steps');let initialSchool=await loadPlan(page);assert.equal(initialSchool.data.terms[2].document.schoolName,'โรงเรียนสมัครทดสอบ');assert.ok(initialSchool.data.terms[2].document.logoDataUrl.startsWith('data:image/png;base64,'));assert.equal(await page.$('.device-school-settings'),null);assert.equal(await page.$eval('.schedule-wizard-entry',el=>el.nextElementSibling?.textContent.includes('ตั้งค่าเบื้องต้น')),true)
 await click('.device-school-settings-button','ตั้งค่าเบื้องต้น');await page.waitForSelector('.device-school-dialog[open]');await field('.device-school-dialog input[name=schoolName]','ข้อมูลที่ยกเลิก');await click('.device-school-dialog footer button','ยกเลิก');assert.equal((await loadPlan(page)).data.terms[2].document.schoolName,'โรงเรียนสมัครทดสอบ')
 await click('.device-school-settings-button','ตั้งค่าเบื้องต้น');await field('.device-school-dialog input[name=academicHeadName]','นาง หัวหน้าใหม่');await click('.device-school-dialog footer button','บันทึกการตั้งค่า');await page.waitForFunction(()=>!document.querySelector('.device-school-dialog'));await idle();initialSchool=await loadPlan(page);assert.equal(initialSchool.data.terms[1].document.academicHeadName,'นาง หัวหน้าใหม่');assert.equal(initialSchool.data.terms[2].document.academicHeadName,'นาง หัวหน้าใหม่');fixture.document=initialSchool.data.terms[2].document
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.prep-steps');assert.equal((await loadPlan(page)).data.terms[2].document.academicHeadName,'นาง หัวหน้าใหม่','Signup defaults must not overwrite an existing local workspace');await click('.device-school-settings-button','ตั้งค่าเบื้องต้น');for(const width of [360,390,768,1440]){await page.setViewport({width,height:1000});assert.equal(await page.$eval('.device-school-dialog',el=>el.scrollWidth>el.clientWidth),false,'School settings overflow '+width)}await page.screenshot({path:path.join(out,'school-settings.png'),fullPage:true});await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.device-school-dialog'));await page.setViewport({width:1440,height:1000});report.schoolSettings=true;report.registration=true
 await seed(page,{year:'2569',semester:2,terms:{1:fixture,2:fixture}});await page.reload({waitUntil:'domcontentloaded'})
 await page.waitForSelector('.prep-steps');assert.equal(await page.$$eval('.prep-steps li',els=>els.length),7)
 console.log('Shared Pro wizard mounted; importing teachers with the real paste grid')
 await step(3);await click('.prep-teacher-tools button','เพิ่มครู');await page.waitForSelector('.prep-teacher-dialog[open]')
 assert.match(await page.$eval('dialog[open] .prep-teacher-capacity',el=>el.textContent),/มีแล้ว 8 คน · เพิ่มได้อีก 17 คน/)
 await paste('dialog[open] input[data-row="0"][data-col="0"]',Array.from({length:18},(_,i)=>'นางสาว\tครูเพิ่ม '+(i+9)+'\tครู').join('\n'))
 await page.waitForFunction(()=>document.querySelector('dialog[open] .prep-teacher-capacity [role="alert"]')?.textContent.includes('เกินสิทธิ์ 1 คน'))
 assert.equal(await page.$eval('dialog[open] footer .prep-primary',el=>el.disabled),true,'Oversized paste is blocked before any save')
 assert.equal((await loadPlan(page)).data.terms[2].teachers.length,8)
 await page.$eval('dialog[open] button[aria-label="นำแถว 18 ออกจากรายการนำเข้า"]',el=>el.click())
 assert.equal(await page.$eval('dialog[open] footer .prep-primary',el=>el.disabled),false,'Removing excess rows clears the quota error immediately')
 await click('dialog[open] footer button','บันทึก 17');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await idle()
 assert.equal((await loadPlan(page)).data.terms[2].teachers.length,25)
 assert.equal((await loadPlan(page)).data.terms[2].teachers[8].prefix,'นางสาว')
 await click('.prep-teacher-tools button','เพิ่มครู');await paste('dialog[open] input[data-row="0"][data-col="0"]','นาย\tคนที่26\tครู')
 await page.waitForFunction(()=>document.querySelector('dialog[open] .prep-error')?.textContent.includes('เกินสิทธิ์ 1 คน'));assert.equal((await loadPlan(page)).data.terms[2].teachers.length,25)
 assert.equal(await page.$eval('dialog[open] footer .prep-primary',el=>el.disabled),true)
 for(const width of [360,390,768,1440]){await page.setViewport({width,height:1000});assert.equal(await page.$eval('dialog[open]',el=>el.scrollWidth>el.clientWidth+1),false,'Teacher quota dialog overflow '+width)}
 await page.screenshot({path:path.join(out,'free-teacher-over-limit.png'),fullPage:false})
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
 assert.equal(await page.$eval('.schedule-filters .schedule-field:nth-child(2) select',el=>el.value),'2','Substitutes must use the current local term, not hard-coded term 1')
 await page.select('.schedule-filters select:nth-of-type(1)','2569').catch(()=>{});await page.$eval('input[type=date]',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-10-26');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});await page.waitForFunction(()=>document.querySelector('.sub-day-label')?.textContent.includes('2026-10-26'));await click('button','นำเข้าจากตารางเรียน');await page.waitForSelector('.sub-table');await page.screenshot({path:path.join(out,'shared-substitute.png'),fullPage:true})
 const dismissSubAlert=()=>page.waitForFunction(()=>!document.querySelector('.app-alert-backdrop'))
 await dismissSubAlert()
 const teacherSelects=await page.$$('.sub-table tbody td:nth-child(6) select')
 for(const select of teacherSelects){const id=await select.evaluate(el=>Array.from(el.options).find(option=>option.value&&!option.disabled)?.value);assert.ok(id,'A free substitute must be available');await select.select(id)}
 await click('.sub-footer button','บันทึกทั้งหมด');await page.waitForFunction(()=>document.querySelector('.app-alert-card')?.textContent.includes('บันทึกตารางสอนแทนทั้งหมดแล้ว'));await dismissSubAlert()
 await click('.sub-footer button','บันทึกทั้งหมด');await page.waitForFunction(()=>document.querySelector('.app-alert-card')?.textContent.includes('บันทึกตารางสอนแทนทั้งหมดแล้ว'));await dismissSubAlert()
 const assignedSubstitutes=(await loadPlan(page)).data.terms[2].substitutes['2026-10-26'];assert.ok(assignedSubstitutes.every(row=>row.substituteTeacherId))
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.sub-actions');await page.$eval('input[type=date]',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-10-26');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});await page.waitForSelector('.sub-table');await page.waitForFunction(()=>Array.from(document.querySelectorAll('.sub-table tbody td:nth-child(6) select')).every(el=>el.value&&Array.from(el.options).find(option=>option.value===el.value&&!option.disabled)))
 await click('.sub-table button','ลบคาบ');await page.waitForSelector('.app-alert-card');await click('.app-alert-btn','ยกเลิก');await dismissSubAlert();assert.equal((await loadPlan(page)).data.terms[2].substitutes['2026-10-26'].length,assignedSubstitutes.length)
 await click('.sub-table button','ลบคาบ');await click('.app-alert-btn','ยืนยันลบ');await page.waitForFunction(()=>document.querySelector('.app-alert-card')?.textContent.includes('ลบรายการสอนแทนแล้ว'));await dismissSubAlert();assert.equal((await loadPlan(page)).data.terms[2].substitutes['2026-10-26']?.length||0,assignedSubstitutes.length-1)
 page.once('dialog',dialog=>dialog.accept());await click('.sub-actions button','นำเข้าจากตารางเรียน');await page.waitForSelector('.sub-table');await dismissSubAlert();await click('.sub-group-head button','ลบรายการครูคนนี้');await click('.app-alert-btn','ยืนยันลบ');await page.waitForFunction(()=>document.querySelector('.app-alert-card')?.textContent.includes('ลบรายการสอนแทนแล้ว'));await dismissSubAlert();assert.equal((await loadPlan(page)).data.terms[2].substitutes['2026-10-26'],undefined)
 await click('.sub-actions button','นำเข้าจากตารางเรียน');await page.waitForSelector('.sub-table');await dismissSubAlert();await click('.sub-footer button','ลบทั้งหมดของวันนี้');await click('.app-alert-btn','ยืนยันลบ');await page.waitForFunction(()=>document.querySelector('.app-alert-card')?.textContent.includes('ลบรายการสอนแทนแล้ว'));await dismissSubAlert();assert.equal((await loadPlan(page)).data.terms[2].substitutes['2026-10-26'],undefined);assert.equal((await loadPlan(page)).data.terms[2].timetable.length,30)
 console.log('Substitute term default, import, assignments, repeat save, reload, cancel and row/teacher/day deletion passed')
 await route('period-times');await page.waitForSelector('.period-table');assert.equal(await page.$$eval('.period-table tbody tr',els=>els.length),7)
 console.log('Shared timetable, availability, conflicts, workload, substitute and period screens passed')
 await route('print');await page.waitForSelector('.sched-export-page');await page.waitForFunction(()=>document.querySelectorAll('.sched-print-table tbody tr').length>0)
 for(const width of [1440,768,390]){await page.setViewport({width,height:1000});const picks=await page.$eval('.sched-export-class-groups',el=>{const cards=Array.from(el.children).map(child=>child.getBoundingClientRect());return {height:el.getBoundingClientRect().height,columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,overflow:el.scrollWidth>el.clientWidth+1,cards:cards.length}});assert.equal(picks.cards,6);assert.ok(picks.height<=385,'Room selection must have a bounded height');assert.equal(picks.overflow,false);if(width===1440)assert.ok(picks.columns>=2,'Desktop grade cards must sit alongside each other');await page.screenshot({path:path.join(out,`shared-print-picks-${width}.png`),fullPage:true})}await page.setViewport({width:1440,height:1000})
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
 const metadata=async(target,name)=>{await target.bringToFront();await target.click('.device-school-settings-button');await target.waitForSelector('.device-school-dialog[open]');await target.$eval('.device-school-dialog input[name=schoolName]',(el,name)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,name);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},name);await target.click('.device-school-dialog button[type=submit]')}
 await metadata(page,'โรงเรียนข้อมูลสมมติ');await page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('บันทึกบนเครื่องแล้ว'),{polling:100});const canonical=await loadPlan(page)
 await metadata(other,'ข้อมูลแท็บเก่า');await other.waitForFunction(()=>document.querySelector('.prep-error')?.textContent.includes('แท็บอื่น'));assert.equal((await loadPlan(page)).savedAt,canonical.savedAt)
 await other.close();await page.evaluate(()=>{window.originalDeviceTransaction=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')throw new DOMException('พื้นที่จำลองเต็ม','QuotaExceededError');return window.originalDeviceTransaction.apply(this,args)}})
 await metadata(page,'ยังไม่บันทึก');await page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('ยังไม่บันทึก'));await page.evaluate(()=>IDBDatabase.prototype.transaction=window.originalDeviceTransaction)
 assert.equal((await loadPlan(page)).savedAt,canonical.savedAt);report.crossTabGuard=true;report.storageFailure=true
 // A server-granted allowance changes the live desk, not the downloaded backup.
 page=await browser.newPage();page.on('pageerror',error=>errors.push(String(error)));await page.goto(origin+'/schedules/device/manage?limit=40',{waitUntil:'domcontentloaded'});await page.waitForSelector('.prep-steps');assert.ok((await page.$eval('.local-storage-bar',el=>el.textContent)).includes('40 คน'));await step(3);await click('.prep-teacher-tools button','เพิ่มครู')
 assert.match(await page.$eval('dialog[open] .prep-teacher-capacity',el=>el.textContent),/สูงสุด 40 คน.*มีแล้ว 25 คน · เพิ่มได้อีก 15 คน/)
 await click('dialog[open] footer button','หน้าบุคลากร');await page.waitForSelector('dialog[open][aria-labelledby="local-personnel-title"]');assert.match(await page.$eval('dialog[open][aria-labelledby="local-personnel-title"] header',el=>el.textContent),/25 \/ 40 คน/);await click('dialog[open][aria-labelledby="local-personnel-title"] header button','ปิด')
 await paste('dialog[open] input[data-row="0"][data-col="0"]','นาย\tคนที่26ตามสิทธิ์พิเศษ\tครู');await click('dialog[open] footer button','บันทึก 1');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await idle();assert.equal((await loadPlan(page)).data.terms[2].teachers.length,26);await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.prep-steps');assert.ok((await page.$eval('.local-storage-bar',el=>el.textContent)).includes('40 คน'));assert.equal((await loadPlan(page)).data.terms[2].teachers.length,26);await page.screenshot({path:path.join(out,'free-custom-teacher-limit.png'),fullPage:false});console.log('PASS: server-granted Free allowance permits teacher 26, persists across reload and displays the actual allowance')
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(requests.filter(request=>request.method!=='GET'&&request.url!==origin+'/api/register').length,0)
 assert.equal(requests.filter(request=>/^https?:/.test(request.url)&&!request.url.startsWith(origin)).length,0)
 report.workerCount=workers.length;report.networkWrites=0;report.sharedScreens=8;report.teacherLimit=25;report.xlsxImport=true;report.offlineWorker=true;report.errors=errors
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log('PASS: same Pro components across all 7 steps/8 menus, paste/XLSX imports, 25-teacher cap, multi-room/two-teacher activities, worker draft + explicit commit, IndexedDB reload, offline calculation, responsive widths and zero backend requests')
}catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error(await page.$eval('body',el=>el.innerText).catch(()=>''));console.error(errors)}throw error}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
