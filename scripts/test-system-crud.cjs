// Runs every repository regression script in a safe fixture-only environment.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const mode = process.argv.includes('--ui') ? 'ui' : 'unit'
const selected = process.argv.find(value => value.startsWith('--only='))?.slice(7).split(',')
const batch = selected ? require('node:crypto').createHash('sha1').update(selected.join(',')).digest('hex').slice(0, 10) : 'all'
const out = path.resolve('tmp/system-crud-audit', mode, batch)
fs.mkdirSync(out, { recursive: true })
const tests = fs.readdirSync('scripts').filter(name => /^test-.*\.(cjs|mjs)$/.test(name)
  && !['test-system-crud.cjs', 'test-system-network-guard.cjs'].includes(name)
  && (/puppeteer|playwright/.test(fs.readFileSync(path.join('scripts', name), 'utf8')) === (mode === 'ui'))
  && (!selected || selected.includes(name))).sort()
const results = []
;(async () => {
  for (const test of tests) {
    const started = Date.now(), logFile = path.join(out, test + '.log'), stream = fs.openSync(logFile, 'w')
    const env = { ...process.env }
    for (const key of Object.keys(env)) if (/supabase|token|password|secret|api_key/i.test(key)) delete env[key]
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, ['--require', path.resolve('scripts/test-system-network-guard.cjs'), path.join('scripts', test)], { env, stdio: ['ignore', stream, stream], windowsHide: true })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill() }, mode === 'ui' ? (test==='test-free-schedule-ui.mjs'?600000:300000) : 120000)
      child.on('error', error => { clearTimeout(timer); resolve({ status: 'error', error: error.message }) })
      child.on('exit', code => { clearTimeout(timer); resolve({ status: timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail', code }) })
    })
    fs.closeSync(stream)
    results.push({ test, ...result, finishedAt:new Date().toISOString(), seconds: Math.round((Date.now() - started) / 100) / 10, log: path.relative(process.cwd(), logFile) })
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2))
    console.log(`${result.status.toUpperCase()} ${test} (${results.at(-1).seconds}s)`)
  }
  const failed = results.filter(result => result.status !== 'pass')
  console.log(JSON.stringify({ mode, total: results.length, passed: results.length - failed.length, failed: failed.map(result => result.test) }))
  if (failed.length) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
