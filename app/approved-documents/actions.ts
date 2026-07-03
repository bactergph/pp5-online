'use server'

import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { deleteDriveFile } from '@/lib/google-drive'
import { APPROVED_DOC_KIND_LABELS, buildSignDocumentPreviewUrl, classDocTypeToPreviewKind } from '@/lib/sign-document-preview'
import type { ApprovedDocKind } from '@/lib/approved-documents/archive'
import type { ClassDocType } from '@/lib/approvals/types'

export type ApprovedDocumentRow = {
  id: string
  doc_kind: ApprovedDocKind
  doc_kind_label: string
  title: string
  file_name: string
  term: number
  approved_at: string
  generated_at: string | null
  status: string
  error_message: string | null
  drive_web_view_link: string | null
  drive_folder_path: string | null
  can_delete: boolean
  has_file: boolean
  /** ดูจากหน้ารายงาน — กรณียังไม่มีไฟล์ PDF ในระบบ */
  preview_url?: string | null
}

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  return session
}

function canDeleteApprovedDocs(role: string) {
  return role === 'principal' || role === 'admin' || role === 'academic_head'
}

function isPrivilegedApprovedViewer(role: string) {
  return canDeleteApprovedDocs(role) || role === 'district' || role === 'deputy_principal'
}

async function canViewClassDocApproval(
  session: Awaited<ReturnType<typeof requireSession>>,
  record: {
    homeroom_id: string | null
    academic_head_id: string | null
    vice_director_id: string | null
    director_id: string | null
  },
  classroom: {
    homeroom_teacher_id: string | null
    homeroom_teacher2_id: string | null
  },
) {
  if (!session.schoolId) return false
  if (isPrivilegedApprovedViewer(session.role)) return true
  const ids = [
    record.homeroom_id,
    record.academic_head_id,
    record.vice_director_id,
    record.director_id,
    classroom.homeroom_teacher_id,
    classroom.homeroom_teacher2_id,
  ].filter(Boolean) as string[]
  return ids.includes(session.userId)
}

async function canViewPp5SubjectApproval(
  session: Awaited<ReturnType<typeof requireSession>>,
  record: {
    teacher_id: string | null
    subject_head_id: string | null
    measurement_head_id: string | null
    academic_head_id: string | null
    vice_director_id: string | null
    director_id: string | null
  },
) {
  if (!session.schoolId) return false
  if (isPrivilegedApprovedViewer(session.role)) return true
  const ids = [
    record.teacher_id,
    record.subject_head_id,
    record.measurement_head_id,
    record.academic_head_id,
    record.vice_director_id,
    record.director_id,
  ].filter(Boolean) as string[]
  return ids.includes(session.userId)
}

async function canViewDocument(
  session: Awaited<ReturnType<typeof requireSession>>,
  row: {
    owner_user_id: string | null
    doc_kind: ApprovedDocKind
    class_subject_id: string | null
    classroom_id: string | null
    approval_signature_id: string | null
    class_document_approval_id: string | null
  },
) {
  if (!session.schoolId) return false
  if (isPrivilegedApprovedViewer(session.role)) return true

  if (row.owner_user_id === session.userId) return true

  const db = createServerClient()

  if (row.approval_signature_id) {
    const { data } = await db.from('approval_signatures')
      .select('teacher_id, subject_head_id, measurement_head_id, academic_head_id, vice_director_id, director_id')
      .eq('id', row.approval_signature_id)
      .maybeSingle()
    if (!data) return false
    const ids = [
      data.teacher_id,
      data.subject_head_id,
      data.measurement_head_id,
      data.academic_head_id,
      data.vice_director_id,
      data.director_id,
    ]
    return ids.includes(session.userId)
  }

  if (row.class_document_approval_id) {
    const { data } = await db.from('class_document_approvals')
      .select(`
        homeroom_id, academic_head_id, vice_director_id, director_id,
        classrooms!inner(homeroom_teacher_id, homeroom_teacher2_id)
      `)
      .eq('id', row.class_document_approval_id)
      .maybeSingle()
    if (!data) return false
    const classroom = data.classrooms as { homeroom_teacher_id: string | null; homeroom_teacher2_id: string | null }
    return canViewClassDocApproval(session, data, classroom)
  }

  return false
}

async function fetchWorkflowApprovedDocuments(
  session: Awaited<ReturnType<typeof requireSession>>,
  docKind: ApprovedDocKind,
  exportedApprovalIds: Set<string>,
): Promise<ApprovedDocumentRow[]> {
  if (!session.schoolId) return []
  const db = createServerClient()
  const rows: ApprovedDocumentRow[] = []

  if (docKind === 'pp5_subject') {
    const { data: classSubjects } = await db.from('class_subjects')
      .select('id, classrooms!inner(school_id)')
      .eq('classrooms.school_id', session.schoolId)
    const csIds = (classSubjects || []).map(cs => cs.id)
    if (!csIds.length) return []

    const { data: approvals } = await db.from('approval_signatures')
      .select(`
        id, term, director_signed_at, updated_at, teacher_id,
        subject_head_id, measurement_head_id, academic_head_id, vice_director_id, director_id,
        class_subject_id,
        class_subjects!inner(
          id, teacher_id, academic_year_id,
          classrooms!inner(id, level, room),
          subjects!inner(code, name)
        )
      `)
      .in('class_subject_id', csIds)
      .eq('status', 'approved')

    for (const record of approvals || []) {
      if (exportedApprovalIds.has(record.id)) continue
      const cs = record.class_subjects as {
        id: string
        academic_year_id: string
        classrooms: { id: string; level: string; room: number }
        subjects: { code: string; name: string }
      }
      const allowed = await canViewPp5SubjectApproval(session, record)
      if (!allowed) continue
      const classroom = cs.classrooms
      const subject = cs.subjects
      const approvedAt = record.director_signed_at || record.updated_at || new Date().toISOString()
      const previewTarget = {
        kind: 'pp5-subject' as const,
        academicYearId: cs.academic_year_id,
        classroomId: classroom.id,
        level: classroom.level,
        signTerm: record.term,
        classSubjectId: cs.id,
      }
      rows.push({
        id: `workflow:pp5_subject:${cs.id}:${record.term}`,
        doc_kind: 'pp5_subject',
        doc_kind_label: APPROVED_DOC_KIND_LABELS.pp5_subject,
        title: `${subject.code} ${subject.name} · ${classroom.level}/${classroom.room}`,
        file_name: `${subject.code}_${classroom.level}_${classroom.room}.pdf`,
        term: record.term,
        approved_at: approvedAt,
        generated_at: null,
        status: 'workflow',
        error_message: null,
        drive_web_view_link: null,
        drive_folder_path: null,
        can_delete: false,
        has_file: false,
        preview_url: buildSignDocumentPreviewUrl(previewTarget),
      })
    }
    return rows
  }

  const classDocType = docKind as ClassDocType
  const { data: approvals } = await db.from('class_document_approvals')
    .select(`
      id, doc_type, classroom_id, term, director_signed_at, updated_at,
      homeroom_id, academic_head_id, vice_director_id, director_id,
      classrooms!inner(id, level, room, school_id, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id)
    `)
    .eq('school_id', session.schoolId)
    .eq('doc_type', classDocType)
    .eq('status', 'approved')

  for (const record of approvals || []) {
    if (exportedApprovalIds.has(record.id)) continue
    const classroom = record.classrooms as {
      id: string
      level: string
      room: number
      academic_year_id: string
      homeroom_teacher_id: string | null
      homeroom_teacher2_id: string | null
    }
    const allowed = await canViewClassDocApproval(session, record, classroom)
    if (!allowed) continue
    const approvedAt = record.director_signed_at || record.updated_at || new Date().toISOString()
    const previewKind = classDocTypeToPreviewKind(classDocType)
    const previewTarget = {
      kind: previewKind,
      academicYearId: classroom.academic_year_id,
      classroomId: classroom.id,
      level: classroom.level,
      signTerm: record.term,
    }
    rows.push({
      id: `workflow:${classDocType}:${classroom.id}:${record.term}`,
      doc_kind: classDocType,
      doc_kind_label: APPROVED_DOC_KIND_LABELS[classDocType] || classDocType,
      title: `${APPROVED_DOC_KIND_LABELS[classDocType]} ${classroom.level}/${classroom.room}`,
      file_name: `${classDocType}_${classroom.level}_${classroom.room}.pdf`,
      term: record.term,
      approved_at: approvedAt,
      generated_at: null,
      status: 'workflow',
      error_message: null,
      drive_web_view_link: null,
      drive_folder_path: null,
      can_delete: false,
      has_file: false,
      preview_url: buildSignDocumentPreviewUrl(previewTarget),
    })
  }

  return rows
}

export async function fetchApprovedDocuments(docKind: ApprovedDocKind) {
  const session = await requireSession()
  if (!session.schoolId) return []

  const db = createServerClient()
  const { data, error } = await db.from('approved_document_exports')
    .select('*')
    .eq('school_id', session.schoolId)
    .eq('doc_kind', docKind)
    .order('approved_at', { ascending: false })

  if (error?.message?.includes('approved_document_exports')) return []
  if (error) throw new Error(error.message)

  const exportedApprovalIds = new Set<string>()
  const rows: ApprovedDocumentRow[] = []
  for (const row of data || []) {
    const allowed = await canViewDocument(session, row as typeof row & {
      doc_kind: ApprovedDocKind
      class_subject_id: string | null
      classroom_id: string | null
      approval_signature_id: string | null
      class_document_approval_id: string | null
    })
    if (!allowed) continue
    if (row.approval_signature_id) exportedApprovalIds.add(row.approval_signature_id)
    if (row.class_document_approval_id) exportedApprovalIds.add(row.class_document_approval_id)
    rows.push({
      id: row.id,
      doc_kind: row.doc_kind as ApprovedDocKind,
      doc_kind_label: APPROVED_DOC_KIND_LABELS[row.doc_kind] || row.doc_kind,
      title: row.title,
      file_name: row.file_name,
      term: row.term,
      approved_at: row.approved_at,
      generated_at: row.generated_at,
      status: row.status,
      error_message: row.error_message,
      drive_web_view_link: row.drive_web_view_link,
      drive_folder_path: row.drive_folder_path,
      can_delete: canDeleteApprovedDocs(session.role),
      has_file: row.status === 'ready' && Boolean(row.drive_web_view_link || row.storage_path),
    })
  }

  const workflowRows = await fetchWorkflowApprovedDocuments(session, docKind, exportedApprovalIds)
  return [...rows, ...workflowRows].sort((a, b) => b.approved_at.localeCompare(a.approved_at))
}

export async function deleteApprovedDocument(id: string) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  if (!canDeleteApprovedDocs(session.role)) return { error: 'เฉพาะผอ. / ผู้ดูแล / หัวหน้าวิชาการลบได้' }

  const db = createServerClient()
  const { data: row } = await db.from('approved_document_exports')
    .select('*')
    .eq('id', id)
    .eq('school_id', session.schoolId)
    .maybeSingle()
  if (!row) return { error: 'ไม่พบเอกสาร' }

  if (row.storage_path) {
    await db.storage.from('approved-documents').remove([row.storage_path]).catch(() => {})
  }
  await deleteDriveFile(session.schoolId, row.drive_file_id)
  const { error } = await db.from('approved_document_exports').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function getApprovedDocumentDownloadPath(id: string) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }

  const db = createServerClient()
  const { data: row } = await db.from('approved_document_exports')
    .select('*')
    .eq('id', id)
    .eq('school_id', session.schoolId)
    .maybeSingle()
  if (!row || row.status !== 'ready') return { error: 'ไฟล์ยังไม่พร้อม' }

  const allowed = await canViewDocument(session, row as typeof row & {
    doc_kind: ApprovedDocKind
    class_subject_id: string | null
    classroom_id: string | null
    approval_signature_id: string | null
    class_document_approval_id: string | null
  })
  if (!allowed) return { error: 'ไม่มีสิทธิ์เข้าถึงไฟล์นี้' }

  // เอกสารเก็บใน Google Drive — เปิด/ดาวน์โหลดผ่านลิงก์ Drive
  if (row.drive_web_view_link) {
    return { url: row.drive_web_view_link, fileName: row.file_name }
  }

  // เผื่อเอกสารเก่าที่ยังเก็บใน Supabase Storage
  if (row.storage_path) {
    const { data, error } = await db.storage
      .from('approved-documents')
      .createSignedUrl(row.storage_path, 60 * 10)
    if (error || !data?.signedUrl) return { error: 'ดาวน์โหลดไม่สำเร็จ' }
    return { url: data.signedUrl, fileName: row.file_name }
  }

  return { error: 'ไฟล์ยังไม่พร้อม' }
}

/** @deprecated ใช้ OAuth เชื่อมต่อแทน — คงไว้สำหรับ advanced/manual override */
export async function saveGoogleDriveFolderId(folderId: string | null) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  if (!['admin', 'principal'].includes(session.role)) return { error: 'เฉพาะผู้ดูแลหรือผู้อำนวยการตั้งค่าได้' }

  const db = createServerClient()
  const { error } = await db.from('schools')
    .update({ google_drive_folder_id: folderId?.trim() || null })
    .eq('id', session.schoolId)
  if (error?.message?.includes('google_drive_folder_id')) {
    return { error: 'ยังไม่ได้ติดตั้ง migration 035_approved_document_exports.sql' }
  }
  if (error) return { error: error.message }
  return { success: true }
}
