// Reuse the established complete SQL schema/constraint regression, then exercise
// the document migration against real populated tables in the same PGlite DB.
const fs=require('node:fs');let source=fs.readFileSync('scripts/test-schedule-planning-db.cjs','utf8');
if(!source.includes('  await db.close()'))throw Error('Missing SQL fixture completion');
source=source.replace('  await db.close()',()=>"  await require(require('node:path').resolve('scripts/verify-substitute-isolation-db.cjs'))(db,id)\n  await db.close()");
new Function('require',source)(require);
