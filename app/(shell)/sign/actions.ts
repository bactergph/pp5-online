'use server'
import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity } from '@/lib/audit'
import { SUBJECT_GROUPS } from '@/lib/subject-groups'
import type { ClassDocType, SchoolLeaders, SubjectGroupHeadMap } from '@/lib/approvals/types'
import {
  canUserSignPp5SubjectStep,
  getPp5SubjectNextStep,
  getPp5SubjectWorkflowProgress,
  pp5SubjectStatusLabel,
  type Pp5SubjectApproval,
} from '@/lib/approvals/pp5-subject'
import {
  canUserSignClassDocStep,
  getClassDocNextStep,
  getClassDocWorkflowProgress,
  classDocStatusLabel,
  CLASS_DOC_STEP_FIELDS,
  type ClassDocumentApproval,
} from '@/lib/approvals/class-document'
import {
  archiveApprovedClassDocument,
  archiveApprovedPp5Subject,
  scheduleApprovedDocumentArchive,
} from '@/lib/approved-documents/archive'
import { CLASS_DOC_STEP_LABELS, PP5_SUBJECT_STEP_LABELS } from '@/lib/approvals/types'
import {
  archiveLegacyApprovalCycle,
  completeActiveApprovalSubmission,
  fetchApprovalSubmissionHistory,
  recordApprovalSubmissionStart,
} from '@/lib/approvals/submission-history'
import {
  canUserCancelProposal,
  classDocCancelProposalReset,
  classDocHasApproverSignatures,
  pp5SubjectCancelProposalReset,
  pp5SubjectHasApproverSignatures,
} from '@/lib/approvals/cancel-proposal'
import {
  findClassDocumentApproval,
  findClassDocumentApprovalExact,
} from '@/lib/approvals/class-doc-lookup'
import { getThaiMonthShort } from '@/lib/thaiDate'

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  return session
}

/** ครูผู้สอน/ครูประจำชั้น — ดูเฉพาะเอกสารที่เสนอเซ็นแล้ว (ไม่แสดงร่าง) */
function isTeacherTrackingView(role: string) {
  return role === 'teacher'
}

function shouldShowInTeacherTrackingQueue(params: {
  role: string
  status: string
  canSign: boolean
  isOwner: boolean
}) {
  if (!isTeacherTrackingView(params.role)) return true
  if (params.canSign) return true
  if (params.status !== 'in_review' && params.status !== 'rejected') return false
  return params.isOwner
}

export async function fetchDocumentsSignPageContext() {
  const session = await requireSession()
  return { trackingView: isTeacherTrackingView(session.role) }
}

async function loadSchoolContext(schoolId: string) {
  const db = createServerClient()
  const [schoolR, headsR] = await Promise.all([
    db.from('schools').select(`
      director_user_id, vice_director_user_id, acting_director_user_id,
      academic_head_user_id, measurement_head_user_id,
      vice_director_name, measurement_head_name
    `).eq('id', schoolId).maybeSingle(),
    db.from('subject_group_heads').select('subject_group, head_name, head_user_id').eq('school_id', schoolId),
  ])
  const school: SchoolLeaders = {
    director_user_id: schoolR.data?.director_user_id || null,
    vice_director_user_id: schoolR.data?.vice_director_user_id || null,
    acting_director_user_id: schoolR.data?.acting_director_user_id || null,
    academic_head_user_id: schoolR.data?.academic_head_user_id || null,
    measurement_head_user_id: schoolR.data?.measurement_head_user_id || null,
    vice_director_name: schoolR.data?.vice_director_name || null,
    measurement_head_name: schoolR.data?.measurement_head_name || null,
  }
  const groupHeads: SubjectGroupHeadMap = Object.fromEntries(
    SUBJECT_GROUPS.map(g => [g, { name: '', userId: null }]),
  )
  for (const row of headsR.data || []) {
    const g = String(row.subject_group || '')
    if (g) groupHeads[g] = { name: row.head_name || '', userId: row.head_user_id || null }
  }
  return { school, groupHeads }
}

const PP5_STEP_DB: Record<string, { at: string; id: string }> = {
  teacher: { at: 'teacher_signed_at', id: 'teacher_id' },
  subject_head: { at: 'subject_head_signed_at', id: 'subject_head_id' },
  measurement_head: { at: 'measurement_head_signed_at', id: 'measurement_head_id' },
  academic_head: { at: 'academic_head_signed_at', id: 'academic_head_id' },
  vice_director: { at: 'vice_director_signed_at', id: 'vice_director_id' },
  director: { at: 'director_signed_at', id: 'director_id' },
}

export async function fetchSignPendingCounts() {
  const session = await requireSession()
  if (!session.schoolId) return { pp5: 0, pp6: 0, classroomAdmin: 0 }
  const [pp5Items, classItems] = await Promise.all([
    fetchPp5SubjectQueue(),
    fetchClassDocQueue(),
  ])
  const actionable = (items: { canSign: boolean }[]) => items.filter(i => i.canSign).length
  return {
    pp5: actionable(pp5Items),
    pp6: actionable(classItems.filter(i => i.doc_type === 'pp6')),
    classroomAdmin: actionable(classItems.filter(i => i.doc_type === 'classroom_admin')),
  }
}

export async function fetchPp5SubjectQueue() {
  const session = await requireSession()
  if (!session.schoolId) return []
  const db = createServerClient()
  const { school, groupHeads } = await loadSchoolContext(session.schoolId)

  const { data: classSubjects } = await db.from('class_subjects')
    .select(`
      id, teacher_id, academic_year_id,
      classrooms!inner(id, level, room, school_id),
      subjects!inner(id, code, name, subject_group)
    `)
    .eq('classrooms.school_id', session.schoolId)

  if (!classSubjects?.length) return []

  const csIds = classSubjects.map(cs => cs.id)
  const { data: approvals } = await db.from('approval_signatures')
    .select('*')
    .in('class_subject_id', csIds)

  const approvalMap = new Map((approvals || []).map(a => [`${a.class_subject_id}:${a.term}`, a]))

  const items: Array<{
    id: string | null
    class_subject_id: string
    term: number
    status: string
    status_label: string
    next_step: string | null
    workflow_steps: Array<{ label: string; state: string }>
    canSign: boolean
    canPutSignature: boolean
    canPropose: boolean
    canCancelProposal: boolean
    teacher_id: string | null
    subject_code: string
    subject_name: string
    subject_group: string
    classroom_label: string
    classroom_id: string
    level: string
    academic_year_id: string
  }> = []

  for (const cs of classSubjects) {
    const classroom = cs.classrooms as { id: string; level: string; room: number }
    const subject = cs.subjects as { code: string; name: string; subject_group: string }
    for (const term of [1, 2]) {
      const record = (approvalMap.get(`${cs.id}:${term}`) || {
        status: 'draft',
      }) as Pp5SubjectApproval
      const fullRecord = { ...record, class_subject_id: cs.id, term }
      const next = getPp5SubjectNextStep(fullRecord, school, subject.subject_group, groupHeads)
      const canSign = next && next !== 'teacher'
        ? canUserSignPp5SubjectStep(
          session.userId, session.role, next, school, subject.subject_group, groupHeads, cs.teacher_id,
        )
        : false
      const isInitiator = cs.teacher_id === session.userId || session.role === 'admin'
      const canPutSignature = isInitiator
        && fullRecord.status !== 'approved'
        && (fullRecord.status === 'draft' || fullRecord.status === 'rejected' || !fullRecord.status)
      const canPropose = isInitiator
        && Boolean(fullRecord.teacher_signed_at)
        && fullRecord.status !== 'approved'
        && (fullRecord.status === 'draft' || fullRecord.status === 'rejected' || !fullRecord.status)
      const status = fullRecord.status || 'draft'
      const hasApproverSignatures = pp5SubjectHasApproverSignatures(fullRecord)
      const canCancelProposal = canUserCancelProposal({
        role: session.role,
        userId: session.userId,
        school,
        isInitiator: cs.teacher_id === session.userId,
        status,
        hasApproverSignatures,
      })
      const inQueue = fullRecord.status === 'in_review' || fullRecord.status === 'rejected' || canSign || canPutSignature || canPropose || canCancelProposal
      if (!inQueue) continue
      if (!shouldShowInTeacherTrackingQueue({
        role: session.role,
        status,
        canSign,
        isOwner: cs.teacher_id === session.userId,
      })) continue
      items.push({
        id: record.id || null,
        class_subject_id: cs.id,
        term,
        status,
        status_label: pp5SubjectStatusLabel(fullRecord, school, subject.subject_group, groupHeads),
        next_step: next ? PP5_SUBJECT_STEP_LABELS[next] : null,
        workflow_steps: getPp5SubjectWorkflowProgress(fullRecord, school, subject.subject_group, groupHeads),
        canSign,
        canPutSignature,
        canPropose,
        canCancelProposal,
        teacher_id: cs.teacher_id,
        subject_code: subject.code,
        subject_name: subject.name,
        subject_group: subject.subject_group,
        classroom_label: `${classroom.level}/${classroom.room}`,
        classroom_id: classroom.id,
        level: classroom.level,
        academic_year_id: cs.academic_year_id,
      })
    }
  }
  return items.sort((a, b) => {
    if (a.canSign !== b.canSign) return a.canSign ? -1 : 1
    return a.classroom_label.localeCompare(b.classroom_label, 'th')
  })
}

export async function fetchClassDocQueue(docTypes?: ClassDocType[]) {
  const session = await requireSession()
  if (!session.schoolId) return []
  const db = createServerClient()
  const { school } = await loadSchoolContext(session.schoolId)
  const types = docTypes || ['pp5_class', 'pp6', 'classroom_admin']

  const { data: classrooms } = await db.from('classrooms')
    .select('id, level, room, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('school_id', session.schoolId)

  if (!classrooms?.length) return []

  const classIds = classrooms.map(c => c.id)
  const { data: approvals } = await db.from('class_document_approvals')
    .select('*')
    .in('classroom_id', classIds)
    .in('doc_type', types)

  const approvalMap = new Map(
    (approvals || []).map(a => [`${a.classroom_id}:${a.doc_type}:${a.term}:${a.month ?? 0}`, a]),
  )

  const items: Array<{
    id: string | null
    doc_type: ClassDocType
    classroom_id: string
    term: number
    month: number | null
    status: string
    status_label: string
    next_step: string | null
    workflow_steps: Array<{ label: string; state: string }>
    canSign: boolean
    canPutSignature: boolean
    canPropose: boolean
    canCancelProposal: boolean
    classroom_label: string
    level: string
    academic_year_id: string
  }> = []

  const pushItem = (
    classroom: (typeof classrooms)[number],
    docType: ClassDocType,
    term: number,
    month: number | null,
    record: ClassDocumentApproval | { status: string; id?: string; homeroom_signed_at?: string | null },
  ) => {
    const fullRecord = {
      ...record,
      doc_type: docType,
      classroom_id: classroom.id,
      academic_year_id: classroom.academic_year_id,
      term,
      month,
    } as ClassDocumentApproval
    const next = getClassDocNextStep(fullRecord, school, docType)
    const canSign = next && next !== 'homeroom'
      ? canUserSignClassDocStep(
        session.userId, session.role, next, school,
        classroom.homeroom_teacher_id, classroom.homeroom_teacher2_id,
      )
      : false
    const isHomeroom = classroom.homeroom_teacher_id === session.userId
      || classroom.homeroom_teacher2_id === session.userId
    const canPutSignature = (isHomeroom || session.role === 'admin')
      && fullRecord.status !== 'approved'
      && (fullRecord.status === 'draft' || fullRecord.status === 'rejected' || !fullRecord.status)
      && (docType !== 'classroom_admin' || month != null)
    const canPropose = (isHomeroom || session.role === 'admin')
      && Boolean(fullRecord.homeroom_signed_at)
      && fullRecord.status !== 'approved'
      && (fullRecord.status === 'draft' || fullRecord.status === 'rejected' || !fullRecord.status)
    const status = fullRecord.status || 'draft'
    const hasApproverSignatures = classDocHasApproverSignatures(fullRecord, docType)
    const canCancelProposal = canUserCancelProposal({
      role: session.role,
      userId: session.userId,
      school,
      isInitiator: isHomeroom,
      status,
      hasApproverSignatures,
    })
    const inQueue = fullRecord.status === 'in_review' || fullRecord.status === 'rejected' || canSign || canPutSignature || canPropose || canCancelProposal
    if (!inQueue) return
    if (!shouldShowInTeacherTrackingQueue({
      role: session.role,
      status,
      canSign,
      isOwner: isHomeroom,
    })) return
    const monthShort = month ? getThaiMonthShort(month) : ''
    const monthLabel = monthShort
      ? (docType === 'classroom_admin' ? ` · ชุดเดือน ${monthShort}` : ` · เดือน ${monthShort}`)
      : ''
    items.push({
      id: ('id' in record && record.id) || null,
      doc_type: docType,
      classroom_id: classroom.id,
      term,
      month,
      status,
      status_label: classDocStatusLabel(fullRecord, school, docType),
      next_step: next ? CLASS_DOC_STEP_LABELS[next] : null,
      workflow_steps: getClassDocWorkflowProgress(fullRecord, school, docType),
      canSign,
      canPutSignature,
      canPropose,
      canCancelProposal,
      classroom_label: `${classroom.level}/${classroom.room}${monthLabel}`,
      level: classroom.level,
      academic_year_id: classroom.academic_year_id,
    })
  }

  for (const classroom of classrooms) {
    for (const docType of types) {
      if (docType === 'classroom_admin') {
        const rows = (approvals || []).filter(a => a.classroom_id === classroom.id && a.doc_type === docType)
        for (const record of rows) {
          pushItem(
            classroom,
            docType,
            Number(record.term) as 1 | 2,
            record.month == null ? null : Number(record.month),
            record as ClassDocumentApproval,
          )
        }
        continue
      }
      for (const term of [1, 2]) {
        const record = (approvalMap.get(`${classroom.id}:${docType}:${term}:0`) || {
          status: 'draft',
        }) as ClassDocumentApproval
        pushItem(classroom, docType, term, null, record)
      }
    }
  }
  return items
}

export async function putPp5SubjectSignature(classSubjectId: string, term: number) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  const db = createServerClient()

  const { data: cs } = await db.from('class_subjects')
    .select('id, teacher_id, classrooms!inner(school_id)')
    .eq('id', classSubjectId)
    .maybeSingle()
  if (!cs || (cs.classrooms as { school_id: string }).school_id !== session.schoolId) {
    return { error: 'ไม่พบรายวิชา' }
  }
  if (cs.teacher_id !== session.userId && session.role !== 'admin' && session.role !== 'district') {
    return { error: 'เฉพาะครูผู้สอนใส่ลายเซ็นได้' }
  }

  const { data: user } = await db.from('users')
    .select('signature_url')
    .eq('id', session.userId)
    .maybeSingle()
  if (!user?.signature_url) {
    return { error: 'ยังไม่มีลายเซ็นในโปรไฟล์ — ไปที่ ตั้งค่า → ข้อมูลตัวเอง เพื่ออัปโหลดก่อน' }
  }

  const { data: existing } = await db.from('approval_signatures')
    .select('id, status')
    .eq('class_subject_id', classSubjectId)
    .eq('term', term)
    .maybeSingle()

  if (existing?.status === 'in_review') return { error: 'เอกสารอยู่ระหว่างเสนอเซ็นแล้ว แก้ไขลายเซ็นไม่ได้' }

  const now = new Date().toISOString()
  const payload = {
    class_subject_id: classSubjectId,
    term,
    teacher_id: session.userId,
    teacher_signed_at: now,
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

  const { error } = existing?.id
    ? await db.from('approval_signatures').update(payload).eq('id', existing.id)
    : await db.from('approval_signatures').insert(payload)

  if (error) {
    if (error.message.includes('approval_signatures') || error.code === '42P01') {
      return { error: 'ยังไม่ได้ติดตั้งตารางลงนาม — ติดต่อผู้ดูแลระบบ' }
    }
    return { error: error.message }
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'sign',
    module: 'sign',
    targetType: 'pp5_subject',
    targetId: classSubjectId,
    description: `ใส่ลายเซ็น ปพ.5 รายวิชา เทอม ${term}`,
  })
  return { success: true }
}

export async function proposePp5Subject(classSubjectId: string, term: number) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  const db = createServerClient()

  const { data: cs } = await db.from('class_subjects')
    .select('id, teacher_id, classrooms!inner(school_id)')
    .eq('id', classSubjectId)
    .maybeSingle()
  if (!cs || (cs.classrooms as { school_id: string }).school_id !== session.schoolId) {
    return { error: 'ไม่พบรายวิชา' }
  }
  if (cs.teacher_id !== session.userId && session.role !== 'admin' && session.role !== 'district') {
    return { error: 'เฉพาะครูผู้สอนเสนอเซ็นได้' }
  }

  const { data: existing } = await db.from('approval_signatures')
    .select('*')
    .eq('class_subject_id', classSubjectId)
    .eq('term', term)
    .maybeSingle()

  if (!existing?.teacher_signed_at) return { error: 'กรุณาใส่ลายเซ็นก่อนเสนอเซ็น' }
  if (existing.status === 'in_review') return { error: 'เอกสารอยู่ระหว่างเสนอเซ็นแล้ว' }

  const now = new Date().toISOString()
  const target = {
    schoolId: session.schoolId,
    docKind: 'pp5_subject' as const,
    term,
    classSubjectId,
  }

  if (existing.status === 'approved' || existing.status === 'rejected') {
    await archiveLegacyApprovalCycle(db, target, {
      submitted_at: existing.submitted_at,
      status: existing.status,
      completed_at: existing.director_signed_at || existing.updated_at,
      rejection_note: existing.rejection_note,
      submitted_by: existing.teacher_id,
    })
  }

  try {
    await recordApprovalSubmissionStart(db, target, session.userId, now)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'บันทึกประวัติไม่สำเร็จ' }
  }

  const { error } = await db.from('approval_signatures').update({
    status: 'in_review',
    submitted_at: now,
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
  }).eq('id', existing.id)

  if (error) return { error: error.message }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'submit',
    module: 'sign',
    targetType: 'pp5_subject',
    targetId: classSubjectId,
    description: `เสนอเซ็น ปพ.5 รายวิชา เทอม ${term}`,
  })
  return { success: true }
}

/** @deprecated ใช้ putPp5SubjectSignature + proposePp5Subject แทน */
export async function submitPp5Subject(classSubjectId: string, term: number) {
  const put = await putPp5SubjectSignature(classSubjectId, term)
  if (put.error) return put
  return proposePp5Subject(classSubjectId, term)
}

export async function signPp5Subject(
  classSubjectId: string,
  term: number,
  decision?: 'approve' | 'reject',
  rejectionNote?: string,
) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  const db = createServerClient()
  const { school, groupHeads } = await loadSchoolContext(session.schoolId)

  const { data: cs } = await db.from('class_subjects')
    .select('id, teacher_id, subjects!inner(subject_group), classrooms!inner(school_id)')
    .eq('id', classSubjectId)
    .maybeSingle()
  if (!cs || (cs.classrooms as { school_id: string }).school_id !== session.schoolId) {
    return { error: 'ไม่พบรายวิชา' }
  }
  const subjectGroup = (cs.subjects as { subject_group: string }).subject_group

  const { data: record } = await db.from('approval_signatures')
    .select('*')
    .eq('class_subject_id', classSubjectId)
    .eq('term', term)
    .maybeSingle()
  if (!record?.teacher_signed_at || record.status !== 'in_review') {
    return { error: 'เอกสารยังไม่ได้เสนอเซ็น' }
  }
  if (record.status === 'approved') return { error: 'อนุมัติแล้ว' }

  const next = getPp5SubjectNextStep(record as Pp5SubjectApproval, school, subjectGroup, groupHeads)
  if (!next || next === 'teacher') return { error: 'ไม่มีขั้นตอนลงนามที่รอดำเนินการ' }
  if (!canUserSignPp5SubjectStep(
    session.userId, session.role, next, school, subjectGroup, groupHeads, cs.teacher_id,
  )) return { error: 'ไม่มีสิทธิ์ลงนามในขั้นตอนนี้' }

  const stepLabel = PP5_SUBJECT_STEP_LABELS[next]
  const note = rejectionNote?.trim() || ''
  const now = new Date().toISOString()
  const fields = PP5_STEP_DB[next]
  const updates: Record<string, unknown> = { updated_at: now }

  if (decision === 'reject') {
    if (!note) return { error: 'กรุณาระบุเหตุผลที่ส่งกลับแก้ไข' }
    updates.status = 'rejected'
    updates.rejection_note = `${stepLabel}: ${note}`
    if (next === 'director') updates.director_decision = 'ไม่อนุมัติ'
  } else {
    if (next === 'director' && decision !== 'approve') {
      return { error: 'ผู้อำนวยการต้องเลือกอนุมัติหรือไม่อนุมัติ' }
    }
    const { data: signer } = await db.from('users')
      .select('signature_url')
      .eq('id', session.userId)
      .maybeSingle()
    if (!signer?.signature_url) {
      return { error: 'ยังไม่มีลายเซ็นในโปรไฟล์ — ไปที่ ตั้งค่า → ข้อมูลตัวเอง เพื่ออัปโหลดก่อน แล้วค่อยลงนาม/อนุมัติ' }
    }
    updates[fields.at] = now
    updates[fields.id] = session.userId
    if (next === 'director') {
      updates.director_decision = 'อนุมัติ'
      updates.status = 'approved'
      await db.from('scores').update({ locked: true, updated_at: now })
        .eq('class_subject_id', classSubjectId)
        .eq('term', term)
    }
  }

  const { error } = await db.from('approval_signatures').update(updates).eq('id', record.id)
  if (error) return { error: error.message }

  if (updates.status === 'approved' || updates.status === 'rejected') {
    try {
      await completeActiveApprovalSubmission(
        db,
        { schoolId: session.schoolId, docKind: 'pp5_subject', term, classSubjectId },
        updates.status,
        now,
        updates.rejection_note as string | null | undefined,
      )
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'บันทึกประวัติไม่สำเร็จ' }
    }
  }

  if (updates.status === 'approved') {
    scheduleApprovedDocumentArchive(() => archiveApprovedPp5Subject({
      actor: session,
      schoolId: session.schoolId!,
      approvalSignatureId: record.id,
      classSubjectId,
      term,
      approvedAt: now,
    }))
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: decision === 'reject' ? 'reject' : 'sign',
    module: 'sign',
    targetType: 'pp5_subject',
    targetId: classSubjectId,
    description: decision === 'reject'
      ? `ส่งกลับแก้ไข ปพ.5 รายวิชา โดย${stepLabel} เทอม ${term}`
      : `ลงนาม ปพ.5 รายวิชา (${stepLabel}) เทอม ${term}`,
  })
  return { success: true }
}

export async function putClassDocumentSignature(
  docType: ClassDocType,
  classroomId: string,
  term: number,
  month?: number | null,
) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  const db = createServerClient()
  const periodMonth = docType === 'classroom_admin' ? (month ?? null) : null

  const { data: classroom } = await db.from('classrooms')
    .select('id, school_id, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom || classroom.school_id !== session.schoolId) return { error: 'ไม่พบห้องเรียน' }

  const isHomeroom = classroom.homeroom_teacher_id === session.userId
    || classroom.homeroom_teacher2_id === session.userId
  if (!isHomeroom && session.role !== 'admin' && session.role !== 'district') {
    return { error: 'เฉพาะครูประจำชั้นใส่ลายเซ็นได้' }
  }

  if (docType === 'classroom_admin' && (periodMonth == null || periodMonth < 1 || periodMonth > 12)) {
    return { error: 'กรุณาเลือกเดือนก่อนใส่ลายเซ็น' }
  }

  const { data: user } = await db.from('users')
    .select('signature_url')
    .eq('id', session.userId)
    .maybeSingle()
  if (!user?.signature_url) {
    return { error: 'ยังไม่มีลายเซ็นในโปรไฟล์ — ไปที่ ตั้งค่า → ข้อมูลตัวเอง เพื่ออัปโหลดก่อน' }
  }

  const existing = await findClassDocumentApprovalExact(db, {
    classroomId,
    docType,
    term,
    month: periodMonth,
  })

  if (existing?.status === 'in_review') return { error: 'เอกสารอยู่ระหว่างเสนอเซ็นแล้ว แก้ไขลายเซ็นไม่ได้' }

  const now = new Date().toISOString()
  const payload = {
    school_id: session.schoolId,
    doc_type: docType,
    classroom_id: classroomId,
    academic_year_id: classroom.academic_year_id,
    term,
    month: periodMonth,
    homeroom_id: session.userId,
    homeroom_signed_at: now,
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

  const { error } = existing?.id
    ? await db.from('class_document_approvals').update(payload).eq('id', existing.id)
    : await db.from('class_document_approvals').insert(payload)

  if (error?.message?.includes('class_document_approvals')) {
    return { error: 'ยังไม่ได้ติดตั้งตารางลงนาม — รัน migration 034/043' }
  }
  if (error) return { error: error.message }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'sign',
    module: 'sign',
    targetType: docType,
    targetId: classroomId,
    description: periodMonth
      ? `ใส่ลายเซ็น ${docType} เทอม ${term} เดือน ${periodMonth}`
      : `ใส่ลายเซ็น ${docType} เทอม ${term}`,
  })
  return { success: true }
}

export async function proposeClassDocument(
  docType: ClassDocType,
  classroomId: string,
  term: number,
  month?: number | null,
) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  const db = createServerClient()
  const periodMonth = docType === 'classroom_admin' ? (month ?? null) : null

  const { data: classroom } = await db.from('classrooms')
    .select('id, school_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom || classroom.school_id !== session.schoolId) return { error: 'ไม่พบห้องเรียน' }

  const isHomeroom = classroom.homeroom_teacher_id === session.userId
    || classroom.homeroom_teacher2_id === session.userId
  if (!isHomeroom && session.role !== 'admin' && session.role !== 'district') {
    return { error: 'เฉพาะครูประจำชั้นเสนอเซ็นได้' }
  }

  if (docType === 'classroom_admin' && (periodMonth == null || periodMonth < 1 || periodMonth > 12)) {
    return { error: 'กรุณาเลือกเดือนก่อนเสนอเซ็น' }
  }

  const existing = await findClassDocumentApprovalExact(db, {
    classroomId,
    docType,
    term,
    month: periodMonth,
  })

  if (!existing?.homeroom_signed_at) return { error: 'กรุณาใส่ลายเซ็นก่อนเสนอเซ็น' }
  if (existing.status === 'in_review') return { error: 'เอกสารอยู่ระหว่างเสนอเซ็นแล้ว' }

  const now = new Date().toISOString()
  const target = {
    schoolId: session.schoolId,
    docKind: docType,
    term,
    classroomId,
    month: periodMonth,
  }

  if (existing.status === 'approved' || existing.status === 'rejected') {
    await archiveLegacyApprovalCycle(db, target, {
      submitted_at: existing.submitted_at,
      status: existing.status,
      completed_at: existing.director_signed_at || existing.updated_at,
      rejection_note: existing.rejection_note,
      submitted_by: existing.homeroom_id,
    })
  }

  try {
    await recordApprovalSubmissionStart(db, target, session.userId, now)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'บันทึกประวัติไม่สำเร็จ' }
  }

  const { error } = await db.from('class_document_approvals').update({
    status: 'in_review',
    submitted_at: now,
    rejection_note: null,
    academic_head_signed_at: null,
    academic_head_id: null,
    vice_director_signed_at: null,
    vice_director_id: null,
    director_signed_at: null,
    director_id: null,
    director_decision: null,
    updated_at: now,
  }).eq('id', existing.id)

  if (error) return { error: error.message }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'submit',
    module: 'sign',
    targetType: docType,
    targetId: classroomId,
    description: periodMonth
      ? `เสนอเซ็น ${docType} เทอม ${term} เดือน ${periodMonth}`
      : `เสนอเซ็น ${docType} เทอม ${term}`,
  })
  return { success: true }
}

/** @deprecated ใช้ putClassDocumentSignature + proposeClassDocument แทน */
export async function submitClassDocument(
  docType: ClassDocType,
  classroomId: string,
  term: number,
  month?: number | null,
) {
  const put = await putClassDocumentSignature(docType, classroomId, term, month)
  if (put.error) return put
  return proposeClassDocument(docType, classroomId, term, month)
}

export async function signClassDocument(
  docType: ClassDocType,
  classroomId: string,
  term: number,
  decision?: 'approve' | 'reject',
  rejectionNote?: string,
  month?: number | null,
) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  const db = createServerClient()
  const { school } = await loadSchoolContext(session.schoolId)
  const periodMonth = docType === 'classroom_admin' ? (month ?? null) : null

  const { data: classroom } = await db.from('classrooms')
    .select('id, school_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom || classroom.school_id !== session.schoolId) return { error: 'ไม่พบห้องเรียน' }

  const record = await findClassDocumentApprovalExact(db, {
    classroomId,
    docType,
    term,
    month: periodMonth,
  })
  if (!record?.homeroom_signed_at || record.status !== 'in_review') {
    return { error: 'เอกสารยังไม่ได้เสนอเซ็น' }
  }
  if (record.status === 'approved') return { error: 'อนุมัติแล้ว' }

  const next = getClassDocNextStep(record as ClassDocumentApproval, school, docType)
  if (!next || next === 'homeroom') return { error: 'ไม่มีขั้นตอนลงนามที่รอดำเนินการ' }
  if (!canUserSignClassDocStep(
    session.userId, session.role, next, school,
    classroom.homeroom_teacher_id, classroom.homeroom_teacher2_id,
  )) return { error: 'ไม่มีสิทธิ์ลงนามในขั้นตอนนี้' }

  const stepLabel = CLASS_DOC_STEP_LABELS[next]
  const note = rejectionNote?.trim() || ''
  const now = new Date().toISOString()
  const fields = CLASS_DOC_STEP_FIELDS[next]
  const updates: Record<string, unknown> = { updated_at: now }

  if (decision === 'reject') {
    if (!note) return { error: 'กรุณาระบุเหตุผลที่ส่งกลับแก้ไข' }
    updates.status = 'rejected'
    updates.rejection_note = `${stepLabel}: ${note}`
    if (next === 'director') updates.director_decision = 'ไม่อนุมัติ'
  } else {
    if (next === 'director' && decision !== 'approve') {
      return { error: 'ผู้อำนวยการต้องเลือกอนุมัติหรือไม่อนุมัติ' }
    }
    const { data: signer } = await db.from('users')
      .select('signature_url')
      .eq('id', session.userId)
      .maybeSingle()
    if (!signer?.signature_url) {
      return { error: 'ยังไม่มีลายเซ็นในโปรไฟล์ — ไปที่ ตั้งค่า → ข้อมูลตัวเอง เพื่ออัปโหลดก่อน แล้วค่อยลงนาม/อนุมัติ' }
    }
    updates[fields.at] = now
    updates[fields.id] = session.userId
    if (next === 'director') {
      updates.director_decision = 'อนุมัติ'
      updates.status = 'approved'
    }
  }

  const { error } = await db.from('class_document_approvals').update(updates).eq('id', record.id)
  if (error) return { error: error.message }

  if (updates.status === 'approved' || updates.status === 'rejected') {
    try {
      await completeActiveApprovalSubmission(
        db,
        { schoolId: session.schoolId, docKind: docType, term, classroomId, month: periodMonth },
        updates.status,
        now,
        updates.rejection_note as string | null | undefined,
      )
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'บันทึกประวัติไม่สำเร็จ' }
    }
  }

  if (updates.status === 'approved') {
    scheduleApprovedDocumentArchive(() => archiveApprovedClassDocument({
      actor: session,
      schoolId: session.schoolId!,
      classDocumentApprovalId: record.id,
      docType,
      classroomId,
      term,
      approvedAt: now,
    }))
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: decision === 'reject' ? 'reject' : 'sign',
    module: 'sign',
    targetType: docType,
    targetId: classroomId,
    description: decision === 'reject'
      ? (periodMonth
        ? `ส่งกลับแก้ไข ${docType} โดย${stepLabel} เทอม ${term} เดือน ${periodMonth}`
        : `ส่งกลับแก้ไข ${docType} โดย${stepLabel} เทอม ${term}`)
      : (periodMonth
        ? `ลงนาม ${docType} (${stepLabel}) เทอม ${term} เดือน ${periodMonth}`
        : `ลงนาม ${docType} (${stepLabel}) เทอม ${term}`),
  })
  return { success: true }
}

export async function cancelPp5SubjectProposal(classSubjectId: string, term: number) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  const db = createServerClient()
  const { school, groupHeads } = await loadSchoolContext(session.schoolId)

  const { data: cs } = await db.from('class_subjects')
    .select('id, teacher_id, subjects!inner(subject_group), classrooms!inner(school_id)')
    .eq('id', classSubjectId)
    .maybeSingle()
  if (!cs || (cs.classrooms as { school_id: string }).school_id !== session.schoolId) {
    return { error: 'ไม่พบรายวิชา' }
  }

  const { data: record } = await db.from('approval_signatures')
    .select('*')
    .eq('class_subject_id', classSubjectId)
    .eq('term', term)
    .maybeSingle()
  if (!record || record.status !== 'in_review') {
    return { error: 'ไม่มีเอกสารที่กำลังเสนอเซ็นอยู่' }
  }

  const isInitiator = cs.teacher_id === session.userId
  const hasApproverSignatures = pp5SubjectHasApproverSignatures(record as Pp5SubjectApproval)
  const allowed = canUserCancelProposal({
    role: session.role,
    userId: session.userId,
    school,
    isInitiator,
    status: record.status,
    hasApproverSignatures,
  })
  if (!allowed) {
    return { error: hasApproverSignatures
      ? 'ลำดับถัดไปลงนามแล้ว — ไม่สามารถยกเลิกการเสนอเซ็นได้'
      : 'ไม่มีสิทธิ์ยกเลิกการเสนอเซ็น' }
  }

  const now = new Date().toISOString()
  try {
    await completeActiveApprovalSubmission(
      db,
      { schoolId: session.schoolId, docKind: 'pp5_subject', term, classSubjectId },
      'rejected',
      now,
      'ยกเลิกการเสนอเซ็น',
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'บันทึกประวัติไม่สำเร็จ' }
  }

  const { error } = await db.from('approval_signatures')
    .update(pp5SubjectCancelProposalReset(now))
    .eq('id', record.id)
  if (error) return { error: error.message }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'cancel',
    module: 'sign',
    targetType: 'pp5_subject',
    targetId: classSubjectId,
    description: `ยกเลิกเสนอเซ็น ปพ.5 รายวิชา เทอม ${term}`,
  })
  return { success: true }
}

export async function cancelClassDocumentProposal(
  docType: ClassDocType,
  classroomId: string,
  term: number,
  month?: number | null,
) {
  const session = await requireSession()
  if (!session.schoolId) return { error: 'ยังไม่ได้เลือกโรงเรียน' }
  const db = createServerClient()
  const { school } = await loadSchoolContext(session.schoolId)
  const periodMonth = docType === 'classroom_admin' ? (month ?? null) : null

  const { data: classroom } = await db.from('classrooms')
    .select('id, school_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom || classroom.school_id !== session.schoolId) return { error: 'ไม่พบห้องเรียน' }

  const record = await findClassDocumentApprovalExact(db, {
    classroomId,
    docType,
    term,
    month: periodMonth,
  })
  if (!record || record.status !== 'in_review') {
    return { error: 'ไม่มีเอกสารที่กำลังเสนอเซ็นอยู่' }
  }

  const isHomeroom = classroom.homeroom_teacher_id === session.userId
    || classroom.homeroom_teacher2_id === session.userId
  const hasApproverSignatures = classDocHasApproverSignatures(record as ClassDocumentApproval, docType)
  const allowed = canUserCancelProposal({
    role: session.role,
    userId: session.userId,
    school,
    isInitiator: isHomeroom,
    status: record.status,
    hasApproverSignatures,
  })
  if (!allowed) {
    return { error: hasApproverSignatures
      ? 'ลำดับถัดไปลงนามแล้ว — ไม่สามารถยกเลิกการเสนอเซ็นได้'
      : 'ไม่มีสิทธิ์ยกเลิกการเสนอเซ็น' }
  }

  const now = new Date().toISOString()
  try {
    await completeActiveApprovalSubmission(
      db,
      { schoolId: session.schoolId, docKind: docType, term, classroomId, month: periodMonth },
      'rejected',
      now,
      'ยกเลิกการเสนอเซ็น',
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'บันทึกประวัติไม่สำเร็จ' }
  }

  const { error } = await db.from('class_document_approvals')
    .update(classDocCancelProposalReset(now))
    .eq('id', record.id)
  if (error) return { error: error.message }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'cancel',
    module: 'sign',
    targetType: docType,
    targetId: classroomId,
    description: periodMonth
      ? `ยกเลิกเสนอเซ็น ${docType} เทอม ${term} เดือน ${periodMonth}`
      : `ยกเลิกเสนอเซ็น ${docType} เทอม ${term}`,
  })
  return { success: true }
}

export async function fetchPp5SubjectApprovalStatus(classSubjectId: string, term: number) {
  const session = await requireSession()
  if (!session.schoolId) return null
  const db = createServerClient()
  const { school, groupHeads } = await loadSchoolContext(session.schoolId)

  const { data: cs } = await db.from('class_subjects')
    .select('teacher_id, subjects!inner(subject_group)')
    .eq('id', classSubjectId)
    .maybeSingle()
  if (!cs) return null

  const { data: record } = await db.from('approval_signatures')
    .select('*')
    .eq('class_subject_id', classSubjectId)
    .eq('term', term)
    .maybeSingle()

  const full = (record || { status: 'draft' }) as Pp5SubjectApproval
  const subjectGroup = (cs.subjects as { subject_group: string }).subject_group
  const next = getPp5SubjectNextStep(
    { ...full, class_subject_id: classSubjectId, term },
    school, subjectGroup, groupHeads,
  )
  const canSign = next && next !== 'teacher'
    ? canUserSignPp5SubjectStep(
      session.userId, session.role, next, school, subjectGroup, groupHeads, cs.teacher_id,
    )
    : false
  const isInitiator = cs.teacher_id === session.userId || session.role === 'admin'
  const isDraftLike = full.status === 'draft' || full.status === 'rejected' || !full.status
  const hasDocumentSignature = Boolean(full.teacher_signed_at)
  const hasApproverSignatures = pp5SubjectHasApproverSignatures(full)
  const canRepropose = isInitiator && hasDocumentSignature
    && (full.status === 'approved' || full.status === 'rejected')
  const canCancelProposal = canUserCancelProposal({
    role: session.role,
    userId: session.userId,
    school,
    isInitiator: cs.teacher_id === session.userId,
    status: full.status || 'draft',
    hasApproverSignatures,
  })
  return {
    status: full.status || 'draft',
    status_label: pp5SubjectStatusLabel(
      { ...full, class_subject_id: classSubjectId, term },
      school, subjectGroup, groupHeads,
    ),
    isInitiator,
    hasDocumentSignature,
    hasApproverSignatures,
    canPutSignature: isInitiator && full.status !== 'in_review' && (isDraftLike || full.status === 'approved' || full.status === 'rejected'),
    canPropose: canRepropose || (isInitiator && hasDocumentSignature && isDraftLike),
    canShowPropose: canRepropose || (isInitiator && isDraftLike),
    canRepropose,
    canCancelProposal,
    canSign,
    isDirectorStep: next === 'director',
    next_step: next ? PP5_SUBJECT_STEP_LABELS[next] : null,
    workflow_steps: getPp5SubjectWorkflowProgress(
      { ...full, class_subject_id: classSubjectId, term },
      school, subjectGroup, groupHeads,
    ),
  }
}

export async function fetchClassDocApprovalStatus(
  docType: ClassDocType,
  classroomId: string,
  term: number,
  month?: number | null,
) {
  const session = await requireSession()
  if (!session.schoolId) return null
  const db = createServerClient()
  const { school } = await loadSchoolContext(session.schoolId)
  const periodMonth = docType === 'classroom_admin' ? (month ?? null) : null

  const { data: classroom } = await db.from('classrooms')
    .select('homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom) return null

  const record = await findClassDocumentApproval(db, {
    classroomId,
    docType,
    term,
    month: periodMonth,
  })

  const full = (record || { status: 'draft' }) as ClassDocumentApproval
  const merged = { ...full, doc_type: docType, classroom_id: classroomId, term, month: periodMonth }
  const next = getClassDocNextStep(merged, school, docType)
  const isHomeroom = classroom.homeroom_teacher_id === session.userId
    || classroom.homeroom_teacher2_id === session.userId
  const isInitiator = isHomeroom || session.role === 'admin'
  const isDraftLike = full.status === 'draft' || full.status === 'rejected' || !full.status
  const hasDocumentSignature = Boolean(full.homeroom_signed_at)
  const hasApproverSignatures = classDocHasApproverSignatures(full, docType)
  const canSign = next && next !== 'homeroom'
    ? canUserSignClassDocStep(
      session.userId, session.role, next, school,
      classroom.homeroom_teacher_id, classroom.homeroom_teacher2_id,
    )
    : false
  const canRepropose = isInitiator && hasDocumentSignature
    && (full.status === 'approved' || full.status === 'rejected')
  const canCancelProposal = canUserCancelProposal({
    role: session.role,
    userId: session.userId,
    school,
    isInitiator: isHomeroom,
    status: full.status || 'draft',
    hasApproverSignatures,
  })
  return {
    status: full.status || 'draft',
    status_label: classDocStatusLabel(merged, school, docType),
    isInitiator,
    hasDocumentSignature,
    hasApproverSignatures,
    canPutSignature: isInitiator && full.status !== 'in_review' && (isDraftLike || full.status === 'approved' || full.status === 'rejected'),
    canPropose: canRepropose || (isInitiator && hasDocumentSignature && isDraftLike),
    canShowPropose: canRepropose || (isInitiator && isDraftLike),
    canRepropose,
    canCancelProposal,
    canSign,
    isDirectorStep: next === 'director',
    next_step: next ? CLASS_DOC_STEP_LABELS[next] : null,
    workflow_steps: getClassDocWorkflowProgress(merged, school, docType),
    month: full.month ?? periodMonth ?? null,
  }
}

export async function fetchDocumentApprovalSubmissionHistory(params: {
  variant: 'pp5_subject' | 'pp5_class' | 'pp6' | 'classroom_admin'
  classSubjectId?: string
  classroomId?: string
  term: number
}) {
  const session = await requireSession()
  if (!session.schoolId) return []

  const db = createServerClient()
  const { variant, classSubjectId, classroomId, term } = params

  if (variant === 'pp5_subject') {
    if (!classSubjectId) return []
    const { data: record } = await db.from('approval_signatures')
      .select('submitted_at, status, director_signed_at, updated_at, rejection_note')
      .eq('class_subject_id', classSubjectId)
      .eq('term', term)
      .maybeSingle()
    const items = await fetchApprovalSubmissionHistory(
      db,
      { schoolId: session.schoolId, docKind: 'pp5_subject', term, classSubjectId },
      record ? {
        submitted_at: record.submitted_at,
        status: record.status,
        completed_at: record.director_signed_at || record.updated_at,
        rejection_note: record.rejection_note,
      } : null,
    )
    return items.filter(item => item.status !== 'in_review')
  }

  if (!classroomId) return []
  const docType = variant === 'pp5_class' ? 'pp5_class' : variant === 'pp6' ? 'pp6' : 'classroom_admin'
  const { data: record } = await db.from('class_document_approvals')
    .select('submitted_at, status, director_signed_at, updated_at, rejection_note')
    .eq('classroom_id', classroomId)
    .eq('doc_type', docType)
    .eq('term', term)
    .maybeSingle()

  const items = await fetchApprovalSubmissionHistory(
    db,
    { schoolId: session.schoolId, docKind: docType, term, classroomId },
    record ? {
      submitted_at: record.submitted_at,
      status: record.status,
      completed_at: record.director_signed_at || record.updated_at,
      rejection_note: record.rejection_note,
    } : null,
  )
  return items.filter(item => item.status !== 'in_review')
}
