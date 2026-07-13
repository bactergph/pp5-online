import type { CSSProperties } from 'react'
import { PRINT_STUDENTS_PER_PAGE } from '@/lib/print-student-pages'

export type Pp5CoverSection = 'coverClass' | 'coverSubject'

export type Pp5BodySection =
  | 'criteria'
  | 'attendance'
  | 'scores'
  | 'achievement'
  | 'character'
  | 'reading'
  | 'competency'
  | 'activities'

/** ส่วนที่ปรับ layout ได้ใน ปพ.5 */
export type Pp5PrintSection = Pp5CoverSection | Pp5BodySection

export const PP5_COVER_SECTIONS: Pp5CoverSection[] = ['coverClass', 'coverSubject']

export const PP5_BODY_SECTIONS: Pp5BodySection[] = [
  'criteria',
  'attendance',
  'scores',
  'achievement',
  'character',
  'reading',
  'competency',
  'activities',
]

export const PP5_PRINT_SECTIONS: Pp5PrintSection[] = [...PP5_COVER_SECTIONS, ...PP5_BODY_SECTIONS]

export function isPp5CoverSection(section: Pp5PrintSection): section is Pp5CoverSection {
  return section === 'coverClass' || section === 'coverSubject'
}

/** ค่า layout หน้าปก */
export type Pp5CoverLayout = {
  padTopMm: number
  padSideMm: number
  padBottomMm: number
  fontBasePx: number
  fontH1Px: number
  fontInfoPx: number
  fontTablePx: number
  fontTableSmallPx: number
  fontSignaturePx: number
  logoSizePx: number
  docMarkTopPx: number
  docMarkRightPx: number
  docMarkFontPx: number
  headerGapPx: number
  tableTopMm: number
  tableRowHeightPx: number
  summaryGapPx: number
  approvalGapPx: number
}

/** ค่า layout หน้าเนื้อหา */
export type Pp5SectionLayout = {
  padTopMm: number
  padSideMm: number
  padBottomMm: number
  fontH1Px: number
  fontSubPx: number
  fontTablePx: number
  fontScorePx: number
  fontGradePx: number
  fontNamePx: number
  fontNumberPx: number
  rowHeightPx: number
  minStudentRows: number
  criteriaFontPx: number
  logoSizePx: number
  logoGapPx: number
  logoOffsetXPx: number
  logoOffsetYPx: number
}

export type Pp5PrintLayouts = Record<Pp5CoverSection, Pp5CoverLayout> & Record<Pp5BodySection, Pp5SectionLayout>

const BODY_DEFAULT: Pp5SectionLayout = {
  padTopMm: 25,
  padSideMm: 13,
  padBottomMm: 10,
  fontH1Px: 18,
  fontSubPx: 16,
  fontTablePx: 16,
  fontScorePx: 16,
  fontGradePx: 16,
  fontNamePx: 15,
  fontNumberPx: 13,
  rowHeightPx: 23,
  minStudentRows: 40,
  criteriaFontPx: 16,
  logoSizePx: 24,
  logoGapPx: 8,
  logoOffsetXPx: 0,
  logoOffsetYPx: 0,
}

const COVER_CLASS_DEFAULT: Pp5CoverLayout = {
  padTopMm: 9,
  padSideMm: 10,
  padBottomMm: 10,
  fontBasePx: 20,
  fontH1Px: 27,
  fontInfoPx: 18,
  fontTablePx: 19,
  fontTableSmallPx: 15,
  fontSignaturePx: 16,
  logoSizePx: 88,
  docMarkTopPx: 42,
  docMarkRightPx: 40,
  docMarkFontPx: 22,
  headerGapPx: 18,
  tableTopMm: 3,
  tableRowHeightPx: 11,
  summaryGapPx: 3,
  approvalGapPx: 5,
}

const COVER_SUBJECT_DEFAULT: Pp5CoverLayout = {
  padTopMm: 9,
  padSideMm: 10,
  padBottomMm: 10,
  fontBasePx: 18,
  fontH1Px: 30,
  fontInfoPx: 18,
  fontTablePx: 15,
  fontTableSmallPx: 14,
  fontSignaturePx: 16,
  logoSizePx: 88,
  docMarkTopPx: 24,
  docMarkRightPx: 34,
  docMarkFontPx: 23,
  headerGapPx: 18,
  tableTopMm: 10,
  tableRowHeightPx: 10,
  summaryGapPx: 3,
  approvalGapPx: 4,
}

export const DEFAULT_PP5_SECTION_LAYOUT = BODY_DEFAULT

export const DEFAULT_PP5_PRINT_LAYOUTS: Pp5PrintLayouts = {
  coverClass: { ...COVER_CLASS_DEFAULT },
  coverSubject: { ...COVER_SUBJECT_DEFAULT },
  criteria: { ...BODY_DEFAULT },
  attendance: {
    padTopMm: 20,
    padSideMm: 15.5,
    padBottomMm: 10,
    fontH1Px: 20,
    fontSubPx: 18,
    fontTablePx: 21,
    fontScorePx: 16,
    fontGradePx: 16,
    fontNamePx: 16,
    fontNumberPx: 13,
    rowHeightPx: 27,
    minStudentRows: 35,
    criteriaFontPx: 16,
    logoSizePx: 24,
    logoGapPx: 8,
    logoOffsetXPx: 0,
    logoOffsetYPx: 0,
  },
  scores: { ...BODY_DEFAULT },
  achievement: { ...BODY_DEFAULT },
  character: { ...BODY_DEFAULT },
  reading: { ...BODY_DEFAULT },
  competency: { ...BODY_DEFAULT },
  activities: { ...BODY_DEFAULT },
}

const STORAGE_KEY = 'pp5-print-layouts-v3'
export const PP5_PRINT_LAYOUTS_STORAGE_KEY = STORAGE_KEY
const STORAGE_KEY_V2 = 'pp5-print-layouts-v2'
const STORAGE_KEY_V1 = 'pp5-print-layout-v1'

export function mmToPx96(mm: number): number {
  return Math.round((mm * 96) / 25.4)
}

export function pxToMm96(px: number): number {
  return Math.round(((px * 25.4) / 96) * 10) / 10
}

export function pp5StudentTableRows(studentCount: number, layout: Pp5SectionLayout = BODY_DEFAULT): number {
  const pageSize = PRINT_STUDENTS_PER_PAGE
  if (studentCount >= pageSize) return studentCount
  return Math.max(studentCount, Math.min(layout.minStudentRows, pageSize))
}

export function pp5AttendanceMaxRows(layout: Pp5SectionLayout, theadRows = 5): number {
  const pageHeightMm = 297
  const headerBlockMm = 36
  const theadRowMm = 4.8
  const bodyRowMm = pxToMm96(layout.rowHeightPx)
  const available = pageHeightMm - layout.padTopMm - layout.padBottomMm - headerBlockMm - (theadRows * theadRowMm)
  return Math.max(18, Math.min(PRINT_STUDENTS_PER_PAGE, Math.floor(available / bodyRowMm)))
}

export function pp5AttendanceBodyRows(
  studentCount: number,
  layout: Pp5SectionLayout,
  theadRows = 5,
): number {
  const pageSize = PRINT_STUDENTS_PER_PAGE
  const padded = studentCount >= pageSize
    ? studentCount
    : Math.max(studentCount, Math.min(layout.minStudentRows, pageSize))
  const maxFitRows = pp5AttendanceMaxRows(layout, theadRows)
  if (studentCount > maxFitRows) return Math.min(studentCount, pageSize)
  return Math.min(padded, pageSize)
}

export function pp5CoverLayoutToCssVars(layout: Pp5CoverLayout): Record<string, string> {
  return {
    '--pp5-cover-pad-top': `${layout.padTopMm}mm`,
    '--pp5-cover-pad-x': `${layout.padSideMm}mm`,
    '--pp5-cover-pad-bottom': `${layout.padBottomMm}mm`,
    '--pp5-cover-font-base': `${layout.fontBasePx}px`,
    '--pp5-cover-font-h1': `${layout.fontH1Px}px`,
    '--pp5-cover-font-info': `${layout.fontInfoPx}px`,
    '--pp5-cover-font-table': `${layout.fontTablePx}px`,
    '--pp5-cover-font-table-sm': `${layout.fontTableSmallPx}px`,
    '--pp5-cover-font-signature': `${layout.fontSignaturePx}px`,
    '--pp5-cover-logo-size': `${layout.logoSizePx}px`,
    '--pp5-cover-doc-mark-top': `${layout.docMarkTopPx}px`,
    '--pp5-cover-doc-mark-right': `${layout.docMarkRightPx}px`,
    '--pp5-cover-doc-mark-font': `${layout.docMarkFontPx}px`,
    '--pp5-cover-header-gap': `${layout.headerGapPx}px`,
    '--pp5-cover-table-top': `${layout.tableTopMm}mm`,
    '--pp5-cover-table-row-h': `${layout.tableRowHeightPx}px`,
    '--pp5-cover-summary-gap': `${layout.summaryGapPx}px`,
    '--pp5-cover-approval-gap': `${layout.approvalGapPx}px`,
  }
}

export function pp5BodyLayoutToCssVars(layout: Pp5SectionLayout): Record<string, string> {
  return {
    '--pp5-pad-top': `${layout.padTopMm}mm`,
    '--pp5-pad-x': `${layout.padSideMm}mm`,
    '--pp5-pad-bottom': `${layout.padBottomMm}mm`,
    '--pp5-att-pad-x': `${layout.padSideMm}mm`,
    '--pp5-font-h1': `${layout.fontH1Px}px`,
    '--pp5-font-sub': `${layout.fontSubPx}px`,
    '--pp5-font-table': `${layout.fontTablePx}px`,
    '--pp5-font-score': `${layout.fontScorePx}px`,
    '--pp5-font-grade': `${layout.fontGradePx}px`,
    '--pp5-font-name': `${layout.fontNamePx}px`,
    '--pp5-font-number': `${layout.fontNumberPx}px`,
    '--pp5-row-h': `${layout.rowHeightPx}px`,
    '--pp5-criteria-font': `${layout.criteriaFontPx}px`,
    '--pp5-logo-size': `${layout.logoSizePx}px`,
    '--pp5-logo-gap': `${layout.logoGapPx}px`,
    '--pp5-logo-offset-x': `${layout.logoOffsetXPx}px`,
    '--pp5-logo-offset-y': `${layout.logoOffsetYPx}px`,
  }
}

export function pp5SectionLayoutToCssVars(
  section: Pp5PrintSection,
  layout: Pp5CoverLayout | Pp5SectionLayout,
): Record<string, string> {
  if (isPp5CoverSection(section)) {
    return pp5CoverLayoutToCssVars(layout as Pp5CoverLayout)
  }
  return pp5BodyLayoutToCssVars(layout as Pp5SectionLayout)
}

export function pp5SectionLayoutStyle(section: Pp5PrintSection, layout: Pp5CoverLayout | Pp5SectionLayout): CSSProperties {
  return pp5SectionLayoutToCssVars(section, layout) as CSSProperties
}

function migrateV1Layouts(): Partial<Pp5PrintLayouts> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_V1)
    if (!raw) return null
    const v1 = JSON.parse(raw) as Record<string, number | boolean>
    const body: Pp5SectionLayout = {
      padTopMm: Number(v1.bodyPadTopMm) || BODY_DEFAULT.padTopMm,
      padSideMm: Number(v1.bodyPadSideMm) || BODY_DEFAULT.padSideMm,
      padBottomMm: Number(v1.bodyPadBottomMm) || BODY_DEFAULT.padBottomMm,
      fontH1Px: Number(v1.fontH1Px) || BODY_DEFAULT.fontH1Px,
      fontSubPx: Number(v1.fontSubPx) || BODY_DEFAULT.fontSubPx,
      fontTablePx: Number(v1.fontTablePx) || BODY_DEFAULT.fontTablePx,
      fontScorePx: BODY_DEFAULT.fontScorePx,
      fontGradePx: BODY_DEFAULT.fontGradePx,
      fontNamePx: Number(v1.fontNamePx) || BODY_DEFAULT.fontNamePx,
      fontNumberPx: Number(v1.fontNumberPx) || BODY_DEFAULT.fontNumberPx,
      rowHeightPx: Number(v1.rowHeightPx) || BODY_DEFAULT.rowHeightPx,
      minStudentRows: Number(v1.minStudentRows) || BODY_DEFAULT.minStudentRows,
      criteriaFontPx: Number(v1.criteriaFontPx) || BODY_DEFAULT.criteriaFontPx,
      logoSizePx: BODY_DEFAULT.logoSizePx,
      logoGapPx: BODY_DEFAULT.logoGapPx,
      logoOffsetXPx: BODY_DEFAULT.logoOffsetXPx,
      logoOffsetYPx: BODY_DEFAULT.logoOffsetYPx,
    }
    const attSide = v1.attendanceUseNarrowSides && v1.attendancePadSideMm
      ? Number(v1.attendancePadSideMm)
      : body.padSideMm
    const coverPad = {
      padTopMm: Number(v1.coverPadTopMm) || 9,
      padSideMm: Number(v1.coverPadSideMm) || 10,
      padBottomMm: Number(v1.coverPadBottomMm) || 10,
    }
    return {
      coverClass: { ...COVER_CLASS_DEFAULT, ...coverPad },
      coverSubject: { ...COVER_SUBJECT_DEFAULT, ...coverPad },
      criteria: { ...body },
      attendance: { ...body, padSideMm: attSide },
      scores: { ...body },
      achievement: { ...body },
      character: { ...body },
      reading: { ...body },
      competency: { ...body },
      activities: { ...body },
    }
  } catch {
    return null
  }
}

function migrateV2Layouts(): Partial<Pp5PrintLayouts> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_V2)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<Pp5PrintLayouts> = {}
    if (parsed.cover && typeof parsed.cover === 'object') {
      const cover = parsed.cover as Partial<Pp5SectionLayout>
      out.coverClass = {
        ...COVER_CLASS_DEFAULT,
        padTopMm: cover.padTopMm ?? COVER_CLASS_DEFAULT.padTopMm,
        padSideMm: cover.padSideMm ?? COVER_CLASS_DEFAULT.padSideMm,
        padBottomMm: cover.padBottomMm ?? COVER_CLASS_DEFAULT.padBottomMm,
      }
      out.coverSubject = {
        ...COVER_SUBJECT_DEFAULT,
        padTopMm: cover.padTopMm ?? COVER_SUBJECT_DEFAULT.padTopMm,
        padSideMm: cover.padSideMm ?? COVER_SUBJECT_DEFAULT.padSideMm,
        padBottomMm: cover.padBottomMm ?? COVER_SUBJECT_DEFAULT.padBottomMm,
      }
    }
    for (const key of PP5_BODY_SECTIONS) {
      if (parsed[key]) out[key] = { ...DEFAULT_PP5_PRINT_LAYOUTS[key], ...(parsed[key] as Pp5SectionLayout) }
    }
    return out
  } catch {
    return null
  }
}

function normalizeBodyLayout(section: Pp5BodySection, layout: Partial<Pp5SectionLayout>): Pp5SectionLayout {
  const legacy = layout as Partial<Pp5SectionLayout> & { logoAlign?: string; logoOffsetPx?: number }
  const merged: Pp5SectionLayout = { ...DEFAULT_PP5_PRINT_LAYOUTS[section], ...layout }
  if (legacy.logoOffsetPx !== undefined && layout.logoOffsetXPx === undefined) {
    merged.logoOffsetXPx = legacy.logoOffsetPx
  }
  if (layout.logoOffsetYPx === undefined) {
    merged.logoOffsetYPx = 0
  }
  if (legacy.logoAlign === 'right' && merged.logoOffsetXPx === 0) {
    merged.logoOffsetXPx = 180
  }
  return merged
}

export function loadPp5PrintLayouts(): Pp5PrintLayouts {
  if (typeof window === 'undefined') return { ...DEFAULT_PP5_PRINT_LAYOUTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const migrated = migrateV2Layouts() || migrateV1Layouts()
      return migrated ? { ...DEFAULT_PP5_PRINT_LAYOUTS, ...migrated } : { ...DEFAULT_PP5_PRINT_LAYOUTS }
    }
    const parsed = JSON.parse(raw) as Partial<Pp5PrintLayouts>
    const out = { ...DEFAULT_PP5_PRINT_LAYOUTS }
    for (const key of PP5_COVER_SECTIONS) {
      if (parsed[key]) out[key] = { ...DEFAULT_PP5_PRINT_LAYOUTS[key], ...parsed[key] }
    }
    for (const key of PP5_BODY_SECTIONS) {
      if (parsed[key]) out[key] = normalizeBodyLayout(key, parsed[key] as Partial<Pp5SectionLayout>)
    }
    return out
  } catch {
    return { ...DEFAULT_PP5_PRINT_LAYOUTS }
  }
}

export function savePp5PrintLayouts(layouts: Pp5PrintLayouts) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
}

export function pp5SectionLayoutCssSnippet(section: Pp5PrintSection, layout: Pp5CoverLayout | Pp5SectionLayout): string {
  const vars = pp5SectionLayoutToCssVars(section, layout)
  const lines = Object.entries(vars).map(([key, value]) => `  ${key}: ${value};`)
  const minRows = !isPp5CoverSection(section) ? `/* minStudentRows: ${(layout as Pp5SectionLayout).minStudentRows} */` : ''
  return [
    `/* ปพ.5 — ${section} */`,
    `.pp5-section-${section} {`,
    ...lines,
    '}',
    minRows,
  ].filter(Boolean).join('\n')
}

export const PP5_COVER_FIELD_KEYS: (keyof Pp5CoverLayout)[] = [
  'padTopMm', 'padSideMm', 'padBottomMm',
  'fontBasePx', 'fontH1Px', 'fontInfoPx',
  'fontTablePx', 'fontTableSmallPx', 'fontSignaturePx',
  'logoSizePx',
  'docMarkTopPx', 'docMarkRightPx', 'docMarkFontPx',
  'headerGapPx', 'tableTopMm', 'tableRowHeightPx',
  'summaryGapPx', 'approvalGapPx',
]

export const PP5_COVER_FIELD_LABELS: Record<keyof Pp5CoverLayout, string> = {
  padTopMm: 'padding บน',
  padSideMm: 'padding ซ้าย-ขวา',
  padBottomMm: 'padding ล่าง',
  fontBasePx: 'ฟอนต์พื้นฐานหน้า',
  fontH1Px: 'หัวข้อหลัก',
  fontInfoPx: 'ข้อมูลโรงเรียน/ชั้น',
  fontTablePx: 'ตารางหลัก',
  fontTableSmallPx: 'ตารางย่อย',
  fontSignaturePx: 'ลายเซ็น',
  logoSizePx: 'ขนาดโลโก้',
  docMarkTopPx: 'ปพ.5 บน',
  docMarkRightPx: 'ปพ.5 ขวา',
  docMarkFontPx: 'ฟอนต์ปพ.5',
  headerGapPx: 'ระยะใต้หัวข้อ',
  tableTopMm: 'ระยะก่อนตาราง',
  tableRowHeightPx: 'ความสูงแถวตาราง',
  summaryGapPx: 'ระยะตารางสรุป',
  approvalGapPx: 'ระยะส่วนลายเซ็น',
}

/** ฟิลด์ที่แต่ละส่วนปรับได้ */
export const PP5_SECTION_FIELD_KEYS: Record<Pp5BodySection, (keyof Pp5SectionLayout)[]> = {
  criteria: ['padTopMm', 'padSideMm', 'padBottomMm', 'fontH1Px', 'fontSubPx', 'criteriaFontPx'],
  attendance: [
    'padTopMm', 'padSideMm', 'padBottomMm',
    'fontH1Px', 'fontSubPx', 'fontTablePx', 'fontNamePx', 'fontNumberPx', 'rowHeightPx', 'minStudentRows',
  ],
  scores: [
    'padTopMm', 'padSideMm', 'padBottomMm',
    'fontH1Px', 'fontSubPx', 'fontTablePx', 'fontNamePx', 'fontNumberPx', 'rowHeightPx', 'minStudentRows',
  ],
  achievement: [
    'padTopMm', 'padSideMm', 'padBottomMm',
    'logoSizePx', 'logoOffsetXPx', 'logoOffsetYPx', 'logoGapPx',
    'fontH1Px', 'fontSubPx', 'fontTablePx', 'fontScorePx', 'fontGradePx', 'fontNamePx', 'fontNumberPx', 'rowHeightPx', 'minStudentRows',
  ],
  character: [
    'padTopMm', 'padSideMm', 'padBottomMm',
    'fontH1Px', 'fontSubPx', 'fontTablePx', 'fontNamePx', 'fontNumberPx', 'rowHeightPx', 'minStudentRows',
  ],
  reading: [
    'padTopMm', 'padSideMm', 'padBottomMm',
    'fontH1Px', 'fontSubPx', 'fontTablePx', 'fontNamePx', 'fontNumberPx', 'rowHeightPx', 'minStudentRows',
  ],
  competency: [
    'padTopMm', 'padSideMm', 'padBottomMm',
    'fontH1Px', 'fontSubPx', 'fontTablePx', 'fontNamePx', 'fontNumberPx', 'rowHeightPx', 'minStudentRows',
  ],
  activities: [
    'padTopMm', 'padSideMm', 'padBottomMm',
    'fontH1Px', 'fontSubPx', 'fontTablePx', 'fontNamePx', 'fontNumberPx', 'rowHeightPx', 'minStudentRows',
  ],
}

export const PP5_SECTION_FIELD_LABELS: Record<keyof Pp5SectionLayout, string> = {
  padTopMm: 'padding บน',
  padSideMm: 'padding ซ้าย-ขวา',
  padBottomMm: 'padding ล่าง',
  fontH1Px: 'หัวข้อ h1',
  fontSubPx: 'บรรทัดชั้น/โรงเรียน',
  fontTablePx: 'ข้อมูลในตาราง',
  fontScorePx: 'หัวคอลัมน์คะแนน',
  fontGradePx: 'หัวคอลัมน์เกรด',
  fontNamePx: 'ชื่อนักเรียน',
  fontNumberPx: 'เลขที่ / รหัส',
  rowHeightPx: 'ความสูงแถว',
  minStudentRows: 'จำนวนแถวขั้นต่ำ',
  criteriaFontPx: 'ข้อความในตารางเกณฑ์',
  logoSizePx: 'ขนาดโลโก้',
  logoGapPx: 'ระยะโลโก้-หัวข้อ',
  logoOffsetXPx: 'เลื่อนซ้าย-ขวา',
  logoOffsetYPx: 'เลื่อนขึ้น-ลง',
}

export const PP5_TABLE_MIN_STUDENT_ROWS = BODY_DEFAULT.minStudentRows
