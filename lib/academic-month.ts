/** School year runs from May to April; January belongs to the following calendar year. */
export function setAcademicMonth(monthKey: string, month: number): string {
  const [year, baseMonth] = monthKey.split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(baseMonth) || baseMonth < 1 || baseMonth > 12 || !Number.isInteger(month) || month < 1 || month > 12) throw Error('เดือนหรือปีไม่ถูกต้อง')
  const academicYear = year - (baseMonth <= 4 ? 1 : 0)
  return `${academicYear + (month <= 4 ? 1 : 0)}-${String(month).padStart(2, '0')}`
}
export function calendarYearBe(monthKey: string): number {
  return Number(monthKey.slice(0, 4)) + 543
}
