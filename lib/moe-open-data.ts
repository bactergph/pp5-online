/** แปลง Open Data กระทรวงศึกษาธิการ (GetopenData49) → แถว schools */

export type MoeSchoolRaw = {
  schoolID?: string
  schoolTypeName?: string
  departmentNameThai?: string
  provinceNameThai?: string
  districtNameThai?: string
  subDistrictNameThai?: string
  villageNumber?: string | number
  houseNumber?: string | number
  street?: string
  soi?: string
  trok?: string
  postcode?: string | number
  telephone1?: string
  telephone2?: string
}

export type CatalogSchoolRow = {
  name: string
  department: string | null
  area_office: string | null
  district: string | null
  province: string | null
  address: string | null
  phone: string | null
  moe_school_id: string | null
}

export function schoolCatalogKey(s: { name?: string | null; district?: string | null; province?: string | null }) {
  return `${String(s.name || '').trim()}|${String(s.district || '').trim()}|${String(s.province || '').trim()}`
}

function norm(v: unknown) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  if (!s || s === '-' || s === '0') return ''
  return s
}

function schoolNameFromMoe(raw: MoeSchoolRaw) {
  // ใช้ชื่อตามกระทรวงตรง ๆ — อย่าเติมคำนำหน้าเอง (กันชื่อซ้ำคนละสตริง)
  return norm(raw.schoolTypeName)
}

function phoneFromMoe(raw: MoeSchoolRaw) {
  return norm(raw.telephone1) || norm(raw.telephone2) || ''
}

function addressFromMoe(raw: MoeSchoolRaw) {
  const bits: string[] = []
  const house = norm(raw.houseNumber)
  const moo = norm(raw.villageNumber)
  const trok = norm(raw.trok)
  const soi = norm(raw.soi)
  const street = norm(raw.street)
  const tambon = norm(raw.subDistrictNameThai)
  const postal = norm(raw.postcode)
  if (house) bits.push(`เลขที่ ${house}`)
  if (moo) bits.push(`หมู่ ${moo}`)
  if (trok) bits.push(trok.startsWith('ตรอก') ? trok : `ตรอก${trok}`)
  if (soi) bits.push(soi.startsWith('ซอย') ? soi : `ซอย${soi}`)
  if (street) bits.push(street.startsWith('ถ.') || street.startsWith('ถนน') ? street : `ถ.${street}`)
  if (tambon) bits.push(tambon.startsWith('ต.') || tambon.startsWith('แขวง') ? tambon : `ต.${tambon}`)
  if (postal) bits.push(postal)
  return bits.join(' ')
}

export function mapMoeRow(raw: MoeSchoolRaw): CatalogSchoolRow | null {
  const name = schoolNameFromMoe(raw)
  if (!name) return null
  const moeId = norm(raw.schoolID) || null
  return {
    name,
    department: norm(raw.departmentNameThai) || null,
    area_office: null,
    district: norm(raw.districtNameThai) || null,
    province: norm(raw.provinceNameThai) || null,
    address: addressFromMoe(raw) || null,
    phone: phoneFromMoe(raw) || null,
    moe_school_id: moeId,
  }
}

export function moeOpenDataUrl(yearBe: number, period: number) {
  return `https://exchange-api.moe.go.th/api/openv1/GetopenData49/${yearBe}/${period}`
}

export async function fetchMoeOpenSchools(yearBe: number, period: number): Promise<CatalogSchoolRow[]> {
  const url = moeOpenDataUrl(yearBe, period)
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'pp5-online/1.0 (school-catalog-import)',
    },
    signal: AbortSignal.timeout(120_000),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`กระทรวงตอบกลับ ${res.status}`)
  }
  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error('รูปแบบข้อมูลจากกระทรวงไม่ถูกต้อง')
  }
  const seenId = new Set<string>()
  const seenKey = new Set<string>()
  const out: CatalogSchoolRow[] = []
  for (const row of data as MoeSchoolRaw[]) {
    const mapped = mapMoeRow(row)
    if (!mapped) continue
    if (mapped.moe_school_id) {
      if (seenId.has(mapped.moe_school_id)) continue
      seenId.add(mapped.moe_school_id)
    }
    const k = schoolCatalogKey(mapped)
    if (seenKey.has(k)) continue
    seenKey.add(k)
    out.push(mapped)
  }
  return out
}
