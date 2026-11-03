import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const { webpack } = webpackPackage, root = process.cwd(), out = path.resolve('tmp/classroom-teachers-ui')
fs.mkdirSync(out, { recursive: true })
const write = (name, source) => { const file = path.join(out, name); fs.writeFileSync(file, source); return file }
const bridge = write('actions.js', `const call=async(method,args)=>(await fetch('/rpc',{method:'POST',body:JSON.stringify({method,args})})).json();${['fetchClassroomInit','fetchClassroomTeachers','fetchClassrooms','saveClassroom','deleteClassroom','setupClassroomsForYear','saveSchoolEducationType'].map(name => `export const ${name}=(...args)=>call('${name}',args);`).join('')}`)
const nav = write('navigation.js', 'export const useRouter=()=>({refresh(){}})')
const empty = write('empty.js', 'export default function Component(){return null}')
const entry = write('entry.js', `import React from 'react';import{createRoot}from'react-dom/client';import Manager from ${JSON.stringify(path.join(root, 'components/settings/ClassroomManager.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(Manager,{mode:'homeroom'}))`)
const loader = write('loader.cjs', `const ts=require('typescript');module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText`)
const css = write('css.cjs', `module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style)'`)
await new Promise((resolve, reject) => {
  const compiler = webpack({ mode: 'development', devtool: false, entry, output: { path: out, filename: 'bundle.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@/app/classrooms/actions': bridge, 'next/navigation': nav, '@/components/classroom-admin/PersonalHomeroomPanel': empty, '@': root } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }, { test: /\.css$/, use: css }] }, plugins: [new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('development') })] })
  compiler.run((error, stats) => compiler.close(() => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()))
})
const teachers = [
  { id: 'owner', prefix: 'นาย', full_name: 'เจ้าของบัญชี', is_homeroom: false },
  { id: 'draft1', prefix: 'นางสาว', full_name: 'ครูบุคลากร หนึ่ง', is_homeroom: true },
  { id: 'draft2', prefix: 'นาง', full_name: 'ครูเพิ่มภายหลัง สอง', is_homeroom: true },
]
const room = { id: 'room', level: 'ป.1', room: 1, academic_year_id: 'year', student_count: 10, homeroom_teacher_id: 'draft2', homeroom_teacher2_id: null }
const saved = []; let fail = false, refreshes = 0
const styles = ['globals', 'workspace-theme', 'workspace-controls', 'ui-system'].map(name => fs.readFileSync(`app/${name}.css`, 'utf8').replace(/@import[^;]*;|@source[^;]*;/g, '')).join('\n')
const server = http.createServer(async (req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(out, 'bundle.js'))); return }
  if (req.url === '/rpc') {
    let raw = ''; for await (const chunk of req) raw += chunk
    const { method, args } = JSON.parse(raw); let result = { error: null }
    if (method === 'fetchClassroomInit') result = { years: [{ id: 'year', year_be: 2569, is_active: true }], teachers: teachers.slice(0, 2), canManage: true, activeYearId: 'year', classrooms: [room], educationType: 'primary' }
    if (method === 'fetchClassrooms') result = [room]
    if (method === 'fetchClassroomTeachers') { refreshes++; await new Promise(resolve => setTimeout(resolve, 120)); if (fail) { res.writeHead(500); res.end('offline'); return } result = teachers }
    if (method === 'saveClassroom') { saved.push(args); Object.assign(room, args[1]) }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); return
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(`<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}body{margin:0;padding:16px;font-family:Tahoma,sans-serif}</style><div id="root"></div><script src="/bundle.js"></script></html>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser
try {
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, userDataDir: fs.mkdtempSync(path.join(out, 'profile-')), args: ['--no-first-run', '--disable-gpu'] })
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message))
  const click = async (selector, text) => { const handle = await page.evaluateHandle((s, t) => [...document.querySelectorAll(s)].find(el => el.getClientRects().length && el.textContent.includes(t)), selector, text); assert.ok(handle.asElement(), text); await handle.asElement().click() }
  page.setDefaultNavigationTimeout(120000)
  await page.setViewport({ width: 1440, height: 900 }); await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.classroom-modern table button')
  await click('button', 'แก้ไข'); await page.waitForFunction(() => !document.querySelector('select[name=homeroom_teacher_id]')?.disabled)
  assert.equal(await page.$eval('select[name=homeroom_teacher_id]', el => el.options.length), 4)
  assert.equal(await page.$eval('select[name=homeroom_teacher_id]', el => el.value), 'draft2', 'Async list refresh retains the assigned teacher')
  await page.select('select[name=homeroom_teacher_id]', 'draft1'); await page.select('select[name=homeroom_teacher2_id]', 'draft2')
  await page.setViewport({ width: 390, height: 844 }); await page.screenshot({ path: path.join(out, 'homeroom-picker-390.png'), fullPage: true })
  await click('form button[type=submit]', 'บันทึก'); await page.waitForSelector('select[name=homeroom_teacher_id]', { hidden: true })
  assert.equal(saved[0][1].homeroom_teacher_id, 'draft1'); assert.equal(saved[0][1].homeroom_teacher2_id, 'draft2')
  // Dismiss success before testing refresh failure and retry.
  await page.waitForSelector('.app-alert-actions button'); await page.click('.app-alert-actions button'); await page.waitForSelector('.app-alert-card', { hidden: true })
  fail = true; await click('button', 'แก้ไข'); await page.waitForFunction(() => document.querySelector('form [role=alert]')?.textContent.includes('โหลดรายชื่อครูไม่สำเร็จ'))
  assert.equal(await page.$eval('form button[type=submit]', el => el.disabled), true)
  fail = false; await click('button', 'อัปเดตรายชื่อ'); await page.waitForFunction(() => !document.querySelector('select[name=homeroom_teacher_id]').disabled)
  assert.equal(await page.$eval('select[name=homeroom_teacher_id]', el => el.value), 'draft1'); assert.ok(refreshes >= 3); assert.deepEqual(errors, [])
  console.log('PASS: production homeroom picker, both personnel selections, refreshed default selection, save, mobile, blocked failed loads and retry')
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
