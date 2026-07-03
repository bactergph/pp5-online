// Create/repair quick-login accounts for the main /login page.
// Usage: node scripts/create-main-demo.mjs
import fs from 'node:fs'

const env = fs.existsSync('.env.local')
  ? Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter(line => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map(line => {
        const idx = line.indexOf('=')
        return [line.slice(0, idx), line.slice(idx + 1)]
      })
  )
  : {}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const SCHOOL = 'bb1585db-0d31-4c01-ac47-0dc55bc98644'
const PW = 'test1234'

if (!url || !key) {
  console.error('Missing Supabase URL or service role key in .env.local.')
  process.exit(1)
}

const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

async function getAuthId(email) {
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: h })
  const j = await r.json()
  return (j?.users || []).find(u => String(u.email).toLowerCase() === email.toLowerCase())?.id ?? null
}

async function ensureAdminDemo() {
  const email = 'laghaim03@gmail.com'
  let id = await getAuthId(email)
  let authStatus = 'updated'

  if (id) {
    const ur = await fetch(`${url}/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      headers: h,
      body: JSON.stringify({
        password: PW,
        email_confirm: true,
        user_metadata: { full_name: 'ผู้ดูแลโรงเรียน ทดสอบ', role: 'admin' },
      }),
    })
    authStatus = ur.ok ? 'updated' : `update-failed-${ur.status}`
    if (!ur.ok) console.log('  auth update:', await ur.text())
  } else {
    const cr = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        email,
        password: PW,
        email_confirm: true,
        user_metadata: { full_name: 'ผู้ดูแลโรงเรียน ทดสอบ', role: 'admin' },
      }),
    })
    if (!cr.ok) {
      console.log(`laghaim03: auth=create-failed-${cr.status}`)
      console.log('  ', await cr.text())
      return
    }
    id = (await cr.json()).id
    authStatus = 'created'
  }

  const profile = {
    id,
    email,
    username: null,
    full_name: 'ผู้ดูแลโรงเรียน ทดสอบ',
    prefix: 'นาย',
    position: 'ผู้ดูแลโรงเรียน',
    role: 'admin',
    is_homeroom: false,
    school_id: SCHOOL,
    is_active: true,
  }
  const ex = await fetch(`${url}/rest/v1/users?select=id&id=eq.${id}`, { headers: h }).then(r => r.json())
  const pr = Array.isArray(ex) && ex.length > 0
    ? await fetch(`${url}/rest/v1/users?id=eq.${id}`, {
      method: 'PATCH',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify(profile),
    })
    : await fetch(`${url}/rest/v1/users`, {
      method: 'POST',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify(profile),
    })

  console.log(`laghaim03: auth=${authStatus} profile=HTTP ${pr.status}`)
  if (!pr.ok) console.log('  ', await pr.text())
}

await ensureAdminDemo()
