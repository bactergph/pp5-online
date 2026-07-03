import type {
  Pp5SubjectStep,
  SchoolLeaders,
  SubjectGroupHeadMap,
} from './types'
import { PP5_SUBJECT_STEPS, PP5_SUBJECT_STEP_LABELS } from './types'

export type Pp5SubjectApproval = {
  id: string
  class_subject_id: string
  term: number
  status: string
  rejection_note?: string | null
  submitted_at?: string | null
  teacher_signed_at?: string | null
  teacher_id?: string | null
  subject_head_signed_at?: string | null
  subject_head_id?: string | null
  measurement_head_signed_at?: string | null
  measurement_head_id?: string | null
  academic_head_signed_at?: string | null
  academic_head_id?: string | null
  vice_director_signed_at?: string | null
  vice_director_id?: string | null
  director_signed_at?: string | null
  director_id?: string | null
  director_decision?: string | null
}

const STEP_FIELDS: Record<Pp5SubjectStep, { at: keyof Pp5SubjectApproval; id: keyof Pp5SubjectApproval }> = {
  teacher: { at: 'teacher_signed_at', id: 'teacher_id' },
  subject_head: { at: 'subject_head_signed_at', id: 'subject_head_id' },
  measurement_head: { at: 'measurement_head_signed_at', id: 'measurement_head_id' },
  academic_head: { at: 'academic_head_signed_at', id: 'academic_head_id' },
  vice_director: { at: 'vice_director_signed_at', id: 'vice_director_id' },
  director: { at: 'director_signed_at', id: 'director_id' },
}

function hasAssignee(
  step: Pp5SubjectStep,
  school: SchoolLeaders,
  subjectGroup: string | null,
  groupHeads: SubjectGroupHeadMap,
): boolean {
  switch (step) {
    case 'teacher':
      return true
    case 'subject_head': {
      const head = subjectGroup ? groupHeads[subjectGroup] : null
      return Boolean(head?.userId || head?.name)
    }
    case 'measurement_head':
      return Boolean(school.measurement_head_user_id || school.measurement_head_name)
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

export function getPp5SubjectNextStep(
  record: Pp5SubjectApproval,
  school: SchoolLeaders,
  subjectGroup: string | null,
  groupHeads: SubjectGroupHeadMap,
): Pp5SubjectStep | null {
  if (record.status === 'approved' || record.status === 'rejected') return null
  if (record.status !== 'in_review') return null
  for (const step of PP5_SUBJECT_STEPS) {
    if (step === 'teacher') continue
    if (!hasAssignee(step, school, subjectGroup, groupHeads)) continue
    const { at } = STEP_FIELDS[step]
    if (!record[at]) return step
  }
  return null
}

export type WorkflowStepUiState = 'done' | 'current' | 'upcoming' | 'skipped'

export function getPp5SubjectWorkflowProgress(
  record: Pp5SubjectApproval,
  school: SchoolLeaders,
  subjectGroup: string | null,
  groupHeads: SubjectGroupHeadMap,
): Array<{ label: string; state: WorkflowStepUiState }> {
  if (record.status !== 'in_review') return []

  const next = getPp5SubjectNextStep(record, school, subjectGroup, groupHeads)
  const steps: Array<{ label: string; state: WorkflowStepUiState }> = []

  if (record.teacher_signed_at) {
    steps.push({ label: PP5_SUBJECT_STEP_LABELS.teacher, state: 'done' })
  }

  for (const step of PP5_SUBJECT_STEPS) {
    if (step === 'teacher') continue
    const label = PP5_SUBJECT_STEP_LABELS[step]
    if (!hasAssignee(step, school, subjectGroup, groupHeads)) {
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

export function canUserSignPp5SubjectStep(
  userId: string,
  role: string,
  step: Pp5SubjectStep,
  school: SchoolLeaders,
  subjectGroup: string | null,
  groupHeads: SubjectGroupHeadMap,
  teacherId: string | null,
): boolean {
  switch (step) {
    case 'teacher':
      return teacherId === userId || role === 'admin' || role === 'district'
    case 'subject_head': {
      const head = subjectGroup ? groupHeads[subjectGroup] : null
      return head?.userId === userId
    }
    case 'measurement_head':
      return school.measurement_head_user_id === userId
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

export function pp5SubjectStatusLabel(
  record: Pp5SubjectApproval,
  school: SchoolLeaders,
  subjectGroup: string | null,
  groupHeads: SubjectGroupHeadMap,
): string {
  if (record.status === 'approved') return 'อนุมัติแล้ว'
  if (record.status === 'rejected') return 'ไม่อนุมัติ'
  if (record.status === 'draft' || !record.status) {
    return record.teacher_signed_at ? 'ใส่ลายเซ็นแล้ว — พิมพ์ได้' : 'ยังไม่ใส่ลายเซ็น'
  }
  const next = getPp5SubjectNextStep(record, school, subjectGroup, groupHeads)
  if (!next) return 'รอดำเนินการ'
  return `รอ${PP5_SUBJECT_STEP_LABELS[next]}`
}

export { STEP_FIELDS as PP5_SUBJECT_STEP_FIELDS }
