export type ApprovalStatus = 'draft' | 'in_review' | 'approved' | 'rejected'

export type Pp5SubjectStep =
  | 'teacher'
  | 'subject_head'
  | 'measurement_head'
  | 'academic_head'
  | 'vice_director'
  | 'director'

export type ClassDocType = 'pp5_class' | 'pp6' | 'classroom_admin'

export type ClassDocStep = 'homeroom' | 'academic_head' | 'vice_director' | 'director'

export type SchoolLeaders = {
  director_user_id: string | null
  vice_director_user_id: string | null
  acting_director_user_id: string | null
  academic_head_user_id: string | null
  measurement_head_user_id: string | null
  vice_director_name: string | null
  measurement_head_name: string | null
}

export type SubjectGroupHeadMap = Record<string, { userId: string | null; name: string }>

/** ปพ.5 รายวิชา: ครูสอน → หัวหน้ากลุ่มสาระ → หัวหน้างานวัดผล → หัวหน้าวิชาการ → รองผอ. (ถ้ามี) → ผอ./รักษาการ */
export const PP5_SUBJECT_STEPS: Pp5SubjectStep[] = [
  'teacher',
  'subject_head',
  'measurement_head',
  'academic_head',
  'vice_director',
  'director',
]

/** ปพ.5 รายห้อง / ปพ.6 */
export const CLASS_DOC_STANDARD_STEPS: ClassDocStep[] = [
  'homeroom',
  'academic_head',
  'vice_director',
  'director',
]

/** ธุรการชั้นเรียน: ครูประจำชั้น → ผอ./รักษาการ */
export const CLASSROOM_ADMIN_STEPS: ClassDocStep[] = ['homeroom', 'director']

export const PP5_SUBJECT_STEP_LABELS: Record<Pp5SubjectStep, string> = {
  teacher: 'ครูผู้สอน',
  subject_head: 'หัวหน้ากลุ่มสาระ',
  measurement_head: 'หัวหน้างานวัดผล',
  academic_head: 'หัวหน้าวิชาการ',
  vice_director: 'รองผู้อำนวยการ',
  director: 'ผู้อำนวยการ',
}

export const CLASS_DOC_STEP_LABELS: Record<ClassDocStep, string> = {
  homeroom: 'ครูประจำชั้น',
  academic_head: 'หัวหน้าวิชาการ',
  vice_director: 'รองผู้อำนวยการ',
  director: 'ผู้อำนวยการ',
}

export const CLASS_DOC_TYPE_LABELS: Record<ClassDocType, string> = {
  pp5_class: 'ปพ.5 รวมชั้นเรียน',
  pp6: 'ปพ.6',
  classroom_admin: 'ธุรการชั้นเรียน',
}

export function classDocSteps(docType: ClassDocType): ClassDocStep[] {
  return docType === 'classroom_admin' ? CLASSROOM_ADMIN_STEPS : CLASS_DOC_STANDARD_STEPS
}

/** แปลงเทอมรายงาน (0=ทั้งปี) เป็นเทอมลงนาม */
export function approvalTermFromReport(term: number): 1 | 2 {
  return term === 2 ? 2 : 1
}
