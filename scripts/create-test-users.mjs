// Create test accounts for each role (Supabase Auth + users table).
// Usage: node scripts/create-test-users.mjs <url> <serviceRoleKey>
const [, , url, key] = process.argv
const SCHOOL = 'bb1585db-0d31-4c01-ac47-0dc55bc98644'
const PW = 'test1234'

const accounts = [
  { email: 'laghaim07@gmail.com', role: 'principal',     is_homeroom: false, prefix: 'นาย',     full_name: 'ผอ.ทดสอบ ประจำโรงเรียน', position: 'ผู้อำนวยการ' },
  { email: 'laghaim08@gmail.com', role: 'academic_head', is_homeroom: false, prefix: 'นาง',     full_name: 'หัวหน้าวิชาการ ทดสอบ',    position: 'หัวหน้าฝ่ายวิชาการ' },
  { email: 'laghaim09@gmail.com', role: 'teacher',       is_homeroom: false, prefix: 'นางสาว', full_name: 'ครูผู้สอน ทดสอบ',          position: 'ครู' },
  { email: 'laghaim10@gmail.com', role: 'teacher',       is_homeroom: true,  prefix: 'นาย',     full_name: 'ครูสอน+ประจำชั้น ทดสอบ',  position: 'ครู' },
]

const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function getAuthId(email) {
  const r = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers: h })
  const j = await r.json()
  return j?.users?.[0]?.id ?? null
}

for (const a of accounts) {
  // 1) create auth user (or reuse if exists)
  let id = null
  const cr = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ email: a.email, password: PW, email_confirm: true }),
  })
  if (cr.ok) { id = (await cr.json()).id }
  else { id = await getAuthId(a.email) }   // already exists
  if (!id) { console.log(`${a.email}: FAILED to get auth id (${cr.status})`); continue }

  // 2) upsert users profile (PK = id)
  const ur = await fetch(`${url}/rest/v1/users`, {
    method: 'POST',
    headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id, school_id: SCHOOL, email: a.email, prefix: a.prefix,
      full_name: a.full_name, position: a.position, role: a.role,
      is_homeroom: a.is_homeroom, is_active: true,
    }),
  })
  console.log(`${a.email} (${a.role}): auth=${cr.ok ? 'created' : 'exists'} profile=HTTP ${ur.status}`)
  if (!ur.ok) console.log('   ', await ur.text())
}
