import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const SUPABASE_URL = 'https://dwgdnfnevigfiwpjlugn.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3Z2RuZm5ldmlnZml3cGpsdWduIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI0ODYwMiwiZXhwIjoyMDk2ODI0NjAyfQ.mICm4ziMmNnGxiNCYImhlULTEFb_tH0hKjic7WvW2mA'

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

console.log('📖 กำลังอ่านไฟล์ DMC682_edit.xlsx...')
const wb = XLSX.readFile('DMC682_edit.xlsx', { codepage: 874 })
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log(`   พบ ${rows.length.toLocaleString()} แถว`)

const filtered = rows.filter(r =>
  r['ชื่อจังหวัด'] === 'บึงกาฬ' && r['ชื่อเขต'] === 'สพป.บึงกาฬ'
)
console.log(`✅ สพป.บึงกาฬ: ${filtered.length} แห่ง`)

// Map to schools table columns
const schools = filtered.map(r => ({
  name: String(r['ชื่อโรงเรียน']).trim(),
  district: String(r['ชื่ออำเภอ']).trim(),
  province: 'บึงกาฬ',
  area_office: 'สพป.บึงกาฬ',
  phone: String(r['โทรศัพท์']).trim() || null,
})).filter(s => s.name)

console.log('\n📊 ดึงข้อมูลโรงเรียนที่มีในระบบแล้ว...')
const { data: existing, error: fetchErr } = await db.from('schools').select('name')
if (fetchErr) { console.error('❌', fetchErr.message); process.exit(1) }

const existingNames = new Set((existing || []).map(s => s.name))
console.log(`   มีในระบบแล้ว: ${existingNames.size} แห่ง`)

const toInsert = schools.filter(s => !existingNames.has(s.name))
const toUpdate = schools.filter(s => existingNames.has(s.name))

console.log(`   จะเพิ่มใหม่: ${toInsert.length} แห่ง`)
console.log(`   มีอยู่แล้ว (อัพเดต district/phone): ${toUpdate.length} แห่ง`)

// Insert new schools
if (toInsert.length > 0) {
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH)
    const { error } = await db.from('schools').insert(batch)
    if (error) { console.error(`❌ Insert batch ${i}-${i+BATCH}:`, error.message); process.exit(1) }
    inserted += batch.length
    process.stdout.write(`\r   เพิ่ม ${inserted}/${toInsert.length}...`)
  }
  console.log(`\n✅ เพิ่มโรงเรียนใหม่ ${toInsert.length} แห่ง`)
}

// Update existing schools (district, area_office, phone)
if (toUpdate.length > 0) {
  let updated = 0
  for (const s of toUpdate) {
    const { error } = await db.from('schools')
      .update({ district: s.district, area_office: s.area_office, phone: s.phone, province: s.province })
      .eq('name', s.name)
    if (error) { console.error(`❌ Update "${s.name}":`, error.message) }
    else updated++
    if (updated % 20 === 0) process.stdout.write(`\r   อัพเดต ${updated}/${toUpdate.length}...`)
  }
  console.log(`\n✅ อัพเดตข้อมูล ${updated} แห่ง`)
}

// Final count
const { count } = await db.from('schools').select('id', { count: 'exact', head: true })
console.log(`\n🎉 เสร็จสิ้น! ระบบมีโรงเรียน ${count} แห่ง`)
