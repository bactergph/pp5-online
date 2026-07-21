'use client'

import { jsPDF } from 'jspdf'
import type {
  ReportClassroom,
  ReportPayload,
  ReportScore,
  ReportStudent,
  ReportSubject,
} from '@/app/(shell)/reports/actions'
import { activityHoursForField } from '@/lib/evaluation-settings'
import { expandEducationAreaOffice } from '@/lib/education-area-office'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import {
  DEFAULT_PP6_SECTION_LAYOUT,
  type Pp6SectionLayout,
} from '@/lib/pp6-print-layout'
import { READING_SCORE_KEYS } from '@/lib/reading-table-layout'
import {
  directorActingPositionLine,
  directorDisplayName,
  directorSchoolLine,
} from '@/lib/school-director'

const PAGE_W = 210
const PX_TO_MM = 25.4 / 96

const BORDER: [number, number, number] = [17, 24, 39]
/** ตรงกับ CSS `.pp6-muted-cell { background: #D9D9D9 }` */
const MUTED_BG: [number, number, number] = [217, 217, 217]
const TEXT: [number, number, number] = [17, 24, 39]

const CHARACTER_KEYS = Array.from({ length: 8 }, (_, i) => `trait${i + 1}_score`)
const READING_KEYS = [...READING_SCORE_KEYS]
const ACTIVITY_KEYS = ['guidance_result', 'scout_result', 'club_result', 'public_service_result'] as const
const ACTIVITY_LABELS = ['แนะแนว', 'ลูกเสือ/เนตรนารี/ยุวกาชาติ', 'ชุมนุม', 'จิตอาสา']
const ACTIVITY_HOURS_FALLBACK = [40, 40, 30, 10]

const SCORE_COLS_MM = [7, 15, 48, 14, 9, 9, 8, 9, 8, 9, 8] as const

export type Pp6PdfOptions = {
  data: ReportPayload
  term: 0 | 1 | 2
  individual?: boolean
  selectedStudentId?: string
  ranked?: boolean
  showGrade?: boolean
  layout?: Pp6SectionLayout
  fileName?: string
}

function px(n: number) {
  return Math.max(0, n) * PX_TO_MM
}

function ptFromCssPx(pxValue: number) {
  return Math.max(0, pxValue) * 0.75
}

function formatPp6Number(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return ''
  if (digits <= 0) return String(Number(value))
  return Number(value).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function studentName(student: ReportStudent) {
  return `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim()
}

function classLabel(classroom: ReportClassroom | null) {
  return classroom ? `${classroom.level}/${classroom.room}` : '-'
}

function termTitle(term: 1 | 2 | 0) {
  if (term === 1) return 'ภาคเรียนที่ 1'
  if (term === 2) return 'ภาคเรียนที่ 2'
  return 'ทั้งปีการศึกษา'
}

function scoreForTerm(data: ReportPayload, studentId: string, classSubjectId: string, term: 1 | 2) {
  return data.scores.find(s => s.student_id === studentId && s.class_subject_id === classSubjectId && s.term === term) || null
}

function scoreFor(data: ReportPayload, studentId: string, classSubjectId: string) {
  return data.scores.find(s => s.student_id === studentId && s.class_subject_id === classSubjectId) || null
}

function numericGrade(score: ReportScore | null) {
  if (!score || score.grade === null || score.grade === undefined) return null
  return Number.isFinite(Number(score.grade)) ? Number(score.grade) : null
}

function finalScoreForSubject(data: ReportPayload, studentId: string, classSubjectId: string) {
  return scoreForTerm(data, studentId, classSubjectId, 2)
    || scoreForTerm(data, studentId, classSubjectId, 1)
    || scoreFor(data, studentId, classSubjectId)
}

function pp6SubjectType(subject: ReportSubject) {
  const text = `${subject.subject.subject_group || ''} ${subject.subject.name || ''}`.toLowerCase()
  return /เพิ่มเติม|elective|เลือก/.test(text) ? 'เพิ่มเติม' : 'พื้นฐาน'
}

function pp6SubjectWeight(subject: ReportSubject) {
  const credits = Number(subject.subject.credits || 0)
  return credits > 0 ? credits : 1
}

function pp6TermScore(data: ReportPayload, studentId: string, subjectId: string, term: 1 | 2) {
  const score = scoreForTerm(data, studentId, subjectId, term)
  return { total: score?.term_total ?? null, grade: numericGrade(score) }
}

function pp6AnnualScore(data: ReportPayload, studentId: string, subjectId: string) {
  const term2 = scoreForTerm(data, studentId, subjectId, 2)
  const term1 = scoreForTerm(data, studentId, subjectId, 1)
  const fallback = finalScoreForSubject(data, studentId, subjectId)
  return {
    total: term2?.year_total ?? fallback?.year_total ?? term2?.term_total ?? term1?.term_total ?? null,
    grade: numericGrade(term2 || fallback || term1),
  }
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

function pp6StudentTermScoreTotal(data: ReportPayload, studentId: string, subjects: ReportSubject[], term: 1 | 2) {
  let total = 0
  let hasAny = false
  for (const subject of subjects) {
    const termScore = pp6TermScore(data, studentId, subject.class_subject_id, term)
    if (termScore.total === null || !Number.isFinite(Number(termScore.total))) continue
    total += Number(termScore.total)
    hasAny = true
  }
  return hasAny ? total : null
}

function pp6StudentAnnualScoreTotal(data: ReportPayload, studentId: string, subjects: ReportSubject[]) {
  let total = 0
  let hasAny = false
  for (const subject of subjects) {
    const annual = pp6AnnualScore(data, studentId, subject.class_subject_id)
    if (annual.total === null || !Number.isFinite(Number(annual.total))) continue
    total += Number(annual.total)
    hasAny = true
  }
  return hasAny ? total : null
}

function buildPp6RankMap(data: ReportPayload, subjects: ReportSubject[], term: 1 | 2 | 0) {
  if (term === 1) {
    const ranked = [...data.students]
      .map(student => ({ student, scoreTotal: pp6StudentTermScoreTotal(data, student.id, subjects, 1) }))
      .filter(item => item.scoreTotal !== null)
      .sort((a, b) => (b.scoreTotal ?? -1) - (a.scoreTotal ?? -1))
    const rankMap = new Map<string, number>()
    ranked.forEach((item, index) => {
      if (index > 0 && ranked[index - 1].scoreTotal === item.scoreTotal) {
        rankMap.set(item.student.id, rankMap.get(ranked[index - 1].student.id)!)
        return
      }
      rankMap.set(item.student.id, index + 1)
    })
    return rankMap
  }

  const ranked = [...data.students]
    .map(student => ({
      student,
      gpa: studentGpa(data, student.id, subjects),
      scoreTotal: pp6StudentAnnualScoreTotal(data, student.id, subjects),
    }))
    .filter(item => item.gpa !== null)
    .sort((a, b) => {
      const gpaDiff = (b.gpa ?? -1) - (a.gpa ?? -1)
      if (gpaDiff !== 0) return gpaDiff
      return (b.scoreTotal ?? -1) - (a.scoreTotal ?? -1)
    })

  const rankMap = new Map<string, number>()
  ranked.forEach((item, index) => {
    if (index > 0) {
      const prev = ranked[index - 1]
      if (prev.gpa === item.gpa && prev.scoreTotal === item.scoreTotal) {
        rankMap.set(item.student.id, rankMap.get(prev.student.id)!)
        return
      }
    }
    rankMap.set(item.student.id, index + 1)
  })
  return rankMap
}

function rowFor(rows: Record<string, string | number | null>[], studentId: string) {
  return rows.find(row => row.student_id === studentId) || null
}

function rowForTerm(rows: Record<string, string | number | null>[], studentId: string, term: 1 | 2 | 0) {
  const studentRows = rows.filter(row => row.student_id === studentId)
  if (term !== 0) return studentRows.find(row => Number(row.term) === term) || studentRows[0] || null
  return studentRows.find(row => Number(row.term) === 2)
    || studentRows.find(row => Number(row.term) === 1)
    || studentRows[0]
    || null
}

function averageScore(row: Record<string, string | number | null> | null, keys: string[]) {
  if (!row) return null
  const values = keys.map(key => Number(row[key] ?? 0))
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function levelFromAverage(value: number | null) {
  if (value === null) return '-'
  if (value >= 2.5) return 'ดีเยี่ยม'
  if (value >= 2) return 'ดี'
  if (value >= 1) return 'ผ่าน'
  return 'ไม่ผ่าน'
}

function schoolOfficeLine(data: ReportPayload) {
  const raw = data.school?.area_office
    || data.school?.department
    || [data.school?.district, data.school?.province].filter(Boolean).join(' ')
    || '-'
  if (raw === '-') return raw
  return expandEducationAreaOffice(raw)
}

function homeroomTeacherNames(classroom: ReportClassroom | null | undefined) {
  return [classroom?.homeroom_teacher_name, classroom?.homeroom_teacher2_name].filter(Boolean) as string[]
}

function homeroomTeacherLine(classroom: ReportClassroom | null | undefined) {
  return homeroomTeacherNames(classroom).join(' / ') || '-'
}

function pp6LevelDigit(classroom: ReportClassroom | null | undefined) {
  const match = classroom?.level?.match(/\d+/)
  return match?.[0] || ''
}

function pp6ActivityCode(data: ReportPayload, index: number) {
  const level = pp6LevelDigit(data.classroom) || '1'
  return `ก${level}29${String(index + 1).padStart(2, '0')}`
}

function pp6ActivityLabel(data: ReportPayload, index: number) {
  const key = ACTIVITY_KEYS[index]
  const setting = data.activitySettings?.find(item => item.field_key === key)
  return setting?.label || ACTIVITY_LABELS[index]
}

function pp6ActivityHours(data: ReportPayload, index: number) {
  const key = ACTIVITY_KEYS[index]
  const fallback = ACTIVITY_HOURS_FALLBACK[index] ?? 0
  return activityHoursForField(data.activitySettings || [], key, fallback)
}

function setStroke(doc: jsPDF, rgb: [number, number, number], width = 0.35) {
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
    /** ไม่ตัดข้อความด้วย … — ใช้เมื่อต้องการแสดงเต็มหรือครอบเอง */
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
  const pad = 0.8
  const maxW = Math.max(1, w - pad * 2)
  const label = opts?.noFit ? (text || '') : fitText(doc, text, maxW)
  // กลางแนวตั้ง + nudge จาก layout (ค่าลบ = ขึ้น)
  const nudge = opts?.textNudgeMm ?? -0.85
  const textY = y + h / 2 + nudge
  if (align === 'left') doc.text(label, x + pad, textY, { baseline: 'middle' })
  else if (align === 'right') doc.text(label, x + w - pad, textY, { baseline: 'middle', align: 'right' })
  else doc.text(label, x + w / 2, textY, { baseline: 'middle', align: 'center' })
}

/** ช่องป้ายซ้ายยาว — ย่อฟอนต์ให้ครบ ไม่ตัดคำขึ้นต้น */
function drawLabelValueRow(
  doc: jsPDF,
  x: number,
  y: number,
  totalW: number,
  h: number,
  label: string,
  value: string,
  opts: {
    fontSize: number
    muted?: boolean
    header?: boolean
    textNudgeMm?: number
    borderWidthMm?: number
    valueColWidthMm?: number
  },
) {
  if (opts.header) {
    drawCell(doc, x, y, totalW, h, label, {
      bold: true,
      fontSize: opts.fontSize,
      noFit: true,
      textNudgeMm: opts.textNudgeMm,
      borderWidthMm: opts.borderWidthMm,
    })
    return
  }
  const valueW = opts.valueColWidthMm ?? 20
  const labelW = Math.max(24, totalW - valueW)
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(opts.fontSize)
  let fontSize = opts.fontSize
  const maxLabelW = labelW - 1.6
  while (fontSize > 8 && doc.getTextWidth(label) > maxLabelW) {
    fontSize -= 0.4
    doc.setFontSize(fontSize)
  }
  drawCell(doc, x, y, labelW, h, label, {
    align: 'left',
    fontSize,
    noFit: true,
    textNudgeMm: opts.textNudgeMm,
    borderWidthMm: opts.borderWidthMm,
  })
  drawCell(doc, x + labelW, y, valueW, h, value, {
    fontSize: opts.fontSize,
    bold: true,
    muted: opts.muted,
    noFit: true,
    textNudgeMm: opts.textNudgeMm,
    borderWidthMm: opts.borderWidthMm,
  })
}

function tableWidth(layout: Pp6SectionLayout) {
  const contentW = PAGE_W - layout.padSideMm * 2
  return contentW * (layout.tableWidthPct / 100)
}

function tableLeft(layout: Pp6SectionLayout) {
  return (PAGE_W - tableWidth(layout)) / 2
}

function drawScoreTableHeader(doc: jsPDF, layout: Pp6SectionLayout, y: number, textNudgeMm: number) {
  const x0 = tableLeft(layout)
  const cols = [...SCORE_COLS_MM]
  const totalW = cols.reduce((a, b) => a + b, 0)
  const scale = tableWidth(layout) / totalW
  const widths = cols.map(c => c * scale)
  const row1 = layout.theadHeightMm
  const row2 = layout.theadHeightMm * 0.85
  const fontSize = ptFromCssPx(layout.fontTablePx)
  const borderWidthMm = layout.borderWidthMm ?? 0.3

  const drawHeaderCell = (cx: number, cy: number, cw: number, ch: number, text: string) => {
    drawCell(doc, cx, cy, cw, ch, text, { bold: true, fontSize, textNudgeMm, borderWidthMm })
  }

  let x = x0
  drawHeaderCell(x, y, widths[0], row1 + row2, 'ที่'); x += widths[0]
  drawHeaderCell(x, y, widths[1], row1 + row2, 'รหัสวิชา'); x += widths[1]
  drawHeaderCell(x, y, widths[2], row1 + row2, 'ชื่อวิชา'); x += widths[2]
  drawHeaderCell(x, y, widths[3], row1 + row2, 'ประเภท'); x += widths[3]
  drawHeaderCell(x, y, widths[4], row1 + row2, 'น้ำหนัก'); x += widths[4]

  const g1 = widths[5] + widths[6]
  const g2 = widths[7] + widths[8]
  const g3 = widths[9] + widths[10]
  drawHeaderCell(x, y, g1, row1, 'ภาคเรียนที่ 1')
  drawHeaderCell(x + g1, y, g2, row1, 'ภาคเรียนที่ 2')
  drawHeaderCell(x + g1 + g2, y, g3, row1, 'ปีการศึกษา')

  drawHeaderCell(x, y + row1, widths[5], row2, 'คะแนน')
  drawHeaderCell(x + widths[5], y + row1, widths[6], row2, 'เกรด')
  drawHeaderCell(x + g1, y + row1, widths[7], row2, 'คะแนน')
  drawHeaderCell(x + g1 + widths[7], y + row1, widths[8], row2, 'เกรด')
  drawHeaderCell(x + g1 + g2, y + row1, widths[9], row2, 'คะแนน')
  drawHeaderCell(x + g1 + g2 + widths[9], y + row1, widths[10], row2, 'เกรด')

  return { y: y + row1 + row2, widths, x0 }
}

async function drawStudentPage(
  doc: jsPDF,
  input: {
    data: ReportPayload
    student: ReportStudent
    term: 0 | 1 | 2
    ranked: boolean
    showGrade: boolean
    layout: Pp6SectionLayout
    logoData: string | null
    homeroomSig: string | null
    directorSig: string | null
    rankMap: Map<string, number>
  },
) {
  const { data, student, term, ranked, showGrade, layout, logoData, homeroomSig, directorSig, rankMap } = input
  const subjects = data.subjects || []
  const padX = layout.padSideMm
  const contentTop = layout.padTopMm
  const cellNudge = layout.cellTextNudgeMm ?? -0.85
  const borderW = layout.borderWidthMm ?? 0.3
  let y = contentTop

  const cell = (
    x: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    opts?: Parameters<typeof drawCell>[6],
  ) => drawCell(doc, x, cy, w, h, text, { textNudgeMm: cellNudge, borderWidthMm: borderW, ...opts })

  // doc mark
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.docMarkFontPx))
  setText(doc)
  doc.text('ปพ.6', PAGE_W - layout.docMarkRightMm, layout.docMarkTopMm, { align: 'right', baseline: 'top' })

  // header
  const headTop = y + layout.headTopMm
  const logoSize = layout.logoSizeMm
  const logoTop = headTop + (layout.logoTopOffsetMm ?? 2)
  if (logoData) {
    doc.addImage(logoData, 'JPEG', layout.logoLeftMm, logoTop, logoSize, logoSize)
  } else {
    setStroke(doc, [203, 213, 225], 0.4)
    doc.rect(layout.logoLeftMm, logoTop, logoSize, logoSize)
    doc.setFontSize(8)
    doc.text((data.school?.name || 'รร').slice(0, 2), layout.logoLeftMm + logoSize / 2, logoTop + logoSize / 2, {
      align: 'center',
      baseline: 'middle',
    })
  }

  const title = term === 1
    ? 'แบบรายงานความก้าวหน้าการเรียน ภาคเรียนที่ 1'
    : 'แบบรายงานผลการพัฒนาคุณภาพผู้เรียนรายบุคคล'
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(ptFromCssPx(layout.fontH1Px))
  doc.text(`${title} ปีการศึกษา ${data.academicYear?.year_be || '-'}`, PAGE_W / 2, headTop + (layout.titleOffsetYMm ?? 8), {
    align: 'center',
    baseline: 'middle',
  })
  doc.setFontSize(ptFromCssPx(layout.fontSubPx))
  doc.text(
    `โรงเรียน${data.school?.name || '-'} อำเภอ ${data.school?.district || '-'} ${schoolOfficeLine(data)}`,
    PAGE_W / 2,
    headTop + (layout.schoolLineOffsetYMm ?? 14),
    { align: 'center', baseline: 'middle' },
  )

  y = Math.max(logoTop + logoSize, headTop + (layout.schoolLineOffsetYMm ?? 14) + 4)
    + (layout.afterHeaderGapMm ?? layout.sectionGapMm)

  // student line — แยกป้ายกับค่า แบบพรีวิว
  const studentFont = ptFromCssPx(layout.fontStudentLinePx)
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(studentFont)
  setText(doc)
  const studentBits: Array<{ label: string; value: string; underline?: boolean }> = [
    { label: 'เลขประจำตัวนักเรียน', value: student.student_code || '-', underline: false },
    { label: 'ชื่อ-นามสกุล', value: studentName(student), underline: true },
    { label: 'ชั้น', value: classLabel(data.classroom), underline: true },
    { label: '', value: termTitle(term), underline: true },
  ]
  const bitGap = 3
  const bitWidths = studentBits.map(bit => {
    doc.setFont('THSarabunNew', 'bold')
    const labelW = bit.label ? doc.getTextWidth(bit.label) + 1.5 : 0
    doc.setFont('THSarabunNew', 'normal')
    const valueW = Math.max(16, doc.getTextWidth(bit.value) + 4)
    return labelW + valueW
  })
  const totalBitsW = bitWidths.reduce((a, b) => a + b, 0) + bitGap * (studentBits.length - 1)
  let bx = (PAGE_W - totalBitsW) / 2
  const lineY = y + 3.2
  studentBits.forEach((bit, i) => {
    if (bit.label) {
      doc.setFont('THSarabunNew', 'bold')
      doc.text(bit.label, bx, lineY, { baseline: 'middle' })
      bx += doc.getTextWidth(bit.label) + 1.5
    }
    doc.setFont('THSarabunNew', 'bold')
    const vw = Math.max(16, doc.getTextWidth(bit.value) + 4)
    doc.text(bit.value, bx + vw / 2, lineY, { align: 'center', baseline: 'middle' })
    if (bit.underline) {
      setStroke(doc, BORDER, 0.35)
      doc.line(bx, lineY + 2.8, bx + vw, lineY + 2.8)
    }
    bx += vw + bitGap
    void i
  })
  y += (layout.studentLineHeightMm ?? 8) + (layout.afterStudentGapMm ?? layout.sectionGapMm)

  // score table
  const header = drawScoreTableHeader(doc, layout, y, cellNudge)
  y = header.y
  const rowH = Math.max(px(layout.rowHeightPx), 5.2)
  const tableFont = ptFromCssPx(layout.fontTablePx)
  const nameFont = ptFromCssPx(layout.fontNamePx)
  const paddedSubjects: Array<ReportSubject | null> = [...subjects]
  while (paddedSubjects.length < layout.minSubjectRows) paddedSubjects.push(null)

  paddedSubjects.forEach((subject, index) => {
    const mutedTerm2 = term === 1
    let x = header.x0
    const cells: Array<{ text: string; align?: 'left' | 'center'; muted?: boolean; fontSize?: number }> = []
    if (!subject) {
      cells.push(
        { text: String(index + 1) },
        { text: '' },
        { text: '', align: 'left' },
        { text: '' },
        { text: '' },
        { text: '' },
        { text: '', muted: term === 1 && !showGrade },
        { text: '', muted: mutedTerm2 },
        { text: '', muted: mutedTerm2 },
        { text: '', muted: mutedTerm2 },
        { text: '', muted: mutedTerm2 },
      )
    } else {
      const term1 = pp6TermScore(data, student.id, subject.class_subject_id, 1)
      const term2 = pp6TermScore(data, student.id, subject.class_subject_id, 2)
      const annual = pp6AnnualScore(data, student.id, subject.class_subject_id)
      cells.push(
        { text: String(index + 1) },
        { text: subject.subject.code || '' },
        { text: subject.subject.name || '', align: 'left', fontSize: nameFont },
        { text: pp6SubjectType(subject) },
        { text: formatPp6Number(pp6SubjectWeight(subject)) },
        { text: formatPp6Number(term1.total) },
        { text: term !== 1 || showGrade ? formatPp6Number(term1.grade, 1) : '', muted: term === 1 && !showGrade },
        { text: term === 1 ? '' : formatPp6Number(term2.total), muted: mutedTerm2 },
        { text: term === 1 ? '' : formatPp6Number(term2.grade, 1), muted: mutedTerm2 },
        { text: term === 1 ? '' : formatPp6Number(annual.total), muted: mutedTerm2 },
        { text: term === 1 ? '' : formatPp6Number(annual.grade, 1), muted: mutedTerm2 },
      )
    }
    cells.forEach((c, i) => {
      cell(x, y, header.widths[i], rowH, c.text, {
        align: c.align || 'center',
        fontSize: c.fontSize || tableFont,
        muted: c.muted,
      })
      x += header.widths[i]
    })
    y += rowH
  })

  y += layout.afterScoreGapMm ?? layout.sectionGapMm

  if (ranked && term === 1) {
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(ptFromCssPx(layout.fontBasePx))
    setText(doc)
    y += layout.rankGapTopMm ?? 2
    doc.text(`ได้อันดับที่ ${rankMap.get(student.id) || '-'} ของห้อง`, tableLeft(layout), y + 2.2, {
      align: 'left',
      baseline: 'middle',
    })
    y += 5 + (layout.rankGapBottomMm ?? 3)
  }

  if (term === 1) {
    doc.setFont('THSarabunNew', 'bold')
    const noteFontPt = ptFromCssPx(layout.fontNotePx)
    doc.setFontSize(noteFontPt)
    doc.setTextColor(255, 0, 0)
    const note = 'หมายเหตุ.- ภาคเรียนที่ 1 จะเป็นการรายงานความก้าวหน้าทางการเรียนของผู้เรียน ส่วนผลการพัฒนาคุณภาพผู้เรียน นั้น โรงเรียนจะรายงานให้ผู้ปกครองทราบเมื่อสิ้นปีการศึกษา เกรดที่แสดงนี้ เป็นเพียงการเทียบเคียงเกณฑ์การวัดผล ไม่ใช่เกรดจริง'
    const noteLines = doc.splitTextToSize(note, tableWidth(layout))
    y += layout.noteGapTopMm ?? 2
    const lineFactor = layout.noteLineHeight ?? 0.85
    const lineH = noteFontPt * 0.352777778 * lineFactor
    noteLines.forEach((line, i) => {
      doc.text(line, tableLeft(layout), y + i * lineH, { baseline: 'top' })
    })
    setText(doc)
    y += noteLines.length * lineH + (layout.noteGapBottomMm ?? 2)
  }

  y += layout.activityGapTopMm ?? 0

  // activity table — หัวตารางแบบพรีวิว (colspan 2 + ชั่วโมง + ผล)
  const actW = tableWidth(layout)
  const actX = tableLeft(layout)
  const actH = layout.activityRowHeightMm ?? 6.4
  const actFont = ptFromCssPx(15)
  const codeW = 19
  const hoursW = actW * 0.15
  const resultW = actW * 0.15
  const nameW = actW - codeW - hoursW - resultW
  cell(actX, y, codeW + nameW, actH, 'กิจกรรมพัฒนาผู้เรียน', { bold: true, fontSize: actFont })
  cell(actX + codeW + nameW, y, hoursW, actH, 'จำนวนชั่วโมง', { bold: true, fontSize: actFont })
  cell(actX + codeW + nameW + hoursW, y, resultW, actH, 'ผลการประเมิน', { bold: true, fontSize: actFont })
  y += actH

  const activityRow = rowFor(data.evaluations.activities || [], student.id)
  ACTIVITY_LABELS.forEach((label, index) => {
    cell(actX, y, codeW, actH, pp6ActivityCode(data, index), { bold: true, fontSize: actFont })
    cell(actX + codeW, y, nameW, actH, pp6ActivityLabel(data, index) || label, { align: 'left', fontSize: actFont, noFit: true })
    cell(actX + codeW + nameW, y, hoursW, actH, String(pp6ActivityHours(data, index)), { fontSize: actFont })
    cell(actX + codeW + nameW + hoursW, y, resultW, actH,
      term === 1 ? '' : String(activityRow?.[ACTIVITY_KEYS[index]] || '-'),
      { fontSize: actFont, muted: term === 1 },
    )
    y += actH
  })

  y += layout.afterActivityGapMm ?? layout.sectionGapMm
  y += layout.summaryGapTopMm ?? 0

  if (term !== 1) {
    const gpa = studentGpa(data, student.id, subjects)
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(ptFromCssPx(layout.fontBasePx))
    setText(doc)
    let gpaText = `ผลการเรียนเฉลี่ย (GPA) ${gpa === null ? '-' : gpa.toFixed(2)}`
    if (ranked) gpaText += `  ได้อันดับที่ ${rankMap.get(student.id) || '-'} ของห้อง`
    doc.text(gpaText, PAGE_W / 2, y + 3, { align: 'center', baseline: 'middle' })
    y += 7
  }

  // bottom grid
  const characterRow = rowForTerm(data.evaluations.character || [], student.id, term)
  const readingRow = rowForTerm(data.evaluations.reading || [], student.id, term)
  const basicUnits = subjects.filter(s => pp6SubjectType(s) === 'พื้นฐาน').reduce((sum, s) => sum + pp6SubjectWeight(s), 0)
  const electiveUnits = subjects.filter(s => pp6SubjectType(s) === 'เพิ่มเติม').reduce((sum, s) => sum + pp6SubjectWeight(s), 0)

  const bottomTop = y
  // ตรง CSS: grid 89mm + signatures
  const summaryW = layout.summaryWidthMm ?? 89
  const summaryX = actX
  const sumH = layout.summaryRowHeightMm ?? 6.2
  const sumFont = ptFromCssPx(15)
  const summaryRows: Array<{ label: string; value: string; header?: boolean }> = [
    { label: 'สรุปผลการประเมิน', value: '', header: true },
    { label: 'จำนวนหน่วยกิต/น้ำหนักวิชาพื้นฐานที่ได้', value: term === 1 ? '' : formatPp6Number(basicUnits) },
    { label: 'จำนวนหน่วยกิต/น้ำหนักวิชาเพิ่มเติมที่ได้', value: term === 1 ? '' : formatPp6Number(electiveUnits) },
    { label: 'รวมจำนวนหน่วยกิต/น้ำหนักที่ได้', value: term === 1 ? '' : formatPp6Number(basicUnits + electiveUnits) },
    { label: 'การประเมินคุณลักษณะ', value: '', header: true },
    { label: 'ผลการประเมินคุณลักษณะอันพึงประสงค์', value: term === 1 ? '' : levelFromAverage(averageScore(characterRow, CHARACTER_KEYS)) },
    { label: 'ผลการประเมินการอ่าน คิด วิเคราะห์และเขียน', value: term === 1 ? '' : levelFromAverage(averageScore(readingRow, READING_KEYS)) },
    { label: 'ผลการประเมินกิจกรรมพัฒนาผู้เรียน', value: term === 1 ? '' : String(activityRow?.overall_result || '-') },
  ]

  let sy = bottomTop
  summaryRows.forEach(row => {
    drawLabelValueRow(doc, summaryX, sy, summaryW, sumH, row.label, row.value, {
      fontSize: sumFont,
      muted: term === 1 && !row.header,
      header: row.header,
      textNudgeMm: cellNudge,
      borderWidthMm: borderW,
      valueColWidthMm: layout.valueColWidthMm ?? 20,
    })
    sy += sumH
  })

  // signatures
  const sigX = summaryX + summaryW + 4
  const sigW = PAGE_W - padX - sigX
  const sigBlockH = (sy - bottomTop) / 2
  const drawSign = async (
    blockY: number,
    sigUrl: string | null,
    name: string,
    lines: string[],
    boxX = sigX,
    boxW = sigW,
  ) => {
    const imgH = 10
    const imgW = Math.min(28, Math.max(16, boxW - 8))
    if (sigUrl) {
      try {
        doc.addImage(sigUrl, 'JPEG', boxX + (boxW - imgW) / 2, blockY, imgW, imgH)
      } catch {
        setStroke(doc, BORDER, 0.3)
        doc.line(boxX + 2, blockY + imgH, boxX + boxW - 2, blockY + imgH)
      }
    } else {
      setStroke(doc, BORDER, 0.3)
      doc.line(boxX + 2, blockY + imgH, boxX + boxW - 2, blockY + imgH)
    }
    doc.setFont('THSarabunNew', 'normal')
    const nameFont = Math.min(10, Math.max(7.5, boxW * 0.22))
    doc.setFontSize(nameFont)
    const nameText = fitText(doc, `(${name})`, boxW - 2)
    doc.text(nameText, boxX + boxW / 2, blockY + imgH + 4, { align: 'center' })
    doc.setFontSize(10)
    lines.forEach((line, i) => {
      doc.text(line, boxX + boxW / 2, blockY + imgH + 8 + i * 3.5, { align: 'center' })
    })
  }

  const teachers = homeroomTeacherNames(data.classroom)
  const directorPos = directorActingPositionLine(data.school)
  if (teachers.length >= 2) {
    const gap = 3
    const colW = (sigW - gap) / 2
    await drawSign(bottomTop, homeroomSig, teachers[0], ['ครูประจำชั้น'], sigX, colW)
    await drawSign(bottomTop, null, teachers[1], ['ครูประจำชั้น'], sigX + colW + gap, colW)
  } else {
    await drawSign(bottomTop, homeroomSig, teachers[0] || '-', ['ครูประจำชั้น'])
  }
  await drawSign(
    bottomTop + sigBlockH,
    directorSig,
    directorDisplayName(data.school),
    [directorPos, directorSchoolLine(data.school)].filter(Boolean) as string[],
  )
}

/**
 * สร้าง PDF ปพ.6 ด้วย jsPDF (แนวเดียวกับธุรการชั้นเรียน — ไม่ผ่าน Puppeteer)
 */
export async function buildPp6PdfBlob(options: Pp6PdfOptions) {
  const data = options.data
  if (!data?.students?.length) throw new Error('ไม่พบข้อมูลนักเรียนสำหรับสร้าง ปพ.6')

  const layout = { ...DEFAULT_PP6_SECTION_LAYOUT, ...options.layout }
  const term = options.term
  const ranked = options.ranked !== false
  const showGrade = options.showGrade !== false
  const students = options.individual && options.selectedStudentId
    ? data.students.filter(s => s.id === options.selectedStudentId)
    : data.students
  if (!students.length) throw new Error('ไม่พบนักเรียนที่เลือก')

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })
  await applyThaiFonts(doc)

  const [logoData, homeroomSig, directorSig] = await Promise.all([
    loadImageDataUrl(data.school?.logo_url, 160, 0.7),
    loadImageDataUrl(data.documentSignatures?.homeroom, 220, 0.75),
    loadImageDataUrl(data.documentSignatures?.director, 220, 0.75),
  ])

  const rankMap = buildPp6RankMap(data, data.subjects || [], term)

  for (let i = 0; i < students.length; i++) {
    if (i > 0) doc.addPage()
    await drawStudentPage(doc, {
      data,
      student: students[i],
      term,
      ranked,
      showGrade,
      layout,
      logoData,
      homeroomSig,
      directorSig,
      rankMap,
    })
  }

  const classText = data.classroom ? `${data.classroom.level}-${data.classroom.room}` : 'ปพ6'
  const yearText = data.academicYear?.year_be || ''
  const fileName = (options.fileName
    || `ปพ.6 นักเรียน_${classText}_${yearText}.pdf`).replace(/[\\/:*?"<>|]/g, '-')

  return {
    blob: doc.output('blob'),
    fileName,
  }
}
