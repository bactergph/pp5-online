import { jsPDF } from 'jspdf'
import type {
  ReportDailyAttendanceRecord,
  ReportCalendarDay,
  ReportPayload,
  ReportScore,
  ReportStudent,
  ReportSubject,
} from '@/app/(shell)/reports/actions'
import { documentQrUrl } from '@/lib/document-qr-url'
import { expandEducationAreaOffice } from '@/lib/education-area-office'
import {
  characterCriteriaTopics,
  readingCriteriaTopics,
  totalActiveActivityHours,
} from '@/lib/evaluation-settings'
import { drawJsPdfCheckbox } from '@/lib/jspdf-check-mark'
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
import { chunkStudentsForPrintPages } from '@/lib/print-student-pages'
import { qrDataUrl } from '@/lib/qr-data-url'
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

const PAGE_W = 210
const PAGE_H = 297
const PX_TO_MM = 25.4 / 96
const BORDER: [number, number, number] = [17, 24, 39]
const MUTED_BG: [number, number, number] = [217, 217, 217]
const TEXT: [number, number, number] = [17, 24, 39]
const PP5_CLASS_DOC_MARK = '(รวมวิชา)'
const THAI_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const CHARACTER_KEYS = Array.from({ length: 8 }, (_, i) => `trait${i + 1}_score`)
const READING_KEYS = [...READING_SCORE_KEYS]
const COMPETENCY_KEYS = Array.from({ length: 5 }, (_, i) => `competency${i + 1}_score`)
const COMPETENCY_LABELS = ['สื่อสาร', 'คิด', 'แก้ปัญหา', 'ทักษะชีวิต', 'เทคโนโลยี']
const ACTIVITY_KEYS = ['guidance_result', 'scout_result', 'club_result', 'public_service_result']
const ACTIVITY_LABELS = ['แนะแนว', 'ลูกเสือ/เนตรนารี/ยุวกาชาติ', 'ชุมนุม', 'จิตอาสา']

const CLASS_COVER_MIN_SUBJECT_ROWS = 13
const CLASS_ACHIEVEMENT_MAX_SUBJECTS = 15
const ATTENDANCE_DAYS_PER_WEEK = 7
const ATTENDANCE_WEEKS_PER_PAGE = 4

const CLASS_COVER_GRADE_COLUMNS = [
  { key: '0', label: '0, ร, มส' },
  { key: '1', label: '1' },
  { key: '1.5', label: '1.5' },
  { key: '2', label: '2' },
  { key: '2.5', label: '2.5' },
  { key: '3', label: '3' },
  { key: '3.5', label: '3.5' },
  { key: '4', label: '4' },
]

export type Pp5ClassPdfSection =
  | 'cover'
  | 'criteria'
  | 'attendance'
  | 'scores'
  | 'achievement'
  | 'character'
  | 'reading'
  | 'competency'
  | 'activities'

export type Pp5ClassPdfOptions = {
  data: ReportPayload
  term: 0 | 1 | 2
  sections: Pp5ClassPdfSection[]
  layouts: Pp5PrintLayouts
  previewSection?: Pp5ClassPdfSection
  fileName?: string
}

export type Pp5ClassPdfBuildOptions = {
  /** ใช้ doc ที่สร้างไว้แล้ว (เช่น ฝั่งเซิร์ฟเวอร์ติดตั้งฟอนต์จากดิสก์แล้ว) */
  doc?: jsPDF
  skipApplyFonts?: boolean
}

type DrawCtx = {
  doc: jsPDF
  data: ReportPayload
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

function classroomLevelLabel(level: string) {
  const match = level.match(/(\d+)/)
  const digit = match?.[1] || level
  if (/ม\.|มัธยม/i.test(level)) return `มัธยมศึกษาปีที่ ${digit}`
  if (/ป\.|ประถม/i.test(level)) return `ประถมศึกษาปีที่ ${digit}`
  if (level.startsWith('ม')) return `มัธยมศึกษาปีที่ ${digit}`
  return `ประถมศึกษาปีที่ ${digit}`
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

function numericGrade(score: ReportScore | null) {
  if (!score || score.grade === null || score.grade === undefined) return null
  return Number.isFinite(Number(score.grade)) ? Number(score.grade) : null
}

function studentGpa(data: ReportPayload, studentId: string, subjects: ReportSubject[]) {
  let weighted = 0
  let weightTotal = 0
  for (const subject of subjects) {
    const grade = numericGrade(finalScoreForSubject(data, studentId, subject.class_subject_id))
    if (grade === null) continue
    const weight = Number(subject.subject.credits || 0) > 0 ? Number(subject.subject.credits) : 1
    weighted += grade * weight
    weightTotal += weight
  }
  return weightTotal > 0 ? weighted / weightTotal : null
}

function scoreText(score: ReportScore | null) {
  if (!score) return '-'
  if (score.result && score.result !== 'เรียน') return score.result
  return score.grade === null || score.grade === undefined ? '-' : String(score.grade)
}

function gradeBucket(score: ReportScore | null) {
  if (!score) return null
  if (score.result && score.result !== 'เรียน') return '0'
  if (score.grade === null || score.grade === undefined) return null
  return String(score.grade)
}

function subjectGradeSummary(data: ReportPayload, subject: ReportSubject) {
  const counts = Object.fromEntries(CLASS_COVER_GRADE_COLUMNS.map(c => [c.key, 0])) as Record<string, number>
  for (const student of data.students) {
    const bucket = gradeBucket(scoreFor(data, student.id, subject.class_subject_id))
    if (bucket && bucket in counts) counts[bucket] += 1
  }
  return counts
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

function activitySummary(data: ReportPayload) {
  const out = { total: data.students.length, pass: 0, fail: 0 }
  for (const student of data.students) {
    const row = rowFor(data.evaluations.activities, student.id)
    const passed = !!row && ACTIVITY_KEYS.every(key => row[key] === 'ผ่าน')
    if (passed) out.pass += 1
    else out.fail += 1
  }
  return out
}

function activityLabel(data: ReportPayload, index: number) {
  const setting = data.activitySettings?.find(item => item.field_key === ACTIVITY_KEYS[index])
  return setting?.label || ACTIVITY_LABELS[index]
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

function classReportSubhead(data: ReportPayload, term: 0 | 1 | 2) {
  const classroom = data.classroom
  const termLabel = term === 0 ? 'สรุปทั้งปี' : `ภาคเรียนที่ ${term}`
  if (!classroom) return `${termLabel} ปีการศึกษา ${data.academicYear?.year_be || '-'}`
  return `ชั้น ${classroomLevelLabel(classroom.level)} ห้อง ${classroom.room} ${termLabel} ปีการศึกษา ${data.academicYear?.year_be || '-'}`
}

/** บรรทัดหัวตามพรีวิว HTML ปพ.5 รวมชั้น (คะแนน / กิจกรรม) */
function classSchoolLine(data: ReportPayload) {
  return `นักเรียนชั้นประถมศึกษาปีที่ ${classLabel(data.classroom)}  โรงเรียน${data.school?.name || '-'}  ปีการศึกษา ${data.academicYear?.year_be || '-'}`
}

function classElementaryTitlePrefix() {
  return 'ชั้นประถมศึกษาปีที่'
}

function compactSubjectName(subject: ReportSubject) {
  if (subject.subject.short_name?.trim()) return subject.subject.short_name.trim()
  return subject.subject.name.trim()
    .replace(/^ภาษาไทย/, 'ไทย')
    .replace(/^คณิตศาสตร์/, 'คณิต')
    .replace(/^วิทยาศาสตร์และเทคโนโลยี/, 'วิทย์')
    .replace(/^วิทยาศาสตร์/, 'วิทย์')
    .replace(/^สังคมศึกษา\s*ศาสนาและวัฒนธรรม/, 'สังคม ฯ')
    .replace(/^สังคมศึกษา/, 'สังคม ฯ')
    .replace(/^ประวัติศาสตร์/, 'ประวัติ')
    .replace(/^สุขศึกษาและพลศึกษา/, 'สุขฯ')
    .replace(/^สุขศึกษา/, 'สุขฯ')
    .replace(/^พลศึกษา/, 'พละ')
    .replace(/^การงานอาชีพ/, 'การงาน')
    .replace(/^ภาษาอังกฤษ/, 'อังกฤษ')
}

function directorDecisionFlags(signatures?: ReportPayload['documentSignatures'] | null) {
  const decision = String(signatures?.director_decision || '').trim()
  const approved = decision === 'อนุมัติ' || (!decision && Boolean(signatures?.director))
  return {
    approved: approved && decision !== 'ไม่อนุมัติ',
    rejected: decision === 'ไม่อนุมัติ',
  }
}

/* ---------- ปฏิทินเวลาเรียนรายวัน (คัดลอกตรรกะจาก ReportBuilder) ---------- */

type AttendanceWeek = {
  weekNumber: number
  days: { date: Date; key: string; dayNumber: number; dayIndex: number }[]
}

type AttendanceDayCell = {
  weekday: number
  colIndex: number
  date: Date | null
  key: string | null
  dayNumber: number | null
  dayIndex: number | null
  isWeekend: boolean
}

const ATTENDANCE_WEEK_LABELS = [1, 2, 3, 4, 5, 6, 0] as const

function parseDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00`) : null
}

function dateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function attendanceWeeks(start: Date | null, end: Date | null) {
  if (!start || !end) return []
  const weeks: AttendanceWeek[] = []
  let currentWeek: AttendanceWeek | null = null
  let schoolDayIndex = 0
  const cursor = new Date(start)
  while (cursor <= end) {
    if (!currentWeek || currentWeek.days.length >= ATTENDANCE_DAYS_PER_WEEK) {
      currentWeek = { weekNumber: weeks.length + 1, days: [] }
      weeks.push(currentWeek)
    }
    schoolDayIndex += 1
    currentWeek.days.push({
      date: new Date(cursor),
      key: dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
      dayNumber: cursor.getDate(),
      dayIndex: schoolDayIndex,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return weeks
}

function expandAttendanceWeek(week: AttendanceWeek): AttendanceDayCell[] {
  return ATTENDANCE_WEEK_LABELS.map((weekday, colIndex) => {
    const day = week.days[colIndex]
    const isWeekend = day ? [0, 6].includes(day.date.getDay()) : false
    if (!day) return { weekday, colIndex, date: null, key: null, dayNumber: null, dayIndex: null, isWeekend }
    return {
      weekday,
      colIndex,
      date: day.date,
      key: day.key,
      dayNumber: day.dayNumber,
      dayIndex: day.dayIndex,
      isWeekend,
    }
  })
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function weekMonthLabel(week: AttendanceWeek) {
  const months = [...new Set(week.days.map(day => day.date.getMonth()))]
  return months.length === 1
    ? THAI_MONTH_SHORT[months[0]]
    : months.map(month => THAI_MONTH_SHORT[month]).join('-')
}

function attendanceDateRange(data: ReportPayload, term: 0 | 1 | 2) {
  const year = data.academicYear
  if (!year) return { start: null, end: null }
  if (term === 0) return { start: parseDate(year.term1_start_date), end: parseDate(year.term2_end_date) }
  return term === 1
    ? { start: parseDate(year.term1_start_date), end: parseDate(year.term1_end_date) }
    : { start: parseDate(year.term2_start_date), end: parseDate(year.term2_end_date) }
}

function attendanceRecordMap(records: ReportDailyAttendanceRecord[]) {
  const out = new Map<string, string>()
  for (const record of records) out.set(`${record.student_id}:${record.date}`, record.status)
  return out
}

function calendarDayMap(days: ReportCalendarDay[]) {
  return new Map(days.map(day => [day.date, day.name || '']))
}

function isAttendanceSchoolDay(
  date: Date,
  key: string,
  holidayMap: Map<string, string>,
  openWeekendMap: Map<string, string>,
) {
  const isWeekend = [0, 6].includes(date.getDay())
  const isHoliday = holidayMap.has(key)
  return !isHoliday && (!isWeekend || openWeekendMap.has(key))
}

function attendanceSchoolDayKeysForTerm(
  data: ReportPayload,
  term: 1 | 2,
  holidayMap: Map<string, string>,
  openWeekendMap: Map<string, string>,
) {
  const { start, end } = attendanceDateRange(data, term)
  const keys: string[] = []
  if (!start || !end) return keys
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    if (isAttendanceSchoolDay(cursor, key, holidayMap, openWeekendMap)) keys.push(key)
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

function summarizeAttendanceKeys(studentId: string, keys: string[], recordMap: Map<string, string>) {
  const summary = { leave: 0, sick: 0, absent: 0, present: 0 }
  for (const key of keys) {
    const status = recordMap.get(`${studentId}:${key}`)
    if (status === '-') continue // ช่องว่างที่เก็บแล้ว ≠ มา
    if (status === 'ป') summary.sick += 1
    else if (status === 'ล') summary.leave += 1
    else if (status === 'ข') summary.absent += 1
    else summary.present += 1 // ไม่มีแถวหรือ ม
  }
  return summary
}

/* ---------- primitives การวาด ---------- */

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
    fill?: [number, number, number]
  },
) {
  const fontSize = opts?.fontSize ?? 10
  const pad = opts?.padMm ?? 1.1
  const align = opts?.align || 'left'
  const vAlign = opts?.vAlign || 'top'
  if (opts?.fill) {
    setFill(doc, opts.fill)
    doc.rect(x, y, w, h, 'F')
  }
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

/** หัวตารางแนวตั้ง — เทียบ writing-mode ของพรีวิว HTML */
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
  doc.text(String(pageNumber), PAGE_W - 12, 8, { align: 'right' })
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

/** หัวหน้ารายงานแบบรายห้อง — ไม่มีบรรทัดรายวิชา */
function drawClassHead(
  doc: jsPDF,
  ctx: DrawCtx,
  layout: Pp5SectionLayout,
  title: string,
  activeTerm: 0 | 1 | 2,
  y: number,
  subline?: string,
) {
  const box = contentBox(layout)
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  doc.text(fitText(doc, title, box.width), box.left + box.width / 2, y, { align: 'center' })
  y += pxToMm96(layout.fontH1Px) * 0.5 + 1.5
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  const sub = subline ?? classReportSubhead(ctx.data, activeTerm)
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

/* ---------- หน้าปก ---------- */

async function drawCoverPage(ctx: DrawCtx) {
  const { doc, data, term, layouts, logoData, signatures } = ctx
  const layout = layouts.coverClass
  const box = contentBox(layout)
  const RULE: [number, number, number] = [209, 213, 219]
  const borderW = layout.borderWidthMm
  const cellOpts = { borderWidthMm: borderW, textNudgeMm: layout.cellTextNudgeMm }

  const infoFont = ptFromCssPx(layout.fontInfoPx)
  const tableFont = ptFromCssPx(layout.fontTablePx)
  const tableSmallFont = ptFromCssPx(layout.fontTableSmallPx)
  const bannerFont = ptFromCssPx(layout.fontTablePx + layout.bannerFontBoostPx)
  const rowH = Math.max(3.2, pxToMm96(Math.max(layout.tableRowHeightPx, layout.fontTablePx * 0.7 + layout.tableCellPadPx * 2)))
  const infoRowH = pxToMm96(layout.fontInfoPx * layout.infoLineHeight + layout.infoRowPadPx * 2)

  const subjects = data.subjects
  const paddedSubjects: Array<ReportSubject | null> = [...subjects]
  while (paddedSubjects.length < CLASS_COVER_MIN_SUBJECT_ROWS) paddedSubjects.push(null)
  const studentsTotal = data.students.length
  const subjectHours = subjects.reduce((sum, s) => sum + (s.subject.hours_per_year || 0), 0)
  const activityHours = totalActiveActivityHours(data.activitySettings || [])
  const hoursPerYear = subjectHours + activityHours
  const character = evaluationSummary(data, data.evaluations.character, CHARACTER_KEYS)
  const reading = evaluationSummary(data, data.evaluations.reading, READING_KEYS)
  const competency = evaluationSummary(data, data.evaluations.competency, COMPETENCY_KEYS)
  const activities = activitySummary(data)
  const homeroomTeacher = homeroomTeacherLine(data.classroom)

  const countDisplay = (count: number) => (count > 0 ? String(count) : '-')

  let y = box.top + px(layout.logoOffsetYPx)

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

  const writeRightPair = (rightX: number, textY: number, label: string, value: string, gap = 1.2) => {
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(infoFont)
    const labelW = doc.getTextWidth(label)
    doc.setFont('THSarabunNew', 'normal')
    const valueW = doc.getTextWidth(value)
    writeAt(rightX - valueW - gap - labelW, textY, label, { bold: true })
    writeAt(rightX - valueW, textY, value)
  }

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

  // 1. Doc mark
  const markX = PAGE_W - px(layout.docMarkRightPx)
  const markY = px(layout.docMarkTopPx)
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.docMarkFontPx))
  setText(doc)
  doc.text('ปพ.5', markX, markY, { align: 'right', baseline: 'top' })
  doc.text(PP5_CLASS_DOC_MARK, markX, markY + px(layout.docMarkLineGapPx), { align: 'right', baseline: 'top' })

  // 2. โลโก้ + ชื่อเอกสาร
  const logoSize = px(layout.logoSizePx)
  const logoX = box.left + (box.width - logoSize) / 2 + px(layout.logoOffsetXPx)
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', logoX, y, logoSize, logoSize)
    } catch {
      drawCell(doc, logoX, y, logoSize, logoSize, data.school?.name?.slice(0, 2) || 'รร', { fontSize: 14, bold: true, ...cellOpts })
    }
  } else {
    drawCell(doc, logoX, y, logoSize, logoSize, data.school?.name?.slice(0, 2) || 'รร', { fontSize: 14, bold: true, ...cellOpts })
  }
  y += logoSize + px(layout.logoGapPx)

  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  doc.text('แบบบันทึกผลการเรียนประจำรายวิชา', box.left + box.width / 2, y, { align: 'center', baseline: 'top' })
  y += pxToMm96(layout.fontH1Px) * 0.9 + px(layout.headerGapPx)

  // 3. ข้อมูลโรงเรียน / ชั้น / ครูประจำชั้น
  y += px(layout.infoTopGapPx)
  doc.setFontSize(infoFont)

  drawInfoRow(textY => {
    let x = writeLabelValue(box.left, textY, 'โรงเรียน', data.school?.name || '-', 0.2, true)
    x += px(10)
    writeLabelValue(x, textY, 'อำเภอ', data.school?.district || '-', 1.2, true)
    writeAt(box.right, textY, schoolOfficeLine(data), { align: 'right', bold: true, maxW: box.width * 0.42 })
  })

  const classWeights = [1.4, 0.85, 0.75, 1]
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
    // พรีวิว HTML: ชั้นประถมศึกษาปีที่ {classLabel} เช่น ป.1/1
    writeLabelValue(
      colX(classWeights, 0),
      textY,
      'ชั้นประถมศึกษาปีที่',
      classLabel(data.classroom),
    )
    centeredLabelValue(
      colX(classWeights, 1) + colW(classWeights, 1) / 2,
      textY,
      'ปีการศึกษา',
      String(data.academicYear?.year_be || '-'),
    )
    const c2 = colX(classWeights, 2) + colW(classWeights, 2) / 2
    if (term === 0) writeAt(c2, textY, 'สรุปทั้งปี', { align: 'center', bold: true })
    else centeredLabelValue(c2, textY, 'ภาคเรียนที่', String(term))
    const hoursRight = colX(classWeights, 3) + colW(classWeights, 3)
    writeRightPair(hoursRight, textY, 'เวลาเรียน', `${hoursPerYear || '-'} ชั่วโมง/ปี`)
  })

  drawInfoRow(textY => {
    writeLabelValue(box.left, textY, 'ครูประจำชั้น', homeroomTeacher)
  })

  // 4. ตารางสรุปผลการเรียนรายวิชา — กว้างตรง CSS พรีวิว (px → mm)
  y += layout.tableTopMm
  const numW = px(26)
  const codeW = px(58)
  const nameW = px(170)
  const totalStudentW = px(46)
  const noteW = px(60)
  const gradeW = Math.max(
    6,
    (box.width - numW - codeW - nameW - totalStudentW - noteW) / CLASS_COVER_GRADE_COLUMNS.length,
  )
  const colWidths = [numW, codeW, nameW, totalStudentW, ...CLASS_COVER_GRADE_COLUMNS.map(() => gradeW), noteW]
  const gradeSpanW = gradeW * CLASS_COVER_GRADE_COLUMNS.length
  const HEADER_BG: [number, number, number] = [248, 250, 252]

  const headTop = y
  drawCell(doc, box.left, headTop, numW, rowH * 3, 'ที่', { bold: true, fontSize: tableFont, fill: HEADER_BG, ...cellOpts })
  drawCell(doc, box.left + numW, headTop, codeW, rowH * 3, 'รหัส\nวิชา', { bold: true, fontSize: tableSmallFont, noFit: true, fill: HEADER_BG, ...cellOpts })
  drawCell(doc, box.left + numW + codeW, headTop, nameW, rowH * 3, 'รายวิชา', { bold: true, fontSize: tableFont, fill: HEADER_BG, ...cellOpts })
  drawCell(doc, box.left + numW + codeW + nameW, headTop, totalStudentW, rowH * 3, 'จำนวน\nนักเรียน', {
    bold: true, fontSize: tableSmallFont, noFit: true, fill: HEADER_BG, ...cellOpts,
  })
  const gradeStartX = box.left + numW + codeW + nameW + totalStudentW
  drawCell(doc, gradeStartX, headTop, gradeSpanW, rowH * 2, 'สรุปผลการเรียน\nจำนวนนักเรียนที่ได้รับผลการเรียน', {
    bold: true, fontSize: Math.min(bannerFont, tableSmallFont), noFit: true, fill: HEADER_BG, ...cellOpts,
  })
  drawVerticalHeaderCell(doc, gradeStartX + gradeSpanW, headTop, noteW, rowH * 3, 'หมายเหตุ', {
    bold: true, fontSize: Math.max(7, tableSmallFont - 2), fill: HEADER_BG,
  })
  let gx = gradeStartX
  for (const column of CLASS_COVER_GRADE_COLUMNS) {
    drawCell(doc, gx, headTop + rowH * 2, gradeW, rowH, column.label, { bold: true, fontSize: tableSmallFont, fill: HEADER_BG, ...cellOpts })
    gx += gradeW
  }
  y = headTop + rowH * 3

  paddedSubjects.forEach((subject, index) => {
    const counts = subject ? subjectGradeSummary(data, subject) : null
    const cells = [
      String(index + 1),
      subject?.subject.code || '',
      subject?.subject.name || '',
      subject ? String(studentsTotal) : '',
      ...CLASS_COVER_GRADE_COLUMNS.map(column => (counts ? String(counts[column.key] || '-') : '')),
      '',
    ]
    let cx = box.left
    cells.forEach((cell, ci) => {
      drawCell(doc, cx, y, colWidths[ci], rowH, cell, {
        fontSize: tableSmallFont,
        align: ci === 2 ? 'left' : 'center',
        ...cellOpts,
      })
      cx += colWidths[ci]
    })
    y += rowH
  })

  // 5. กล่องสรุปผลการประเมิน 4 กล่อง (2×2)
  y += px(layout.summaryGapPx)
  const evalGap = px(layout.evalGapPx)
  const evalW = (box.width - evalGap) / 2

  const drawEvalBox = (
    bx: number,
    by: number,
    title: string,
    headers: string[],
    values: string[],
  ) => {
    // พรีวิว class cover: คอลัมน์เท่ากัน (ไม่มี evalFirstColPct แบบรายวิชา)
    const cols = headers.map(() => evalW / headers.length)
    drawCell(doc, bx, by, evalW, rowH, title, { bold: true, fontSize: tableSmallFont - 1, fill: HEADER_BG, ...cellOpts })
    headers.forEach((header, i) => {
      const ox = bx + cols.slice(0, i).reduce((a, b) => a + b, 0)
      drawCell(doc, ox, by + rowH, cols[i], rowH, header, { bold: true, fontSize: tableSmallFont - 1, fill: HEADER_BG, ...cellOpts })
    })
    values.forEach((value, i) => {
      const ox = bx + cols.slice(0, i).reduce((a, b) => a + b, 0)
      drawCell(doc, ox, by + rowH * 2, cols[i], rowH, value, { fontSize: tableSmallFont, ...cellOpts })
    })
  }

  const levelHeaders = ['จำนวนนักเรียนทั้งหมด', 'ดีเยี่ยม', 'ดี', 'ผ่าน', 'ไม่ผ่าน']
  const levelValues = (summary: typeof character) => [
    String(summary.total),
    String(summary.excellent),
    String(summary.good),
    String(summary.pass),
    countDisplay(summary.fail),
  ]

  drawEvalBox(box.left, y, 'สรุปผลการประเมินคุณลักษณะอันพึงประสงค์', levelHeaders, levelValues(character))
  drawEvalBox(box.left + evalW + evalGap, y, 'สรุปผลการประเมินสมรรถนะสำคัญของผู้เรียน', levelHeaders, levelValues(competency))
  const secondRowY = y + rowH * 3
  drawEvalBox(box.left, secondRowY, 'สรุปผลการประเมินอ่าน คิด วิเคราะห์ เขียน', levelHeaders, levelValues(reading))
  drawEvalBox(
    box.left + evalW + evalGap,
    secondRowY,
    'สรุปผลการประเมินกิจกรรมพัฒนาผู้เรียน',
    ['จำนวนนักเรียนทั้งหมด', 'ผ่าน', 'ไม่ผ่าน'],
    [String(activities.total), String(activities.pass), countDisplay(activities.fail)],
  )
  y = secondRowY + rowH * 3 + px(layout.approvalGapPx)

  // 6. ลายเซ็นและการอนุมัติ
  const sigFont = ptFromCssPx(layout.fontSignaturePx)
  const sigLineFont = ptFromCssPx(Math.max(layout.fontSignaturePx, 18))
  const sigImgH = layout.sigImageHeightMm
  const SIGN_DOTS = '...........................................'
  const lineH = pxToMm96(layout.fontSignaturePx) * 1.25
  const pageBottom = PAGE_H - layout.padBottomMm

  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(sigFont)
  setText(doc)
  doc.text('เสนอเพื่อโปรดพิจารณาอนุมัติ', box.left + box.width / 2, y, { align: 'center', baseline: 'top' })
  y += lineH + px(8)

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

  const drawSigBlock = (bx: number, by: number, bw: number, block: { url?: string | null; name: string; line: string }) => {
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

  const viceDirectorName = data.school?.vice_director_name?.trim()
  const directorPos = directorActingPositionLine(data.school)
  const directorName = directorDisplayName(data.school)
  const schoolLine = directorSchoolLine(data.school)
  const decision = directorDecisionFlags(data.documentSignatures)

  let colGap = px(64)
  let sidePad = px(48)
  let blockH = Math.max(px(64), sigImgH + layout.sigNameGapMm + lineH * 2 + 4)
  const directorBoxH = viceDirectorName
    ? Math.max(px(104), sigImgH + layout.sigNameGapMm + lineH * 4 + px(50))
    : px(126)
  const neededH = blockH + layout.sigAfterBlocksMm + directorBoxH
  const availH = pageBottom - y
  if (neededH > availH && availH > 40) {
    const scale = availH / neededH
    colGap = Math.max(px(24), colGap * scale)
    sidePad = Math.max(px(16), sidePad * scale)
    blockH = Math.max(px(40), blockH * scale)
  }

  const sigColW = (box.width - sidePad * 2 - colGap) / 2
  drawSigBlock(box.left + sidePad, y, sigColW, {
    url: signatures.homeroom,
    name: homeroomTeacher,
    line: 'ครูประจำชั้น',
  })
  drawSigBlock(box.left + sidePad + sigColW + colGap, y, sigColW, {
    url: signatures.academic_head,
    name: data.school?.academic_head_name || '—',
    line: 'หัวหน้าวิชาการ',
  })
  y += blockH + layout.sigAfterBlocksMm

  const drawCheck = (cx: number, cy: number, label: string, checked = false) => {
    // CSS .pp5-class-cover-checkbox = 11px
    const size = px(11) * 0.95
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
    drawCheck(optCenter - opt1W / 2, y + px(14), opt1Label, decision.rejected)
    const opt2Fitted = fitText(doc, 'อนุมัติ เมื่อวันที่...........................................', halfW - 10)
    const opt2W = checkSize + px(6) + doc.getTextWidth(opt2Fitted)
    drawCheck(optCenter - opt2W / 2, y + px(26), opt2Fitted, decision.approved)

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
    return
  }

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
  let ox = centerX - (approveW + gap + rejectW) / 2
  ox = drawCheck(ox, optY, approveLabel, decision.approved) + gap
  drawCheck(ox, optY, rejectLabel, decision.rejected)

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

/* ---------- เกณฑ์การประเมิน ---------- */

function drawCriteriaPages(ctx: DrawCtx, pageNumberStart: number) {
  const { doc, data, term, layouts } = ctx
  const layout = layouts.criteria
  const box = contentBox(layout)
  const font = ptFromCssPx(layout.criteriaFontPx)
  const rowH = 7

  const charTopics = characterCriteriaTopics(data.characterSettings)
  let pageNum = pageNumberStart
  drawPageMark(doc, pageNum)
  let y = drawClassHead(doc, ctx, layout, 'คุณลักษณะอันพึงประสงค์', term, box.top)
  // CSS: topic 38% / behavior 62%
  const topicW = box.width * 0.38
  const behaviorW = box.width - topicW
  const HEADER_BG: [number, number, number] = [248, 250, 252]
  drawCell(doc, box.left, y, topicW, rowH, 'คุณลักษณะอันพึงประสงค์', { fontSize: font, bold: true, fill: HEADER_BG })
  drawCell(doc, box.left + topicW, y, behaviorW, rowH, 'พฤติกรรมบ่งชี้', { fontSize: font, bold: true, fill: HEADER_BG })
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
  y = drawClassHead(doc, ctx, layout, 'อ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย', term, box.top)

  // CSS raw: topic 38% + behavior 62% + 4×rubric 16% → normalize to 100%
  const rawCols = [38, 62, 16, 16, 16, 16]
  const rawSum = rawCols.reduce((a, b) => a + b, 0)
  const stdW = box.width * (rawCols[0] / rawSum)
  const indW = box.width * (rawCols[1] / rawSum)
  const rubW = box.width * (rawCols[2] / rawSum)
  const headH1 = Math.max(5.2, rowH * 0.85)
  const headH2 = Math.max(7.2, rowH * 1.15)
  const rubricKeys = ['3', '2', '1', '0'] as const
  const rubricHeads = ['3\n(ดีเยี่ยม)', '2\n(ดี)', '1\n(ผ่านเกณฑ์)', '0\n(ปรับปรุง)']
  const bodyFont = Math.max(8, font - 1)
  const rubricFont = Math.max(7.5, font - 2)
  const READ_HEADER_BG: [number, number, number] = [248, 250, 252]

  drawCell(doc, box.left, y, stdW, headH1 + headH2, 'มาตรฐาน', { fontSize: font, bold: true, fill: READ_HEADER_BG })
  drawCell(doc, box.left + stdW, y, indW, headH1 + headH2, 'ตัวชี้วัด', { fontSize: font, bold: true, fill: READ_HEADER_BG })
  drawCell(doc, box.left + stdW + indW, y, rubW * 4, headH1, 'ระดับคุณภาพ', { fontSize: font, bold: true, fill: READ_HEADER_BG })
  rubricHeads.forEach((label, i) => {
    drawWrappedCell(doc, box.left + stdW + indW + i * rubW, y + headH1, rubW, headH2, label, {
      align: 'center',
      vAlign: 'middle',
      bold: true,
      fontSize: font - 1,
      padMm: 0.6,
      fill: READ_HEADER_BG,
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
        h = Math.max(h, measureH(indicator.rubricLevels?.[key] || '', rubW, rubricFont, 10))
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
        drawWrappedCell(doc, box.left + stdW + indW + ri * rubW, rowY, rubW, rh, indicator.rubricLevels?.[key] || '', {
          align: 'left',
          vAlign: 'top',
          fontSize: rubricFont,
        })
      })
      rowY += rh
    })
    y = rowY
  }
}

/* ---------- เวลาเรียนรายวัน ---------- */

function drawDailyAttendancePage(
  ctx: DrawCtx,
  activeTerm: 1 | 2,
  students: ReportStudent[],
  weeks: AttendanceWeek[],
  maps: {
    recordMap: Map<string, string>
    holidayMap: Map<string, string>
    openWeekendMap: Map<string, string>
  },
  pageNumber: number,
) {
  const { doc, data, layouts } = ctx
  const layout = layouts.attendance
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)

  let y = box.top
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  doc.text(`บันทึกเวลาเรียน ภาคเรียนที่ ${activeTerm}`, box.left + box.width / 2, y, { align: 'center' })
  y += 5
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  doc.text(fitText(doc, classSchoolLine(data), box.width), box.left + box.width / 2, y, { align: 'center' })
  y += 5

  const weekSlots = weeks.map(week => ({ week, slots: expandAttendanceWeek(week) }))
  const columns = weekSlots.flatMap(({ week, slots }) => slots.map(slot => ({ weekNumber: week.weekNumber, slot })))
  const rowCount = pp5AttendanceBodyRows(students.length, layout, 5)
  const headH = 3.8
  const rowH = Math.max(pxToMm96(27), rowHeightMm(layout))
  // CSS: 7 / 12 / 44 / 12
  const fixedCols = [7, 12, 44, 12]
  const fixedW = fixedCols.reduce((a, b) => a + b, 0)
  const dayW = Math.max(2.6, (box.width - fixedW) / Math.max(1, columns.length))
  const font = Math.max(5.5, ptFromCssPx(layout.fontNumberPx) - 1)
  const headFont = Math.max(5.5, font)
  const WEEK_BG: [number, number, number] = [224, 242, 254]
  const MONTH_BG: [number, number, number] = [254, 243, 199]
  const DAY_BG: [number, number, number] = [253, 230, 138]
  const DATE_BG: [number, number, number] = [248, 250, 252]
  const HOUR_BG: [number, number, number] = [229, 231, 235]
  const WEEKEND_BG: [number, number, number] = [253, 230, 138]
  const HOLIDAY_BG: [number, number, number] = [252, 165, 165]
  const OPEN_WEEKEND_BG: [number, number, number] = [187, 247, 208]
  const HEADER_BG: [number, number, number] = [248, 250, 252]

  const slotFill = (slot: { key: string | null; isWeekend: boolean; date: Date | null }) => {
    if (slot.key && maps.holidayMap.has(slot.key)) return HOLIDAY_BG
    if (slot.key && maps.openWeekendMap.has(slot.key)) return OPEN_WEEKEND_BG
    if (slot.isWeekend) return WEEKEND_BG
    return undefined
  }

  const headerTop = y
  const headerTotalH = headH * 5
  drawCell(doc, box.left, headerTop, fixedCols[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, box.left + fixedCols[0], headerTop, fixedCols[1], headerTotalH, 'เลขประจำตัว', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  drawCell(doc, box.left + fixedCols[0] + fixedCols[1], headerTop, fixedCols[2], headerTotalH, 'ชื่อ - นามสกุล', { bold: true, fontSize: headFont, fill: HEADER_BG })

  const labelX = box.left + fixedCols[0] + fixedCols[1] + fixedCols[2]
  const dayStartX = labelX + fixedCols[3]
  const headerLabels = ['สัปดาห์', 'เดือน', 'วัน', 'วันที่', 'ชั่วโมงที่']
  const headerFills = [WEEK_BG, MONTH_BG, DAY_BG, DATE_BG, HOUR_BG]
  headerLabels.forEach((label, ri) => {
    drawCell(doc, labelX, headerTop + ri * headH, fixedCols[3], headH, label, {
      bold: true, fontSize: headFont - 1, fill: headerFills[ri],
    })
  })

  let cx = dayStartX
  for (const { week } of weekSlots) {
    const w = dayW * ATTENDANCE_DAYS_PER_WEEK
    drawCell(doc, cx, headerTop, w, headH, String(week.weekNumber), { bold: true, fontSize: headFont, fill: WEEK_BG })
    drawCell(doc, cx, headerTop + headH, w, headH, weekMonthLabel(week), { bold: true, fontSize: headFont - 0.5, fill: MONTH_BG })
    cx += w
  }

  columns.forEach(({ slot }, index) => {
    const x = dayStartX + index * dayW
    const fill = slotFill(slot)
    drawCell(doc, x, headerTop + headH * 2, dayW, headH, THAI_WEEKDAYS[slot.weekday] || '', {
      bold: true, fontSize: headFont - 0.5, fill: fill || DAY_BG,
    })
    drawCell(doc, x, headerTop + headH * 3, dayW, headH, slot.dayNumber === null ? '' : String(slot.dayNumber), {
      bold: true, fontSize: headFont - 0.5, fill: fill || DATE_BG,
    })
    drawCell(doc, x, headerTop + headH * 4, dayW, headH, slot.dayIndex === null ? '' : String(slot.dayIndex), {
      bold: true, fontSize: headFont - 0.5, fill: fill || HOUR_BG,
    })
  })

  y = headerTop + headerTotalH

  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    const cy = y + i * rowH
    drawCell(doc, box.left, cy, fixedCols[0], rowH, student ? String(student.student_number || i + 1) : '', { fontSize: font })
    drawCell(doc, box.left + fixedCols[0], cy, fixedCols[1], rowH, student?.student_code || '', { fontSize: font - 0.5 })
    drawCell(doc, box.left + fixedCols[0] + fixedCols[1], cy, fixedCols[2], rowH, student ? studentName(student) : '', {
      fontSize: font, align: 'left',
    })
    drawCell(doc, labelX, cy, fixedCols[3], rowH, '', { fontSize: font })

    columns.forEach(({ slot }, di) => {
      const x = dayStartX + di * dayW
      const recorded = student && slot.key ? maps.recordMap.get(`${student.id}:${slot.key}`) : undefined
      const raw = student && slot.date && slot.key
        ? (recorded === '-'
          ? '-'
          : (recorded || (isAttendanceSchoolDay(slot.date, slot.key, maps.holidayMap, maps.openWeekendMap) ? 'ม' : '')))
        : ''
      const display = !student || raw === '-' ? '' : raw === 'ม' || raw === '/' ? 'ม' : raw
      drawCell(doc, x, cy, dayW, rowH, display, {
        fontSize: font,
        fill: slotFill(slot),
      })
    })
  }
}

function drawAttendanceSummaryPage(
  ctx: DrawCtx,
  students: ReportStudent[],
  maps: {
    recordMap: Map<string, string>
    holidayMap: Map<string, string>
    openWeekendMap: Map<string, string>
  },
  pageNumber: number,
) {
  const { doc, data, layouts } = ctx
  const layout = layouts.attendance
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)

  const term1Keys = attendanceSchoolDayKeysForTerm(data, 1, maps.holidayMap, maps.openWeekendMap)
  const term2Keys = attendanceSchoolDayKeysForTerm(data, 2, maps.holidayMap, maps.openWeekendMap)
  const allKeys = [...term1Keys, ...term2Keys]

  let y = box.top
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  const title = `สรุปข้อมูลการมาเรียนนักเรียน${classElementaryTitlePrefix()} ${classLabel(data.classroom)} ปีการศึกษา ${data.academicYear?.year_be || '-'}`
  doc.text(fitText(doc, title, box.width), box.left + box.width / 2, y, { align: 'center' })
  y += 6

  const rowH = Math.min(rowHeightMm(layout), 6.4)
  const font = ptFromCssPx(layout.fontTablePx) - 4
  // CSS: 8 / 16 / 48 / metric 7.8 — stretch แบบ table-layout:fixed
  const fixedNominal = [8, 16, 48]
  const metricNominal = 7.8
  const nominalW = fixedNominal.reduce((a, b) => a + b, 0) + metricNominal * 13
  const scale = box.width / nominalW
  const fixedCols = fixedNominal.map(w => w * scale)
  const metricW = metricNominal * scale
  const metricWidths = Array.from({ length: 13 }, () => metricW)
  const metricOffset = (index: number) => metricW * index
  const metricSpan = (from: number, to: number) => metricW * (to - from)
  const colWidths = [...fixedCols, ...metricWidths]
  const HEADER_BG: [number, number, number] = [248, 250, 252]
  const BANNER_BG: [number, number, number] = [224, 242, 254]

  const headH = rowH
  const headerTop = y
  drawCell(doc, box.left, headerTop, fixedCols[0], headH * 2, 'เลขที่', { bold: true, fontSize: font, fill: HEADER_BG })
  drawCell(doc, box.left + fixedCols[0], headerTop, fixedCols[1], headH * 2, 'เลขประจำตัว', { bold: true, fontSize: font - 0.5, fill: HEADER_BG })
  drawCell(doc, box.left + fixedCols[0] + fixedCols[1], headerTop, fixedCols[2], headH * 2, 'ชื่อ - นามสกุล', { bold: true, fontSize: font, fill: HEADER_BG })
  const metricStartX = box.left + fixedCols.reduce((a, b) => a + b, 0)
  drawCell(doc, metricStartX, headerTop, metricSpan(0, 4), headH, 'เวลาเรียนภาคเรียนที่ 1', { bold: true, fontSize: font - 0.5, fill: BANNER_BG })
  drawCell(doc, metricStartX + metricOffset(4), headerTop, metricSpan(4, 8), headH, 'เวลาเรียนภาคเรียนที่ 2', { bold: true, fontSize: font - 0.5, fill: BANNER_BG })
  drawCell(doc, metricStartX + metricOffset(8), headerTop, metricSpan(8, 13), headH, 'รวมเวลาเรียนตลอดปีการศึกษา', { bold: true, fontSize: font - 0.5, fill: BANNER_BG })
  const metricHeaders = ['ลา', 'ป่วย', 'ขาด', 'มาเรียน', 'ลา', 'ป่วย', 'ขาด', 'มาเรียน', 'ลา', 'ป่วย', 'ขาด', 'มาเรียน', 'ร้อยละ']
  metricHeaders.forEach((label, i) => {
    drawCell(doc, metricStartX + metricOffset(i), headerTop + headH, metricWidths[i], headH, label, {
      bold: true, fontSize: font - 0.5, fill: HEADER_BG,
    })
  })
  y = headerTop + headH * 2

  const rowCount = pp5StudentTableRows(students.length, layout)
  const body: string[][] = []
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    if (!student) {
      body.push(Array(colWidths.length).fill(''))
      continue
    }
    const t1 = summarizeAttendanceKeys(student.id, term1Keys, maps.recordMap)
    const t2 = summarizeAttendanceKeys(student.id, term2Keys, maps.recordMap)
    const total = summarizeAttendanceKeys(student.id, allKeys, maps.recordMap)
    const percent = allKeys.length ? (total.present / allKeys.length) * 100 : 0
    const dash = (value: number) => (value ? String(value) : '-')
    body.push([
      String(student.student_number || i + 1),
      student.student_code || '-',
      studentName(student),
      dash(t1.leave), dash(t1.sick), dash(t1.absent), String(t1.present),
      dash(t2.leave), dash(t2.sick), dash(t2.absent), String(t2.present),
      dash(total.leave), dash(total.sick), dash(total.absent), String(total.present),
      percent.toFixed(1),
    ])
  }
  drawTableGrid(doc, box.left, y, colWidths, body, { rowH, fontSize: font, nameCol: 2 })
}

function drawEmptyAttendancePage(ctx: DrawCtx, pageNumber: number) {
  const { doc, term, layouts } = ctx
  const layout = layouts.attendance
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  const y = drawClassHead(doc, ctx, layout, 'แบบบันทึกเวลาเรียน', term, box.top)
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  setText(doc)
  doc.text('ยังไม่ได้ตั้งค่าวันเปิด-ปิดภาคเรียนในปีการศึกษา', box.left + box.width / 2, y + 20, { align: 'center' })
}

function drawAttendanceSection(ctx: DrawCtx, pageNumberStart: number) {
  const { data, term } = ctx
  const studentChunks = chunkStudentsForPrintPages(data.students)
  const maps = {
    recordMap: attendanceRecordMap(data.dailyAttendanceRecords || []),
    holidayMap: calendarDayMap(data.holidays || []),
    openWeekendMap: calendarDayMap(data.weekendSchoolDays || []),
  }
  const activeTerms: Array<1 | 2> = term === 0 ? [1, 2] : [term]
  let pageNum = pageNumberStart
  let rendered = 0

  for (const activeTerm of activeTerms) {
    const { start, end } = attendanceDateRange(data, activeTerm)
    const weekPages = chunkArray(attendanceWeeks(start, end), ATTENDANCE_WEEKS_PER_PAGE)
    for (const weeks of weekPages) {
      for (const chunk of studentChunks) {
        if (pageNum > pageNumberStart) ctx.doc.addPage()
        drawDailyAttendancePage(ctx, activeTerm, chunk, weeks, maps, pageNum)
        pageNum += 1
        rendered += 1
      }
    }
  }

  if (rendered === 0) {
    for (let i = 0; i < studentChunks.length; i += 1) {
      if (pageNum > pageNumberStart) ctx.doc.addPage()
      drawEmptyAttendancePage(ctx, pageNum)
      pageNum += 1
    }
    return
  }

  if (term === 0) {
    for (const chunk of studentChunks) {
      ctx.doc.addPage()
      drawAttendanceSummaryPage(ctx, chunk, maps, pageNum)
      pageNum += 1
    }
  }
}

/* ---------- ผลการเรียนรายวิชา ---------- */

function scoreSideHeadLabel(label: string, max?: number | null) {
  const fullScore = max && max > 0 ? `(${max}) ` : ''
  return `${fullScore}${label}`
}

function drawClassSubjectScorePage(
  ctx: DrawCtx,
  subject: ReportSubject,
  activeTerm: 1 | 2,
  students: ReportStudent[],
  pageNumber: number,
) {
  const { doc, data, layouts } = ctx
  const layout = layouts.scores
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)

  let y = box.top
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  doc.text('คะแนนระหว่างเรียน/คะแนนกลางภาค/คะแนนปลายภาค', box.left + box.width / 2, y, { align: 'center' })
  y += 5
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  doc.text(fitText(doc, classSchoolLine(data), box.width), box.left + box.width / 2, y, { align: 'center' })
  y += 6.5

  const config = scoreConfigFor(data, subject.class_subject_id, activeTerm)
  const betweenScores = config?.between_scores?.length ? config.between_scores : [5, 5, 5, 5, 5, 5, 5]
  const visibleUnits = Math.max(14, betweenScores.length)
  const yearTotalMax = activeTerm === 2
    ? (scoreConfigFor(data, subject.class_subject_id, 1)?.total_max || 0)
      + (scoreConfigFor(data, subject.class_subject_id, 2)?.total_max || 0)
    : 0

  const rowH = Math.max(pxToMm96(23), Math.min(rowHeightMm(layout), 6.2))
  const font = Math.max(6, ptFromCssPx(layout.fontScorePx) - 3)
  const headFont = Math.max(6, font)
  // กว้างใกล้ CSS พรีวิว + stretch แบบ table-layout:fixed
  const nameW = activeTerm === 2 ? 38 : 42
  const fixedCols = [7, 13, nameW]
  const sideLabels = [
    scoreSideHeadLabel('สอบกลางภาค', config?.midterm_max),
    scoreSideHeadLabel('สอบปลายภาค', config?.final_max),
    scoreSideHeadLabel(`รวมภาคเรียนที่ ${activeTerm}`, config?.total_max),
    ...(activeTerm === 2
      ? [scoreSideHeadLabel('รวมทั้งปีการศึกษา', yearTotalMax), 'ระดับผลการเรียน']
      : []),
    'หมายเหตุ',
  ]
  const nominalUnit = 4.5
  const nominalTotal = 7.5
  const nominalSide = 7.5
  const nominalW = fixedCols.reduce((a, b) => a + b, 0)
    + nominalUnit * visibleUnits
    + nominalTotal
    + nominalSide * sideLabels.length
  const scale = box.width / nominalW
  const unitW = nominalUnit * scale
  const totalColW = nominalTotal * scale
  const sideW = nominalSide * scale

  const HEADER_BG: [number, number, number] = [248, 250, 252]
  const BANNER_BG: [number, number, number] = [224, 242, 254]
  // HTML: CSS 38+17+17 แต่ vertical min-height 88px ดัน thead ~26.6mm (วัดจากพรีวิว)
  const headerTotalH = Math.max(pxToMm96(38 + 17 + 17), pxToMm96(88), pxToMm96(100))
  const headRow1 = headerTotalH * (38 / 72)
  const headRow23 = headerTotalH * (17 / 72)
  const headerTop = y

  drawVerticalHeaderCell(doc, box.left, headerTop, fixedCols[0] * scale, headerTotalH, 'เลขที่', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawVerticalHeaderCell(doc, box.left + fixedCols[0] * scale, headerTop, fixedCols[1] * scale, headerTotalH, 'เลขประจำตัว', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  drawCell(doc, box.left + (fixedCols[0] + fixedCols[1]) * scale, headerTop, fixedCols[2] * scale, headerTotalH, 'ชื่อ - สกุล', { bold: true, fontSize: headFont, fill: HEADER_BG })

  const unitStartX = box.left + fixedCols.reduce((a, b) => a + b, 0) * scale
  const unitBlockW = unitW * visibleUnits + totalColW
  drawCell(doc, unitStartX, headerTop, unitBlockW, headRow1, `คะแนนระหว่างเรียน  วิชา${subject.subject.name}  (ภาคเรียนที่ ${activeTerm})`, {
    bold: true, fontSize: Math.max(5.5, headFont - 1), fill: BANNER_BG,
  })
  for (let i = 0; i < visibleUnits; i += 1) {
    drawCell(doc, unitStartX + unitW * i, headerTop + headRow1, unitW, headRow23, String(i + 1), { bold: true, fontSize: headFont - 1, fill: HEADER_BG })
    drawCell(doc, unitStartX + unitW * i, headerTop + headRow1 + headRow23, unitW, headRow23, betweenScores[i] ? String(betweenScores[i]) : '', {
      bold: true, fontSize: headFont - 1, fill: HEADER_BG,
    })
  }
  drawVerticalHeaderCell(
    doc,
    unitStartX + unitW * visibleUnits,
    headerTop + headRow1,
    totalColW,
    headRow23 * 2,
    'รวม',
    { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG },
  )

  const sideStartX = unitStartX + unitBlockW
  sideLabels.forEach((label, i) => {
    drawVerticalHeaderCell(doc, sideStartX + sideW * i, headerTop, sideW, headerTotalH, label, {
      bold: true,
      fontSize: Math.max(5, headFont - 1.5),
      fill: HEADER_BG,
    })
  })
  y = headerTop + headerTotalH

  const scaledFixed = fixedCols.map(w => w * scale)
  const colWidths = [
    ...scaledFixed,
    ...Array.from({ length: visibleUnits }, () => unitW),
    totalColW,
    ...sideLabels.map(() => sideW),
  ]
  const rowCount = pp5StudentTableRows(students.length, layout)
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    const cy = y + i * rowH
    const score = student ? scoreForTerm(data, student.id, subject.class_subject_id, activeTerm) : null
    const cells = student
      ? [
        String(student.student_number || i + 1),
        student.student_code || '',
        studentName(student),
        ...Array.from({ length: visibleUnits }, (_, ui) => String(score?.unit_scores?.[String(ui + 1)] ?? '')),
        score?.between_total != null ? String(score.between_total) : '',
        score?.midterm_score != null ? String(score.midterm_score) : '',
        score?.final_score != null ? String(score.final_score) : '',
        score?.term_total != null ? String(score.term_total) : '',
        ...(activeTerm === 2
          ? [score?.year_total != null ? String(score.year_total) : '', scoreText(score)]
          : []),
        score?.result && score.result !== 'เรียน' ? score.result : '',
      ]
      : Array(colWidths.length).fill('')
    let cx = box.left
    cells.forEach((cell, ci) => {
      drawCell(doc, cx, cy, colWidths[ci], rowH, cell, {
        fontSize: font,
        align: ci === 2 ? 'left' : 'center',
      })
      cx += colWidths[ci]
    })
  }
}

function drawScoresSection(ctx: DrawCtx, pageNumberStart: number) {
  const { data, term } = ctx
  const activeTerms: Array<1 | 2> = term === 0 ? [1, 2] : [term]
  const studentChunks = chunkStudentsForPrintPages(data.students)
  let pageNum = pageNumberStart

  for (const subject of data.subjects) {
    for (const activeTerm of activeTerms) {
      for (const chunk of studentChunks) {
        if (pageNum > pageNumberStart) ctx.doc.addPage()
        drawClassSubjectScorePage(ctx, subject, activeTerm, chunk, pageNum)
        pageNum += 1
      }
    }
  }

  if (pageNum === pageNumberStart) {
    drawPageMark(ctx.doc, pageNum)
    const layout = ctx.layouts.scores
    const box = contentBox(layout)
    ctx.doc.setFont('THSarabunNew', 'normal')
    ctx.doc.setFontSize(ptFromCssPx(layout.fontSubPx))
    setText(ctx.doc)
    ctx.doc.text('ยังไม่มีรายวิชาสำหรับห้องเรียนนี้', box.left + box.width / 2, box.top + 20, { align: 'center' })
  }
}

/* ---------- สรุปผลสัมฤทธิ์ ---------- */

function drawAchievementPage(ctx: DrawCtx, students: ReportStudent[], pageNumber: number) {
  const { doc, data, layouts, logoData } = ctx
  const layout = layouts.achievement
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)

  const subjects = [...data.subjects]
    .sort((a, b) => a.order_number - b.order_number)
    .slice(0, CLASS_ACHIEVEMENT_MAX_SUBJECTS)

  let y = box.top
  const logoSize = pxToMm96(layout.logoSizePx)
  if (logoData) {
    try {
      doc.addImage(logoData, 'JPEG', box.left + pxToMm96(layout.logoOffsetXPx), y + pxToMm96(layout.logoOffsetYPx), logoSize, logoSize)
    } catch {
      /* โลโก้เสีย — ข้าม */
    }
  }
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  setText(doc)
  const title = `สรุปผลสัมฤทธิ์ทางการเรียนนักเรียน${classElementaryTitlePrefix()} ${classLabel(data.classroom)} ปีการศึกษา ${data.academicYear?.year_be || '-'}`
  doc.text(fitText(doc, title, box.width), box.left + box.width / 2, y, { align: 'center' })
  y += 5
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  const areaLine = expandEducationAreaOffice(data.school?.area_office || data.school?.department || '')
  const sub = [
    `โรงเรียน${data.school?.name || '-'}`,
    data.school?.district ? `อำเภอ${data.school.district}` : '',
    data.school?.province ? `จังหวัด${data.school.province}` : '',
    areaLine,
  ].filter(Boolean).join('  ')
  doc.text(fitText(doc, sub, box.width), box.left + box.width / 2, y, { align: 'center' })
  y += 5

  const rowH = rowHeightMm(layout)
  const font = ptFromCssPx(layout.fontTablePx) - 4
  const headFont = Math.max(5.5, font)
  // CSS: 5 / 9 / 34 / คะแนน·เกรด 4.6 / GPA 7 — stretch แบบ table-layout:fixed เหมือน HTML
  const fixedNum = 5
  const fixedCode = 9
  const nameNominal = 34
  const gpaNominal = 7
  const cellNominal = 4.6
  const pairCount = Math.max(1, subjects.length)
  const subjectNominal = subjects.length === 0 ? 40 : cellNominal * 2 * pairCount
  const nominalW = fixedNum + fixedCode + nameNominal + subjectNominal + gpaNominal
  const scale = box.width / nominalW
  const fixedCols = [fixedNum * scale, fixedCode * scale, nameNominal * scale]
  const cellW = cellNominal * scale
  const pairW = cellW * 2
  const subjectBlockW = subjectNominal * scale
  const gpaW = gpaNominal * scale
  const HEADER_BG: [number, number, number] = [248, 250, 252]

  // HTML: row1 ~23px, subject-head 20mm, score/grade 14mm → thead ~42mm
  const headRow1 = pxToMm96(23)
  const headRow2 = 20
  const headRow3 = 14
  const headerTop = y
  const headerTotalH = headRow1 + headRow2 + headRow3
  drawVerticalHeaderCell(doc, box.left, headerTop, fixedCols[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawVerticalHeaderCell(doc, box.left + fixedCols[0], headerTop, fixedCols[1], headerTotalH, 'เลขประจำตัว', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  drawCell(doc, box.left + fixedCols[0] + fixedCols[1], headerTop, fixedCols[2], headerTotalH, 'ชื่อ - สกุล', { bold: true, fontSize: headFont, fill: HEADER_BG })

  const subjectStartX = box.left + fixedCols.reduce((a, b) => a + b, 0)
  drawCell(doc, subjectStartX, headerTop, subjectBlockW, headRow1, 'รายวิชา', { bold: true, fontSize: headFont, fill: HEADER_BG })
  if (subjects.length === 0) {
    drawCell(doc, subjectStartX, headerTop + headRow1, subjectBlockW, headRow2 + headRow3, 'ไม่มีรายวิชา', { bold: true, fontSize: headFont, fill: HEADER_BG })
  } else {
    subjects.forEach((subject, si) => {
      const x = subjectStartX + pairW * si
      drawCell(doc, x, headerTop + headRow1, pairW, headRow2, compactSubjectName(subject), { bold: true, fontSize: Math.max(5, headFont - 1), fill: HEADER_BG })
      drawVerticalHeaderCell(doc, x, headerTop + headRow1 + headRow2, cellW, headRow3, 'คะแนน', { bold: true, fontSize: Math.max(5, headFont - 1.5), fill: HEADER_BG })
      drawVerticalHeaderCell(doc, x + cellW, headerTop + headRow1 + headRow2, cellW, headRow3, 'เกรด', { bold: true, fontSize: Math.max(5, headFont - 1.5), fill: HEADER_BG })
    })
  }
  drawVerticalHeaderCell(doc, subjectStartX + subjectBlockW, headerTop, gpaW, headerTotalH, 'เกรดเฉลี่ย', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  y = headerTotalH + headerTop

  const colWidths = [
    ...fixedCols,
    ...(subjects.length === 0
      ? [subjectBlockW]
      : subjects.flatMap(() => [cellW, cellW])),
    gpaW,
  ]
  const rowCount = pp5StudentTableRows(students.length, layout)
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    const cy = y + i * rowH
    const gpa = student ? studentGpa(data, student.id, subjects) : null
    const cells = student
      ? [
        String(student.student_number || i + 1),
        student.student_code || '',
        studentName(student),
        ...(subjects.length === 0
          ? ['']
          : subjects.flatMap(subject => {
            const score = finalScoreForSubject(data, student.id, subject.class_subject_id)
            return [
              String(score?.year_total ?? score?.term_total ?? ''),
              score ? scoreText(score) : '',
            ]
          })),
        gpa === null ? '' : gpa.toFixed(2),
      ]
      : Array(colWidths.length).fill('')
    let cx = box.left
    cells.forEach((cell, ci) => {
      drawCell(doc, cx, cy, colWidths[ci], rowH, cell, {
        fontSize: font,
        align: ci === 2 ? 'left' : 'center',
      })
      cx += colWidths[ci]
    })
  }
}

/* ---------- ผลการประเมิน ---------- */

function drawCharacterPage(ctx: DrawCtx, students: ReportStudent[], pageNumber: number) {
  const { doc, data, term, layouts } = ctx
  const layout = layouts.character
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  let y = drawClassHead(doc, ctx, layout, 'ผลการประเมินคุณลักษณะอันพึงประสงค์', term, box.top)

  const scoreColumns = 10
  const rowH = rowHeightMm(layout)
  const headH = rowH
  const font = ptFromCssPx(layout.fontTablePx) - 1
  const headFont = Math.max(6, font)

  // คอลัมน์ตรง CSS พรีวิว: 7 / 13 / 50 / … / 18 / 18 / 23
  const fixed = [7, 13, 50]
  const tail = { level: 18, result: 18, note: 23 }
  const fixedW = fixed.reduce((a, b) => a + b, 0)
  const tailW = tail.level + tail.result + tail.note
  const scoreW = Math.max(4, (box.width - fixedW - tailW) / scoreColumns)

  const headerTop = y
  // HTML: height 23px×4 แต่ vertical min-height 92px ดัน thead ~27.7mm
  const headerTotalH = Math.max(headH * 4, pxToMm96(92), pxToMm96(105))
  const headRow = headerTotalH / 4
  const scoreX = box.left + fixedW
  const scoreGroupW = scoreW * scoreColumns
  const levelX = scoreX + scoreGroupW
  const resultX = levelX + tail.level
  const noteX = resultX + tail.result

  const HEADER_BG: [number, number, number] = [248, 250, 252]
  const BANNER_BG: [number, number, number] = [224, 242, 254]

  drawVerticalHeaderCell(doc, box.left, headerTop, fixed[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawVerticalHeaderCell(doc, box.left + fixed[0], headerTop, fixed[1], headerTotalH, 'เลขประจำตัว', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  drawCell(doc, box.left + fixed[0] + fixed[1], headerTop, fixed[2], headerTotalH, 'ชื่อ - สกุล', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, scoreX, headerTop, scoreGroupW, headRow, 'ผลประเมินคุณลักษณะอันพึงประสงค์', { bold: true, fontSize: Math.max(5.5, headFont - 1), fill: BANNER_BG })
  drawCell(doc, levelX, headerTop, tail.level + tail.result, headRow, 'ผลการประเมิน', { bold: true, fontSize: headFont, fill: BANNER_BG })
  drawCell(doc, noteX, headerTop, tail.note, headerTotalH, 'หมายเหตุ', { bold: true, fontSize: headFont, fill: HEADER_BG })

  const row2Y = headerTop + headRow
  drawCell(doc, scoreX, row2Y, scoreGroupW, headRow, 'ข้อ/คะแนน', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, levelX, row2Y, tail.level, headRow * 3, 'ระดับ', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, resultX, row2Y, tail.result, headRow * 3, 'ผล', { bold: true, fontSize: headFont, fill: HEADER_BG })

  const row3Y = row2Y + headRow
  for (let i = 0; i < scoreColumns; i += 1) {
    drawCell(doc, scoreX + i * scoreW, row3Y, scoreW, headRow, i < CHARACTER_KEYS.length ? String(i + 1) : '', { bold: true, fontSize: headFont, fill: HEADER_BG })
  }

  const row4Y = row3Y + headRow
  for (let i = 0; i < scoreColumns; i += 1) {
    drawCell(doc, scoreX + i * scoreW, row4Y, scoreW, headRow, i < CHARACTER_KEYS.length ? '3' : '', { bold: true, fontSize: headFont, fill: HEADER_BG })
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
  let y = drawClassHead(doc, ctx, layout, 'ผลการประเมินอ่าน คิดวิเคราะห์ และเขียนสื่อความหมาย', term, box.top)

  const readingGroups = defaultReadingTableGroups()
  const readingColumns = readingTableFlatColumns(readingGroups)
  const columnLabel = (column: ReadingTableColumn) =>
    column.kind === 'score' || column.kind === 'total' ? column.label : ''

  const rowH = rowHeightMm(layout)
  const headH = rowH
  const font = ptFromCssPx(layout.fontTablePx) - 1
  const headFont = Math.max(6, font)

  const fixed = [7, 13, 50]
  const tail = { total: 10, level: 14, result: 19 }
  const fixedW = fixed.reduce((a, b) => a + b, 0)
  const tailW = tail.total + tail.level + tail.result
  const midW = Math.max(4, (box.width - fixedW - tailW) / readingColumns.length)

  const headerTop = y
  // HTML: height 23px×4 แต่ vertical min-height 92px ดัน thead ~27.7mm
  const headerTotalH = Math.max(headH * 4, pxToMm96(92), pxToMm96(105))
  const headRow = headerTotalH / 4
  const midX = box.left + fixedW
  const midGroupW = midW * readingColumns.length
  const totalX = midX + midGroupW
  const levelX = totalX + tail.total
  const resultX = levelX + tail.level

  const HEADER_BG: [number, number, number] = [248, 250, 252]
  const BANNER_BG: [number, number, number] = [224, 242, 254]

  drawVerticalHeaderCell(doc, box.left, headerTop, fixed[0], headerTotalH, 'เลขที่', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawVerticalHeaderCell(doc, box.left + fixed[0], headerTop, fixed[1], headerTotalH, 'เลขประจำตัว', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  drawCell(doc, box.left + fixed[0] + fixed[1], headerTop, fixed[2], headerTotalH, 'ชื่อ - สกุล', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, midX, headerTop, midGroupW, headRow, 'ผลประเมินอ่าน คิด วิเคราะห์ และเขียนสื่อความหมาย', { bold: true, fontSize: Math.max(5, headFont - 1.5), fill: BANNER_BG })
  drawVerticalHeaderCell(doc, totalX, headerTop, tail.total, headerTotalH, 'รวมทั้งหมด', { bold: true, fontSize: headFont - 0.5, fill: HEADER_BG })
  drawCell(doc, levelX, headerTop, tail.level + tail.result, headRow, 'ผลการประเมิน', { bold: true, fontSize: headFont, fill: BANNER_BG })

  const row2Y = headerTop + headRow
  let gx = midX
  readingGroups.forEach(group => {
    const gw = midW * group.columns.length
    drawCell(doc, gx, row2Y, gw, headRow, group.label, { bold: true, fontSize: Math.max(5.5, headFont - 1), fill: HEADER_BG })
    gx += gw
  })
  drawCell(doc, levelX, row2Y, tail.level, headRow * 3, 'ระดับ', { bold: true, fontSize: headFont, fill: HEADER_BG })
  drawCell(doc, resultX, row2Y, tail.result, headRow * 3, 'ผล', { bold: true, fontSize: headFont, fill: HEADER_BG })

  const row3Y = row2Y + headRow
  readingColumns.forEach((column, index) => {
    drawCell(doc, midX + index * midW, row3Y, midW, headRow, columnLabel(column), { bold: true, fontSize: headFont, fill: HEADER_BG })
  })

  const row4Y = row3Y + headRow
  readingColumns.forEach((column, index) => {
    drawCell(doc, midX + index * midW, row4Y, midW, headRow, String(readingTableColumnMax(column)), { bold: true, fontSize: headFont, fill: HEADER_BG })
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
  const y = drawClassHead(doc, ctx, layout, 'ผลการประเมินสมรรถนะสำคัญของผู้เรียน', term, box.top)

  const rowH = rowHeightMm(layout)
  const font = ptFromCssPx(layout.fontTablePx) - 1
  // CSS: 7 / 70 / score 16×N / result 24 — stretch ให้เต็มกล่อง
  const fixed = [7, 70]
  const resultW = 24
  const scoreNominal = 16
  const used = fixed.reduce((a, b) => a + b, 0) + scoreNominal * COMPETENCY_KEYS.length + resultW
  const scale = box.width / used
  const scoreW = scoreNominal * scale
  const colWidths = [
    ...fixed.map(w => w * scale),
    ...COMPETENCY_KEYS.map(() => scoreW),
    resultW * scale,
  ]
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

function drawActivityPage(ctx: DrawCtx, students: ReportStudent[], pageNumber: number) {
  const { doc, data, layouts } = ctx
  const layout = layouts.activities
  const box = contentBox(layout)
  drawPageMark(doc, pageNumber)
  const y = drawClassHead(
    doc,
    ctx,
    layout,
    'ผลการประเมินกิจกรรมพัฒนาผู้เรียน',
    ctx.term,
    box.top,
    classSchoolLine(data),
  )

  const rowH = rowHeightMm(layout)
  const font = ptFromCssPx(layout.fontTablePx) - 1
  // CSS: 7 / 74 / score 20×N / result 24
  const fixed = [7, 74]
  const resultW = 24
  const scoreW = 20
  const used = fixed.reduce((a, b) => a + b, 0) + scoreW * ACTIVITY_KEYS.length + resultW
  const scale = box.width / used
  const colWidths = [
    ...fixed.map(w => w * scale),
    ...ACTIVITY_KEYS.map(() => scoreW * scale),
    resultW * scale,
  ]
  const headers = ['ที่', 'ชื่อ - สกุล', ...ACTIVITY_KEYS.map((_, i) => activityLabel(data, i)), 'สรุป']
  const body: string[][] = [headers]
  const rowCount = pp5StudentTableRows(students.length, layout)
  for (let i = 0; i < rowCount; i += 1) {
    const student = students[i]
    if (!student) {
      body.push(Array(colWidths.length).fill(''))
      continue
    }
    const row = rowFor(data.evaluations.activities, student.id)
    body.push([
      String(student.student_number || i + 1),
      studentName(student),
      ...ACTIVITY_KEYS.map(key => String(row?.[key] ?? '–')),
      String(row?.overall_result || ''),
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
}

function includeSection(
  sections: Pp5ClassPdfOptions['sections'],
  previewSection: Pp5ClassPdfOptions['previewSection'],
  name: Pp5ClassPdfSection,
) {
  if (previewSection) return previewSection === name
  return sections.includes(name)
}

const SECTION_ORDER: Pp5ClassPdfSection[] = [
  'cover', 'criteria', 'attendance', 'scores', 'achievement', 'character', 'reading', 'competency', 'activities',
]

export async function buildPp5ClassPdfBlob(
  options: Pp5ClassPdfOptions,
  buildOptions?: Pp5ClassPdfBuildOptions,
): Promise<{ blob: Blob; fileName: string }> {
  const { data, term, sections, previewSection } = options
  const selectedSections = previewSection
    ? [previewSection]
    : SECTION_ORDER.filter(name => sections.includes(name))
  const needsStudents = selectedSections.some(name => name !== 'cover' && name !== 'criteria')
  if (needsStudents && !data.students.length) {
    throw new Error('ไม่พบข้อมูลนักเรียนสำหรับสร้าง ปพ.5 รายห้อง')
  }

  const layouts = { ...DEFAULT_PP5_PRINT_LAYOUTS, ...options.layouts }
  const doc = buildOptions?.doc ?? new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  if (!buildOptions?.skipApplyFonts) await applyThaiFonts(doc)

  const sigKeys = ['homeroom', 'academic_head', 'measurement_head', 'vice_director', 'director'] as const
  const [logoData, qrPng, ...sigUrls] = await Promise.all([
    loadImageDataUrl(data.school?.logo_url, 160, 0.7),
    data.digitalReference?.verifyUrl
      ? qrDataUrl(documentQrUrl(data.digitalReference), 256)
      : Promise.resolve(null),
    ...sigKeys.map(k => loadImageDataUrl(data.documentSignatures?.[k], 220, 0.75)),
  ])
  const signatures = Object.fromEntries(sigKeys.map((k, i) => [k, sigUrls[i]])) as Record<string, string | null>

  const ctx: DrawCtx = { doc, data, term, layouts, logoData, signatures, qrPng }
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
    if (section === 'achievement') {
      nextPage()
      drawStudentChunkSection(ctx, drawAchievementPage, pageNum)
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
      continue
    }
    if (section === 'activities') {
      nextPage()
      drawStudentChunkSection(ctx, drawActivityPage, pageNum)
    }
  }

  if (!started) throw new Error('ไม่มีส่วนรายงานที่เลือกสำหรับสร้าง PDF')

  const classText = data.classroom ? `${data.classroom.level}-${data.classroom.room}` : 'รายงาน'
  const yearText = data.academicYear?.year_be || ''
  const nameParts = ['ปพ.5 รวมชั้น', classText, yearText].filter(Boolean)
  const fileName = (options.fileName || `${nameParts.join('_')}.pdf`).replace(/[\\/:*?"<>|]/g, '-')

  return { blob: doc.output('blob'), fileName }
}
