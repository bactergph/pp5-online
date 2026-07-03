// โหลดโรงเรียนทั้งประเทศจาก DMC682_edit.xlsx → ตาราง schools (dedup ตาม ชื่อ+อำเภอ+จังหวัด)
// Usage: node scripts/import-schools-from-dmc.mjs <url> <serviceRoleKey>
import { readFile } from 'fs/promises'
import * as XLSX from 'xlsx'

const [, , url, key] = process.argv
const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const norm = (v) => String(v ?? '').trim()
const keyOf = (name, district, province) => `${name}|${district}|${province}`

// 1) อ่านไฟล์
const buf = await readFile(new URL('../DMC682_edit.xlsx', import.meta.url))
const wb = XLSX.read(buf)
const ws = wb.Sheets[wb.SheetNames[0]]
const g = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
// header อยู่แถว 1 (index 0): C9 ชื่อโรงเรียน, C10 อำเภอ, C11 จังหวัด, C12 เขต, C14 ที่อยู่, C15 ตำบล, C16 ปณ, C17 โทร
const fileRows = []
const fileSeen = new Set()
for (let i = 1; i < g.length; i++) {
  const r = g[i]
  const name = norm(r[8])
  if (!name) continue
  const district = norm(r[9]), province = norm(r[10])
  const k = keyOf(name, district, province)
  if (fileSeen.has(k)) continue
  fileSeen.add(k)
  const addr = [norm(r[13]), norm(r[14]) && `ต.${norm(r[14])}`, district && `อ.${district}`, province && `จ.${province}`, norm(r[15])].filter(Boolean).join(' ')
  fileRows.push({
    name, area_office: norm(r[11]) || null, district: district || null, province: province || null,
    address: addr || null, phone: norm(r[16]) || null,
  })
}
console.log(`ไฟล์: ${fileRows.length} โรงเรียน (ไม่ซ้ำในไฟล์)`)

// 2) ดึงของเดิมทั้งหมด (paginate) → dedup set
const existing = new Set()
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${url}/rest/v1/schools?select=name,district,province`, {
    headers: { ...h, Range: `${from}-${from + 999}` },
  })
  const batch = await res.json()
  if (!Array.isArray(batch) || batch.length === 0) break
  for (const s of batch) existing.add(keyOf(norm(s.name), norm(s.district), norm(s.province)))
  if (batch.length < 1000) break
}
console.log(`มีอยู่แล้ว: ${existing.size} โรงเรียน`)

// 3) เฉพาะที่ยังไม่มี
const toInsert = fileRows.filter(r => !existing.has(keyOf(r.name, r.district || '', r.province || '')))
console.log(`จะเพิ่มใหม่: ${toInsert.length} โรงเรียน`)

// 4) insert ทีละ batch
const BATCH = 1000
let done = 0
for (let i = 0; i < toInsert.length; i += BATCH) {
  const chunk = toInsert.slice(i, i + BATCH)
  const res = await fetch(`${url}/rest/v1/schools`, {
    method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(chunk),
  })
  if (!res.ok) { console.log(`batch ${i}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); break }
  done += chunk.length
  process.stdout.write(`\r  inserted ${done}/${toInsert.length}`)
}
console.log(`\nเสร็จ: เพิ่ม ${done} โรงเรียน`)
