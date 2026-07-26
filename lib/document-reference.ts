import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { appOrigin } from '@/lib/app-origin'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type DocumentReferencePublic = {
  code: string
  verifyUrl: string
  title: string
  docKind: string
  docKindLabel: string
  status: string
  approvedAt: string | null
  pdfUrl: string | null
  schoolName: string | null
  yearBe: number | null
  term: number | null
}

const DOC_KIND_LABELS: Record<string, string> = {
  pp5_subject: 'ปพ.5 รายวิชา',
  pp5_class: 'ปพ.5 รวมชั้น',
  pp6: 'ปพ.6',
  classroom_admin: 'ธุรการชั้นเรียน',
}

function randomSegment(length: number) {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

export function generateDocumentReferenceCode() {
  return `JR-${randomSegment(4)}-${randomSegment(4)}`
}

export function buildDocumentVerifyUrl(code: string, origin = appOrigin()) {
  return `${origin.replace(/\/$/, '')}/v/${encodeURIComponent(code)}`
}

export async function ensureDocumentReference(params: {
  schoolId: string
  exportId: string
}) {
  const db = createServerClient()
  const { data: existing } = await db.from('document_references')
    .select('id, code')
    .eq('export_id', params.exportId)
    .maybeSingle()
  if (existing?.code) {
    return { id: existing.id as string, code: existing.code as string }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateDocumentReferenceCode()
    const { data, error } = await db.from('document_references')
      .insert({
        school_id: params.schoolId,
        export_id: params.exportId,
        code,
      })
      .select('id, code')
      .single()
    if (!error && data?.code) {
      return { id: data.id as string, code: data.code as string }
    }
    // unique violation on code → retry; other errors abort
    if (error && !/duplicate|unique/i.test(error.message || '')) {
      console.error('[document-reference] insert failed', error.message)
      return null
    }
  }
  return null
}

export async function lookupDocumentReferenceByCode(code: string): Promise<DocumentReferencePublic | null> {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return null
  const db = createServerClient()
  const { data: ref } = await db.from('document_references')
    .select('code, export_id, school_id')
    .eq('code', normalized)
    .maybeSingle()
  if (!ref) return null

  const { data: exportRow } = await db.from('approved_document_exports')
    .select('title, doc_kind, status, approved_at, drive_web_view_link, term, academic_year_id')
    .eq('id', ref.export_id)
    .maybeSingle()
  if (!exportRow) return null

  const [{ data: school }, { data: year }] = await Promise.all([
    db.from('schools').select('name').eq('id', ref.school_id).maybeSingle(),
    db.from('academic_years').select('year_be').eq('id', exportRow.academic_year_id).maybeSingle(),
  ])

  const kind = String(exportRow.doc_kind || '')
  return {
    code: String(ref.code),
    verifyUrl: buildDocumentVerifyUrl(String(ref.code)),
    title: String(exportRow.title || 'เอกสาร'),
    docKind: kind,
    docKindLabel: DOC_KIND_LABELS[kind] || kind,
    status: String(exportRow.status || 'pending'),
    approvedAt: exportRow.approved_at ? String(exportRow.approved_at) : null,
    pdfUrl: exportRow.drive_web_view_link ? String(exportRow.drive_web_view_link) : null,
    schoolName: school?.name ? String(school.name) : null,
    yearBe: year?.year_be != null ? Number(year.year_be) : null,
    term: exportRow.term != null ? Number(exportRow.term) : null,
  }
}

/** โหลด Digital Reference สำหรับรายงาน (มีเมื่ออนุมัติและสร้าง export แล้ว) */
export async function loadReportDigitalReference(params: {
  mode: 'pp5-subject' | 'pp5-class' | 'pp6'
  classSubjectId?: string | null
  classroomId?: string | null
  academicYearId?: string | null
  term: 0 | 1 | 2
}): Promise<{ code: string; verifyUrl: string; status: string; pdfUrl: string | null } | null> {
  try {
    const db = createServerClient()
    const approvalTerm = params.term === 2 ? 2 : 1

    let query = db.from('approved_document_exports')
      .select('id, school_id, status, drive_web_view_link')
      .eq('term', approvalTerm)
      .order('approved_at', { ascending: false })
      .limit(1)

    if (params.mode === 'pp5-subject') {
      if (!params.classSubjectId) return null
      query = query.eq('doc_kind', 'pp5_subject').eq('class_subject_id', params.classSubjectId)
    } else if (params.mode === 'pp5-class') {
      if (!params.classroomId || !params.academicYearId) return null
      query = query.eq('doc_kind', 'pp5_class').eq('classroom_id', params.classroomId).eq('academic_year_id', params.academicYearId)
    } else {
      if (!params.classroomId || !params.academicYearId) return null
      query = query.eq('doc_kind', 'pp6').eq('classroom_id', params.classroomId).eq('academic_year_id', params.academicYearId)
    }

    const { data: exportRow, error } = await query.maybeSingle()
    if (error || !exportRow?.id || !exportRow.school_id) return null

    const created = await ensureDocumentReference({
      schoolId: String(exportRow.school_id),
      exportId: String(exportRow.id),
    })
    if (!created?.code) return null

    return {
      code: created.code,
      verifyUrl: buildDocumentVerifyUrl(created.code),
      status: String(exportRow.status || 'pending'),
      pdfUrl: exportRow.drive_web_view_link ? String(exportRow.drive_web_view_link) : null,
    }
  } catch {
    return null
  }
}
