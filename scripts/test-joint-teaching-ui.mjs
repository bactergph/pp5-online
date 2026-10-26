// Actual wizard and workload dialogs; isolated synthetic school, no production writes.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage, root=process.cwd(), out=path.resolve('tmp/joint-teaching-ui')
fs.mkdirSync(out,{recursive:true})
const fixture={hash:'0',timesConfigured:true,classrooms:[1,2].map(n=>({id:`r${n}`,level:'ม.1',name:String(n),room:n})),teachers:[1,2].map(n=>({id:`t${n}`,prefix:'ครู',full_name:`ตัวอย่าง ${n}`})),activities:[],slots:[],blocks:[],periods:[1,2,0,3].map((n,i)=>({period:n,is_break:!n,sort_order:i+1,start_time:`${8+i}:00`,end_time:`${9+i}:00`})),plan:{days:[1,2,3,4,5],rooms:[{id:'venue',name:'ห้องวิทยาศาสตร์'}],rules:{},reduceGaps:false,maxContinuous:0,activityGroups:[]},lessons:[{id:'math1',classroomId:'r1',code:'ค21102',name:'คณิตศาสตร์',count:3,subjectGroup:'คณิตศาสตร์',teacherId:null},{id:'math2',classroomId:'r2',code:'ค21102',name:'คณิตศาสตร์',count:4,subjectGroup:'คณิตศาสตร์',teacherId:null},{id:'thai',classroomId:'r1',code:'ท21102',name:'ภาษาไทย',count:2,subjectGroup:'ภาษาไทย',teacherId:null}]}
fixture.lessons[0].teacherId='t1';fixture.lessons[1].teacherId='t1';fixture.lessons[2].teacherId='t2';
for(const lesson of fixture.lessons){lesson.count=2;lesson.pattern=[2];lesson.roomId='venue';lesson.timePreference='any';lesson.activity=false;lesson.label=lesson.name;lesson.teacherName=fixture.teachers.find(t=>t.id===lesson.teacherId).full_name;fixture.plan.rules[lesson.id]={count:2,pattern:[2],roomId:'venue',timePreference:'any',morning:false,spread:true}}
let state=structuredClone(fixture),failAssignment=false,revision=0,activeWrites=0,maxWrites=0,writeDelay=180
const calls=[]
const write=(name,text)=>{const file=path.join(out,name);fs.writeFileSync(file,text);return file}
const bridge=write('actions.js',`async function call(method,args){const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});if(!r.ok)throw Error(await r.text());return r.json()};export const fetchPreparation=(...args)=>call('fetch',args),savePreparation=(...args)=>call('plan',args),saveScheduleTeachingAssignments=(...args)=>call('assign',args);export const checkPreparation=()=>{},createScheduleDraft=()=>{},confirmScheduleDraft=()=>{},discardScheduleDraft=()=>{};`)
const noop=write('noop.js','export default function Panel(){return null};export const savePeriodTimes=()=>{},editTeacherScheduleCell=()=>{},saveClassScheduleCell=()=>{},setTeacherAvailabilityBlock=()=>{},toggleScheduleCellLock=()=>{};')
const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';import Provider from ${JSON.stringify(path.join(root,'components/schedules/OnlineScheduleProvider.tsx'))};import Wizard from ${JSON.stringify(path.join(root,'components/schedules/SchedulePreparation.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Provider,null,React.createElement(Wizard,{yearId:'year',semester:2,initialStep:6,onChanged:()=>{},onBusyChange:v=>window.isBusy=v})));`)
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
    await new Promise(resolve=>setTimeout(resolve,writeDelay));activeWrites--
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
 const click=async(selector,text)=>{const el=await page.evaluateHandle((s,t)=>[...document.querySelectorAll(s)].find(el=>(el.getAttribute('role')==='option'?el.textContent.replace(/\s*✓$/,''):el.textContent).trim()===t),selector,text);assert.ok(el.asElement(),`Missing ${text}`);await el.asElement().click()}

 await page.waitForSelector('.prep-workload');await click('.prep-workload button','สอนรวมหลายห้อง');
 const dialog='.prep-joint-dialog[open]';await page.waitForSelector(dialog);
 await page.select('#joint-teacher','t1');assert.equal((await page.$$(dialog+' .prep-joint-choices input')).length,2);
 await page.click(dialog+' .prep-joint-choices label:nth-child(1) input');await page.click(dialog+' .prep-joint-choices label:nth-child(2) input');
 for(const width of [360,390,768,1024,1440]){await page.setViewport({width,height:844});assert.ok(await page.$eval(dialog,el=>el.scrollWidth<=el.clientWidth));assert.ok(await page.$eval(dialog+'>footer button',el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png')});
 await page.setViewport({width:1440,height:1000});await page.screenshot({path:path.join(out,'desktop.png')});
 await click(dialog+'>footer button','บันทึกกลุ่มสอนรวม');await page.waitForSelector(dialog+' .prep-joint-groups li');
 assert.equal(state.plan.teachingGroups.length,1);assert.deepEqual(state.plan.teachingGroups[0].lessonIds,['math1','math2']);assert.equal(calls.length,1,'Save the group with one plan operation');
 await click(dialog+' .prep-joint-groups button','ยกเลิกสอนรวม');await page.waitForFunction(()=>!document.querySelector('.prep-joint-groups'));assert.equal(state.plan.teachingGroups.length,0);
 await click(dialog+'>header button','ปิด');await page.waitForSelector(dialog,{hidden:true});assert.deepEqual(errors,[]);
 console.log('PASS: real shared wizard opens joint instruction, teacher filters rooms, saves/removes a group, one write per operation; 360/390/768/1024/1440 widths keep confirmation visible; no page errors');
}catch(error){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
