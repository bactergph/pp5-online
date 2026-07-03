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

export function formatStaffName(prefix?: string | null, fullName?: string | null) {
  return `${prefix || ''} ${fullName || ''}`.trim()
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
