import type { CSSProperties } from 'react'

export type ClassroomAdminPrintSection = 'monthly' | 'standard'

export const CLASSROOM_ADMIN_PRINT_SECTIONS: ClassroomAdminPrintSection[] = ['monthly', 'standard']

export type ClassroomAdminMonthlyLayout = {
  padTopPx: number
  padSidePx: number
  padBottomPx: number
  headLineGapPx: number
  fontH1Px: number
  fontSchoolPx: number
  fontMetaPx: number
  fontTablePx: number
  fontMonthTitlePx: number
  fontSummaryTitlePx: number
  fontNamePx: number
  fontHolidayPx: number
  letterSpacingPx: number
  rowHeightPx: number
  logoSizePx: number
  numberColWidthPx: number
  nameColWidthPx: number
  summaryColWidthPx: number
  signatureGapPx: number
  signatureMarginTopPx: number
  fontSignaturePx: number
  fontSignatureRolePx: number
  minBlankRows: number
}

export type ClassroomAdminStandardLayout = {
  padTopPx: number
  padSidePx: number
  padBottomPx: number
  headLineGapPx: number
  fontH1Px: number
  fontSchoolPx: number
  fontMetaPx: number
  fontStandardTablePx: number
  fontStandardNamePx: number
  letterSpacingPx: number
  standardRowHeightPx: number
  logoSizePx: number
  signatureGapPx: number
  signatureMarginTopPx: number
  fontSignaturePx: number
  fontSignatureRolePx: number
}

export type ClassroomAdminPrintLayouts = Record<ClassroomAdminPrintSection, ClassroomAdminMonthlyLayout | ClassroomAdminStandardLayout> & {
  monthly: ClassroomAdminMonthlyLayout
  standard: ClassroomAdminStandardLayout
}

export const DEFAULT_CLASSROOM_ADMIN_MONTHLY_LAYOUT: ClassroomAdminMonthlyLayout = {
  padTopPx: 16,
  padSidePx: 18,
  padBottomPx: 12,
  headLineGapPx: 2,
  fontH1Px: 16,
  fontSchoolPx: 16,
  fontMetaPx: 11,
  fontTablePx: 8,
  fontMonthTitlePx: 10,
  fontSummaryTitlePx: 10,
  fontNamePx: 11,
  fontHolidayPx: 7,
  letterSpacingPx: 0,
  rowHeightPx: 20,
  logoSizePx: 42,
  numberColWidthPx: 42,
  nameColWidthPx: 190,
  summaryColWidthPx: 40,
  signatureGapPx: 120,
  signatureMarginTopPx: 32,
  fontSignaturePx: 12,
  fontSignatureRolePx: 11,
  minBlankRows: 25,
}

export const DEFAULT_CLASSROOM_ADMIN_STANDARD_LAYOUT: ClassroomAdminStandardLayout = {
  padTopPx: 16,
  padSidePx: 18,
  padBottomPx: 12,
  headLineGapPx: 2,
  fontH1Px: 16,
  fontSchoolPx: 16,
  fontMetaPx: 11,
  fontStandardTablePx: 10,
  fontStandardNamePx: 12,
  letterSpacingPx: 0,
  standardRowHeightPx: 24,
  logoSizePx: 42,
  signatureGapPx: 120,
  signatureMarginTopPx: 32,
  fontSignaturePx: 12,
  fontSignatureRolePx: 11,
}

export const DEFAULT_CLASSROOM_ADMIN_PRINT_LAYOUTS: ClassroomAdminPrintLayouts = {
  monthly: { ...DEFAULT_CLASSROOM_ADMIN_MONTHLY_LAYOUT },
  standard: { ...DEFAULT_CLASSROOM_ADMIN_STANDARD_LAYOUT },
}

export const CLASSROOM_ADMIN_PRINT_LAYOUTS_STORAGE_KEY = 'classroom-admin-print-layouts-v1'

export const CLASSROOM_ADMIN_MONTHLY_FIELD_KEYS = [
  'padTopPx', 'padSidePx', 'padBottomPx',
  'headLineGapPx',
  'fontH1Px', 'fontSchoolPx', 'fontMetaPx',
  'fontTablePx', 'fontMonthTitlePx', 'fontSummaryTitlePx', 'fontNamePx', 'fontHolidayPx',
  'letterSpacingPx',
  'rowHeightPx', 'minBlankRows',
  'logoSizePx',
  'numberColWidthPx', 'nameColWidthPx', 'summaryColWidthPx',
  'signatureGapPx', 'signatureMarginTopPx', 'fontSignaturePx', 'fontSignatureRolePx',
] as const satisfies readonly (keyof ClassroomAdminMonthlyLayout)[]

export const CLASSROOM_ADMIN_STANDARD_FIELD_KEYS = [
  'padTopPx', 'padSidePx', 'padBottomPx',
  'headLineGapPx',
  'fontH1Px', 'fontSchoolPx', 'fontMetaPx',
  'fontStandardTablePx', 'fontStandardNamePx', 'letterSpacingPx', 'standardRowHeightPx',
  'logoSizePx',
  'signatureGapPx', 'signatureMarginTopPx', 'fontSignaturePx', 'fontSignatureRolePx',
] as const satisfies readonly (keyof ClassroomAdminStandardLayout)[]

export const CLASSROOM_ADMIN_MONTHLY_FIELD_LABELS: Record<keyof ClassroomAdminMonthlyLayout, string> = {
  padTopPx: 'ระยะบน',
  padSidePx: 'ระยะซ้าย-ขวา',
  padBottomPx: 'ระยะล่าง',
  headLineGapPx: 'ระยะระหว่างบรรทัดหัวกระดาษ',
  fontH1Px: 'หัวเรื่องแบบฟอร์ม',
  fontSchoolPx: 'ชื่อโรงเรียน',
  fontMetaPx: 'บรรทัดข้อมูลห้อง/เดือน',
  fontTablePx: 'ตัวเลขในตาราง',
  fontMonthTitlePx: 'หัวเดือน',
  fontSummaryTitlePx: 'หัวสรุปผล',
  fontNamePx: 'ชื่อนักเรียน',
  fontHolidayPx: 'ชื่อวันหยุด',
  letterSpacingPx: 'ระยะห่างตัวอักษร',
  rowHeightPx: 'ความสูงแถว',
  minBlankRows: 'จำนวนแถวว่าง',
  logoSizePx: 'ขนาดโลโก้',
  numberColWidthPx: 'ความกว้างคอลัมน์เลขที่',
  nameColWidthPx: 'ความกว้างคอลัมน์ชื่อ',
  summaryColWidthPx: 'ความกว้างคอลัมน์สรุป',
  signatureGapPx: 'ระยะห่างลายเซ็น',
  signatureMarginTopPx: 'ระยะบนลายเซ็น',
  fontSignaturePx: 'ฟอนต์ลายเซ็น',
  fontSignatureRolePx: 'ฟอนต์ตำแหน่งลายเซ็น',
}

export const CLASSROOM_ADMIN_STANDARD_FIELD_LABELS: Record<keyof ClassroomAdminStandardLayout, string> = {
  padTopPx: 'ระยะบน',
  padSidePx: 'ระยะซ้าย-ขวา',
  padBottomPx: 'ระยะล่าง',
  headLineGapPx: 'ระยะระหว่างบรรทัดหัวกระดาษ',
  fontH1Px: 'หัวเรื่องแบบฟอร์ม',
  fontSchoolPx: 'ชื่อโรงเรียน',
  fontMetaPx: 'บรรทัดข้อมูลห้อง/เดือน',
  fontStandardTablePx: 'ตัวเลขในตาราง',
  fontStandardNamePx: 'ชื่อนักเรียน',
  letterSpacingPx: 'ระยะห่างตัวอักษร',
  standardRowHeightPx: 'ความสูงแถว',
  logoSizePx: 'ขนาดโลโก้',
  signatureGapPx: 'ระยะห่างลายเซ็น',
  signatureMarginTopPx: 'ระยะบนลายเซ็น',
  fontSignaturePx: 'ฟอนต์ลายเซ็น',
  fontSignatureRolePx: 'ฟอนต์ตำแหน่งลายเซ็น',
}

export const CLASSROOM_ADMIN_SECTION_LABELS: Record<ClassroomAdminPrintSection, string> = {
  monthly: 'ตารางรายเดือน (เวลาเรียน/กิจวัตร)',
  standard: 'ตารางมาตรฐาน (สุขภาพ/ตรวจ)',
}

function monthlyLayoutToCssVars(layout: ClassroomAdminMonthlyLayout): Record<string, string> {
  return {
    '--ca-pad-top': `${layout.padTopPx}px`,
    '--ca-pad-x': `${layout.padSidePx}px`,
    '--ca-pad-bottom': `${layout.padBottomPx}px`,
    '--ca-head-line-gap': `${layout.headLineGapPx}px`,
    '--ca-font-h1': `${layout.fontH1Px}px`,
    '--ca-font-school': `${layout.fontSchoolPx}px`,
    '--ca-font-meta': `${layout.fontMetaPx}px`,
    '--ca-font-table': `${layout.fontTablePx}px`,
    '--ca-font-month-title': `${layout.fontMonthTitlePx}px`,
    '--ca-font-summary-title': `${layout.fontSummaryTitlePx}px`,
    '--ca-font-name': `${layout.fontNamePx}px`,
    '--ca-font-holiday': `${layout.fontHolidayPx}px`,
    '--ca-letter-spacing': `${layout.letterSpacingPx}px`,
    '--ca-row-h': `${layout.rowHeightPx}px`,
    '--ca-logo-size': `${layout.logoSizePx}px`,
    '--ca-number-col-w': `${layout.numberColWidthPx}px`,
    '--ca-name-col-w': `${layout.nameColWidthPx}px`,
    '--ca-summary-col-w': `${layout.summaryColWidthPx}px`,
    '--ca-signature-gap': `${layout.signatureGapPx}px`,
    '--ca-signature-margin-top': `${layout.signatureMarginTopPx}px`,
    '--ca-font-signature': `${layout.fontSignaturePx}px`,
    '--ca-font-signature-role': `${layout.fontSignatureRolePx}px`,
  }
}

function standardLayoutToCssVars(layout: ClassroomAdminStandardLayout): Record<string, string> {
  return {
    '--ca-pad-top': `${layout.padTopPx}px`,
    '--ca-pad-x': `${layout.padSidePx}px`,
    '--ca-pad-bottom': `${layout.padBottomPx}px`,
    '--ca-head-line-gap': `${layout.headLineGapPx}px`,
    '--ca-font-h1': `${layout.fontH1Px}px`,
    '--ca-font-school': `${layout.fontSchoolPx}px`,
    '--ca-font-meta': `${layout.fontMetaPx}px`,
    '--ca-font-standard-table': `${layout.fontStandardTablePx}px`,
    '--ca-font-standard-name': `${layout.fontStandardNamePx}px`,
    '--ca-letter-spacing': `${layout.letterSpacingPx}px`,
    '--ca-standard-row-h': `${layout.standardRowHeightPx}px`,
    '--ca-logo-size': `${layout.logoSizePx}px`,
    '--ca-signature-gap': `${layout.signatureGapPx}px`,
    '--ca-signature-margin-top': `${layout.signatureMarginTopPx}px`,
    '--ca-font-signature': `${layout.fontSignaturePx}px`,
    '--ca-font-signature-role': `${layout.fontSignatureRolePx}px`,
  }
}

export function classroomAdminSectionLayoutToCssVars(
  section: ClassroomAdminPrintSection,
  layout: ClassroomAdminMonthlyLayout | ClassroomAdminStandardLayout,
): Record<string, string> {
  return section === 'monthly'
    ? monthlyLayoutToCssVars(layout as ClassroomAdminMonthlyLayout)
    : standardLayoutToCssVars(layout as ClassroomAdminStandardLayout)
}

export function classroomAdminSectionLayoutStyle(
  section: ClassroomAdminPrintSection,
  layout: ClassroomAdminMonthlyLayout | ClassroomAdminStandardLayout,
): CSSProperties {
  return classroomAdminSectionLayoutToCssVars(section, layout) as CSSProperties
}

export function loadClassroomAdminPrintLayouts(): ClassroomAdminPrintLayouts {
  if (typeof window === 'undefined') return { ...DEFAULT_CLASSROOM_ADMIN_PRINT_LAYOUTS, monthly: { ...DEFAULT_CLASSROOM_ADMIN_MONTHLY_LAYOUT }, standard: { ...DEFAULT_CLASSROOM_ADMIN_STANDARD_LAYOUT } }
  try {
    const raw = window.localStorage.getItem(CLASSROOM_ADMIN_PRINT_LAYOUTS_STORAGE_KEY)
    if (!raw) return { monthly: { ...DEFAULT_CLASSROOM_ADMIN_MONTHLY_LAYOUT }, standard: { ...DEFAULT_CLASSROOM_ADMIN_STANDARD_LAYOUT } }
    const parsed = JSON.parse(raw) as Partial<ClassroomAdminPrintLayouts>
    return {
      monthly: { ...DEFAULT_CLASSROOM_ADMIN_MONTHLY_LAYOUT, ...parsed.monthly },
      standard: { ...DEFAULT_CLASSROOM_ADMIN_STANDARD_LAYOUT, ...parsed.standard },
    }
  } catch {
    return { monthly: { ...DEFAULT_CLASSROOM_ADMIN_MONTHLY_LAYOUT }, standard: { ...DEFAULT_CLASSROOM_ADMIN_STANDARD_LAYOUT } }
  }
}

export function saveClassroomAdminPrintLayouts(layouts: ClassroomAdminPrintLayouts) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CLASSROOM_ADMIN_PRINT_LAYOUTS_STORAGE_KEY, JSON.stringify(layouts))
}

export function classroomAdminSectionLayoutCssSnippet(
  section: ClassroomAdminPrintSection,
  layout: ClassroomAdminMonthlyLayout | ClassroomAdminStandardLayout,
): string {
  const vars = classroomAdminSectionLayoutToCssVars(section, layout)
  const lines = Object.entries(vars).map(([key, value]) => `  ${key}: ${value};`)
  const minRows = section === 'monthly' ? `/* minBlankRows: ${(layout as ClassroomAdminMonthlyLayout).minBlankRows} */` : ''
  return `.attendance-print-sheet {\n${lines.join('\n')}\n}${minRows ? `\n${minRows}` : ''}`
}

export function classroomAdminPrintSectionForReport(type: string): ClassroomAdminPrintSection {
  return type === 'health' || type === 'inspection' ? 'standard' : 'monthly'
}
