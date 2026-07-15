import type { ClassDocStep, ClassDocType, SchoolLeaders } from './types'
import { CLASS_DOC_STEP_LABELS, classDocSteps } from './types'

export type ClassDocumentApproval = {
  id: string
  doc_type: string
  classroom_id: string
  academic_year_id: string
  term: number
  month?: number | null
  status: string
  rejection_note?: string | null
  submitted_at?: string | null
  homeroom_signed_at?: string | null
  homeroom_id?: string | null
  academic_head_signed_at?: string | null
  academic_head_id?: string | null
  vice_director_signed_at?: string | null
  vice_director_id?: string | null
  director_signed_at?: string | null
  director_id?: string | null
  director_decision?: string | null
}

const STEP_FIELDS: Record<ClassDocStep, { at: keyof ClassDocumentApproval; id: keyof ClassDocumentApproval }> = {
  homeroom: { at: 'homeroom_signed_at', id: 'homeroom_id' },
  academic_head: { at: 'academic_head_signed_at', id: 'academic_head_id' },
  vice_director: { at: 'vice_director_signed_at', id: 'vice_director_id' },
  director: { at: 'director_signed_at', id: 'director_id' },
}

function hasClassStepAssignee(step: ClassDocStep, school: SchoolLeaders): boolean {
  switch (step) {
    case 'homeroom':
      return true
    case 'academic_head':
      return Boolean(school.academic_head_user_id)
    case 'vice_director':
      return Boolean(school.vice_director_user_id || school.vice_director_name)
    case 'director':
      return Boolean(school.director_user_id || school.acting_director_user_id)
    default:
      return false
  }
}

export function getClassDocNextStep(
  record: ClassDocumentApproval,
  school: SchoolLeaders,
  docType: ClassDocType,
): ClassDocStep | null {
  if (record.status === 'approved' || record.status === 'rejected') return null
  if (record.status !== 'in_review') return null
  if (!record.homeroom_signed_at) return null
  for (const step of classDocSteps(docType)) {
    if (step === 'homeroom') continue
    if (!hasClassStepAssignee(step, school)) continue
    const { at } = STEP_FIELDS[step]
    if (!record[at]) return step
  }
  return null
}

export type WorkflowStepUiState = 'done' | 'current' | 'upcoming' | 'skipped'

export function getClassDocWorkflowProgress(
  record: ClassDocumentApproval,
  school: SchoolLeaders,
  docType: ClassDocType,
): Array<{ label: string; state: WorkflowStepUiState }> {
  if (record.status !== 'in_review') return []

  const next = getClassDocNextStep(record, school, docType)
  const steps: Array<{ label: string; state: WorkflowStepUiState }> = []

  if (record.homeroom_signed_at) {
    steps.push({ label: CLASS_DOC_STEP_LABELS.homeroom, state: 'done' })
  }

  for (const step of classDocSteps(docType)) {
    if (step === 'homeroom') continue
    const label = CLASS_DOC_STEP_LABELS[step]
    if (!hasClassStepAssignee(step, school)) {
      steps.push({ label, state: 'skipped' })
      continue
    }
    const { at } = STEP_FIELDS[step]
    const signed = Boolean(record[at])
    if (step === next) steps.push({ label, state: 'current' })
    else if (signed) steps.push({ label, state: 'done' })
    else steps.push({ label, state: 'upcoming' })
  }

  return steps
}

export function canUserSignClassDocStep(
  userId: string,
  role: string,
  step: ClassDocStep,
  school: SchoolLeaders,
  homeroomTeacherId: string | null,
  homeroomTeacher2Id: string | null,
): boolean {
  switch (step) {
    case 'homeroom':
      return homeroomTeacherId === userId
        || homeroomTeacher2Id === userId
        || role === 'admin'
        || role === 'district'
    case 'academic_head':
      return school.academic_head_user_id === userId
        || role === 'academic_head'
        || role === 'deputy_principal'
    case 'vice_director':
      return school.vice_director_user_id === userId || role === 'deputy_principal'
    case 'director':
      return school.director_user_id === userId
        || school.acting_director_user_id === userId
        || role === 'principal'
    default:
      return false
  }
}

export function classDocStatusLabel(
  record: ClassDocumentApproval,
  school: SchoolLeaders,
  docType: ClassDocType,
): string {
  if (record.status === 'approved') return 'อนุมัติแล้ว'
  if (record.status === 'rejected') return 'ไม่อนุมัติ'
  if (record.status === 'draft' || !record.status) {
    return record.homeroom_signed_at ? 'ใส่ลายเซ็นแล้ว — พิมพ์ได้' : 'ยังไม่ใส่ลายเซ็น'
  }
  const next = getClassDocNextStep(record, school, docType)
  if (!next) return 'รอดำเนินการ'
  return `รอ${CLASS_DOC_STEP_LABELS[next]}`
}

export { STEP_FIELDS as CLASS_DOC_STEP_FIELDS }
