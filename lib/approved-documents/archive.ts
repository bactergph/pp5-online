import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { ensureDocumentReference } from '@/lib/document-reference'
import { encrypt, type SessionPayload } from '@/lib/session'
import { generateReportPdf, appOrigin } from '@/lib/pdf/generate-report-pdf'
import { uploadPdfToDrive } from '@/lib/google-drive'
import {
  APPROVED_DOC_FOLDER_LABELS,
  approvedDocumentFileName,
  buildSignDocumentPrintRequest,
  classDocTypeToPreviewKind,
  type SignDocumentPreviewTarget,
} from '@/lib/sign-document-preview'
import type { ClassDocType } from '@/lib/approvals/types'

export type ApprovedDocKind = 'pp5_subject' | 'pp5_class' | 'pp6' | 'classroom_admin'

async function sessionTokenFromActor(actor: SessionPayload) {
  return encrypt(actor)
}

function displayName(prefix?: string | null, first?: string | null, last?: string | null) {
  return [prefix, first, last].filter(Boolean).join('').trim() || 'ไม่ระบุชื่อ'
}

export async function archiveApprovedPp5Subject(params: {
  actor: SessionPayload
  schoolId: string
  approvalSignatureId: string
  classSubjectId: string
  term: number
  approvedAt: string
}) {
  const db = createServerClient()
  const { data: cs } = await db.from('class_subjects')
    .select(`
      id, teacher_id, academic_year_id,
      classrooms!inner(id, level, room, school_id),
      subjects!inner(code, name)
    `)
    .eq('id', params.classSubjectId)
    .maybeSingle()
  if (!cs) return

  const classroom = cs.classrooms as { id: string; level: string; room: number }
  const subject = cs.subjects as { code: string; name: string }
  const { data: teacher } = await db.from('users')
    .select('prefix, first_name, last_name')
    .eq('id', cs.teacher_id)
    .maybeSingle()
  const teacherName = displayName(teacher?.prefix, teacher?.first_name, teacher?.last_name)

  const { data: year } = await db.from('academic_years').select('year_be').eq('id', cs.academic_year_id).maybeSingle()
  const approvedAt = new Date(params.approvedAt)
  const fileName = approvedDocumentFileName({
    level: classroom.level,
    room: classroom.room,
    subjectCode: subject.code,
    teacherName,
    approvedAt,
  })
  const title = `${subject.code} ${subject.name} · ${classroom.level}/${classroom.room} · ${teacherName}`

  const previewTarget: SignDocumentPreviewTarget = {
    kind: 'pp5-subject',
    academicYearId: cs.academic_year_id,
    classroomId: classroom.id,
    level: classroom.level,
    signTerm: params.term,
    classSubjectId: params.classSubjectId,
  }

  const { data: row, error } = await db.from('approved_document_exports').insert({
    school_id: params.schoolId,
    doc_kind: 'pp5_subject',
    academic_year_id: cs.academic_year_id,
    term: params.term,
    class_subject_id: params.classSubjectId,
    classroom_id: classroom.id,
    approval_signature_id: params.approvalSignatureId,
    owner_user_id: cs.teacher_id,
    title,
    file_name: fileName,
    approved_at: params.approvedAt,
    status: 'pending',
  }).select('id').single()

  if (error || !row?.id) return
  // สร้างรหัส Digital Reference ก่อนเรนเดอร์ PDF เพื่อให้หน้าปกมี QR จริง
  await ensureDocumentReference({ schoolId: params.schoolId, exportId: row.id })
  await generateAndStoreApprovedDocument({
    exportId: row.id,
    actor: params.actor,
    schoolId: params.schoolId,
    previewTarget,
    fileName,
    yearBe: year?.year_be || approvedAt.getFullYear() + 543,
  })
}

export async function archiveApprovedClassDocument(params: {
  actor: SessionPayload
  schoolId: string
  classDocumentApprovalId: string
  docType: ClassDocType
  classroomId: string
  term: number
  approvedAt: string
}) {
  const db = createServerClient()
  const { data: classroom } = await db.from('classrooms')
    .select('id, level, room, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', params.classroomId)
    .maybeSingle()
  if (!classroom) return

  const homeroomId = classroom.homeroom_teacher_id || classroom.homeroom_teacher2_id
  let teacherName = 'ครูประจำชั้น'
  if (homeroomId) {
    const { data: teacher } = await db.from('users')
      .select('prefix, first_name, last_name')
      .eq('id', homeroomId)
      .maybeSingle()
    if (teacher) teacherName = displayName(teacher.prefix, teacher.first_name, teacher.last_name)
  }

  const { data: year } = await db.from('academic_years').select('year_be').eq('id', classroom.academic_year_id).maybeSingle()
  const approvedAt = new Date(params.approvedAt)
  const fileName = approvedDocumentFileName({
    level: classroom.level,
    room: classroom.room,
    teacherName,
    approvedAt,
  })
  const kind = params.docType as ApprovedDocKind
  const previewKind = classDocTypeToPreviewKind(params.docType)
  const title = `${APPROVED_DOC_FOLDER_LABELS[previewKind]} · ${classroom.level}/${classroom.room} · ${teacherName}`

  const previewTarget: SignDocumentPreviewTarget = {
    kind: previewKind,
    academicYearId: classroom.academic_year_id,
    classroomId: classroom.id,
    level: classroom.level,
    signTerm: params.term,
  }

  const { data: row, error } = await db.from('approved_document_exports').insert({
    school_id: params.schoolId,
    doc_kind: kind,
    academic_year_id: classroom.academic_year_id,
    term: params.term,
    classroom_id: classroom.id,
    class_document_approval_id: params.classDocumentApprovalId,
    owner_user_id: homeroomId,
    title,
    file_name: fileName,
    approved_at: params.approvedAt,
    status: 'pending',
  }).select('id').single()

  if (error || !row?.id) return
  await ensureDocumentReference({ schoolId: params.schoolId, exportId: row.id })
  await generateAndStoreApprovedDocument({
    exportId: row.id,
    actor: params.actor,
    schoolId: params.schoolId,
    previewTarget,
    fileName,
    yearBe: year?.year_be || approvedAt.getFullYear() + 543,
  })
}

async function generateAndStoreApprovedDocument(params: {
  exportId: string
  actor: SessionPayload
  schoolId: string
  previewTarget: SignDocumentPreviewTarget
  fileName: string
  yearBe: number
}) {
  const db = createServerClient()
  try {
    const printReq = buildSignDocumentPrintRequest(params.previewTarget)
    const sessionToken = await sessionTokenFromActor(params.actor)
    const pdfBuffer = await generateReportPdf({
      origin: appOrigin(),
      path: printReq.path,
      query: printReq.query,
      sessionToken,
      landscape: printReq.landscape,
    })

    // เก็บ PDF ไว้ที่ Google Drive ของโรงเรียนอย่างเดียว (ไม่เก็บใน Supabase Storage)
    const { data: school } = await db.from('schools')
      .select('google_drive_folder_id')
      .eq('id', params.schoolId)
      .maybeSingle()

    if (!school?.google_drive_folder_id) {
      throw new Error('ยังไม่ได้เชื่อมต่อ Google Drive ของโรงเรียน — กรุณาเชื่อมต่อก่อน แล้วเอกสารจะถูกจัดเก็บใน Drive')
    }

    const folderLabel = APPROVED_DOC_FOLDER_LABELS[params.previewTarget.kind]
    const drive = await uploadPdfToDrive({
      schoolId: params.schoolId,
      rootFolderId: school.google_drive_folder_id,
      folderSegments: [String(params.yearBe), folderLabel],
      fileName: params.fileName,
      buffer: pdfBuffer,
    })

    if (!drive.fileId) {
      throw new Error('อัปโหลดไฟล์ขึ้น Google Drive ไม่สำเร็จ')
    }

    await db.from('approved_document_exports').update({
      storage_path: null,
      drive_file_id: drive.fileId,
      drive_web_view_link: drive.webViewLink,
      drive_folder_path: drive.folderPath,
      generated_at: new Date().toISOString(),
      status: 'ready',
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', params.exportId)
  } catch (err) {
    await db.from('approved_document_exports').update({
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ',
      updated_at: new Date().toISOString(),
    }).eq('id', params.exportId)
  }
}

export function scheduleApprovedDocumentArchive(task: () => Promise<void>) {
  void task().catch(err => {
    console.error('[approved-document-archive]', err)
  })
}
