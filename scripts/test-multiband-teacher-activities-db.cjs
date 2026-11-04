const fs=require('node:fs')
let source=fs.readFileSync('scripts/test-schedule-planning-db.cjs','utf8')
source=source.replace('  await db.close()',"  await require(require('node:path').resolve('scripts/verify-multiband-teacher-activities-db.cjs'))(db,id)\n  await db.close()")
new Function('require',source)(require)
