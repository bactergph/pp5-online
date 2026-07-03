import type { ClassDocumentApproval } from './class-document'
import { CLASS_DOC_STEP_FIELDS } from './class-document'
import type { Pp5SubjectApproval } from './pp5-subject'
import type { ClassDocType, SchoolLeaders } from './types'
import { classDocSteps } from './types'

const PRIVILEGED_CANCEL_ROLES = new Set(['admin', 'principal', 'academic_head', 'deputy_principal'])

export function isPrivilegedProposalCanceller(
  role: string,
  userId: string,
  school: SchoolLeaders,
): boolean {
  if (PRIVILEGED_CANCEL_ROLES.has(role)) return true
  if (school.director_user_id === userId || school.acting_director_user_id === userId) return true
  if (school.academic_head_user_id === userId) return true
  if (school.vice_director_user_id === userId) return true
  return false
}

export function pp5SubjectHasApproverSignatures(record: Pp5SubjectApproval) {
  return Boolean(
    record.subject_head_signed_at
    || record.measurement_head_signed_at
    || record.academic_head_signed_at
    || record.vice_director_signed_at
    || record.director_signed_at,
  )
}

export function classDocHasApproverSignatures(record: ClassDocumentApproval, docType: ClassDocType) {
  for (const step of classDocSteps(docType)) {
    if (step === 'homeroom') continue
    const { at } = CLASS_DOC_STEP_FIELDS[step]
    if (record[at]) return true
  }
  return false
}

export function canUserCancelProposal(params: {
  role: string
  userId: string
  school: SchoolLeaders
  isInitiator: boolean
  status: string
  hasApproverSignatures: boolean
}) {
  if (params.status !== 'in_review') return false
  if (!params.hasApproverSignatures) {
    return params.isInitiator
      || isPrivilegedProposalCanceller(params.role, params.userId, params.school)
  }
  return isPrivilegedProposalCanceller(params.role, params.userId, params.school)
}

export function pp5SubjectCancelProposalReset(now: string) {
  return {
    status: 'draft',
    submitted_at: null,
    rejection_note: null,
    subject_head_signed_at: null,
    subject_head_id: null,
    measurement_head_signed_at: null,
    measurement_head_id: null,
    academic_head_signed_at: null,
    academic_head_id: null,
    vice_director_signed_at: null,
    vice_director_id: null,
    director_signed_at: null,
    director_id: null,
    director_decision: null,
    updated_at: now,
  }
}

export function classDocCancelProposalReset(now: string) {
  return {
    status: 'draft',
    submitted_at: null,
    rejection_note: null,
    academic_head_signed_at: null,
    academic_head_id: null,
    vice_director_signed_at: null,
    vice_director_id: null,
    director_signed_at: null,
    director_id: null,
    director_decision: null,
    updated_at: now,
  }
}
