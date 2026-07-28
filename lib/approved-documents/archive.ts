import 'server-only'
import { after } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { ensureDocumentReference } from '@/lib/document-reference'
import type { SessionPayload } from '@/lib/session'
import { updateDriveFileMedia, uploadPdfToDrive } from '@/lib/google-drive'
import { buildApprovedDocumentJsPdfBuffer } from '@/lib/approved-documents/build-jspdf-archive'
import {
  APPROVED_DOC_FOLDER_LABELS,
  approvedDocumentFileName,
  classDocTypeToPreviewKind,
  type SignDocumentPreviewTarget,
} from '@/lib/sign-document-preview'
import type { ClassDocType } from '@/lib/approvals/types'
import { getThaiMonthShort } from '@/lib/thaiDate'

export type ApprovedDocKind = 'pp5_subject' | 'pp5_class' | 'pp6' | 'classroom_admin'

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

  const { data: existing } = await db.from('approved_document_exports')
    .select('id, status')
    .eq('approval_signature_id', params.approvalSignatureId)
    .maybeSingle()

  let exportId = existing?.id as string | undefined
  if (existing?.status === 'ready') return

  if (exportId) {
    await db.from('approved_document_exports').update({
      title,
      file_name: fileName,
      approved_at: params.approvedAt,
      status: 'pending',
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', exportId)
  } else {
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

    if (error || !row?.id) {
      console.error('[archiveApprovedPp5Subject] insert failed', error?.message)
      return
    }
    exportId = row.id
  }

  if (!exportId) return
  await ensureDocumentReference({ schoolId: params.schoolId, exportId })
  await generateAndStoreApprovedDocument({
    exportId,
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
  if (!classroom) {
    console.error('[archiveApprovedClassDocument] classroom not found', params.classroomId)
    return
  }

  const { data: approval } = await db.from('class_document_approvals')
    .select('month, homeroom_id')
    .eq('id', params.classDocumentApprovalId)
    .maybeSingle()

  const month = params.docType === 'classroom_admin' && approval?.month != null
    ? Number(approval.month)
    : null

  const ownerUserId = approval?.homeroom_id
    || classroom.homeroom_teacher_id
    || classroom.homeroom_teacher2_id
    || null

  let teacherName = 'ครูประจำชั้น'
  if (ownerUserId) {
    const { data: teacher } = await db.from('users')
      .select('prefix, first_name, last_name')
      .eq('id', ownerUserId)
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
  const monthTag = month ? ` · ชุดเดือน ${getThaiMonthShort(month)}` : ''
  const title = `${APPROVED_DOC_FOLDER_LABELS[previewKind]} · ${classroom.level}/${classroom.room}${monthTag} · ${teacherName}`

  const previewTarget: SignDocumentPreviewTarget = {
    kind: previewKind,
    academicYearId: classroom.academic_year_id,
    classroomId: classroom.id,
    level: classroom.level,
    signTerm: params.term,
    month,
  }

  const { data: existing } = await db.from('approved_document_exports')
    .select('id, status')
    .eq('class_document_approval_id', params.classDocumentApprovalId)
    .maybeSingle()

  let exportId = existing?.id as string | undefined
  if (existing?.status === 'ready') return

  if (exportId) {
    await db.from('approved_document_exports').update({
      title,
      file_name: fileName,
      owner_user_id: ownerUserId,
      approved_at: params.approvedAt,
      status: 'pending',
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', exportId)
  } else {
    const { data: row, error } = await db.from('approved_document_exports').insert({
      school_id: params.schoolId,
      doc_kind: kind,
      academic_year_id: classroom.academic_year_id,
      term: params.term,
      classroom_id: classroom.id,
      class_document_approval_id: params.classDocumentApprovalId,
      owner_user_id: ownerUserId,
      title,
      file_name: fileName,
      approved_at: params.approvedAt,
      status: 'pending',
    }).select('id').single()

    if (error || !row?.id) {
      console.error('[archiveApprovedClassDocument] insert failed', error?.message, params)
      return
    }
    exportId = row.id
  }

  if (!exportId) return
  await ensureDocumentReference({ schoolId: params.schoolId, exportId })
  await generateAndStoreApprovedDocument({
    exportId,
    actor: params.actor,
    schoolId: params.schoolId,
    previewTarget,
    fileName,
    yearBe: year?.year_be || approvedAt.getFullYear() + 543,
  })
}

async function buildApprovedDocumentPdfBuffer(params: {
  actor: SessionPayload
  previewTarget: SignDocumentPreviewTarget
  fileName: string
  schoolId: string
}): Promise<Buffer> {
  return buildApprovedDocumentJsPdfBuffer({
    schoolId: params.schoolId,
    previewTarget: params.previewTarget,
    fileName: params.fileName,
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
    const wantsDriveQr = params.previewTarget.kind !== 'classroom_admin'

    const { data: existingExport } = await db.from('approved_document_exports')
      .select('drive_file_id, drive_web_view_link, drive_folder_path')
      .eq('id', params.exportId)
      .maybeSingle()

    const { data: school } = await db.from('schools')
      .select('google_drive_folder_id')
      .eq('id', params.schoolId)
      .maybeSingle()

    if (!school?.google_drive_folder_id) {
      throw new Error('ยังไม่ได้เชื่อมต่อ Google Drive ของโรงเรียน — กรุณาเชื่อมต่อก่อน แล้วเอกสารจะถูกจัดเก็บใน Drive')
    }

    const folderLabel = APPROVED_DOC_FOLDER_LABELS[params.previewTarget.kind]
    const monthSeg = params.previewTarget.kind === 'classroom_admin' && params.previewTarget.month
      ? getThaiMonthShort(params.previewTarget.month)
      : null
    const folderSegments = monthSeg
      ? [String(params.yearBe), folderLabel, monthSeg]
      : [String(params.yearBe), folderLabel]

    let fileId = existingExport?.drive_file_id ? String(existingExport.drive_file_id) : null
    let webViewLink = existingExport?.drive_web_view_link
      ? String(existingExport.drive_web_view_link)
      : null
    let folderPath = existingExport?.drive_folder_path
      ? String(existingExport.drive_folder_path)
      : folderSegments.join('/')

    // PDF ว่างเล็ก ๆ เพื่อจอง fileId/webViewLink ก่อน build จริง (ฝัง QR รอบเดียว)
    const placeholderPdf = Buffer.from(
      '%PDF-1.1\n'
      + '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
      + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
      + '3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\n'
      + 'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n'
      + 'trailer<</Size 4/Root 1 0 R>>\n'
      + 'startxref\n149\n%%EOF\n',
    )

    if (wantsDriveQr && !webViewLink) {
      // 1) อัปโหลด placeholder → ได้ fileId + webViewLink
      const drive = await uploadPdfToDrive({
        schoolId: params.schoolId,
        rootFolderId: school.google_drive_folder_id,
        folderSegments,
        fileName: params.fileName,
        buffer: placeholderPdf,
      })
      if (!drive.fileId) {
        throw new Error('อัปโหลดไฟล์ขึ้น Google Drive ไม่สำเร็จ')
      }
      fileId = drive.fileId
      webViewLink = drive.webViewLink
      folderPath = drive.folderPath

      // 2) บันทึก drive fields ก่อน build — loadReportDigitalReference จะเห็น pdfUrl
      await db.from('approved_document_exports').update({
        storage_path: null,
        drive_file_id: fileId,
        drive_web_view_link: webViewLink,
        drive_folder_path: folderPath,
        updated_at: new Date().toISOString(),
      }).eq('id', params.exportId)

      // 3) build PDF ครั้งเดียว (มี QR ลิงก์ Drive)
      const pdfBuffer = await buildApprovedDocumentPdfBuffer({
        actor: params.actor,
        previewTarget: params.previewTarget,
        fileName: params.fileName,
        schoolId: params.schoolId,
      })

      // 4) แทนที่เนื้อหาไฟล์บน Drive
      const ok = await updateDriveFileMedia({
        schoolId: params.schoolId,
        fileId,
        buffer: pdfBuffer,
      })
      if (!ok) throw new Error('อัปเดตไฟล์บน Google Drive ไม่สำเร็จ')
    } else if (fileId && webViewLink) {
      // มีลิงก์ Drive แล้ว — build ครั้งเดียวแล้วอัปเดต media
      const pdfBuffer = await buildApprovedDocumentPdfBuffer({
        actor: params.actor,
        previewTarget: params.previewTarget,
        fileName: params.fileName,
        schoolId: params.schoolId,
      })
      const ok = await updateDriveFileMedia({
        schoolId: params.schoolId,
        fileId,
        buffer: pdfBuffer,
      })
      if (!ok) throw new Error('อัปเดตไฟล์บน Google Drive ไม่สำเร็จ')
    } else {
      // ไม่ต้องการ QR Drive (เช่น classroom_admin) — อัปโหลดครั้งเดียว
      const pdfBuffer = await buildApprovedDocumentPdfBuffer({
        actor: params.actor,
        previewTarget: params.previewTarget,
        fileName: params.fileName,
        schoolId: params.schoolId,
      })
      const drive = await uploadPdfToDrive({
        schoolId: params.schoolId,
        rootFolderId: school.google_drive_folder_id,
        folderSegments,
        fileName: params.fileName,
        buffer: pdfBuffer,
      })
      if (!drive.fileId) {
        throw new Error('อัปโหลดไฟล์ขึ้น Google Drive ไม่สำเร็จ')
      }
      fileId = drive.fileId
      webViewLink = drive.webViewLink
      folderPath = drive.folderPath
    }

    await db.from('approved_document_exports').update({
      storage_path: null,
      drive_file_id: fileId,
      drive_web_view_link: webViewLink,
      drive_folder_path: folderPath,
      generated_at: new Date().toISOString(),
      status: 'ready',
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', params.exportId)
  } catch (err) {
    console.error('[generateAndStoreApprovedDocument]', err)
    await db.from('approved_document_exports').update({
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ',
      updated_at: new Date().toISOString(),
    }).eq('id', params.exportId)
  }
}

/** สร้าง/สร้างใหม่ PDF ของรายการที่อนุมัติแล้ว (ใช้จากปุ่มลองใหม่) */
export async function regenerateApprovedDocumentExport(params: {
  actor: SessionPayload
  schoolId: string
  exportId: string
}) {
  const db = createServerClient()
  const { data: row } = await db.from('approved_document_exports')
    .select('*')
    .eq('id', params.exportId)
    .eq('school_id', params.schoolId)
    .maybeSingle()
  if (!row) return { error: 'ไม่พบเอกสาร' }

  // อนุญาตสร้างใหม่แม้สถานะ ready — เพื่ออัปเดต QR ให้เป็นลิงก์ Drive
  await db.from('approved_document_exports').update({
    status: 'pending',
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', params.exportId)

  if (row.doc_kind === 'pp5_subject' && row.approval_signature_id && row.class_subject_id) {
    await archiveApprovedPp5Subject({
      actor: params.actor,
      schoolId: params.schoolId,
      approvalSignatureId: row.approval_signature_id,
      classSubjectId: row.class_subject_id,
      term: row.term,
      approvedAt: row.approved_at,
    })
    return { success: true }
  }

  if (row.class_document_approval_id && row.classroom_id) {
    await archiveApprovedClassDocument({
      actor: params.actor,
      schoolId: params.schoolId,
      classDocumentApprovalId: row.class_document_approval_id,
      docType: row.doc_kind as ClassDocType,
      classroomId: row.classroom_id,
      term: row.term,
      approvedAt: row.approved_at,
    })
    return { success: true }
  }

  return { error: 'ข้อมูลเอกสารไม่ครบสำหรับสร้างไฟล์ใหม่' }
}

/**
 * รันหลัง response — ใช้ after() เพื่อไม่ให้ serverless ตัดงานสร้าง PDF กลางคัน
 */
export function scheduleApprovedDocumentArchive(task: () => Promise<void>) {
  const run = async () => {
    try {
      await task()
    } catch (err) {
      console.error('[approved-document-archive]', err)
    }
  }

  try {
    after(run)
  } catch {
    // นอก request scope — รันต่อทันที
    void run()
  }
}
