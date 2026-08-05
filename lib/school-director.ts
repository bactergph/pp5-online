import { ensureThaiNamePrefixJoined } from '@/lib/roles'

export type SchoolDirectorInfo = {
  name?: string | null
  director_name?: string | null
  acting_director?: string | null
  acting_director_position?: string | null
}

export function directorDisplayName(
  school: SchoolDirectorInfo | null | undefined,
  fallback = '-',
) {
  const raw = school?.acting_director?.trim() || school?.director_name?.trim() || ''
  return ensureThaiNamePrefixJoined(raw) || fallback
}

export function directorActingPositionLine(
  school: SchoolDirectorInfo | null | undefined,
): string | null {
  if (!school?.acting_director?.trim()) return null
  const position = school.acting_director_position?.trim() || 'ครู'
  if (position.includes('รองผู้อำนวยการ')) {
    return `${position} ปฏิบัติหน้าที่รักษาราชการแทน`
  }
  return `${position} รักษาการในตำแหน่ง`
}

export function directorSchoolLine(
  school: SchoolDirectorInfo | null | undefined,
  nameFallback = '-',
) {
  return `ผู้อำนวยการโรงเรียน${school?.name?.trim() || nameFallback}`
}
