import { jsPDF } from 'jspdf'
import type {
  ReportPayload,
  ReportScore,
  ReportStudent,
  ReportSubject,
} from '@/app/(shell)/reports/actions'
import { isPrimaryClassLevel, isSecondaryClassLevel } from '@/lib/class-level'
import { expandEducationAreaOffice } from '@/lib/education-area-office'
import { characterCriteriaTopics, readingCriteriaTopics } from '@/lib/evaluation-settings'
import {
  buildHourlyStatusMap,
  buildTeachingWeeks,
  hourlyCellKey,
  hoursPerWeek,
  resolveHourlyStatus,
  schoolDayCalendarFromLists,
  summarizeHourlyStatuses,
  termDateRange,
  type HourlyStatus,
} from '@/lib/hourly-attendance'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import { documentQrUrl } from '@/lib/document-qr-url'
import { drawJsPdfCheckbox } from '@/lib/jspdf-check-mark'
import { qrDataUrl } from '@/lib/qr-data-url'
import {
  DEFAULT_PP5_PRINT_LAYOUTS,
  pp5AttendanceBodyRows,
  pp5StudentTableRows,
  pxToMm96,
  type Pp5CoverLayout,
  type Pp5PrintLayouts,
  type Pp5SectionLayout,
} from '@/lib/pp5-print-layout'
import {
  chunkStudentsForPrintPages,
  PRINT_STUDENTS_PER_PAGE,
} from '@/lib/print-student-pages'
import {
  defaultReadingTableGroups,
  READING_SCORE_KEYS,
  readingTableColumnMax,
  readingTableColumnValue,
  readingTableFlatColumns,
  type ReadingTableColumn,
} from '@/lib/reading-table-layout'
import {
  directorActingPositionLine,
  directorDisplayName,
  directorSchoolLine,
} from '@/lib/school-director'
import {
  buildSubjectCalendarWeeks,
  displaySlotsPerWeek,
  holidayNameMap,
  primaryGlobalSlotNumber,
  primaryHourlyPages,
  secondaryHourlyPages,
  subjectHourlyHpw,
  subjectHourlyTermWeeks,
  type SubjectCalendarWeek,
} from '@/lib/subject-hourly-report'
import { subjectGroupHeadPositionLine } from '@/lib/subject-groups'

const PAGE_W = 210
const PAGE_H = 297
const PX_TO_MM = 25.4 / 96
const BORDER: [number, number, number] = [17, 24, 39]
const MUTED_BG: [number, number, number] = [217, 217, 217]
const TEXT: [number, number, number] = [17, 24, 39]
const PP5_SUBJECT_PAGE_MARK = '(รายวิชา)'
const THAI_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const CHARACTER_KEYS = Array.from({ length: 8 }, (_, i) => `trait${i + 1}_score`)
const READING_KEYS = [...READING_SCORE_KEYS]
const COMPETENCY_KEYS = Array.from({ length: 5 }, (_, i) => `competency${i + 1}_score`)
const COMPETENCY_LABELS = ['สื่อสาร', 'คิด', 'แก้ปัญหา', 'ทักษะชีวิต', 'เทคโนโลยี']

const SUBJECT_SCORE_PAGES_PER_TERM = 3
const SUBJECT_UNIT_DISPLAY_COLS = 6
const SUBJECT_FINAL_DISPLAY_COLS = 4

const SUBJECT_COVER_GRADE_COLUMNS = [
  { key: '4', label: '4' },
  { key: '3.5', label: '3.5' },
  { key: '3', label: '3' },
  { key: '2.5', label: '2.5' },
  { key: '2', label: '2' },
  { key: '1.5', label: '1.5' },
  { key: '1', label: '1' },
  { key: '0', label: '0' },
  { key: 'ร', label: 'ร' },
  { key: 'มส', label: 'มส' },
]

const SUBJECT_COVER_GRADE_LEVEL_COLUMNS = SUBJECT_COVER_GRADE_COLUMNS.filter(
  column => column.key !== 'ร' && column.key !== 'มส',
)
const SUBJECT_COVER_GRADE_RESULT_COLUMNS = SUBJECT_COVER_GRADE_COLUMNS.filter(
  column => column.key === 'ร' || column.key === 'มส',
)

export type Pp5SubjectPdfSection =
  | 'cover'
  | 'criteria'
  | 'attendance'
  | 'scores'
  | 'character'
  | 'reading'
  | 'competency'

export type Pp5SubjectPdfOptions = {
  data: ReportPayload
  subject: ReportSubject
  term: 0 | 1 | 2
  sections: Array<Pp5SubjectPdfSection>
  layouts: Pp5PrintLayouts
  previewSection?: Pp5SubjectPdfSection
  fileName?: string
}

export type Pp5SubjectPdfBuildOptions = {
  /** ใช้ doc ที่สร้างไว้แล้ว (เช่น ฝั่งเซิร์ฟเวอร์ติดตั้งฟอนต์จากดิสก์แล้ว) */
  doc?: jsPDF
  skipApplyFonts?: boolean
}

type DrawCtx = {
  doc: jsPDF
  data: ReportPayload
  subject: ReportSubject
  term: 0 | 1 | 2
  layouts: Pp5PrintLayouts
  logoData: string | null
  signatures: Record<string, string | null>
  qrPng: string | null
}

function px(n: number) {
  return Math.max(0, n) * PX_TO_MM
}

function ptFromCssPx(pxValue: number) {
  return Math.max(6, pxValue) * 0.75
}

function studentName(student: ReportStudent) {
  return `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim()
}

function classLabel(classroom: ReportPayload['classroom']) {
  return classroom ? `${classroom.level}/${classroom.room}` : '-'
}

function scoreFor(data: ReportPayload, studentId: string, classSubjectId: string) {
  return data.scores.find(s => s.student_id === studentId && s.class_subject_id === classSubjectId) || null
}

function scoreForTerm(data: ReportPayload, studentId: string, classSubjectId: string, term: 1 | 2) {
  return data.scores.find(s => s.student_id === studentId && s.class_subject_id === classSubjectId && s.term === term) || null
}

function finalScoreForSubject(data: ReportPayload, studentId: string, classSubjectId: string) {
  return scoreForTerm(data, studentId, classSubjectId, 2)
    || scoreForTerm(data, studentId, classSubjectId, 1)
    || scoreFor(data, studentId, classSubjectId)
}

function scoreConfigFor(data: ReportPayload, classSubjectId: string, term: 1 | 2) {
  return data.scoreConfigs.find(c => c.class_subject_id === classSubjectId && c.term === term) || null
}

function splitScoreUnits(config: ReturnType<typeof scoreConfigFor>) {
  const betweenScores = config?.between_scores?.length ? config.between_scores : [5, 5, 5, 5, 5]
  const beforeCount = Math.ceil(betweenScores.length / 2)
  const afterCount = Math.max(0, betweenScores.length - beforeCount)
  const beforeMaxes = betweenScores.slice(0, beforeCount)
  const afterMaxes = betweenScores.slice(beforeCount)
  return {
    betweenScores,
    beforeCount,
    afterCount,
    beforeMaxes,
    afterMaxes,
    beforeMax: beforeMaxes.reduce((sum, v) => sum + v, 0),
    afterMax: afterMaxes.reduce((sum, v) => sum + v, 0),
    midtermMax: config?.midterm_max || 0,
    finalMax: config?.final_max || 0,
  }
}

function unitScoreValues(score: ReportScore | null, startIndex: number, count: number) {
  return Array.from({ length: count }, (_, i) => score?.unit_scores?.[String(startIndex + i + 1)] ?? '')
}

function padScoreCells(values: Array<string | number>, size: number) {
  return Array.from({ length: size }, (_, i) => values[i] ?? '')
}

function sumScoreCells(values: Array<string | number>) {
  return values.reduce<number>((sum, v) => sum + (Number(v) || 0), 0)
}

function scoreText(score: ReportScore | null) {
  if (!score) return '-'
  if (score.result && score.result !== 'เรียน') return score.result
  return score.grade === null || score.grade === undefined ? '-' : String(score.grade)
}

function rowFor(rows: Record<string, string | number | null>[], studentId: string) {
  return rows.find(r => r.student_id === studentId) || null
}

function rowForTerm(rows: Record<string, string | number | null>[], studentId: string, term: 1 | 2 | 0) {
  const studentRows = rows.filter(r => r.student_id === studentId)
  if (term !== 0) return studentRows.find(r => Number(r.term) === term) || studentRows[0] || null
  return studentRows.find(r => Number(r.term) === 2)
    || studentRows.find(r => Number(r.term) === 1)
    || studentRows[0]
    || null
}

function averageScore(row: Record<string, string | number | null> | null, keys: string[]) {
  if (!row) return null
  const values = keys.map(k => Number(row[k] ?? 0))
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function levelFromAverage(value: number | null) {
  if (value === null) return '-'
  if (value >= 2.5) return 'ดีเยี่ยม'
  if (value >= 2) return 'ดี'
  if (value >= 1) return 'ผ่าน'
  return 'ไม่ผ่าน'
}

function resultLevelNumber(level: string | number | null | undefined) {
  if (level === 'ดีเยี่ยม') return '3'
  if (level === 'ดี') return '2'
  if (level === 'ผ่าน') return '1'
  if (level === 'ไม่ผ่าน') return '0'
  return ''
}

function subjectGradeBucket(score: ReportScore | null) {
  if (!score) return null
  if (score.result === 'ร') return 'ร'
  if (score.result === 'มส') return 'มส'
  if (score.result && score.result !== 'เรียน') return '0'
  if (score.grade === null || score.grade === undefined) return null
  return String(score.grade)
}

function subjectGradeSummaryForTerm(data: ReportPayload, subject: ReportSubject, term: 0 | 1 | 2) {
  const counts = Object.fromEntries(SUBJECT_COVER_GRADE_COLUMNS.map(c => [c.key, 0])) as Record<string, number>
  for (const student of data.students) {
    const score = term === 0
      ? finalScoreForSubject(data, student.id, subject.class_subject_id)
      : scoreForTerm(data, student.id, subject.class_subject_id, term as 1 | 2)
    const bucket = subjectGradeBucket(score)
    if (bucket && bucket in counts) counts[bucket] += 1
  }
  return counts
}

function coverPercent(count: number, total: number) {
  if (total <= 0) return '-'
  return ((count / total) * 100).toFixed(2)
}

function classroomLevelLabel(level: string) {
  const match = level.match(/(\d+)/)
  const digit = match?.[1] || level
  if (/ม\.|มัธยม/i.test(level)) return `มัธยมศึกษาปีที่ ${digit}`
  if (/ป\.|ประถม/i.test(level)) return `ประถมศึกษาปีที่ ${digit}`
  if (level.startsWith('ม')) return `มัธยมศึกษาปีที่ ${digit}`
  return `ประถมศึกษาปีที่ ${digit}`
}

function subjectHourlyClassLine(classroom: ReportPayload['classroom']) {
  if (!classroom) return '-'
  const levelType = classroomLevelLabel(classroom.level).split('ปีที่')[0] || 'ประถมศึกษา'
  return `ชั้น${levelType}ปีที่ ${classLabel(classroom)}`
}

function subjectReportSubhead(data: ReportPayload, term: 0 | 1 | 2) {
  const classroom = data.classroom
  const termLabel = term === 0 ? 'สรุปทั้งปี' : `ภาคเรียนที่ ${term}`
  if (!classroom) return `${termLabel} ปีการศึกษา ${data.academicYear?.year_be || '-'}`
  return `ชั้น ${classroomLevelLabel(classroom.level)} ห้อง ${classroom.room} ${termLabel} ปีการศึกษา ${data.academicYear?.year_be || '-'}`
}

function schoolOfficeLine(data: ReportPayload) {
  const raw = data.school?.area_office
    || data.school?.department
    || [data.school?.district, data.school?.province].filter(Boolean).join(' ')
    || '-'
  if (raw === '-') return raw
  return expandEducationAreaOffice(raw)
}

function homeroomTeacherLine(classroom: ReportPayload['classroom']) {
  const names = [classroom?.homeroom_teacher_name, classroom?.homeroom_teacher2_name].filter(Boolean) as string[]
  return names.join(' / ') || '-'
}

function subjectGroupHeadName(data: ReportPayload, subjectGroup: string | null | undefined) {
  const group = subjectGroup?.trim()
  if (!group) return '—'
  return data.subjectGroupHeads?.[group]?.trim() || '—'
}

function subjectIsElective(subject: ReportSubject) {
  const type = subject.subject.type || ''
  return /เพิ่มเติม|elective/i.test(type)
}

function evaluationSummary(data: ReportPayload, rows: Record<string, string | number | null>[], keys: string[]) {
  const out = { total: data.students.length, excellent: 0, good: 0, pass: 0, fail: 0 }
  for (const student of data.students) {
    const level = levelFromAverage(averageScore(rowFor(rows, student.id), keys))
    if (level === 'ดีเยี่ยม') out.excellent += 1
    else if (level === 'ดี') out.good += 1
    else if (level === 'ผ่าน') out.pass += 1
    else out.fail += 1
  }
  return out
}

function reportSchoolCalendar(data: ReportPayload) {
  return schoolDayCalendarFromLists(
    (data.holidays || []).map(d => d.date),
    (data.weekendSchoolDays || []).map(d => d.date),
  )
}

function hourlyExamEligibility(percent: number) {
  return percent >= 80 ? 'มี' : 'ไม่มี'
}

function studentHourlySummary(
  weeks: ReturnType<typeof subjectHourlyTermWeeks>,
  dataSlotsPerWeek: number,
  recordMap: Map<string, HourlyStatus>,
  studentId: string,
) {
  const statuses: HourlyStatus[] = []
  for (const week of weeks) {
    for (let slot = 1; slot <= dataSlotsPerWeek; slot += 1) {
      statuses.push(resolveHourlyStatus(recordMap.get(hourlyCellKey(studentId, week.weekNumber, slot))))
    }
  }
  return summarizeHourlyStatuses(statuses)
}

function studentSecondaryHourlySummary(
  weeks: SubjectCalendarWeek[],
  recordMap: Map<string, HourlyStatus>,
  studentId: string,
) {
  const statuses: HourlyStatus[] = []
  for (const week of weeks) {
    for (const day of week.days) {
      if (!day.slotInWeek) continue
      statuses.push(resolveHourlyStatus(recordMap.get(hourlyCellKey(studentId, week.weekNumber, day.slotInWeek))))
    }
  }
  return summarizeHourlyStatuses(statuses)
}

function subjectWeekMonthLabel(week: SubjectCalendarWeek) {
  const months = [...new Set(week.days.map(day => day.date.getMonth()))]
  return months.length === 1
    ? THAI_MONTH_SHORT[months[0]]
    : months.map(month => THAI_MONTH_SHORT[month]).join('-')
}

function hourlyStatusCellContent(status: HourlyStatus | undefined) {
  return resolveHourlyStatus(status)
}

function setStroke(doc: jsPDF, rgb: [number, number, number] = BORDER, width = 0.3) {
  doc.setDrawColor(...rgb)
  doc.setLineWidth(width)
}

function setFill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(...rgb)
}

function setText(doc: jsPDF, rgb: [number, number, number] = TEXT) {
  doc.setTextColor(...rgb)
}

function fitText(doc: jsPDF, text: string, maxW: number) {
  const raw = text || ''
  if (!raw) return ''
  if (doc.getTextWidth(raw) <= maxW) return raw
  let out = raw
  while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxW) out = out.slice(0, -1)
  return `${out}…`
}

function wrapLines(doc: jsPDF, text: string, maxW: number): string[] {
  const raw = (text || '').trim()
  if (!raw) return []
  try {
    const lines = doc.splitTextToSize(raw, Math.max(2, maxW))
    return Array.isArray(lines) ? lines.filter(Boolean) : [String(lines)]
  } catch {
    return [fitText(doc, raw, maxW)]
  }
}

function lineGapMmFromPt(fontSizePt: number) {
  return fontSizePt * (25.4 / 72) * 1.28
}

/** เซลล์ข้อความหลายบรรทัด จัดบนซ้าย/กลาง — ใช้ในตารางเกณฑ์ */
function drawWrappedCell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  opts?: {
    align?: 'left' | 'center'
    vAlign?: 'top' | 'middle'
    bold?: boolean
    fontSize?: number
    borderWidthMm?: number
    padMm?: number
  },
) {
  const fontSize = opts?.fontSize ?? 10
  const pad = opts?.padMm ?? 1.1
  const align = opts?.align || 'left'
  const vAlign = opts?.vAlign || 'top'
  setStroke(doc, BORDER, opts?.borderWidthMm ?? 0.3)
  doc.rect(x, y, w, h, 'S')
  doc.setFont('THSarabunNew', opts?.bold ? 'bold' : 'normal')
  doc.setFontSize(fontSize)
  setText(doc)
  const lines = wrapLines(doc, text, Math.max(2, w - pad * 2))
  if (lines.length === 0) return
  const gap = lineGapMmFromPt(fontSize)
  const blockH = lines.length * gap
  let ty = vAlign === 'middle'
    ? y + (h - blockH) / 2 + gap * 0.72
    : y + pad + gap * 0.72
  lines.forEach(line => {
    if (align === 'center') doc.text(line, x + w / 2, ty, { align: 'center' })
    else doc.text(line, x + pad, ty)
    ty += gap
  })
}

function drawCell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  opts?: {
    align?: 'left' | 'center' | 'right'
    bold?: boolean
    fontSize?: number
    fill?: [number, number, number]
    muted?: boolean
    noFit?: boolean
    textNudgeMm?: number
    borderWidthMm?: number
  },
) {
  const align = opts?.align || 'center'
  const fontSize = opts?.fontSize ?? 10
  if (opts?.fill) {
    setFill(doc, opts.fill)
    doc.rect(x, y, w, h, 'F')
  } else if (opts?.muted) {
    setFill(doc, MUTED_BG)
    doc.rect(x, y, w, h, 'F')
  }
  setStroke(doc, BORDER, opts?.borderWidthMm ?? 0.3)
  doc.rect(x, y, w, h, 'S')
  setText(doc)
  doc.setFont('THSarabunNew', opts?.bold ? 'bold' : 'normal')
  doc.setFontSize(fontSize)
  const pad = 0.6
  const maxW = Math.max(1, w - pad * 2)
  const label = opts?.noFit ? (text || '') : fitText(doc, text, maxW)
  const nudge = opts?.textNudgeMm ?? -0.85
  const lines = label.split('\n').filter((line, i, arr) => line.length > 0 || arr.length === 1)
  // jsPDF fontSize is pt; 1pt = 25.4/72 mm
  const lineGapMm = fontSize * (25.4 / 72) * 1.05
  const blockH = lines.length * lineGapMm
  const startY = y + h / 2 + nudge - (blockH - lineGapMm) / 2
  lines.forEach((line, i) => {
    const ty = startY + i * lineGapMm
    if (align === 'left') doc.text(line, x + pad, ty, { baseline: 'middle' })
    else if (align === 'right') doc.text(line, x + w - pad, ty, { baseline: 'middle', align: 'right' })
    else doc.text(line, x + w / 2, ty, { baseline: 'middle', align: 'center' })
  })
}

/** หัวตารางแนวตั้ง — เทียบ writing-mode: vertical-rl + rotate(180deg) ของพรีวิว HTML */
function drawVerticalHeaderCell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  opts?: {
    bold?: boolean
    fontSize?: number
    fill?: [number, number, number]
    borderWidthMm?: number
  },
) {
  if (opts?.fill) {
    setFill(doc, opts.fill)
    doc.rect(x, y, w, h, 'F')
  }
  setStroke(doc, BORDER, opts?.borderWidthMm ?? 0.3)
  doc.rect(x, y, w, h, 'S')
  if (!text) return

  doc.setFont('THSarabunNew', opts?.bold === false ? 'normal' : 'bold')
  setText(doc)
  let size = Math.max(5, opts?.fontSize ?? 10)
  const maxLen = Math.max(5, h - 2)
  doc.setFontSize(size)
  let textLen = doc.getTextWidth(text)
  while (textLen > maxLen && size > 4) {
    size -= 0.35
    doc.setFontSize(size)
    textLen = doc.getTextWidth(text)
  }
  const fontH = size * 0.352777778
  const anchorX = x + w / 2 + fontH * 0.35
  const anchorY = y + (h + textLen) / 2
  doc.text(text, anchorX, anchorY, { angle: 90 })
}

function drawPageMark(doc: jsPDF, pageNumber: number) {
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(9)
  setText(doc)
  doc.text(`หน้า ${pageNumber}`, PAGE_W - 12, 6.5, { align: 'right' })
  doc.text(PP5_SUBJECT_PAGE_MARK, PAGE_W - 12, 10, { align: 'right' })
}

function pp5ScoreHeadLabel(label: string, max?: number | null) {
  const fullScore = max && max > 0 ? `(${max}) ` : ''
  return `${fullScore}${label}`
}

function contentBox(layout: Pp5CoverLayout | Pp5SectionLayout) {
  return {
    left: layout.padSideMm,
    right: PAGE_W - layout.padSideMm,
    top: layout.padTopMm,
    width: PAGE_W - layout.padSideMm * 2,
  }
}

function rowHeightMm(layout: Pp5SectionLayout) {
  return pxToMm96(layout.rowHeightPx)
}

function drawSubjectHead(
  doc: jsPDF,
  ctx: DrawCtx,
  layout: Pp5SectionLayout,
  title: string,
  activeTerm: 0 | 1 | 2,
  y: number,
  opts?: { includeSubjectLine?: boolean },
) {
  const box = contentBox(layout)
  const includeSubjectLine = opts?.includeSubjectLine !== false
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  doc.text(title, box.left + box.width / 2, y, { align: 'center' })
  y += pxToMm96(layout.fontH1Px) * 0.5 + 1.5
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  doc.text(subjectReportSubhead(ctx.data, activeTerm), box.left + box.width / 2, y, { align: 'center' })
  y += pxToMm96(layout.fontSubPx) * 0.45 + 1.2
  if (!includeSubjectLine) return y + 2
  const sub = `รายวิชา ${ctx.subject.subject.name} รหัสวิชา ${ctx.subject.subject.code}   ครูผู้สอน ${ctx.subject.teacher_name || '-'}   ครูที่ปรึกษา ${homeroomTeacherLine(ctx.data.classroom)}`
  doc.setFontSize(ptFromCssPx(layout.fontSubPx) - 1)
  doc.text(fitText(doc, sub, box.width), box.left + box.width / 2, y, { align: 'center' })
  return y + 4
}

function drawTableGrid(
  doc: jsPDF,
  x: number,
  y: number,
  colWidths: number[],
  rows: string[][],
  opts: {
    rowH: number
    fontSize: number
    headerRows?: number
    nameCol?: number
    headerFill?: [number, number, number]
  },
) {
  const totalW = colWidths.reduce((a, b) => a + b, 0)
  let cy = y
  rows.forEach((row, ri) => {
    let cx = x
    const isHeader = ri < (opts.headerRows || 0)
    row.forEach((cell, ci) => {
      drawCell(doc, cx, cy, colWidths[ci], opts.rowH, cell, {
        fontSize: opts.fontSize,
        bold: isHeader,
        align: ci === opts.nameCol ? 'left' : 'center',
        fill: isHeader ? opts.headerFill : undefined,
      })
      cx += colWidths[ci]
    })
    cy += opts.rowH
  })
  return { bottom: cy, width: totalW }
}

async function drawCoverPage(ctx: DrawCtx) {
  const { doc, data, subject, term, layouts, logoData, signatures } = ctx
  const layout = layouts.coverSubject
  const box = contentBox(layout)
  const RULE: [number, number, number] = [209, 213, 219]
  const borderW = layout.borderWidthMm
  const cellNudge = layout.cellTextNudgeMm
  const cellOpts = { borderWidthMm: borderW, textNudgeMm: cellNudge }

  const infoFont = ptFromCssPx(layout.fontInfoPx)
  const tableFont = ptFromCssPx(layout.fontTablePx)
  const tableSmallFont = ptFromCssPx(layout.fontTableSmallPx)
  const bannerFont = ptFromCssPx(layout.fontTablePx + layout.bannerFontBoostPx)
  const rowH = Math.max(3.2, pxToMm96(Math.max(layout.tableRowHeightPx, layout.fontTablePx * 0.7 + layout.tableCellPadPx * 2)))
  const infoRowH = pxToMm96(layout.fontInfoPx * layout.infoLineHeight + layout.infoRowPadPx * 2)

  const activeTerm = (term === 0 ? 1 : term) as 1 | 2
  const range = termDateRange(data.academicYear, activeTerm)
  // หน้าปกใช้จำนวนสัปดาห์เต็มเหมือนพรีวิว HTML (ไม่ slice 20 เหมือนตารางรายชั่วโมง)
  const weeks = buildTeachingWeeks(range.start, range.end, reportSchoolCalendar(data))
  const hoursWeek = hoursPerWeek(subject.subject.hours_per_year || 0, weeks.length)
  const isPrimary = isPrimaryClassLevel(data.classroom?.level)
  const isSecondary = isSecondaryClassLevel(data.classroom?.level)
  const isElective = subjectIsElective(subject)
  const studentsTotal = data.students.length
  const gradeCounts = subjectGradeSummaryForTerm(data, subject, term)
  const character = evaluationSummary(data, data.evaluations.character, CHARACTER_KEYS)
  const reading = evaluationSummary(data, data.evaluations.reading, READING_KEYS)

  const gradeCountDisplay = (count: number) => (count > 0 ? String(count) : '-')

  const drawHRule = (yy: number) => {
    setStroke(doc, RULE, Math.max(0.15, borderW * 0.8))
    doc.line(box.left, yy, box.right, yy)
  }

  const writeAt = (
    x: number,
    textY: number,
    text: string,
    opts?: { bold?: boolean; align?: 'left' | 'center' | 'right'; maxW?: number },
  ) => {
    doc.setFont('THSarabunNew', opts?.bold ? 'bold' : 'normal')
    doc.setFontSize(infoFont)
    setText(doc)
    const align = opts?.align || 'left'
    const label = opts?.maxW ? fitText(doc, text, opts.maxW) : text
    if (align === 'right') doc.text(label, x, textY, { align: 'right', baseline: 'middle' })
    else if (align === 'center') doc.text(label, x, textY, { align: 'center', baseline: 'middle' })
    else doc.text(label, x, textY, { baseline: 'middle' })
  }

  const writeLabelValue = (
    x: number,
    textY: number,
    label: string,
    value: string,
    gap = 1.2,
    valueBold = false,
  ) => {
    writeAt(x, textY, label, { bold: true })
    const afterLabel = x + doc.getTextWidth(label) + gap
    writeAt(afterLabel, textY, value, { bold: valueBold })
    return afterLabel + doc.getTextWidth(value)
  }

  /** ป้าย+ค่าชิดขวา — วัดความกว้างก่อนวาด เพื่อไม่ให้ป้ายทับค่า */
  const writeRightPair = (rightX: number, textY: number, label: string, value: string, gap = 1.2) => {
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(infoFont)
    const labelW = doc.getTextWidth(label)
    doc.setFont('THSarabunNew', 'normal')
    const valueW = doc.getTextWidth(value)
    writeAt(rightX - valueW - gap - labelW, textY, label, { bold: true })
    writeAt(rightX - valueW, textY, value)
  }

  // เส้นคั่นแบบ HTML: เส้นบนครั้งเดียว แล้วเส้นล่างทุกแถว
  let infoStarted = false
  const drawInfoRow = (render: (textY: number) => void) => {
    if (!infoStarted) {
      drawHRule(y)
      infoStarted = true
    }
    render(y + infoRowH / 2)
    y += infoRowH
    drawHRule(y)
  }

  const drawCheckbox = (x: number, textY: number, checked: boolean, label: string) => {
    const size = px(layout.checkboxSizePx)
    const gap = px(layout.checkboxGapPx)
    drawJsPdfCheckbox(doc, x, textY, size, checked, { strokeRgb: BORDER, boxStroke: borderW })
    const labelX = x + size + gap
    writeAt(labelX, textY, label)
    return labelX + doc.getTextWidth(label) + px(4)
  }

  const colX = (weights: number[], index: number) => {
    const total = weights.reduce((a, b) => a + b, 0)
    let x = box.left
    for (let i = 0; i < index; i += 1) x += box.width * (weights[i] / total)
    return x
  }

  const colW = (weights: number[], index: number) => {
    const total = weights.reduce((a, b) => a + b, 0)
    return box.width * (weights[index] / total)
  }

  // 1. Doc mark — พิกัดจากขอบหน้ากระดาษ (เหมือน HTML absolute)
  const markX = PAGE_W - px(layout.docMarkRightPx)
  const markY = px(layout.docMarkTopPx)
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.docMarkFontPx))
  setText(doc)
  doc.text('ปพ.5', markX, markY, { align: 'right', baseline: 'top' })
  doc.text(PP5_SUBJECT_PAGE_MARK, markX, markY + px(layout.docMarkLineGapPx), { align: 'right', baseline: 'top' })

  // 2. Centered logo + title
  let y = box.top + px(layout.logoOffsetYPx)
  const logoSize = px(layout.logoSizePx)
  const logoX = box.left + (box.width - logoSize) / 2 + px(layout.logoOffsetXPx)
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', logoX, y, logoSize, logoSize)
    } catch {
      const cx = logoX + logoSize / 2
      const cy = y + logoSize / 2
      setStroke(doc, BORDER, borderW)
      doc.circle(cx, cy, logoSize / 2, 'S')
      doc.setFont('THSarabunNew', 'bold')
      doc.setFontSize(14)
      setText(doc)
      doc.text(data.school?.name?.slice(0, 2) || 'รร', cx, cy, { align: 'center', baseline: 'middle' })
    }
  } else {
    const cx = logoX + logoSize / 2
    const cy = y + logoSize / 2
    setStroke(doc, BORDER, borderW)
    doc.circle(cx, cy, logoSize / 2, 'S')
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(14)
    setText(doc)
    doc.text(data.school?.name?.slice(0, 2) || 'รร', cx, cy, { align: 'center', baseline: 'middle' })
  }
  y += logoSize + px(layout.logoGapPx)

  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  doc.text('แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน', box.left + box.width / 2, y, { align: 'center', baseline: 'top' })
  y += pxToMm96(layout.fontH1Px) * 0.9 + px(layout.headerGapPx)

  // 3. Info block — horizontal rules between rows, no vertical lines
  y += px(layout.infoTopGapPx)
  doc.setFontSize(infoFont)

  drawInfoRow(textY => {
    // HTML: โรงเรียน{name} (ไม่มีช่องว่าง) + อำเภอ {district} — ทั้งแถวตัวหนา
    let x = writeLabelValue(box.left, textY, 'โรงเรียน', data.school?.name || '-', 0.2, true)
    x += px(10)
    writeLabelValue(x, textY, 'อำเภอ', data.school?.district || '-', 1.2, true)
    writeAt(box.right, textY, schoolOfficeLine(data), { align: 'right', bold: true, maxW: box.width * 0.42 })
  })

  const classWeights = [1.35, 0.75, 0.85, 1]
  const centeredLabelValue = (centerX: number, textY: number, label: string, value: string) => {
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(infoFont)
    const labelW = doc.getTextWidth(label)
    doc.setFont('THSarabunNew', 'normal')
    const valueW = doc.getTextWidth(value)
    const totalW = labelW + 1.2 + valueW
    writeLabelValue(centerX - totalW / 2, textY, label, value)
  }

  drawInfoRow(textY => {
    // คอลัมน์ 1: ชั้น + ห้อง ติดกันซ้าย (แบบ HTML)
    let x = writeLabelValue(
      colX(classWeights, 0),
      textY,
      'ชั้น',
      data.classroom ? classroomLevelLabel(data.classroom.level) : '-',
    )
    x += px(6)
    writeLabelValue(x, textY, 'ห้อง', String(data.classroom?.room || '-'))

    // คอลัมน์ 2–3: กึ่งกลาง
    const c1 = colX(classWeights, 1) + colW(classWeights, 1) / 2
    if (term === 0) {
      writeAt(c1, textY, 'สรุปทั้งปี', { align: 'center', bold: true })
    } else {
      centeredLabelValue(c1, textY, 'ภาคเรียนที่', String(term))
    }
    centeredLabelValue(
      colX(classWeights, 2) + colW(classWeights, 2) / 2,
      textY,
      'ปีการศึกษา',
      String(data.academicYear?.year_be || '-'),
    )

    // คอลัมน์ 4: ชิดขวา
    const hoursRight = colX(classWeights, 3) + colW(classWeights, 3)
    writeRightPair(hoursRight, textY, 'เวลาเรียน', `${hoursWeek || '-'} ชม./สัปดาห์`)
  })

  if (isPrimary) {
    const metaWeights = [1, 1]
    drawInfoRow(textY => {
      writeLabelValue(colX(metaWeights, 0), textY, 'กลุ่มสาระการเรียนรู้', subject.subject.subject_group || '-')
      const rowRight = colX(metaWeights, 1) + colW(metaWeights, 1)
      const checkSize = px(layout.checkboxSizePx)
      const checkGap = px(layout.checkboxGapPx)
      const itemGap = px(4)
      doc.setFont('THSarabunNew', 'normal')
      doc.setFontSize(infoFont)
      const itemWidth = (label: string) => checkSize + checkGap + doc.getTextWidth(label)
      let x = rowRight - itemWidth('เพิ่มเติม')
      drawCheckbox(x, textY, isElective, 'เพิ่มเติม')
      x -= itemGap + itemWidth('พื้นฐาน')
      drawCheckbox(x, textY, !isElective, 'พื้นฐาน')
      doc.setFont('THSarabunNew', 'bold')
      doc.setFontSize(infoFont)
      const metaLabel = 'สาระการเรียนรู้'
      x -= itemGap + doc.getTextWidth(metaLabel)
      writeAt(x, textY, metaLabel, { bold: true })
    })

    drawInfoRow(textY => {
      let x = box.left
      writeAt(x, textY, 'ระดับชั้น', { bold: true })
      x += doc.getTextWidth('ระดับชั้น') + px(12)
      x = drawCheckbox(x, textY, isPrimary, 'ประถมศึกษา')
      drawCheckbox(x, textY, isSecondary, 'มัธยมศึกษา')
    })
  }

  const twoColWeights = [1, 1]
  drawInfoRow(textY => {
    const subjectX = colX(twoColWeights, 0)
    let x = writeLabelValue(subjectX, textY, 'รายวิชา', subject.subject.name || '-')
    writeAt(x + 1.5, textY, `(${subject.subject.code || '-'})`)
    const creditsRight = colX(twoColWeights, 1) + colW(twoColWeights, 1)
    writeRightPair(creditsRight, textY, 'หน่วยกิต', `${subject.subject.credits ?? '-'} หน่วย`)
  })

  drawInfoRow(textY => {
    writeLabelValue(colX(twoColWeights, 0), textY, 'ครูผู้สอน', subject.teacher_name || '-')
    const colRight = colX(twoColWeights, 1) + colW(twoColWeights, 1)
    const label = 'ครูที่ปรึกษา'
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(infoFont)
    const labelW = doc.getTextWidth(label)
    doc.setFont('THSarabunNew', 'normal')
    const fittedValue = fitText(doc, homeroomTeacherLine(data.classroom), Math.max(8, colW(twoColWeights, 1) - labelW - 1.2))
    writeRightPair(colRight, textY, label, fittedValue)
  })

  // 4. Grade summary table
  y += layout.tableTopMm
  const noteW = box.width * (layout.gradeNoteColPct / 100)
  const totalLabelW = box.width * (layout.gradeTotalColPct / 100)
  const gradeW = (box.width - totalLabelW - noteW) / SUBJECT_COVER_GRADE_COLUMNS.length
  const colWidths = [totalLabelW, ...SUBJECT_COVER_GRADE_COLUMNS.map(() => gradeW), noteW]
  const levelW = gradeW * SUBJECT_COVER_GRADE_LEVEL_COLUMNS.length
  const resultW = gradeW * SUBJECT_COVER_GRADE_RESULT_COLUMNS.length

  drawCell(doc, box.left, y, box.width, rowH, 'สรุปผลการเรียน', { bold: true, fontSize: bannerFont, ...cellOpts })
  y += rowH

  drawCell(doc, box.left, y, totalLabelW, rowH * 2, 'จำนวนนักเรียน\nทั้งหมด', {
    bold: true,
    fontSize: tableFont,
    noFit: true,
    ...cellOpts,
  })
  drawCell(doc, box.left + totalLabelW, y, levelW, rowH, 'ระดับผลการเรียน', { bold: true, fontSize: tableFont, ...cellOpts })
  drawCell(doc, box.left + totalLabelW + levelW, y, resultW, rowH, 'ผลการเรียน', { bold: true, fontSize: tableFont, ...cellOpts })
  drawCell(doc, box.left + totalLabelW + levelW + resultW, y, noteW, rowH * 2, 'หมายเหตุ', { bold: true, fontSize: tableFont, ...cellOpts })
  y += rowH

  let gx = box.left + totalLabelW
  for (const column of SUBJECT_COVER_GRADE_COLUMNS) {
    drawCell(doc, gx, y, gradeW, rowH, column.label, { bold: true, fontSize: tableFont, ...cellOpts })
    gx += gradeW
  }
  y += rowH

  const countCells = [
    String(studentsTotal),
    ...SUBJECT_COVER_GRADE_COLUMNS.map(c => gradeCountDisplay(gradeCounts[c.key] || 0)),
    '',
  ]
  const pctCells = [
    'คิดเป็นร้อยละ',
    ...SUBJECT_COVER_GRADE_COLUMNS.map(c => coverPercent(gradeCounts[c.key] || 0, studentsTotal)),
    '',
  ]
  for (const row of [countCells, pctCells]) {
    let cx = box.left
    row.forEach((cell, i) => {
      drawCell(doc, cx, y, colWidths[i], rowH, cell, { fontSize: tableSmallFont, ...cellOpts })
      cx += colWidths[i]
    })
    y += rowH
  }

  // 5. Evaluation summary tables — side by side
  y += px(layout.summaryGapPx)
  const evalGap = px(layout.evalGapPx)
  const evalW = (box.width - evalGap) / 2
  const firstPct = layout.evalFirstColPct / 100
  const restPct = (1 - firstPct) / 4
  const evalCols = [evalW * firstPct, evalW * restPct, evalW * restPct, evalW * restPct, evalW * restPct]
  const evalHeaders = ['จำนวนนักเรียนทั้งหมด', 'ดีเยี่ยม', 'ดี', 'ผ่าน', 'ปรับปรุง']

  const drawEvalTable = (bx: number, title: string, summary: typeof character) => {
    let ey = y
    drawCell(doc, bx, ey, evalW, rowH, title, { bold: true, fontSize: tableSmallFont, ...cellOpts })
    ey += rowH
    evalHeaders.forEach((header, i) => {
      const ox = bx + evalCols.slice(0, i).reduce((a, b) => a + b, 0)
      drawCell(doc, ox, ey, evalCols[i], rowH, header, { bold: true, fontSize: tableSmallFont, ...cellOpts })
    })
    ey += rowH
    const counts = [
      String(summary.total),
      gradeCountDisplay(summary.excellent),
      gradeCountDisplay(summary.good),
      gradeCountDisplay(summary.pass),
      gradeCountDisplay(summary.fail),
    ]
    counts.forEach((value, i) => {
      const ox = bx + evalCols.slice(0, i).reduce((a, b) => a + b, 0)
      drawCell(doc, ox, ey, evalCols[i], rowH, value, { fontSize: tableSmallFont, ...cellOpts })
    })
    ey += rowH
    const percents = [
      'คิดเป็นร้อยละ',
      coverPercent(summary.excellent, summary.total),
      coverPercent(summary.good, summary.total),
      coverPercent(summary.pass, summary.total),
      coverPercent(summary.fail, summary.total),
    ]
    percents.forEach((value, i) => {
      const ox = bx + evalCols.slice(0, i).reduce((a, b) => a + b, 0)
      drawCell(doc, ox, ey, evalCols[i], rowH, value, { fontSize: tableSmallFont, ...cellOpts })
    })
  }

  drawEvalTable(box.left, 'สรุปผลการประเมินคุณลักษณะอันพึงประสงค์', character)
  drawEvalTable(box.left + evalW + evalGap, 'สรุปผลการประเมินอ่าน คิด วิเคราะห์เขียน', reading)
  y += rowH * 4 + px(layout.approvalGapPx)

  // 6. Signature / approval — โครง 2×2 + กล่องอนุมัติแบบพรีวิว HTML
  const sigFont = ptFromCssPx(layout.fontSignaturePx)
  const sigLineFont = ptFromCssPx(Math.max(layout.fontSignaturePx, 18))
  const sigImgH = layout.sigImageHeightMm
  const SIGN_DOTS = '............................................................'
  const lineH = pxToMm96(layout.fontSignaturePx) * 1.25

  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(sigFont)
  setText(doc)
  doc.text('การตรวจสอบและอนุมัติผลการเรียน', box.left + box.width / 2, y, { align: 'center', baseline: 'top' })
  y += lineH + px(10)

  const viceDirectorName = data.school?.vice_director_name?.trim()
  const directorPos = directorActingPositionLine(data.school)
  const directorName = directorDisplayName(data.school)
  const schoolLine = directorSchoolLine(data.school)

  // HTML: gap 18px 64px, padding 0 48px — ย่ออัตโนมัติถ้าพื้นที่หน้าไม่พอ
  const pageBottom = PAGE_H - layout.padBottomMm
  let colGap = px(64)
  let rowGap = Math.max(px(18), layout.sigBlockGapMm)
  let sidePad = px(48)
  let blockH = Math.max(px(72), sigImgH + layout.sigNameGapMm + lineH * 2 + 5)
  const directorBoxH = viceDirectorName
    ? Math.max(px(108), sigImgH + layout.sigNameGapMm + lineH * 4 + px(52))
    : px(132)
  const neededH = blockH * 2 + rowGap + layout.sigAfterBlocksMm + directorBoxH
  const availH = pageBottom - y
  if (neededH > availH && availH > 40) {
    const scale = availH / neededH
    colGap = Math.max(px(24), colGap * scale)
    rowGap = Math.max(px(6), rowGap * scale)
    sidePad = Math.max(px(16), sidePad * scale)
    blockH = Math.max(px(48), blockH * scale)
  }
  const sigColW = (box.width - sidePad * 2 - colGap) / 2
  const sigBlocks = [
    { url: signatures.teacher, name: subject.teacher_name || '—', line: 'ครูผู้สอน' },
    {
      url: signatures.subject_head,
      name: subjectGroupHeadName(data, subject.subject.subject_group),
      line: subjectGroupHeadPositionLine(subject.subject.subject_group),
    },
    { url: signatures.measurement_head, name: data.school?.measurement_head_name || '—', line: 'หัวหน้างานวัดและประเมินผล' },
    { url: signatures.academic_head, name: data.school?.academic_head_name || '—', line: 'หัวหน้าฝ่ายวิชาการ' },
  ]

  const drawSignLine = (cx: number, by: number, bw: number, url?: string | null) => {
    doc.setFont('THSarabunNew', 'normal')
    doc.setFontSize(sigLineFont)
    setText(doc)
    const prefix = 'ลงชื่อ '
    const prefixW = doc.getTextWidth(prefix)
    const dots = fitText(doc, SIGN_DOTS, Math.max(18, bw * 0.72 - prefixW))
    const totalW = prefixW + doc.getTextWidth(dots)
    const startX = cx - totalW / 2
    const baseline = by + 3.2
    doc.text(prefix, startX, baseline)
    if (url) {
      try {
        const imgW = Math.min(26, bw * 0.45)
        doc.addImage(url, 'JPEG', cx - imgW / 2, by - 0.8, imgW, sigImgH)
      } catch {
        doc.text(dots, startX + prefixW, baseline)
      }
    } else {
      doc.text(dots, startX + prefixW, baseline)
    }
    return url ? Math.max(baseline, by - 0.8 + sigImgH) : baseline
  }

  const drawSigBlock = (bx: number, by: number, bw: number, block: (typeof sigBlocks)[0]) => {
    const cx = bx + bw / 2
    const contentBottom = drawSignLine(cx, by, bw, block.url)
    const nameY = contentBottom + layout.sigNameGapMm
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(sigFont)
    setText(doc)
    doc.text(`( ${block.name} )`, cx, nameY, { align: 'center' })
    doc.setFont('THSarabunNew', 'normal')
    doc.text(fitText(doc, block.line, bw - 2), cx, nameY + lineH, { align: 'center' })
  }

  for (let i = 0; i < 4; i += 1) {
    const col = i % 2
    const row = Math.floor(i / 2)
    const bx = box.left + sidePad + col * (sigColW + colGap)
    const by = y + row * (blockH + rowGap)
    drawSigBlock(bx, by, sigColW, sigBlocks[i])
  }
  y += blockH * 2 + rowGap + layout.sigAfterBlocksMm

  const directorDecisionRaw = String(data.documentSignatures?.director_decision || '').trim()
  const directorDecision = directorDecisionRaw
    || (data.documentSignatures?.director ? 'อนุมัติ' : '')
  const drawCheck = (cx: number, cy: number, label: string, checked = false) => {
    const size = px(layout.checkboxSizePx) * 0.95
    drawJsPdfCheckbox(doc, cx, cy, size, checked, { strokeRgb: BORDER, boxStroke: 0.35 })
    doc.setFont('THSarabunNew', 'normal')
    doc.setFontSize(sigFont)
    setText(doc)
    doc.text(label, cx + size + px(6), cy, { baseline: 'middle' })
    return cx + size + px(6) + doc.getTextWidth(label)
  }

  if (viceDirectorName) {
    const halfGap = Math.max(px(16), colGap * 0.75)
    const halfW = (box.width - sidePad * 2 - halfGap) / 2
    const boxH = directorBoxH
    const leftX = box.left + sidePad
    const rightX = leftX + halfW + halfGap
    if (y + boxH > pageBottom) y = Math.max(box.top, pageBottom - boxH)

    setStroke(doc, BORDER, borderW)
    doc.rect(leftX, y, halfW, boxH, 'S')
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(sigFont)
    setText(doc)
    doc.text('เสนอเพื่อพิจารณา', leftX + halfW / 2, y + px(12), { align: 'center' })
    const leftSigBottom = drawSignLine(leftX + halfW / 2, y + px(20), halfW - 6, signatures.vice_director)
    const leftNameY = leftSigBottom + layout.sigNameGapMm
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(sigFont)
    setText(doc)
    doc.text(`( ${viceDirectorName} )`, leftX + halfW / 2, leftNameY, { align: 'center' })
    doc.setFont('THSarabunNew', 'normal')
    doc.text(
      fitText(doc, `รองผู้อำนวยการโรงเรียน${data.school?.name || '-'}`, halfW - 6),
      leftX + halfW / 2,
      leftNameY + lineH,
      { align: 'center' },
    )

    setStroke(doc, BORDER, borderW)
    doc.rect(rightX, y, halfW, boxH, 'S')
    const optCenter = rightX + halfW / 2
    doc.setFont('THSarabunNew', 'normal')
    doc.setFontSize(sigFont)
    setText(doc)
    const checkSize = px(layout.checkboxSizePx) * 0.95
    const opt1Label = 'ไม่อนุมัติ'
    const opt1W = checkSize + px(6) + doc.getTextWidth(opt1Label)
    drawCheck(optCenter - opt1W / 2, y + px(14), opt1Label, directorDecision === 'ไม่อนุมัติ')
    const opt2Fitted = fitText(doc, 'อนุมัติ เมื่อวันที่...........................................', halfW - 10)
    const opt2W = checkSize + px(6) + doc.getTextWidth(opt2Fitted)
    drawCheck(optCenter - opt2W / 2, y + px(26), opt2Fitted, directorDecision === 'อนุมัติ')

    const dirSigBottom = drawSignLine(optCenter, y + px(40), halfW - 6, signatures.director)
    const dirNameY = dirSigBottom + layout.sigNameGapMm
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(sigFont)
    setText(doc)
    doc.text(`( ${directorName} )`, optCenter, dirNameY, { align: 'center' })
    doc.setFont('THSarabunNew', 'normal')
    let dy = dirNameY + lineH
    if (directorPos) {
      doc.text(fitText(doc, directorPos, halfW - 6), optCenter, dy, { align: 'center' })
      dy += lineH
    }
    doc.text(fitText(doc, schoolLine, halfW - 6), optCenter, dy, { align: 'center' })
  } else {
    const boxH = directorBoxH
    if (y + boxH > pageBottom) y = Math.max(box.top, pageBottom - boxH)
    setStroke(doc, BORDER, borderW)
    doc.rect(box.left, y, box.width, boxH, 'S')

    const qrSize = px(64)
    const qrX = box.right - px(12) - qrSize
    const qrLabelH = px(22)
    const qrY = y + boxH - px(10) - qrLabelH - qrSize

    const mainLeft = box.left + px(12)
    const mainRight = box.right - px(78)
    const centerX = (mainLeft + mainRight) / 2

    // อนุมัติ / ไม่อนุมัติ แถวเดียว
    doc.setFont('THSarabunNew', 'normal')
    doc.setFontSize(sigFont)
    setText(doc)
    const optY = y + px(16)
    const gap = px(28)
    const approveLabel = 'อนุมัติ'
    const rejectLabel = 'ไม่อนุมัติ'
    const checkSize = px(layout.checkboxSizePx) * 0.95
    const approveW = checkSize + px(6) + doc.getTextWidth(approveLabel)
    const rejectW = checkSize + px(6) + doc.getTextWidth(rejectLabel)
    const optsW = approveW + gap + rejectW
    let ox = centerX - optsW / 2
    ox = drawCheck(ox, optY, approveLabel, directorDecision === 'อนุมัติ') + gap
    drawCheck(ox, optY, rejectLabel, directorDecision === 'ไม่อนุมัติ')

    const dirSigBottom = drawSignLine(centerX, y + px(36), mainRight - mainLeft, signatures.director)
    let dy = dirSigBottom + layout.sigNameGapMm
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(sigFont)
    setText(doc)
    doc.text(`( ${directorName} )`, centerX, dy, { align: 'center' })
    dy += lineH
    doc.setFont('THSarabunNew', 'normal')
    if (directorPos) {
      doc.text(fitText(doc, directorPos, mainRight - mainLeft), centerX, dy, { align: 'center' })
      dy += lineH
    }
    doc.text(fitText(doc, schoolLine, mainRight - mainLeft), centerX, dy, { align: 'center' })
    dy += lineH + px(8)
    doc.setFontSize(sigLineFont)
    doc.text('............ / ............ / ............', centerX, dy, { align: 'center' })

    // QR / Digital Reference — ลิงก์ Google Drive ของไฟล์ (หรือหน้าตรวจถ้ายังไม่มีไฟล์)
    if (ctx.qrPng) {
      try {
        doc.addImage(ctx.qrPng, 'PNG', qrX, qrY, qrSize, qrSize)
      } catch {
        setStroke(doc, BORDER, 0.35)
        doc.rect(qrX, qrY, qrSize, qrSize, 'S')
      }
    } else {
      setStroke(doc, BORDER, 0.35)
      doc.rect(qrX, qrY, qrSize, qrSize, 'S')
      setStroke(doc, [160, 160, 160], 0.2)
      for (let i = 1; i < 4; i += 1) {
        doc.line(qrX + (qrSize * i) / 4, qrY, qrX + (qrSize * i) / 4, qrY + qrSize)
        doc.line(qrX, qrY + (qrSize * i) / 4, qrX + qrSize, qrY + (qrSize * i) / 4)
      }
    }
    doc.setFont('THSarabunNew', 'normal')
    doc.setFontSize(ptFromCssPx(11))
    setText(doc)
    doc.text('ตรวจสอบเอกสาร', qrX + qrSize / 2, qrY + qrSize + px(3), { align: 'center', baseline: 'top' })
    doc.setFontSize(ptFromCssPx(10))
    const refLabel = data.digitalReference?.code || 'Digital Reference'
    doc.text(fitText(doc, refLabel, qrSize + 8), qrX + qrSize / 2, qrY + qrSize + px(3) + px(12), {
      align: 'center',
      baseline: 'top',
    })
  }
}

function drawCriteriaPages(ctx: DrawCtx, pageNumberStart: number) {
  const { doc, data, term, layouts } = ctx
  const layout = layouts.criteria
  const box = contentBox(layout)
  const font = ptFromCssPx(layout.criteriaFontPx)
  const rowH = 7

  const charTopics = characterCriteriaTopics(data.characterSettings)
  let pageNum = pageNumberStart
  drawPageMark(doc, pageNum)
  let y = drawSubjectHead(doc, ctx, layout, 'คุณลักษณะอันพึงประสงค์', term, box.top, { includeSubjectLine: false })
  const topicW = box.width * 0.38
  const behaviorW = box.width - topicW
  drawCell(doc, box.left, y, topicW, rowH, 'คุณลักษณะอันพึงประสงค์', { fontSize: font, bold: true })
  drawCell(doc, box.left + topicW, y, behaviorW, rowH, 'พฤติกรรมบ่งชี้', { fontSize: font, bold: true })
  y += rowH
  for (const topic of charTopics) {
    const behaviors = topic.behaviors.length > 0 ? topic.behaviors : [{ shortLabel: '', label: '' }]
    behaviors.forEach((behavior, bi) => {
      if (y + rowH > PAGE_H - layout.padBottomMm) {
        doc.addPage()
        pageNum += 1
        drawPageMark(doc, pageNum)
        y = box.top
      }
      if (bi === 0) {
        drawCell(doc, box.left, y, topicW, rowH * behaviors.length, `${topic.shortLabel}. ${topic.label}\n(คะแนน) ${topic.maxScore}`, {
          fontSize: font - 1, align: 'left', noFit: true,
        })
      }
      drawCell(doc, box.left + topicW, y, behaviorW, rowH, behavior.label ? `${behavior.shortLabel} ${behavior.label}` : '', {
        fontSize: font - 1, align: 'left',
      })
      y += rowH
    })
  }

  doc.addPage()
  pageNum += 1
  drawPageMark(doc, pageNum)
  y = drawSubjectHead(doc, ctx, layout, 'อ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย', term, box.top, { includeSubjectLine: false })

  // โครงหัว 2 แถวแบบพรีวิว HTML: มาตรฐาน | ตัวชี้วัด | ระดับคุณภาพ (colspan 4)
  const stdW = box.width * 0.16
  const indW = box.width * 0.28
  const rubW = (box.width - stdW - indW) / 4
  const headH1 = Math.max(5.2, rowH * 0.85)
  const headH2 = Math.max(7.2, rowH * 1.15)
  const rubricKeys = ['3', '2', '1', '0'] as const
  const rubricHeads = ['3\n(ดีเยี่ยม)', '2\n(ดี)', '1\n(ผ่านเกณฑ์)', '0\n(ปรับปรุง)']
  const bodyFont = Math.max(8, font - 1)
  const rubricFont = Math.max(7.5, font - 2)

  drawCell(doc, box.left, y, stdW, headH1 + headH2, 'มาตรฐาน', { fontSize: font, bold: true })
  drawCell(doc, box.left + stdW, y, indW, headH1 + headH2, 'ตัวชี้วัด', { fontSize: font, bold: true })
  drawCell(doc, box.left + stdW + indW, y, rubW * 4, headH1, 'ระดับคุณภาพ', { fontSize: font, bold: true })
  rubricHeads.forEach((label, i) => {
    drawWrappedCell(doc, box.left + stdW + indW + i * rubW, y + headH1, rubW, headH2, label, {
      align: 'center',
      vAlign: 'middle',
      bold: true,
      fontSize: font - 1,
      padMm: 0.6,
    })
  })
  y += headH1 + headH2

  const readTopics = readingCriteriaTopics(data.readingSettings)
  const measureH = (text: string, width: number, fontSize: number, minH: number) => {
    doc.setFont('THSarabunNew', 'normal')
    doc.setFontSize(fontSize)
    const lines = wrapLines(doc, text, Math.max(2, width - 2.2))
    const gap = lineGapMmFromPt(fontSize)
    return Math.max(minH, lines.length * gap + 2.4)
  }

  for (const topic of readTopics) {
    type Ind = {
      shortLabel: string
      label: string
      rubricLevels?: Partial<Record<'0' | '1' | '2' | '3', string>>
    }
    const indicators: Ind[] = topic.indicators.length > 0
      ? topic.indicators
      : [{ shortLabel: '', label: '', rubricLevels: {} }]

    const rowHeights = indicators.map(indicator => {
      const indText = indicator.label ? `${indicator.shortLabel} ${indicator.label}` : ''
      let h = measureH(indText, indW, bodyFont, 10)
      for (const key of rubricKeys) {
        const rubricText = indicator.rubricLevels?.[key] || ''
        h = Math.max(h, measureH(rubricText, rubW, rubricFont, 10))
      }
      return h
    })
    const topicH = rowHeights.reduce((a, b) => a + b, 0)

    if (y + topicH > PAGE_H - layout.padBottomMm) {
      doc.addPage()
      pageNum += 1
      drawPageMark(doc, pageNum)
      y = box.top
    }

    // มาตรฐาน (rowspan) — กึ่งกลางแนวตั้ง/นอน แบบตัวอย่าง
    drawWrappedCell(
      doc,
      box.left,
      y,
      stdW,
      topicH,
      `${topic.shortLabel}. ${topic.label}\n(คะแนน) ${topic.maxScore}`,
      { align: 'center', vAlign: 'middle', bold: true, fontSize: bodyFont, padMm: 1 },
    )

    let rowY = y
    indicators.forEach((indicator, ii) => {
      const rh = rowHeights[ii]
      const indText = indicator.label ? `${indicator.shortLabel} ${indicator.label}` : ''
      drawWrappedCell(doc, box.left + stdW, rowY, indW, rh, indText, {
        align: 'left',
        vAlign: 'top',
        bold: true,
        fontSize: bodyFont,
      })
      rubricKeys.forEach((key, ri) => {
        const rubricText = indicator.rubricLevels?.[key] || ''
        drawWrappedCell(doc, box.left + stdW + indW + ri * rubW, rowY, rubW, rh, rubricText, {
          align: 'left',
          vAlign: 'top',
          fontSize: rubricFont,
        })
      })
      rowY += rh
    })
    y = rowY
  }
  return pageNum
}

function drawHourlySummaryPage(
  ctx: DrawCtx,
  activeTerm: 1 | 2,
  students: ReportStudent[],
  pageNumber: number,
) {
  const { doc, data, subject, layouts } = ctx
  const layout = layouts.attendance
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  const isSecondary = isSecondaryClassLevel(data.classroom?.level)
  const range = termDateRange(data.academicYear, activeTerm)
  const calendar = reportSchoolCalendar(data)
  type HourlyRecord = Parameters<typeof buildHourlyStatusMap>[0] extends (infer U)[] | undefined ? U : never
  const hourlyRecords = data.hourlyAttendanceRecords as HourlyRecord[]
  const recordMap = buildHourlyStatusMap(hourlyRecords, subject.class_subject_id, activeTerm)
  const teachingWeeks = subjectHourlyTermWeeks(range.start, range.end, calendar)
  const hpw = subjectHourlyHpw(subject.subject.hours_per_year || 0, teachingWeeks)
  const secondaryCalendar = isSecondary
    ? buildSubjectCalendarWeeks(range.start, range.end, calendar, hpw, holidayNameMap(data.holidays))
    : null
  const totalHours = isSecondary ? (secondaryCalendar?.totalHours || 0) : 0

  let y = box.top
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  const title = `สรุปเวลาเรียนรายวิชา ${isSecondary
    ? `ชั้น ${classroomLevelLabel(data.classroom?.level || '')} ห้อง ${data.classroom?.room || '-'}`
    : subjectHourlyClassLine(data.classroom)} ภาคเรียนที่ ${activeTerm}`
  doc.text(fitText(doc, title, box.width), box.left + box.width / 2, y, { align: 'center' })
  y += 6
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  const sub = `รหัสวิชา ${subject.subject.code}   รายวิชา ${subject.subject.name}   ภาคเรียนที่ ${activeTerm}   ปีการศึกษา ${data.academicYear?.year_be || '-'}${isSecondary && totalHours > 0 ? `   เวลาเรียนทั้งหมด ${totalHours} ชั่วโมง` : ''}`
  doc.text(fitText(doc, sub, box.width), box.left + box.width / 2, y, { align: 'center' })
  y += 6

  const rowH = rowHeightMm(layout)
  const rowCount = pp5AttendanceBodyRows(students.length, layout, 1)
  const cols = [8, 18, 52, 14, 14, 14, 14, 12, 16]
  const headers = ['เลขที่', 'รหัสประจำตัว', 'ชื่อ - สกุล', isSecondary ? 'มาเรียน' : 'มา', 'ขาด', 'ลา', 'เต็ม', '%', 'สิทธิ์สอบ']
  const body: string[][] = [headers]
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    if (!student) {
      body.push(Array(headers.length).fill(''))
      continue
    }
    const summary = isSecondary && secondaryCalendar
      ? studentSecondaryHourlySummary(secondaryCalendar.weeks, recordMap, student.id)
      : studentHourlySummary(teachingWeeks, hpw, recordMap, student.id)
    const fullHours = summary ? (isSecondary ? totalHours : summary.total) : ''
    body.push([
      String(student.student_number || i + 1),
      student.student_code || '',
      studentName(student),
      summary ? String(summary.present) : '',
      summary ? String(summary.absent) : '',
      summary ? String(summary.leave + summary.sick) : '',
      summary ? String(fullHours) : '',
      summary ? (isSecondary ? String(Math.round(summary.percent)) : summary.percent.toFixed(1)) : '',
      summary ? hourlyExamEligibility(summary.percent) : '',
    ])
  }
  drawTableGrid(doc, box.left, y, cols, body, { rowH, fontSize: ptFromCssPx(layout.fontTablePx) - 2, headerRows: 1, nameCol: 2 })
}

function drawPrimaryWeeklyPage(
  ctx: DrawCtx,
  activeTerm: 1 | 2,
  students: ReportStudent[],
  pageWeeks: ReturnType<typeof subjectHourlyTermWeeks>,
  showSummary: boolean,
  pageNumber: number,
) {
  const { doc, data, subject, layouts } = ctx
  const layout = layouts.attendance
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)

  const range = termDateRange(data.academicYear, activeTerm)
  const calendar = reportSchoolCalendar(data)
  const allWeeks = subjectHourlyTermWeeks(range.start, range.end, calendar)
  const hpw = subjectHourlyHpw(subject.subject.hours_per_year || 0, allWeeks)
  const slotsPerWeek = displaySlotsPerWeek(true, hpw)
  type HourlyRecord = Parameters<typeof buildHourlyStatusMap>[0] extends (infer U)[] | undefined ? U : never
  const hourlyRecords = data.hourlyAttendanceRecords as HourlyRecord[]
  const recordMap = buildHourlyStatusMap(hourlyRecords, subject.class_subject_id, activeTerm)

  let y = box.top
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  doc.text(`แบบบันทึกเวลาเรียนรายวิชา ${subjectHourlyClassLine(data.classroom)} ภาคเรียนที่ ${activeTerm}`, box.left + box.width / 2, y, { align: 'center' })
  y += 5
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  doc.text(`รหัสวิชา ${subject.subject.code}   รายวิชา ${subject.subject.name}   ปีการศึกษา ${data.academicYear?.year_be || '-'}`, box.left + box.width / 2, y, { align: 'center' })
  y += 5

  const rowH = rowHeightMm(layout)
  const headH = Math.max(4, rowH * 0.75)
  const rowCount = pp5AttendanceBodyRows(students.length, layout, 3)
  const fixedCols = [7, 14, 36]
  const summaryCols = showSummary ? [7, 7, 7, 8] : []
  const summaryW = summaryCols.reduce((a, b) => a + b, 0)
  const fixedW = fixedCols.reduce((a, b) => a + b, 0)
  const slotW = Math.max(3.2, (box.width - fixedW - summaryW) / Math.max(1, pageWeeks.length * slotsPerWeek))
  const font = Math.max(5.5, ptFromCssPx(layout.fontNumberPx) - 1)
  const headFont = Math.max(6, font)
  const headerTop = y
  const headerTotalH = headH * 3

  drawCell(doc, box.left, headerTop, fixedCols[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont })
  drawCell(doc, box.left + fixedCols[0], headerTop, fixedCols[1], headerTotalH, 'เลข\nประจำตัว', { bold: true, fontSize: headFont - 0.5 })
  drawCell(doc, box.left + fixedCols[0] + fixedCols[1], headerTop, fixedCols[2], headerTotalH, 'ชื่อ - สกุล', { bold: true, fontSize: headFont })

  let cx = box.left + fixedW
  for (const week of pageWeeks) {
    const w = slotW * slotsPerWeek
    drawCell(doc, cx, headerTop, w, headH, `สัปดาห์ที่ ${week.weekNumber}`, { bold: true, fontSize: headFont - 0.5 })
    drawCell(doc, cx, headerTop + headH, w, headH, week.dateLabel || '', { bold: true, fontSize: Math.max(5, headFont - 1.5) })
    for (let i = 0; i < slotsPerWeek; i += 1) {
      drawCell(doc, cx + i * slotW, headerTop + headH * 2, slotW, headH, String(primaryGlobalSlotNumber(week.weekNumber, i + 1)), {
        bold: true, fontSize: Math.max(5, headFont - 1),
      })
    }
    cx += w
  }

  if (showSummary) {
    const sx = box.left + fixedW + pageWeeks.length * slotsPerWeek * slotW
    const sumW = summaryCols.reduce((a, b) => a + b, 0)
    drawCell(doc, sx, headerTop, sumW, headH, 'สรุป (รวมทั้งภาค)', { bold: true, fontSize: Math.max(5.5, headFont - 1) })
    const labels = ['มา', 'ขาด', 'ลา', 'ร้อยละ']
    labels.forEach((label, i) => {
      const ox = sx + summaryCols.slice(0, i).reduce((a, b) => a + b, 0)
      drawCell(doc, ox, headerTop + headH, summaryCols[i], headH * 2, label, { bold: true, fontSize: headFont })
    })
  }

  y = headerTop + headerTotalH
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    const cy = y + i * rowH
    drawCell(doc, box.left, cy, fixedCols[0], rowH, student ? String(student.student_number || i + 1) : '', { fontSize: font })
    drawCell(doc, box.left + fixedCols[0], cy, fixedCols[1], rowH, student?.student_code || '', { fontSize: font - 0.5 })
    drawCell(doc, box.left + fixedCols[0] + fixedCols[1], cy, fixedCols[2], rowH, student ? studentName(student) : '', {
      fontSize: font, align: 'left',
    })
    let dx = box.left + fixedW
    for (const week of pageWeeks) {
      for (let slot = 1; slot <= slotsPerWeek; slot += 1) {
        const status = student
          ? resolveHourlyStatus(recordMap.get(hourlyCellKey(student.id, week.weekNumber, slot)))
          : undefined
        drawCell(doc, dx, cy, slotW, rowH, student ? hourlyStatusCellContent(status) : '', { fontSize: font })
        dx += slotW
      }
    }
    if (showSummary) {
      const summary = student ? studentHourlySummary(allWeeks, hpw, recordMap, student.id) : null
      const sx = box.left + fixedW + pageWeeks.length * slotsPerWeek * slotW
      const values = summary
        ? [String(summary.present), String(summary.absent), String(summary.leave + summary.sick), summary.percent.toFixed(1)]
        : ['', '', '', '']
      values.forEach((value, vi) => {
        const ox = sx + summaryCols.slice(0, vi).reduce((a, b) => a + b, 0)
        drawCell(doc, ox, cy, summaryCols[vi], rowH, value, { fontSize: font })
      })
    }
  }
}

function drawSecondaryWeeklyPage(
  ctx: DrawCtx,
  activeTerm: 1 | 2,
  students: ReportStudent[],
  pageWeeks: SubjectCalendarWeek[],
  allWeeks: SubjectCalendarWeek[],
  showSummary: boolean,
  totalHours: number,
  pageNumber: number,
) {
  const { doc, data, layouts } = ctx
  const layout = layouts.attendance
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)

  type HourlyRecord = Parameters<typeof buildHourlyStatusMap>[0] extends (infer U)[] | undefined ? U : never
  const hourlyRecords = data.hourlyAttendanceRecords as HourlyRecord[]
  const recordMap = buildHourlyStatusMap(hourlyRecords, ctx.subject.class_subject_id, activeTerm)
  const columns = pageWeeks.flatMap(week => week.days)

  let y = box.top
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  doc.text(`บันทึกเวลาเรียน ภาคเรียนที่ ${activeTerm}`, box.left + box.width / 2, y, { align: 'center' })
  y += 5
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  doc.text(
    `ชั้น ${classroomLevelLabel(data.classroom?.level || '')} ห้อง ${data.classroom?.room || '-'} ภาคเรียนที่ ${activeTerm} ปีการศึกษา ${data.academicYear?.year_be || '-'}`,
    box.left + box.width / 2,
    y,
    { align: 'center' },
  )
  y += 5

  const rowCount = pp5AttendanceBodyRows(students.length, layout, 5)
  const headH = 3.6
  const rowH = Math.min(rowHeightMm(layout), 4.8)
  const fixedCols = [6.5, 12, 26, 7]
  // HTML: รวมชม. colspan 2 + มาเรียน + ร้อยละ
  const summaryCols = showSummary ? [7, 7, 8, 8] : []
  const summaryW = summaryCols.reduce((a, b) => a + b, 0)
  const fixedW = fixedCols.reduce((a, b) => a + b, 0)
  const dayW = Math.max(2.6, (box.width - fixedW - summaryW) / Math.max(1, columns.length))
  const font = Math.max(5.5, ptFromCssPx(layout.fontNumberPx) - 2)
  const headFont = Math.max(5.5, font)

  const headerTop = y
  const headerTotalH = headH * 5
  drawCell(doc, box.left, headerTop, fixedCols[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont })
  drawCell(doc, box.left + fixedCols[0], headerTop, fixedCols[1], headerTotalH, 'เลขประจำตัว', { bold: true, fontSize: headFont - 0.5 })
  drawCell(doc, box.left + fixedCols[0] + fixedCols[1], headerTop, fixedCols[2], headerTotalH, 'ชื่อ - นามสกุล', { bold: true, fontSize: headFont })

  const labelX = box.left + fixedCols[0] + fixedCols[1] + fixedCols[2]
  const dayStartX = labelX + fixedCols[3]

  const headerLabels = ['สัปดาห์', 'เดือน', 'วัน', 'วันที่', 'ชั่วโมงที่']
  headerLabels.forEach((label, ri) => {
    drawCell(doc, labelX, headerTop + ri * headH, fixedCols[3], headH, label, { bold: true, fontSize: headFont - 0.5 })
  })

  let cx = dayStartX
  for (const week of pageWeeks) {
    const w = dayW * week.days.length
    drawCell(doc, cx, headerTop, w, headH, String(week.weekNumber), { bold: true, fontSize: headFont })
    drawCell(doc, cx, headerTop + headH, w, headH, subjectWeekMonthLabel(week), { bold: true, fontSize: headFont - 0.5 })
    cx += w
  }

  columns.forEach((day, index) => {
    const x = dayStartX + index * dayW
    const muted = day.isWeekend || (day.isHoliday && !day.slotInWeek)
    drawCell(doc, x, headerTop + headH * 2, dayW, headH, THAI_WEEKDAYS[day.dayOfWeek] || '', {
      bold: true, fontSize: headFont - 0.5, muted,
    })
    drawCell(doc, x, headerTop + headH * 3, dayW, headH, String(day.dayNumber), {
      bold: true, fontSize: headFont - 0.5, muted,
    })
    drawCell(doc, x, headerTop + headH * 4, dayW, headH, day.hourNumber ? String(day.hourNumber) : '', {
      bold: true, fontSize: headFont - 0.5, muted,
    })
  })

  if (showSummary) {
    const sx = dayStartX + columns.length * dayW
    drawCell(doc, sx, headerTop, summaryCols[0] + summaryCols[1], headerTotalH, `เวลาเรียนทั้งหมด\n${totalHours} ชั่วโมง`, {
      bold: true, fontSize: headFont - 1,
    })
    drawCell(doc, sx + summaryCols[0] + summaryCols[1], headerTop, summaryCols[2], headerTotalH, 'มาเรียน', { bold: true, fontSize: headFont })
    drawCell(doc, sx + summaryCols[0] + summaryCols[1] + summaryCols[2], headerTop, summaryCols[3], headerTotalH, 'ร้อยละ', { bold: true, fontSize: headFont })
  }

  y = headerTop + headerTotalH
  const bodyH = rowCount * rowH

  // วันหยุด/วันหยุดนักขัตฤกษ์ — ช่องเดียวสูงทั้งตารางแบบพรีวิว
  columns.forEach((day, di) => {
    const x = dayStartX + di * dayW
    if (day.isWeekend) {
      drawCell(doc, x, y, dayW, bodyH, 'วันหยุด\nเสาร์-\nอาทิตย์', {
        fontSize: Math.max(4.5, font - 1), muted: true, noFit: true,
      })
      return
    }
    if (day.isHoliday && !day.slotInWeek) {
      doc.setFont('THSarabunNew', 'normal')
      doc.setFontSize(Math.max(4.5, font - 1.5))
      const label = wrapLines(doc, day.holidayLabel || 'วันหยุด', Math.max(1.5, dayW - 0.6)).slice(0, 4).join('\n')
      drawCell(doc, x, y, dayW, bodyH, label, {
        fontSize: Math.max(4.5, font - 1.5), muted: true, noFit: true,
      })
    }
  })

  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    const cy = y + i * rowH
    drawCell(doc, box.left, cy, fixedCols[0], rowH, student ? String(student.student_number || i + 1) : '', { fontSize: font })
    drawCell(doc, box.left + fixedCols[0], cy, fixedCols[1], rowH, student?.student_code || '', { fontSize: font - 0.5 })
    drawCell(doc, box.left + fixedCols[0] + fixedCols[1], cy, fixedCols[2], rowH, student ? studentName(student) : '', {
      fontSize: font, align: 'left',
    })
    drawCell(doc, labelX, cy, fixedCols[3], rowH, '', { fontSize: font })

    columns.forEach((day, di) => {
      const x = dayStartX + di * dayW
      if (day.isWeekend || (day.isHoliday && !day.slotInWeek)) return
      if (!day.slotInWeek || !student) {
        drawCell(doc, x, cy, dayW, rowH, '', { fontSize: font, muted: day.isHoliday })
        return
      }
      const status = resolveHourlyStatus(recordMap.get(hourlyCellKey(student.id, day.weekNumber, day.slotInWeek)))
      drawCell(doc, x, cy, dayW, rowH, hourlyStatusCellContent(status), { fontSize: font })
    })

    if (showSummary) {
      const sx = dayStartX + columns.length * dayW
      const summary = student
        ? studentSecondaryHourlySummary(allWeeks, recordMap, student.id)
        : null
      drawCell(doc, sx, cy, summaryCols[0] + summaryCols[1], rowH, '', { fontSize: font })
      drawCell(doc, sx + summaryCols[0] + summaryCols[1], cy, summaryCols[2], rowH, summary ? String(summary.present) : '', { fontSize: font })
      drawCell(doc, sx + summaryCols[0] + summaryCols[1] + summaryCols[2], cy, summaryCols[3], rowH, summary ? String(Math.round(summary.percent)) : '', { fontSize: font })
    }
  }
}

function drawAttendanceSection(ctx: DrawCtx, pageNumberStart: number) {
  const { data, subject, term } = ctx
  const studentChunks = chunkStudentsForPrintPages(data.students)
  const activeTerms: Array<1 | 2> = term === 0 ? [1, 2] : [term]
  const isSecondary = isSecondaryClassLevel(data.classroom?.level)
  let pageNum = pageNumberStart

  for (const activeTerm of activeTerms) {
    const range = termDateRange(data.academicYear, activeTerm)
    const calendar = reportSchoolCalendar(data)
    type HourlyRecord = Parameters<typeof buildHourlyStatusMap>[0] extends (infer U)[] | undefined ? U : never
    const hourlyRecords = data.hourlyAttendanceRecords as HourlyRecord[]
    void hourlyRecords

    if (isSecondary) {
      const teachingWeeks = subjectHourlyTermWeeks(range.start, range.end, calendar)
      const hpw = subjectHourlyHpw(subject.subject.hours_per_year || 0, teachingWeeks)
      const { weeks, totalHours } = buildSubjectCalendarWeeks(
        range.start,
        range.end,
        calendar,
        hpw,
        holidayNameMap(data.holidays),
      )
      const pages = weeks.length > 0
        ? secondaryHourlyPages(weeks)
        : [{ key: 'empty', weeks: [] as SubjectCalendarWeek[], showSummary: false }]

      for (const page of pages) {
        for (const chunk of studentChunks) {
          if (pageNum > pageNumberStart) ctx.doc.addPage()
          if (page.weeks.length === 0) {
            drawPageMark(ctx.doc, pageNum)
            const layout = ctx.layouts.attendance
            const box = contentBox(layout)
            ctx.doc.setFont('THSarabunNew', 'normal')
            ctx.doc.text('ยังไม่มีข้อมูลเวลาเรียนหรือยังไม่ได้กำหนดปฏิทินภาคเรียน', box.left, box.top + 20)
          } else {
            drawSecondaryWeeklyPage(
              ctx,
              activeTerm,
              chunk,
              page.weeks,
              weeks,
              page.showSummary,
              totalHours,
              pageNum,
            )
          }
          pageNum += 1
        }
      }
    } else {
      const weeks = subjectHourlyTermWeeks(range.start, range.end, calendar)
      const pages = weeks.length > 0
        ? primaryHourlyPages(weeks)
        : [{ key: 'empty', weeks: [] as ReturnType<typeof subjectHourlyTermWeeks>, showSummary: false }]

      for (const page of pages) {
        for (const chunk of studentChunks) {
          if (pageNum > pageNumberStart) ctx.doc.addPage()
          if (page.weeks.length === 0) {
            drawPageMark(ctx.doc, pageNum)
            const layout = ctx.layouts.attendance
            const box = contentBox(layout)
            ctx.doc.setFont('THSarabunNew', 'normal')
            ctx.doc.text('ยังไม่มีข้อมูลเวลาเรียนหรือยังไม่ได้กำหนดปฏิทินภาคเรียน', box.left, box.top + 20)
          } else {
            drawPrimaryWeeklyPage(ctx, activeTerm, chunk, page.weeks, page.showSummary, pageNum)
          }
          pageNum += 1
        }
      }
    }

    for (const chunk of studentChunks) {
      ctx.doc.addPage()
      drawHourlySummaryPage(ctx, activeTerm, chunk, pageNum)
      pageNum += 1
    }
  }
  return pageNum - 1
}

function drawBetweenScorePage(
  ctx: DrawCtx,
  students: ReportStudent[],
  activeTerm: 1 | 2,
  pageNumber: number,
) {
  const { doc, data, subject, layouts } = ctx
  const layout = layouts.scores
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  let y = drawSubjectHead(doc, ctx, layout, `คะแนนระหว่างเรียน ภาคเรียนที่ ${activeTerm}`, activeTerm, box.top)

  const config = scoreConfigFor(data, subject.class_subject_id, activeTerm)
  const split = splitScoreUnits(config)
  const beforeCols = Math.max(SUBJECT_UNIT_DISPLAY_COLS, split.beforeCount)
  const afterCols = Math.max(SUBJECT_UNIT_DISPLAY_COLS, split.afterCount)
  const finalCols = SUBJECT_FINAL_DISPLAY_COLS
  const rowH = Math.min(rowHeightMm(layout), 5.4)
  const headH = Math.max(4.2, rowH * 0.8)
  const font = Math.max(6, ptFromCssPx(layout.fontScorePx) - 2)
  const headFont = Math.max(6, font)

  // ชื่อกว้างขึ้นใกล้พรีวิว; คอลัมน์คะแนนแบ่งที่เหลือเท่า ๆ กัน
  const fixed = [7, 13, 36]
  const unitCount = beforeCols + 1 + 1 + afterCols + 1 + finalCols + 1
  const unitW = Math.max(3.4, (box.width - fixed.reduce((a, b) => a + b, 0)) / unitCount)
  const fixedW = fixed.reduce((a, b) => a + b, 0)
  const HEADER_BG: [number, number, number] = [248, 250, 252]
  const BANNER_BG: [number, number, number] = [224, 242, 254]
  const headerTop = y
  const headerTotalH = headH * 3

  drawCell(doc, box.left, headerTop, fixed[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, box.left + fixed[0], headerTop, fixed[1], headerTotalH, 'เลข\nประจำตัว', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG, noFit: true })
  drawCell(doc, box.left + fixed[0] + fixed[1], headerTop, fixed[2], headerTotalH, 'ชื่อ - สกุล', { bold: true, fontSize: headFont, fill: HEADER_BG })

  let cx = box.left + fixedW
  const groups: Array<{ label: string; cols: number }> = [
    { label: `ก่อนกลางภาค (${split.beforeMax})`, cols: beforeCols + 1 },
    { label: `กลางภาค\n(${split.midtermMax})`, cols: 1 },
    { label: `หลังกลางภาค (${split.afterMax})`, cols: afterCols + 1 },
    { label: `ปลายภาค (${split.finalMax})`, cols: finalCols + 1 },
  ]
  for (const group of groups) {
    drawCell(doc, cx, headerTop, unitW * group.cols, headH, group.label, {
      bold: true,
      fontSize: Math.max(5, headFont - 1.5),
      fill: BANNER_BG,
      noFit: true,
    })
    cx += unitW * group.cols
  }

  cx = box.left + fixedW
  for (let i = 0; i < beforeCols; i += 1) {
    drawCell(doc, cx, headerTop + headH, unitW, headH, String(i + 1), { bold: true, fontSize: headFont, fill: HEADER_BG })
    cx += unitW
  }
  drawCell(doc, cx, headerTop + headH, unitW, headH, 'รวม', { bold: true, fontSize: headFont, fill: HEADER_BG }); cx += unitW
  drawCell(doc, cx, headerTop + headH, unitW, headH, 'รวม', { bold: true, fontSize: headFont, fill: HEADER_BG }); cx += unitW
  for (let i = 0; i < afterCols; i += 1) {
    drawCell(doc, cx, headerTop + headH, unitW, headH, String(i + 1), { bold: true, fontSize: headFont, fill: HEADER_BG })
    cx += unitW
  }
  drawCell(doc, cx, headerTop + headH, unitW, headH, 'รวม', { bold: true, fontSize: headFont, fill: HEADER_BG }); cx += unitW
  for (let i = 0; i < finalCols; i += 1) {
    drawCell(doc, cx, headerTop + headH, unitW, headH, String(i + 1), { bold: true, fontSize: headFont, fill: HEADER_BG })
    cx += unitW
  }
  drawCell(doc, cx, headerTop + headH, unitW, headH, 'รวม', { bold: true, fontSize: headFont, fill: HEADER_BG })

  cx = box.left + fixedW
  const maxRow = [
    ...padScoreCells(split.beforeMaxes, beforeCols).map(String),
    String(split.beforeMax),
    String(split.midtermMax),
    ...padScoreCells(split.afterMaxes, afterCols).map(String),
    String(split.afterMax),
    ...Array.from({ length: finalCols }, () => ''),
    String(split.finalMax),
  ]
  maxRow.forEach(value => {
    drawCell(doc, cx, headerTop + headH * 2, unitW, headH, value, { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
    cx += unitW
  })

  y = headerTop + headerTotalH
  students.forEach((student, index) => {
    const score = scoreForTerm(data, student.id, subject.class_subject_id, activeTerm)
    const beforeValues = unitScoreValues(score, 0, split.beforeCount)
    const afterValues = unitScoreValues(score, split.beforeCount, split.afterCount)
    const cy = y + index * rowH
    const cells = [
      String(student.student_number || index + 1),
      student.student_code || '',
      studentName(student),
      ...padScoreCells(beforeValues, beforeCols).map(String),
      score?.between_total != null ? String(sumScoreCells(beforeValues)) : '',
      score?.midterm_score != null ? String(score.midterm_score) : '',
      ...padScoreCells(afterValues, afterCols).map(String),
      score?.between_total != null ? String(sumScoreCells(afterValues)) : '',
      ...Array.from({ length: finalCols }, () => ''),
      score?.final_score != null ? String(score.final_score) : '',
    ]
    let ox = box.left
    const widths = [...fixed, ...Array.from({ length: unitCount }, () => unitW)]
    cells.forEach((cell, ci) => {
      drawCell(doc, ox, cy, widths[ci], rowH, cell, {
        fontSize: font,
        align: ci === 2 ? 'left' : 'center',
      })
      ox += widths[ci]
    })
  })
}

function drawAchievementPage(
  ctx: DrawCtx,
  students: ReportStudent[],
  activeTerm: 1 | 2,
  pageNumber: number,
) {
  const { doc, data, subject, layouts } = ctx
  const layout = layouts.scores
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  let y = drawSubjectHead(doc, ctx, layout, 'สรุปผลการประเมินผลสัมฤทธิ์ทางการเรียน', activeTerm, box.top)

  const config = scoreConfigFor(data, subject.class_subject_id, activeTerm)
  const split = splitScoreUnits(config)
  const beforeCols = Math.max(5, split.beforeCount)
  const afterCols = Math.max(5, split.afterCount)
  const rowH = Math.min(rowHeightMm(layout), 5.4)
  const headH = Math.max(4.2, rowH * 0.8)
  const font = Math.max(6, ptFromCssPx(layout.fontScorePx) - 2)
  const headFont = Math.max(5.5, font - 0.5)

  const fixed = [7, 13, 36]
  const tailCols = 6
  const unitCols = beforeCols + afterCols
  const fixedW = fixed.reduce((a, b) => a + b, 0)
  // คอลัมน์ท้ายแคบกว่า (แนวตั้ง) — หน่วยคะแนนกว้างกว่าเล็กน้อย
  const unitW = Math.max(4.2, (box.width - fixedW) / (unitCols + tailCols * 0.85))
  const tailW = Math.max(4, (box.width - fixedW - unitW * unitCols) / tailCols)
  const HEADER_BG: [number, number, number] = [248, 250, 252]
  const BANNER_BG: [number, number, number] = [224, 242, 254]
  const headerTop = y
  const headerTotalH = headH * 3

  drawCell(doc, box.left, headerTop, fixed[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, box.left + fixed[0], headerTop, fixed[1], headerTotalH, 'เลข\nประจำตัว', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG, noFit: true })
  drawCell(doc, box.left + fixed[0] + fixed[1], headerTop, fixed[2], headerTotalH, 'ชื่อ - สกุล', { bold: true, fontSize: headFont, fill: HEADER_BG })

  let cx = box.left + fixedW
  drawCell(doc, cx, headerTop, unitW * beforeCols, headH, 'คะแนนก่อนกลางภาค', { bold: true, fontSize: headFont, fill: BANNER_BG })
  cx += unitW * beforeCols
  drawCell(doc, cx, headerTop, unitW * afterCols, headH, 'คะแนนหลังกลางภาค', { bold: true, fontSize: headFont, fill: BANNER_BG })
  cx += unitW * afterCols

  const tallLabels = [
    'รวม',
    pp5ScoreHeadLabel('คะแนนกลางภาค', config?.midterm_max),
    pp5ScoreHeadLabel('คะแนนปลายภาค', config?.final_max),
    pp5ScoreHeadLabel(`รวมภาคเรียนที่ ${activeTerm}`, config?.total_max),
    'ระดับผลการเรียน',
    'หมายเหตุ',
  ]
  tallLabels.forEach(label => {
    drawVerticalHeaderCell(doc, cx, headerTop, tailW, headerTotalH, label, {
      bold: true,
      fontSize: Math.max(5, headFont - 0.5),
      fill: HEADER_BG,
    })
    cx += tailW
  })

  cx = box.left + fixedW
  for (let i = 0; i < beforeCols; i += 1) {
    drawCell(doc, cx, headerTop + headH, unitW, headH, String(i + 1), { bold: true, fontSize: headFont, fill: HEADER_BG })
    cx += unitW
  }
  for (let i = 0; i < afterCols; i += 1) {
    drawCell(doc, cx, headerTop + headH, unitW, headH, String(i + 1), { bold: true, fontSize: headFont, fill: HEADER_BG })
    cx += unitW
  }

  cx = box.left + fixedW
  ;[
    ...padScoreCells(split.beforeMaxes, beforeCols).map(String),
    ...padScoreCells(split.afterMaxes, afterCols).map(String),
  ].forEach(value => {
    drawCell(doc, cx, headerTop + headH * 2, unitW, headH, value, { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
    cx += unitW
  })

  y = headerTop + headerTotalH
  students.forEach((student, index) => {
    const score = scoreForTerm(data, student.id, subject.class_subject_id, activeTerm)
    const beforeValues = unitScoreValues(score, 0, split.beforeCount)
    const afterValues = unitScoreValues(score, split.beforeCount, split.afterCount)
    const cy = y + index * rowH
    const cells = [
      String(student.student_number || index + 1),
      student.student_code || '',
      studentName(student),
      ...padScoreCells(beforeValues, beforeCols).map(String),
      ...padScoreCells(afterValues, afterCols).map(String),
      score?.between_total != null ? String(score.between_total) : '',
      score?.midterm_score != null ? String(score.midterm_score) : '',
      score?.final_score != null ? String(score.final_score) : '',
      score?.term_total != null ? String(score.term_total) : '',
      scoreText(score),
      score?.result && score.result !== 'เรียน' ? score.result : '',
    ]
    let ox = box.left
    const widths = [
      ...fixed,
      ...Array.from({ length: unitCols }, () => unitW),
      ...Array.from({ length: tailCols }, () => tailW),
    ]
    cells.forEach((cell, ci) => {
      drawCell(doc, ox, cy, widths[ci], rowH, cell, {
        fontSize: font,
        align: ci === 2 ? 'left' : 'center',
      })
      ox += widths[ci]
    })
  })
}

function drawExamNoticePage(
  ctx: DrawCtx,
  students: ReportStudent[],
  activeTerm: 1 | 2,
  pageNumber: number,
) {
  const { doc, data, subject, layouts } = ctx
  const layout = layouts.scores
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  let y = drawSubjectHead(doc, ctx, layout, `แบบประกาศผลสอบโรงเรียน${data.school?.name || ''}`, activeTerm, box.top)

  const termRange = termDateRange(data.academicYear, activeTerm)
  const teachingWeeks = buildTeachingWeeks(termRange.start, termRange.end, reportSchoolCalendar(data))
  const hoursWeek = hoursPerWeek(subject.subject.hours_per_year || 0, teachingWeeks.length)
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx) - 1)
  setText(doc)
  doc.text(
    `กลุ่มสาระฯ ${subject.subject.subject_group || '-'}    เวลาเรียน ${hoursWeek || '-'} ชม./สัปดาห์    จำนวน ${subject.subject.credits || '-'} หน่วยกิต`,
    box.left + box.width / 2,
    y,
    { align: 'center' },
  )
  y += 4.5

  const rowH = Math.min(rowHeightMm(layout), 5.0)
  const headH = Math.max(8.5, rowH * 1.7)
  const font = Math.max(7, ptFromCssPx(layout.fontScorePx) - 1.5)
  const headFont = Math.max(6.5, font - 0.5)
  // คอลัมน์: เลขที่ / รหัส / ชื่อ / คะแนน / ระดับ / อ่านคิด / คุณลักษณะ
  const cols = [8, 16, 52, (box.width - 8 - 16 - 52) / 4]
  cols.push(cols[3], cols[3], cols[3])
  const HEADER_BG: [number, number, number] = [248, 250, 252]
  const headers = [
    'เลขที่',
    'เลขประจำตัว',
    'ชื่อ - สกุล',
    'ผลการเรียน\nคะแนน',
    'ผลการเรียน\nระดับผลการเรียน',
    'การประเมิน\nอ่าน คิด วิเคราะห์',
    'การประเมิน\nคุณลักษณะ',
  ]
  let cx = box.left
  headers.forEach((header, i) => {
    drawCell(doc, cx, y, cols[i], headH, header, {
      bold: true,
      fontSize: headFont,
      fill: HEADER_BG,
      noFit: true,
    })
    cx += cols[i]
  })
  y += headH

  const readingSummary = { excellent: 0, good: 0, pass: 0, fail: 0 }
  const characterSummary = { excellent: 0, good: 0, pass: 0, fail: 0 }
  for (let index = 0; index < students.length; index += 1) {
    const student = students[index]
    const score = scoreForTerm(data, student.id, subject.class_subject_id, activeTerm)
    const readingRow = rowForTerm(data.evaluations.reading, student.id, activeTerm)
    const characterRow = rowForTerm(data.evaluations.character, student.id, activeTerm)
    const readingLevel = levelFromAverage(averageScore(readingRow, READING_KEYS))
    const characterLevel = levelFromAverage(averageScore(characterRow, CHARACTER_KEYS))
    if (readingLevel === 'ดีเยี่ยม') readingSummary.excellent += 1
    else if (readingLevel === 'ดี') readingSummary.good += 1
    else if (readingLevel === 'ผ่าน') readingSummary.pass += 1
    else readingSummary.fail += 1
    if (characterLevel === 'ดีเยี่ยม') characterSummary.excellent += 1
    else if (characterLevel === 'ดี') characterSummary.good += 1
    else if (characterLevel === 'ผ่าน') characterSummary.pass += 1
    else characterSummary.fail += 1
    const cells = [
      String(student.student_number || index + 1),
      student.student_code || '',
      studentName(student),
      score?.term_total != null ? String(score.term_total) : '',
      scoreText(score),
      resultLevelNumber(readingLevel),
      resultLevelNumber(characterLevel),
    ]
    cx = box.left
    cells.forEach((cell, ci) => {
      drawCell(doc, cx, y, cols[ci], rowH, cell, {
        fontSize: font,
        align: ci === 2 ? 'left' : 'center',
      })
      cx += cols[ci]
    })
    y += rowH
  }

  const gradeCounts = subjectGradeSummaryForTerm(data, subject, activeTerm)
  const studentsTotal = students.length
  y += 3
  const miniFont = Math.max(6.5, ptFromCssPx(layout.fontTablePx) - 2)
  const miniRowH = 3.6
  const gap = 2.5
  const colW = (box.width - gap * 2) / 3

  // ซ้าย — สรุปผลการเรียน (หัว colspan 2)
  const gradeLabelW = colW * 0.72
  const gradeValueW = colW - gradeLabelW
  drawCell(doc, box.left, y, colW, miniRowH, 'สรุปผลการเรียน', {
    bold: true,
    fontSize: miniFont,
    fill: HEADER_BG,
  })
  let gy = y + miniRowH
  for (const column of SUBJECT_COVER_GRADE_LEVEL_COLUMNS) {
    drawCell(doc, box.left, gy, gradeLabelW, miniRowH, `จำนวนนักเรียนที่ได้ผลการเรียน ${column.label}`, {
      fontSize: miniFont - 0.5,
      align: 'left',
      noFit: true,
    })
    drawCell(doc, box.left + gradeLabelW, gy, gradeValueW, miniRowH, `${gradeCounts[column.key] || 0} คน`, {
      fontSize: miniFont,
    })
    gy += miniRowH
  }
  drawCell(doc, box.left, gy, gradeLabelW, miniRowH, 'รวมทั้งเรียนทั้งสิ้น', {
    fontSize: miniFont - 0.5,
    align: 'left',
  })
  drawCell(doc, box.left + gradeLabelW, gy, gradeValueW, miniRowH, `${studentsTotal} คน`, {
    fontSize: miniFont,
  })
  const gradeBottom = gy + miniRowH

  const drawEvalSummary = (
    left: number,
    title: string,
    summary: { excellent: number; good: number; pass: number; fail: number },
  ) => {
    const subLabels = ['3 (ดีเยี่ยม)', '2 (ดี)', '1 (ผ่าน)', '0 (ไม่ผ่าน)', 'จำนวนนักเรียน']
    const values = [
      String(summary.excellent),
      String(summary.good),
      String(summary.pass),
      String(summary.fail),
      String(studentsTotal),
    ]
    const subW = colW / 5
    drawCell(doc, left, y, colW, miniRowH, title, {
      bold: true,
      fontSize: Math.max(5.5, miniFont - 1),
      fill: HEADER_BG,
      noFit: true,
    })
    let ox = left
    subLabels.forEach((label, i) => {
      drawCell(doc, ox, y + miniRowH, subW, miniRowH, label, {
        bold: true,
        fontSize: Math.max(5, miniFont - 1.5),
        fill: HEADER_BG,
        noFit: true,
      })
      ox += subW
    })
    ox = left
    values.forEach((value, i) => {
      drawCell(doc, ox, y + miniRowH * 2, subW, miniRowH, value, { fontSize: miniFont })
      ox += subW
    })
  }

  drawEvalSummary(box.left + colW + gap, 'สรุปผลการประเมินการอ่าน คิด วิเคราะห์', readingSummary)
  drawEvalSummary(box.left + (colW + gap) * 2, 'สรุปผลการประเมินคุณลักษณะที่พึงประสงค์', characterSummary)

  const sigY = Math.min(PAGE_H - layout.padBottomMm - 8, Math.max(gradeBottom, y + miniRowH * 3) + 7)
  const sigLabels = [
    'ลงชื่อ ครูผู้สอน',
    'ลงชื่อ หัวหน้ากลุ่มสาระ\nการเรียนรู้',
    'ลงชื่อ หัวหน้าฝ่ายวิชาการ',
    'ลงชื่อ รองผู้อำนวยการ\nสถานศึกษา',
    'ลงชื่อ ผู้อำนวยการ\nสถานศึกษา',
  ]
  const sigW = box.width / sigLabels.length
  const sigFont = Math.max(6, miniFont - 0.5)
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(sigFont)
  setText(doc)
  const lineGap = sigFont * (25.4 / 72) * 1.05
  sigLabels.forEach((label, i) => {
    const lines = label.split('\n')
    const blockH = lines.length * lineGap
    const startY = sigY - (blockH - lineGap) / 2
    lines.forEach((line, li) => {
      doc.text(line, box.left + i * sigW + sigW / 2, startY + li * lineGap, { align: 'center' })
    })
  })
}

function drawScoresSection(ctx: DrawCtx, pageNumberStart: number) {
  const { data, term } = ctx
  const activeTerms: Array<1 | 2> = term === 0 ? [1, 2] : [term]
  const chunks = chunkStudentsForPrintPages(data.students)
  const studentChunks = chunks.length > 0 ? chunks : [[]]
  let pageNum = pageNumberStart

  for (const activeTerm of activeTerms) {
    for (const chunk of studentChunks) {
      if (pageNum > pageNumberStart) ctx.doc.addPage()
      drawBetweenScorePage(ctx, chunk, activeTerm, pageNum)
      pageNum += 1
      ctx.doc.addPage()
      drawAchievementPage(ctx, chunk, activeTerm, pageNum)
      pageNum += 1
      ctx.doc.addPage()
      drawExamNoticePage(ctx, chunk, activeTerm, pageNum)
      pageNum += 1
    }
  }
  return pageNum - 1
}

function drawCharacterPage(ctx: DrawCtx, students: ReportStudent[], pageNumber: number) {
  const { doc, data, term, layouts } = ctx
  const layout = layouts.character
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  let y = drawSubjectHead(doc, ctx, layout, 'ผลการประเมินคุณลักษณะอันพึงประสงค์', term, box.top, { includeSubjectLine: false })

  const scoreColumns = 10
  const rowH = rowHeightMm(layout)
  const headH = Math.max(4.2, rowH * 0.8)
  const font = ptFromCssPx(layout.fontTablePx) - 1
  const headFont = Math.max(6, font)

  // คอลัมน์ตรง CSS พรีวิว: 7 / 13 / 50 / 5.5×10 / 18 / 18 / 23
  const fixed = [7, 13, 50]
  const tail = { level: 18, result: 18, note: 23 }
  const fixedW = fixed.reduce((a, b) => a + b, 0)
  const tailW = tail.level + tail.result + tail.note
  const scoreW = Math.max(4, (box.width - fixedW - tailW) / scoreColumns)

  const headerTop = y
  const headerTotalH = headH * 4
  const scoreX = box.left + fixedW
  const scoreGroupW = scoreW * scoreColumns
  const levelX = scoreX + scoreGroupW
  const resultX = levelX + tail.level
  const noteX = resultX + tail.result

  const HEADER_BG: [number, number, number] = [248, 250, 252]
  const BANNER_BG: [number, number, number] = [224, 242, 254]

  // Row 1 — fixed cols rowspan 4, score group colspan 10, ผลการประเมิน colspan 2, หมายเหตุ rowspan 4
  drawVerticalHeaderCell(doc, box.left, headerTop, fixed[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawVerticalHeaderCell(doc, box.left + fixed[0], headerTop, fixed[1], headerTotalH, 'เลขประจำตัว', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  drawCell(doc, box.left + fixed[0] + fixed[1], headerTop, fixed[2], headerTotalH, 'ชื่อ - สกุล', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, scoreX, headerTop, scoreGroupW, headH, 'ผลประเมินคุณลักษณะอันพึงประสงค์', { bold: true, fontSize: Math.max(5.5, headFont - 1), fill: BANNER_BG })
  drawCell(doc, levelX, headerTop, tail.level + tail.result, headH, 'ผลการประเมิน', { bold: true, fontSize: headFont, fill: BANNER_BG })
  drawCell(doc, noteX, headerTop, tail.note, headerTotalH, 'หมายเหตุ', { bold: true, fontSize: headFont, fill: HEADER_BG })

  // Row 2 — ข้อ/คะแนน colspan 10, ระดับ/ผล rowspan 3
  const row2Y = headerTop + headH
  drawCell(doc, scoreX, row2Y, scoreGroupW, headH, 'ข้อ/คะแนน', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, levelX, row2Y, tail.level, headH * 3, 'ระดับ', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, resultX, row2Y, tail.result, headH * 3, 'ผล', { bold: true, fontSize: headFont, fill: HEADER_BG })

  // Row 3 — item numbers 1..8, empty for the 2 spare columns
  const row3Y = row2Y + headH
  for (let i = 0; i < scoreColumns; i += 1) {
    drawCell(doc, scoreX + i * scoreW, row3Y, scoreW, headH, i < CHARACTER_KEYS.length ? String(i + 1) : '', { bold: true, fontSize: headFont, fill: HEADER_BG })
  }

  // Row 4 — max score (3) for the 8 real columns
  const row4Y = row3Y + headH
  for (let i = 0; i < scoreColumns; i += 1) {
    drawCell(doc, scoreX + i * scoreW, row4Y, scoreW, headH, i < CHARACTER_KEYS.length ? '3' : '', { bold: true, fontSize: headFont, fill: HEADER_BG })
  }

  y = headerTop + headerTotalH
  const widths = [...fixed, ...Array.from({ length: scoreColumns }, () => scoreW), tail.level, tail.result, tail.note]
  const rowCount = pp5StudentTableRows(students.length, layout)
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    const cy = y + i * rowH
    const row = student ? (term !== 0 ? rowForTerm(data.evaluations.character, student.id, term) : rowFor(data.evaluations.character, student.id)) : null
    const fallbackResult = student ? levelFromAverage(averageScore(row, CHARACTER_KEYS)) : '-'
    const result = student ? ((row?.result_level as string | null) || (fallbackResult === '-' ? '' : fallbackResult)) : ''
    const cells = [
      student ? String(student.student_number || i + 1) : '',
      student?.student_code || '',
      student ? studentName(student) : '',
      ...Array.from({ length: scoreColumns }, (_, si) => (student && si < CHARACTER_KEYS.length ? String(row?.[CHARACTER_KEYS[si]] ?? '') : '')),
      student ? resultLevelNumber(result) : '',
      result,
      '',
    ]
    let cx = box.left
    cells.forEach((cell, ci) => {
      drawCell(doc, cx, cy, widths[ci], rowH, cell, { fontSize: font, align: ci === 2 ? 'left' : 'center' })
      cx += widths[ci]
    })
  }
}

function drawReadingPage(ctx: DrawCtx, students: ReportStudent[], pageNumber: number) {
  const { doc, data, term, layouts } = ctx
  const layout = layouts.reading
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  let y = drawSubjectHead(doc, ctx, layout, 'ผลการประเมินอ่าน คิดวิเคราะห์ และเขียนสื่อความหมาย', term, box.top, { includeSubjectLine: false })

  const readingGroups = defaultReadingTableGroups()
  const readingColumns = readingTableFlatColumns(readingGroups)
  const columnLabel = (column: ReadingTableColumn) =>
    column.kind === 'score' || column.kind === 'total' ? column.label : ''

  const rowH = rowHeightMm(layout)
  const headH = Math.max(4.2, rowH * 0.8)
  const font = ptFromCssPx(layout.fontTablePx) - 1
  const headFont = Math.max(6, font)

  // คอลัมน์ตรง CSS: 7 / 13 / 50 / 8×N / 10 / 14 / 19
  const fixed = [7, 13, 50]
  const tail = { total: 10, level: 14, result: 19 }
  const fixedW = fixed.reduce((a, b) => a + b, 0)
  const tailW = tail.total + tail.level + tail.result
  const midW = Math.max(4, (box.width - fixedW - tailW) / readingColumns.length)

  const headerTop = y
  const headerTotalH = headH * 4
  const midX = box.left + fixedW
  const midGroupW = midW * readingColumns.length
  const totalX = midX + midGroupW
  const levelX = totalX + tail.total
  const resultX = levelX + tail.level

  const HEADER_BG: [number, number, number] = [248, 250, 252]
  const BANNER_BG: [number, number, number] = [224, 242, 254]

  // Row 1 — fixed cols rowspan 4, reading score group colspan N, รวมทั้งหมด rowspan 4, ผลการประเมิน colspan 2
  drawVerticalHeaderCell(doc, box.left, headerTop, fixed[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawVerticalHeaderCell(doc, box.left + fixed[0], headerTop, fixed[1], headerTotalH, 'เลขประจำตัว', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  drawCell(doc, box.left + fixed[0] + fixed[1], headerTop, fixed[2], headerTotalH, 'ชื่อ - สกุล', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, midX, headerTop, midGroupW, headH, 'ผลประเมินอ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย', { bold: true, fontSize: Math.max(5, headFont - 1.5), fill: BANNER_BG })
  drawVerticalHeaderCell(doc, totalX, headerTop, tail.total, headerTotalH, 'รวมทั้งหมด', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  drawCell(doc, levelX, headerTop, tail.level + tail.result, headH, 'ผลการประเมิน', { bold: true, fontSize: headFont, fill: BANNER_BG })

  // Row 2 — 3 sub-groups colspan 3 each, ระดับ/ผล rowspan 3
  const row2Y = headerTop + headH
  let gx = midX
  readingGroups.forEach(group => {
    const gw = midW * group.columns.length
    drawCell(doc, gx, row2Y, gw, headH, group.label, { bold: true, fontSize: Math.max(5.5, headFont - 1), fill: HEADER_BG })
    gx += gw
  })
  drawCell(doc, levelX, row2Y, tail.level, headH * 3, 'ระดับ', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, resultX, row2Y, tail.result, headH * 3, 'ผล', { bold: true, fontSize: headFont, fill: HEADER_BG })

  // Row 3 — column labels (empty for spacer columns)
  const row3Y = row2Y + headH
  readingColumns.forEach((column, index) => {
    drawCell(doc, midX + index * midW, row3Y, midW, headH, columnLabel(column), { bold: true, fontSize: headFont, fill: HEADER_BG })
  })

  // Row 4 — max score per column
  const row4Y = row3Y + headH
  readingColumns.forEach((column, index) => {
    drawCell(doc, midX + index * midW, row4Y, midW, headH, String(readingTableColumnMax(column)), { bold: true, fontSize: headFont, fill: HEADER_BG })
  })

  y = headerTop + headerTotalH
  const widths = [...fixed, ...readingColumns.map(() => midW), tail.total, tail.level, tail.result]
  const rowCount = pp5StudentTableRows(students.length, layout)
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    const cy = y + i * rowH
    const row = student ? (term !== 0 ? rowForTerm(data.evaluations.reading, student.id, term) : rowFor(data.evaluations.reading, student.id)) : null
    const total = row ? String(row.total_score ?? READING_KEYS.reduce((sum, key) => sum + Number(row[key] ?? 0), 0)) : ''
    const fallbackResult = student ? levelFromAverage(averageScore(row, READING_KEYS)) : '-'
    const result = student ? ((row?.result_level as string | null) || (fallbackResult === '-' ? '' : fallbackResult)) : ''
    const cells = [
      student ? String(student.student_number || i + 1) : '',
      student?.student_code || '',
      student ? studentName(student) : '',
      ...readingColumns.map(col => (student ? String(readingTableColumnValue(row, col)) : '')),
      student ? total : '',
      student ? resultLevelNumber(result) : '',
      result,
    ]
    let cx = box.left
    cells.forEach((cell, ci) => {
      drawCell(doc, cx, cy, widths[ci], rowH, cell, { fontSize: font, align: ci === 2 ? 'left' : 'center' })
      cx += widths[ci]
    })
  }
}

function drawCompetencyPage(ctx: DrawCtx, students: ReportStudent[], pageNumber: number) {
  const { doc, data, term, layouts } = ctx
  const layout = layouts.competency
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  const y = drawSubjectHead(doc, ctx, layout, 'ผลการประเมินสมรรถนะสำคัญของผู้เรียน', term, box.top, { includeSubjectLine: false })

  const rowH = rowHeightMm(layout)
  const font = ptFromCssPx(layout.fontTablePx) - 1
  // คอลัมน์ตรง CSS: 7 / 70 / 16×5 / 24
  const fixed = [7, 70]
  const resultW = 24
  const scoreW = Math.max(12, (box.width - fixed.reduce((a, b) => a + b, 0) - resultW) / COMPETENCY_KEYS.length)
  const colWidths = [...fixed, ...COMPETENCY_KEYS.map(() => scoreW), resultW]
  const headers = ['ที่', 'ชื่อ - สกุล', ...COMPETENCY_LABELS, 'สรุป']
  const body: string[][] = [headers]
  const rowCount = pp5StudentTableRows(students.length, layout)
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    if (!student) {
      body.push(Array(colWidths.length).fill(''))
      continue
    }
    const row = term !== 0 ? rowForTerm(data.evaluations.competency, student.id, term) : rowFor(data.evaluations.competency, student.id)
    const fallbackResult = levelFromAverage(averageScore(row, COMPETENCY_KEYS))
    const result = (row?.result_level as string | null) || (fallbackResult === '-' ? '' : fallbackResult)
    body.push([
      String(student.student_number || i + 1),
      studentName(student),
      ...COMPETENCY_KEYS.map(key => String(row?.[key] ?? '–')),
      result,
    ])
  }
  drawTableGrid(doc, box.left, y, colWidths, body, {
    rowH,
    fontSize: font,
    headerRows: 1,
    nameCol: 1,
    headerFill: [224, 242, 254],
  })
}

function drawStudentChunkSection(
  ctx: DrawCtx,
  drawPage: (ctx: DrawCtx, students: ReportStudent[], pageNumber: number) => void,
  pageNumberStart: number,
) {
  const chunks = chunkStudentsForPrintPages(ctx.data.students)
  let pageNum = pageNumberStart
  chunks.forEach((chunk, index) => {
    if (index > 0) ctx.doc.addPage()
    drawPage(ctx, chunk, pageNum)
    pageNum += 1
  })
  return Math.max(pageNumberStart, pageNum - 1)
}

function includeSection(
  sections: Pp5SubjectPdfOptions['sections'],
  previewSection: Pp5SubjectPdfOptions['previewSection'],
  name: Pp5SubjectPdfSection,
) {
  if (previewSection) return previewSection === name
  return sections.includes(name)
}

const SECTION_ORDER: Pp5SubjectPdfSection[] = [
  'cover', 'criteria', 'attendance', 'scores', 'character', 'reading', 'competency',
]

export async function buildPp5SubjectPdfBlob(
  options: Pp5SubjectPdfOptions,
  buildOptions?: Pp5SubjectPdfBuildOptions,
): Promise<{ blob: Blob; fileName: string }> {
  const { data, subject, term, sections, previewSection } = options
  const selectedSections = previewSection
    ? [previewSection]
    : SECTION_ORDER.filter(name => sections.includes(name))
  const needsStudents = selectedSections.some(name => name !== 'cover' && name !== 'criteria')
  if (needsStudents && !data.students.length) {
    throw new Error('ไม่พบข้อมูลนักเรียนสำหรับสร้าง ปพ.5 รายวิชา')
  }

  const layouts = { ...DEFAULT_PP5_PRINT_LAYOUTS, ...options.layouts }
  const doc = buildOptions?.doc ?? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  if (!buildOptions?.skipApplyFonts) await applyThaiFonts(doc)

  const sigKeys = ['teacher', 'subject_head', 'measurement_head', 'academic_head', 'vice_director', 'director', 'homeroom'] as const
  const [logoData, qrPng, ...sigUrls] = await Promise.all([
    loadImageDataUrl(data.school?.logo_url, 160, 0.7),
    data.digitalReference?.verifyUrl
      ? qrDataUrl(documentQrUrl(data.digitalReference), 256)
      : Promise.resolve(null),
    ...sigKeys.map(k => loadImageDataUrl(data.documentSignatures?.[k], 220, 0.75)),
  ])
  const signatures = Object.fromEntries(sigKeys.map((k, i) => [k, sigUrls[i]])) as Record<string, string | null>

  const ctx: DrawCtx = { doc, data, subject, term, layouts, logoData, signatures, qrPng }
  let pageNum = 0
  let started = false

  const ensurePage = () => {
    if (!started) {
      started = true
      pageNum = 1
      return
    }
    doc.addPage()
    pageNum += 1
  }

  for (const section of SECTION_ORDER) {
    if (!includeSection(sections, previewSection, section)) continue

    if (section === 'cover') {
      ensurePage()
      // หน้าปกวาดปพ.5 เอง — ห้าม drawPageMark จะซ้อนกับ "(รายวิชา)"
      await drawCoverPage(ctx)
      continue
    }

    if (section === 'criteria') {
      ensurePage()
      pageNum = drawCriteriaPages(ctx, pageNum)
      continue
    }

    if (section === 'attendance') {
      ensurePage()
      pageNum = drawAttendanceSection(ctx, pageNum)
      continue
    }

    if (section === 'scores') {
      ensurePage()
      pageNum = drawScoresSection(ctx, pageNum)
      continue
    }

    if (section === 'character') {
      ensurePage()
      pageNum = drawStudentChunkSection(ctx, drawCharacterPage, pageNum)
      continue
    }

    if (section === 'reading') {
      ensurePage()
      pageNum = drawStudentChunkSection(ctx, drawReadingPage, pageNum)
      continue
    }

    if (section === 'competency') {
      ensurePage()
      pageNum = drawStudentChunkSection(ctx, drawCompetencyPage, pageNum)
    }
  }

  const classText = data.classroom ? `${data.classroom.level}-${data.classroom.room}` : 'รายงาน'
  const yearText = data.academicYear?.year_be || ''
  const nameParts = ['ปพ.5 รายวิชา', classText, subject.subject.code?.trim(), subject.subject.name?.trim(), yearText].filter(Boolean)
  const fileName = (options.fileName || `${nameParts.join('_')}.pdf`).replace(/[\\/:*?"<>|]/g, '-')

  if (!started) throw new Error('ไม่มีส่วนรายงานที่เลือกสำหรับสร้าง PDF')

  return { blob: doc.output('blob'), fileName }
}
