export type ScheduleSpanSlot = { period: number; break?: boolean }

const PERIOD_LABEL = /(?:^|\s|·)\s*คาบ(?:ที่)?\s*\d+/g

/** Colspan for each lesson period. 0 means an earlier cell already covers it. Breaks stop a run. */
export function periodColSpans(slots: ScheduleSpanSlot[], identity: (period: number) => string) {
  const spans = new Map<number, number>()
  let index = 0
  while (index < slots.length) {
    const slot = slots[index]
    if (slot.break) { index++; continue }
    const key = identity(slot.period).trim()
    let end = index
    if (key) {
      while (end + 1 < slots.length && !slots[end + 1].break && identity(slots[end + 1].period).trim() === key) end++
    }
    spans.set(slot.period, end - index + 1)
    for (let cursor = index + 1; cursor <= end; cursor++) spans.set(slots[cursor].period, 0)
    index = end + 1
  }
  return spans
}

/** Period numbers covered by the cell that starts at `period`. Empty when that period is already covered. */
export function spanPeriods(slots: ScheduleSpanSlot[], spans: Map<number, number>, period: number) {
  const span = spans.get(period) ?? 0
  if (span <= 0) return []
  const periods: number[] = []
  for (const slot of slots) {
    if (slot.break) { if (periods.length) break; continue }
    if (!periods.length && slot.period !== period) continue
    periods.push(slot.period)
    if (periods.length === span) break
  }
  return periods
}

export function stripPeriodLabel(value?: string | null) {
  return (value || '').replace(PERIOD_LABEL, '').replace(/^[·\s]+|[·\s]+$/g, '').replace(/\s{2,}/g, ' ').trim()
}

export function scheduleCellIdentity(parts: Array<string | null | undefined>) {
  return parts.map(part => (part || '').trim()).filter(part => part && part !== '—').join('\n')
}

/** Same lesson across a double period. Period labels in the place line do not keep the cells apart. */
export function pdfCellIdentity(cell?: { line1?: string; line2?: string; line3?: string; line4?: string } | null) {
  const title = (cell?.line1 || '').trim()
  if (!title || title === '—') return ''
  return scheduleCellIdentity([title, cell?.line2, cell?.line3, stripPeriodLabel(cell?.line4)])
}
