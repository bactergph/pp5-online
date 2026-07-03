const AREA_OFFICE_PREFIXES: Array<{ abbr: string; full: string }> = [
  { abbr: 'สพป.', full: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษา' },
  { abbr: 'สพม.', full: 'สำนักงานเขตพื้นที่การศึกษามัธยมศึกษา' },
]

/** Expand สพป./สพม. abbreviations to full official names for display. */
export function expandEducationAreaOffice(value: string | null | undefined) {
  const trimmed = (value || '').trim()
  if (!trimmed) return trimmed

  for (const { abbr, full } of AREA_OFFICE_PREFIXES) {
    if (trimmed.startsWith(abbr)) {
      const rest = trimmed.slice(abbr.length).trim()
      const expanded = rest ? `${full} ${rest}` : full
      // Keep "เขต N" on the same line when rendered inline or in narrow columns.
      return expanded.replace(/\s+(เขต\s+\d+)\s*$/, '\u00A0$1')
    }
  }

  return trimmed
}
