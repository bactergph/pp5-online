// Exercise the real request/proxy responses and Next.js matcher, plus the shipped archive.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript')
require('next/dist/server/node-environment')
const { NextRequest } = require('next/server')
const testing = require('next/experimental/testing/server')
const matches = testing.unstable_doesProxyMatch || testing.unstable_doesMiddlewareMatch
const { unzipSync } = require('fflate')
function load(file, deps = {}) {
  const api = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports: api, URL, Headers, require(name) { assert.ok(name in deps, 'Unmocked import: ' + name); return deps[name] },
  })
  return api
}
const paths = load('lib/school-path.ts')
const { default: proxy, config } = load('proxy.ts', { 'next/server': require('next/server'), '@/lib/school-path': paths })
const url = '/downloads/jarnsek-sgs-extension.zip'
assert.equal(paths.isSchoolCodeSegment('downloads'), false)
assert.equal(paths.schoolCodeFromPathname(url), null)
assert.equal(paths.withSchoolPrefix('phonoi', url), url)
assert.equal(paths.withSchoolPrefix('seka', url + '?version=1'), url + '?version=1')
assert.equal(paths.withSchoolPrefix('phonoi', '/export/sgs'), '/phonoi/export/sgs')
assert.equal(paths.isSchoolCodeSegment('downloads-school'), true, 'Only the exact global namespace is reserved')
for (const cookie of ['', 'session=synthetic-cookie']) {
  for (const path of ['/downloads', url, url + '?version=1']) {
    assert.equal(matches({ config, nextConfig: {}, url: path, cookies: cookie ? { session: 'synthetic-cookie' } : {} }), false)
    const response = proxy(new NextRequest('https://example.test' + path, { headers: cookie ? { cookie } : {} }))
    assert.equal(response.headers.get('location'), null, 'Download must never redirect to a school login')
    assert.equal(response.headers.get('x-middleware-rewrite'), null, 'Download must never rewrite to another route')
    assert.equal(response.headers.get('x-middleware-next'), '1')
  }
}
for (const path of ['/export/sgs', '/phonoi/export/sgs', '/scores/private.zip', '/phonoi/export/private.zip', '/downloads-school/scores']) {
  assert.equal(matches({ config, nextConfig: {}, url: path }), true, 'Protected URLs remain covered: ' + path)
  const response = proxy(new NextRequest('https://example.test' + path))
  assert.ok(response.headers.get('location')?.endsWith('/login'), 'Anonymous protected access still redirects: ' + path)
}
const schoolResponse = proxy(new NextRequest('https://example.test/phonoi/export/sgs', { headers: { cookie: 'session=synthetic-cookie' } }))
assert.equal(new URL(schoolResponse.headers.get('x-middleware-rewrite')).pathname, '/export/sgs')
assert.equal(paths.schoolCodeFromPathname('/phonoi/export/sgs'), 'phonoi')

const archive = fs.readFileSync('public' + url)
assert.equal(archive.readUInt32LE(0), 0x04034b50)
const files = unzipSync(archive)
assert.equal(JSON.parse(Buffer.from(files['manifest.json']).toString()).manifest_version, 3)
for (const name of ['manifest.json', 'service-worker.js', 'core.js', 'panel.js', 'README.md']) {
  assert.equal(Buffer.compare(Buffer.from(files[name]), fs.readFileSync('extensions/jarnsek-sgs/' + name)), 0, name + ' must match the extension source')
}
for (const size of [16, 32, 48, 128]) assert.ok(files[`icons/${size}.png`]?.length)
assert.ok(files['PRIVACY.txt']?.length)
for (const file of ['app/(shell)/export/sgs/page.tsx', 'components/SGSExportDialog.tsx']) {
  assert.ok(fs.readFileSync(file, 'utf8').includes(`href="${url}" download`), 'Both entry points use the global download URL')
}
console.log('PASS: SGS ZIP stays public with/without session, Next matcher skips only /downloads, school/export protection remains intact, and the ZIP is readable and matches the extension source')
