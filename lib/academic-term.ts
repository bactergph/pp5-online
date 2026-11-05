export type AcademicTermDates = {
  term1_start_date?: string | null
  term1_end_date?: string | null
  term2_start_date?: string | null
  term2_end_date?: string | null
}

/** Only school-configured dates determine the current semester; never invent a calendar. */
export function academicTermForDate(year: AcademicTermDates | undefined, today: string): 1 | 2 | null {
  if (!year) return null
  const terms = ([1, 2] as const).map(term => ({ term,
    start: term === 1 ? year.term1_start_date : year.term2_start_date,
    end: term === 1 ? year.term1_end_date : year.term2_end_date,
  })).filter(row => row.start && row.end && row.start <= row.end)
  const current = terms.find(row => today >= row.start! && today <= row.end!)
  if (current) return current.term
  const started = terms.filter(row => row.start! <= today).sort((a, b) => b.start!.localeCompare(a.start!))
  return started[0]?.term ?? terms[0]?.term ?? null
}
