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
const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';import Desk from ${JSON.stringify(path.join(root,'components/schedules/FreeScheduleDesk.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Desk,{tier:'free'}));`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText}`)
const css=write('css.cjs',`module.exports=function(source){return 'const style=document.createElement("style");style.textContent='+JSON.stringify(source)+';document.head.appendChild(style);'}`)
await new Promise((resolve,reject)=>{
  const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js',publicPath:'/'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]})
  compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))
})
const server=http.createServer((req,res)=>{
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
const fixture={teachers,rooms,places:[],subjects:rooms.map((room,i)=>({id:`subject-${i+1}`,roomId:room.id,code:`ค${i+1}`,name:'คณิตศาสตร์',teacherId:teachers[i].id,periods:4,pattern:[1,1,1,1],placeId:null})),timetable:[{classroomId:rooms[0].id,day:1,period:1,subjectId:'subject-1',locked:true}],days:[1,2,3,4,5],periods,blocks:[{teacherId:'teacher-7',day:1,period:1}],activities:[],substitutes:{}}
let browser,page
const errors=[],requests=[],workers=[]
const report={widths:[],workerCount:0,networkWrites:0}
const loadPlan=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('pp5-schedule-device',1);r.onsuccess=()=>{const db=r.result,read=db.transaction('snapshots').objectStore('snapshots').get('free-plan');read.onsuccess=()=>{resolve(read.result);db.close()};read.onerror=()=>reject(read.error)}}))
const seed=async(page,data)=>page.evaluate(data=>new Promise((resolve,reject)=>{const r=indexedDB.open('pp5-schedule-device',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>{const db=r.result,tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({data,savedAt:'2026-10-23T00:00:00.000Z'},'free-plan');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}}),data)
const click=async(selector,text)=>{
  await page.waitForFunction((selector,text)=>Array.from(document.querySelectorAll(selector)).some(el=>el.textContent.includes(text)&&!el.disabled),{},selector,text)
  await page.evaluate((selector,text)=>Array.from(document.querySelectorAll(selector)).find(el=>el.textContent.includes(text)&&!el.disabled).click(),selector,text)
}
const settled=async()=>{await page.waitForFunction(()=>!document.querySelector('.swal2-container'))}
try{
  browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']})
  page=await browser.newPage();page.setDefaultNavigationTimeout(120000);page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>requests.push({url:request.url(),method:request.method()}));page.on('workercreated',worker=>workers.push(worker.url()))
  console.log('Browser opened; loading local desk')
  await page.setViewport({width:1440,height:1000});await page.goto(origin,{waitUntil:'domcontentloaded'})
  await seed(page,{semester:2,terms:{1:fixture,2:fixture}});await page.reload({waitUntil:'domcontentloaded'})
  console.log('Fixture seeded; opening wizard')
  await page.waitForSelector('.workspace-nav');await click('.quick','จัดตาราง')
  assert.equal(await page.$$eval('.prep-steps li',els=>els.length),7)
  await click('.prep-steps button','กิจกรรม');await click('button','เพิ่มการจัดกิจกรรม');await page.waitForSelector('dialog[open]')
  await page.type('dialog .field input','ลูกเสือ');await click('dialog button','เลือกทุกห้อง')
  await page.click('dialog input[aria-label="ครูตัวอย่าง 7"]');await page.click('dialog input[aria-label="ครูตัวอย่าง 8"]')
  await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'mobile-activity.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.setViewport({width:1440,height:1000})
  await click('dialog button','บันทึกกิจกรรม');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('บันทึกบนเครื่องแล้ว'))
  console.log('Activity saved; generating draft')
  await click('.prep-steps button','กำหนดครู');await click('summary','วางรายชื่อจาก Excel')
  await page.type('.local-disclosure textarea',Array.from({length:17},(_,i)=>'ครูเพิ่ม '+(i+9)).join('\n'));await click('button','นำเข้ารายชื่อ')
  await page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('บันทึกบนเครื่องแล้ว'))
  assert.equal((await loadPlan(page)).data.terms[2].teachers.length,25)
  assert.equal(await page.$eval('button[type=submit].prep-primary',el=>el.disabled),true,'Adding a single 26th teacher is disabled')
  await page.type('.local-disclosure textarea','ครูเกิน 25');await click('button','นำเข้ารายชื่อ')
  await page.waitForFunction(()=>document.querySelector('.prep-error')?.textContent.includes('25'))
  assert.equal((await loadPlan(page)).data.terms[2].teachers.length,25,'Bulk import cannot bypass the cap')
  await click('.prep-steps button','รายวิชา');await click('summary','นำเข้าจาก Excel')
  await page.type('.local-disclosure textarea','ป.1/1\tพ26\tวิชาทดสอบ\tครูเกิน 25\t1\t0');await click('button','นำเข้ารายวิชา')
  await page.waitForFunction(()=>document.querySelector('.prep-error')?.textContent.includes('25'))
  assert.equal((await loadPlan(page)).data.terms[2].subjects.length,6,'Subject import cannot create a 26th teacher')
  const tooMany=structuredClone((await loadPlan(page)).data);tooMany.terms[1].teachers.push({id:'too-many',name:'ครูคนที่ 26'})
  const tooManyPath=write('too-many-teachers.json',JSON.stringify({format:'jarnsek-device-schedule',version:1,data:tooMany}))
  await (await page.$('input[type=file]')).uploadFile(tooManyPath)
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.error')).some(el=>el.textContent.includes('25')))
  assert.equal((await loadPlan(page)).data.terms[2].teachers.length,25,'Backup import cannot bypass the cap')
  report.teacherLimit=25
  const configured=await loadPlan(page);assert.equal(configured.data.terms[2].activities[0].roomIds.length,6);assert.equal(configured.data.terms[2].activities[0].teacherIds.length,2);assert.equal(configured.data.terms[2].activities[0].cells.length,0)
  await click('.prep-steps button','ตรวจและจัดตาราง');await click('button','สร้างตารางฉบับร่าง');await page.waitForFunction(()=>document.querySelector('.prep-review-save')||document.querySelector('.prep-review-incomplete')||document.querySelector('.error'),{timeout:60000});assert.ok(await page.$('.prep-review-save'),await page.$eval('body',el=>el.innerText))
  console.log('Draft generated')
  for(const index of [1,2,3,4,5,6]){
    await page.evaluate(index=>document.querySelectorAll('.prep-steps button')[index-1].click(),index)
    for(const width of [360,1440]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Step '+index+' overflow at '+width)}
  }
  await page.evaluate(()=>document.querySelectorAll('.prep-steps button')[6].click());await page.setViewport({width:1440,height:1000})
  assert.ok(workers.length>0,'Actual Web Worker must run')
  assert.equal((await loadPlan(page)).data.terms[2].timetable.length,1,'Creating draft cannot change real timetable')
  assert.equal(await page.$$eval('.prep-review-grid .prep-slot-activity',els=>els.length),1,'Joint activity preview must show its real label')
  await page.screenshot({path:path.join(out,'desktop-review.png'),fullPage:true})
  for(const width of [360,390,768,1024,1440]){
    await page.setViewport({width,height:1000})
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
    if(overflow)console.log(await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth&&getComputedStyle(el).position!=='absolute'&&!el.closest('.prep-scroll,.board')}).slice(0,12).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))})))
    assert.equal(overflow,false,`Page overflow at ${width}`)
    report.widths.push(width)
  }
  await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'mobile-review.png'),fullPage:true})
  await click('button','บันทึกใช้ตารางนี้');await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm');await settled();await page.waitForSelector('.quota')
  const saved=await loadPlan(page),cells=saved.data.terms[2].timetable
  const client=await page.createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out})
  const backupPath=path.join(out,'jarnsek-schedule-backup.json');if(fs.existsSync(backupPath))fs.unlinkSync(backupPath)
  await (await page.$('.local-storage-bar button')).click()
  for(let attempt=0;attempt<300&&!fs.existsSync(backupPath);attempt++)await new Promise(resolve=>setTimeout(resolve,100))
  const downloaded=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(downloaded.format,'jarnsek-device-schedule');assert.equal(downloaded.data.terms[2].timetable.length,30)
  assert.equal(cells.filter(cell=>cell.subjectId).length,24);assert.equal(cells.filter(cell=>cell.activityId).length,6);assert.equal(cells.length,30)
  assert.ok(cells.some(cell=>cell.classroomId==='room-1'&&cell.subjectId==='subject-1'&&cell.day===1&&cell.period===1&&cell.locked))
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.quota')
  assert.ok(await page.$eval('.board',el=>el.textContent.includes('ลูกเสือ')),'Activity survives reload')
  await page.setOfflineMode(true)
  await click('.quick','จัดตาราง');await click('.prep-steps button','ตรวจและจัดตาราง');await click('button','สร้างตารางฉบับร่าง');await page.waitForSelector('.prep-review-save',{timeout:60000})
  await click('button','ทิ้งฉบับร่าง');await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm');await settled()
  assert.equal(JSON.stringify((await loadPlan(page)).data.terms[2].timetable),JSON.stringify(cells),'Discarding offline draft keeps saved table')
  await page.setOfflineMode(false)
  await (await page.$('input[type=file]')).uploadFile(backupPath);await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm');await settled();await page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('บันทึกบนเครื่องแล้ว'))
  assert.equal((await loadPlan(page)).data.terms[2].timetable.length,30,'Restore keeps all activity and subject periods')
  await click('button','สร้างตารางฉบับร่าง');await page.waitForSelector('.prep-review-save',{timeout:60000})
  const changed=structuredClone((await loadPlan(page)).data);changed.terms[2].teachers[0].name='แก้จากอีกแท็บ'
  await seed(page,changed)
  await click('button','บันทึกใช้ตารางนี้');await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm');await settled()
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.error')).some(el=>el.textContent.includes('ข้อมูลเปลี่ยน')))
  assert.equal((await loadPlan(page)).data.terms[2].teachers[0].name,'แก้จากอีกแท็บ','Stale draft cannot overwrite newer database')
  page.once('dialog',dialog=>dialog.accept())
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.quota')
  await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,...args){if(mode==='readwrite')throw new DOMException('พื้นที่เต็มในการทดสอบ','QuotaExceededError');return original.call(this,stores,mode,...args)}})
  await click('.quick','จัดตาราง');await click('.prep-steps button','กำหนดครู');await page.type('input[aria-label="ชื่อครู 1"]',' แก้แล้วบันทึกไม่ได้')
  await page.waitForFunction(()=>document.querySelector('.local-storage-bar')?.textContent.includes('ยังไม่บันทึก'))
  assert.equal((await loadPlan(page)).data.terms[2].teachers.length,25,'Failed IndexedDB transaction must preserve previously saved data')
  report.storageFailureHandled=true
  assert.equal(errors.length,0,errors.join('\n'))
  assert.equal(requests.filter(request=>request.method!=='GET').length,0,'No schedule data may leave the browser')
  assert.equal(requests.filter(request=>!request.url.startsWith(origin)).length,0,'No backend dependency for workspace')
  report.backupRoundtrip=true
  report.workerCount=workers.length;report.networkWrites=0;report.errors=errors
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2))
  console.log('PASS: actual seven-step UI, multi-room/two-teacher activity, Web Worker solve, explicit commit, IndexedDB reload, offline calculation, discard, 25-teacher limit, cross-tab conflict, quota failure and five responsive widths; no network writes')
}catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error(await page.$eval('body',el=>el.innerText).catch(()=>''));console.error(errors)}throw error}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
