import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import * as XLSX from 'xlsx'

export type OBECSchool = {
  school_id: string
  name: string
  district: string
  province: string
  phone: string
}

function parseOBECHtml(html: string): OBECSchool[] {
  const schools: OBECSchool[] = []
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
  if (!tbodyMatch) return schools

  for (const rowMatch of tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = []
    for (const cell of rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)) {
      cells.push(cell[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim())
    }
    if (cells.length < 3) continue
    const name = cells.find(c => c.startsWith('โรงเรียน') || c.startsWith('ร.ร.'))
    if (!name) continue
    const ni = cells.findIndex(c => c === name)
    schools.push({
      school_id: cells.find(c => /^\d{8,11}$/.test(c)) || '',
      name,
      district: cells[ni + 2] || '',
      province: cells[ni + 3] || '',
      phone: cells.find(c => /^0\d[\d\-]{7,}/.test(c)) || '',
    })
  }
  return schools
}

// หา key ของ column โดยไม่สนตัวพิมพ์ใหญ่เล็ก / ขีดล่าง / ช่องว่าง
function findKey(row: Record<string, unknown>, candidates: string[]): string | undefined {
  const keys = Object.keys(row).map(k => k.toLowerCase().replace(/[\s_]/g, ''))
  return candidates.map(c => c.toLowerCase().replace(/[\s_]/g, '')).reduce<string | undefined>((found, c) => {
    if (found) return found
    const idx = keys.indexOf(c)
    return idx >= 0 ? Object.keys(row)[idx] : undefined
  }, undefined)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'district') return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const areaCode = (form.get('area_code') as string | null)?.trim() || ''

  if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
  if (!areaCode) return NextResponse.json({ error: 'กรุณากำหนดรหัสเขตพื้นที่ใน ตั้งค่าเขต ก่อน' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: 'buffer', codepage: 874 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  if (rows.length === 0) return NextResponse.json({ error: 'ไม่พบข้อมูลในไฟล์' }, { status: 400 })

  // ตรวจหา column จากแถวแรก
  const sample = rows[0]
  const areaKey  = findKey(sample, ['areacode','area_code','รหัสเขต','รหัสเขตพื้นที่'])
  const nameKey  = findKey(sample, ['schoolname','school_name','ชื่อโรงเรียน','name','schoolthname'])
  const distKey  = findKey(sample, ['district','อำเภอ','amphoe','amphur'])
  const provKey  = findKey(sample, ['province','จังหวัด','changwat'])
  const phoneKey = findKey(sample, ['telephone','phone','โทรศัพท์','tel'])

  if (!nameKey) {
    return NextResponse.json({
      error: 'ไม่พบ column ชื่อโรงเรียน ในไฟล์',
      hint: `column ที่พบ: ${Object.keys(sample).join(', ')}`,
    }, { status: 400 })
  }

  // หา column ที่มีค่าเหมือนรหัสเขต (เช่น 3801, 38010000) หรือจังหวัด
  const edAreaKey = findKey(sample, ['ed_area','edarea','edzone','zone','areaedu','ketpuenthi','schoolareacode','รหัสเขตพื้นที่','สพ','เขตพื้นที่'])

  function toSchools(filteredRows: Record<string, unknown>[]): OBECSchool[] {
    return filteredRows.map(r => ({
      school_id: '',
      name: String(r[nameKey!]).trim(),
      district: distKey ? String(r[distKey]).trim() : '',
      province: provKey ? String(r[provKey]).trim() : '',
      phone: phoneKey ? String(r[phoneKey]).trim() : '',
    })).filter(s => s.name.startsWith('โรงเรียน') || s.name.startsWith('ร.ร.'))
  }

  // ลำดับความสำคัญ: ed_area → areacode → province name → school code prefix
  let schools: OBECSchool[] = []

  if (edAreaKey) {
    schools = toSchools(rows.filter(r => String(r[edAreaKey]).startsWith(areaCode)))
  }
  if (schools.length === 0 && areaKey) {
    schools = toSchools(rows.filter(r => String(r[areaKey]).startsWith(areaCode)))
  }
  // fallback: filter ด้วย 2 ตัวแรกของรหัสเขต = รหัสจังหวัด (3801 → จังหวัด 38)
  if (schools.length === 0 && areaKey) {
    const provCode = areaCode.slice(0, 2)
    schools = toSchools(rows.filter(r => {
      const v = String(r[areaKey])
      return v.startsWith(provCode) && v.length >= 8
    }))
  }
  // fallback สุดท้าย: filter จากชื่อจังหวัด ถ้ามี column จังหวัด
  if (schools.length === 0 && provKey) {
    // ดึงชื่อจังหวัดจาก district settings ไม่ได้ตรงนี้ จึง group ด้วย province ที่ unique น้อยที่สุด
    const provCounts = rows.reduce<Record<string, number>>((acc, r) => {
      const p = String(r[provKey]).trim()
      acc[p] = (acc[p] || 0) + 1
      return acc
    }, {})
    // เขตหนึ่งๆ มีจังหวัดเดียว — ถ้า areaCode ตรงกับจังหวัดที่มีโรงเรียนน้อยกว่า 500
    const smallProvince = Object.entries(provCounts).find(([, c]) => c < 500 && c > 10)
    if (smallProvince) {
      schools = toSchools(rows.filter(r => String(r[provKey]).trim() === smallProvince[0]))
    }
  }

  if (schools.length === 0) {
    const allCols = Object.keys(sample)
    const samples = allCols.slice(0, 8).map(k => `${k}: ${String(sample[k]).slice(0, 20)}`).join(' | ')
    return NextResponse.json({
      error: `ไม่พบโรงเรียนสำหรับรหัสเขต "${areaCode}" (${rows.length} แถว)`,
      hint: `column ทั้งหมด: ${allCols.join(', ')}\nตัวอย่างแถวแรก: ${samples}`,
    }, { status: 404 })
  }

  return NextResponse.json({ schools, count: schools.length })
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'district') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }
  const areaCode = new URL(req.url).searchParams.get('area_code')?.trim()
  if (!areaCode || !/^\d{4,6}$/.test(areaCode)) {
    return NextResponse.json({ error: 'รหัสเขตพื้นที่ไม่ถูกต้อง' }, { status: 400 })
  }
  try {
    const res = await fetch(
      `https://data.bopp-obec.info/emis/school.php?Area_CODE=${areaCode}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'th,en' }, signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) return NextResponse.json({ error: `OBEC ตอบกลับ ${res.status}` }, { status: 502 })
    const buffer = await res.arrayBuffer()
    let html = new TextDecoder('utf-8').decode(buffer)
    if (!html.includes('โรงเรียน')) {
      try { html = new TextDecoder('windows-874').decode(buffer) } catch {}
    }
    const schools = parseOBECHtml(html)
    if (schools.length === 0) {
      return NextResponse.json({ error: 'ไม่พบโรงเรียน รหัสเขตอาจไม่ถูกต้อง', hint: 'เช่น สพป.เชียงใหม่ เขต 1 = 5001' }, { status: 404 })
    }
    return NextResponse.json({ schools, count: schools.length })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') return NextResponse.json({ error: 'OBEC ตอบช้าเกิน ลองใหม่' }, { status: 504 })
    return NextResponse.json({ error: 'เชื่อมต่อ data.bopp-obec.info ไม่ได้' }, { status: 502 })
  }
}
