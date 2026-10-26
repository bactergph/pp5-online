// Render the production component with a synthetic RPC bridge; no real data is touched.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage,root=process.cwd(),out=path.resolve('tmp/personal-homeroom-ui');fs.mkdirSync(out,{recursive:true})
const write=(n,s)=>{const p=path.join(out,n);fs.writeFileSync(p,s);return p}
const bridge=write('actions.js',`async function call(method,args){return(await fetch('/rpc',{method:'POST',body:JSON.stringify({method,args,plan:new URLSearchParams(location.search).get('plan')})})).json()}export const fetchPersonalHomeroomSettings=()=>call('get',[]),savePersonalHomeroomSettings=(...args)=>call('save',args);`)
const entry=write('entry.js',`import React from'react';import{createRoot}from'react-dom/client';import Panel from ${JSON.stringify(path.join(root,'components/classroom-admin/PersonalHomeroomPanel.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Panel));`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;`)
const css=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style);'`)
await new Promise((resolve,reject)=>{const c=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/app/(shell)/classroom-admin/personal-actions':bridge,'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]});c.run((e,s)=>c.close(()=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()))})
const selections={pro:[],pro_plus:[]},saved=[];let fail=false
const server=http.createServer(async(req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
 if(req.url==='/rpc'){let raw='';for await(const p of req)raw+=p;const {method,args,plan}=JSON.parse(raw),limit=plan==='pro'?1:3;let result=null
 if(method==='get'&&plan!=='school')result={limit,label:plan==='pro'?'PRO · สมาชิกโปร':'PRO PLUS · สมาชิกโปรพลัส',years:[{id:'year',year_be:2569,is_active:true},{id:'old',year_be:2568,is_active:false}],rooms:Array.from({length:6},(_,i)=>({id:'room'+i,level:'ม.1',room:i+1,academic_year_id:i===5?'old':'year'})),selected:selections[plan]}
 if(method==='save'){result={error:fail?'จำลองบันทึกไม่สำเร็จ':null};if(!fail){assert.ok(args[1].length<=limit);selections[plan]=args[1].map(classroom_id=>({classroom_id,academic_year_id:args[0]}));saved.push({plan,args})}}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Tahoma,sans-serif}button,input,select{font:inherit}</style><div id="root"></div><script src="/bundle.js"></script></html>')
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;let browser
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 const goto=async plan=>{await page.goto(origin+'/?plan='+plan);await page.waitForSelector('.personal-home-panel')},open=async()=>{await page.click('.personal-home-panel>button');await page.waitForSelector('.personal-home-dialog[open]')}
 await page.setViewport({width:1440,height:900});await goto('pro');await open();await page.click('.personal-home-rooms input');assert.equal(await page.$$eval('.personal-home-rooms input:disabled',els=>els.length),4)
 await Promise.all([page.waitForNavigation(),page.click('.personal-home-dialog footer .primary')]);await page.waitForFunction(()=>document.querySelector('.personal-home-panel h2')?.textContent.includes('1/1'));assert.deepEqual(saved.at(-1).args,['year',['room0']])
 await goto('pro_plus');await open();await page.$$eval('.personal-home-rooms input',els=>els.slice(0,3).forEach(el=>el.click()));assert.equal(await page.$$eval('.personal-home-rooms input:checked',els=>els.length),3);assert.equal(await page.$$eval('.personal-home-rooms input:disabled',els=>els.length),2)
 fail=true;await page.click('.personal-home-dialog footer .primary');await page.waitForSelector('.personal-home-dialog [role=alert]');assert.equal(selections.pro_plus.length,0);assert.equal(await page.$$eval('.personal-home-rooms input:checked',els=>els.length),3)
 fail=false;await Promise.all([page.waitForNavigation(),page.click('.personal-home-dialog footer .primary')]);await page.waitForFunction(()=>document.querySelector('.personal-home-panel h2')?.textContent.includes('3/3'))
 await open();for(const width of [360,390,768,1440]){await page.setViewport({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.$eval('.personal-home-dialog',el=>el.scrollWidth>el.clientWidth+1),false);await page.screenshot({path:path.join(out,'homeroom-'+width+'.png')})}
 await page.select('.personal-home-year select','old');assert.equal(await page.$$('.personal-home-rooms input').then(a=>a.length),1);assert.equal(await page.$$eval('.personal-home-rooms input:checked',els=>els.length),0)
 await page.keyboard.press('Escape');await page.waitForSelector('.personal-home-dialog:not([open])');assert.equal(selections.pro_plus.length,3,'Cancel must preserve selected rooms')
 await page.goto(origin+'/?plan=school');await page.waitForNetworkIdle();assert.equal(await page.$('.personal-home-panel'),null);assert.deepEqual(errors,[])
 console.log('PASS: actual homeroom selector, Pro 1/Plus 3 caps, saved selection after reload, failed-save preservation, year switching, cancel, School hidden and four responsive widths')
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
