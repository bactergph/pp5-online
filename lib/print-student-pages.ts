/** จำนวนนักเรียนสูงสุดต่อหน้ากระดาษ (พิมพ์/PDF) — คนที่ 26 ขึ้นไปขึ้นหน้าใหม่ */
export const PRINT_STUDENTS_PER_PAGE = 25

export function printStudentPageCount(studentCount: number, pageSize = PRINT_STUDENTS_PER_PAGE): number {
  if (studentCount <= 0) return 1
  return Math.ceil(studentCount / pageSize)
}

export function chunkStudentsForPrintPages<T>(items: readonly T[], pageSize = PRINT_STUDENTS_PER_PAGE): T[][] {
  if (items.length === 0) return [[]]
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize) as T[])
  }
  return pages
}

/** จำนวนแถวในตารางต่อหน้า (นักเรียนในหน้า + แถวว่าง) */
export function printPageRowCount(
  studentsOnPage: number,
  {
    pageSize = PRINT_STUDENTS_PER_PAGE,
    minRows,
  }: { pageSize?: number; minRows?: number } = {},
): number {
  const floor = Math.min(pageSize, Math.max(minRows ?? pageSize, studentsOnPage))
  return Math.max(studentsOnPage, floor)
}
