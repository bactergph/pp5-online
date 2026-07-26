import { isPrimaryClassLevel, pp5SubjectReportTerm } from '@/lib/class-level'
import type { ClassDocType } from '@/lib/approvals/types'

export type SignDocumentPreviewTarget = {
  kind: 'pp5-subject' | 'pp5-class' | 'pp6' | 'classroom_admin'
  academicYearId: string
  classroomId: string
  level: string
  signTerm: number
  classSubjectId?: string
  /** ธุรการชั้นเรียน — เดือนที่เสนอเซ็น (1–12) บังคับใช้ชุดเดียวของเดือนนั้น */
  month?: number | null
}

const TERM_MONTHS: Record<1 | 2, number[]> = {
  1: [5, 6, 7, 8, 9, 10],
  2: [11, 12, 1, 2, 3, 4],
}

const CLASSROOM_ADMIN_REPORTS = [
  'attendance',
  'brushing',
  'milk',
  'lunch',
  'cleaning',
  'saving',
  'health',
  'inspection',
].join(',')

export function classDocTypeToPreviewKind(docType: ClassDocType): SignDocumentPreviewTarget['kind'] {
  if (docType === 'pp5_class') return 'pp5-class'
  if (docType === 'pp6') return 'pp6'
  return 'classroom_admin'
}

export function reportTermForSignPreview(target: SignDocumentPreviewTarget): number {
  if (target.kind === 'pp5-subject') {
    const selected = target.signTerm === 2 ? 2 : 1
    return pp5SubjectReportTerm(target.level, selected as 0 | 1 | 2)
  }
  if (target.kind === 'pp5-class') {
    return isPrimaryClassLevel(target.level) ? 0 : target.signTerm
  }
  return target.signTerm
}

function defaultSections(kind: SignDocumentPreviewTarget['kind']) {
  if (kind === 'pp6') return 'cover'
  return 'cover,criteria,scores'
}

/** YYYY-MM แบบ ค.ศ. สำหรับเดือนในเทอม — เดือน 1–4 ข้ามปีถัดจาก พ.ค.–ธ.ค. */
function classroomAdminMonthKey(month: number) {
  const now = new Date()
  let year = now.getFullYear()
  const nowMonth = now.getMonth() + 1
  if (month <= 4 && nowMonth >= 5) year += 1
  else if (month >= 5 && nowMonth <= 4) year -= 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function buildSignDocumentPreviewUrl(target: SignDocumentPreviewTarget, mode: 'embed' | 'print' = 'embed') {
  if (target.kind === 'classroom_admin') {
    const term = target.signTerm === 2 ? 2 : 1
    const month = target.month != null && target.month >= 1 && target.month <= 12
      ? target.month
      : TERM_MONTHS[term][0]
    const params = new URLSearchParams({
      [mode]: '1',
      year: target.academicYearId,
      classroom: target.classroomId,
      term: String(term),
      months: String(month),
      reports: CLASSROOM_ADMIN_REPORTS,
      monthkey: classroomAdminMonthKey(month),
    })
    return `/export/classroom-admin?${params}`
  }

  const path = {
    'pp5-subject': '/reports/pp5',
    'pp5-class': '/reports/pp5-class',
    pp6: '/reports/pp6',
    classroom_admin: '/export/classroom-admin',
  }[target.kind]

  const params = new URLSearchParams({
    [mode]: '1',
    year: target.academicYearId,
    classroom: target.classroomId,
    level: target.level,
    term: String(reportTermForSignPreview(target)),
    sections: defaultSections(target.kind),
  })
  if (target.classSubjectId) params.set('subject', target.classSubjectId)
  return `${path}?${params}`
}

export function buildSignDocumentPrintRequest(target: SignDocumentPreviewTarget) {
  const url = buildSignDocumentPreviewUrl(target, 'print')
  const [path, query = ''] = url.split('?')
  return {
    path,
    query,
    landscape: target.kind === 'classroom_admin',
  }
}

export function signDocumentPreviewTargetToParams(target: SignDocumentPreviewTarget) {
  const params = new URLSearchParams({
    kind: target.kind,
    year: target.academicYearId,
    classroom: target.classroomId,
    level: target.level,
    signTerm: String(target.signTerm),
  })
  if (target.classSubjectId) params.set('subject', target.classSubjectId)
  if (target.month != null && target.month >= 1 && target.month <= 12) {
    params.set('month', String(target.month))
  }
  return params
}

export function parseSignDocumentPreviewTarget(params: URLSearchParams): SignDocumentPreviewTarget | null {
  const kind = params.get('kind') as SignDocumentPreviewTarget['kind'] | null
  const academicYearId = params.get('year')
  const classroomId = params.get('classroom')
  const level = params.get('level')
  const signTerm = Number(params.get('signTerm'))
  if (!kind || !academicYearId || !classroomId || !level || !Number.isFinite(signTerm)) return null
  if (!['pp5-subject', 'pp5-class', 'pp6', 'classroom_admin'].includes(kind)) return null
  const monthRaw = params.get('month')
  const month = monthRaw != null ? Number(monthRaw) : null
  return {
    kind,
    academicYearId,
    classroomId,
    level,
    signTerm,
    classSubjectId: params.get('subject') || undefined,
    month: month != null && Number.isFinite(month) && month >= 1 && month <= 12 ? month : null,
  }
}

export function buildDocumentPreviewShellUrl(
  target: SignDocumentPreviewTarget,
  options?: { title?: string; readonly?: boolean },
) {
  const params = signDocumentPreviewTargetToParams(target)
  if (options?.title) params.set('title', options.title)
  if (options?.readonly) params.set('readonly', '1')
  return `/documents/preview?${params}`
}

export function buildDocumentPreviewShellUrlFromSrc(
  srcPath: string,
  options?: { title?: string; readonly?: boolean },
) {
  const params = new URLSearchParams({ src: srcPath })
  if (options?.title) params.set('title', options.title)
  if (options?.readonly) params.set('readonly', '1')
  return `/documents/preview?${params}`
}

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'unknown'
}

export function approvedDocumentFileName(parts: {
  level: string
  room: number | string
  subjectCode?: string
  teacherName?: string
  approvedAt: Date
}) {
  const date = parts.approvedAt
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const base = [
    sanitizeFilePart(parts.level),
    sanitizeFilePart(String(parts.room)),
    parts.subjectCode ? sanitizeFilePart(parts.subjectCode) : '',
    parts.teacherName ? sanitizeFilePart(parts.teacherName) : '',
    datePart,
  ].filter(Boolean).join('_')
  return `${base}.pdf`
}

export const APPROVED_DOC_FOLDER_LABELS: Record<SignDocumentPreviewTarget['kind'], string> = {
  'pp5-subject': 'ปพ.5รายวิชา',
  'pp5-class': 'ปพ.5รวมชั้นเรียน',
  pp6: 'ปพ.6',
  classroom_admin: 'ธุรการชั้นเรียน',
}

export const APPROVED_DOC_KIND_LABELS: Record<string, string> = {
  pp5_subject: 'ปพ.5 รายวิชา',
  pp5_class: 'ปพ.5 รวมชั้นเรียน',
  pp6: 'ปพ.6',
  classroom_admin: 'ธุรการชั้นเรียน',
}
