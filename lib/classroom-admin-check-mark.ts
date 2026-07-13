/** เครื่องหมายเช็คมาตรฐานในตารางธุรการชั้นเรียน — ใช้ / เหมือนบันทึกเวลาเรียน */
export const CLASSROOM_ADMIN_CHECK_MARK = '/'

export function classroomAdminDoneMark(done: boolean | number | null | undefined): string {
  return done ? CLASSROOM_ADMIN_CHECK_MARK : ''
}
