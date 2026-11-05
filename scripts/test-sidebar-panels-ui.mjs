// Real shell/sidebar with synthetic membership; no live account or backend writes.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'
import webpackPackage from 'next/dist/compiled/webpack/webpack.js'
const {webpack}=webpackPackage,root=process.cwd(),out=path.resolve('tmp/sidebar-panels-ui')
fs.mkdirSync(out,{recursive:true})
const write=(name,source)=>{const file=path.join(out,name);fs.writeFileSync(file,source);return file}
const nav=write('navigation.js',`import{useSyncExternalStore}from'react';const sub=f=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f)};export function usePathname(){return useSyncExternalStore(sub,()=>location.pathname,()=>'/phonoi/dashboard')}let value='',params=new URLSearchParams;export function useSearchParams(){usePathname();if(value!==location.search){value=location.search;params=new URLSearchParams(value)}return params}export function useRouter(){return{push:href=>history.pushState(null,'',href),replace:href=>history.replaceState(null,'',href),refresh(){}}}`)
const link=write('link.js',`import React from'react';export default function Link({prefetch,children,onClick,...props}){return React.createElement('a',{...props,onClick:event=>{onClick?.(event);if(!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();history.pushState(null,'',props.href)}}},children)}`)
const auth=write('auth.js','export async function logout(){}')
const entry=write('entry.tsx',`import React from'react';import{createRoot}from'react-dom/client';import Layout from ${JSON.stringify(path.join(root,'components/layout/LayoutClient.tsx'))};const params=new URLSearchParams(location.search),role=params.get('role')||'admin',free=params.has('free');for(const method of ['pushState','replaceState']){const original=history[method].bind(history);history[method]=(...args)=>{original(...args);window.dispatchEvent(new PopStateEvent('popstate'))}}createRoot(document.getElementById('root')).render(<Layout userRole={role} navRole={role} userFullName="ครูวิชาการ ทดสอบ" schoolCode={role==='district'?null:'phonoi'} schoolName="โรงเรียนบ้านโพธิ์น้อยหนองสิม" educationType={params.has('secondary')?'secondary':'primary'} hasSecondaryClasses={params.has('mixed')} isHomeroom={params.has('homeroom')} hasSchool membership={role==='district'?null:free?{kind:'individual',plan:'free',freeTeacherLimit:25}:{kind:'school',subscribedPackage:'school',startsOn:'2026-01-01',expiresOn:'2099-12-31'}} membershipAd={free?{title:'ผู้สนับสนุน',imageUrl:'/brand/jarnsek-logo-sm.png',href:null}:null}><section className="card" style={{padding:24}}><h1>พื้นที่ทำงานทดสอบเมนู</h1><p>เลือกหมวดจากแถบด้านซ้าย</p><button data-work type="button">เนื้อหาหน้า</button></section></Layout>)`)
const loader=write('loader.cjs',`const ts=require(${JSON.stringify(requirePath('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,esModuleInterop:true}}).outputText`)
function requirePath(name){return path.join(root,'node_modules',name)}
const css=write('css.cjs',`module.exports=s=>'const style=document.createElement("style");style.textContent='+JSON.stringify(s)+';document.head.appendChild(style);'`)
await new Promise((resolve,reject)=>{const compiler=webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'next/navigation':nav,'next/link':link,'@/lib/actions/auth':auth,'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:loader},{test:/\.css$/,use:css}]},plugins:[new webpack.DefinePlugin({'process.env.NODE_ENV':JSON.stringify('development')})]});compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()))})
const styles=['globals','screen-brand-colors','workspace-theme','workspace-controls','workspace-depth','ui-system'].map(name=>fs.readFileSync(`app/${name}.css`,'utf8').replace(/@import[^;]*;|@source[^;]*;/g,'')).join('\n')
const chunkDir=path.resolve('.next/static/chunks')
const fonts=fs.existsSync(chunkDir)?fs.readdirSync(chunkDir).filter(name=>name.endsWith('.css')).flatMap(name=>fs.readFileSync(path.join(chunkDir,name),'utf8').match(/@font-face\{font-family:(?:Sarabun|Kanit)[^}]+\}/g)||[]).join('\n').replaceAll('../media/','/_test-media/'):''
const server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(out,'bundle.js')));return}
  if(req.url?.startsWith('/brand/')||req.url?.startsWith('/fonts/')){const target=path.resolve('public','.'+req.url);if(fs.existsSync(target)){res.end(fs.readFileSync(target));return}res.writeHead(404);res.end();return}
  if(req.url?.startsWith('/_test-media/')){const target=path.join('.next/static/media',path.basename(req.url));if(fs.existsSync(target)){res.end(fs.readFileSync(target));return}res.writeHead(404);res.end();return}
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}${fonts}body{margin:0;--font-sarabun:Sarabun,sans-serif;--font-kanit:Kanit,sans-serif;font-family:Sarabun,sans-serif}.hidden{display:none}@media(min-width:1024px){.lg\\:hidden{display:none}}</style><div id="root"></div><script src="/bundle.js"></script></html>`)
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`,errors=[]
let browser,page
try{
  browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(out,'profile-')),args:['--no-first-run','--disable-gpu']})
  page=await browser.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>errors.push(e.message))
  const go=async(url,width=1440)=>{await page.setViewport({width,height:900});await page.goto(origin+url,{waitUntil:'domcontentloaded'});await page.waitForSelector('.sidebar-panel-body');await page.waitForFunction(()=>document.querySelector('.sidebar-link[aria-current=page]')||document.querySelector('.sidebar-panel-back'));await page.evaluate(()=>document.fonts.ready);if(width<1024){await page.click('.navbar-menu-button');await page.waitForFunction(()=>document.querySelector('.sidebar-open')?.getBoundingClientRect().left>=-1)}}
  const enter=label=>page.click(`.sidebar-panel-enter[aria-label="เปิดหมวด ${label}"]`)
  const heading=()=>page.$eval('.sidebar-panel-header strong',el=>el.textContent)
  const rootMenu=async()=>{if(await page.$('.sidebar-panel-home'))await page.click('.sidebar-panel-home');else if(await page.$('.sidebar-panel-back'))await page.click('.sidebar-panel-back');await page.waitForSelector('.sidebar-panel-body[data-root=true]')}
  await go('/phonoi/dashboard')
  assert.equal(await page.$('.sidebar-user-chip'),null,'Account card must not take sidebar space')
  await page.click('.navbar-user-button');await page.waitForSelector('.navbar-dropdown');await page.click('[data-work]');await page.waitForFunction(()=>!document.querySelector('.navbar-dropdown'))
  await page.$eval('.navbar-user-button',el=>el.focus());await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>document.activeElement?.classList.contains('membership-compare-button'));await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.classList.contains('navbar-user-button'))
  const labels=await page.$$eval('.sidebar-panel-body[data-root=true]>.sidebar-link',nodes=>nodes.map(el=>el.textContent.trim()))
  assert.equal(labels.at(-1),'ตั้งค่าโรงเรียน');assert.equal(labels.indexOf('ตารางเรียน / ตารางสอน'),labels.indexOf('วัดและประเมินผล')+1)
  assert.equal(await page.$('.sidebar-children'),null,'No nested accordion remains')
  const startUrl=page.url();await enter('วัดและประเมินผล');assert.equal(page.url(),startUrl,'Selecting a module does not navigate away from current work')
  await page.waitForFunction(()=>document.activeElement?.classList.contains('sidebar-panel-back'))
  assert.equal(await heading(),'วัดและประเมินผล');assert.equal(await page.$('.sidebar-panel-body[data-root=true]'),null)
  await page.click('.sidebar-panel-back');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='เปิดหมวด วัดและประเมินผล')
  await enter('ตารางเรียน / ตารางสอน');await enter('ตารางเรียนออนไลน์')
  assert.equal(await page.$$('a[href="/phonoi/schedules/substitute"]').then(v=>v.length),1)
  assert.equal(await page.$('a[href="/phonoi/schedules/device/substitute"]'),null,'Free does not mix into online panel')
  await page.click('a[href="/phonoi/schedules/substitute"]');await page.waitForFunction(()=>document.querySelector('a[aria-current=page]')?.getAttribute('href')==='/phonoi/schedules/substitute')
  assert.equal(await heading(),'ตารางเรียนออนไลน์');await rootMenu()
  await enter('ตารางเรียน / ตารางสอน');await enter('จัดตารางสอนฟรี')
  const originalHistory=await page.evaluate(()=>history.length)
  await page.click('a[href="/phonoi/schedules/device/class"]');await page.waitForFunction(()=>location.pathname==='/phonoi/schedules/device/class')
  await page.click('a[href="/phonoi/schedules/device/teaching"]');await page.waitForFunction(()=>location.pathname==='/phonoi/schedules/device/teaching')
  assert.equal(await page.evaluate(()=>history.length),originalHistory+2,'Free tabs each push one history entry')
  await page.goBack();await page.waitForFunction(()=>document.querySelector('a[aria-current=page]')?.getAttribute('href')==='/phonoi/schedules/device/class');assert.equal(await heading(),'จัดตารางสอนฟรี')
  await page.type('#workspace-menu-search','SGS');await page.waitForSelector('.sidebar-search-result');assert.equal(await page.$$('.sidebar-search-result').then(v=>v.length),1)
  await page.keyboard.press('Escape');await page.waitForSelector('.sidebar-panel-back');assert.equal(await heading(),'จัดตารางสอนฟรี')
  await page.type('#workspace-menu-search','SGS');await page.click('.sidebar-search-result');await page.waitForFunction(()=>location.pathname==='/phonoi/export/sgs');assert.equal(await heading(),'Export เอกสาร')
  await rootMenu();await enter('ติดตามและรายงาน');await enter('Export เอกสาร');await page.click('a[href="/phonoi/export/schedules"]');await page.waitForFunction(()=>location.pathname==='/phonoi/export/schedules');assert.equal(await heading(),'Export เอกสาร','Clicked route keeps the chosen parent when a destination exists in multiple modules')
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('a[href="/phonoi/export/schedules"][aria-current=page]');assert.equal(await heading(),'ตารางเรียนออนไลน์','Direct link opens its first canonical module')
  await go('/phonoi/schedules/class/manage');assert.equal(await page.$$('.sidebar-panel-leaf.is-active').then(nodes=>nodes.length),1,'Only the most specific leaf highlights')
  await go('/phonoi/settings/users/person-123');assert.equal(await page.$eval('.sidebar-panel-leaf.is-active',el=>el.getAttribute('href')),'/phonoi/settings/users')
  for(const width of [320,390,768,1024,1440]){
    await go('/phonoi/schedules/substitute',width);assert.equal(await heading(),'ตารางเรียนออนไลน์');await page.screenshot({path:path.join(out,`submenu-${width}.png`)})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Page overflow ${width}`)
    assert.equal(await page.$eval('.sidebar',el=>el.scrollWidth>el.clientWidth+1),false,`Sidebar overflow ${width}`)
    assert.equal(await page.$eval('.sidebar-nav',el=>el.scrollWidth>el.clientWidth+1),false,`Panel overflow ${width}`)
    await rootMenu();await page.screenshot({path:path.join(out,`root-${width}.png`)})
    if(width<1024){await enter('วัดและประเมินผล');await page.keyboard.press('Escape');await page.waitForSelector('.sidebar:not(.sidebar-open)');await page.waitForFunction(()=>document.activeElement?.classList.contains('navbar-menu-button'));await page.click('.navbar-menu-button');await page.waitForFunction(()=>document.querySelector('.sidebar-open')?.getBoundingClientRect().left>=-1)}
    if(width<1024)await page.click('.sidebar-close')
    assert.equal(await page.$eval('.navbar-user-button',el=>{const b=el.getBoundingClientRect(),title=document.querySelector('.navbar-title-group').getBoundingClientRect();return b.left>=title.right-1&&b.right<=innerWidth}),true,`Account stays visible without overlapping title ${width}`)
    await page.click('.navbar-user-button');await page.waitForSelector('.navbar-account-membership');assert.match(await page.$eval('.navbar-dropdown',el=>el.textContent),/ครูวิชาการ ทดสอบ.*ผู้ดูแลโรงเรียน/s)
    assert.equal(await page.$eval('.navbar-dropdown',el=>{const b=el.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight}),true,`Account popover bounds ${width}`)
    assert.equal(await page.$eval('.navbar-dropdown a',el=>el.getAttribute('href')),'/phonoi/settings/profile')
    await page.screenshot({path:path.join(out,`account-${width}.png`)})
    await page.click('.navbar-account-membership .membership-compare-button');await page.waitForSelector('.membership-upgrade[open]');assert.equal(await page.$('.navbar-dropdown'),null);await page.keyboard.press('Escape');await page.waitForSelector('.membership-upgrade:not([open])');assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('navbar-user-button')),true,'Closing pricing restores the account trigger')
  }
  await go('/phonoi/schedules/device/manage?free=1',390);assert.equal(await heading(),'จัดตารางสอนฟรี');assert.ok(await page.$('.membership-ad-sidebar'));assert.equal(await page.$('.sidebar-ad button'),null)
  await rootMenu();await enter('วัดและประเมินผล');await page.waitForSelector('.membership-upgrade[open]');assert.equal(new URL(page.url()).pathname,'/phonoi/schedules/device/manage','Paid module does not bypass Free membership')
  await page.keyboard.press('Escape');await page.waitForSelector('.membership-upgrade:not([open])')
  await go('/phonoi/dashboard?role=teacher');await enter('วัดและประเมินผล');assert.ok(await page.$('a[href="/phonoi/scores"]'));assert.equal(await page.$('a[href="/phonoi/settings/users"]'),null)
  await go('/phonoi/dashboard',390);await page.setViewport({width:390,height:568});await enter('ตั้งค่าโรงเรียน');await page.click('.sidebar-panel-back');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='เปิดหมวด ตั้งค่าโรงเรียน');assert.equal(await page.$eval('[aria-label="เปิดหมวด ตั้งค่าโรงเรียน"]',el=>{const box=el.getBoundingClientRect(),nav=el.closest('nav').getBoundingClientRect();return box.top>=nav.top&&box.bottom<=nav.bottom+1}),true,'Back focuses and reveals Settings even in a short viewport')
  await page.$eval('.sidebar-close',el=>el.focus());await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('sidebar-logout')),true,'Mobile focus remains inside the menu');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('sidebar-close')),true)
  await go('/phonoi/dashboard?secondary=1');assert.equal(await page.$('[aria-label="เปิดหมวด งานประจำชั้น"]'),null,'Secondary restrictions preserved')
  await rootMenu();assert.ok(await page.$('.sidebar-panel-body[data-root=true]>a[href="/phonoi/attendance/homeroom"]'),'Secondary homeroom attendance is a direct main-menu item');
  for(const role of ['admin','academic_head','teacher','principal']){await go('/phonoi/dashboard?secondary=1&role='+role);await rootMenu();assert.ok(await page.$('.sidebar-panel-body[data-root=true]>a[href="/phonoi/attendance/homeroom"]'),role+' main homeroom link')}
  await go('/phonoi/dashboard?mixed=1');await rootMenu();assert.ok(await page.$('a[href="/phonoi/attendance/homeroom"]'),'Opportunity-expansion school retains primary menus and gains homeroom');
  await go('/phonoi/dashboard');await rootMenu();assert.equal(await page.$('a[href="/phonoi/attendance/homeroom"]'),null,'Pure primary menus unchanged');
  await go('/phonoi/dashboard?secondary=1&free=1',390);await rootMenu();await page.click('a[href="/phonoi/attendance/homeroom"]');await page.waitForSelector('.membership-upgrade[open]');assert.equal(new URL(page.url()).pathname,'/phonoi/dashboard','Homeroom entry keeps paid-plan access checks');
  await go('/district/admins?role=district');assert.equal(await heading(),'สมาชิกและโรงเรียน');assert.ok(await page.$('a[href="/district/admins"][aria-current=page]'));assert.equal(await page.$('a[href^="/phonoi/"]'),null)
  assert.deepEqual(errors,[])
  console.log('PASS: compact account/plan in navbar, scoped profile/full membership/renewal, outside click and keyboard focus, 320–1440px popover/title bounds; actual sidebar drill-in/back/history, role/education menus, Free paid gating/advert')
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
