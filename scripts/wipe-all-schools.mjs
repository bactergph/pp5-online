/**
 * ลบทุกโรงเรียน + ข้อมูลที่ cascade ตามโรงเรียน
 * + ลบบัญชีที่ไม่ใช่ Super Admin (role != district)
 * คงเฉพาะผู้ใช้ role = district
 *
 * Usage: node scripts/wipe-all-schools.mjs
 * ต้องมี CONFIRM=YES
 */
import { readFileSync, existsSync } from 'fs'

if (process.env.CONFIRM !== 'YES') {
  console.error('Refuse to run without CONFIRM=YES')
  console.error('  CONFIRM=YES node scripts/wipe-all-schools.mjs')
  process.exit(1)
}

const env = existsSync('.env.local')
  ? Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter(line => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map(line => {
        const i = line.indexOf('=')
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
      }),
  )
  : {}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const h = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...h, ...(init.headers || {}) },
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → HTTP ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`)
  return json
}

async function listAuthUsers() {
  const all = []
  let page = 1
  while (true) {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=200&page=${page}`, { headers: h })
    const j = await res.json()
    const users = j?.users || []
    all.push(...users)
    if (users.length < 200) break
    page += 1
    if (page > 50) break
  }
  return all
}

async function deleteAuthUser(id) {
  const res = await fetch(`${url}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: h })
  return res.status
}

console.log('=== Wipe all schools + non-district users ===\n')

const schools = await rest('schools?select=id,name,code&order=name')
console.log(`Schools to delete: ${schools?.length || 0}`)
for (const s of schools || []) {
  console.log(`  - ${s.name} (${s.code || 'no-code'}) ${s.id}`)
}

if ((schools || []).length > 0) {
  // ล้าง FK บน schools ที่ชี้ users ก่อน (กันลบ user ติด)
  await rest('schools?id=neq.00000000-0000-0000-0000-000000000000', {
    method: 'PATCH',
    body: JSON.stringify({
      director_user_id: null,
      vice_director_user_id: null,
      acting_director_user_id: null,
      academic_head_user_id: null,
      measurement_head_user_id: null,
    }),
    headers: { Prefer: 'return=minimal' },
  }).catch(() => {})

  const del = await rest('schools?id=neq.00000000-0000-0000-0000-000000000000', {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
  console.log(`Deleted schools: OK (${Array.isArray(del) ? del.length : 'done'})`)
} else {
  console.log('No schools to delete')
}

const profiles = await rest('users?select=id,email,username,role,full_name&order=role')
const keep = []
const drop = []
for (const u of profiles || []) {
  if (u.role === 'district') keep.push(u)
  else drop.push(u)
}

console.log(`\nUsers keep (district): ${keep.length}`)
for (const u of keep) console.log(`  KEEP ${(u.email || u.username || u.id)}`)

console.log(`Users delete: ${drop.length}`)
for (const u of drop) {
  // ลบ profile ก่อน แล้วค่อย auth (หรือกลับกันก็ได้ — auth cascade ไป users ถ้า FK cascade)
  try {
    await rest(`users?id=eq.${u.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
  } catch (e) {
    console.log(`  profile fail ${u.email || u.id}: ${e.message}`)
  }
  const status = await deleteAuthUser(u.id)
  console.log(`  DEL ${(u.email || u.username || u.id).padEnd(40)} role=${u.role} auth=${status}`)
}

// ลบบัญชี auth ที่เหลือซึ่งเป็น *@*.pp5.local หรือไม่มี profile (orphan demo)
const authUsers = await listAuthUsers()
const keepIds = new Set(keep.map(u => u.id))
for (const au of authUsers) {
  if (keepIds.has(au.id)) continue
  const em = String(au.email || '')
  const isDemoLocal = /@.*\.pp5\.local$/i.test(em)
  // ลบทุก auth ที่ไม่มีใน keep list (หลังลบ profile แล้ว)
  const still = await rest(`users?select=id&id=eq.${au.id}`)
  if ((still && still.length > 0) || isDemoLocal || !keepIds.has(au.id)) {
    if (still?.length) continue // มี profile ที่ keep แล้ว
    if (keepIds.has(au.id)) continue
    const status = await deleteAuthUser(au.id)
    console.log(`  AUTH orphan/demo DEL ${em.padEnd(40)} auth=${status}`)
  }
}

const leftSchools = await rest('schools?select=id&limit=5')
const leftUsers = await rest('users?select=email,role&order=role')
console.log('\n=== Remaining ===')
console.log(`schools: ${(leftSchools || []).length}`)
console.log('users:')
for (const u of leftUsers || []) console.log(`  ${(u.email || '-').padEnd(36)} ${u.role}`)
console.log('\nDone.')
