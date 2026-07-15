import type { ClassDocType } from './types'

export type ApprovalDocKind = 'pp5_subject' | ClassDocType

export type ApprovalSubmissionHistoryItem = {
  id: string
  submitted_at: string
  completed_at: string | null
  status: 'in_review' | 'approved' | 'rejected'
  status_label: string
  rejection_note: string | null
  cycle: number
}

type Db = ReturnType<typeof import('@/lib/supabase').createServerClient>

type SubmissionTarget = {
  schoolId: string
  docKind: ApprovalDocKind
  term: number
  classSubjectId?: string | null
  classroomId?: string | null
  month?: number | null
}

function submissionStatusLabel(status: string, rejectionNote?: string | null) {
  if (status === 'rejected' && rejectionNote === 'ยกเลิกการเสนอเซ็น') return 'ยกเลิกเสนอเซ็น'
  if (status === 'approved') return 'อนุมัติแล้ว'
  if (status === 'rejected') return 'ส่งกลับแก้ไข'
  return 'รออนุมัติ'
}

function submissionFilters(target: SubmissionTarget) {
  const filters: Record<string, string | number> = {
    school_id: target.schoolId,
    doc_kind: target.docKind,
    term: target.term,
  }
  if (target.docKind === 'pp5_subject') {
    filters.class_subject_id = target.classSubjectId!
  } else {
    filters.classroom_id = target.classroomId!
  }
  return filters
}

function submissionInsertRow(target: SubmissionTarget, submittedBy: string, submittedAt: string) {
  return {
    school_id: target.schoolId,
    doc_kind: target.docKind,
    term: target.term,
    month: target.month ?? null,
    class_subject_id: target.docKind === 'pp5_subject' ? target.classSubjectId : null,
    classroom_id: target.docKind === 'pp5_subject' ? null : target.classroomId,
    submitted_at: submittedAt,
    status: 'in_review' as const,
    submitted_by: submittedBy,
  }
}

export async function recordApprovalSubmissionStart(
  db: Db,
  target: SubmissionTarget,
  submittedBy: string,
  submittedAt: string,
) {
  const { error } = await db.from('document_approval_submissions').insert(
    submissionInsertRow(target, submittedBy, submittedAt),
  )
  if (error?.message?.includes('document_approval_submissions')) return
  if (error) throw new Error(error.message)
}

export async function completeActiveApprovalSubmission(
  db: Db,
  target: SubmissionTarget,
  status: 'approved' | 'rejected',
  completedAt: string,
  rejectionNote?: string | null,
) {
  let query = db.from('document_approval_submissions')
    .select('id')
    .match(submissionFilters(target))
    .eq('status', 'in_review')
    .order('submitted_at', { ascending: false })
    .limit(1)

  if (target.month != null) {
    query = query.eq('month', target.month)
  } else {
    query = query.is('month', null)
  }

  const { data: rows, error: readError } = await query
  if (readError?.message?.includes('document_approval_submissions')) return
  if (readError) throw new Error(readError.message)
  if (!rows?.length) return

  const { error } = await db.from('document_approval_submissions').update({
    status,
    completed_at: completedAt,
    rejection_note: rejectionNote?.trim() || null,
  }).eq('id', rows[0].id)

  if (error) throw new Error(error.message)
}

export async function archiveLegacyApprovalCycle(
  db: Db,
  target: SubmissionTarget,
  legacy: {
    submitted_at: string | null | undefined
    status: string
    completed_at?: string | null
    rejection_note?: string | null
    submitted_by?: string | null
  },
) {
  if (!legacy.submitted_at) return
  if (legacy.status !== 'approved' && legacy.status !== 'rejected') return

  const { data: duplicate, error: dupError } = await db.from('document_approval_submissions')
    .select('id')
    .match(submissionFilters(target))
    .eq('submitted_at', legacy.submitted_at)
    .maybeSingle()

  if (dupError?.message?.includes('document_approval_submissions')) return
  if (dupError) throw new Error(dupError.message)
  if (duplicate) return

  const { error } = await db.from('document_approval_submissions').insert({
    ...submissionInsertRow(target, legacy.submitted_by || '', legacy.submitted_at),
    status: legacy.status,
    completed_at: legacy.completed_at || legacy.submitted_at,
    rejection_note: legacy.rejection_note || null,
    submitted_by: legacy.submitted_by || null,
  })
  if (error?.message?.includes('document_approval_submissions')) return
  if (error) throw new Error(error.message)
}

export async function fetchApprovalSubmissionHistory(
  db: Db,
  target: SubmissionTarget,
  legacy?: {
    submitted_at: string | null | undefined
    status: string
    completed_at?: string | null
    rejection_note?: string | null
  } | null,
): Promise<ApprovalSubmissionHistoryItem[]> {
  const { data, error } = await db.from('document_approval_submissions')
    .select('id, submitted_at, completed_at, status, rejection_note')
    .match(submissionFilters(target))
    .order('submitted_at', { ascending: false })

  if (error?.message?.includes('document_approval_submissions')) {
    if (legacy?.submitted_at && (legacy.status === 'approved' || legacy.status === 'rejected')) {
      return [{
        id: 'legacy',
        submitted_at: legacy.submitted_at,
        completed_at: legacy.completed_at || legacy.submitted_at,
        status: legacy.status as 'approved' | 'rejected',
        status_label: submissionStatusLabel(legacy.status, legacy.rejection_note),
        rejection_note: legacy.rejection_note || null,
        cycle: 1,
      }]
    }
    return []
  }
  if (error) throw new Error(error.message)

  const rows = data || []
  if (!rows.length && legacy?.submitted_at && (legacy.status === 'approved' || legacy.status === 'rejected')) {
    rows.push({
      id: 'legacy',
      submitted_at: legacy.submitted_at,
      completed_at: legacy.completed_at || legacy.submitted_at,
      status: legacy.status,
      rejection_note: legacy.rejection_note || null,
    })
  }

  const total = rows.length
  return rows.map((row, index) => ({
    id: row.id,
    submitted_at: row.submitted_at,
    completed_at: row.completed_at,
    status: row.status as ApprovalSubmissionHistoryItem['status'],
    status_label: submissionStatusLabel(row.status, row.rejection_note),
    rejection_note: row.rejection_note,
    cycle: total - index,
  }))
}
