// Real activity editor, native dialogs and confirmation UI; synthetic school and mock persistence only.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage, root=process.cwd(), out=path.resolve('tmp/activity-assignment-ui')
fs.mkdirSync(out,{recursive:true})
const exports={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/schedule-activity-teams.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports})
const classrooms=Array.from({length:9},(_,i)=>({id:`room-${i+1}`,level:`ป.${Math.floor(i/3)+1}`,name:String(i%3+1),room:i%3+1}))
const teachers=['หนึ่ง','สอง','สาม','นอกชุด'].map((name,i)=>({id:`teacher-${i+1}`,prefix:'ครู',full_name:`ตัวอย่าง ${name}`,position:'ครู'}))
const periods=[1,2,0,3,4].map((period,i)=>({period,is_break:!period,start_time:`${i+8}:00`,end_time:`${i+9}:00`,sort_order:i+1}))
const activities=[{id:'scouts',label:'ลูกเสือ',short_label:'ลูกเสือ',weeklyPeriods:1},{id:'guidance',label:'แนะแนว',short_label:'แนะแนว',weeklyPeriods:1}]
const fixture={hash:'fixture',classrooms,teachers,activities,periods,plan:{days:[1,2,3,4,5],teacherIds:teachers.slice(0,3).map(t=>t.id),activityGroups:[]}}
const largeTeachers=Array.from({length:119},(_,i)=>({id:`large-teacher-${i+1}`,prefix:'ครู',full_name:`ตัวอย่าง ${i+1}`,position:'ครู'}))
const largeFixture={...fixture,classrooms:Array.from({length:63},(_,i)=>({id:`large-room-${i+1}`,level:`ป.${Math.floor(i/11)+1}`,name:String(i%11+1),room:i%11+1})),teachers:largeTeachers,plan:{...fixture.plan,teacherIds:largeTeachers.map(t=>t.id),activityGroups:[]}}
const singleFixture={...fixture,classrooms:Array.from({length:6},(_,i)=>({id:`single-room-${i+1}`,level:`ป.${i+1}`,name:'1',room:1}))}
const previews=[],saves=[]
let failPreview=false
const write=(name,source)=>{
  // Keep generated fixtures out of the application's TypeScript source set.
  if(name.endsWith('.tsx')){name=name.replace(/\.tsx$/,'.js');source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText}
  const file=path.join(out,name);fs.writeFileSync(file,source);return file
}
const actions=write('actions.js',`async function call(method,args){const res=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});if(!res.ok)throw Error(await res.text());return res.json()};export const previewScheduleActivityTeam=(...args)=>call('preview',args),saveScheduleActivityTeam=(...args)=>call('save',args),removeScheduleActivityName=()=>{},saveScheduleActivityName=()=>{};`)
const entry=write('entry.tsx',`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Editor from ${JSON.stringify(path.join(root,'components/schedules/ActivityTeamEditor.tsx'))};import ${JSON.stringify(path.join(root,'components/schedules/schedule-preparation.css'))};function App(){const[data,setData]=useState(location.search.includes('large')?${JSON.stringify(largeFixture)}:location.search.includes('single')?${JSON.stringify(singleFixture)}:${JSON.stringify(fixture)});return <section className="schedule-prep"><Editor data={data} year="test-year" term={2} blocked={false} onDirty={value=>window.editorDirty=value} onBusy={value=>window.editorBusy=value} onSaved={async()=>{const res=await fetch('/fixture');setData(await res.json())}}/></section>};createRoot(document.getElementById('root')).render(<App/>);`)
const loader=write('loader.cjs',`const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText}`)
const css=write('css.cjs',`module.exports=function(source){return 'const style=document.createElement("style");style.textContent='+JSON.stringify(source)+';document.head.appendChild(style);'}`)
await new Promise((resolve,reject)=>{
  const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/app/schedules/planning-actions$':actions,'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]})
  compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))
})
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
    if(req.url==='/fixture'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixture));return}
    if(req.url==='/rpc'){
      let body='';for await(const chunk of req)body+=chunk
      const {method,args}=JSON.parse(body),group=args[3]
      assert.equal(args[0],'test-year');assert.equal(args[1],2)
      exports.validateActivityTeam(group,classrooms.map(r=>r.id),teachers.map(t=>t.id),activities.map(a=>a.id),fixture.plan.days,periods)
      let result
      if(method==='preview'){
        previews.push(structuredClone(group))
        result=failPreview?{error:'ข้อผิดพลาดจำลอง กรุณาลองใหม่',data:null}:{error:null,data:{hash:'fixture',affected:0,locked:0,overwrites:[]}}
        failPreview=false
      }else{
        assert.equal(method,'save');saves.push(structuredClone(group))
        fixture.plan.activityGroups=[...fixture.plan.activityGroups.filter(g=>g.id!==group.id),structuredClone(group)]
        result={data:{hash:'fixture'},error:null}
      }
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return
    }
    if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:Tahoma,sans-serif;background:#f4f7fc}button,input,select{font:inherit}*{box-sizing:border-box}</style><div id="root"></div><script src="/bundle.js"></script></html>')
  }catch(error){res.writeHead(500);res.end(error.stack)}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser,lastPage
try{
  browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']})
  const page=await browser.newPage(),errors=[]
  lastPage=page
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.setViewport({width:1440,height:1000})
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded',timeout:60000})
  const modal='.prep-activity-dialog[open]', main=`${modal} .activity-room-scope[aria-label="ห้องที่จะกำหนดกิจกรรม"]`, targets=`${modal} .activity-room-scope[aria-label="ห้องที่จะใช้ทีมครูนี้"]`
  const clickText=async(selector,text)=>{const handle=await page.evaluateHandle((selector,text)=>[...document.querySelectorAll(selector)].find(el=>el.textContent===text),selector,text);assert.ok(handle.asElement(),`Missing ${text}`);await handle.asElement().click()}
  const open=async()=>{await page.waitForFunction(()=>!window.editorBusy&&!document.querySelector('.swal2-container'));await page.locator('.prep-activity-assign-tools .prep-primary').click();await page.waitForSelector(modal)}
  const chooseTeacher=async n=>page.click(`${modal} .activity-teacher-checks input[aria-label="ครู ตัวอย่าง ${['หนึ่ง','สอง','สาม'][n-1]}"]`)
  const save=async expected=>{await page.click(`${modal}>footer .prep-primary`);await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm');await page.waitForFunction(()=>!window.editorBusy&&!document.querySelector('.prep-activity-dialog[open]')&&!document.querySelector('.swal2-container'));assert.equal(saves.length,expected)}
  await open()
  await page.select(`${modal} select[aria-label="กิจกรรมที่จะกำหนด"]`,'scouts')
  await page.click(`${main} input[aria-label="เลือกทั้งชั้น ป.1"]`)
  await page.click(`${main} input[aria-label="เลือกทั้งชั้น ป.2"]`)
  await page.click(`${main} input[aria-label="เลือกห้อง ป.3/1"]`)
  assert.equal(await page.$eval(`${main} input[aria-label="เลือกทั้งชั้น ป.3"]`,el=>el.indeterminate),true)
  await chooseTeacher(1);await chooseTeacher(2)
  assert.equal(await page.$$eval(`${modal} .activity-teacher-checks input`,els=>els.length),3,'Only eligible roster plus saved selections')
  for(const width of [360,390,768,1024,1440]){
    await page.setViewport({width,height:1000})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    assert.equal(await page.$eval(modal,el=>el.scrollWidth<=el.clientWidth),true,`Dialog fits ${width}px`)
    assert.equal(await page.$eval(modal,el=>{const body=el.querySelector('.prep-team-dialog-body').getBoundingClientRect(),footer=el.querySelector('footer').getBoundingClientRect();return body.bottom<=footer.top+1}),true,'Footer does not cover body')
    if(width<=390)assert.equal(await page.$eval(modal,el=>el.querySelector('footer>span').getBoundingClientRect().bottom<=el.querySelector('footer>.prep-primary').getBoundingClientRect().top),true,'Mobile summary stays above action buttons')
  }
  await page.setViewport({width:1440,height:1000});await page.$eval(`${modal} .prep-team-dialog-body`,el=>el.scrollTop=0)
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true})
  await page.setViewport({width:390,height:844});await page.$eval(`${modal} .activity-team-modes`,el=>el.scrollIntoView({block:'start'}))
  await page.screenshot({path:path.join(out,'mobile-teachers.png'),fullPage:true})
  await page.$eval(`${modal} .prep-team-dialog-body`,el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'mobile-rooms.png'),fullPage:true})
  await save(1)
  assert.equal(saves[0].mode,'joint');assert.equal(saves[0].roomIds.length,7);assert.deepEqual(saves[0].teacherIds,['teacher-1','teacher-2']);assert.deepEqual(saves[0].cells,[])
  console.log('PASS: shared team saved for seven rooms across three levels')

  await page.setViewport({width:1440,height:1000});await open()
  await page.select(`${modal} select[aria-label="กิจกรรมที่จะกำหนด"]`,'guidance')
  await page.click(`${main} input[aria-label="เลือกทั้งชั้น ป.1"]`)
  await page.click(`${main} input[aria-label="เลือกห้อง ป.2/1"]`)
  await clickText(`${modal} .activity-team-modes b`,'ทีมแยกตามห้อง')
  await page.click(`${targets} input[aria-label="เลือกทั้งชั้น ป.1"]`)
  await chooseTeacher(1)
  assert.equal(await page.$eval(`${modal}>footer .prep-primary`,el=>el.disabled),true,'Unapplied teacher selection blocks final save')
  await page.click(`${modal} .activity-apply-team button`)
  await clickText(`${targets} button`,'ล้างการเลือก')
  await page.click(`${targets} input[aria-label="เลือกห้อง ป.2/1"]`)
  await chooseTeacher(2);await page.click(`${modal} .activity-apply-team button`)
  await page.click(`${modal} .activity-time-details summary`)
  await page.click(`${modal} .prep-activity-grid tbody td button`)
  await page.setViewport({width:390,height:844})
  await page.$eval(`${modal} .activity-per-room`,el=>el.scrollIntoView({block:'start'}))
  await page.screenshot({path:path.join(out,'mobile-separate.png'),fullPage:true})
  await page.setViewport({width:1440,height:1000})
  assert.equal(await page.$eval(`${modal}>footer .prep-primary`,el=>el.disabled),true,'Fixed same-period assignment cannot double-book a separate-room teacher')
  await page.click(`${modal} .prep-activity-grid tbody td button`)
  await clickText(`${modal} .activity-team-modes b`,'ทีมร่วม · จัดคาบพร้อมกัน')
  await page.waitForSelector(`${modal} .activity-mode-confirm`)
  assert.equal(await page.$eval(`${modal}>footer .prep-primary`,el=>el.disabled),true,'Mode merge requires explicit confirmation')
  await clickText(`${modal} .activity-mode-confirm button`,'คงทีมแยกตามห้อง')
  await page.click(`${main} input[aria-label="เลือกทั้งชั้น ป.1"]`)
  await page.click(`${main} input[aria-label="เลือกทั้งชั้น ป.1"]`)
  await page.click(`${main} input[aria-label="เลือกห้อง ป.1/3"]`)
  await save(2)
  const separate=saves[1]
  assert.equal(separate.mode,'separate');assert.deepEqual([...separate.roomIds].sort(),['room-1','room-2','room-4'])
  assert.deepEqual(separate.roomTeachers,{'room-1':['teacher-1'],'room-2':['teacher-1'],'room-4':['teacher-2']},'Bulk assignment preserves other rooms and prunes removed rooms')
  console.log('PASS: separate room teams saved with untouched teams preserved')

  const edit=await page.evaluateHandle(()=>[...document.querySelectorAll('.prep-activity-assigned li')].find(el=>el.textContent.includes('แนะแนว')).querySelector('.prep-row-edit'))
  await edit.asElement().click();await page.waitForSelector(modal)
  await clickText(`${modal} .activity-team-modes b`,'ทีมร่วม · จัดคาบพร้อมกัน')
  await clickText(`${modal} .activity-mode-confirm button`,'รวมเป็นทีมร่วม')
  await save(3)
  assert.equal(saves[2].mode,'joint');assert.deepEqual([...saves[2].teacherIds].sort(),['teacher-1','teacher-2'])
  await open();failPreview=true
  await page.click(`${modal}>footer .prep-primary`)
  await page.waitForFunction(()=>document.querySelector('.prep-activity-dialog[open] .prep-error')?.textContent.includes('ข้อผิดพลาดจำลอง'))
  assert.equal(saves.length,3)
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.editorDirty)
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'กำหนดกิจกรรม','Escape returns focus to opener')
  await page.goto(`http://127.0.0.1:${server.address().port}/?single=1`,{waitUntil:'domcontentloaded',timeout:60000})
  await page.setViewport({width:390,height:844});await open()
  await clickText(`${main} button`,'เลือกทุกห้อง')
  assert.equal(await page.$$eval(`${main} .activity-scope-level-head input:checked`,els=>els.length),6)
  assert.equal(await page.$$eval(`${main} details`,els=>els.length),0,'Single-room levels need no duplicate room expansion')
  await page.$eval(`${main}`,el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(out,'mobile-6-rooms.png'),fullPage:false})
  await page.keyboard.press('Escape')
  await page.goto(`http://127.0.0.1:${server.address().port}/?large=1`,{waitUntil:'domcontentloaded',timeout:60000})
  await page.setViewport({width:390,height:844});await open()
  await clickText(`${main} button`,'เลือกทุกห้อง')
  assert.equal(await page.$$eval(`${main} .activity-scope-rooms input:checked`,els=>els.length),63)
  assert.equal(await page.$$eval(`${main} details[open]`,els=>els.length),0,'Large levels start compact and can be expanded individually')
  assert.equal(await page.$$eval(`${modal} .activity-teacher-checks input`,els=>els.length),119)
  assert.equal(await page.$eval(modal,el=>el.scrollWidth<=el.clientWidth),true)
  await page.$eval(`${modal} .prep-team-dialog-body`,el=>el.scrollTop=0)
  await page.screenshot({path:path.join(out,'mobile-63-rooms.png'),fullPage:true})
  await page.keyboard.press('Escape');assert.equal(saves.length,3,'Large-school UI inspection never writes records')
  assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({school:'Synthetic 9-room school, 3 eligible teachers',multiLevelJointRooms:7,separateRoomTeams:separate.roomTeachers,saveCount:saves.length,previews:previews.length,explicitMerge:true,pendingTeamGuard:true,fixedTeacherConflictGuard:true,errorKeepsEditor:true,escapeRestoresFocus:true,responsiveWidths:[360,390,768,1024,1440],largeSchoolUiOnly:{rooms:63,teachers:119},consoleErrors:errors,productionWrites:0},null,2))
  console.log('PASS: multi-level/room selection, shared teachers, batch per-room assignment, pending guard, explicit team merge, preserved/deselected rooms, actual confirmation, error recovery, keyboard focus and five responsive widths; mock persistence only')
}catch(error){
  if(lastPage){await lastPage.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(await lastPage.evaluate(()=>({busy:window.editorBusy,dirty:window.editorDirty,modal:!!document.querySelector('.prep-activity-dialog[open]'),buttonDisabled:document.querySelector('.prep-activity-assign-tools .prep-primary')?.disabled,text:document.body.innerText})),null,2))}
  throw error
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}

