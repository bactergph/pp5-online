import type { CSSProperties } from 'react'

export type Pp6PrintSection = 'page'

export const PP6_PRINT_SECTIONS: Pp6PrintSection[] = ['page']

export type Pp6SectionLayout = {
  padTopMm: number
  padSideMm: number
  padBottomMm: number
  fontBasePx: number
  fontH1Px: number
  fontSubPx: number
  fontStudentLinePx: number
  fontTablePx: number
  fontNamePx: number
  fontNotePx: number
  rowHeightPx: number
  theadHeightMm: number
  logoSizeMm: number
  logoLeftMm: number
  docMarkTopMm: number
  docMarkRightMm: number
  docMarkFontPx: number
  headTopMm: number
  tableWidthPct: number
  sectionGapMm: number
  minSubjectRows: number

  /** jsPDF ละเอียด */
  cellTextNudgeMm: number
  borderWidthMm: number
  logoTopOffsetMm: number
  titleOffsetYMm: number
  schoolLineOffsetYMm: number
  afterHeaderGapMm: number
  studentLineHeightMm: number
  afterStudentGapMm: number
  afterScoreGapMm: number
  rankGapTopMm: number
  rankGapBottomMm: number
  noteGapTopMm: number
  noteGapBottomMm: number
  noteLineHeight: number
  activityGapTopMm: number
  activityRowHeightMm: number
  afterActivityGapMm: number
  summaryWidthMm: number
  summaryRowHeightMm: number
  summaryGapTopMm: number
  valueColWidthMm: number
}

export type Pp6PrintLayouts = Record<Pp6PrintSection, Pp6SectionLayout>

export const DEFAULT_PP6_SECTION_LAYOUT: Pp6SectionLayout = {
  padTopMm: 8,
  padSideMm: 12,
  padBottomMm: 9,
  fontBasePx: 17,
  fontH1Px: 22,
  fontSubPx: 19,
  fontStudentLinePx: 18,
  fontTablePx: 14,
  fontNamePx: 15,
  fontNotePx: 13,
  rowHeightPx: 22,
  theadHeightMm: 7.2,
  logoSizeMm: 18,
  logoLeftMm: 20,
  docMarkTopMm: 15,
  docMarkRightMm: 20,
  docMarkFontPx: 20,
  headTopMm: 5,
  tableWidthPct: 85,
  sectionGapMm: 1.2,
  minSubjectRows: 15,

  cellTextNudgeMm: -0.85,
  borderWidthMm: 0.3,
  logoTopOffsetMm: 2,
  titleOffsetYMm: 8,
  schoolLineOffsetYMm: 14,
  afterHeaderGapMm: 1.2,
  studentLineHeightMm: 8,
  afterStudentGapMm: 1.2,
  afterScoreGapMm: 1.2,
  rankGapTopMm: 2,
  rankGapBottomMm: 3,
  noteGapTopMm: 2,
  noteGapBottomMm: 2,
  noteLineHeight: 0.85,
  activityGapTopMm: 0,
  activityRowHeightMm: 6.4,
  afterActivityGapMm: 1.2,
  summaryWidthMm: 89,
  summaryRowHeightMm: 6.2,
  summaryGapTopMm: 0,
  valueColWidthMm: 20,
}

export const DEFAULT_PP6_PRINT_LAYOUTS: Pp6PrintLayouts = {
  page: { ...DEFAULT_PP6_SECTION_LAYOUT },
}

const STORAGE_KEY = 'pp6-print-layouts-v2'
export const PP6_PRINT_LAYOUTS_STORAGE_KEY = STORAGE_KEY

export function mmToPx96(mm: number): number {
  return Math.round((mm * 96) / 25.4)
}

export function pp6SectionLayoutToCssVars(layout: Pp6SectionLayout): Record<string, string> {
  return {
    '--pp6-pad-top': `${layout.padTopMm}mm`,
    '--pp6-pad-x': `${layout.padSideMm}mm`,
    '--pp6-pad-bottom': `${layout.padBottomMm}mm`,
    '--pp6-font-base': `${layout.fontBasePx}px`,
    '--pp6-font-h1': `${layout.fontH1Px}px`,
    '--pp6-font-sub': `${layout.fontSubPx}px`,
    '--pp6-font-student': `${layout.fontStudentLinePx}px`,
    '--pp6-font-table': `${layout.fontTablePx}px`,
    '--pp6-font-name': `${layout.fontNamePx}px`,
    '--pp6-font-note': `${layout.fontNotePx}px`,
    '--pp6-note-line-height': String(layout.noteLineHeight),
    '--pp6-row-h': `${layout.rowHeightPx}px`,
    '--pp6-thead-h': `${layout.theadHeightMm}mm`,
    '--pp6-logo-size': `${layout.logoSizeMm}mm`,
    '--pp6-logo-left': `${layout.logoLeftMm}mm`,
    '--pp6-doc-mark-top': `${layout.docMarkTopMm}mm`,
    '--pp6-doc-mark-right': `${layout.docMarkRightMm}mm`,
    '--pp6-doc-mark-font': `${layout.docMarkFontPx}px`,
    '--pp6-head-top': `${layout.headTopMm}mm`,
    '--pp6-table-width': `${layout.tableWidthPct}%`,
    '--pp6-section-gap': `${layout.sectionGapMm}mm`,
  }
}

export function pp6SectionLayoutStyle(layout: Pp6SectionLayout): CSSProperties {
  return pp6SectionLayoutToCssVars(layout) as CSSProperties
}

export function loadPp6PrintLayouts(): Pp6PrintLayouts {
  if (typeof window === 'undefined') return { ...DEFAULT_PP6_PRINT_LAYOUTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
      || window.localStorage.getItem('pp6-print-layouts-v1')
    if (!raw) return { ...DEFAULT_PP6_PRINT_LAYOUTS }
    const parsed = JSON.parse(raw) as Partial<Pp6PrintLayouts>
    const page = { ...DEFAULT_PP6_PRINT_LAYOUTS.page, ...parsed.page }
    // ค่าเก่า (1.1–1.35) กว้างเกิน — ดึงเข้า default ใหม่
    if (typeof page.noteLineHeight === 'number' && page.noteLineHeight >= 1.05) {
      page.noteLineHeight = DEFAULT_PP6_SECTION_LAYOUT.noteLineHeight
    }
    return { page }
  } catch {
    return { ...DEFAULT_PP6_PRINT_LAYOUTS }
  }
}

export function savePp6PrintLayouts(layouts: Pp6PrintLayouts) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
}

export const PP6_SECTION_FIELD_KEYS: (keyof Pp6SectionLayout)[] = [
  'padTopMm', 'padSideMm', 'padBottomMm',
  'fontH1Px', 'fontSubPx', 'fontStudentLinePx', 'fontBasePx',
  'fontTablePx', 'fontNamePx', 'fontNotePx',
  'rowHeightPx', 'theadHeightMm', 'minSubjectRows', 'tableWidthPct',
  'logoSizeMm', 'logoLeftMm', 'logoTopOffsetMm',
  'docMarkTopMm', 'docMarkRightMm', 'docMarkFontPx',
  'headTopMm', 'titleOffsetYMm', 'schoolLineOffsetYMm', 'afterHeaderGapMm',
  'studentLineHeightMm', 'afterStudentGapMm',
  'sectionGapMm', 'afterScoreGapMm',
  'cellTextNudgeMm', 'borderWidthMm',
  'rankGapTopMm', 'rankGapBottomMm',
  'noteGapTopMm', 'noteGapBottomMm', 'noteLineHeight',
  'activityGapTopMm', 'activityRowHeightMm', 'afterActivityGapMm',
  'summaryGapTopMm', 'summaryWidthMm', 'summaryRowHeightMm', 'valueColWidthMm',
]

export const PP6_SECTION_FIELD_LABELS: Record<keyof Pp6SectionLayout, string> = {
  padTopMm: 'padding บน',
  padSideMm: 'padding ซ้าย-ขวา',
  padBottomMm: 'padding ล่าง',
  fontBasePx: 'ฟอนต์พื้นฐาน',
  fontH1Px: 'หัวข้อหลัก',
  fontSubPx: 'บรรทัดโรงเรียน',
  fontStudentLinePx: 'บรรทัดข้อมูลนักเรียน',
  fontTablePx: 'ตารางคะแนน',
  fontNamePx: 'ชื่อวิชาในตาราง',
  fontNotePx: 'หมายเหตุ',
  rowHeightPx: 'ความสูงแถวคะแนน',
  theadHeightMm: 'ความสูงหัวตาราง',
  logoSizeMm: 'ขนาดโลโก้',
  logoLeftMm: 'โลโก้ซ้าย',
  logoTopOffsetMm: 'โลโก้บน (offset)',
  docMarkTopMm: 'ปพ.6 บน',
  docMarkRightMm: 'ปพ.6 ขวา',
  docMarkFontPx: 'ฟอนต์ปพ.6',
  headTopMm: 'ระยะหัวกระดาษ',
  titleOffsetYMm: 'ตำแหน่งหัวข้อ (Y)',
  schoolLineOffsetYMm: 'ตำแหน่งบรรทัดรร (Y)',
  afterHeaderGapMm: 'หลังหัวกระดาษ',
  studentLineHeightMm: 'ความสูงบรรทัดนักเรียน',
  afterStudentGapMm: 'หลังบรรทัดนักเรียน',
  tableWidthPct: 'ความกว้างตาราง (%)',
  sectionGapMm: 'ระยะห่างส่วนทั่วไป',
  minSubjectRows: 'จำนวนแถววิชา',
  cellTextNudgeMm: 'ตัวอักษรในช่อง (ขึ้น=ลบ)',
  borderWidthMm: 'ความหนาเส้นตาราง',
  afterScoreGapMm: 'หลังตารางคะแนน',
  rankGapTopMm: 'ก่อนอันดับ',
  rankGapBottomMm: 'หลังอันดับ',
  noteGapTopMm: 'ก่อนหมายเหตุ',
  noteGapBottomMm: 'หลังหมายเหตุ',
  noteLineHeight: 'ระยะบรรทัดหมายเหตุ',
  activityGapTopMm: 'ก่อนตารางกิจกรรม',
  activityRowHeightMm: 'ความสูงแถวกิจกรรม',
  afterActivityGapMm: 'หลังตารางกิจกรรม',
  summaryGapTopMm: 'ก่อนตารางสรุป',
  summaryWidthMm: 'ความกว้างตารางสรุป',
  summaryRowHeightMm: 'ความสูงแถวสรุป',
  valueColWidthMm: 'ความกว้างช่องค่าสรุป',
}

export function pp6SectionLayoutCssSnippet(layout: Pp6SectionLayout): string {
  const vars = pp6SectionLayoutToCssVars(layout)
  const lines = Object.entries(vars).map(([key, value]) => `  ${key}: ${value};`)
  return [
    '/* ปพ.6 */',
    '.pp6-page {',
    ...lines,
    '}',
    `/* minSubjectRows: ${layout.minSubjectRows} */`,
  ].join('\n')
}
