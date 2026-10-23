// Real report component, synthetic school and mocked server actions only.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const { webpack } = webpackPackage, root = process.cwd(), out = path.resolve('tmp/schedule-workload-ui')
fs.mkdirSync(out, { recursive: true })
const write = (name, content) => { const p = path.join(out, name); fs.writeFileSync(p, content); return p }
const rows = Array.from({ length: 12 }, (_, i) => ({ id: 't' + i, name: `ครูตัวอย่าง${i + 1} ใจดี`, position: i % 2 ? 'ครู' : 'ครูชำนาญการ', hours: 10 + i * 7 % 17, subject_hours: 18, activity_hours: 1, scheduled_hours: i % 3 ? 12 : 19, remaining: i % 3 ? 7 : 0, note: i === 0 ? 'ตัวอย่างหมายเหตุ' : '' }))
const years = [{ id: 'year', year_be: 2569, is_active: true, term2_start_date: '2020-01-01', term2_end_date: '2099-12-31' }]
let failNext = false, failInit = false, noYears = false
const calls = []
const bridge = write('actions.js', `async function call(method,args){const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});const result=await r.json();if(!r.ok)throw Error(result.error);return result}export const fetchScheduleInit=(...args)=>call('init',args),fetchScheduleWorkload=(...args)=>call('report',args),fetchScheduleExportContext=(...args)=>call('context',args);`)
const queue = write('queue.js', `export async function enqueueFileExport(job){window.exportJob={fileName:job.fileName};await job.run()}`)
const pdf = write('pdf.js', `export async function buildWorkloadPdfBlob(input){window.exportedReport=input;return {blob:new Blob(['test']),fileName:input.fileName}}`)
const entry = write('entry.js', `import React from'react';import{createRoot}from'react-dom/client';import Report from ${JSON.stringify(path.join(root, 'components/schedules/ScheduleWorkloadEntry.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Report));`)
const loader = write('loader.cjs', `const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
const css = write('css.cjs', `module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style)'`)
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: 'development', devtool: false, entry, output: { path: out, filename: 'bundle.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@/app/schedules/actions$': bridge, '@/lib/pdf/pdf-export-queue$': queue, '@/lib/jspdf-schedules$': pdf, '@': root } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }, { test: /\.css$/, use: css }] }, plugins: [new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('development') })] })
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()))
})
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(out, 'bundle.js'))); return }
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return }
    if (req.url === '/rpc') {
      let body = ''; for await (const part of req) body += part
      const { method, args } = JSON.parse(body); calls.push({ method, args }); res.setHeader('Content-Type', 'application/json')
      if (method === 'init') {
        if (failInit) { failInit = false; res.writeHead(500); res.end(JSON.stringify({ error: 'โหลดปีการศึกษาไม่สำเร็จจำลอง' })); return }
        res.end(JSON.stringify({ years: noYears ? [] : years })); return
      }
      if (method === 'context') { res.end(JSON.stringify({ school: { name: 'โรงเรียนข้อมูลสมมติ' } })); return }
      assert.equal(method, 'report'); assert.equal(args[0], 'year')
      const failure = failNext; failNext = false
      await new Promise(resolve => setTimeout(resolve, args[1] === 1 ? 700 : 160))
      if (failure) { res.writeHead(500); res.end(JSON.stringify({ error: 'เครือข่ายขัดข้องจำลอง' })); return }
      res.end(JSON.stringify(args[1] === 2 ? rows : rows.map(row => ({ ...row, name: 'ภาคหนึ่ง' + row.name })))); return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Tahoma,sans-serif;background:#f4f7fc}button,input,select{font:inherit}</style><div id="root"></div><script src="/bundle.js"></script></html>')
  } catch (error) { res.writeHead(500); res.end(JSON.stringify({ error: error.message })) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, userDataDir: fs.mkdtempSync(path.join(out, 'profile-')), args: ['--no-first-run', '--disable-gpu'] })
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message))
  const url = `http://127.0.0.1:${server.address().port}`, ready = () => page.waitForFunction(() => document.querySelector('.workload-report-card')?.getAttribute('aria-busy') === 'false' && !!document.querySelector('tbody th'))
  const click = async text => { const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text), text); assert.ok(handle.asElement(), text); await handle.asElement().click() }
  await page.setViewport({ width: 1440, height: 1000 }); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await ready(); assert.equal(await page.$eval('#workload-semester', el => el.value), '2'); assert.equal(calls.find(call => call.method === 'report').args[1], 2)
  assert.equal(await page.$$eval('tbody th', els => els.length), 12)
  assert.deepEqual(await page.$$eval('thead th', els => els.map(el => el.textContent)), ['ลำดับ','ชื่อ-นามสกุล','ภาระงานคาบ/สัปดาห์','หมายเหตุ'])
  const expected = [...rows].sort((a,b) => b.hours-a.hours || a.name.localeCompare(b.name,'th'))
  assert.deepEqual(await page.$$eval('tbody th', els => els.map(el => el.textContent)), expected.map(row => row.name))
  assert.deepEqual(await page.$$eval('tbody tr td:first-child', els => els.map(el => Number(el.textContent))), Array.from({length:12},(_,i)=>i+1))
  assert.deepEqual(await page.$$eval('tbody tr td:nth-child(3)', els => els.map(el => Number(el.textContent))), expected.map(row => row.hours))
  assert.ok((await page.$eval('tbody', el => el.textContent)).includes('ตัวอย่างหมายเหตุ'))
  assert.ok(!(await page.$eval('main', el => el.textContent)).match(/จัดแล้ว|คงเหลือ|กำหนดไว้|ครูชำนาญการ/))
  await page.type('#workload-search', 'ครู ตัวอย่าง1'); assert.equal(await page.$$eval('tbody th', els => els.length), 4)
  await click('บันทึก PDF'); await page.waitForFunction(() => window.exportedReport?.rows.length === 4)
  assert.ok((await page.evaluate(() => window.exportedReport.title)).includes('ภาคเรียนที่ 2'))
  const exported=await page.evaluate(() => window.exportedReport.rows)
  assert.deepEqual(exported.map(row=>row.hours), [...exported].sort((a,b)=>b.hours-a.hours).map(row=>row.hours))
  assert.ok(exported.every(row=>Object.keys(row).sort().join(',')==='hours,name,note'))
  await page.$eval('#workload-search', el => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })
  failNext = true; await click('โหลดข้อมูลล่าสุด'); await page.waitForSelector('[role=status]'); assert.equal(await page.$eval('.workload-report-primary', el => el.disabled), true)
  await page.waitForSelector('[role=alert]'); assert.ok((await page.$eval('[role=alert]', el => el.textContent)).includes('เครือข่ายขัดข้องจำลอง'))
  await click('ลองใหม่'); await ready(); await page.waitForSelector('[role=alert]', { hidden: true })
  await page.select('#workload-semester', '1'); await page.waitForFunction(() => document.querySelector('.workload-report-card')?.getAttribute('aria-busy') === 'true'); await page.select('#workload-semester', '2'); await ready()
  await new Promise(resolve => setTimeout(resolve, 850)); assert.ok(!(await page.$eval('tbody', el => el.textContent)).includes('ภาคหนึ่ง'), 'Stale term response must not replace the current report')
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewport({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}`)
    if (width === 1440 || width === 390) await page.screenshot({ path: path.join(out, width === 1440 ? 'desktop.png' : 'mobile.png'), fullPage: true })
  }
  failInit = true; await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForSelector('[role=alert]'); await click('ลองใหม่'); await ready()
  noYears = true; const count = calls.filter(call => call.method === 'report').length; await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('ยังไม่มีปีการศึกษาให้แสดงรายงาน')); assert.equal(calls.filter(call => call.method === 'report').length, count)
  assert.deepEqual(errors, [])
  console.log('PASS: four-column workload UI; full names and weekly periods sorted descending; remarks; filtered PDF parity; loading/error/retry; stale term protection; empty years; desktop/mobile at five widths')
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
