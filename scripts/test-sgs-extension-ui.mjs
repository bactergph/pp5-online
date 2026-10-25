import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
import {unzipSync} from 'fflate'

const out=path.resolve('tmp/sgs-extension-ui');fs.mkdirSync(out,{recursive:true})
const sourceRoot=path.resolve('extensions/jarnsek-sgs')
const packet={format:'jarnsek-sgs-scores',version:1,context:{yearBe:2569,term:2,classroom:'ม.1/1',subjectCode:'ท21102',subjectName:'ภาษาไทย 2'},columns:[{key:'unit_1',label:'ระหว่างเรียน 1',max:20},{key:'final',label:'ปลายภาค',max:30}],students:[{studentCode:'00101',name:'นักเรียน ก',values:[0,15.5]},{studentCode:'00102',name:'นักเรียน ข',values:[12,null]}]}
const write=(name,content)=>{const file=path.join(out,name);fs.writeFileSync(file,content);return file}
write('packet.json',JSON.stringify(packet))
const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';import Dialog from ${JSON.stringify(path.resolve('components/SGSExportDialog.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Dialog,{packet:${JSON.stringify(packet)},unsaved:true,onClose:()=>{window.closedExport=true}}));`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
const css=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style);'`)
const {webpack}=webpackPackage
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':process.cwd()}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))})
let persisted={},saveCount=0,receipt=null
const initial={b1:'',b2:'',bfinal:'28',a1:'',a2:'',afinal:''}
const html=()=>`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px Tahoma,sans-serif;padding:20px;color:#173359;background:#edf3fb}table{border-collapse:collapse;background:white}td,th{padding:10px;border:1px solid #ccc}input{width:70px;padding:9px}button,select{font:inherit;padding:9px}</style><h1>SGS · หน้าจำลองสำหรับทดสอบ</h1><p>ไม่มีข้อมูลโรงเรียนจริง</p><select id="subject"><option value="thai">ท21102 ภาษาไทย 2</option><option value="other">วิชาอื่น</option></select><table><thead><tr><th>เลขที่</th><th>เลขประจำตัวนักเรียน</th><th>ชื่อ–สกุล</th><th>S1</th><th>S2</th><th>ปลายภาค</th></tr></thead><tbody>${[['b','00102','นักเรียน ข'],['a','00101','นักเรียน ก']].map(([prefix,code,name],index)=>`<tr><td>${index+1}</td><td>${code}</td><td>${name}</td>${[['1',20],['2',10],['final',30]].map(([suffix,max])=>`<td><input type="text" class="inputscore" id="${prefix+suffix}" max="${max}" value="${persisted[prefix+suffix]??initial[prefix+suffix]}"></td>`).join('')}</tr>`).join('')}</tbody></table><button id="save">บันทึก SGS</button><p id="saved"></p><script>window.inputEvents=0;document.addEventListener('input',()=>window.inputEvents++);document.getElementById('save').onclick=async()=>{const data=Object.fromEntries(Array.from(document.querySelectorAll('.inputscore')).map(input=>[input.id,input.value]));await fetch('/save',{method:'POST',body:JSON.stringify(data)});document.getElementById('saved').textContent='บันทึกแล้ว'};</script></html>`
const server=http.createServer(async(req,res)=>{
 if(req.url==='/save'){let raw='';for await(const chunk of req)raw+=chunk;persisted=JSON.parse(raw);saveCount++;res.end('ok');return}
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
 if(req.url==='/export'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script></html>');return}
 if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html())
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
let browser
try {
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu','--disable-background-networking']})
 const page=await browser.newPage(),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.setRequestInterception(true);page.on('request',request=>request.url().startsWith(origin)||request.url().startsWith('blob:')?request.continue():request.abort())
 await page.exposeFunction('__fixtureReceipt',async message=>{
   if(message.type==='jarnsek:receipt:set'){receipt=JSON.parse(JSON.stringify(message.receipt));return{ok:true}}
   if(message.type==='jarnsek:receipt:get')return{receipt}
   if(message.type==='jarnsek:receipt:forget'){receipt=null;return{ok:true}}
   return{error:'unknown'}
 })
 await page.evaluateOnNewDocument(()=>{window.chrome={runtime:{sendMessage:message=>window.__fixtureReceipt(message)}}})
 const cdp=await page.createCDPSession()
 async function exposeClosedShadow(){
   const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true})
   const walk=node=>node.attributes?.includes('jarnsek-sgs-extension')?node:[...(node.children||[]),...(node.shadowRoots||[])].map(walk).find(Boolean)
   const host=walk(root);assert.ok(host?.shadowRoots?.[0])
   const {object}=await cdp.send('DOM.resolveNode',{backendNodeId:host.shadowRoots[0].backendNodeId})
   await cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){window.__fixtureShadow=this}'})
 }
 async function inject(){await page.addScriptTag({path:path.join(sourceRoot,'core.js')});await page.addScriptTag({path:path.join(sourceRoot,'panel.js')});await exposeClosedShadow()}
 const click=async id=>{await page.evaluate(id=>window.__fixtureShadow.getElementById(id).click(),id)}
 const set=async(id,value)=>page.evaluate(({id,value})=>{const input=window.__fixtureShadow.getElementById(id);if(typeof value==='boolean')input.checked=value;else input.value=value;input.dispatchEvent(new Event(input.tagName==='TEXTAREA'?'input':'change',{bubbles:true}))},{id,value})
 const message=()=>page.evaluate(()=>window.__fixtureShadow.getElementById('status').textContent)
 const mapping=()=>page.evaluate(()=>{const selects=window.__fixtureShadow.getElementById('mappings').querySelectorAll('select');selects[0].value='0';selects[1].value='2';for(const select of selects)select.dispatchEvent(new Event('change'))})
 const prepare=async()=>{await set('source',JSON.stringify(packet));await click('read');await mapping();await set('context-confirm',true);await click('preview')}
 await page.setViewport({width:1440,height:1000});await page.goto(origin+'/score');await inject();await prepare()
 await page.evaluate(()=>{window.changeEvents=0;document.addEventListener('change',()=>window.changeEvents++)})
 assert.match(await message(),/ตรวจผ่าน 3 ช่อง/)
 await click('apply');await page.waitForFunction(()=>window.__fixtureShadow.getElementById('status').textContent.includes('เติม 3 ช่องแล้ว'))
 assert.equal(await page.$eval('#a1',input=>input.value),'0');assert.equal(await page.$eval('#b1',input=>input.value),'12');assert.equal(await page.$eval('#afinal',input=>input.value),'15.5');assert.equal(await page.$eval('#bfinal',input=>input.value),'28')
 assert.equal(saveCount,0,'Filling must never silently click SGS save')
 assert.equal(await page.evaluate(()=>window.changeEvents),1,'Mark the batch once, without additional change dispatch per score cell')
 assert.equal(receipt.changes.length,3)
 await click('verify');await page.waitForFunction(()=>window.__fixtureShadow.getElementById('status').textContent.includes('โหลดหน้าใหม่ก่อนตรวจ'))
 await page.screenshot({path:path.join(out,'panel-1440.png')})
 await page.setViewport({width:390,height:844})
 assert.equal(await page.evaluate(()=>{const dialog=window.__fixtureShadow.querySelector('dialog'),footer=window.__fixtureShadow.querySelector('footer');return dialog.getBoundingClientRect().width<=innerWidth&&footer.getBoundingClientRect().bottom<=dialog.getBoundingClientRect().bottom}),true)
 await page.screenshot({path:path.join(out,'panel-390.png')});await page.setViewport({width:1440,height:1000})
 await click('cancel');await page.click('#save');await page.waitForSelector('#saved:not(:empty)');assert.equal(saveCount,1)
 await page.reload();await inject();await click('verify');await page.waitForFunction(()=>window.__fixtureShadow.getElementById('status').textContent.includes('คะแนนตรงครบ 3 ช่อง'))
 persisted.afinal='9';await page.reload();await inject();await click('verify');await page.waitForFunction(()=>window.__fixtureShadow.getElementById('status').textContent.includes('ไม่ตรง 1 จาก 3'))
 persisted={};await page.reload();await inject();await prepare()
 await page.$eval('#a1',input=>{input.value='7'})
 await click('apply');await page.waitForFunction(()=>window.__fixtureShadow.getElementById('status').textContent.includes('เปลี่ยนหลังตรวจ'))
 assert.equal(await page.$eval('#b1',input=>input.value),'');assert.equal(await page.$eval('#a1',input=>input.value),'7','Stale preview must not overwrite a concurrent score change')
 await page.reload();await inject();await click('close');await page.focus('#b1')
 await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','1\t2\n3\t4\n');document.getElementById('b1').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))})
 await set('context-confirm',true);await set('order-confirm',true);await set('overwrite',true);await click('preview')
 assert.match(await message(),/Excel มี 2 ช่อง แต่ SGS เปิดไว้ 3 ช่อง/)
 await set('source','1\t2\t3\n4\t5\t6\n');await click('read');await click('preview');assert.match(await message(),/ตรวจผ่าน 6 ช่อง/)
 await click('apply');await page.waitForFunction(()=>window.__fixtureShadow.getElementById('status').textContent.includes('เติม 6 ช่องแล้ว'))
 assert.deepEqual(await page.$$eval('.inputscore',inputs=>inputs.map(input=>input.value)),['1','2','3','4','5','6'])
 await page.reload();await inject()
 const fileObject=await cdp.send('Runtime.evaluate',{expression:'window.__fixtureShadow.getElementById("file")'})
 await cdp.send('DOM.setFileInputFiles',{objectId:fileObject.result.objectId,files:[path.join(out,'packet.json')]})
 await page.waitForFunction(()=>window.__fixtureShadow.getElementById('source-meta').textContent.includes('ท21102'))
 await mapping();await set('context-confirm',true);await click('preview')
 await page.$eval('#subject',select=>{select.value='other'})
 await click('apply');await page.waitForFunction(()=>window.__fixtureShadow.getElementById('status').textContent.includes('เปลี่ยนหลังตรวจ'))
 await click('forget');await page.waitForFunction(()=>window.__fixtureShadow.getElementById('status').textContent.includes('ล้างรายการตรวจชั่วคราวแล้ว'));assert.equal(receipt,null)

 await page.goto(origin+'/export');await page.waitForSelector('.sgs-export-dialog[open]')
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedScores=text}}});window.capturedBlobs=[];const create=URL.createObjectURL;URL.createObjectURL=blob=>{window.capturedBlobs.push(blob);return create(blob)};document.addEventListener('click',event=>{if(event.target instanceof HTMLAnchorElement&&event.target.download)event.preventDefault()})})
 const byText=async text=>page.evaluate(text=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===text).click(),text)
 await byText('คัดลอกคะแนน');await page.waitForFunction(()=>Boolean(window.copiedScores));assert.deepEqual(JSON.parse(await page.evaluate(()=>window.copiedScores)),packet)
 await page.click('.sgs-export-columns input')
 await byText('ดาวน์โหลดไฟล์คะแนน SGS');await page.waitForFunction(()=>window.capturedBlobs.length===1)
 const exported=JSON.parse(await page.evaluate(()=>window.capturedBlobs[0].text()));assert.equal(exported.columns.length,1);assert.equal(exported.columns[0].key,'final');assert.deepEqual(exported.students[0].values,[15.5]);assert.equal(exported.students[0].studentCode,'00101')
 await page.setViewport({width:390,height:844});assert.equal(await page.$eval('dialog',dialog=>dialog.scrollWidth<=dialog.clientWidth+1),true);await page.screenshot({path:path.join(out,'export-390.png')})
 assert.deepEqual(errors,[])

 const zipped=unzipSync(fs.readFileSync('public/downloads/jarnsek-sgs-extension.zip'))
 const manifest=JSON.parse(Buffer.from(zipped['manifest.json']).toString())
 assert.deepEqual(manifest.permissions,['activeTab','scripting','storage']);assert.equal(manifest.host_permissions,undefined)
 for(const name of ['core.js','panel.js','service-worker.js'])assert.equal(Buffer.from(zipped[name]).toString(),fs.readFileSync(path.join(sourceRoot,name),'utf8'),'Downloaded build must match reviewed source; rebuild if changed')
 for(const size of [16,32,48,128])assert.deepEqual(Array.from(zipped[`icons/${size}.png`].slice(0,8)),[137,80,78,71,13,10,26,10])
 console.log('PASS: real SGS extension UI, reordered student IDs/zero/blanks, explicit save, post-reload verification and mismatch detection, stale score/context protection, one-paste Excel dimensions, JSON file upload, session receipt clearing, real React export/copy/download, mobile layouts and distributable ZIP integrity')
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
