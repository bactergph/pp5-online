// ลบบัญชีทดสอบเดิม (email-based) ออกจากระบบ: ทั้ง public.users และ Supabase Auth
// ไม่แตะ laghaim02 (Super Admin ของผู้ใช้)
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

const EMAILS = [
  'laghaim01@gmail.com',  // teacher+ประจำชั้น
  'laghaim06@gmail.com',  // admin
  'laghaim07@gmail.com',  // principal
  'laghaim08@gmail.com',  // academic_head
  'laghaim09@gmail.com',  // teacher
  'laghaim10@gmail.com',  // teacher+ประจำชั้น
  'laghaim011@gmail.com', // admin (duplicate)
]

async function authUserByEmail(email) {
  const r = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers: h })
  const j = await r.json()
  return j?.users?.[0] || null
}

for (const email of EMAILS) {
  const au = await authUserByEmail(email)
  // 1) ลบ profile row ก่อน (public.users)
  const delProfile = await fetch(`${url}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE', headers: { ...h, Prefer: 'return=minimal' } })
  // 2) ลบ auth user
  let authStatus = 'not-found'
  if (au) {
    const delAuth = await fetch(`${url}/auth/v1/admin/users/${au.id}`, { method: 'DELETE', headers: h })
    authStatus = delAuth.status
  }
  console.log(`${email.padEnd(24)} profile=HTTP ${delProfile.status}  auth=${authStatus}`)
}

console.log('\n--- เหลือผู้ใช้ในระบบ (เช็คว่า laghaim02 ยังอยู่) ---')
const left = await fetch(`${url}/rest/v1/users?select=email,username,role&order=role`, { headers: h }).then(r => r.json())
for (const u of left) console.log(`  ${(u.email || '').padEnd(28)} ${(u.username || '-').padEnd(16)} ${u.role}`)
