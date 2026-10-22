export type SubjectSemester = 0 | 1 | 2

/** 0 means the catalog subject is available in both semesters. */
export function subjectSemesterTerms(subject: { semester?: number | null; semesters?: number[] }) {
  const source = subject.semester == null ? subject.semesters || [] : [subject.semester]
  const terms = new Set<1 | 2>()
  for (const semester of source) {
    if (semester === 1 || semester === 0) terms.add(1)
    if (semester === 2 || semester === 0) terms.add(2)
  }
  return [...terms].sort()
}

export function defaultSubjectSemester(filter: number): 1 | 2 {
  return filter === 1 ? 1 : 2
}

export function parseSubjectSemester(value: unknown): SubjectSemester {
  if (value !== 0 && value !== 1 && value !== 2) throw new Error('กรุณาเลือกภาคเรียนที่ 1 ภาคเรียนที่ 2 หรือทั้งสองภาคเรียน')
  return value
}
