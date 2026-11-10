import { CLASSROOM_ADMIN_CHECK_MARK } from '@/lib/classroom-admin-check-mark'

export function isClassroomAdminDrawnCheck(value: string) {
  return value === CLASSROOM_ADMIN_CHECK_MARK || value === '✓' || value === '✔'
}

/** เครื่องหมายถูกเส้นเดียวกันทุกช่อง ขนาดตามตัวอักษรในตารางและไม่ล้นช่อง */
export default function ClassroomAdminCheckMark() {
  return (
    <svg className="attendance-print-check" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2.1 6.2 4.7 8.8 9.9 3.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
