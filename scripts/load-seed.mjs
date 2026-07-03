// Parse a seed .sql INSERT (one or more blocks) and POST rows to Supabase REST.
// Handles quoted strings with '' escaping and commas inside text.
// Usage: node scripts/load-seed.mjs <supabaseUrl> <serviceRoleKey> <sqlFile> <table>
import { readFileSync } from 'fs'

const [, , url, key, sqlFile, table] = process.argv
const sql = readFileSync(sqlFile, 'utf8')

const colMatch = sql.match(/insert\s+into\s+\S+\s*\(([^)]+)\)/i)
const cols = colMatch[1].split(',').map(s => s.trim())

// split a tuple body into fields, tracking whether each was single-quoted
function splitTuple(s) {
  const fields = []
  let cur = '', inStr = false, quoted = false, i = 0
  while (i < s.length) {
    const ch = s[i]
    if (inStr) {
      if (ch === "'") {
        if (s[i + 1] === "'") { cur += "'"; i += 2; continue }
        inStr = false; i++; continue
      }
      cur += ch; i++
    } else if (ch === "'") { inStr = true; quoted = true; i++ }
    else if (ch === ',') { fields.push({ v: cur.trim(), quoted }); cur = ''; quoted = false; i++ }
    else { cur += ch; i++ }
  }
  fields.push({ v: cur.trim(), quoted })
  return fields
}

const rows = []
let started = false
for (const line of sql.split('\n')) {
  if (/\bvalues\b/i.test(line)) started = true
  if (!started) continue
  const tm = line.match(/^\s*\((.*)\)\s*,?\s*$/)
  if (!tm) continue
  const parts = splitTuple(tm[1])
  const obj = {}
  cols.forEach((c, i) => {
    const p = parts[i]
    if (!p) return
    obj[c] = p.quoted ? p.v : Number(p.v)
  })
  rows.push(obj)
}

// POST in batches
const BATCH = 300
let ok = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify(chunk),
  })
  if (res.ok) ok += chunk.length
  else { console.log(`batch ${i} -> HTTP ${res.status}: ${await res.text()}`); break }
}
console.log(`${table}: parsed ${rows.length} rows, inserted ${ok}`)
