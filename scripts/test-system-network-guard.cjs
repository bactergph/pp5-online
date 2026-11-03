// Regression tests may use fixture servers on loopback, never production services.
const http = require('node:http')
const https = require('node:https')
const { syncBuiltinESMExports } = require('node:module')
function local(value) {
  if (typeof value === 'string' || value instanceof URL) {
    try { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(value).hostname) } catch { return false }
  }
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(value?.hostname || value?.host || 'localhost')
}
for (const module of [http, https]) for (const name of ['request', 'get']) {
  const original = module[name]
  module[name] = function (target, ...args) {
    if (!local(target)) throw Error('System audit blocked non-local network request')
    return original.call(this, target, ...args)
  }
}
const originalFetch = globalThis.fetch
globalThis.fetch = function (target, ...args) {
  if (!local(target instanceof Request ? target.url : target)) throw Error('System audit blocked non-local fetch')
  return originalFetch.call(this, target, ...args)
}
syncBuiltinESMExports()
