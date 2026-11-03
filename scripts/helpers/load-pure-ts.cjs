// Load real pure TypeScript dependencies in VM fixtures, avoiding stale empty mocks.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const cache=new Map(),root=path.resolve('lib')+path.sep
module.exports=function load(file){
 const full=path.resolve(file)
 if(!full.startsWith(root))throw Error('Pure fixture dependency outside lib: '+file)
 if(cache.has(full))return cache.get(full)
 const exports={};cache.set(full,exports)
 const code=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 vm.runInNewContext(code,{exports,crypto,structuredClone,AbortController,Date,Error,console,performance,TextEncoder,require:name=>{
  if(name.startsWith('.'))return load(path.resolve(path.dirname(full),name+'.ts'))
  if(name.startsWith('@/lib/'))return load(path.resolve(name.slice(2)+'.ts'))
  throw Error('Pure fixture must mock external dependency: '+name)
 }})
 return exports
}
