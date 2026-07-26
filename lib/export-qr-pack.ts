/** โครงสร้างโฟลเดอร์ Export QR-Code (งานวิชาการ) */

export type QrExportDocKind = 'pp5_subject' | 'pp5_class' | 'classroom_admin'

export const QR_EXPORT_ROOT_FOLDER = 'งานวิชาการ'

export const QR_EXPORT_KIND_FOLDER: Record<QrExportDocKind, string> = {
  pp5_subject: 'ปพ.5รายวิชา',
  pp5_class: 'ปพ.5รายชั้น',
  classroom_admin: 'ธุรการชั้นเรียน',
}

export const QR_EXPORT_KIND_LABELS: Record<QrExportDocKind, string> = {
  pp5_subject: 'ปพ.5 รายวิชา',
  pp5_class: 'ปพ.5 รายชั้น',
  classroom_admin: 'ธุรการชั้นเรียน',
}

export function sanitizeQrPathPart(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || '-'
}

/** งานวิชาการ / ปี / ประเภท / ชั้น / ห้อง */
export function buildQrExportFolderSegments(params: {
  yearBe: number | string
  docKind: QrExportDocKind
  level: string
  room: number | string
}) {
  return [
    QR_EXPORT_ROOT_FOLDER,
    sanitizeQrPathPart(String(params.yearBe)),
    QR_EXPORT_KIND_FOLDER[params.docKind],
    sanitizeQrPathPart(params.level),
    sanitizeQrPathPart(String(params.room)),
  ]
}

export function buildQrExportFileName(params: {
  code: string
  subjectCode?: string | null
  subjectName?: string | null
  term?: number | null
}) {
  const parts = [
    'QR',
    sanitizeQrPathPart(params.code),
    params.subjectCode ? sanitizeQrPathPart(params.subjectCode) : '',
    params.subjectName ? sanitizeQrPathPart(params.subjectName) : '',
    params.term ? `ท${params.term}` : '',
  ].filter(Boolean)
  return `${parts.join('_')}.png`
}
