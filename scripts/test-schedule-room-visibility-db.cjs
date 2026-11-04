// Run the complete existing scheduling SQL fixture, then verify room archival.
const fs=require('node:fs'),Module=require('node:module'),path=require('node:path')
const file=path.resolve('scripts/test-schedule-planning-db.cjs'),m=new Module(file,module)
m.filename=file;m.paths=module.paths
m._compile(fs.readFileSync(file,'utf8').replace('await db.close()',"await require('./verify-schedule-room-visibility-db.cjs')(db,id);await db.close()").replace('console.error(e);','console.error(e.message,e.where,e.detail);'),file)
