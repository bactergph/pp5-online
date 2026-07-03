// สร้างบัญชีทดสอบ (อนุมัติแล้ว) ในโรงเรียน สำหรับปุ่ม quick-login หน้า /school/[code]/login
// Usage: node scripts/create-school-demo.mjs [schoolCodeOrId]
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

const [, , schoolArg] = process.argv
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const PW = 'test1234'

if (!url || !key) {
  console.error('Missing Supabase URL or service role key in .env.local')
  process.exit(1)
}

const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const email = (schoolId, username) => `${username}@${schoolId}.pp5.local`

const SUBJECT_GROUPS = [
  'ภาษาไทย',
  'คณิตศาสตร์',
  'วิทยาศาสตร์และเทคโนโลยี',
  'สังคมศึกษา ศาสนา และวัฒนธรรม',
  'สุขศึกษาและพลศึกษา',
  'ศิลปะ',
  'การงานอาชีพ',
  'ภาษาต่างประเทศ',
]

const members = [
  { username: 'principal_demo', prefix: 'นาย', full_name: 'ผู้อำนวยการ ทดสอบ', role: 'principal', position: 'ผู้อำนวยการ', is_homeroom: false },
  { username: 'rongporo', prefix: 'นาย', full_name: 'รองผู้อำนวยการ ทดสอบ', role: 'deputy_principal', position: 'รองผู้อำนวยการ', is_homeroom: false },
  { username: 'acad', prefix: 'นางสาว', full_name: 'หัวหน้าวิชาการ ทดสอบ', role: 'academic_head', position: 'หัวหน้าวิชาการ', is_homeroom: false },
  { username: 'measurement_demo', prefix: 'นางสาว', full_name: 'หัวหน้างานวัดผล ทดสอบ', role: 'teacher', position: 'หัวหน้างานวัดและประเมินผล', is_homeroom: false },
  { username: 'subject_head_demo', prefix: 'นาง', full_name: 'หัวหน้ากลุ่มสาระ ทดสอบ', role: 'teacher', position: 'หัวหน้ากลุ่มสาระ', is_homeroom: false },
  { username: 'homeroom_demo', prefix: 'นาง', full_name: 'ครูประจำชั้น ทดสอบ', role: 'teacher', position: 'ครู', is_homeroom: true },
  { username: 'teacher_demo_1', prefix: 'นาย', full_name: 'ครูผู้สอน ทดสอบ 1', role: 'teacher', position: 'ครู', is_homeroom: false },
  { username: 'teacher_demo_2', prefix: 'นางสาว', full_name: 'ครูผู้สอน ทดสอบ 2', role: 'teacher', position: 'ครู', is_homeroom: false },
  { username: 'teacher_demo_3', prefix: 'นาย', full_name: 'ครูผู้สอน ทดสอบ 3', role: 'teacher', position: 'ครู', is_homeroom: false },
  { username: 'teacher_homeroom_demo', prefix: 'นางสาว', full_name: 'ครูผู้สอนและประจำชั้น ทดสอบ', role: 'teacher', position: 'ครู', is_homeroom: true },
]

async function resolveSchool() {
  const fallback = 'bb1585db-0d31-4c01-ac47-0dc55bc98644'
  if (schoolArg && /^[0-9a-f-]{36}$/i.test(schoolArg)) {
    const row = await fetch(`${url}/rest/v1/schools?select=id,code,name&id=eq.${schoolArg}`, { headers: h }).then(r => r.json())
    return row?.[0] ?? { id: schoolArg, code: '?', name: '?' }
  }
  const code = (schoolArg || 'bannong').toLowerCase()
  const rows = await fetch(`${url}/rest/v1/schools?select=id,code,name&code=ilike.${encodeURIComponent(code)}`, { headers: h }).then(r => r.json())
  if (rows?.[0]) return rows[0]
  const fb = await fetch(`${url}/rest/v1/schools?select=id,code,name&id=eq.${fallback}`, { headers: h }).then(r => r.json())
  return fb?.[0] ?? { id: fallback, code: 'bannong', name: 'โรงเรียนทดสอบ' }
}

async function getId(em) {
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: h })
  const j = await r.json()
  return (j?.users || []).find(u => String(u.email).toLowerCase() === em.toLowerCase())?.id ?? null
}

const school = await resolveSchool()
const SCHOOL = school.id
console.log(`School: ${school.name} (${school.code}) — ${SCHOOL}`)
console.log(`Password ทุกบัญชี: ${PW}\n`)

const userIds = {}

for (const m of members) {
  const em = email(SCHOOL, m.username)
  let id = null
  let authStatus = 'exists'
  const profileRows = await fetch(`${url}/rest/v1/users?select=id&username=eq.${encodeURIComponent(m.username)}&school_id=eq.${SCHOOL}`, { headers: h }).then(r => r.json())
  if (Array.isArray(profileRows) && profileRows[0]?.id) {
    id = profileRows[0].id
    const emailAuthId = await getId(em)
    if (emailAuthId && emailAuthId !== id) {
      await fetch(`${url}/auth/v1/admin/users/${emailAuthId}`, { method: 'DELETE', headers: h })
    }
    const upd = await fetch(`${url}/auth/v1/admin/users/${id}`, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ email: em, password: PW, email_confirm: true, user_metadata: { full_name: m.full_name, role: m.role } }),
    })
    authStatus = upd.ok ? 'updated' : `update-failed-${upd.status}`
    if (!upd.ok) console.log('  auth update:', await upd.text())
  } else {
    const cr = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ email: em, password: PW, email_confirm: true, user_metadata: { full_name: m.full_name, role: m.role } }),
    })
    if (cr.ok) {
      id = (await cr.json()).id
      authStatus = 'created'
    } else {
      id = await getId(em)
      authStatus = id ? 'exists' : `create-failed-${cr.status}`
      if (!id) console.log('  auth create:', await cr.text())
    }
  }
  if (!id) { console.log(`${m.username}: FAILED`); continue }

  userIds[m.username] = id
  const profile = {
    id, email: em, username: m.username, full_name: m.full_name, prefix: m.prefix,
    position: m.position, role: m.role, is_homeroom: m.is_homeroom, school_id: SCHOOL, is_active: true,
  }
  const ex = await fetch(`${url}/rest/v1/users?select=id&id=eq.${id}`, { headers: h }).then(r => r.json())
  const ur = Array.isArray(ex) && ex.length > 0
    ? await fetch(`${url}/rest/v1/users?id=eq.${id}`, {
      method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify(profile),
    })
    : await fetch(`${url}/rest/v1/users`, {
      method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify(profile),
    })
  console.log(`${m.username.padEnd(22)} ${m.role.padEnd(18)} auth=${authStatus} profile=${ur.status}`)
}

const leaderPatch = {
  director_user_id: userIds.principal_demo ?? null,
  director_name: userIds.principal_demo ? 'นายผู้อำนวยการ ทดสอบ' : null,
  vice_director_user_id: userIds.rongporo ?? null,
  vice_director_name: userIds.rongporo ? 'นายรองผู้อำนวยการ ทดสอบ' : null,
  academic_head_user_id: userIds.acad ?? null,
  academic_head_name: userIds.acad ? 'นางสาวหัวหน้าวิชาการ ทดสอบ' : null,
  measurement_head_user_id: userIds.measurement_demo ?? null,
  measurement_head_name: userIds.measurement_demo ? 'นางสาวหัวหน้างานวัดผล ทดสอบ' : null,
}
const schoolPatch = await fetch(`${url}/rest/v1/schools?id=eq.${SCHOOL}`, {
  method: 'PATCH',
  headers: { ...h, Prefer: 'return=minimal' },
  body: JSON.stringify(leaderPatch),
})
console.log(`\nSchool leaders: HTTP ${schoolPatch.status}`)

if (userIds.subject_head_demo) {
  const headName = 'นางหัวหน้ากลุ่มสาระ ทดสอบ'
  let ok = 0
  for (const subject_group of SUBJECT_GROUPS) {
    const patch = await fetch(
      `${url}/rest/v1/subject_group_heads?school_id=eq.${SCHOOL}&subject_group=eq.${encodeURIComponent(subject_group)}`,
      {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({ head_name: headName, head_user_id: userIds.subject_head_demo }),
      },
    )
    if (patch.ok) ok++
    else {
      const ins = await fetch(`${url}/rest/v1/subject_group_heads`, {
        method: 'POST',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({ school_id: SCHOOL, subject_group, head_name: headName, head_user_id: userIds.subject_head_demo }),
      })
      if (ins.ok) ok++
    }
  }
  console.log(`Subject group heads: updated ${ok}/${SUBJECT_GROUPS.length} groups`)
}

console.log('\n--- รหัสทดสอบ (username / รหัสผ่าน) ---')
console.log(`URL: /school/${school.code}/login`)
for (const m of members) {
  console.log(`  ${m.username.padEnd(22)} / ${PW}  — ${m.full_name}`)
}
console.log(`  laghaim03@gmail.com    / ${PW}  — Admin โรงเรียน (อีเมล)`)
