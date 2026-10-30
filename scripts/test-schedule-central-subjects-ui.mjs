// Actual subject importer; synthetic catalog and save endpoint, no production access.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage,root=process.cwd(),out=path.resolve('tmp/central-subjects-ui');fs.mkdirSync(out,{recursive:true})
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const fixture={hash:'fixture',classrooms:[{id:'a',level:'ป.1',name:'1',room:1},{id:'ip',level:'ป.1',name:'IP',room:2},{id:'p2',level:'ป.2',name:'1',room:1},{id:'m1',level:'ม.1',name:'1',room:1}],teachers:[{id:'teacher',full_name:'ครูเดิม',prefix:'',position:'ครู'}],plan:{rules:{old:{count:5,pattern:[1,1,1,1,1],roomId:'venue'}},teacherIds:['teacher'],rooms:[]},lessons:[{id:'old',classroomId:'a',code:'ท11101',name:'ภาษาไทยเดิม',teacherId:'teacher',roomName:'ห้องเดิม',count:5,subjectGroup:'ภาษาไทย',subjectType:'พื้นฐาน'}]}
fixture.classrooms.push({id:'m4',level:'ม.4',name:'1',room:1},{id:'m6',level:'ม.6',name:'1',room:1});
fixture.classrooms.push(...[3,4,5,6].map(grade=>({id:'p'+grade,level:'ป.'+grade,name:'1',room:1})))
const thai={code:'ท11101',name:'ภาษาไทย',subject_group:'ภาษาไทย',type:'พื้นฐาน',hours_per_year:200,sort_order:1}
const catalog=[thai,{...thai,code:'ค11101',name:'คณิตศาสตร์',subject_group:'คณิตศาสตร์',hours_per_year:160,sort_order:2},{...thai,code:'ว11101',name:'วิทยาศาสตร์ที่ยังไม่กำหนดชั่วโมง',hours_per_year:0,sort_order:3},{...thai,code:'ท12101',name:'ภาษาไทย ป.2'},{...thai,code:'ท21101',name:'มัธยมไม่ควรปรากฏ'}]
catalog.push({...thai,code:'ศ30212',level:'ม.4',name:'ปฏิบัติเครื่องลม 2',subject_group:'ศิลปะ',credits:.5},{...thai,code:'ศ30212',level:'ม.6',name:'การตกแต่งภายใน 2',subject_group:'ศิลปะ',credits:1});
catalog.push(...[3,4,5,6].map(grade=>({...thai,code:'ท1'+grade+'101',name:'ภาษาไทย ป.'+grade})))
const bridge=write('catalog.js',`export async function fetchScheduleCentralSubjects(){return fetch('/catalog').then(r=>r.json())}`)
const navigation=write('navigation.js',`export function usePathname(){return location.pathname}export function useRouter(){return{push:()=>{}}}`)
const link=write('link.js',`import React from'react';export default function Link({prefetch,children,...props}){return React.createElement('a',props,children)}`)
const entry=write('entry.js',`import React from'react';import{createRoot}from'react-dom/client';import Input from ${JSON.stringify(path.join(root,'components/schedules/ScheduleDataInput.tsx'))};import{ScheduleServicesProvider}from ${JSON.stringify(path.join(root,'components/schedules/ScheduleServices.tsx'))};const operations={saveScheduleInputSubjects:async(year,term,hash,rows)=>fetch('/save',{method:'POST',body:JSON.stringify({year,term,hash,rows})}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(ScheduleServicesProvider,{operations,local:location.search.includes('local')},React.createElement('div',{className:'workspace-theme'},React.createElement('section',{className:'schedule-prep'},React.createElement(Input,{kind:'subjects',data:(location.search.includes('case=empty')?{...${JSON.stringify(fixture)},classrooms:[],lessons:[]}:location.search.includes('case=secondary')?{...${JSON.stringify(fixture)},classrooms:${JSON.stringify(fixture.classrooms.filter(room=>room.level.startsWith('ม.')))},lessons:[]}:${JSON.stringify(fixture)}),year:'year',term:2,onSaved:async()=>{},onDirty:()=>{},onBusy:()=>{},onRoster:()=>{},locked:false})))));`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
const cssLoader=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style);'`)
await new Promise((resolve,reject)=>{const c=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/app/schedules/catalog-actions':bridge,'next/navigation':navigation,'next/link':link,'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:cssLoader}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]});c.run((e,s)=>c.close(()=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()))})
let failCatalog=false,catalogReads=0;const saves=[]
const baseCss=['app/globals.css','app/screen-brand-colors.css','app/workspace-theme.css','app/workspace-controls.css','components/schedules/schedule-preparation.css'].map(file=>fs.readFileSync(file,'utf8')).join('\n').replace(/@import[^;]*;|@source[^;]*;/g,'')
const server=http.createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
  if(req.url==='/catalog'){catalogReads++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(failCatalog?{data:null,error:'เชื่อมต่อไม่สำเร็จ กรุณาลองอีกครั้ง'}:{data:catalog,error:null}));failCatalog=false;return}
  if(req.url==='/save'){let body='';for await(const part of req)body+=part;saves.push(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{},error:null}));return}
  if(req.url.startsWith('/favicon')){res.writeHead(204);res.end();return}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+baseCss+'body{margin:0;padding:18px;font-family:Tahoma,sans-serif}*{box-sizing:border-box}</style><div id="root"></div><script src="/bundle.js"></script></html>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']})
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(120000)
 const click=async(text,selector='.central-subject-panel button')=>page.evaluate((text,selector)=>{const button=[...document.querySelectorAll(selector)].find(button=>button.textContent.trim()===text);if(!button||button.disabled)throw Error('Missing enabled button '+text);button.click()},text,selector)
 const open=async(local=false)=>{await page.goto('http://127.0.0.1:'+server.address().port+'/schedules/'+(local?'device/manage?local=1':'class/manage'),{waitUntil:'networkidle0'});await page.click('.prep-subject-tools .prep-primary');await page.waitForSelector('.prep-subject-dialog[open]')}
 for(const local of [false,true]){
  await page.setViewport({width:1440,height:1000});await open(local)
  const pending=['ป.1/IP','ค11101','ชื่อที่กรอกไว้','7','คณิตศาสตร์','พื้นฐาน'];for(let col=0;col<6;col++)await page.type('.prep-sheet input[data-row="0"][data-col="'+col+'"]',pending[col])
  const before=saves.length;failCatalog=local;await page.click('.central-subject-toggle');if(local){await page.waitForSelector('.central-subject-panel .prep-error');await click('ลองโหลดอีกครั้ง')}
  await page.waitForSelector('.central-subject-grades input[data-level="ป.1"]');await click('ถัดไป: เลือกวิชา');await page.waitForSelector('.central-subject-options')
  assert.equal(await page.$eval('[data-code="ว11101"]',input=>input.disabled),true);assert.equal(await page.$('[data-code="ท21101"]'),null)
  await click('เลือกวิชาที่แสดงทั้งหมด');await click('ถัดไป: เลือกห้อง');await page.waitForSelector('[data-room=ip]');await page.click('[data-room=ip]')
  assert.equal(await page.$eval('.central-subject-stage',element=>element.textContent.includes('เพิ่มใหม่ 1 รายการ')),true)
  await click('เพิ่ม 1 รายการลงตารางตรวจสอบ');await page.waitForFunction(()=>!document.querySelector('.central-subject-panel'))
  assert.equal(saves.length,before,'Selecting central templates only stages rows, never saves')
  const matrix=await page.$$eval('.prep-sheet tbody tr',rows=>rows.map(row=>[...row.querySelectorAll('input')].map(input=>input.value)).filter(row=>row.some(Boolean)))
  assert.equal(matrix.length,2);assert.equal(matrix[0][2],'ชื่อที่กรอกไว้');assert.equal(matrix[0][3],'7');assert.equal(matrix[1][0],'ป.1/IP')
  await click('บันทึก 2 รายการ','.prep-subject-dialog footer button');await page.waitForFunction(()=>!document.querySelector('.prep-subject-dialog[open]'))
  assert.equal(saves.length,before+1);assert.equal(saves.at(-1).rows.length,2);assert.equal(saves.at(-1).rows[0].count,7);assert.ok(saves.at(-1).rows.every(row=>row.classroomId==='ip'))
 }
 await open(true);await page.click('.central-subject-toggle');await page.waitForSelector('.central-subject-grades');await click('ล้างการเลือก');await page.click('[data-level="ม.4"]');await page.click('[data-level="ม.6"]');await click('ถัดไป: เลือกวิชา')
 await page.waitForSelector('[data-subject-key="ม.4|ศ30212"]');await click('เลือกวิชาที่แสดงทั้งหมด')
 for(const width of [320,390,768,1440]){await page.setViewport({width,height:1000});assert.equal(await page.$eval('.central-subject-panel',panel=>panel.scrollWidth>panel.clientWidth+1),false,'Panel overflow '+width);if(width===390||width===1440)await (await page.$('.central-subject-panel')).screenshot({path:path.join(out,'central-subjects-'+width+'.png')})}
 await click('ถัดไป: เลือกห้อง');await click('เลือกทุกห้องของชั้นที่เลือก');await click('เพิ่ม 2 รายการลงตารางตรวจสอบ')
 let matrix=await page.$$eval('.prep-sheet tbody tr',rows=>rows.map(row=>[...row.querySelectorAll('input')].map(input=>input.value)).filter(row=>row.some(Boolean)))
 assert.equal(matrix.find(row=>row[0]==='ม.4/1')[2],'ปฏิบัติเครื่องลม 2');assert.equal(matrix.find(row=>row[0]==='ม.4/1')[3],'1');assert.equal(matrix.find(row=>row[0]==='ม.6/1')[2],'การตกแต่งภายใน 2');assert.equal(matrix.find(row=>row[0]==='ม.6/1')[3],'2')
 await open(true);await page.click('.central-subject-toggle');await page.waitForSelector('.central-subject-grades');await click('ล้างการเลือก');for(const grade of [1,2,3,4,5,6])await page.click('[data-level="ป.'+grade+'"]');await click('ถัดไป: เลือกวิชา');await click('เลือกวิชาที่แสดงทั้งหมด');await click('ถัดไป: เลือกห้อง');await click('เลือกทุกห้องของชั้นที่เลือก');await click('เพิ่ม 8 รายการลงตารางตรวจสอบ')
 matrix=await page.$$eval('.prep-sheet tbody tr',rows=>rows.map(row=>[...row.querySelectorAll('input')].map(input=>input.value)).filter(row=>row.some(Boolean)));assert.equal(matrix.length,8);assert.ok(matrix.every(row=>row[0].startsWith('ป.')))
 assert.deepEqual(errors,[]);console.log('PASS: ordered grade → course → destination workflow on Free/online; multiple grades and rooms; primary duplicates/staged edits; retry; secondary same-code variants and credits; 320–1440 responsive UI; zero writes before confirmation')
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
