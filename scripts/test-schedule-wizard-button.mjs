// Real React wizard + real createScheduleDraft action/solver; isolated in-memory school data.
// No Supabase credentials, production records or authentication bypass routes are used.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import http from 'node:http'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'tmp','schedule-wizard-locks')
fs.mkdirSync(out,{recursive:true})
function load(file,deps={}){
  const exports={}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports,console,require:name=>{if(name==='server-only')return {};if(name in deps)return deps[name];throw Error(`Unexpected dependency ${name} in ${file}`)}})
  return exports
}
const schedules=load('lib/schedules.ts'),helpers=load('lib/schedule-helpers.ts',{'@/lib/schedules':schedules})
const teams=load('lib/schedule-activity-teams.ts'),solver=load('lib/schedule-solver.ts')
const planning=load('lib/schedule-planning.ts',{'./schedule-solver':solver,'./schedule-block-repair':load('lib/schedule-block-repair.ts')})
const verification=load('lib/schedule-verification.ts',{'./schedule-planning':planning})
const periods=[1,2,3,0,4,5,6].map((period,index)=>({period,label:period?`คาบ ${period}`:'พักกลางวัน',is_break:period===0,sort_order:index+1,start_time:`${String(index+8).padStart(2,'0')}:00`,end_time:`${String(index+9).padStart(2,'0')}:00`}))
const teachers=Array.from({length:20},(_,i)=>({id:`teacher-${i}`,prefix:'ครู',full_name:`ทดสอบ ${i+1}`,position:'ครู'}))
const classrooms=Array.from({length:6},(_,i)=>({id:`room-${i}`,level:`ป.${i+1}`,room:1}))
const names=['คณิตศาสตร์','วิทยาศาสตร์','ภาษาไทย','ภาษาอังกฤษ','สังคมศึกษา','สุขศึกษา','ศิลปะ','การงานอาชีพ','ประวัติศาสตร์','หน้าที่พลเมือง']
const lessons=classrooms.flatMap((room,r)=>names.map((name,s)=>({id:`lesson-${r}-${s}`,classroomId:room.id,teacherId:teachers[(r*3+s)%20].id,count:s===9?2:3,subjectId:`subject-${s}`,name,fullName:name,code:`TEST${r}${s}`,label:`${room.level}/1 · ${name}`,teacherName:teachers[(r*3+s)%20].full_name,sourceHours:(s===9?2:3)*40,roomName:'',activity:false})))
const group={id:'11111111-1111-4111-8111-111111111111',settingId:'activity-test',mode:'joint',roomIds:classrooms.map(r=>r.id),teacherIds:teachers.slice(0,2).map(t=>t.id),roomTeachers:{},weeklyPeriods:1,cells:[{day:5,period:6}]}
const plan={...planning.emptyPlan(),teacherIds:teachers.map(t=>t.id),activityGroups:[group],rules:Object.fromEntries(lessons.map(l=>[l.id,{count:l.count,pattern:Array(l.count).fill(1),roomId:null,morning:false,spread:true}]))}
let state={seed:0,slots:[],blocks:[]},drafts=[],createCalls=0,lastResult=null,lastElapsed=0,confirmCalls=0,discardCalls=0,checkCalls=0
const lessonKey=s=>s.activity_id?'activity:'+s.activity_id:s.class_subject_id
const db={
  rpc:async name=>{assert.equal(name,'schedule_snapshot');return {data:`fixture-${state.seed}`,error:null}},
  from(table){
    let inserted=null
    const q={select(){return q},eq(){return q},or(){return q},in(){return q},order(){return q},limit(){return q},
      insert(value){assert.equal(table,'schedule_drafts','The test must never write live timetable rows');inserted=value;return q},
      async single(){assert.ok(inserted);const id=`draft-${state.seed}-${drafts.length+1}`;drafts.push({id,...structuredClone(inserted)});return {data:{id},error:null}},
      async maybeSingle(){assert.equal(table,'schedule_plans');return {data:{config:structuredClone(plan)},error:null}},
      then(resolve,reject){const rows=table==='school_period_times'?periods:table==='users'?teachers:table==='evaluation_settings'?[{id:group.settingId,label:'กิจกรรมร่วม',short_label:'กิจกรรม',schedule_weekly_periods:1}]:null;assert.ok(rows,`Unexpected read ${table}`);return Promise.resolve({data:structuredClone(rows),error:null}).then(resolve,reject)}}
    return q
  }
}
const preparation=load('lib/schedule-preparation.ts',{
  'node:crypto':crypto,'./session':{getSession:async()=>({schoolId:'test-school',userId:'test-admin',role:'admin'})},
  './supabase':{createServerClient:()=>db},'./schedules':schedules,'./schedule-helpers':helpers,'./schedule-activity-teams':teams,
  './schedule-planning':planning,'./schedule-verification':verification,
  './schedule-store':{loadSchedule:async()=>structuredClone({classrooms,lessons,slots:state.slots}),loadScheduleConstraints:async()=>({blocks:structuredClone(state.blocks),blocksSupported:true}),lessonKey,lessonColumns:id=>({class_subject_id:id&&!id.startsWith('activity:')?id:null,activity_id:id?.startsWith('activity:')?id.slice(9):null})}
})
const actions=load('app/schedules/planning-actions.ts',{'@/lib/schedule-preparation':preparation,'@/lib/schedule-action-result':load('lib/schedule-action-result.ts'),'@/lib/schedule-input-server':{},'@/lib/schedule-classrooms':{}})
function rng(seed){let value=seed>>>0;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296}}
function shuffle(items,random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result}
function verify(result){
  assert.equal(result.status,'complete',JSON.stringify(result));assert.ok(result.id)
  assert.equal(result.rows.length,180,'All six rooms must have thirty periods')
  const allLessons=[...lessons,...result.activityLessons.map(l=>({...l,label:l.name,count:1,teacherId:null,teacherIds:group.teacherIds,activity:true,activityGroupId:group.id,teacherOptional:true,fixedOnly:true}))]
  const rows=result.rows.map(r=>({classroomId:r.classroom_id,lessonId:lessonKey(r),day:r.day_of_week,period:r.period}))
  assert.equal(verification.verifyCompleteSchedule(allLessons,rows,plan.days,periods,state.blocks).length,0)
  const occupied=new Set(),teacherCells=new Map()
  for(const row of rows){
    const key=`${row.day}:${row.period}`,roomKey=`${row.classroomId}:${key}`
    assert.notEqual(row.period,0);assert.ok(!occupied.has(roomKey));occupied.add(roomKey)
    const lesson=allLessons.find(l=>l.id===row.lessonId);assert.ok(lesson)
    for(const teacher of lesson.teacherIds||[lesson.teacherId]){
      assert.ok(!state.blocks.some(b=>b.teacherId===teacher&&b.day===row.day&&b.period===row.period),`Blocked teacher ${teacher} at ${key}`)
      const teacherKey=`${teacher}:${key}`,owner=lesson.activityGroupId||lesson.id
      assert.ok(!teacherCells.has(teacherKey)||teacherCells.get(teacherKey)===owner);teacherCells.set(teacherKey,owner)
    }
  }
  for(const fixed of state.slots)assert.ok(result.rows.some(r=>r.classroom_id===fixed.classroom_id&&r.day_of_week===fixed.day_of_week&&r.period===fixed.period&&lessonKey(r)===lessonKey(fixed)&&r.locked),'Locked subject moved')
  assert.equal(JSON.stringify(drafts.at(-1).before_rows),JSON.stringify(state.slots))
}
async function bundle(){
  const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
  const bridge=write('actions.js',`async function call(method,args){const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});if(!response.ok)throw Error(await response.text());return response.json()}
    export const fetchPreparation=(...args)=>call('fetchPreparation',args),createScheduleDraft=(...args)=>call('createScheduleDraft',args);
    export const checkPreparation=(...args)=>call('checkPreparation',args),confirmScheduleDraft=(...args)=>call('confirmScheduleDraft',args),discardScheduleDraft=(...args)=>call('discardScheduleDraft',args);
    export const saveScheduleTeachingAssignments=()=>{},savePreparation=()=>{};`)
  const noop=write('unused-panels.js','export default function Panel(){return null};export const savePeriodTimes=()=>{};')
  const entry=write('entry.js',`import React from 'react';import {createRoot} from 'react-dom/client';import Provider from ${JSON.stringify(path.join(root,'components/schedules/OnlineScheduleProvider.tsx'))};import Wizard from ${JSON.stringify(path.join(root,'components/schedules/SchedulePreparation.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Provider,null,React.createElement(Wizard,{yearId:'test-year',semester:2,initialStep:7,onChanged:()=>{}})));`)
  const tsLoader=write('typescript-loader.cjs',`const ts=require('typescript');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText}`)
  const cssLoader=write('css-loader.cjs',`module.exports=function(source){return 'const style=document.createElement("style");style.textContent='+JSON.stringify(source)+';document.head.appendChild(style);'}`)
  const aliases={'@/app/schedules/planning-actions$':bridge,'@/app/schedules/actions$':noop,'@':root}
  for(const panel of ['ScheduleDataInput','WizardPeriodEditor','ActivityTeamEditor','WorkloadEditor','ClassroomLevelEditor'])aliases[`./${panel}$`]=noop
  await new Promise((resolve,reject)=>{
    const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:aliases},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:tsLoader},{test:/\.css$/,use:cssLoader}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]})
    compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))
  })
}
async function main(){
  // Obtain a witness once, then withhold it from the solver. Random teacher blocks
  // are sampled from witness-free cells so each run is a feasible scheduling problem.
  const baseline=await actions.createScheduleDraft('test-year',2,classrooms.map(r=>r.id),true)
  assert.equal(baseline.error,null);assert.equal(baseline.data.status,'complete')
  const witness=baseline.data.rows,offeringIds=new Set(baseline.data.activityLessons.map(l=>l.id))
  drafts=[]
  await bundle()
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
      if(req.url==='/rpc'){
        let body='';for await(const chunk of req)body+=chunk
        const {method,args}=JSON.parse(body);assert.ok(['fetchPreparation','createScheduleDraft','checkPreparation','confirmScheduleDraft','discardScheduleDraft'].includes(method))
        const started=performance.now()
        let result
        if(method==='confirmScheduleDraft'){
          // UI confirmation writes only this isolated in-memory fixture. SQL atomicity
          // is exercised separately by the existing database test suite.
          assert.equal(args[0],drafts.at(-1).id);confirmCalls++
          state.slots=structuredClone(lastResult.data.rows)
          result={data:{committed:true},error:null}
        }else if(method==='discardScheduleDraft'){
          assert.equal(args[0],drafts.at(-1).id);discardCalls++
          result={data:null,error:null}
        }else{
          result=await actions[method](...args)
          if(method==='checkPreparation')checkCalls++
        }
        if(method==='createScheduleDraft'){createCalls++;lastResult=result;lastElapsed=performance.now()-started}
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return
      }
      if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ทดสอบจัดตาราง — ข้อมูลสมมติ</title><style>body{margin:0;padding:24px;background:#f4f7fc;font-family:"Leelawadee UI",Tahoma,sans-serif}button,input,select{font:inherit}button{cursor:pointer}#root{max-width:1240px;margin:auto}</style><div id="root"></div><script src="/bundle.js"></script></html>')
    }catch(error){res.writeHead(500);res.end(error.stack)}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  let browser
  try{
    const candidates=[process.env.SCHEDULE_TEST_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean)
    const executablePath=candidates.find(file=>fs.existsSync(file));assert.ok(executablePath,'Set SCHEDULE_TEST_BROWSER to an installed Chromium browser')
    browser=await puppeteer.launch({executablePath,headless:true,userDataDir:fs.mkdtempSync(path.join(out,'browser-profile-')),args:['--no-first-run','--no-default-browser-check','--disable-gpu']})
    const consoleErrors=[]
    const report=[]
    for(const [index,seed] of [104729,271828,314159,161803,20261023].entries()){
      const page=await browser.newPage()
      page.on('pageerror',error=>consoleErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
      const random=rng(seed),blocks=[]
      for(const teacher of teachers){
        const busy=new Set(witness.filter(row=>{const l=lessons.find(l=>l.id===lessonKey(row));return l?.teacherId===teacher.id||offeringIds.has(lessonKey(row))&&group.teacherIds.includes(teacher.id)}).map(row=>`${row.day_of_week}:${row.period}`))
        const free=plan.days.flatMap(day=>periods.filter(p=>!p.is_break&&!busy.has(`${day}:${p.period}`)).map(p=>({teacherId:teacher.id,day,period:p.period})))
        blocks.push(...shuffle(free,random).slice(0,5))
      }
      const locked=classrooms.map(room=>({...shuffle(witness.filter(row=>row.classroom_id===room.id&&row.class_subject_id),random)[0],locked:true}))
      state={seed,blocks,slots:locked};createCalls=0;lastResult=null
      const before=JSON.stringify(state.slots)
      await page.setViewport({width:index===4?390:1440,height:1000,deviceScaleFactor:1})
      await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:60_000})
      await page.waitForSelector('.prep-review-rebuild button[data-rebuild=true]')
      const clickButton=async text=>{const handle=await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(button=>button.textContent===text),text);assert.ok(handle.asElement(),`Missing button ${text}`);await handle.asElement().click()}
      if(index===0){
        await clickButton('ล้างการเลือก')
        assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='สร้างตารางฉบับร่าง').disabled),true)
        await page.click('.prep-review-room-picks input')
        assert.ok((await page.$eval('.prep-review-count',el=>el.textContent)).includes('1 / 6'))
        await clickButton('เลือกทั้งโรงเรียน')
        assert.ok((await page.$eval('.prep-review-count',el=>el.textContent)).includes('6 / 6'))
        await page.focus('.prep-review-conditions summary');await page.keyboard.press('Enter')
        assert.equal(await page.$eval('.prep-review-conditions',el=>el.open),true)
        await page.keyboard.press('Enter')
        await page.screenshot({path:path.join(out,'empty-desktop.png'),fullPage:true})
        await clickButton('ตรวจข้อมูลล่าสุด')
        await page.waitForSelector('.prep-review-status.is-success')
        assert.equal(checkCalls,1)
      }
      await page.click('.prep-review-rebuild button[data-rebuild=true]')
      const button=await page.evaluateHandle(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='สร้างตารางฉบับร่าง'))
      const started=performance.now();await button.asElement().click({clickCount:2})
      await page.waitForFunction(()=>document.body.textContent.includes('ฉบับร่างพร้อมตรวจ')&&!document.querySelector('.prep-review-working'),{timeout:60_000})
      const displayedMs=Math.round(performance.now()-started)
      assert.equal(createCalls,1,'Double click must create only one draft');assert.equal(lastResult.error,null)
      verify(lastResult.data);assert.equal(JSON.stringify(state.slots),before,'Generating must never change the live timetable')
      assert.ok(await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='บันทึกใช้ตารางนี้'&&!b.disabled)))
      assert.equal(new Set(blocks.map(b=>b.teacherId)).size,20)
      for(const room of classrooms){
        await page.select('.prep-draft select',room.id)
        assert.equal(await page.$$eval('.prep-draft .prep-slot:not(.prep-slot-empty)',cells=>cells.length),30,`Preview incomplete for ${room.id}`)
        assert.equal(await page.$$eval('.prep-draft .prep-slot-activity',cells=>cells.length),1)
      }
      await page.select('.prep-draft select',classrooms[0].id)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page must not overflow horizontally')
      if(index===4){
        for(const width of [360,390,768,1024,1440]){
          await page.setViewport({width,height:1000})
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`No page overflow at ${width}px`)
        }
        await page.setViewport({width:390,height:1000})
      }
      if(index===0||index===4)await page.screenshot({path:path.join(out,index===0?'desktop.png':'mobile.png'),fullPage:true})
      report.push({seed,teachers:20,teacherBlocks:blocks.length,lockedLessons:locked.length,classrooms:6,scheduled:lastResult.data.rows.length,actionMs:Math.round(lastElapsed),displayedMs,viewport:index===4?390:1440})
      fs.writeFileSync(path.join(out,`case-${seed}.json`),JSON.stringify({blocks,locked,rows:lastResult.data.rows},null,2))
      console.log('PASS:',JSON.stringify(report.at(-1)))
      if(index===0||index===1){
        await clickButton(index===0?'บันทึกใช้ตารางนี้':'ทิ้งฉบับร่าง')
        await page.waitForSelector('.swal2-confirm')
        await page.click('.swal2-confirm')
        if(index===0){
          await page.waitForFunction(()=>document.querySelector('.swal2-title')?.textContent==='บันทึกตารางแล้ว')
          await page.click('.swal2-confirm')
          assert.equal(confirmCalls,1);assert.equal(state.slots.length,180)
        }else{
          await page.waitForFunction(()=>!document.querySelector('.prep-draft')&&!document.querySelector('.prep-review-working'))
          assert.equal(discardCalls,1);assert.equal(JSON.stringify(state.slots),before,'Discarding must preserve original timetable')
        }
        await page.waitForFunction(()=>!document.querySelector('.prep-draft')&&!document.querySelector('.prep-review-working'))
      }
      await page.close()
    }
    assert.equal(consoleErrors.length,0,consoleErrors.join('\n'))
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({environment:'Real React wizard and create/check actions; isolated mock database; confirmation/discard RPC mocked in memory',results:report,confirmCalls,discardCalls,checkCalls,responsiveWidths:[360,390,768,1024,1440],consoleErrors},null,2))
    console.log('PASS: clicked real wizard button; twenty teachers randomly blocked in five seeded runs; six-room drafts complete; no class/teacher/lunch collisions; locks retained; save button displayed; duplicate-click guarded; desktop/mobile without page overflow; no browser errors')
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1})
