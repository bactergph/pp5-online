export const DEFAULT_FREE_TEACHER_LIMIT = 25
export function validFreeTeacherLimit(value:unknown):value is number {
  return typeof value==='number'&&Number.isInteger(value)&&value>=DEFAULT_FREE_TEACHER_LIMIT&&value<=2147483647
}
export function freeTeacherLimit(value?:number|null) {
  return validFreeTeacherLimit(value)?value:DEFAULT_FREE_TEACHER_LIMIT
}
