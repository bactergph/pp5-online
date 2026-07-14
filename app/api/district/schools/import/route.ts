import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import * as XLSX from 'xlsx'

export type ImportSchool = {
  name: string
  district: string
  province: string
  area_office: string
  address: string
  phone: string
}

/** @deprecated ใช้ ImportSchool แทน — คง type เก่าไว้ให้หน้าเดิม import ได้ */
export type OBECSchool = ImportSchool & { school_id?: string }

function norm(v: unknown) {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

// หา key ของ column โดยไม่สนตัวพิมพ์ใหญ่เล็ก / ขีดล่าง / ช่องว่าง
function findKey(row: Record<string, unknown>, candidates: string[]): string | undefined {
  const keys = Object.keys(row).map(k => k.toLowerCase().replace(/[\s_./-]/g, ''))
  for (const c of candidates) {
    const needle = c.toLowerCase().replace(/[\s_./-]/g, '')
    const idx = keys.indexOf(needle)
    if (idx >= 0) return Object.keys(row)[idx]
  }
  // partial match (เช่น "ชื่ออำเภอ" ใน "ชื่ออำเภอ (ตามบัตร)")
  for (const c of candidates) {
    const needle = c.toLowerCase().replace(/[\s_./-]/g, '')
    const idx = keys.findIndex(k => k.includes(needle) || needle.includes(k))
    if (idx >= 0 && needle.length >= 3) return Object.keys(row)[idx]
  }
  return undefined
}

function buildAddress(parts: {
  moo?: string
  village?: string
  tambon?: string
  postal?: string
}) {
  const bits: string[] = []
  if (parts.village) bits.push(parts.village.startsWith('บ้าน') ? parts.village : `บ้าน${parts.village}`)
  if (parts.moo) bits.push(parts.moo.startsWith('หมู่') ? parts.moo : `หมู่ ${parts.moo}`)
  if (parts.tambon) bits.push(parts.tambon.startsWith('ต.') ? parts.tambon : `ต.${parts.tambon}`)
  if (parts.postal) bits.push(parts.postal)
  return bits.join(' ')
}

function rowToSchool(
  r: Record<string, unknown>,
  keys: {
    nameKey: string
    distKey?: string
    provKey?: string
    areaKey?: string
    mooKey?: string
    villageKey?: string
    tambonKey?: string
    postalKey?: string
    phoneKey?: string
  },
): ImportSchool | null {
  let name = norm(r[keys.nameKey])
  if (!name) return null
  // อนุญาตชื่อที่ไม่มีคำนำหน้า (ฐานข้อมูล catalog) — ไม่ filter ออก
  const district = keys.distKey ? norm(r[keys.distKey]) : ''
  const province = keys.provKey ? norm(r[keys.provKey]) : ''
  const area_office = keys.areaKey ? norm(r[keys.areaKey]) : ''
  const phone = keys.phoneKey ? norm(r[keys.phoneKey]) : ''
  const address = buildAddress({
    moo: keys.mooKey ? norm(r[keys.mooKey]) : '',
    village: keys.villageKey ? norm(r[keys.villageKey]) : '',
    tambon: keys.tambonKey ? norm(r[keys.tambonKey]) : '',
    postal: keys.postalKey ? norm(r[keys.postalKey]) : '',
  })
  return { name, district, province, area_office, address, phone }
}

/** รูปแบบ DMC682: คอลัมน์คงที่ C9–C17 (index 8–16) */
function parseDmcFixedRows(grid: unknown[][]): ImportSchool[] {
  const out: ImportSchool[] = []
  const seen = new Set<string>()
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i] || []
    const name = norm(r[8])
    if (!name) continue
    const district = norm(r[9])
    const province = norm(r[10])
    const area_office = norm(r[11])
    const villageOrAddr = norm(r[13])
    const tambon = norm(r[14])
    const postal = norm(r[15])
    const phone = norm(r[16])
    const k = `${name}|${district}|${province}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({
      name,
      district,
      province,
      area_office,
      address: buildAddress({ village: villageOrAddr, tambon, postal }),
      phone,
    })
  }
  return out
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'district') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: 'buffer', codepage: 874 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'ไม่พบข้อมูลในไฟล์' }, { status: 400 })
  }

  const sample = rows[0]
  const nameKey = findKey(sample, [
    'ชื่อโรงเรียน', 'schoolname', 'school_name', 'schoolthname', 'name', 'โรงเรียน',
  ])
  const distKey = findKey(sample, ['ชื่ออำเภอ', 'อำเภอ', 'district', 'amphoe', 'amphur'])
  const provKey = findKey(sample, ['ชื่อจังหวัด', 'จังหวัด', 'province', 'changwat'])
  const areaKey = findKey(sample, [
    'ชื่อเขต', 'เขต', 'area_office', 'areaoffice', 'สำนักงานเขต', 'เขตพื้นที่', 'สพป', 'สพม',
  ])
  const mooKey = findKey(sample, ['หมู่', 'moo', 'หมู่ที่'])
  const villageKey = findKey(sample, ['ชื่อหมู่บ้าน', 'หมู่บ้าน', 'village', 'บ้าน'])
  const tambonKey = findKey(sample, ['ชื่อตำบล', 'ตำบล', 'tambon', 'tumbol', 'subdistrict'])
  const postalKey = findKey(sample, ['ไปรษณีย์', 'รหัสไปรษณีย์', 'postal', 'zip', 'zipcode', 'postcode'])
  const phoneKey = findKey(sample, ['โทรศัพท์', 'telephone', 'phone', 'tel', 'เบอร์โทร'])

  let schools: ImportSchool[] = []

  if (nameKey) {
    const seen = new Set<string>()
    for (const r of rows) {
      const s = rowToSchool(r, {
        nameKey, distKey, provKey, areaKey, mooKey, villageKey, tambonKey, postalKey, phoneKey,
      })
      if (!s) continue
      const k = `${s.name}|${s.district}|${s.province}`
      if (seen.has(k)) continue
      seen.add(k)
      schools.push(s)
    }
  }

  // fallback: ไฟล์แบบ DMC682 (คอลัมน์ตายตัว ไม่มี header ที่อ่านชื่อได้)
  if (schools.length === 0) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    schools = parseDmcFixedRows(grid)
  }

  if (schools.length === 0) {
    return NextResponse.json({
      error: 'ไม่พบข้อมูลโรงเรียนในไฟล์',
      hint: `column ที่พบ: ${Object.keys(sample).join(', ')}`,
    }, { status: 400 })
  }

  return NextResponse.json({ schools, count: schools.length })
}
