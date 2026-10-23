// Actual wizard and workload dialogs; isolated synthetic school, no production writes.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage, root=process.cwd(), out=path.resolve('tmp/workload-autosave-ui')
fs.mkdirSync(out,{recursive:true})
const fixture={hash:'0',timesConfigured:true,classrooms:[1,2].map(n=>({id:`r${n}`,level:'ม.1',name:String(n),room:n})),teachers:[1,2].map(n=>({id:`t${n}`,prefix:'ครู',full_name:`ตัวอย่าง ${n}`})),activities:[],slots:[],blocks:[],periods:[1,2,0,3].map((n,i)=>({period:n,is_break:!n,sort_order:i+1,start_time:`${8+i}:00`,end_time:`${9+i}:00`})),plan:{days:[1,2,3,4,5],rooms:[{id:'venue',name:'ห้องวิทยาศาสตร์'}],rules:{},reduceGaps:false,maxContinuous:0,activityGroups:[]},lessons:[{id:'math1',classroomId:'r1',code:'ค21102',name:'คณิตศาสตร์',count:3,subjectGroup:'คณิตศาสตร์',teacherId:null},{id:'math2',classroomId:'r2',code:'ค21102',name:'คณิตศาสตร์',count:4,subjectGroup:'คณิตศาสตร์',teacherId:null},{id:'thai',classroomId:'r1',code:'ท21102',name:'ภาษาไทย',count:2,subjectGroup:'ภาษาไทย',teacherId:null}]}
let state=structuredClone(fixture),failAssignment=false,revision=0,activeWrites=0,maxWrites=0
const calls=[]
const write=(name,text)=>{const file=path.join(out,name);fs.writeFileSync(file,text);return file}
const bridge=write('actions.js',`async function call(method,args){const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});if(!r.ok)throw Error(await r.text());return r.json()};export const fetchPreparation=(...args)=>call('fetch',args),savePreparation=(...args)=>call('plan',args),saveScheduleTeachingAssignments=(...args)=>call('assign',args);export const checkPreparation=()=>{},createScheduleDraft=()=>{},confirmScheduleDraft=()=>{},discardScheduleDraft=()=>{};`)
const noop=write('noop.js','export default function Panel(){return null};export const savePeriodTimes=()=>{},editTeacherScheduleCell=()=>{},saveClassScheduleCell=()=>{},setTeacherAvailabilityBlock=()=>{},toggleScheduleCellLock=()=>{};')
const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';import Wizard from ${JSON.stringify(path.join(root,'components/schedules/SchedulePreparation.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Wizard,{yearId:'year',semester:2,initialStep:6,onChanged:()=>{},onBusyChange:v=>window.isBusy=v}));`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
const css=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style);'`)
const aliases={'@/app/schedules/planning-actions$':bridge,'@/app/schedules/actions$':noop,'@':root}
for(const panel of ['ScheduleDataInput','WizardPeriodEditor','ActivityTeamEditor','ClassroomLevelEditor'])aliases[`./${panel}$`]=noop
await new Promise((resolve,reject)=>{
 const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:aliases},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]})
 compiler.run((err,stats)=>compiler.close(()=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))
})
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
  if(req.url==='/rpc'){
   let body='';for await(const part of req)body+=part
   const {method,args}=JSON.parse(body);assert.equal(args[0],'year');assert.equal(args[1],2)
   if(method!=='fetch'){
    calls.push({method,args});activeWrites++;maxWrites=Math.max(maxWrites,activeWrites)
    await new Promise(resolve=>setTimeout(resolve,180));activeWrites--
    if(args[2]!==state.hash){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก'}));return}
    if(method==='assign'&&failAssignment){failAssignment=false;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'เครือข่ายขัดข้องจำลอง กรุณาลองใหม่'}));return}
    if(method==='plan')state.plan=structuredClone(args[3])
    else {assert.equal(method,'assign');for(const row of args[3]){const lesson=state.lessons.find(l=>l.id===row.lessonId);assert.ok(lesson);lesson.teacherId=row.teacherId||null}}
    state.hash=String(++revision)
   }
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:state,error:null}));return
  }
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Tahoma,sans-serif;background:#f4f7fc}button,input,select{font:inherit}</style><div id="root"></div><script src="/bundle.js"></script></html>')
 }catch(e){res.writeHead(500);res.end(e.stack)}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser,page
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']})
 page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.setViewport({width:1440,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded',timeout:60000})
 const click=async(selector,text)=>{const el=await page.evaluateHandle((s,t)=>[...document.querySelectorAll(s)].find(el=>el.textContent.trim()===t),selector,text);assert.ok(el.asElement(),`Missing ${text}`);await el.asElement().click()}
 const modal='dialog[open]', idle=()=>page.waitForFunction(()=>!window.isBusy&&!document.querySelector('.swal2-container'))
 // Thai card comes first, so identify the math card by its actual code.
 const math=async()=>{await idle();await click('.prep-workload>.prep-view-switch button','ตามรหัส');const el=await page.evaluateHandle(()=>[...document.querySelectorAll('.prep-code-cards button')].find(el=>el.textContent.includes('ค21102')));await el.asElement().click();await page.waitForSelector(modal)}
 const rooms=()=>click(`${modal} .prep-activity-scope button`,'ทั้ง ม.1')
 await page.waitForSelector('.prep-workload');await math();await rooms()
 await click(`${modal} .prep-activity-teachers strong`,'ครู ตัวอย่าง 1')
 await page.select(`${modal} select[aria-label="สถานที่ของห้องที่เลือก"]`,'venue')
 await page.select(`${modal} select[aria-label="ช่วงเวลาของห้องที่เลือก"]`,'morning')
 await page.select(`${modal} select[aria-label="รูปแบบคาบของห้องที่เลือก"]`,'double')
 // Repeated events while a request is outstanding must not make duplicate writes.
 await page.$eval(`${modal}>footer .prep-primary`,el=>{el.click();el.click()});await idle()
 assert.equal(calls.filter(c=>c.method==='plan').length,1);assert.equal(calls.filter(c=>c.method==='assign').length,1);assert.equal(maxWrites,1)
 assert.deepEqual(state.plan.rules.math1.pattern,[2,1]);assert.deepEqual(state.plan.rules.math2.pattern,[2,2])
 assert.equal(state.plan.rules.math1.count,3);assert.equal(state.plan.rules.math2.count,4)
 assert.equal(state.plan.rules.math1.roomId,'venue');assert.equal(state.plan.rules.math2.morning,true)
 assert.equal(state.lessons[0].teacherId,'t1');assert.equal(state.lessons[1].teacherId,'t1')
 assert.ok(await page.$eval(`${modal}>footer`,el=>el.textContent.includes('บันทึกภาระสอนแล้ว')))
 console.log('PASS: code-based bulk assignment saves immediately once; venue, morning and paired patterns preserve individual weekly quotas')
 for(const width of [360,390,768,1024,1440]){
  await page.setViewport({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.equal(await page.$eval(modal,el=>el.scrollWidth<=el.clientWidth),true)
 }
 await page.setViewport({width:390,height:844});await page.$eval(`${modal} .prep-code-settings`,el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(out,'mobile-code-settings.png')})
 await page.setViewport({width:1440,height:1000});await page.screenshot({path:path.join(out,'desktop-code-settings.png')})
 // Keep existing teachers while changing only the lesson rules of already assigned rooms.
 await page.keyboard.press('Escape');await math();await rooms();await page.select(`${modal} select[aria-label="รูปแบบคาบของห้องที่เลือก"]`,'single')
 const assignments=calls.filter(c=>c.method==='assign').length
 await click(`${modal}>footer button`,'บันทึกห้องที่เลือก');await idle()
 assert.equal(calls.filter(c=>c.method==='assign').length,assignments);assert.deepEqual(state.plan.rules.math1.pattern,[1,1,1]);assert.equal(state.lessons[0].teacherId,'t1')
 await page.keyboard.press('Escape');await math();await rooms();await click(`${modal} .prep-activity-teachers strong`,'ครู ตัวอย่าง 2');failAssignment=true
 await click(`${modal}>footer button`,'บันทึกห้องที่เลือก');await idle();await page.waitForSelector(`${modal} .prep-workload-status.is-error`)
 assert.equal(await page.$$eval(`${modal} .prep-activity-room-picks button[aria-pressed=true]`,els=>els.length),2)
 assert.equal(state.lessons[0].teacherId,'t1');await click(`${modal}>footer button`,'บันทึกห้องที่เลือก');await idle();assert.equal(state.lessons[0].teacherId,'t2')
 console.log('PASS: changing only rules preserves teachers; failed save retains selected rooms and supports retry')
 await page.keyboard.press('Escape');await click('.prep-workload>.prep-view-switch button','ตามห้อง')
 const editMath=await page.evaluateHandle(()=>[...document.querySelectorAll('.prep-load-list li')].find(el=>el.textContent.includes('ค21102')).querySelector('.prep-row-edit'));await editMath.asElement().click()
 await click(`${modal} .prep-activity-teachers strong`,'ครู ตัวอย่าง 1')
 await page.select(`${modal} select[aria-label="ห้องสถานที่"]`,'')
 failAssignment=true;await click(`${modal}>footer button`,'บันทึกวิชานี้');await idle();await page.waitForSelector(`${modal} .prep-workload-status.is-error`)
 assert.equal(state.plan.rules.math1.roomId,null,'Successful plan write survives a subsequent teacher error')
 await click(`${modal}>footer button`,'บันทึกวิชานี้');await idle();assert.equal(state.lessons[0].teacherId,'t1');assert.equal(await page.$(modal),null)
 // Teacher-oriented assignment also commits, without a second Save action.
 await click('.prep-workload>.prep-view-switch button','ตามครู');await click('.prep-workload>.prep-activity-teachers strong','ครู ตัวอย่าง 1');await click('.prep-load-toolbar button','เพิ่มวิชา')
 const pick=await page.evaluateHandle(()=>[...document.querySelectorAll('dialog[open] .prep-load-pick li')].find(el=>el.textContent.includes('ท21102')).querySelector('input'));await pick.asElement().click()
 await click(`${modal}>footer button`,'กำหนดให้ครูนี้');await idle();assert.equal(state.lessons[2].teacherId,'t1')
 await click('.prep-load-toolbar button','เพิ่มวิชา')
 const replace=await page.evaluateHandle(()=>[...document.querySelectorAll('dialog[open] .prep-load-pick li')].find(el=>el.textContent.includes('ค21102')).querySelector('input'));await replace.asElement().click()
 await click(`${modal}>footer button`,'กำหนดให้ครูนี้');await page.waitForSelector(`${modal} .swal2-confirm`)
 assert.equal(await page.$eval(`${modal} .swal2-confirm`,el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el}),true,'Replacement confirmation must be above the native dialog')
 await page.click(`${modal} .swal2-confirm`);await idle();assert.equal(state.lessons[1].teacherId,'t1')
 const remove=await page.evaluateHandle(()=>[...document.querySelectorAll('.prep-load-list li')].find(el=>el.textContent.includes('ท21102')).querySelector('.prep-row-delete'));await remove.asElement().click();await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm');await idle()
 assert.equal(state.lessons[2].teacherId,null,'Removing a workload is saved immediately after confirmation')
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.prep-workload')
 assert.ok(await page.$eval('.prep-load-list',el=>el.textContent.includes('ครู ตัวอย่าง 1')))
 assert.equal(await page.$$eval('.prep-load-save button',els=>els.length),0,'No redundant manual workload Save button')
 // Concurrent changes remain guarded by the existing server hash check.
 await math();await rooms();await page.select(`${modal} select[aria-label="ช่วงเวลาของห้องที่เลือก"]`,'any');state.hash=String(++revision)
 const before=structuredClone(state.plan);await click(`${modal}>footer button`,'บันทึกห้องที่เลือก');await idle();await page.waitForSelector(`${modal} .prep-workload-status.is-error`)
 assert.deepEqual(state.plan,before);assert.ok(await page.$eval(`${modal}>footer`,el=>el.textContent.includes('ข้อมูลเปลี่ยนแล้ว')))
 assert.deepEqual(errors,[])
 console.log('PASS: room and teacher views autosave; reload retains assignments; partial-write retry uses latest hash; concurrent changes do not get overwritten; five widths fit; no JS errors')
}catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure.txt'),await page.evaluate(()=>document.body.innerText))}throw error}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
