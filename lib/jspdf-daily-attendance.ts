'use client'

import { jsPDF } from 'jspdf'
import { CLASSROOM_ADMIN_A4_LANDSCAPE_MM } from '@/lib/classroom-admin-a4-landscape'
import { CLASSROOM_ADMIN_CHECK_MARK } from '@/lib/classroom-admin-check-mark'
import { classroomAdminDocumentTitle, type ClassroomAdminReportKey } from '@/lib/classroom-admin-document-titles'
import {
  DEFAULT_CLASSROOM_ADMIN_MONTHLY_LAYOUT,
  type ClassroomAdminMonthlyLayout,
} from '@/lib/classroom-admin-print-layout'
import { toDailyDisplay } from '@/lib/daily-attendance'
import {
  PRINT_STUDENTS_PER_PAGE,
  chunkStudentsForPrintPages,
  printPageRowCount,
} from '@/lib/print-student-pages'
import { getThaiMonthName } from '@/lib/thaiDate'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'

const PAGE_W = CLASSROOM_ADMIN_A4_LANDSCAPE_MM.width
const PAGE_H = CLASSROOM_ADMIN_A4_LANDSCAPE_MM.height
const PX_TO_MM = 25.4 / 96

const COLORS = {
  border: [17, 24, 39] as [number, number, number],
  text: [17, 24, 39] as [number, number, number],
  meta: [51, 65, 85] as [number, number, number],
  cyan: [191, 234, 244] as [number, number, number],
  purple: [196, 181, 253] as [number, number, number],
  presentBg: [207, 248, 216] as [number, number, number],
  presentFg: [20, 83, 45] as [number, number, number],
  amberBg: [254, 243, 199] as [number, number, number],
  amberFg: [120, 53, 15] as [number, number, number],
  absentBg: [254, 226, 226] as [number, number, number],
  absentFg: [127, 29, 29] as [number, number, number],
  weekend: [217, 217, 217] as [number, number, number],
  holiday: [255, 91, 95] as [number, number, number],
  summaryGood: [220, 252, 231] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  logoBorder: [203, 213, 225] as [number, number, number],
  logoFg: [148, 163, 184] as [number, number, number],
}

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const

/** รายงานรายเดือนที่ใช้ตารางวันเหมือนกัน — เวลาเรียน + กิจวัตร + ออมเงิน */
export type MonthlyJsPdfReportType = Extract<
  ClassroomAdminReportKey,
  'attendance' | 'brushing' | 'milk' | 'lunch' | 'cleaning' | 'saving'
>

export const JSPDF_MONTHLY_REPORT_TYPES: MonthlyJsPdfReportType[] = [
  'attendance',
  'brushing',
  'milk',
  'lunch',
  'cleaning',
  'saving',
]

export function isMonthlyJsPdfReportType(value: string): value is MonthlyJsPdfReportType {
  return (JSPDF_MONTHLY_REPORT_TYPES as string[]).includes(value)
}

export type DailyAttendancePdfStudent = {
  id: string
  student_number: number
  prefix?: string | null
  first_name: string
  last_name: string
}

export type DailyAttendancePdfInput = {
  reportType?: MonthlyJsPdfReportType
  schoolName: string
  schoolLogoUrl?: string | null
  yearBe: number
  classroomLabel: string
  term: 1 | 2
  monthKey: string
  days: number
  schoolDays: number[]
  holidays: { date: string; name?: string | null }[]
  weekendSchoolDays: { date: string; name?: string | null }[]
  students: DailyAttendancePdfStudent[]
  /** ใช้เมื่อ reportType = attendance */
  attendance?: Record<string, Record<number, string | undefined>>
  /** ใช้เมื่อ reportType = brushing/milk/lunch/cleaning — ค่า > 0 = ทำแล้ว */
  activities?: Record<string, Record<number, number | undefined>>
  homeroomTeacherName: string
  directorName: string
  actingDirectorPosition?: string | null
  signatures?: { homeroom?: string | null; director?: string | null }
  layout?: ClassroomAdminMonthlyLayout
  fileName?: string
}

function px(n: number) {
  return Math.max(0, n) * PX_TO_MM
}

/** jsPDF setFontSize ใช้หน่วย pt — ค่า layout เป็น px @96dpi → pt = px * 0.75 */
function ptFromCssPx(pxValue: number) {
  return Math.max(0, pxValue) * 0.75
}

/** ความสูงบรรทัดหลังวาดข้อความ baseline top */
function lineStepMm(fontSizePt: number, gapMm = 1.2) {
  return Math.max(0, fontSizePt) * 0.352777778 * 1.2 + Math.max(0, gapMm)
}

function dayDateKey(monthKey: string, day: number) {
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

function dayLabel(monthKey: string, day: number) {
  return WEEKDAYS[new Date(`${dayDateKey(monthKey, day)}T00:00:00`).getDay()]
}

function studentName(student: DailyAttendancePdfStudent) {
  return `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim()
}

function summaryFor(
  studentId: string,
  schoolDays: number[],
  attendance: Record<string, Record<number, string | undefined>>,
) {
  const out = { ม: 0, ป: 0, ล: 0, ข: 0 }
  for (const day of schoolDays) {
    const value = attendance[studentId]?.[day]
    if (!value) continue
    if (value === 'ม' || value === 'ป' || value === 'ล' || value === 'ข') {
      out[value] += 1
    }
  }
  return out
}

function activityDoneCount(
  studentId: string,
  schoolDays: number[],
  activities: Record<string, Record<number, number | undefined>>,
) {
  return schoolDays.reduce((sum, day) => {
    const value = Number(activities[studentId]?.[day] || 0)
    return sum + (value > 0 ? 1 : 0)
  }, 0)
}

function activityAmountSum(
  studentId: string,
  schoolDays: number[],
  activities: Record<string, Record<number, number | undefined>>,
) {
  return schoolDays.reduce((sum, day) => sum + Number(activities[studentId]?.[day] || 0), 0)
}

function attendanceDisplay(
  studentId: string,
  day: number,
  attendance: Record<string, Record<number, string | undefined>>,
) {
  return toDailyDisplay(attendance[studentId]?.[day] as 'ม' | 'ป' | 'ล' | 'ข' | undefined) || ''
}

function activityDisplay(
  studentId: string,
  day: number,
  activities: Record<string, Record<number, number | undefined>>,
  asAmount = false,
) {
  const value = Number(activities[studentId]?.[day] || 0)
  if (!(value > 0)) return ''
  return asAmount ? String(value) : CLASSROOM_ADMIN_CHECK_MARK
}

function statusStyle(value: string): { bg: [number, number, number]; fg: [number, number, number] } | null {
  if (!value) return null
  if (value === 'ม') return { bg: COLORS.presentBg, fg: COLORS.presentFg }
  if (value === 'ป' || value === 'ล') return { bg: COLORS.amberBg, fg: COLORS.amberFg }
  if (value === 'ข') return { bg: COLORS.absentBg, fg: COLORS.absentFg }
  return { bg: COLORS.presentBg, fg: COLORS.presentFg }
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

/**
 * ชื่อวันหยุดแนวตั้ง กึ่งกลางช่อง — หมุน 90° ทวนเข็ม (อ่านจากล่างขึ้นบน)
 * จัดตำแหน่งเอง เพราะ align+angle ของ jsPDF มักเพี้ยนในคอลัมน์แคบ
 */
function drawHolidayRotatedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
) {
  if (!text) return
  doc.setFont('THSarabunNew', 'bold')
  setText(doc, COLORS.text)

  let size = Math.max(5, fontSize)
  const maxLen = Math.max(5, h - 2)
  doc.setFontSize(size)
  let textLen = doc.getTextWidth(text)
  while (textLen > maxLen && size > 4) {
    size -= 0.35
    doc.setFontSize(size)
    textLen = doc.getTextWidth(text)
  }

  // จุดยึด: กึ่งกลางแนวนอนของช่อง + จุดเริ่มข้อความจากด้านล่างของช่วงแนวตั้งที่จัดกลาง
  // angle 90 = หมุนทวนเข็ม ข้อความวิ่งขึ้นด้านบนจากจุด (x,y)
  const fontH = size * 0.352777778
  const anchorX = x + w / 2 + fontH * 0.35
  const anchorY = y + (h + textLen) / 2
  doc.text(text, anchorX, anchorY, { angle: 90 })
}

/** รวมวันหยุดชื่อเดียวกันที่ติดกัน เพื่อวาดข้อความครั้งเดียวกึ่งกลาง */
function buildHolidayRuns(
  days: number[],
  holidayMap: Record<string, string>,
  monthKey: string,
) {
  const runs: { startIdx: number; endIdx: number; name: string }[] = []
  let i = 0
  while (i < days.length) {
    const day = days[i]
    const name = holidayMap[dayDateKey(monthKey, day)]
    if (!name) {
      i += 1
      continue
    }
    let j = i
    while (
      j + 1 < days.length
      && holidayMap[dayDateKey(monthKey, days[j + 1])] === name
      && days[j + 1] === days[j] + 1
    ) {
      j += 1
    }
    runs.push({ startIdx: i, endIdx: j, name })
    i = j + 1
  }
  return runs
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG'
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
  return 'JPEG'
}

export type DailyAttendancePdfTarget = {
  doc: jsPDF
  /** ขึ้นหน้าใหม่ก่อนแผ่นแรกของรายงานนี้ (ใช้ตอนต่อเล่ม) */
  startWithNewPage?: boolean
  /** โลโก้ที่โหลดไว้แล้ว (แชร์ทั้งเล่ม) */
  logoData?: string | null
}

/** สร้าง PDF แบบบันทึกรายเดือน (เวลาเรียน / กิจวัตร / ออมเงิน) ด้วย jsPDF */
export async function buildDailyAttendancePdfBlob(
  input: DailyAttendancePdfInput,
  target?: DailyAttendancePdfTarget,
) {
  const reportType: MonthlyJsPdfReportType = input.reportType || 'attendance'
  const isAttendance = reportType === 'attendance'
  const isSaving = reportType === 'saving'
  const attendanceMap = input.attendance || {}
  const activityMap = input.activities || {}
  const layout = { ...DEFAULT_CLASSROOM_ADMIN_MONTHLY_LAYOUT, ...input.layout }
  const doc = target?.doc ?? new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })
  if (!target) await applyThaiFonts(doc)

  const [logoData, homeroomSign, directorSign] = await Promise.all([
    target && 'logoData' in target
      ? Promise.resolve(target.logoData ?? null)
      : loadImageDataUrl(input.schoolLogoUrl, 160, 0.7),
    loadImageDataUrl(input.signatures?.homeroom, 220, 0.75),
    loadImageDataUrl(input.signatures?.director, 220, 0.75),
  ])

  const padTop = px(layout.padTopPx)
  const padX = px(layout.padSidePx)
  const padBottom = px(layout.padBottomPx)
  const logoSize = px(layout.logoSizePx)
  const rowH = px(layout.rowHeightPx)
  const numberW = px(layout.numberColWidthPx)
  const nameW = px(layout.nameColWidthPx)
  const summaryW = px(layout.summaryColWidthPx)
  const signatureMarginTop = px(layout.signatureMarginTopPx)
  const headLineGap = px(layout.headLineGapPx)

  // ขนาดฟอนต์ (pt) จากค่า layout ที่เป็น px — ให้ใกล้ HTML print
  const titlePt = ptFromCssPx(layout.fontH1Px)
  const schoolPt = ptFromCssPx(layout.fontSchoolPx)
  const metaPt = ptFromCssPx(layout.fontMetaPx)
  const tablePt = ptFromCssPx(layout.fontTablePx)
  const monthTitlePt = ptFromCssPx(layout.fontMonthTitlePx)
  const summaryTitlePt = ptFromCssPx(layout.fontSummaryTitlePx)
  const namePt = ptFromCssPx(layout.fontNamePx)
  const holidayPt = ptFromCssPx(layout.fontHolidayPx)
  const signPt = ptFromCssPx(layout.fontSignaturePx)
  const signRolePt = ptFromCssPx(layout.fontSignatureRolePx)

  const days = Array.from({ length: input.days || 0 }, (_, i) => i + 1)
  const holidayMap = Object.fromEntries(
    (input.holidays || []).map(item => [item.date, item.name || 'วันหยุด']),
  )
  const schoolDaySet = new Set(input.schoolDays || [])
  const isWeekendCol = (day: number) => !schoolDaySet.has(day)
  const isHoliday = (day: number) => Boolean(holidayMap[dayDateKey(input.monthKey, day)])
  const isSchoolDay = (day: number) => schoolDaySet.has(day)

  const summaryColCount = isAttendance ? 4 : 1
  const tableLeft = padX
  const tableWidth = PAGE_W - padX * 2
  const summaryBlockW = summaryW * summaryColCount
  const dayBlockW = Math.max(0, tableWidth - numberW - nameW - summaryBlockW)
  const dayW = days.length > 0 ? dayBlockW / days.length : 0

  const colX = (index: number) => {
    if (index === 0) return tableLeft
    if (index === 1) return tableLeft + numberW
    if (index < 2 + days.length) return tableLeft + numberW + nameW + (index - 2) * dayW
    return tableLeft + numberW + nameW + dayBlockW + (index - 2 - days.length) * summaryW
  }
  const colW = (index: number) => {
    if (index === 0) return numberW
    if (index === 1) return nameW
    if (index < 2 + days.length) return dayW
    return summaryW
  }

  const headerRowH = rowH
  const theadH = headerRowH * 3
  const monthLabel = getThaiMonthName(Number(input.monthKey.slice(5, 7)))
  const title = classroomAdminDocumentTitle(reportType)
  const schoolName = input.schoolName || 'ชื่อโรงเรียน'

  const students = input.students || []
  const pages = chunkStudentsForPrintPages(students)

  pages.forEach((pageStudents, pageIndex) => {
    if (pageIndex > 0 || (pageIndex === 0 && target?.startWithNewPage)) {
      doc.addPage('a4', 'landscape')
    }

    const pageOffset = pageIndex * PRINT_STUDENTS_PER_PAGE
    const targetRows = printPageRowCount(pageStudents.length, {
      pageSize: PRINT_STUDENTS_PER_PAGE,
      minRows: layout.minBlankRows,
    })
    // ให้คอลัมน์วันหยุดยาวเต็มตาราง (รวมแถวว่าง) เหมือนหน้า 1 — ไม่ตัดแค่จำนวนนักเรียนในหน้านั้น
    const holidayRowSpan = targetRows

    type PrintRow =
      | { type: 'student'; student: DailyAttendancePdfStudent; number: number }
      | { type: 'blank'; number: number }

    const printRows: PrintRow[] = [
      ...pageStudents.map((student, index) => ({
        type: 'student' as const,
        student,
        number: student.student_number || pageOffset + index + 1,
      })),
      ...Array.from({ length: Math.max(0, targetRows - pageStudents.length) }, (_, index) => ({
        type: 'blank' as const,
        number: pageOffset + pageStudents.length + index + 1,
      })),
    ]

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
        drawCenteredText(doc, 'ตรา', logoX, y, logoSize, logoSize, {
          fontSize: 8,
          color: COLORS.logoFg,
        })
      }
      doc.circle(logoX + logoSize / 2, y + logoSize / 2, logoSize / 2, 'S')
    } else {
      setFill(doc, COLORS.white)
      doc.circle(logoX + logoSize / 2, y + logoSize / 2, logoSize / 2, 'S')
      drawCenteredText(doc, 'ตรา', logoX, y, logoSize, logoSize, {
        fontSize: 8,
        color: COLORS.logoFg,
      })
    }
    y += logoSize + Math.max(1.5, headLineGap + 1.5)

    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(titlePt)
    setText(doc, COLORS.text)
    doc.text(title, PAGE_W / 2, y, { align: 'center', baseline: 'top' })
    y += lineStepMm(titlePt, headLineGap + 0.8)

    doc.setFontSize(schoolPt)
    doc.text(schoolName, PAGE_W / 2, y, { align: 'center', baseline: 'top' })
    y += lineStepMm(schoolPt, headLineGap + 0.6)

    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(metaPt)
    setText(doc, COLORS.meta)
    const meta = [
      `ภาคเรียนที่ ${input.term}`,
      `ห้อง ${input.classroomLabel || '-'}`,
      `เดือน${monthLabel} พ.ศ.${input.yearBe}${pageLabel}`,
    ].join('  |  ')
    doc.text(meta, PAGE_W / 2, y, { align: 'center', baseline: 'top' })
    y += lineStepMm(metaPt, headLineGap + 1.5)

    const tableTop = y
    const bodyTop = tableTop + theadH
    const summaryX = colX(2 + days.length)

    // —— THEAD ——
    drawRect(doc, colX(0), tableTop, colW(0), theadH, COLORS.cyan)
    drawCenteredText(doc, 'เลขที่', colX(0), tableTop, colW(0), theadH, {
      fontSize: tablePt,
      bold: true,
    })
    drawRect(doc, colX(1), tableTop, colW(1), theadH, COLORS.cyan)
    drawCenteredText(doc, 'ชื่อ-นามสกุล', colX(1), tableTop, colW(1), theadH, {
      fontSize: tablePt,
      bold: true,
    })
    drawRect(doc, colX(2), tableTop, dayBlockW, headerRowH, COLORS.cyan)
    drawCenteredText(
      doc,
      `เดือน${monthLabel} พ.ศ.${input.yearBe}`,
      colX(2),
      tableTop,
      dayBlockW,
      headerRowH,
      { fontSize: monthTitlePt, bold: true },
    )

    if (isAttendance) {
      drawRect(doc, summaryX, tableTop, summaryBlockW, headerRowH, COLORS.purple)
      drawCenteredText(doc, 'สรุปผล', summaryX, tableTop, summaryBlockW, headerRowH, {
        fontSize: summaryTitlePt,
        bold: true,
      })
    } else {
      // กิจวัตร/ออมเงิน: สรุปคอลัมน์เดียว rowspan 3
      drawRect(doc, summaryX, tableTop, summaryBlockW, theadH, COLORS.purple)
      drawCenteredText(doc, isSaving ? 'รวม' : 'สรุปผล', summaryX, tableTop, summaryBlockW, theadH, {
        fontSize: summaryTitlePt,
        bold: true,
      })
    }

    const row2Y = tableTop + headerRowH
    days.forEach((day, i) => {
      const x = colX(2 + i)
      let fill: [number, number, number] = COLORS.cyan
      if (isHoliday(day)) fill = COLORS.holiday
      else if (isWeekendCol(day)) fill = COLORS.weekend
      drawRect(doc, x, row2Y, dayW, headerRowH, fill)
      drawCenteredText(doc, String(day), x, row2Y, dayW, headerRowH, {
        fontSize: tablePt,
        bold: true,
      })
    })

    if (isAttendance) {
      const summaryLabels: { text: string; fill: [number, number, number] }[] = [
        { text: 'มา', fill: COLORS.summaryGood },
        { text: 'ป่วย', fill: COLORS.amberBg },
        { text: 'ลา', fill: COLORS.absentBg },
        { text: 'ขาด', fill: COLORS.absentBg },
      ]
      summaryLabels.forEach((item, i) => {
        const x = summaryX + i * summaryW
        drawRect(doc, x, row2Y, summaryW, headerRowH * 2, item.fill)
        drawCenteredText(doc, item.text, x, row2Y, summaryW, headerRowH * 2, {
          fontSize: tablePt,
          bold: true,
        })
      })
    }

    const row3Y = tableTop + headerRowH * 2
    days.forEach((day, i) => {
      const x = colX(2 + i)
      let fill: [number, number, number] = COLORS.cyan
      if (isHoliday(day)) fill = COLORS.holiday
      else if (isWeekendCol(day)) fill = COLORS.weekend
      drawRect(doc, x, row3Y, dayW, headerRowH, fill)
      drawCenteredText(doc, dayLabel(input.monthKey, day), x, row3Y, dayW, headerRowH, {
        fontSize: tablePt,
        bold: true,
      })
    })

    // —— TBODY: วันหยุด (รวมชื่อเดียวกันที่ติดกัน + ตัวหนังสือหมุนกึ่งกลางช่อง) ——
    if (holidayRowSpan > 0) {
      const holidayRuns = buildHolidayRuns(days, holidayMap, input.monthKey)
      const h = holidayRowSpan * rowH
      for (const run of holidayRuns) {
        const x = colX(2 + run.startIdx)
        const spanW = dayW * (run.endIdx - run.startIdx + 1)
        drawRect(doc, x, bodyTop, spanW, h, COLORS.holiday)
        drawHolidayRotatedText(doc, run.name, x, bodyTop, spanW, h, holidayPt)
      }
    }

    printRows.forEach((row, bodyRowIndex) => {
      const rowY = bodyTop + bodyRowIndex * rowH
      const isStudentRow = row.type === 'student'
      const inHolidaySpan = bodyRowIndex < holidayRowSpan

      drawRect(doc, colX(0), rowY, colW(0), rowH, COLORS.white)
      drawCenteredText(doc, String(row.number), colX(0), rowY, colW(0), rowH, {
        fontSize: tablePt,
        bold: true,
      })

      drawRect(doc, colX(1), rowY, colW(1), rowH, COLORS.white)
      if (isStudentRow) {
        drawCenteredText(doc, studentName(row.student), colX(1), rowY, colW(1), rowH, {
          fontSize: namePt,
          bold: true,
          align: 'left',
          padLeft: 1.6,
        })
      }

      days.forEach((day, i) => {
        if (isHoliday(day) && inHolidaySpan) return
        const x = colX(2 + i)
        if (isHoliday(day)) {
          drawRect(doc, x, rowY, dayW, rowH, COLORS.white)
          return
        }

        const weekend = isWeekendCol(day) && !isHoliday(day)
        let fill: [number, number, number] | null = weekend ? COLORS.weekend : null
        let value = ''
        let fg: [number, number, number] = COLORS.text

        if (isStudentRow && isSchoolDay(day)) {
          if (isAttendance) {
            value = attendanceDisplay(row.student.id, day, attendanceMap)
            const style = statusStyle(value)
            if (style) {
              fill = style.bg
              fg = style.fg
            }
          } else {
            value = activityDisplay(row.student.id, day, activityMap, isSaving)
            if (value) {
              fill = COLORS.presentBg
              fg = COLORS.presentFg
            }
          }
        }

        drawRect(doc, x, rowY, dayW, rowH, fill)
        if (value) {
          drawCenteredText(doc, value, x, rowY, dayW, rowH, {
            fontSize: tablePt,
            bold: true,
            color: fg,
          })
        }
      })

      if (isAttendance) {
        const summary = isStudentRow
          ? summaryFor(row.student.id, input.schoolDays, attendanceMap)
          : null
        const summaryFills = [COLORS.summaryGood, COLORS.amberBg, COLORS.absentBg, COLORS.absentBg]
        const summaryValues = summary
          ? [String(summary.ม), String(summary.ป), String(summary.ล), String(summary.ข)]
          : ['', '', '', '']
        summaryFills.forEach((fill, i) => {
          const x = summaryX + i * summaryW
          drawRect(doc, x, rowY, summaryW, rowH, fill)
          if (summaryValues[i]) {
            drawCenteredText(doc, summaryValues[i], x, rowY, summaryW, rowH, {
              fontSize: tablePt,
              bold: true,
            })
          }
        })
      } else {
        drawRect(doc, summaryX, rowY, summaryW, rowH, COLORS.summaryGood)
        if (isStudentRow) {
          const summaryValue = isSaving
            ? activityAmountSum(row.student.id, input.schoolDays, activityMap)
            : activityDoneCount(row.student.id, input.schoolDays, activityMap)
          if (summaryValue) {
            drawCenteredText(
              doc,
              isSaving ? summaryValue.toLocaleString('th-TH') : String(summaryValue),
              summaryX,
              rowY,
              summaryW,
              rowH,
              {
                fontSize: tablePt,
                bold: true,
              },
            )
          }
        }
      }
    })

    // —— Signatures (ชิดใต้ตาราง + แสดงชื่อ/ตำแหน่ง) ——
    const tableBottom = bodyTop + printRows.length * rowH
    const signImgH = 8
    const signBlockH = signImgH + 3.8 + 3.8 + 3.6 * 2
    const preferredTop = tableBottom + Math.max(2.5, signatureMarginTop)
    const maxSignTop = PAGE_H - padBottom - signBlockH
    const signTop = Math.min(preferredTop, Math.max(tableBottom + 2, maxSignTop))

    // วางใต้ตาราง ซ้าย/ขวา ~1/4 และ 3/4 ของความกว้างตาราง
    const leftCenter = tableLeft + tableWidth * 0.28
    const rightCenter = tableLeft + tableWidth * 0.72

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
    const directorRoles = [
      ...(input.actingDirectorPosition ? [input.actingDirectorPosition] : []),
      `ผู้อำนวยการโรงเรียน${schoolName}`,
    ]
    drawSignBlock(
      rightCenter,
      input.directorName || 'ยังไม่กำหนด',
      directorRoles,
      directorSign,
    )
  })

  const safeClass = input.classroomLabel.replace(/[\\/:*?"<>|]+/g, '-')
  const fileName = input.fileName
    || `${classroomAdminDocumentTitle(reportType)}_${safeClass}_${monthLabel}.pdf`
  if (target) return { fileName, appended: true as const }
  return { blob: doc.output('blob'), fileName }
}
