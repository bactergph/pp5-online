'use server'

import 'server-only'
import QRCode from 'qrcode'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import {
  buildDocumentVerifyUrl,
  ensureDocumentReference,
} from '@/lib/document-reference'
import {
  buildQrExportFileName,
  buildQrExportFolderSegments,
  QR_EXPORT_KIND_LABELS,
  type QrExportDocKind,
} from '@/lib/export-qr-pack'
import { uploadFileToDrive } from '@/lib/google-drive'

export type QrExportScope =
  | 'classroom'       // ห้องเดียว
  | 'level'           // ทั้งระดับชั้น (ทุกห้อง)
  | 'school'          // ทั้งโรงเรียน (ทุกชั้น/ห้อง/วิชาในประเภทนั้น)
  | 'subject_one'     // วิชา+ห้อง เดียว
  | 'subject_level'   // วิชาเดียวกัน ทั้งระดับชั้น
  | 'subject_school'  // วิชาเดียวกัน ทั้งโรงเรียน

export type QrExportInit = {
  years: { id: string; year_be: number; is_active: boolean }[]
  classrooms: { id: string; level: string; room: number; academic_year_id: string }[]
  /** คีย์ = `${code}||${name}` สำหรับเลือกวิชา */
  subjects: { key: string; code: string; name: string }[]
  driveConnected: boolean
}

export type QrExportMatch = {
  exportId: string
  code: string
  verifyUrl: string
  title: string
  docKind: QrExportDocKind
  level: string
  room: number
  yearBe: number
  term: number
  subjectCode: string | null
  subjectName: string | null
  folderPath: string
  fileName: string
}

export type QrExportFilter = {
  academicYearId: string
  docKind: QrExportDocKind
  scope: QrExportScope
  term: 1 | 2 | 0
  classroomId?: string
  level?: string
  /** subject key = `${code}||${name}` */
  subjectKey?: string
}

async function requireSchoolSession() {
  const session = await getSession()
  if (!session?.schoolId) throw new Error('ไม่มีสิทธิ์')
  if (!['admin', 'principal', 'deputy_principal', 'academic_head', 'district'].includes(session.role)) {
    throw new Error('เมนูนี้ใช้ได้เฉพาะฝ่ายวิชาการ/ผู้บริหาร')
  }
  return session
}

function parseSubjectKey(key: string) {
  const [code, ...rest] = key.split('||')
  return { code: code || '', name: rest.join('||') || '' }
}

export async function fetchQrExportInit(): Promise<QrExportInit> {
  const session = await requireSchoolSession()
  const db = createServerClient()

  const [yearsR, classroomsR, csR, schoolR] = await Promise.all([
    db.from('academic_years')
      .select('id, year_be, is_active')
      .eq('school_id', session.schoolId!)
      .order('year_be', { ascending: false }),
    db.from('classrooms')
      .select('id, level, room, academic_year_id')
      .eq('school_id', session.schoolId!)
      .order('level')
      .order('room'),
    db.from('class_subjects')
      .select('id, academic_year_id, subjects(code, name), classrooms!inner(school_id)')
      .eq('classrooms.school_id', session.schoolId!),
    db.from('schools').select('google_drive_folder_id').eq('id', session.schoolId!).maybeSingle(),
  ])

  if (yearsR.error) throw new Error(yearsR.error.message)
  if (classroomsR.error) throw new Error(classroomsR.error.message)

  const subjectMap = new Map<string, { key: string; code: string; name: string }>()
  for (const row of csR.data || []) {
    const sub = row.subjects as { code?: string; name?: string } | { code?: string; name?: string }[] | null
    const s = Array.isArray(sub) ? sub[0] : sub
    const code = (s?.code || '').trim()
    const name = (s?.name || '').trim()
    if (!code && !name) continue
    const key = `${code}||${name}`
    if (!subjectMap.has(key)) subjectMap.set(key, { key, code, name })
  }

  return {
    years: (yearsR.data || []) as QrExportInit['years'],
    classrooms: (classroomsR.data || []) as QrExportInit['classrooms'],
    subjects: Array.from(subjectMap.values()).sort((a, b) =>
      `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, 'th'),
    ),
    driveConnected: Boolean(schoolR.data?.google_drive_folder_id),
  }
}

async function loadMatchingExports(filter: QrExportFilter): Promise<QrExportMatch[]> {
  const session = await requireSchoolSession()
  const db = createServerClient()

  const { data: year } = await db.from('academic_years')
    .select('id, year_be')
    .eq('id', filter.academicYearId)
    .eq('school_id', session.schoolId!)
    .maybeSingle()
  if (!year) throw new Error('ไม่พบปีการศึกษา')

  const { data: classrooms } = await db.from('classrooms')
    .select('id, level, room')
    .eq('school_id', session.schoolId!)
    .eq('academic_year_id', filter.academicYearId)
  const classroomById = new Map((classrooms || []).map(c => [c.id, c]))

  let query = db.from('approved_document_exports')
    .select('id, title, doc_kind, term, classroom_id, class_subject_id, academic_year_id, status')
    .eq('school_id', session.schoolId!)
    .eq('academic_year_id', filter.academicYearId)
    .eq('doc_kind', filter.docKind)
    .order('approved_at', { ascending: false })

  if (filter.term === 1 || filter.term === 2) {
    query = query.eq('term', filter.term)
  }

  const { data: exports, error } = await query
  if (error) {
    if (error.message.includes('approved_document_exports')) {
      throw new Error('ยังไม่มีตารางเอกสารอนุมัติ — รัน migration ก่อน')
    }
    throw new Error(error.message)
  }

  let rows = exports || []

  // กรองตาม scope
  if (filter.docKind === 'pp5_subject') {
    const allSubjects = filter.scope === 'school'
    const subjectKey = filter.subjectKey || ''
    if (!allSubjects && !subjectKey) throw new Error('เลือกวิชาก่อน')
    const { code, name } = allSubjects ? { code: '', name: '' } : parseSubjectKey(subjectKey)

    const { data: classSubjects } = await db.from('class_subjects')
      .select('id, classroom_id, subjects(code, name), classrooms!inner(id, level, room, academic_year_id, school_id)')
      .eq('academic_year_id', filter.academicYearId)
      .eq('classrooms.school_id', session.schoolId!)

    const allowedCsIds = new Set<string>()
    const csMeta = new Map<string, { code: string; name: string; level: string; room: number; classroomId: string }>()

    for (const cs of classSubjects || []) {
      const sub = cs.subjects as { code?: string; name?: string } | { code?: string; name?: string }[] | null
      const s = Array.isArray(sub) ? sub[0] : sub
      const sc = (s?.code || '').trim()
      const sn = (s?.name || '').trim()
      if (!allSubjects && (sc !== code || sn !== name)) continue

      const room = cs.classrooms as { id: string; level: string; room: number } | { id: string; level: string; room: number }[] | null
      const cr = Array.isArray(room) ? room[0] : room
      if (!cr) continue

      if (filter.scope === 'subject_one') {
        if (filter.classroomId && cr.id !== filter.classroomId) continue
      } else if (filter.scope === 'subject_level') {
        if (filter.level && cr.level !== filter.level) continue
      }
      // subject_school / school = ไม่กรองชั้น/ห้อง

      allowedCsIds.add(cs.id)
      csMeta.set(cs.id, {
        code: sc,
        name: sn,
        level: cr.level,
        room: cr.room,
        classroomId: cr.id,
      })
    }

    rows = rows.filter(r => r.class_subject_id && allowedCsIds.has(r.class_subject_id))

    const matches: QrExportMatch[] = []
    for (const row of rows) {
      const meta = csMeta.get(row.class_subject_id as string)
      if (!meta) continue
      const ref = await ensureDocumentReference({
        schoolId: session.schoolId!,
        exportId: row.id,
      })
      if (!ref?.code) continue
      const folderSegments = buildQrExportFolderSegments({
        yearBe: year.year_be,
        docKind: filter.docKind,
        level: meta.level,
        room: meta.room,
      })
      const fileName = buildQrExportFileName({
        code: ref.code,
        subjectCode: meta.code,
        subjectName: meta.name,
        term: row.term,
      })
      matches.push({
        exportId: row.id,
        code: ref.code,
        verifyUrl: buildDocumentVerifyUrl(ref.code),
        title: row.title,
        docKind: filter.docKind,
        level: meta.level,
        room: meta.room,
        yearBe: year.year_be,
        term: row.term,
        subjectCode: meta.code,
        subjectName: meta.name,
        folderPath: folderSegments.join('/'),
        fileName,
      })
    }
    return matches
  }

  // รายชั้น / ธุรการ
  rows = rows.filter(r => {
    const cr = classroomById.get(r.classroom_id as string)
    if (!cr) return false
    if (filter.scope === 'classroom') return filter.classroomId ? cr.id === filter.classroomId : false
    if (filter.scope === 'level') return filter.level ? cr.level === filter.level : false
    if (filter.scope === 'school') return true
    return true
  })

  const matches: QrExportMatch[] = []
  for (const row of rows) {
    const cr = classroomById.get(row.classroom_id as string)
    if (!cr) continue
    const ref = await ensureDocumentReference({
      schoolId: session.schoolId!,
      exportId: row.id,
    })
    if (!ref?.code) continue
    const folderSegments = buildQrExportFolderSegments({
      yearBe: year.year_be,
      docKind: filter.docKind,
      level: cr.level,
      room: cr.room,
    })
    const fileName = buildQrExportFileName({
      code: ref.code,
      term: row.term,
    })
    matches.push({
      exportId: row.id,
      code: ref.code,
      verifyUrl: buildDocumentVerifyUrl(ref.code),
      title: row.title,
      docKind: filter.docKind,
      level: cr.level,
      room: cr.room,
      yearBe: year.year_be,
      term: row.term,
      subjectCode: null,
      subjectName: null,
      folderPath: folderSegments.join('/'),
      fileName,
    })
  }
  return matches
}

export async function previewQrExportMatches(filter: QrExportFilter) {
  const matches = await loadMatchingExports(filter)
  return {
    count: matches.length,
    kindLabel: QR_EXPORT_KIND_LABELS[filter.docKind],
    matches: matches.slice(0, 80),
    truncated: matches.length > 80,
  }
}

export type QrPackFile = {
  /** path ใน ZIP เช่น งานวิชาการ/2569/.../file.png */
  path: string
  /** base64 ของ PNG */
  base64: string
}

export async function buildQrExportPack(filter: QrExportFilter): Promise<{
  files: QrPackFile[]
  count: number
  zipName: string
}> {
  const matches = await loadMatchingExports(filter)
  if (!matches.length) throw new Error('ไม่พบเอกสารที่อนุมัติแล้วตามเงื่อนไขที่เลือก')

  const files: QrPackFile[] = []
  for (const item of matches) {
    const png = await QRCode.toBuffer(item.verifyUrl, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#111827', light: '#ffffff' },
    })
    const folderSegments = buildQrExportFolderSegments({
      yearBe: item.yearBe,
      docKind: item.docKind,
      level: item.level,
      room: item.room,
    })
    files.push({
      path: [...folderSegments, item.fileName].join('/'),
      base64: Buffer.from(png).toString('base64'),
    })

    // ไฟล์ข้อความคู่กัน — รหัส + URL
    const txtName = item.fileName.replace(/\.png$/i, '.txt')
    const txt = [
      `Digital Reference: ${item.code}`,
      `URL: ${item.verifyUrl}`,
      `เอกสาร: ${item.title}`,
      `ชั้น: ${item.level}/${item.room}`,
      item.subjectCode ? `วิชา: ${item.subjectCode} ${item.subjectName || ''}`.trim() : '',
      `ภาคเรียน: ${item.term}`,
    ].filter(Boolean).join('\n')
    files.push({
      path: [...folderSegments, txtName].join('/'),
      base64: Buffer.from(txt, 'utf8').toString('base64'),
    })
  }

  const zipName = `QR_${QR_EXPORT_KIND_LABELS[filter.docKind].replace(/\s+/g, '_')}_${matches[0].yearBe}.zip`
  return { files, count: matches.length, zipName: zipName.replace(/[\\/:*?"<>|]/g, '-') }
}

export async function uploadQrExportToDrive(filter: QrExportFilter): Promise<{
  uploaded: number
  folderHint: string
  error?: string
}> {
  const session = await requireSchoolSession()
  const db = createServerClient()
  const { data: school } = await db.from('schools')
    .select('google_drive_folder_id')
    .eq('id', session.schoolId!)
    .maybeSingle()

  if (!school?.google_drive_folder_id) {
    return { uploaded: 0, folderHint: '', error: 'ยังไม่ได้เชื่อมต่อ Google Drive ของโรงเรียน' }
  }

  const pack = await buildQrExportPack(filter)
  let uploaded = 0
  let folderHint = ''

  for (const file of pack.files) {
    const parts = file.path.split('/')
    const fileName = parts.pop()!
    const folderSegments = parts
    const buffer = Buffer.from(file.base64, 'base64')
    const mime = fileName.endsWith('.png') ? 'image/png' : 'text/plain'
    const result = await uploadFileToDrive({
      schoolId: session.schoolId!,
      rootFolderId: school.google_drive_folder_id,
      folderSegments,
      fileName,
      buffer,
      mimeType: mime,
    })
    if (result.fileId) {
      uploaded += 1
      if (!folderHint) folderHint = result.folderPath
    }
  }

  if (!uploaded) {
    return { uploaded: 0, folderHint, error: 'อัปโหลดไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ Google Drive' }
  }

  return { uploaded, folderHint }
}
