'use client'

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
  hourlyCellKey,
  schoolDayCalendarFromLists,
  summarizeHourlyStatuses,
  termDateRange,
  type HourlyStatus,
} from '@/lib/hourly-attendance'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
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
  primaryHourlyPages,
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

type DrawCtx = {
  doc: jsPDF
  data: ReportPayload
  subject: ReportSubject
  term: 0 | 1 | 2
  layouts: Pp5PrintLayouts
  logoData: string | null
  signatures: Record<string, string | null>
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
      const status = recordMap.get(hourlyCellKey(studentId, week.weekNumber, slot))
      if (status !== undefined) statuses.push(status)
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
      const status = recordMap.get(hourlyCellKey(studentId, week.weekNumber, day.slotInWeek))
      if (status !== undefined) statuses.push(status)
    }
  }
  return summarizeHourlyStatuses(statuses)
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
  const textY = y + h / 2 + nudge
  if (align === 'left') doc.text(label, x + pad, textY, { baseline: 'middle' })
  else if (align === 'right') doc.text(label, x + w - pad, textY, { baseline: 'middle', align: 'right' })
  else doc.text(label, x + w / 2, textY, { baseline: 'middle', align: 'center' })
}

function drawPageMark(doc: jsPDF, pageNumber: number) {
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(9)
  setText(doc)
  const mark = `${pageNumber} ${PP5_SUBJECT_PAGE_MARK}`
  doc.text(mark, PAGE_W - 12, 8, { align: 'right' })
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
) {
  const box = contentBox(layout)
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  doc.text(title, box.left + box.width / 2, y, { align: 'center' })
  y += pxToMm96(layout.fontH1Px) * 0.5 + 1.5
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  doc.text(subjectReportSubhead(ctx.data, activeTerm), box.left + box.width / 2, y, { align: 'center' })
  y += pxToMm96(layout.fontSubPx) * 0.45 + 1.2
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
  opts: { rowH: number; fontSize: number; headerRows?: number; nameCol?: number },
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
  let y = box.top

  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.docMarkFontPx))
  setText(doc)
  doc.text('ปพ.5', PAGE_W - px(layout.docMarkRightPx), y + px(layout.docMarkTopPx), { align: 'right' })
  doc.text(PP5_SUBJECT_PAGE_MARK, PAGE_W - px(layout.docMarkRightPx), y + px(layout.docMarkTopPx) + 5, { align: 'right' })

  const logoSize = px(layout.logoSizePx)
  const logoX = box.left + (box.width - logoSize) / 2
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', logoX, y, logoSize, logoSize)
    } catch {
      drawCell(doc, logoX, y, logoSize, logoSize, data.school?.name?.slice(0, 2) || 'รร', { fontSize: 14, bold: true })
    }
  } else {
    drawCell(doc, logoX, y, logoSize, logoSize, data.school?.name?.slice(0, 2) || 'รร', { fontSize: 14, bold: true })
  }
  y += logoSize + px(layout.headerGapPx) * 0.4

  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  doc.text('แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน', box.left + box.width / 2, y, { align: 'center' })
  y += pxToMm96(layout.fontH1Px) * 0.55 + 2

  const infoFont = ptFromCssPx(layout.fontInfoPx)
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(infoFont)
  const schoolLine = `โรงเรียน ${data.school?.name || '-'}   อำเภอ ${data.school?.district || '-'}   ${schoolOfficeLine(data)}`
  doc.text(fitText(doc, schoolLine, box.width), box.left, y)
  y += 5

  const activeTerm = (term === 0 ? 1 : term) as 1 | 2
  const range = termDateRange(data.academicYear, activeTerm)
  const weeks = subjectHourlyTermWeeks(range.start, range.end, reportSchoolCalendar(data))
  const hoursWeek = subjectHourlyHpw(subject.subject.hours_per_year || 0, weeks)
  const isPrimary = isPrimaryClassLevel(data.classroom?.level)
  const isSecondary = isSecondaryClassLevel(data.classroom?.level)
  const isElective = subjectIsElective(subject)

  const metaRows = [
    `ชั้น ${data.classroom ? classroomLevelLabel(data.classroom.level) : '-'}   ห้อง ${data.classroom?.room || '-'}   ${term === 0 ? 'สรุปทั้งปี' : `ภาคเรียนที่ ${term}`}   ปีการศึกษา ${data.academicYear?.year_be || '-'}   เวลาเรียน ${hoursWeek || '-'} ชม./สัปดาห์`,
    isPrimary
      ? `กลุ่มสาระการเรียนรู้ ${subject.subject.subject_group || '-'}   สาระการเรียนรู้ ${isElective ? '☑ เพิ่มเติม' : '☑ พื้นฐาน'}   ระดับชั้น ${isPrimary ? '☑ ประถมศึกษา' : ''}${isSecondary ? ' ☑ มัธยมศึกษา' : ''}`
      : '',
    `รายวิชา ${subject.subject.name} (${subject.subject.code})   หน่วยกิต ${subject.subject.credits ?? '-'} หน่วย`,
    `ครูผู้สอน ${subject.teacher_name || '-'}   ครูที่ปรึกษา ${homeroomTeacherLine(data.classroom)}`,
  ].filter(Boolean)
  metaRows.forEach(line => {
    doc.text(fitText(doc, line, box.width), box.left, y)
    y += 4.5
  })
  y += layout.tableTopMm

  const studentsTotal = data.students.length
  const gradeCounts = subjectGradeSummaryForTerm(data, subject, term)
  const tableFont = ptFromCssPx(layout.fontTablePx)
  const rowH = pxToMm96(layout.tableRowHeightPx)
  const gradeCols = SUBJECT_COVER_GRADE_COLUMNS.map(() => 9)
  const colWidths = [16, ...gradeCols, 12, 14]
  const header1 = ['จำนวน\nนักเรียน\nทั้งหมด', ...SUBJECT_COVER_GRADE_COLUMNS.map(c => c.label), 'หมายเหตุ']
  const countRow = [String(studentsTotal), ...SUBJECT_COVER_GRADE_COLUMNS.map(c => String(gradeCounts[c.key] || '-')), '']
  const pctRow = ['คิดเป็นร้อยละ', ...SUBJECT_COVER_GRADE_COLUMNS.map(c => coverPercent(gradeCounts[c.key] || 0, studentsTotal)), '']
  drawTableGrid(doc, box.left, y, colWidths, [header1, countRow, pctRow], { rowH, fontSize: tableFont - 1, headerRows: 1 })
  y += rowH * 3 + layout.summaryGapPx * 0.35

  const character = evaluationSummary(data, data.evaluations.character, CHARACTER_KEYS)
  const reading = evaluationSummary(data, data.evaluations.reading, READING_KEYS)
  const evalW = (box.width - 3) / 2
  const evalHeaders = ['จำนวนนักเรียนทั้งหมด', 'ดีเยี่ยม', 'ดี', 'ผ่าน', 'ปรับปรุง']
  const drawEvalBox = (bx: number, title: string, summary: typeof character) => {
    const evalCols = [evalW * 0.34, ...Array.from({ length: 4 }, () => evalW * 0.165)]
    drawTableGrid(doc, bx, y, evalCols, [
      [title, '', '', '', ''],
      evalHeaders,
      [String(summary.total), String(summary.excellent || '-'), String(summary.good || '-'), String(summary.pass || '-'), String(summary.fail || '-')],
      ['คิดเป็นร้อยละ', coverPercent(summary.excellent, summary.total), coverPercent(summary.good, summary.total), coverPercent(summary.pass, summary.total), coverPercent(summary.fail, summary.total)],
    ], { rowH: rowH * 0.95, fontSize: tableFont - 2, headerRows: 2 })
  }
  drawEvalBox(box.left, 'สรุปผลการประเมินคุณลักษณะอันพึงประสงค์', character)
  drawEvalBox(box.left + evalW + 3, 'สรุปผลการประเมินอ่าน คิด วิเคราะห์เขียน', reading)
  y += rowH * 4 + layout.approvalGapPx

  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontSignaturePx))
  doc.text('การตรวจสอบและอนุมัติผลการเรียน', box.left + box.width / 2, y, { align: 'center' })
  y += 5

  const sigW = box.width / 4 - 1
  const sigBlocks = [
    { url: signatures.teacher, name: subject.teacher_name || '—', line: 'ครูผู้สอน' },
    { url: signatures.subject_head, name: subjectGroupHeadName(data, subject.subject.subject_group), line: subjectGroupHeadPositionLine(subject.subject.subject_group) },
    { url: signatures.measurement_head, name: data.school?.measurement_head_name || '—', line: 'หัวหน้างานวัดและประเมินผล' },
    { url: signatures.academic_head, name: data.school?.academic_head_name || '—', line: 'หัวหน้าฝ่ายวิชาการ' },
  ]
  for (let i = 0; i < sigBlocks.length; i += 1) {
    const block = sigBlocks[i]
    const sx = box.left + i * (sigW + 1.3)
    const imgY = y
    if (block.url) {
      try { doc.addImage(block.url, 'JPEG', sx + sigW * 0.2, imgY, sigW * 0.6, 8) } catch { /* skip */ }
    } else {
      setStroke(doc)
      doc.line(sx + 2, imgY + 8, sx + sigW - 2, imgY + 8)
    }
    doc.setFont('THSarabunNew', 'normal')
    doc.setFontSize(ptFromCssPx(layout.fontSignaturePx) - 1)
    doc.text(`(${block.name})`, sx + sigW / 2, imgY + 12, { align: 'center' })
    doc.text(fitText(doc, block.line, sigW), sx + sigW / 2, imgY + 16, { align: 'center' })
  }
  y += 22

  const viceDirectorName = data.school?.vice_director_name?.trim()
  const directorPos = directorActingPositionLine(data.school)
  if (viceDirectorName) {
    const halfW = box.width / 2 - 2
    doc.text('เสนอเพื่อพิจารณา', box.left + halfW / 2, y, { align: 'center' })
    doc.text(`(${viceDirectorName})`, box.left + halfW / 2, y + 10, { align: 'center' })
    doc.text(`รองผู้อำนวยการโรงเรียน${data.school?.name || '-'}`, box.left + halfW / 2, y + 14, { align: 'center' })
    doc.text('☐ ไม่อนุมัติ   ☐ อนุมัติ เมื่อวันที่...........', box.left + halfW + 4 + halfW / 2, y + 4, { align: 'center' })
    doc.text(`(${directorDisplayName(data.school)})`, box.left + halfW + 4 + halfW / 2, y + 12, { align: 'center' })
    if (directorPos) doc.text(directorPos, box.left + halfW + 4 + halfW / 2, y + 16, { align: 'center' })
    doc.text(directorSchoolLine(data.school), box.left + halfW + 4 + halfW / 2, y + 20, { align: 'center' })
  } else {
    doc.text('☐ อนุมัติ   ☐ ไม่อนุมัติ', box.left + box.width / 2, y, { align: 'center' })
    doc.text(`(${directorDisplayName(data.school)})`, box.left + box.width / 2, y + 10, { align: 'center' })
    if (directorPos) doc.text(directorPos, box.left + box.width / 2, y + 14, { align: 'center' })
    doc.text(directorSchoolLine(data.school), box.left + box.width / 2, y + 18, { align: 'center' })
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
  let y = drawSubjectHead(doc, ctx, layout, 'คุณลักษณะอันพึงประสงค์', term, box.top)
  const topicW = box.width * 0.32
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
  y = drawSubjectHead(doc, ctx, layout, 'อ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย', term, box.top)
  const rubricHeaders = ['3 (ดีเยี่ยม)', '2 (ดี)', '1 (ผ่านเกณฑ์)', '0 (ปรับปรุง)']
  const stdW = box.width * 0.22
  const indW = box.width * 0.28
  const rubW = (box.width - stdW - indW) / 4
  drawCell(doc, box.left, y, stdW, rowH, 'มาตรฐาน', { fontSize: font, bold: true })
  drawCell(doc, box.left + stdW, y, indW, rowH, 'ตัวชี้วัด', { fontSize: font, bold: true })
  rubricHeaders.forEach((h, i) => drawCell(doc, box.left + stdW + indW + i * rubW, y, rubW, rowH, h, { fontSize: font - 1, bold: true }))
  y += rowH

  const readTopics = readingCriteriaTopics(data.readingSettings)
  for (const topic of readTopics) {
    const indicators = topic.indicators.length > 0 ? topic.indicators : [{ shortLabel: '', label: '', rubricLevels: {} }]
    indicators.forEach((indicator, ii) => {
      if (y + rowH > PAGE_H - layout.padBottomMm) {
        doc.addPage()
        pageNum += 1
        drawPageMark(doc, pageNum)
        y = box.top
      }
      if (ii === 0) {
        drawCell(doc, box.left, y, stdW, rowH * indicators.length, `${topic.shortLabel}. ${topic.label}\n(คะแนน) ${topic.maxScore}`, {
          fontSize: font - 1, align: 'left', noFit: true,
        })
      }
      drawCell(doc, box.left + stdW, y, indW, rowH, indicator.label ? `${indicator.shortLabel} ${indicator.label}` : '', {
        fontSize: font - 1, align: 'left',
      })
      rubricHeaders.forEach((_h, ri) => {
        const key = ['3', '2', '1', '0'][ri] as '0' | '1' | '2' | '3'
        const rubricText = (indicator.rubricLevels as Partial<Record<'0' | '1' | '2' | '3', string>> | undefined)?.[key] || ''
        drawCell(doc, box.left + stdW + indW + ri * rubW, y, rubW, rowH, rubricText, {
          fontSize: font - 2, align: 'left',
        })
      })
      y += rowH
    })
  }
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
  doc.text(`แบบบันทึกเวลาเรียนรายวิชา ${subjectHourlyClassLine(data.classroom)} ภาคเรียนที่ ${activeTerm}`, box.left + box.width / 2, y, { align: 'center' })
  y += 5
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  doc.text(`รหัสวิชา ${subject.subject.code}   รายวิชา ${subject.subject.name}   ปีการศึกษา ${data.academicYear?.year_be || '-'}`, box.left + box.width / 2, y, { align: 'center' })
  y += 5

  const rowH = rowHeightMm(layout)
  const rowCount = pp5AttendanceBodyRows(students.length, layout, 3)
  const fixedCols = [7, 14, 38]
  const slotW = Math.max(3.2, (box.width - fixedCols.reduce((a, b) => a + b, 0) - (showSummary ? 28 : 0)) / (pageWeeks.length * slotsPerWeek))
  const summaryCols = showSummary ? [7, 7, 7, 7] : []
  const colWidths = [...fixedCols, ...pageWeeks.flatMap(() => Array.from({ length: slotsPerWeek }, () => slotW)), ...summaryCols]

  const header1 = ['เลขที่', 'เลข\nประจำตัว', 'ชื่อ - สกุล', ...pageWeeks.flatMap(w => Array(slotsPerWeek).fill(`W${w.weekNumber}`)), ...(showSummary ? ['มา', 'ขาด', 'ลา', '%'] : [])]
  const header2 = ['', '', '', ...pageWeeks.flatMap(w => Array.from({ length: slotsPerWeek }, (_, i) => String(i + 1))), ...(showSummary ? ['', '', '', ''] : [])]
  const body: string[][] = [header1, header2]

  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    if (!student) {
      body.push(Array(colWidths.length).fill(''))
      continue
    }
    const cells: string[] = [
      String(student.student_number || i + 1),
      student.student_code || '',
      studentName(student),
    ]
    for (const week of pageWeeks) {
      for (let slot = 1; slot <= slotsPerWeek; slot += 1) {
        const status = recordMap.get(hourlyCellKey(student.id, week.weekNumber, slot))
        cells.push(status === undefined ? '' : status === '/' ? '/' : status)
      }
    }
    if (showSummary) {
      const summary = studentHourlySummary(allWeeks, hpw, recordMap, student.id)
      cells.push(String(summary.present), String(summary.absent), String(summary.leave + summary.sick), summary.percent.toFixed(1))
    }
    body.push(cells)
  }
  drawTableGrid(doc, box.left, y, colWidths, body, { rowH, fontSize: ptFromCssPx(layout.fontNumberPx), headerRows: 2, nameCol: 2 })
}

function drawAttendanceSection(ctx: DrawCtx, pageNumberStart: number) {
  const { data, term } = ctx
  const studentChunks = chunkStudentsForPrintPages(data.students)
  const activeTerms: Array<1 | 2> = term === 0 ? [1, 2] : [term]
  let pageNum = pageNumberStart

  for (const activeTerm of activeTerms) {
    const range = termDateRange(data.academicYear, activeTerm)
    const calendar = reportSchoolCalendar(data)
    const weeks = subjectHourlyTermWeeks(range.start, range.end, calendar)
    const pages = weeks.length > 0 ? primaryHourlyPages(weeks) : [{ key: 'empty', weeks: [], showSummary: false }]

    for (const page of pages) {
      for (const chunk of studentChunks) {
        if (pageNum > pageNumberStart) ctx.doc.addPage()
        if (page.weeks.length === 0) {
          drawPageMark(ctx.doc, pageNum)
          const layout = ctx.layouts.attendance
          const box = contentBox(layout)
          let y = box.top
          ctx.doc.setFont('THSarabunNew', 'normal')
          ctx.doc.text('ยังไม่มีข้อมูลเวลาเรียนหรือยังไม่ได้กำหนดปฏิทินภาคเรียน', box.left, y + 20)
        } else {
          drawPrimaryWeeklyPage(ctx, activeTerm, chunk, page.weeks, page.showSummary, pageNum)
        }
        pageNum += 1
      }
    }

    for (const chunk of studentChunks) {
      ctx.doc.addPage()
      drawHourlySummaryPage(ctx, activeTerm, chunk, pageNum)
      pageNum += 1
    }
  }
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
  const rowH = rowHeightMm(layout)
  const font = ptFromCssPx(layout.fontScorePx) - 2

  const fixed = [7, 14, 34]
  const unitCount = beforeCols + 1 + 1 + afterCols + 1 + finalCols + 1
  const unitW = Math.max(3.5, (box.width - fixed.reduce((a, b) => a + b, 0)) / unitCount)
  const colWidths = [...fixed, ...Array.from({ length: unitCount }, () => unitW)]

  const h1: string[] = ['เลขที่', 'เลขประจำตัว', 'ชื่อ - สกุล']
  h1.push(...Array.from({ length: beforeCols }, (_, i) => String(i + 1)), 'รวม', 'กลางภาค')
  h1.push(...Array.from({ length: afterCols }, (_, i) => String(i + 1)), 'รวม')
  h1.push(...Array.from({ length: finalCols }, (_, i) => String(i + 1)), 'รวม')

  const body: string[][] = [h1]
  for (const student of students) {
    const score = scoreForTerm(data, student.id, subject.class_subject_id, activeTerm)
    const beforeValues = unitScoreValues(score, 0, split.beforeCount)
    const afterValues = unitScoreValues(score, split.beforeCount, split.afterCount)
    const row: string[] = [
      String(student.student_number || ''),
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
    body.push(row)
  }
  drawTableGrid(doc, box.left, y, colWidths, body, { rowH, fontSize: font, headerRows: 1, nameCol: 2 })
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
  const rowH = rowHeightMm(layout)
  const font = ptFromCssPx(layout.fontScorePx) - 2

  const tailCols = 6
  const fixed = [7, 14, 30]
  const scoreCols = beforeCols + afterCols + tailCols
  const scoreW = Math.max(4, (box.width - fixed.reduce((a, b) => a + b, 0)) / scoreCols)
  const colWidths = [...fixed, ...Array.from({ length: scoreCols }, () => scoreW)]

  const h1 = ['เลขที่', 'เลขประจำตัว', 'ชื่อ - สกุล']
  h1.push(...Array.from({ length: beforeCols }, (_, i) => String(i + 1)))
  h1.push(...Array.from({ length: afterCols }, (_, i) => String(i + 1)))
  h1.push('รวม', 'กลางภาค', 'ปลายภาค', `รวมภ.${activeTerm}`, 'ระดับ', 'หมายเหตุ')

  const body: string[][] = [h1]
  for (const student of students) {
    const score = scoreForTerm(data, student.id, subject.class_subject_id, activeTerm)
    const beforeValues = unitScoreValues(score, 0, split.beforeCount)
    const afterValues = unitScoreValues(score, split.beforeCount, split.afterCount)
    body.push([
      String(student.student_number || ''),
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
    ])
  }
  drawTableGrid(doc, box.left, y, colWidths, body, { rowH, fontSize: font, headerRows: 1, nameCol: 2 })
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

  const rowH = Math.min(rowHeightMm(layout), 5.2)
  const font = ptFromCssPx(layout.fontScorePx) - 1
  const cols = [7, 14, 38, 14, 14, 18, 18]
  const headers = ['เลขที่', 'เลขประจำตัว', 'ชื่อ - สกุล', 'คะแนน', 'ระดับ', 'อ่านคิดวิเคราะห์', 'คุณลักษณะ']
  const body: string[][] = [headers]
  const readingSummary = { excellent: 0, good: 0, pass: 0, fail: 0 }
  const characterSummary = { excellent: 0, good: 0, pass: 0, fail: 0 }
  for (const student of students) {
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
    body.push([
      String(student.student_number || ''),
      student.student_code || '',
      studentName(student),
      score?.term_total != null ? String(score.term_total) : '',
      scoreText(score),
      resultLevelNumber(readingLevel),
      resultLevelNumber(characterLevel),
    ])
  }
  y = drawTableGrid(doc, box.left, y, cols, body, { rowH, fontSize: font, headerRows: 1, nameCol: 2 }).bottom

  const gradeCounts = subjectGradeSummaryForTerm(data, subject, activeTerm)
  const studentsTotal = students.length
  y += 3
  const miniFont = ptFromCssPx(layout.fontTablePx) - 1
  const gradeRows: string[][] = [['สรุปผลการเรียน', '']]
  for (const column of SUBJECT_COVER_GRADE_LEVEL_COLUMNS) {
    gradeRows.push([`จำนวนนักเรียนที่ได้ผลการเรียน ${column.label}`, `${gradeCounts[column.key] || 0} คน`])
  }
  gradeRows.push(['รวมทั้งสิ้น', `${studentsTotal} คน`])
  const leftW = box.width * 0.38
  drawTableGrid(doc, box.left, y, [leftW * 0.72, leftW * 0.28], gradeRows, {
    rowH: 4.2,
    fontSize: miniFont,
    headerRows: 1,
  })

  const rightX = box.left + leftW + 3
  const rightW = box.width - leftW - 3
  const evalCols = [rightW / 5, rightW / 5, rightW / 5, rightW / 5, rightW / 5]
  drawTableGrid(doc, rightX, y, evalCols, [
    ['สรุปอ่าน คิด วิเคราะห์', '', '', '', ''],
    ['3 ดีเยี่ยม', '2 ดี', '1 ผ่าน', '0 ไม่ผ่าน', 'จำนวน'],
    [
      String(readingSummary.excellent),
      String(readingSummary.good),
      String(readingSummary.pass),
      String(readingSummary.fail),
      String(studentsTotal),
    ],
  ], { rowH: 4.2, fontSize: miniFont - 0.5, headerRows: 2 })

  const y2 = y + 4.2 * 3 + 2
  drawTableGrid(doc, rightX, y2, evalCols, [
    ['สรุปคุณลักษณะที่พึงประสงค์', '', '', '', ''],
    ['3 ดีเยี่ยม', '2 ดี', '1 ผ่าน', '0 ไม่ผ่าน', 'จำนวน'],
    [
      String(characterSummary.excellent),
      String(characterSummary.good),
      String(characterSummary.pass),
      String(characterSummary.fail),
      String(studentsTotal),
    ],
  ], { rowH: 4.2, fontSize: miniFont - 0.5, headerRows: 2 })
}

function drawScoresSection(ctx: DrawCtx, pageNumberStart: number) {
  const { data, term } = ctx
  const activeTerms: Array<1 | 2> = term === 0 ? [1, 2] : [term]
  const chunks = chunkStudentsForPrintPages(data.students)
  let pageNum = pageNumberStart

  for (const activeTerm of activeTerms) {
    for (const chunk of chunks) {
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
}

function drawCharacterPage(ctx: DrawCtx, students: ReportStudent[], pageNumber: number) {
  const { doc, data, term, layouts } = ctx
  const layout = layouts.character
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  let y = drawSubjectHead(doc, ctx, layout, 'ผลการประเมินคุณลักษณะอันพึงประสงค์', term, box.top)

  const rowH = rowHeightMm(layout)
  const font = ptFromCssPx(layout.fontTablePx) - 1
  const scoreCols = 10
  const fixed = [7, 14, 36]
  const tail = [10, 14, 12]
  const scoreW = Math.max(4, (box.width - fixed.reduce((a, b) => a + b, 0) - tail.reduce((a, b) => a + b, 0)) / scoreCols)
  const colWidths = [...fixed, ...Array.from({ length: scoreCols }, () => scoreW), ...tail]
  const headers = ['เลขที่', 'เลขประจำตัว', 'ชื่อ - สกุล', ...Array.from({ length: scoreCols }, (_, i) => String(i + 1)), 'ระดับ', 'ผล', 'หมายเหตุ']
  const body: string[][] = [headers]
  const rowCount = pp5StudentTableRows(students.length, layout)
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    if (!student) {
      body.push(Array(colWidths.length).fill(''))
      continue
    }
    const row = term !== 0 ? rowForTerm(data.evaluations.character, student.id, term) : rowFor(data.evaluations.character, student.id)
    const fallbackResult = levelFromAverage(averageScore(row, CHARACTER_KEYS))
    const result = (row?.result_level as string | null) || (fallbackResult === '-' ? '' : fallbackResult)
    body.push([
      String(student.student_number || i + 1),
      student.student_code || '',
      studentName(student),
      ...Array.from({ length: scoreCols }, (_, si) => (si < CHARACTER_KEYS.length ? String(row?.[CHARACTER_KEYS[si]] ?? '') : '')),
      resultLevelNumber(result),
      result,
      '',
    ])
  }
  drawTableGrid(doc, box.left, y, colWidths, body, { rowH, fontSize: font, headerRows: 1, nameCol: 2 })
}

function drawReadingPage(ctx: DrawCtx, students: ReportStudent[], pageNumber: number) {
  const { doc, data, term, layouts } = ctx
  const layout = layouts.reading
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  let y = drawSubjectHead(doc, ctx, layout, 'ผลการประเมินอ่าน คิดวิเคราะห์ และเขียนสื่อความหมาย', term, box.top)

  const readingGroups = defaultReadingTableGroups()
  const readingColumns = readingTableFlatColumns(readingGroups)
  const columnKey = (column: ReadingTableColumn, index: number) =>
    column.kind === 'score' ? column.key : column.kind === 'total' ? `total-${index}` : `spacer-${index}`
  const columnLabel = (column: ReadingTableColumn) =>
    column.kind === 'score' || column.kind === 'total' ? column.label : ''

  const rowH = rowHeightMm(layout)
  const font = ptFromCssPx(layout.fontTablePx) - 1
  const fixed = [7, 14, 30]
  const tail = [12, 10, 14]
  const midW = Math.max(4, (box.width - fixed.reduce((a, b) => a + b, 0) - tail.reduce((a, b) => a + b, 0)) / readingColumns.length)
  const colWidths = [...fixed, ...readingColumns.map(() => midW), ...tail]
  const headers = ['เลขที่', 'เลขประจำตัว', 'ชื่อ - สกุล', ...readingColumns.map(columnLabel), 'รวม', 'ระดับ', 'ผล']
  const maxRow = ['', '', '', ...readingColumns.map(c => String(readingTableColumnMax(c))), '', '', '']
  const body: string[][] = [headers, maxRow]
  const rowCount = pp5StudentTableRows(students.length, layout)
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    if (!student) {
      body.push(Array(colWidths.length).fill(''))
      continue
    }
    const row = term !== 0 ? rowForTerm(data.evaluations.reading, student.id, term) : rowFor(data.evaluations.reading, student.id)
    const total = row ? String(row.total_score ?? READING_KEYS.reduce((sum, key) => sum + Number(row[key] ?? 0), 0)) : ''
    const fallbackResult = levelFromAverage(averageScore(row, READING_KEYS))
    const result = (row?.result_level as string | null) || (fallbackResult === '-' ? '' : fallbackResult)
    body.push([
      String(student.student_number || i + 1),
      student.student_code || '',
      studentName(student),
      ...readingColumns.map(col => String(readingTableColumnValue(row, col))),
      total,
      resultLevelNumber(result),
      result,
    ])
  }
  drawTableGrid(doc, box.left, y, colWidths, body, { rowH, fontSize: font, headerRows: 2, nameCol: 2 })
}

function drawCompetencyPage(ctx: DrawCtx, students: ReportStudent[], pageNumber: number) {
  const { doc, data, term, layouts } = ctx
  const layout = layouts.competency
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  let y = drawSubjectHead(doc, ctx, layout, 'ผลการประเมินสมรรถนะสำคัญของผู้เรียน', term, box.top)

  const rowH = rowHeightMm(layout)
  const font = ptFromCssPx(layout.fontTablePx) - 1
  const fixed = [8, 52]
  const scoreW = Math.max(12, (box.width - fixed.reduce((a, b) => a + b, 0) - 18) / COMPETENCY_KEYS.length)
  const colWidths = [...fixed, ...COMPETENCY_KEYS.map(() => scoreW), 18]
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
  drawTableGrid(doc, box.left, y, colWidths, body, { rowH, fontSize: font, headerRows: 1, nameCol: 1 })
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

export async function buildPp5SubjectPdfBlob(options: Pp5SubjectPdfOptions): Promise<{ blob: Blob; fileName: string }> {
  const { data, subject, term, sections, previewSection } = options
  if (!data.students.length) throw new Error('ไม่พบข้อมูลนักเรียนสำหรับสร้าง ปพ.5 รายวิชา')

  const layouts = { ...DEFAULT_PP5_PRINT_LAYOUTS, ...options.layouts }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  await applyThaiFonts(doc)

  const sigKeys = ['teacher', 'subject_head', 'measurement_head', 'academic_head', 'vice_director', 'director', 'homeroom'] as const
  const [logoData, ...sigUrls] = await Promise.all([
    loadImageDataUrl(data.school?.logo_url, 160, 0.7),
    ...sigKeys.map(k => loadImageDataUrl(data.documentSignatures?.[k], 220, 0.75)),
  ])
  const signatures = Object.fromEntries(sigKeys.map((k, i) => [k, sigUrls[i]])) as Record<string, string | null>

  const ctx: DrawCtx = { doc, data, subject, term, layouts, logoData, signatures }
  let pageNum = 0
  let started = false

  const nextPage = () => {
    if (pageNum > 0) doc.addPage()
    pageNum += 1
    started = true
  }

  for (const section of SECTION_ORDER) {
    if (!includeSection(sections, previewSection, section)) continue

    if (section === 'cover') {
      nextPage()
      drawPageMark(doc, pageNum)
      await drawCoverPage(ctx)
      continue
    }

    if (section === 'criteria') {
      nextPage()
      drawCriteriaPages(ctx, pageNum)
      continue
    }

    if (section === 'attendance') {
      nextPage()
      drawAttendanceSection(ctx, pageNum)
      continue
    }

    if (section === 'scores') {
      nextPage()
      drawScoresSection(ctx, pageNum)
      continue
    }

    if (section === 'character') {
      nextPage()
      drawStudentChunkSection(ctx, drawCharacterPage, pageNum)
      continue
    }

    if (section === 'reading') {
      nextPage()
      drawStudentChunkSection(ctx, drawReadingPage, pageNum)
      continue
    }

    if (section === 'competency') {
      nextPage()
      drawStudentChunkSection(ctx, drawCompetencyPage, pageNum)
    }
  }

  const classText = data.classroom ? `${data.classroom.level}-${data.classroom.room}` : 'รายงาน'
  const yearText = data.academicYear?.year_be || ''
  const nameParts = ['ปพ.5 รายวิชา', classText, subject.subject.code?.trim(), subject.subject.name?.trim(), yearText].filter(Boolean)
  const fileName = (options.fileName || `${nameParts.join('_')}.pdf`).replace(/[\\/:*?"<>|]/g, '-')

  if (!started) throw new Error('ไม่มีส่วนรายงานที่เลือกสำหรับสร้าง PDF')

  return { blob: doc.output('blob'), fileName }
}
