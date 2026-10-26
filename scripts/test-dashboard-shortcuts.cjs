// Check real role-specific shortcuts against implemented routes, not placeholders.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path'),assert=require('node:assert/strict')
const api={}
const source=ts.transpileModule(fs.readFileSync('app/(shell)/dashboard/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
vm.runInNewContext(source+';exports.shortcuts=getQuickLinks;',{exports:api,require:name=>name==='react/jsx-runtime'?require(name):{}})
for(const role of ['district','admin','principal','academic_head','deputy_principal','homeroom','teacher']){
 const links=api.shortcuts(role)
 assert.ok(links.length>0)
 assert.equal(new Set(links.map(l=>l.href)).size,links.length,'No repeated destinations for '+role)
 for(const link of links){
  const file=path.join('app/(shell)',link.href,'page.tsx')
  assert.ok(fs.existsSync(file),'Missing page '+link.href)
  assert.ok(!fs.readFileSync(file,'utf8').includes('ComingSoon'),'Shortcut points to placeholder: '+link.href)
  if(role!=='district')assert.ok(!link.href.startsWith('/district'),'School shortcut must not grant district navigation')
  if(['principal','teacher','homeroom'].includes(role))assert.notEqual(link.href,'/schedules/class/manage','View-only role must not get manage shortcut')
 }
}
console.log('PASS: seven dashboard roles, unique existing destinations, no ComingSoon links, school/district separation and correct schedule view/manage shortcuts')
