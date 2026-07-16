import { CLASSROOM_ADMIN_A4_LANDSCAPE_PX_96DPI } from '@/lib/classroom-admin-a4-landscape'

/** คอลัมน์ตารางตรวจสุขภาพ (7 ช่องแคบ) — ความกว้างรวมพอดีกระดาษ */
export const CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS = {
  numberPx: 36,
  namePx: 280,
  fieldPx: 96,
} as const

/**
 * คอลัมน์ตารางน้ำหนัก/ส่วนสูง (4 ช่องตัวเลข) — กางเต็มความกว้างเนื้อหา A4 แนวนอน
 * pad ซ้ายขวา ~18mm รวม ≈ 136px ที่ 96dpi → เนื้อหา ≈ 987px
 */
const WEIGHT_CONTENT_PAD_PX = 136
export const CLASSROOM_ADMIN_WEIGHT_HEIGHT_COL_WIDTHS = {
  numberPx: 48,
  namePx: 320,
  fieldPx: 155,
} as const

/** @deprecated use CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS */
export const CLASSROOM_ADMIN_HEALTH_INSPECTION_COL_WIDTHS = CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS

export function classroomAdminStandardTableMinWidthPx(fieldCount: number) {
  return CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.numberPx
    + CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.namePx
    + fieldCount * CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.fieldPx
}

export function classroomAdminWeightHeightTableWidthPx() {
  const { numberPx, namePx, fieldPx } = CLASSROOM_ADMIN_WEIGHT_HEIGHT_COL_WIDTHS
  const natural = numberPx + namePx + 4 * fieldPx
  const sheetContent = CLASSROOM_ADMIN_A4_LANDSCAPE_PX_96DPI.width - WEIGHT_CONTENT_PAD_PX
  return Math.max(natural, sheetContent)
}

export const CLASSROOM_ADMIN_HEALTH_INSPECTION_TABLE_MIN_WIDTH_PX =
  classroomAdminStandardTableMinWidthPx(7)

export const CLASSROOM_ADMIN_WEIGHT_HEIGHT_TABLE_MIN_WIDTH_PX =
  classroomAdminWeightHeightTableWidthPx()

export function classroomAdminStandardTableWidthStyle(fieldCount: number): Record<string, string> {
  return { '--ca-inspection-table-w': `${classroomAdminStandardTableMinWidthPx(fieldCount)}px` }
}

export function classroomAdminWeightHeightTableWidthStyle(): Record<string, string> {
  return { '--ca-weight-table-w': `${classroomAdminWeightHeightTableWidthPx()}px` }
}

/** html2canvas มักไม่เคารพ <col> — บังคับความกว้าง inline ก่อนสร้าง PDF */
export function applyClassroomAdminStandardTablePdfColumnWidths(root: ParentNode) {
  const inspection = CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS
  root.querySelectorAll<HTMLTableElement>('.attendance-print-inspection-table:not(.attendance-print-weight-table)').forEach(table => {
    const fieldCount = table.querySelectorAll('.attendance-print-inspection-field-col').length
    const tableWidth = classroomAdminStandardTableMinWidthPx(fieldCount)
    const columnWidths = [
      inspection.numberPx,
      inspection.namePx,
      ...Array.from({ length: fieldCount }, () => inspection.fieldPx),
    ]

    table.style.width = `${tableWidth}px`
    table.style.maxWidth = `${tableWidth}px`
    table.style.tableLayout = 'fixed'

    table.querySelectorAll<HTMLElement>('.attendance-print-inspection-number-col').forEach(col => {
      col.style.width = `${inspection.numberPx}px`
    })
    table.querySelectorAll<HTMLElement>('.attendance-print-inspection-name-col').forEach(col => {
      col.style.width = `${inspection.namePx}px`
    })
    table.querySelectorAll<HTMLElement>('.attendance-print-inspection-field-col').forEach(col => {
      col.style.width = `${inspection.fieldPx}px`
    })

    table.querySelectorAll('thead tr').forEach(row => {
      row.querySelectorAll('th').forEach((cell, index) => {
        if (columnWidths[index]) (cell as HTMLElement).style.width = `${columnWidths[index]}px`
      })
    })

    const firstBodyRow = table.querySelector('tbody tr')
    firstBodyRow?.querySelectorAll('td').forEach((cell, index) => {
      if (columnWidths[index]) (cell as HTMLElement).style.width = `${columnWidths[index]}px`
    })
  })

  const weight = CLASSROOM_ADMIN_WEIGHT_HEIGHT_COL_WIDTHS
  root.querySelectorAll<HTMLTableElement>('.attendance-print-weight-table').forEach(table => {
    const tableWidth = classroomAdminWeightHeightTableWidthPx()
    // กระจายความกว้างส่วนที่เหลือให้ 4 คอลัมน์ข้อมูลเท่าๆ กัน
    const fixed = weight.numberPx + weight.namePx
    const fieldPx = Math.floor((tableWidth - fixed) / 4)
    const columnWidths = [weight.numberPx, weight.namePx, fieldPx, fieldPx, fieldPx, fieldPx]

    table.style.width = `${tableWidth}px`
    table.style.maxWidth = `${tableWidth}px`
    table.style.tableLayout = 'fixed'

    table.querySelectorAll<HTMLElement>('.attendance-print-weight-number-col').forEach(col => {
      col.style.width = `${weight.numberPx}px`
    })
    table.querySelectorAll<HTMLElement>('.attendance-print-weight-name-col').forEach(col => {
      col.style.width = `${weight.namePx}px`
    })
    table.querySelectorAll<HTMLElement>('.attendance-print-weight-field-col').forEach(col => {
      col.style.width = `${fieldPx}px`
    })

    table.querySelectorAll('thead tr').forEach(row => {
      row.querySelectorAll('th').forEach((cell, index) => {
        if (columnWidths[index]) (cell as HTMLElement).style.width = `${columnWidths[index]}px`
      })
    })

    const firstBodyRow = table.querySelector('tbody tr')
    firstBodyRow?.querySelectorAll('td').forEach((cell, index) => {
      if (columnWidths[index]) (cell as HTMLElement).style.width = `${columnWidths[index]}px`
    })
  })
}
