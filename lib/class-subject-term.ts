import { isSecondaryClassLevel } from '@/lib/class-level'

/** 0 = รายวิชาทั้งปี (ประถมและข้อมูลเดิม) · 1/2 = รายวิชาของภาคเรียนนั้น (มัธยม) */
export type ClassSubjectSemester = 0 | 1 | 2

export function classSubjectSemesterForLevel(level: string | null | undefined, term: 1 | 2): ClassSubjectSemester {
  return isSecondaryClassLevel(level) ? term : 0
}

export function classSubjectTerms(semester: number | null | undefined): Array<1 | 2> {
  if (semester === 1) return [1]
  if (semester === 2) return [2]
  return [1, 2]
}
