export const DEPUTY_PRINCIPAL_ROLE = 'deputy_principal' as const

export const ACADEMIC_HEAD_ROLES = ['academic_head', DEPUTY_PRINCIPAL_ROLE] as const

export const ROLE_LABELS: Record<string, string> = {
  district: 'สำนักงานเขต',
  admin: 'ผู้ดูแลโรงเรียน',
  principal: 'ผู้อำนวยการ',
  deputy_principal: 'รองผู้อำนวยการ',
  academic_head: 'หัวหน้าวิชาการ',
  teacher: 'ครูผู้สอน',
}

/** คำนำหน้าไทยที่พบบ่อย — เรียงยาวก่อนเพื่อไม่ให้ "นาง" ชน "นางสาว" */
const THAI_NAME_PREFIXES = [
  'เด็กชาย',
  'เด็กหญิง',
  'นางสาว',
  'นาย',
  'นาง',
  'ด.ช.',
  'ด.ญ.',
  'น.ส.',
] as const

/**
 * ติดคำนำหน้ากับชื่อแบบไม่มีช่องว่าง
 * เช่น "นางสาว ศิวาพร" / "นางสาวศิวาพร" → "นางสาวศิวาพร"
 */
export function ensureThaiNamePrefixJoined(name?: string | null) {
  const trimmed = (name || '').trim()
  if (!trimmed) return ''
  for (const prefix of THAI_NAME_PREFIXES) {
    if (!trimmed.startsWith(prefix)) continue
    const rest = trimmed.slice(prefix.length).trimStart()
    if (!rest) return prefix
    return `${prefix}${rest}`
  }
  return trimmed
}

/** @deprecated ใช้ ensureThaiNamePrefixJoined — คงชื่อเดิมเพื่อไม่พัง import เก่า */
export const ensureThaiNamePrefixSpace = ensureThaiNamePrefixJoined

export function formatStaffName(prefix?: string | null, fullName?: string | null) {
  const p = (prefix || '').trim()
  const n = (fullName || '').trim()
  if (!p) return ensureThaiNamePrefixJoined(n)
  if (!n) return p
  return ensureThaiNamePrefixJoined(`${p}${n}`)
}

export function isAcademicHeadRole(role: string) {
  return (ACADEMIC_HEAD_ROLES as readonly string[]).includes(role)
}

/** เมนู/สิทธิ์นำทาง — รอง ผอ. ที่รักษาการได้สิทธิ์ผู้อำนวยการ */
export function resolveNavRole(role: string, isActingDirector: boolean) {
  if (isActingDirector) return 'principal'
  if (role === DEPUTY_PRINCIPAL_ROLE) return 'academic_head'
  return role
}

export function roleIncludesAcademicHead(roles: readonly string[]) {
  return roles.some(r => isAcademicHeadRole(r) || r === 'admin' || r === 'district')
}

export function hasRoleInList(role: string, allowed: readonly string[]) {
  if (allowed.includes(role)) return true
  if (role === DEPUTY_PRINCIPAL_ROLE && allowed.includes('academic_head')) return true
  return false
}
