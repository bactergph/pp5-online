import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import pkg from 'next/dist/compiled/webpack/webpack.js';
const { webpack } = pkg, root = process.cwd(), out = path.resolve('tmp/dmc-import-ui');
fs.mkdirSync(out, { recursive: true });
const write = (name, text) => { const file = path.join(out, name); fs.writeFileSync(file,text); return file };
const actions = write('actions.js', `
export async function fetchClassroomsForImport(){return[{id:'room',level:'ม.1',room:1,academic_year_id:'year'}]}
export async function fetchAcademicYears(){return{years:[{id:'year',year_be:2569,is_active:true}]}}
export async function saveAcademicYear(){throw Error('unused')}
async function save(rows){const n=window.calls.push(rows.length);while(n===2&&window.holdSecond)await new Promise(r=>setTimeout(r,20));await new Promise(r=>setTimeout(r,100));if(n===2&&window.mode==='offline')throw Error('การเชื่อมต่อขัดข้อง');const duplicate=rows.filter(r=>window.existing.has(r.student_code)).length;rows.forEach(r=>window.existing.add(r.student_code));return{error:null,inserted:rows.length-duplicate,duplicate,failed:0,skipped:duplicate}}
export async function importStudentsWholeSchool(year,rows){return save(rows)}export async function importStudents(room,rows){return save(rows)}
`);
const alert = write('alert.jsx', `import React from 'react';const Modal=()=>null;export function useAppAlert(){return{notify:(kind,text)=>window.notifications.push({kind,text}),clearAlert:()=>{},AlertModal:Modal}}`);
const entry = write('entry.jsx', `
import React,{useState} from'react';import{createRoot}from'react-dom/client';import * as XLSX from'xlsx';
import Dmc from ${JSON.stringify(path.join(root,'components/settings/DmcImportTool.tsx'))};
function Shell(){const[action,setAction]=useState(null),[advanced,setAdvanced]=useState(false);return <><Dmc hideImportButton onActionChange={setAction}/><footer><button id="import" disabled={!action?.canImport||action.importing} onClick={async()=>{const ok=await action.run();if(ok)setAdvanced(true)}}>{action?.importing?action.progressLabel:action?.label||'เลือกไฟล์'}</button><button id="skip" disabled={action?.importing}>ข้าม</button><span id="advanced">{String(advanced)}</span></footer></>}
const root=createRoot(document.getElementById('root'));let key=0;window.mount=(mode='normal')=>{window.calls=[];window.notifications=[];window.existing=new Set();window.mode=mode;window.holdSecond=false;root.render(<Shell key={++key}/>)};
window.upload=()=>{const rows=Array.from({length:1500},(_,i)=>[String(900001+i),'เด็กชาย','นักเรียน','จำลอง'+i,'ชาย','01/01/2556','ม.'+(Math.floor(i/250)+1),Math.floor(i%250/50)+1]);const sheet=XLSX.utils.aoa_to_sheet([['ข้อมูลสมมติ'],['เลขประจำตัวนักเรียน','คำนำหน้า','ชื่อ','นามสกุล','เพศ','วันเกิด','ชั้น','ห้อง'],...rows]);const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'นักเรียน');const file=new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'students.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const transfer=new DataTransfer();transfer.items.add(file);const input=document.querySelector('input[type=file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))};
`);
const loader = write('loader.cjs', `const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`);
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js',publicPath:'/'},resolve:{extensions:['.tsx','.ts','.jsx','.js'],alias:{'@/app/settings/actions$':actions,'@/lib/use-app-alert$':alert,'@':root}},module:{rules:[{test:/\.(tsx?|jsx)$/,exclude:/node_modules/,use:loader}]}});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))});
const css=['globals','screen-brand-colors','workspace-theme','workspace-controls','workspace-depth','ui-system'].map(name=>fs.readFileSync('app/'+name+'.css','utf8').replace(/@import[^;]*;|@source[^;]*;/g,'')).join('\n');
let browser;
try{
  browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu','--no-proxy-server']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setRequestInterception(true);page.on('request',request=>request.isNavigationRequest()?request.respond({status:200,contentType:'text/html',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;padding:16px;font-family:Tahoma}*{box-sizing:border-box}footer{position:sticky;bottom:0;background:white;padding:16px;display:flex;gap:12px}footer button{padding:12px}#advanced{display:none}</style><main id="root" style="max-width:1100px;margin:auto"></main>'}):request.abort());
  await page.goto('https://dmc-import.test/',{waitUntil:'domcontentloaded'});await page.addScriptTag({content:fs.readFileSync(path.join(out,'bundle.js'),'utf8')});
  const mount=async(mode='normal')=>{await page.evaluate(m=>window.mount(m),mode);await page.waitForSelector('input[type=file]');await page.evaluate(()=>window.upload());await page.waitForFunction(()=>document.querySelector('#import')?.textContent.includes('1,500')||document.querySelector('#import')?.textContent.includes('1500'));await page.waitForFunction(()=>!document.querySelector('input[type=file]')?.disabled)};
  await mount();assert.equal(await page.$$eval('tbody tr',rows=>rows.length),100,'Preview DOM is limited; all 1,500 remain in import data');
  await page.evaluate(()=>window.holdSecond=true);await page.click('#import');
  await page.waitForFunction(()=>document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')==='200');
  assert.equal(await page.$eval('#skip',el=>el.disabled),true);assert.equal(await page.$eval('.dmc-import-controls',el=>el.disabled),true);
  assert.match(await page.$eval('#import',el=>el.textContent),/200.*1,500/);
  assert.match(await page.$eval('.dmc-save-progress',el=>el.textContent),/บันทึกสำเร็จ 200/);
  for(const width of [1440,390]){await page.setViewport({width,height:1000});await page.$eval('.dmc-save-progress',el=>el.scrollIntoView({block:'center'}));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No page overflow');await page.screenshot({path:path.join(out,'progress-'+width+'.png'),fullPage:true})}
  await page.evaluate(()=>window.holdSecond=false);await page.waitForFunction(()=>document.querySelector('#advanced')?.textContent==='true');
  assert.deepEqual(await page.evaluate(()=>window.calls),[200,200,200,200,200,200,200,100]);assert.equal(await page.evaluate(()=>window.existing.size),1500);
  await mount('offline');await page.click('#import');await page.waitForSelector('.dmc-save-progress--error');
  assert.equal(await page.$eval('#advanced',el=>el.textContent),'false');assert.equal(await page.$eval('[role=progressbar]',el=>el.getAttribute('aria-valuenow')),'200');assert.equal(await page.$eval('#import',el=>el.disabled),false);assert.equal(await page.$eval('.dmc-import-controls',el=>el.disabled),false);
  assert.equal(await page.evaluate(()=>window.existing.size),200);assert.match(await page.$eval('.alert-error',el=>el.textContent),/บันทึกแล้ว 200/);
  // Retry the same file, including rows committed before the lost connection.
  await page.evaluate(()=>{window.mode='normal';window.calls=[]});await page.click('#import');await page.waitForFunction(()=>document.querySelector('#advanced')?.textContent==='true');assert.equal(await page.evaluate(()=>window.existing.size),1500);assert.match(await page.$eval('.dmc-save-progress',el=>el.textContent),/มีข้อมูลแล้ว 200/);
  assert.deepEqual(errors,[]);console.log('PASS: actual DMC UI reads 1,500 rows, previews 100 at a time, displays real counts/progress on desktop and mobile, locks controls/navigation, advances only on completion, reports interrupted writes and retries without duplicating known codes');
}catch(error){console.error(error);if(browser){try{const pages=await browser.pages();const page=pages.at(-1);fs.writeFileSync(path.join(out,'failure.txt'),await page.evaluate(()=>document.body.innerText));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true})}catch(diagnostic){console.error('Diagnostic:',diagnostic.message)}}throw error}finally{if(browser)await browser.close()}
