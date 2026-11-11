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

/** Resolve the current offering while keeping referenced historical IDs readable. */
export function selectClassSubjectOfferings<T extends { id?: string; subject_id: string; classroom_id?: string; semester?: number | null }>(
  rows: readonly T[], level: string | null | undefined, term: ClassSubjectSemester, retainIds: ReadonlySet<string> = new Set(),
): T[] {
  const secondary = isSecondaryClassLevel(level)
  const keyFor = (row: T) => `${row.classroom_id || ''}:${row.subject_id}`
  const semesterFor = (row: T) => row.semester === 1 || row.semester === 2 ? row.semester : 0
  const semesters = new Map<string, Set<ClassSubjectSemester>>()
  for (const row of rows) {
    const key = keyFor(row)
    const seen = semesters.get(key) ?? new Set<ClassSubjectSemester>()
    seen.add(semesterFor(row))
    semesters.set(key, seen)
  }
  return rows.filter(row => {
    const semester = semesterFor(row)
    if (term && semester && semester !== term) return false
    if (row.id && retainIds.has(row.id)) return true
    const seen = semesters.get(keyFor(row))!
    if (!secondary) return semester === 0 || !seen.has(0)
    if (semester !== 0) return true
    return term ? !seen.has(term) : !seen.has(1) || !seen.has(2)
  })
}
