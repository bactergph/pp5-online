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
const thai={code:'ท11101',name:'ภาษาไทย',subject_group:'ภาษาไทย',type:'พื้นฐาน',hours_per_year:200,sort_order:1}
const catalog=[thai,{...thai,code:'ค11101',name:'คณิตศาสตร์',subject_group:'คณิตศาสตร์',hours_per_year:160,sort_order:2},{...thai,code:'ว11101',name:'วิทยาศาสตร์ที่ยังไม่กำหนดชั่วโมง',hours_per_year:0,sort_order:3},{...thai,code:'ท12101',name:'ภาษาไทย ป.2'},{...thai,code:'ท21101',name:'มัธยมไม่ควรปรากฏ'}]
const bridge=write('catalog.js',`export async function fetchPrimaryScheduleSubjects(){return fetch('/catalog').then(r=>r.json())}`)
const navigation=write('navigation.js',`export function usePathname(){return location.pathname}export function useRouter(){return{push:()=>{}}}`)
const link=write('link.js',`import React from'react';export default function Link({prefetch,children,...props}){return React.createElement('a',props,children)}`)
const entry=write('entry.js',`import React from'react';import{createRoot}from'react-dom/client';import Input from ${JSON.stringify(path.join(root,'components/schedules/ScheduleDataInput.tsx'))};import{ScheduleServicesProvider}from ${JSON.stringify(path.join(root,'components/schedules/ScheduleServices.tsx'))};const operations={saveScheduleInputSubjects:async(year,term,hash,rows)=>fetch('/save',{method:'POST',body:JSON.stringify({year,term,hash,rows})}).then(r=>r.json())};createRoot(document.getElementById('root')).render(React.createElement(ScheduleServicesProvider,{operations,local:location.search.includes('local')},React.createElement('div',{className:'workspace-theme'},React.createElement('section',{className:'schedule-prep'},React.createElement(Input,{kind:'subjects',data:${JSON.stringify(fixture)},year:'year',term:2,onSaved:async()=>{},onDirty:()=>{},onBusy:()=>{},onRoster:()=>{},locked:false})))));`)
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
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000)
  for(const local of [false,true]){
    const before=saves.length;failCatalog=local
    await page.setViewport({width:1440,height:1000});await page.goto(`http://127.0.0.1:${server.address().port}/schedules/${local?'device/manage?local=1':'class/manage'}`,{waitUntil:'networkidle0'})
    await page.click('.prep-subject-tools .prep-primary');await page.waitForSelector('.prep-subject-dialog[open]')
    const pending=['ป.1/IP','ค11101','ชื่อที่กรอกไว้','7','คณิตศาสตร์','พื้นฐาน']
    for(let col=0;col<6;col++)await page.type(`.prep-sheet input[data-row="0"][data-col="${col}"]`,pending[col])
    await page.click('.central-subject-toggle')
    if(local){await page.waitForSelector('.central-subject-panel .prep-error');await page.click('.central-subject-panel .prep-error button')}
    await page.waitForSelector('.central-subject-options input');assert.equal(saves.length,before,'Catalog browsing is read-only')
    assert.equal(await page.$eval('.central-subject-stage',el=>el.textContent.includes('เพิ่มใหม่ 2 รายการ · ข้ามรายการซ้ำ 2 รายการ')),true)
    assert.equal(await page.$eval('.central-subject-options label:last-child input',el=>el.disabled),true,'Missing annual hours cannot silently create a period')
    await page.select('.central-subject-grade select','2');assert.equal(await page.$eval('.central-subject-options',el=>el.textContent.includes('ภาษาไทย ป.2')),true);assert.equal(await page.$eval('.central-subject-options',el=>el.textContent.includes('มัธยม')),false)
    await page.select('.central-subject-grade select','1')
    await page.click('.central-subject-rooms label:first-child input');assert.equal(await page.$eval('.central-subject-stage',el=>el.textContent.includes('เพิ่มใหม่ 1 รายการ · ข้ามรายการซ้ำ 1 รายการ')),true)
    await page.click('.central-subject-choice-bar button');await page.click('.central-subject-options label:nth-child(2) input');assert.equal(await page.$eval('.central-subject-stage',el=>el.textContent.includes('เพิ่มใหม่ 1 รายการ · ข้ามรายการซ้ำ 1 รายการ')),true)
    await page.click('.central-subject-options label:nth-child(2) input')
    for(const width of [360,390,768,1440]){
      await page.setViewport({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      assert.equal(await page.$eval('.prep-subject-dialog',el=>el.scrollWidth>el.clientWidth+1),false,'Dialog overflow '+width)
      assert.equal(await page.$eval('.central-subject-panel',el=>el.scrollWidth>el.clientWidth+1),false,'Catalog panel overflow '+width)
      if(width===390||width===1440)await page.screenshot({path:path.join(out,`catalog-${local?'free':'online'}-${width}.png`)})
    }
    await page.click('.central-subject-stage .prep-primary');await page.waitForSelector('.central-subject-panel',{hidden:true})
    assert.equal(await page.$eval('.prep-sheet input[data-row="0"][data-col="2"]',el=>el.value),'ชื่อที่กรอกไว้')
    assert.equal(await page.$eval('.prep-sheet input[data-row="0"][data-col="3"]',el=>el.value),'7')
    const count=await page.$('.prep-sheet input[data-row="1"][data-col="3"]');await count.focus();await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.type('3');assert.equal(await count.evaluate(el=>el.value),'3')
    assert.equal(saves.length,before,'Staging does not save automatically')
    await page.click('.prep-subject-dialog>footer .prep-primary');try{await page.waitForSelector('.prep-subject-dialog[open]',{hidden:true})}catch(error){console.log(await page.$$eval('.prep-error',els=>els.map(el=>el.textContent)));console.log('Runtime errors:',errors);await page.screenshot({path:path.join(out,'save-failure.png')});throw error}
    const saved=saves.at(-1);assert.equal(saves.length,before+1);assert.equal(saved.year,'year');assert.equal(saved.term,2);assert.equal(saved.hash,'fixture');assert.equal(saved.rows.length,3)
    assert.ok(!saved.rows.some(row=>row.classroomId==='a'&&row.code==='ท11101'),'Existing teacher/venue assignment was not submitted for overwrite')
    assert.equal(saved.rows.find(row=>row.classroomId==='a'&&row.code==='ค11101').count,3)
    assert.equal(saved.rows.find(row=>row.classroomId==='ip'&&row.code==='ค11101').count,7)
    assert.equal(saved.rows.find(row=>row.classroomId==='ip'&&row.code==='ท11101').count,5)
    if(!local){
      await page.click('.prep-subject-levels button:nth-of-type(2)')
      for(let attempt=0;attempt<2;attempt++){
        await page.click('.prep-subject-tools .prep-primary');await page.click('.central-subject-toggle');await page.waitForSelector('.central-subject-options input')
        assert.equal(await page.$eval('.central-subject-grade select',el=>el.value),'2','Reopening defaults to the classroom grade currently being edited')
        await page.select('.central-subject-grade select','1');await page.click('.prep-subject-dialog>header button')
      }
    }
  }
  assert.equal(catalogReads,5);assert.deepEqual(errors,[])
  console.log('PASS: real Free/online subject dialog, four widths, primary-only grade/room selection, invalid hours disabled, existing/staged rows protected, retry, editable preview and explicit batched save')
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
