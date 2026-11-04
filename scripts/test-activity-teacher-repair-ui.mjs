import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
let scaffold=fs.readFileSync('scripts/test-schedule-activity-edits-ui.mjs','utf8').split('let browser')[0]
scaffold=scaffold.replace("tmp/activity-edits-ui","tmp/activity-teacher-repair-ui")
const marker="const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/schedule-activity-edits.json','utf8'))"
scaffold=scaffold.replace(marker,marker+";const ghost='00000000-0000-4000-8000-000000099999';fixture.teacherIds=[...fixture.teachers.map(t=>t.id),ghost];fixture.activities[0].teacherIds=[...fixture.activities[0].teacherIds,ghost]")
const body=`
let browser
try{
 browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu','--no-proxy-server']})
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>r.abort());await page.setContent('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;padding:14px;font-family:Tahoma}*{box-sizing:border-box}</style><div id="root"></div>',{waitUntil:'domcontentloaded'});await page.addScriptTag({content:fs.readFileSync(path.join(out,'bundle.js'),'utf8')})
 const click=async text=>{const button=await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t),text);assert.ok(button.asElement(),text);await button.asElement().click()}
 await page.waitForFunction(()=>document.body.textContent.includes('พบรายชื่อครูเดิมที่ใช้ไม่ได้ 1 รายการ'))
 const before=await page.evaluate(()=>JSON.stringify({slots:window.read().terms[2].timetable,subjects:window.read().terms[2].subjects,teachers:window.read().terms[2].teachers,other:window.read().terms[1]}))
 for(const width of [360,390,1440]){await page.setViewport({width,height:1000});assert.equal(await page.$eval('.prep-activity-teams',el=>el.scrollWidth>el.clientWidth+1),false,'Repair panel overflow '+width)}
 await click('ปรับปรุงรายชื่อครูกิจกรรม');await page.waitForSelector('.swal2-cancel');await page.click('.swal2-cancel');assert.equal(await page.evaluate(()=>window.writes),0)
 await click('ปรับปรุงรายชื่อครูกิจกรรม');await page.waitForSelector('.swal2-confirm');await page.click('.swal2-confirm');await page.waitForFunction(()=>window.writes===1&&!document.body.textContent.includes('พบรายชื่อครูเดิมที่ใช้ไม่ได้ 1 รายการ'))
 assert.equal(await page.evaluate(()=>JSON.stringify({slots:window.read().terms[2].timetable,subjects:window.read().terms[2].subjects,teachers:window.read().terms[2].teachers,other:window.read().terms[1]})),before)
 assert.ok(await page.evaluate(()=>!JSON.stringify(window.read().terms[2].activities).includes('00000000-0000-4000-8000-000000099999')))
 assert.deepEqual(errors,[]);console.log('PASS: actual stale-team warning, mobile layouts, cancel/no write, confirmed repair/reload, retained teachers/subjects/slots/locks/other term')
}finally{if(browser)await browser.close()}
`
const file=path.resolve('tmp/activity-teacher-repair-fixture.mjs');fs.writeFileSync(file,scaffold+body);await import(pathToFileURL(file).href)
