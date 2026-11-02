const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),postcss=require('postcss')
const cache={}
function load(file){const abs=path.resolve(file);if(cache[abs])return cache[abs];const exports={};cache[abs]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>load(path.resolve(path.dirname(abs),name+'.ts'))});return exports}
const {workspaceGuidance}=load('lib/workspace-guidance.ts'),routes=[]
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.name==='page.tsx')routes.push('/'+path.relative('app/(shell)',path.dirname(file)).split(path.sep).join('/'))}}
walk('app/(shell)')
const views=['manage','class','teaching','substitute','period-times','conflicts','workload','print']
const concrete=routes.filter(route=>!route.includes('[')).concat(views.map(view=>'/schedules/device/'+view))
assert.ok(routes.length>=87,'Keep every physical workspace page in the audit')
for(const route of concrete){const result=workspaceGuidance(route);assert.ok(result,route+' needs guidance');assert.equal(result.steps.length,3,route);assert.ok(result.purpose.length>8);for(const school of ['seka','demo-school'])assert.deepEqual(workspaceGuidance('/'+school+route,school),result,route+' school prefix');assert.deepEqual(workspaceGuidance(route+'/?year=2569#details'),result)}
for(const view of views)assert.ok(workspaceGuidance('/schedules/device/'+view).note.includes('ข้อมูลอยู่ในอุปกรณ์นี้'))
assert.ok(workspaceGuidance('/schedules/substitute').note.includes('ไม่เปลี่ยนตารางสอนจริง'))
assert.ok(workspaceGuidance('/district/subjects').note.includes('แม่แบบของระบบ'))
assert.ok(workspaceGuidance('/export/sgs').note.includes('ตรวจคะแนนใน SGS ทุกครั้ง'))
for(const route of ['/login','/register','/unknown/route','/scores-other','/schedules-other'])assert.equal(workspaceGuidance(route),null,route+' must not receive an invented guide')
assert.equal(workspaceGuidance('/other-school/scores','seka'),null,'Do not strip a different school prefix')
const css=postcss.parse(fs.readFileSync('app/ui-system.css','utf8'))
assert.ok(css.nodes.every(node=>node.type==='comment'||node.type==='atrule'&&node.name==='media'&&node.params==='screen'),'The interaction layer must not change printed documents')
const lum=hex=>{const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]}
for(const [ink,bg]of [['#146744','#eef9f2'],['#805014','#fff8e8'],['#a72135','#fff2f4'],['#ffffff','#146744'],['#ffffff','#a72135'],['#ffffff','#245ed4']])assert.ok((Math.max(lum(ink),lum(bg))+.05)/(Math.min(lum(ink),lum(bg))+.05)>=4.5,ink+' contrast')
fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/ui-system-route-audit.json',JSON.stringify(concrete.map(route=>({route,...workspaceGuidance(route)})),null,2))
console.log('PASS: '+routes.length+' workspace pages and all device views; school isolation, local backup/substitute/SGS notices, accessible status/button contrast, screen-only interaction styles')
