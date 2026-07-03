/**
 * สร้างตาราง global_holidays ถ้ายังไม่มี
 * ใช้: ตั้งค่า SUPABASE_DB_URL ใน .env.local แล้วรัน node scripts/ensure-global-holidays.mjs
 *
 * หา connection string ได้ที่ Supabase Dashboard → Project Settings → Database → Connection string (URI)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

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
const dbUrl = env.SUPABASE_DB_URL || env.DATABASE_URL
const restUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

async function tableExists() {
  if (!restUrl || !serviceKey) return null
  const res = await fetch(`${restUrl}/rest/v1/global_holidays?select=id&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (res.status === 200) return true
  if (res.status === 404) return false
  const text = await res.text()
  if (text.includes('global_holidays')) return false
  return null
}

async function main() {
  const exists = await tableExists()
  if (exists === true) {
    console.log('global_holidays: table already exists')
    return
  }

  if (!dbUrl) {
    console.log('global_holidays table is missing.')
    console.log('Add SUPABASE_DB_URL to .env.local, then run this script again.')
    console.log('Or run these SQL files in Supabase Dashboard → SQL Editor:')
    console.log('  - supabase/migrations/010_global_holidays.sql')
    console.log('  - supabase/migrations/020_seed_global_holidays_2569_2570.sql (optional)')
    process.exit(1)
  }

  const postgres = (await import('postgres')).default
  const sql = postgres(dbUrl, { max: 1 })
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/010_global_holidays.sql'), 'utf8')
  await sql.unsafe(migration)
  await sql.end()
  console.log('global_holidays: table created')
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
