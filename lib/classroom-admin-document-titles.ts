export type ClassroomAdminReportKey =
  | 'attendance'
  | 'brushing'
  | 'milk'
  | 'lunch'
  | 'cleaning'
  | 'saving'
  | 'health'
  | 'inspection'

export type ClassroomAdminMode = 'attendance' | 'activity' | 'weightHeight' | 'healthInspection'

export const CLASSROOM_ADMIN_DOCUMENT_TITLES: Record<ClassroomAdminReportKey, string> = {
  attendance: 'แบบบันทึกเวลาเรียนรายวัน',
  brushing: 'แบบบันทึกการแปรงฟัน',
  milk: 'แบบบันทึกการดื่มนม',
  lunch: 'แบบบันทึกอาหารกลางวัน',
  cleaning: 'แบบบันทึกการทำความสะอาดห้องเรียน',
  saving: 'แบบบันทึกการออมเงิน',
  health: 'แบบบันทึกน้ำหนัก-ส่วนสูง',
  inspection: 'แบบบันทึกการตรวจสุขภาพ',
}

export function classroomAdminDocumentTitle(key: ClassroomAdminReportKey): string {
  return CLASSROOM_ADMIN_DOCUMENT_TITLES[key]
}

export function resolveClassroomAdminDocumentTitle(input: {
  mode: ClassroomAdminMode
  activityType?: 'brushing' | 'milk' | 'lunch' | 'cleaning' | 'saving'
}): string {
  if (input.mode === 'attendance') return CLASSROOM_ADMIN_DOCUMENT_TITLES.attendance
  if (input.mode === 'weightHeight') return CLASSROOM_ADMIN_DOCUMENT_TITLES.health
  if (input.mode === 'healthInspection') return CLASSROOM_ADMIN_DOCUMENT_TITLES.inspection
  if (input.mode === 'activity' && input.activityType) return CLASSROOM_ADMIN_DOCUMENT_TITLES[input.activityType]
  return 'แบบบันทึก'
}
