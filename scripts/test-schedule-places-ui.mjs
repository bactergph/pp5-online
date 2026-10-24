// Shared production editor with the online service boundary. Synthetic backend only.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage,root=process.cwd(),out=path.resolve('tmp/schedule-places-ui');fs.mkdirSync(out,{recursive:true})
const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-places.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error})
const {applySchedulePlaceChange}=exports,uuid=i=>`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`
const fixture={hash:'0',teachers:[],classrooms:[1,2,3,4,5,6].map(i=>({id:'r'+i,level:'ม.1',room:i,name:String(i)})),plan:{days:[1,2,3,4,5],rooms:[{id:uuid(1),name:'ห้องวิทย์'},{id:uuid(2),name:'ห้องภาษา'}],rules:Object.fromEntries([1,2,3,4,5,6].map(i=>['s'+i,{count:3,pattern:[2,1],roomId:i===1?uuid(1):i===2?uuid(2):null,morning:false,spread:true,timePreference:'afternoon'}])),reduceGaps:false,maxContinuous:0},lessons:[1,2,3,4,5,6].map(i=>({id:'s'+i,classroomId:'r'+i,code:'ว21102',name:'วิทยาศาสตร์',label:'ม.1/'+i+' · วิทยาศาสตร์',teacherId:'t'+i,teacherName:'ครูทดสอบ '+i,count:3,pattern:[2,1],activity:false})),slots:[1,2].map(i=>({classroom_id:'r'+i,class_subject_id:'s'+i,activity_id:null,day_of_week:1,period:1,locked:true})),blocks:[],activities:[],periods:[]}
let state=structuredClone(fixture),revision=0,failNext=false,activeWrites=0,maxWrites=0;const calls=[]
function hydrate(){state.lessons=state.lessons.map(l=>({...l,...state.plan.rules[l.id],roomName:state.plan.rooms.find(p=>p.id===state.plan.rules[l.id].roomId)?.name||''}));return structuredClone(state)}
hydrate()
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const bridge=write('actions.js',`async function call(method,args){const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});return r.json()};export const fetchPreparation=(...args)=>call('fetch',args),saveSchedulePlaces=(...args)=>call('save',args);`)
const noop=write('noop.js','export const unused=()=>{};')
const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';import Provider from ${JSON.stringify(path.join(root,'components/schedules/OnlineScheduleProvider.tsx'))};import Places from ${JSON.stringify(path.join(root,'components/schedules/SchedulePlacesEntry.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Provider,null,React.createElement(Places,{yearId:'year',semester:2})));`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
const css=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style);'`)
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/app/schedules/planning-actions$':bridge,'@/app/schedules/actions$':noop,'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]});compiler.run((e,s)=>compiler.close(()=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()))})
const server=http.createServer(async(req,res)=>{try{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
 if(req.url==='/rpc'){let text='';for await(const part of req)text+=part;const {method,args}=JSON.parse(text);assert.equal(args[0],'year');assert.equal(args[1],2);let error=null
  if(method==='save'){calls.push(args[3]);activeWrites++;maxWrites=Math.max(maxWrites,activeWrites);await new Promise(r=>setTimeout(r,100));activeWrites--;try{if(failNext){failNext=false;throw Error('เครือข่ายขัดข้องจำลอง กรุณาลองใหม่')}if(args[2]!==state.hash)throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก');state.plan=applySchedulePlaceChange(state,args[3]);state.hash=String(++revision);hydrate()}catch(e){error=e.message}}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:error?null:hydrate(),error}));return}
 if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Tahoma,sans-serif;background:#f4f7fc}button,input,select{font:inherit}</style><div id="root"></div><script src="/bundle.js"></script></html>')
}catch(e){res.writeHead(500);res.end(e.stack)}})
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;const errors=[]
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']});page=await browser.newPage();page.setDefaultNavigationTimeout(120000);page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'})
 const idle=()=>page.waitForFunction(()=>document.querySelector('.schedule-places')?.getAttribute('aria-busy')==='false')
 const click=async(selector,text)=>{const el=await page.evaluateHandle((s,t)=>[...document.querySelectorAll(s)].find(el=>el.textContent.trim().replace(/\s*✓$/,'')===t),selector,text);assert.ok(el.asElement(),'Missing '+text);await el.asElement().click()}
 const type=async(selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))},value)
 const choose=async(id,name)=>{await page.click(`[data-lesson-id="${id}"] input`);await click(`[data-lesson-id="${id}"] [role=option]`,name);await idle()}
 await page.waitForSelector('.places-table tbody tr');await idle();assert.equal(await page.$$eval('.places-table tbody tr',els=>els.length),6)
 await choose('s1','ห้องภาษา');await page.waitForFunction(()=>document.querySelector('.places-error')?.textContent.includes('ชนวันจันทร์ คาบ 1'));assert.equal(state.plan.rules.s1.roomId,uuid(1));assert.equal(calls.length,0,'Client conflict check must block the request')
 await click('.places-heading button','เพิ่มสถานที่');await page.waitForSelector('.places-dialog[open]');await page.type('.places-dialog input','ห้องดนตรี');await click('.places-dialog button[type=submit]','เพิ่มสถานที่');await idle();assert.equal(state.plan.rooms.length,3)
 await choose('s3','ห้องดนตรี');const music=state.plan.rules.s3.roomId;assert.ok(music);assert.equal(state.plan.rules.s3.pattern.join('+'),'2+1');assert.equal(state.plan.rules.s3.timePreference,'afternoon')
 await page.click('[data-lesson-id="s4"] input');await page.type('[data-lesson-id="s4"] input','ห้องคอมพิวเตอร์');await click('[data-lesson-id="s4"] [role=option]','+ เพิ่มสถานที่ “ห้องคอมพิวเตอร์”');await idle();assert.ok(state.plan.rules.s4.roomId);assert.equal(calls.filter(c=>c.kind==='assign'&&c.lessonId==='s4').length,1,'Inline create+assign is one atomic save')
 await page.click('.places-catalog summary');await type('.places-catalog-row input','ห้องทดลองใหม่');await click('.places-catalog-row button','บันทึกชื่อ');await idle();assert.equal(state.lessons[0].roomName,'ห้องทดลองใหม่')
 await click('.places-catalog-row button','ลบ');await page.waitForSelector('.places-dialog[open]');assert.ok(await page.$eval('.places-dialog button[type=submit]',el=>el.disabled));await page.select('.places-dialog select',music);await click('.places-dialog button[type=submit]','ย้ายและลบสถานที่');await idle();assert.equal(state.plan.rules.s1.roomId,music);assert.ok(!state.plan.rooms.some(p=>p.id===uuid(1)))
 failNext=true;await choose('s5','ห้องภาษา');await page.waitForFunction(()=>document.querySelector('.places-error')?.textContent.includes('เครือข่ายขัดข้อง'));assert.equal(state.plan.rules.s5.roomId,null);assert.equal(await page.$eval('[data-lesson-id="s5"] input',el=>el.value),'')
 await choose('s5','ห้องภาษา');assert.equal(state.plan.rules.s5.roomId,uuid(2));assert.equal(maxWrites,1)
 state.hash=String(++revision);await choose('s6','ห้องภาษา');await page.waitForFunction(()=>document.querySelector('.places-error')?.textContent.includes('ข้อมูลเปลี่ยนแล้ว'));assert.equal(state.plan.rules.s6.roomId,null);await click('.places-error button','โหลดข้อมูลล่าสุด');await idle();await choose('s6','ห้องภาษา');assert.equal(state.plan.rules.s6.roomId,uuid(2))
 await type('.places-search input','ม.1/6');assert.equal(await page.$$eval('.places-table tbody tr',els=>els.length),1);await type('.places-search input','')
 for(const width of [360,390,768,1024,1440]){await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow '+width)}
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-lesson-id="s3"] input');assert.equal(await page.$eval('[data-lesson-id="s3"] input',el=>el.value),'ห้องดนตรี');assert.equal(errors.length,0,errors.join('\n'));await page.screenshot({path:path.join(out,'places-desktop.png'),fullPage:true})
 console.log('PASS: online shared place editor, six independent classrooms, atomic inline creation, rename and replacement deletion, detailed collisions, save rollback/retry, stale refresh, search, reload and five responsive widths')
}catch(e){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw e}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
