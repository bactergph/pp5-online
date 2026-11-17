// Mount the production page against synthetic read-only actions; no school data is changed.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const { webpack } = webpackPackage, root = process.cwd(), out = path.resolve('tmp/reading-summary-ui')
fs.mkdirSync(out, { recursive: true })
const write = (name, text) => { const file = path.join(out, name); fs.writeFileSync(file, text); return file }
const actions = write('actions.js', `async function call(method,args){const response=await fetch('/rpc',{method:'POST',body:JSON.stringify({method,args})});const data=await response.json();if(data.error)throw Error(data.error);return data}
export const fetchEvaluationInit=()=>call('init',[]),fetchEvaluationClassrooms=(...args)=>call('rooms',args),fetchReadingSummary=(...args)=>call('summary',args);`)
const navigation = write('navigation.js', `export const usePathname=()=>'/test-school/evaluation/summary/reading';`)
const link = write('link.js', `import React from 'react';export default function Link(props){return React.createElement('a',props)}`)
const entry = write('entry.js', `import React from 'react';import{createRoot}from'react-dom/client';import Page from ${JSON.stringify(path.join(root,'app/(shell)/evaluation/summary/reading/ReadingSummary.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Page));`)
const loader = write('loader.cjs', `const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;`)
const css = write('css.cjs', `module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style);'`)
await new Promise((resolve,reject) => {
  const compiler = webpack({ mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{
    [path.join(root,'app/(shell)/evaluation/actions')]:actions,
    [path.join(root,'app/(shell)/evaluation/summary/reading/actions')]:actions,
    'next/navigation':navigation,'next/link':link,'@':root,
  }},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]} })
  compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))
})
const rooms=[{id:'primary',level:'ป.1',room:1},{id:'secondary',level:'ม.1',room:1}]
const students=[{id:'a',student_number:1,student_code:'001',prefix:'เด็กหญิง',first_name:'ชื่อทดสอบยาวมาก',last_name:'นามสกุลต้องอ่านได้ครบ'}, {id:'b',student_number:2,student_code:'002',prefix:'เด็กชาย',first_name:'ยังไม่มีผล',last_name:'ทดสอบ'}]
let fail = false, slow = false, browser
const server=http.createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
  if(req.url==='/rpc'){
    let raw='';for await(const part of req) raw+=part
    const {method,args}=JSON.parse(raw);let data
    if(method==='init')data={years:[{id:'year',year_be:2569,is_active:true},{id:'old',year_be:2568}],activeYearId:'year',classrooms:rooms}
    if(method==='rooms')data=args[0]==='old'?[]:rooms
    if(method==='summary'){
      const secondary=args[0]==='secondary'
      data={classroom:rooms.find(room=>room.id===args[0]),secondary,students,periods:(secondary?[args[2]]:[1,2]).map(term=>({term,rows:students.map((student,index)=>({student_id:student.id,total:index?null:term===1?15:0,max:15,completed:index?0:5,required:5,result:index?'ยังไม่ครบ':term===1?'ดีเยี่ยม':'ไม่ผ่าน',values:{}}))}))}
      if(fail)data={error:'จำลองการโหลดล้มเหลว'}
      if(slow&&args[2]===1)await new Promise(resolve=>setTimeout(resolve,350))
    }
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return
  }
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:Tahoma,sans-serif}*{box-sizing:border-box}</style><div id="root"></div><script src="/bundle.js"></script></html>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
try {
  browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']})
  const page=await browser.newPage(), errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)})
  await page.bringToFront()
  console.log('Opening production component with synthetic data')
  await page.goto(`http://127.0.0.1:${server.address().port}`, {waitUntil:'domcontentloaded',timeout:60000})
  await page.waitForSelector('.rs-board')
  assert.equal(await page.$$('.rs-period-card').then(rows=>rows.length),2)
  assert.equal(await page.$$('tbody tr').then(rows=>rows.length),2)
  assert.equal(await page.$eval('.rs-context a',el=>el.getAttribute('href')),'/test-school/evaluation/reading')
  await page.type('input[aria-label="ค้นหานักเรียน"]','001');assert.equal(await page.$$('tbody tr').then(rows=>rows.length),1)
  await page.$eval('input',el=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,'');el.dispatchEvent(new Event('input',{bubbles:true}))})
  await page.select('.rs-table-tools select','ยังไม่ครบ');assert.equal(await page.$$('tbody tr').then(rows=>rows.length),1)
  await page.select('.rs-table-tools select','')
  for(const width of [390,768,1440]){
    await page.setViewport({width,height:900})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`No page overflow at ${width}`)
    await page.$eval('.rs-table-scroll',el=>el.scrollLeft=el.scrollWidth)
    assert.equal(await page.$eval('tbody .rs-name',el=>el.scrollWidth>el.clientWidth+1),false,'Names wrap without truncation')
    await page.screenshot({path:path.join(out,`summary-${width}.png`),fullPage:true})
  }
  await page.select('.rs-controls label:nth-child(2) select','secondary');await page.waitForSelector('.rs-board')
  assert.equal(await page.$$('.rs-period-card').then(rows=>rows.length),1)
  assert.equal(await page.$eval('.rs-context a',el=>el.getAttribute('href')),'/test-school/evaluation/secondary/reading')
  slow=true
  await page.select('.rs-controls label:nth-child(3) select','2')
  await page.waitForFunction(()=>document.querySelector('tbody tr td strong')?.textContent==='0 / 15')
  await page.select('.rs-controls label:nth-child(3) select','1');await page.select('.rs-controls label:nth-child(3) select','2')
  await page.waitForSelector('.rs-board');await new Promise(resolve=>setTimeout(resolve,500))
  assert.equal(await page.$eval('tbody tr td strong',el=>el.textContent),'0 / 15','Late response must not replace selected term')
  fail=true;await page.click('.rs-refresh');await page.waitForSelector('[role=alert]');assert.equal(await page.$('.rs-board'),null)
  fail=false;await page.click('[role=alert] button');await page.waitForSelector('.rs-board')
  await page.select('.rs-controls label:first-child select','old');await page.waitForFunction(()=>document.querySelector('.rs-controls label:nth-child(2) select')?.textContent.includes('ยังไม่มีห้อง'))
  assert.equal(await page.$('.rs-board'),null)
  assert.deepEqual(errors,[])
  console.log('PASS: production summary page, primary/secondary periods, search/filter, school-scoped links, stale responses, failed-load retry, empty year, full names and responsive layouts')
} catch(error) {
  if(browser){const pages=await browser.pages();const page=pages.at(-1);if(page){fs.writeFileSync(path.join(out,'failure.txt'),await page.evaluate(()=>document.body.innerText));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true})}}
  throw error
} finally { if(browser)await browser.close();await new Promise(resolve=>server.close(resolve)) }
