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
 const modal='dialog[open]:not(.prep-code-options-dialog):not(.prep-code-place-dialog)', options='.prep-code-options-dialog[open]', idle=()=>page.waitForFunction(()=>!window.isBusy&&!document.querySelector('.swal2-container'))
 // Thai card comes first, so identify the math card by its actual code.
 const math=async()=>{await idle();await click('.prep-workload>.prep-view-switch button','ตามรหัส');const el=await page.evaluateHandle(()=>[...document.querySelectorAll('.prep-code-cards button')].find(el=>el.textContent.includes('ค21102')));await el.asElement().click();await page.waitForSelector(modal)}
 const rooms=()=>click(`${modal} .prep-activity-scope button`,'ทั้ง ม.1')
 const openOptions=async()=>{await click(`${modal}>footer button`,'บันทึก');await page.waitForSelector(options)}
 const saveOptions=async()=>{await click(`${options}>footer button`,'บันทึกภาระสอน');await idle()}
 const placeDialog='.prep-code-place-dialog[open]', row=id=>options+' [data-lesson-id='+id+']'
 const addVenue=async name=>{await click(options+' .prep-code-settings-toolbar button','+ เพิ่มสถานที่');await page.waitForSelector(placeDialog);await page.type(placeDialog+' #code-place-name',name);await click(placeDialog+' button[type=submit]','เพิ่มสถานที่');await page.waitForSelector(placeDialog,{hidden:true})}
 const chooseVenue=async(id,name,keyboard=false)=>{const input=await page.$(row(id)+' [role=combobox]');await input.click();await input.type(name);if(keyboard)await page.keyboard.press('Enter');else await click(row(id)+' [role=option]',name);await page.$eval(row(id)+' [role=combobox]',el=>el.blur())}
 await page.waitForSelector('.prep-workload');await math();await rooms()
 assert.deepEqual(await page.$$eval(modal+' .prep-activity-head h3',els=>els.map(el=>el.textContent)),['ห้องที่เรียนวิชานี้','ครูผู้สอน'])
 await click(modal+' .prep-activity-teachers strong','ครู ตัวอย่าง 1');await openOptions()
 assert.equal(calls.length,0,'First Save does not write data')
 assert.deepEqual(await page.$$eval(options+' select',els=>els.map(el=>el.value)),['any','single','any','single'],'New assignments default to both sessions and singles')
 await chooseVenue('math1','สถานที่ที่ยกเลิก',true);assert.equal(await page.$eval(row('math1')+' [role=combobox]',el=>el.value),'สถานที่ที่ยกเลิก');assert.equal(state.plan.rooms.length,1,'Inline creation is staged until workload confirmation')
 await page.keyboard.press('Escape');assert.equal(await page.$(options),null);assert.equal(calls.length,0)
 assert.equal(await page.$eval(modal+'>footer .prep-primary',el=>document.activeElement===el),true)
 await openOptions();await click(options+'>footer button','ย้อนกลับ');assert.equal(await page.$(options),null);await openOptions()
 await page.click(row('math1')+' [role=combobox]');assert.equal(await page.$$eval(row('math1')+' [role=option]',els=>els.some(el=>el.textContent.includes('สถานที่ที่ยกเลิก'))),false);await page.keyboard.press('Escape');assert.ok(await page.$(options),'Escape closes search before modal')
 await page.click(row('math1')+' [role=combobox]');await page.type(row('math1')+' [role=combobox]','ยังไม่เพิ่ม');await page.keyboard.press('Escape');assert.equal(state.plan.rooms.length,1,'Typing alone does not create a place')
 await addVenue('  ห้องวิทยาศาสตร์  ')
 await page.click(row('math1')+' [role=combobox]');await page.type(row('math1')+' [role=combobox]','ห้องปฏิบัติการจำลอง');await click(row('math1')+' [role=option]','+ เพิ่มสถานที่ “ห้องปฏิบัติการจำลอง”')
 assert.equal(await page.$eval(row('math1')+' [role=combobox]',el=>el.value),'ห้องปฏิบัติการจำลอง','Inline Add selects the venue for this room')
 assert.equal(await page.$eval(row('math2')+' [role=combobox]',el=>el.value),'','Other rooms remain unchanged')
 await page.click(row('math2')+' [role=combobox]');await page.type(row('math2')+' [role=combobox]','  ห้องปฏิบัติการจำลอง  ')
 assert.equal(await page.$(row('math2')+' .prep-place-create'),null,'An exact normalized match cannot be added again');await page.keyboard.press('Enter')
 await addVenue(' ห้องปฏิบัติการจำลอง ')
 await chooseVenue('math1','ห้องปฏิบัติการจำลอง',true);await chooseVenue('math2','ห้องวิทยาศาสตร์')
 await page.select(row('math1')+' select[aria-label^=ช่วงเวลา]','morning');await page.select(row('math2')+' select[aria-label^=ช่วงเวลา]','afternoon')
 for(const id of ['math1','math2'])await page.select(row(id)+' select[aria-label^=รูปแบบคาบ]','double')
 for(const width of [360,390,768,1024,1440]){await page.setViewport({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.$eval(options,el=>el.scrollWidth<=el.clientWidth),true);assert.equal(await page.$eval(options+'>footer .prep-primary',el=>el.getBoundingClientRect().height>=44),true)}
 await page.$eval(options+'>footer .prep-primary',el=>{el.click();el.click()});await idle();assert.equal(await page.$(options),null)
 assert.equal(calls.filter(c=>c.method==='plan').length,1);assert.equal(calls.filter(c=>c.method==='assign').length,1);assert.equal(maxWrites,1)
 const newVenue=state.plan.rooms.find(place=>place.name==='ห้องปฏิบัติการจำลอง').id;assert.equal(state.plan.rooms.length,2,'Duplicate names reuse saved or staged venue IDs')
 assert.deepEqual(state.plan.rules.math1.pattern,[2,1]);assert.deepEqual(state.plan.rules.math2.pattern,[2,2]);assert.equal(state.plan.rules.math1.count,3);assert.equal(state.plan.rules.math2.count,4)
 assert.equal(state.plan.rules.math1.roomId,newVenue);assert.equal(state.plan.rules.math2.roomId,'venue');assert.equal(state.plan.rules.math1.timePreference,'morning');assert.equal(state.plan.rules.math2.timePreference,'afternoon')
 assert.equal(state.lessons[0].teacherId,'t1');assert.equal(state.lessons[1].teacherId,'t1')
 console.log('PASS: inline place creation by click/Enter; selected room only; typing/cancel never writes; normalized duplicates reuse IDs; per-room session and block settings; one final commit')
 await page.keyboard.press('Escape');await math();await rooms();await click(modal+' .prep-activity-teachers strong','ครู ตัวอย่าง 1');await openOptions()
 assert.equal(await page.$eval(row('math2')+' select[aria-label^=ช่วงเวลา]',el=>el.value),'afternoon','Saved per-room preferences are loaded back')
 await page.select(row('math1')+' select[aria-label^=รูปแบบคาบ]','single');const assignments=calls.filter(c=>c.method==='assign').length;await saveOptions();assert.equal(calls.filter(c=>c.method==='assign').length,assignments)
 await page.keyboard.press('Escape');await math();await rooms();await click(modal+' .prep-activity-teachers strong','ครู ตัวอย่าง 2');await openOptions();failAssignment=true
 await addVenue('ห้องทดสอบการลองใหม่');await chooseVenue('math1','ห้องทดสอบการลองใหม่');await saveOptions();await page.waitForSelector(options+' .prep-workload-status.is-error')
 const retryVenue=state.plan.rooms.find(place=>place.name==='ห้องทดสอบการลองใหม่').id;assert.equal(state.plan.rooms.filter(place=>place.id===retryVenue).length,1)
 await page.click(row('math1')+' [role=combobox]');assert.equal(await page.$$eval(row('math1')+' [role=option]',els=>els.filter(el=>el.textContent.includes('ห้องทดสอบการลองใหม่')).length),1);await page.keyboard.press('Escape')
 assert.equal(state.lessons[0].teacherId,'t1');await saveOptions();assert.equal(state.lessons[0].teacherId,'t2');assert.equal(state.plan.rooms.filter(place=>place.id===retryVenue).length,1)
 console.log('PASS: existing settings reload; rules-only edits preserve teachers; retry after partial save does not duplicate venues')
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
 await math();await rooms();await click(`${modal} .prep-activity-teachers strong`,'ครู ตัวอย่าง 1');await openOptions();await page.select(row('math1')+' select[aria-label^=ช่วงเวลา]','any');state.hash=String(++revision)
 await page.click(row('math1')+' [role=combobox]');assert.equal(await page.$$eval(row('math1')+' [role=option]',els=>els.some(el=>el.textContent.includes('ห้องปฏิบัติการจำลอง'))),true,'New places survive page reload');await page.keyboard.press('Escape')
 const before=structuredClone(state.plan);await saveOptions();await page.waitForSelector(`${options} .prep-workload-status.is-error`)
 assert.deepEqual(state.plan,before);assert.ok(await page.$eval(`${options}>footer`,el=>el.textContent.includes('ข้อมูลเปลี่ยนแล้ว')))
 await page.keyboard.press('Escape');await page.keyboard.press('Escape')
 state=structuredClone(fixture);state.hash=String(++revision);state.classrooms=Array.from({length:6},(_,i)=>({id:'r'+(i+1),level:'ม.1',name:String(i+1),room:i+1}));state.lessons=Array.from({length:6},(_,i)=>({...fixture.lessons[0],id:'math'+(i+1),classroomId:'r'+(i+1)}));state.plan.rooms=Array.from({length:6},(_,i)=>({id:'venue'+(i+1),name:'ห้องทดสอบ '+(i+1)}));
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.prep-workload');await math();await rooms();await click(modal+' .prep-activity-teachers strong','ครู ตัวอย่าง 1');await openOptions()
 assert.equal(await page.$$eval(options+' .prep-code-settings-row',els=>els.length),6)
 for(let i=1;i<=6;i++){await chooseVenue('math'+i,'ห้องทดสอบ '+i,i===6);await page.select(row('math'+i)+' select[aria-label^=ช่วงเวลา]',['any','morning','afternoon'][(i-1)%3]);if(i%2===0)await page.select(row('math'+i)+' select[aria-label^=รูปแบบคาบ]','double')}
 for(const width of [360,390,768,1024,1440]){await page.setViewport({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.$eval(options,el=>el.scrollWidth<=el.clientWidth),true);assert.equal(await page.$eval(options+'>footer .prep-primary',el=>el.getBoundingClientRect().bottom<=innerHeight),true)}
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'mobile-code-settings.png')});await page.setViewport({width:1440,height:1000});await page.screenshot({path:path.join(out,'desktop-code-settings.png')});await saveOptions()
 for(let i=1;i<=6;i++){const rule=state.plan.rules['math'+i];assert.equal(rule.roomId,'venue'+i);assert.equal(rule.timePreference,['any','morning','afternoon'][(i-1)%3]);assert.deepEqual(rule.pattern,i%2===0?[2,1]:[1,1,1])}
 console.log('PASS: six rooms saved in one confirmation with six distinct venue IDs; independent session and block choices; five viewport widths')
 assert.deepEqual(errors,[])
 console.log('PASS: room and teacher views autosave; reload retains assignments; partial-write retry uses latest hash; concurrent changes do not get overwritten; five widths fit; no JS errors')
}catch(error){if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure.txt'),await page.evaluate(()=>document.body.innerText));console.error(await page.evaluate(()=>({busy:window.isBusy,dialogs:[...document.querySelectorAll('dialog')].map(el=>({class:el.className,open:el.open})),popups:[...document.querySelectorAll('.swal2-container')].map(el=>({visible:!!el.getClientRects().length,text:el.textContent}))})))}throw error}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
