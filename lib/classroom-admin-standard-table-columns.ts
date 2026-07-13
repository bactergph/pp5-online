export const CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS = {
  numberPx: 20,
  namePx: 320,
  fieldPx: 90,
} as const

/** @deprecated use CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS */
export const CLASSROOM_ADMIN_HEALTH_INSPECTION_COL_WIDTHS = CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS

export function classroomAdminStandardTableMinWidthPx(fieldCount: number) {
  return CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.numberPx
    + CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.namePx
    + fieldCount * CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.fieldPx
}

export const CLASSROOM_ADMIN_HEALTH_INSPECTION_TABLE_MIN_WIDTH_PX =
  classroomAdminStandardTableMinWidthPx(7)

export const CLASSROOM_ADMIN_WEIGHT_HEIGHT_TABLE_MIN_WIDTH_PX =
  classroomAdminStandardTableMinWidthPx(3)

export function classroomAdminStandardTableWidthStyle(fieldCount: number): Record<string, string> {
  return { '--ca-inspection-table-w': `${classroomAdminStandardTableMinWidthPx(fieldCount)}px` }
}

/** html2canvas มักไม่เคารพ <col> — บังคับความกว้าง inline ก่อนสร้าง PDF */
export function applyClassroomAdminStandardTablePdfColumnWidths(root: ParentNode) {
  const { numberPx, namePx, fieldPx } = CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS
  root.querySelectorAll<HTMLTableElement>('.attendance-print-inspection-table').forEach(table => {
    const fieldCount = table.querySelectorAll('.attendance-print-inspection-field-col').length
    const tableWidth = classroomAdminStandardTableMinWidthPx(fieldCount)
    const columnWidths = [numberPx, namePx, ...Array.from({ length: fieldCount }, () => fieldPx)]

    table.style.width = `${tableWidth}px`
    table.style.maxWidth = `${tableWidth}px`
    table.style.tableLayout = 'fixed'

    table.querySelectorAll<HTMLElement>('.attendance-print-inspection-number-col').forEach(col => {
      col.style.width = `${numberPx}px`
    })
    table.querySelectorAll<HTMLElement>('.attendance-print-inspection-name-col').forEach(col => {
      col.style.width = `${namePx}px`
    })
    table.querySelectorAll<HTMLElement>('.attendance-print-inspection-field-col').forEach(col => {
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
