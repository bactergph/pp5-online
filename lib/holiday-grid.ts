export type HolidayGridRow = { date: string; name: string }

export const HOLIDAY_GRID_COLS = [
  { key: 'date' as const, label: 'วันที่', width: 240 },
  { key: 'name' as const, label: 'วันหยุด', width: 520 },
]

export function blankHolidayRow(): HolidayGridRow {
  return { date: '', name: '' }
}

function splitClipboardLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim())
}

export function applyHolidayGridPaste(
  base: HolidayGridRow[],
  startRow: number,
  startCol: number,
  text: string,
): HolidayGridRow[] {
  if (!text.includes('\t') && !text.includes('\n') && !text.includes('\r')) return base

  const lines = splitClipboardLines(text)
  const next = [...base]

  lines.forEach((line, ri) => {
    const cells = line.split('\t')
    const targetRow = startRow + ri
    while (next.length <= targetRow) next.push(blankHolidayRow())
    cells.forEach((cell, ci) => {
      const targetCol = startCol + ci
      if (targetCol < HOLIDAY_GRID_COLS.length) {
        const key = HOLIDAY_GRID_COLS[targetCol].key
        next[targetRow] = { ...next[targetRow], [key]: cell.trim() }
      }
    })
  })

  const compact = next.filter(row => row.date.trim() || row.name.trim())
  return compact.length ? compact : [blankHolidayRow()]
}

export function holidayGridToPasteText(grid: HolidayGridRow[]): string {
  return grid
    .filter(row => row.date.trim() || row.name.trim())
    .map(row => `${row.date.trim()}\t${row.name.trim()}`)
    .join('\n')
}
