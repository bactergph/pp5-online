/**
 * สร้าง zones-static.json โดย:
 * 1. อ่าน DMC682_edit.xlsx → ชื่อเขต + ชื่อโรงเรียนในแต่ละเขต
 * 2. ดาวน์โหลด MOE API → schoolID ของแต่ละโรงเรียน
 * 3. Cross-reference → map เขต → schoolIdPrefix + seqMin/seqMax
 */
import { createRequire } from 'module'
import { writeFileSync } from 'fs'
import https from 'https'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const MOE_API = 'https://exchange-api.moe.go.th/api/openv1/GetopenData49/2568/2'

// ---- Step 1: อ่าน DMC ----
console.log('📖 Step 1: อ่าน DMC682_edit.xlsx...')
const wb = XLSX.readFile('DMC682_edit.xlsx', { codepage: 874 })
const ws = wb.Sheets[wb.SheetNames[0]]
const dmc = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log(`   ${dmc.length.toLocaleString()} แถว`)

// Map (ชื่อโรงเรียน + จังหวัด) → zone
const dmcByNameProv = new Map()
for (const r of dmc) {
  const name = String(r['ชื่อโรงเรียน'] || '').trim()
  const zone = String(r['ชื่อเขต'] || '').trim()
  const prov = String(r['ชื่อจังหวัด'] || '').trim()
  if (name && zone && prov) dmcByNameProv.set(`${name}|${prov}`, { zone, prov })
}
console.log(`   unique (name+province) keys: ${dmcByNameProv.size}`)

// ---- Step 2: ดาวน์โหลด MOE API ----
console.log('\n📥 Step 2: ดาวน์โหลด MOE API...')

const moeSchools = await new Promise((resolve, reject) => {
  const chunks = []
  https.get(MOE_API, res => {
    res.on('data', c => chunks.push(c))
    res.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        const parsed = JSON.parse(raw)
        resolve(Array.isArray(parsed) ? parsed : (parsed.value || []))
      } catch {
        const rows = [...raw.matchAll(/\{[^\{\}]{50,800}\}/g)]
          .map(m => { try { return JSON.parse(m[0]) } catch { return null } })
          .filter(Boolean)
        resolve(rows)
      }
    })
    res.on('error', reject)
  })
})

console.log(`   ได้ ${moeSchools.length.toLocaleString()} โรงเรียนจาก MOE API`)

// ---- Step 3: Cross-reference ----
console.log('\n🔗 Step 3: Cross-reference school names → zone prefix + seq range...')

// zone → { province, dept, prefix, seqs: number[] }
const zoneMap = new Map()
let matched = 0

for (const s of moeSchools) {
  const id = String(s.schoolID || '')
  if (id.length < 10) continue
  const name = String(s.schoolTypeName || '').trim()
  const prov = String(s.provinceNameThai || '').trim()
  const prefix6 = id.slice(0, 6)
  const seq = parseInt(id.slice(6))
  const dd = id.slice(0, 2)
  const dept = dd === '10' ? 'สพฐ.' : dd === '11' ? 'สช.' : 'อื่นๆ'

  const dmc = dmcByNameProv.get(`${name}|${prov}`)
  if (dmc) {
    matched++
    const zone = dmc.zone
    if (!zoneMap.has(zone)) {
      zoneMap.set(zone, { province: dmc.prov || prov, dept, prefix: prefix6, seqs: [] })
    }
    const entry = zoneMap.get(zone)
    if (!isNaN(seq)) entry.seqs.push(seq)
  }
}

console.log(`   matched: ${matched} schools, ${zoneMap.size} zones`)

// ---- Step 4: สร้าง output ----
const zones = []
for (const [label, v] of zoneMap.entries()) {
  v.seqs.sort((a, b) => a - b)
  const seqMin = v.seqs[0] ?? null
  const seqMax = v.seqs[v.seqs.length - 1] ?? null

  zones.push({
    label,
    province: v.province,
    department: v.dept,
    schoolIdPrefix: v.prefix,
    seqMin,
    seqMax,
    count: v.seqs.length,
  })
}

zones.sort((a, b) => a.label.localeCompare(b.label, 'th'))

// ตรวจ duplicate prefix
const prefixCount = {}
zones.forEach(z => {
  const k = z.schoolIdPrefix
  if (!prefixCount[k]) prefixCount[k] = []
  prefixCount[k].push(z.label)
})
const dupes = Object.entries(prefixCount).filter(([, v]) => v.length > 1)
console.log(`   duplicate prefixes: ${dupes.length} (จะใช้ seqMin-seqMax แยก)`)

writeFileSync('public/zones-static.json', JSON.stringify(zones, null, 2), 'utf8')
console.log(`\n✅ บันทึก public/zones-static.json (${zones.length} เขต)`)
console.log('ตัวอย่าง:')
zones.slice(0, 5).forEach(z =>
  console.log(`  ${z.label} | ${z.province} | ${z.schoolIdPrefix} seq:${z.seqMin}-${z.seqMax} | ${z.count} รร`)
)
const bk = zones.find(z => z.label === 'สพป.บึงกาฬ')
console.log('\nสพป.บึงกาฬ:', JSON.stringify(bk))
