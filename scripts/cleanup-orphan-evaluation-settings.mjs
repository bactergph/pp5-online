/**
 * ลบ evaluation_settings ของโรงเรียนที่ไม่มี users และไม่มี classrooms
 * ไม่ลบตาราง schools (รายชื่อโรงเรียนทั้งหมดคงอยู่)
 *
 * Usage: node scripts/cleanup-orphan-evaluation-settings.mjs [--dry-run]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const dryRun = process.argv.includes('--dry-run')

function loadEnv() {
  const file = path.join(root, '.env.local')
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(line => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map(line => {
        const idx = line.indexOf('=')
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
      }),
  )
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local')
  process.exit(1)
}

const headers = { apikey: key, Authorization: `Bearer ${key}` }

async function countEval(filter = '') {
  const res = await fetch(`${url}/rest/v1/evaluation_settings?select=id${filter}`, {
    headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
  })
  return Number(res.headers.get('content-range')?.split('/')[1] || 0)
}

async function countSchools() {
  const res = await fetch(`${url}/rest/v1/schools?select=id`, {
    headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
  })
  return Number(res.headers.get('content-range')?.split('/')[1] || 0)
}

async function fetchActiveSchoolIds() {
  const active = new Set()
  for (const table of ['users', 'classrooms']) {
    for (let from = 0; ; from += 1000) {
      const res = await fetch(`${url}/rest/v1/${table}?select=school_id`, {
        headers: { ...headers, Range: `${from}-${from + 999}` },
      })
      const rows = await res.json()
      if (!Array.isArray(rows) || rows.length === 0) break
      for (const row of rows) {
        if (row.school_id) active.add(row.school_id)
      }
      if (rows.length < 1000) break
    }
  }
  return active
}

async function fetchOrphanSchoolIds(activeIds) {
  const orphans = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/schools?select=id`, {
      headers: { ...headers, Range: `${from}-${from + 999}` },
    })
    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const row of rows) {
      if (!activeIds.has(row.id)) orphans.push(row.id)
    }
    if (rows.length < 1000) break
  }
  return orphans
}

async function deleteEvalForSchools(schoolIds) {
  const inList = schoolIds.map(id => `"${id}"`).join(',')
  const res = await fetch(`${url}/rest/v1/evaluation_settings?school_id=in.(${inList})`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`DELETE failed ${res.status}: ${text.slice(0, 300)}`)
  }
}

const beforeEval = await countEval()
const beforeSchools = await countSchools()
const activeIds = await fetchActiveSchoolIds()
const orphans = await fetchOrphanSchoolIds(activeIds)

console.log(`โรงเรียนในระบบ: ${beforeSchools.toLocaleString()} (ไม่ลบ)`)
console.log(`โรงเรียนที่ใช้งานจริง (มี user หรือ classroom): ${activeIds.size}`)
console.log(`โรงเรียนที่จะลบเฉพาะ evaluation_settings: ${orphans.length.toLocaleString()}`)
console.log(`evaluation_settings ก่อนล้าง: ${beforeEval.toLocaleString()}`)

if (dryRun) {
  console.log('\n[dry-run] ไม่ได้ลบข้อมูล')
  process.exit(0)
}

const BATCH = 25
let done = 0
for (let i = 0; i < orphans.length; i += BATCH) {
  const chunk = orphans.slice(i, i + BATCH)
  await deleteEvalForSchools(chunk)
  done += chunk.length
  process.stdout.write(`\rลบ settings ของโรงเรียน ${done}/${orphans.length}...`)
}

console.log('')

const afterEval = await countEval()
const afterSchools = await countSchools()
console.log(`evaluation_settings หลังล้าง: ${afterEval.toLocaleString()} (ลด ${(beforeEval - afterEval).toLocaleString()})`)
console.log(`โรงเรียนหลังล้าง: ${afterSchools.toLocaleString()} (ต้องเท่าเดิม)`)
