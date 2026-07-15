import { createServerClient } from '@/lib/supabase'
import type { ClassDocType } from '@/lib/approvals/types'
import { approvalTermFromReport } from '@/lib/approvals/types'

type ReportMode = 'pp5-subject' | 'pp5-class' | 'pp6'

export type ReportDocumentSignatures = {
  teacher?: string | null
  subject_head?: string | null
  measurement_head?: string | null
  academic_head?: string | null
  vice_director?: string | null
  director?: string | null
  homeroom?: string | null
}

type DbClient = ReturnType<typeof createServerClient>

async function loadSignatureMap(db: DbClient, userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return {} as Record<string, string | null>
  const { data } = await db.from('users').select('id, signature_url').in('id', ids)
  return Object.fromEntries((data || []).map(row => [row.id, row.signature_url || null]))
}

function signedUrl(
  map: Record<string, string | null>,
  signedAt: unknown,
  userId: unknown,
) {
  if (!signedAt || typeof userId !== 'string') return null
  return map[userId] || null
}

export async function loadPp5SubjectReportSignatures(
  db: DbClient,
  classSubjectId: string,
  term: 1 | 2,
): Promise<ReportDocumentSignatures> {
  const { data: record } = await db.from('approval_signatures')
    .select('*')
    .eq('class_subject_id', classSubjectId)
    .eq('term', term)
    .maybeSingle()
  if (!record) return {}

  const map = await loadSignatureMap(db, [
    record.teacher_id as string,
    record.subject_head_id as string,
    record.measurement_head_id as string,
    record.academic_head_id as string,
    record.vice_director_id as string,
    record.director_id as string,
  ])

  return {
    teacher: signedUrl(map, record.teacher_signed_at, record.teacher_id),
    subject_head: signedUrl(map, record.subject_head_signed_at, record.subject_head_id),
    measurement_head: signedUrl(map, record.measurement_head_signed_at, record.measurement_head_id),
    academic_head: signedUrl(map, record.academic_head_signed_at, record.academic_head_id),
    vice_director: signedUrl(map, record.vice_director_signed_at, record.vice_director_id),
    director: signedUrl(map, record.director_signed_at, record.director_id),
  }
}

export async function loadClassDocReportSignatures(
  db: DbClient,
  classroomId: string,
  academicYearId: string,
  docType: ClassDocType,
  term: 1 | 2,
  month?: number | null,
): Promise<ReportDocumentSignatures> {
  let query = db.from('class_document_approvals')
    .select('*')
    .eq('classroom_id', classroomId)
    .eq('doc_type', docType)
    .eq('academic_year_id', academicYearId)
    .eq('term', term)

  let record: Record<string, unknown> | null = null
  if (docType === 'classroom_admin' && month != null) {
    const { data: byMonth } = await query.eq('month', month).maybeSingle()
    record = byMonth
    if (!record) {
      const { data: legacy } = await db.from('class_document_approvals')
        .select('*')
        .eq('classroom_id', classroomId)
        .eq('doc_type', docType)
        .eq('academic_year_id', academicYearId)
        .eq('term', term)
        .is('month', null)
        .maybeSingle()
      record = legacy
    }
  } else {
    const { data } = await query.is('month', null).maybeSingle()
    record = data
  }
  if (!record) return {}

  const map = await loadSignatureMap(db, [
    record.homeroom_id as string,
    record.academic_head_id as string,
    record.vice_director_id as string,
    record.director_id as string,
  ])

  return {
    homeroom: signedUrl(map, record.homeroom_signed_at, record.homeroom_id),
    academic_head: signedUrl(map, record.academic_head_signed_at, record.academic_head_id),
    vice_director: signedUrl(map, record.vice_director_signed_at, record.vice_director_id),
    director: signedUrl(map, record.director_signed_at, record.director_id),
  }
}

export async function loadReportDocumentSignatures(
  db: DbClient,
  params: {
    mode?: ReportMode
    classSubjectId?: string
    classroomId: string
    academicYearId: string
    term: 0 | 1 | 2
  },
): Promise<ReportDocumentSignatures> {
  const signTerm = approvalTermFromReport(params.term)
  if (params.mode === 'pp5-subject' && params.classSubjectId) {
    return loadPp5SubjectReportSignatures(db, params.classSubjectId, signTerm)
  }
  if (params.mode === 'pp5-class') {
    return loadClassDocReportSignatures(db, params.classroomId, params.academicYearId, 'pp5_class', signTerm)
  }
  if (params.mode === 'pp6') {
    return loadClassDocReportSignatures(db, params.classroomId, params.academicYearId, 'pp6', signTerm)
  }
  return {}
}
