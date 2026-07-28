import { jsPDF } from 'jspdf'
import { CLASSROOM_ADMIN_A4_LANDSCAPE_MM } from '@/lib/classroom-admin-a4-landscape'
import { classroomAdminDocumentTitle, type ClassroomAdminReportKey } from '@/lib/classroom-admin-document-titles'
import {
  CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS,
  CLASSROOM_ADMIN_WEIGHT_HEIGHT_COL_WIDTHS,
  classroomAdminWeightHeightTableWidthPx,
} from '@/lib/classroom-admin-standard-table-columns'
import {
  DEFAULT_CLASSROOM_ADMIN_STANDARD_LAYOUT,
  type ClassroomAdminStandardLayout,
} from '@/lib/classroom-admin-print-layout'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import { PRINT_STUDENTS_PER_PAGE, chunkStudentsForPrintPages } from '@/lib/print-student-pages'
import { getThaiMonthName } from '@/lib/thaiDate'

const PAGE_W = CLASSROOM_ADMIN_A4_LANDSCAPE_MM.width
const PAGE_H = CLASSROOM_ADMIN_A4_LANDSCAPE_MM.height
const PX_TO_MM = 25.4 / 96

const COLORS = {
  border: [17, 24, 39] as [number, number, number],
  text: [17, 24, 39] as [number, number, number],
  meta: [51, 65, 85] as [number, number, number],
  header: [191, 234, 244] as [number, number, number],
  doneBg: [207, 248, 216] as [number, number, number],
  doneFg: [20, 83, 45] as [number, number, number],
  alertBg: [254, 226, 226] as [number, number, number],
  alertFg: [127, 29, 29] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  logoBorder: [203, 213, 225] as [number, number, number],
}

/** รายงานตารางมาตรฐาน (สุขภาพ/พัฒนาการ) ที่ใช้ jsPDF */
export type StandardJsPdfReportType = Extract<ClassroomAdminReportKey, 'health' | 'inspection'>

export const JSPDF_STANDARD_REPORT_TYPES: StandardJsPdfReportType[] = ['health', 'inspection']

export const INSPECTION_PDF_FIELDS = [
  { key: 'nails', label: 'เล็บ' },
  { key: 'hair', label: 'ผม' },
  { key: 'ears', label: 'หู' },
  { key: 'nose', label: 'จมูก' },
  { key: 'teeth', label: 'ฟัน' },
  { key: 'skin', label: 'ผิวหนัง' },
  { key: 'clothes', label: 'เสื้อผ้า' },
] as const

export type StandardPdfStudent = {
  id: string
  student_number: number
  prefix?: string | null
  first_name: string
  last_name: string
}

export type StandardPdfHealthRow = {
  weight?: number | string | null
  height?: number | string | null
  bmi?: number | string | null
  bmi_result?: string | null
}

export type StandardPdfInspectionRow = Partial<Record<(typeof INSPECTION_PDF_FIELDS)[number]['key'], string | null>>

export type StandardPdfSheet = {
  reportType: StandardJsPdfReportType
  monthKey: string
  term: 1 | 2
  students: StandardPdfStudent[]
  health?: Record<string, StandardPdfHealthRow | undefined>
  inspection?: Record<string, StandardPdfInspectionRow | undefined>
  signatures?: { homeroom?: string | null; director?: string | null }
}

export type StandardClassroomAdminPdfInput = {
  schoolName: string
  schoolLogoUrl?: string | null
  yearBe: number
  classroomLabel: string
  sheets: StandardPdfSheet[]
  homeroomTeacherName: string
  directorName: string
  actingDirectorPosition?: string | null
  layout?: ClassroomAdminStandardLayout
  fileName?: string
}

function px(n: number) {
  return Math.max(0, n) * PX_TO_MM
}

function ptFromCssPx(pxValue: number) {
  return Math.max(0, pxValue) * 0.75
}

function lineStepMm(fontSizePt: number, gapMm = 1.2) {
  return Math.max(0, fontSizePt) * 0.352777778 * 1.2 + Math.max(0, gapMm)
}

function studentName(student: StandardPdfStudent) {
  return `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim()
}

function cellText(value: unknown) {
  if (value == null || value === '') return ''
  return String(value)
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG'
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
  return 'JPEG'
}

function setFill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2])
}

function setStroke(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2])
}

function setText(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2])
}

function drawRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fill?: [number, number, number] | null,
) {
  setStroke(doc, COLORS.border)
  doc.setLineWidth(0.2)
  if (fill) {
    setFill(doc, fill)
    doc.rect(x, y, w, h, 'FD')
  } else {
    doc.rect(x, y, w, h, 'S')
  }
}

function drawCenteredText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    fontSize: number
    bold?: boolean
    color?: [number, number, number]
    align?: 'center' | 'left'
    padLeft?: number
  },
) {
  if (!text) return
  doc.setFont('THSarabunNew', opts.bold ? 'bold' : 'normal')
  doc.setFontSize(opts.fontSize)
  setText(doc, opts.color || COLORS.text)
  const pad = opts.padLeft ?? 0
  if (opts.align === 'left') {
    doc.text(text, x + pad, y + h / 2, { baseline: 'middle', maxWidth: w - pad - 0.5 })
  } else {
    doc.text(text, x + w / 2, y + h / 2, { align: 'center', baseline: 'middle', maxWidth: w - 0.6 })
  }
}

function columnWidthsMm(reportType: StandardJsPdfReportType, contentWidthMm: number) {
  if (reportType === 'health') {
    const tablePx = classroomAdminWeightHeightTableWidthPx()
    const scale = contentWidthMm / (tablePx * PX_TO_MM)
    const numberW = px(CLASSROOM_ADMIN_WEIGHT_HEIGHT_COL_WIDTHS.numberPx) * scale
    const nameW = px(CLASSROOM_ADMIN_WEIGHT_HEIGHT_COL_WIDTHS.namePx) * scale
    const fieldW = Math.max(0, (contentWidthMm - numberW - nameW) / 4)
    return {
      widths: [numberW, nameW, fieldW, fieldW, fieldW, fieldW],
      tableWidth: contentWidthMm,
    }
  }

  const numberW = px(CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.numberPx)
  const nameW = px(CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.namePx)
  const fieldW = px(CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.fieldPx)
  const fieldCount = INSPECTION_PDF_FIELDS.length
  const natural = numberW + nameW + fieldW * fieldCount
  // กางเต็มความกว้างเนื้อหา — สัดส่วนคอลัมน์เดิมเหมือน HTML
  const scale = natural > 0 ? contentWidthMm / natural : 1
  const widths = [
    numberW * scale,
    nameW * scale,
    ...Array.from({ length: fieldCount }, () => fieldW * scale),
  ]
  return {
    widths,
    tableWidth: contentWidthMm,
  }
}

function headersFor(reportType: StandardJsPdfReportType) {
  if (reportType === 'health') {
    return ['เลขที่', 'ชื่อ-นามสกุล', 'น้ำหนัก (กก.)', 'ส่วนสูง (ซม.)', 'BMI', 'ผล']
  }
  return ['เลขที่', 'ชื่อ-นามสกุล', ...INSPECTION_PDF_FIELDS.map(f => f.label)]
}

function rowValues(
  reportType: StandardJsPdfReportType,
  student: StandardPdfStudent,
  sheet: StandardPdfSheet,
): { text: string; fill?: [number, number, number] | null; color?: [number, number, number] }[] {
  if (reportType === 'health') {
    const row = sheet.health?.[student.id]
    return [
      { text: cellText(row?.weight) },
      { text: cellText(row?.height) },
      { text: cellText(row?.bmi) },
      { text: cellText(row?.bmi_result) },
    ]
  }

  const inspection = sheet.inspection?.[student.id] || {}
  return INSPECTION_PDF_FIELDS.map(field => {
    const value = cellText(inspection[field.key]) || 'ผ่าน'
    const ok = value === 'ผ่าน'
    return {
      text: value,
      fill: ok ? COLORS.doneBg : COLORS.alertBg,
      color: ok ? COLORS.doneFg : COLORS.alertFg,
    }
  })
}

export type StandardClassroomAdminPdfTarget = {
  doc: jsPDF
  startWithNewPage?: boolean
  logoData?: string | null
}

/**
 * สร้าง PDF แบบบันทึกน้ำหนัก-ส่วนสูง / ตรวจสุขภาพ ด้วย jsPDF
 * โครงเดียวกับ HTML print เดิม + เทคนิคเดียวกับบันทึกประจำวัน
 */
export async function buildStandardClassroomAdminPdfBlob(
  input: StandardClassroomAdminPdfInput,
  target?: StandardClassroomAdminPdfTarget,
) {
  if (!input.sheets.length) throw new Error('ไม่มีแผ่นรายงานสำหรับสร้าง PDF')

  const layout = { ...DEFAULT_CLASSROOM_ADMIN_STANDARD_LAYOUT, ...input.layout }
  const doc = target?.doc ?? new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })
  if (!target) await applyThaiFonts(doc)

  const logoData = target && 'logoData' in target
    ? (target.logoData ?? null)
    : await loadImageDataUrl(input.schoolLogoUrl, 160, 0.7)

  const padTop = px(layout.padTopPx)
  const padX = px(layout.padSidePx)
  const padBottom = px(layout.padBottomPx)
  const logoSize = px(layout.logoSizePx)
  const rowH = px(layout.standardRowHeightPx)
  const signatureGap = px(layout.signatureGapPx)
  const signatureMarginTop = px(layout.signatureMarginTopPx)
  const headLineGap = px(layout.headLineGapPx)

  const titlePt = ptFromCssPx(layout.fontH1Px)
  const schoolPt = ptFromCssPx(layout.fontSchoolPx)
  const metaPt = ptFromCssPx(layout.fontMetaPx)
  const tablePt = ptFromCssPx(layout.fontStandardTablePx)
  const namePt = ptFromCssPx(layout.fontStandardNamePx)
  const signPt = ptFromCssPx(layout.fontSignaturePx)
  const signRolePt = ptFromCssPx(layout.fontSignatureRolePx)

  const schoolName = input.schoolName || 'ชื่อโรงเรียน'
  // true = หน้าถัดไปต้อง addPage (ต่อเล่มเมื่อ startWithNewPage)
  let pageStarted = Boolean(target?.startWithNewPage)

  for (const sheet of input.sheets) {
    const [homeroomSign, directorSign] = await Promise.all([
      loadImageDataUrl(sheet.signatures?.homeroom, 220, 0.75),
      loadImageDataUrl(sheet.signatures?.director, 220, 0.75),
    ])

    const students = sheet.students || []
    const pages = chunkStudentsForPrintPages(students)
    const monthLabel = getThaiMonthName(Number(sheet.monthKey.slice(5, 7)))
    const title = classroomAdminDocumentTitle(sheet.reportType)
    const contentWidth = PAGE_W - padX * 2
    const { widths, tableWidth } = columnWidthsMm(sheet.reportType, contentWidth)
    const tableLeft = padX + Math.max(0, (contentWidth - tableWidth) / 2)
    const headers = headersFor(sheet.reportType)
    const colX = (index: number) => tableLeft + widths.slice(0, index).reduce((sum, w) => sum + w, 0)

    pages.forEach((pageStudents, pageIndex) => {
      if (pageStarted) doc.addPage('a4', 'landscape')
      pageStarted = true

      const pageOffset = pageIndex * PRINT_STUDENTS_PER_PAGE
      const pageLabel = pages.length > 1 ? `  |  หน้า ${pageIndex + 1}/${pages.length}` : ''
      let y = padTop

      // —— Header ——
      const logoX = (PAGE_W - logoSize) / 2
      setStroke(doc, COLORS.logoBorder)
      doc.setLineWidth(0.25)
      if (logoData) {
        try {
          doc.addImage(logoData, detectImageFormat(logoData), logoX, y, logoSize, logoSize)
        } catch {
          setFill(doc, COLORS.white)
          doc.circle(logoX + logoSize / 2, y + logoSize / 2, logoSize / 2, 'S')
        }
      } else {
        setFill(doc, COLORS.white)
        doc.circle(logoX + logoSize / 2, y + logoSize / 2, logoSize / 2, 'S')
        doc.setFont('THSarabunNew', 'bold')
        doc.setFontSize(Math.max(7, logoSize * 0.28))
        setText(doc, COLORS.meta)
        doc.text('ตรา', logoX + logoSize / 2, y + logoSize / 2, { align: 'center', baseline: 'middle' })
      }
      y += logoSize + Math.max(1.2, headLineGap)

      doc.setFont('THSarabunNew', 'bold')
      doc.setFontSize(titlePt)
      setText(doc, COLORS.text)
      doc.text(title, PAGE_W / 2, y, { align: 'center', baseline: 'top' })
      y += lineStepMm(titlePt, headLineGap)

      doc.setFontSize(schoolPt)
      doc.text(schoolName, PAGE_W / 2, y, { align: 'center', baseline: 'top' })
      y += lineStepMm(schoolPt, headLineGap)

      doc.setFontSize(metaPt)
      setText(doc, COLORS.meta)
      const meta = [
        `ภาคเรียนที่ ${sheet.term}`,
        `ห้อง ${input.classroomLabel || '-'}`,
        `เดือน${monthLabel} พ.ศ.${input.yearBe}${pageLabel}`,
      ].join('  |  ')
      doc.text(meta, PAGE_W / 2, y, { align: 'center', baseline: 'top' })
      y += lineStepMm(metaPt, headLineGap + 1.5)

      const tableTop = y
      const headerH = rowH

      // —— THEAD ——
      headers.forEach((label, i) => {
        const x = colX(i)
        const w = widths[i]
        drawRect(doc, x, tableTop, w, headerH, COLORS.header)
        drawCenteredText(doc, label, x, tableTop, w, headerH, {
          fontSize: tablePt,
          bold: true,
        })
      })

      const bodyTop = tableTop + headerH

      // —— TBODY ——
      pageStudents.forEach((student, bodyRowIndex) => {
        const rowY = bodyTop + bodyRowIndex * rowH
        const number = student.student_number || pageOffset + bodyRowIndex + 1
        const values = rowValues(sheet.reportType, student, sheet)

        drawRect(doc, colX(0), rowY, widths[0], rowH, COLORS.white)
        drawCenteredText(doc, String(number), colX(0), rowY, widths[0], rowH, {
          fontSize: tablePt,
          bold: true,
        })

        drawRect(doc, colX(1), rowY, widths[1], rowH, COLORS.white)
        drawCenteredText(doc, studentName(student), colX(1), rowY, widths[1], rowH, {
          fontSize: namePt,
          bold: true,
          align: 'left',
          padLeft: 1.6,
        })

        values.forEach((cell, i) => {
          const col = i + 2
          drawRect(doc, colX(col), rowY, widths[col], rowH, cell.fill || COLORS.white)
          drawCenteredText(doc, cell.text, colX(col), rowY, widths[col], rowH, {
            fontSize: tablePt,
            bold: true,
            color: cell.color,
          })
        })
      })

      // —— Signatures (ชิดใต้ตาราง + แสดงชื่อ/ตำแหน่ง) ——
      const tableBottom = bodyTop + pageStudents.length * rowH
      const signImgH = 8
      const signBlockH = signImgH + 3.8 + 3.8 + 3.6 * 2
      const preferredTop = tableBottom + Math.max(2.5, signatureMarginTop)
      const maxSignTop = PAGE_H - padBottom - signBlockH
      const signTop = Math.min(preferredTop, Math.max(tableBottom + 2, maxSignTop))

      const leftCenter = tableLeft + tableWidth * 0.28
      const rightCenter = tableLeft + tableWidth * 0.72
      void signatureGap

      function drawSignBlock(
        centerX: number,
        name: string,
        roles: string[],
        signData: string | null,
      ) {
        doc.setFont('THSarabunNew', 'normal')
        doc.setFontSize(signPt)
        setText(doc, COLORS.text)
        const lineY = signTop + signImgH
        if (signData) {
          try {
            const imgW = 36
            doc.addImage(
              signData,
              detectImageFormat(signData),
              centerX - imgW / 2,
              signTop,
              imgW,
              signImgH,
            )
            doc.text('ลงชื่อ', centerX - imgW / 2 - 6, lineY, { align: 'right', baseline: 'bottom' })
          } catch {
            doc.text('ลงชื่อ ...........................................', centerX, lineY, { align: 'center' })
          }
        } else {
          doc.text('ลงชื่อ ...........................................', centerX, lineY, { align: 'center' })
        }

        let ty = lineY + 3.8
        doc.setFont('THSarabunNew', 'bold')
        doc.setFontSize(signPt)
        doc.text(`( ${name} )`, centerX, ty, { align: 'center' })
        ty += 3.8
        doc.setFont('THSarabunNew', 'normal')
        doc.setFontSize(signRolePt)
        for (const role of roles) {
          doc.text(role, centerX, ty, { align: 'center' })
          ty += 3.6
        }
      }

      drawSignBlock(
        leftCenter,
        input.homeroomTeacherName || 'ยังไม่กำหนด',
        ['ครูประจำชั้น'],
        homeroomSign,
      )
      drawSignBlock(
        rightCenter,
        input.directorName || 'ยังไม่กำหนด',
        [
          ...(input.actingDirectorPosition ? [input.actingDirectorPosition] : []),
          `ผู้อำนวยการโรงเรียน${schoolName}`,
        ],
        directorSign,
      )
    })
  }

  const first = input.sheets[0]
  const safeClass = input.classroomLabel.replace(/[\\/:*?"<>|]+/g, '-')
  const monthLabel = getThaiMonthName(Number(first.monthKey.slice(5, 7)))
  const fileName = input.fileName
    || `${classroomAdminDocumentTitle(first.reportType)}_${safeClass}_${monthLabel}.pdf`
  if (target) return { fileName, appended: true as const }
  return { blob: doc.output('blob'), fileName }
}

export function isStandardJsPdfReportType(value: string): value is StandardJsPdfReportType {
  return (JSPDF_STANDARD_REPORT_TYPES as string[]).includes(value)
}
