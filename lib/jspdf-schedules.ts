import { scheduleSchoolName } from '@/lib/schedule-school-name'
import { jsPDF } from 'jspdf'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import { SCHEDULE_DAYS, SCHEDULE_MORNING_PERIODS, SCHEDULE_PERIODS } from '@/lib/schedules'
import { periodTimeLabel, schedulePeriods, type PeriodTimeRow } from '@/lib/schedule-helpers'

const PAGE_W = 297
const PAGE_H = 210
const MARGIN_X = 10
const MARGIN_TOP = 6
const MARGIN_BOTTOM = 8
const LOGO_SIZE = 12
const PERIODS = SCHEDULE_PERIODS
const MORNING = SCHEDULE_MORNING_PERIODS

const BORDER: [number, number, number] = [0, 0, 0]
const HEADER_BG: [number, number, number] = [255, 255, 255]
const DAY_BG: [number, number, number] = [255, 255, 255]
const BREAK_BG: [number, number, number] = [229, 229, 229]
const BREAK_TEXT: [number, number, number] = [0, 0, 0]
const TEXT: [number, number, number] = [0, 0, 0]
const MUTED: [number, number, number] = [0, 0, 0]

export type SchedulePdfCell = { line1: string; line2: string; line3?: string; line4?: string }
export type SchedulePdfPage = { title: string; gridData: Record<string, SchedulePdfCell> }
export type SchedulePdfInput = {
  academicHeadName?: string
  directorName?: string
  directorPosition?: string
  schoolName: string
  schoolLogoUrl?: string | null
  title: string
  days?: number[]
  periodTimes: PeriodTimeRow[]
  gridData: Record<string, SchedulePdfCell>
  fileName?: string
  pages?: SchedulePdfPage[]
}

function fitText(doc: jsPDF, text: string, maxW: number) {
  const raw = text || ''
  if (!raw) return ''
  if (doc.getTextWidth(raw) <= maxW) return raw
  let out = raw
  while (out.length > 1 && doc.getTextWidth(`${out}…`) > maxW) out = out.slice(0, -1)
  return `${out}…`
}

function wrapLine(doc: jsPDF, text: string, maxW: number) {
  const raw = text.trim()
  if (!raw) return []
  if (doc.getTextWidth(raw) <= maxW) return [raw]
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return [fitText(doc, raw, maxW)]
  const lines: string[] = []
  let current = ''
  for (const part of parts) {
    const next = current ? `${current} ${part}` : part
    if (doc.getTextWidth(next) <= maxW) current = next
    else {
      if (current) lines.push(current)
      current = doc.getTextWidth(part) <= maxW ? part : fitText(doc, part, maxW)
    }
  }
  if (current) lines.push(current)
  return lines
}

function scheduleFileName(title: string) {
  const safe = (title || 'ตารางเรียน').replace(/[\\/:*?"<>|]+/g, '-')
  return `${safe}.pdf`
}

/** ความกว้างคอลัมน์: วัน + คาบเช้า + พักเที่ยง + คาบบ่าย */
function columnWidths(count: number) {
  const contentW = PAGE_W - MARGIN_X * 2
  const dayW = 28
  const breakW = 22
  const periodW = (contentW - dayW - breakW) / count
  return { dayW, breakW, periodW }
}

function lineStyle(h: number, count: number, opts?: { line1Size?: number; line2Size?: number }) {
  if (opts?.line1Size) {
    const second = opts.line2Size ?? Math.max(9, opts.line1Size - 2)
    return [opts.line1Size, second, second, Math.max(8, second - 1)]
  }
  if (count > 2) return [14, 12, 12, 11]
  return h >= 22 ? [16, 13] : [14, 11]
}

function drawSigners(
  doc: jsPDF,
  y: number,
  pageW: number,
  marginX: number,
  signers: { name?: string; role: string }[],
) {
  const colW = (pageW - marginX * 2) / signers.length
  const maxW = colW - 8
  const step = 6.3
  for (const [index, signer] of signers.entries()) {
    const center = marginX + colW * index + colW / 2
    const rows = [
      'ลงชื่อ ................................................',
      `(${signer.name?.trim() || '................................'})`,
      signer.role,
      'วันที่ ......../......../........',
    ]
    doc.setFont('THSarabunNew', 'normal')
    doc.setTextColor(...TEXT)
    rows.forEach((row, rowIndex) => {
      let size = 15
      doc.setFontSize(size)
      while (size > 10 && doc.getTextWidth(row) > maxW) {
        size -= 0.5
        doc.setFontSize(size)
      }
      doc.text(doc.getTextWidth(row) > maxW ? fitText(doc, row, maxW) : row, center, y + rowIndex * step, { align: 'center' })
    })
  }
}

function drawCell(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  line1: string,
  line2: string,
  opts?: {
    fill?: [number, number, number]
    line2Color?: [number, number, number]
    line1Bold?: boolean
    line1Size?: number
    line2Size?: number
    line3?: string
    line4?: string
  },
) {
  if (opts?.fill) {
    doc.setFillColor(...opts.fill)
    doc.rect(x, y, w, h, 'F')
  }
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.rect(x, y, w, h, 'S')

  const logical = [line1, line2, opts?.line3, opts?.line4].filter((line): line is string => !!line)
  if (!logical.length) return
  const maxW = Math.max(4, w - 1.6)
  const sizes = lineStyle(h, logical.length, opts)
  const pieces: { text: string; size: number; bold: boolean }[] = []
  logical.forEach((text, index) => {
    const size = sizes[index] || 8
    const bold = index === 0 && opts?.line1Bold !== false
    doc.setFont('THSarabunNew', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    for (const part of wrapLine(doc, text, maxW)) pieces.push({ text: part, size, bold })
  })
  const count = pieces.length
  const step = Math.min(count > 2 ? 5.4 : 7.2, (h - 2.4) / Math.max(count, 1))
  let baseline = y + h / 2 - ((count - 1) * step) / 2
  pieces.forEach(piece => {
    doc.setFont('THSarabunNew', piece.bold ? 'bold' : 'normal')
    doc.setFontSize(piece.size)
    doc.setTextColor(...(piece.bold ? TEXT : opts?.line2Color ?? MUTED))
    doc.text(piece.text, x + w / 2, baseline, { align: 'center', baseline: 'middle' })
    baseline += step
  })
  doc.setTextColor(...TEXT)
}

/** สร้าง PDF ตารางเรียน/ตารางสอน ด้วย jsPDF บนเครื่องผู้ใช้ — คืน Blob ใส่คิวได้ */
export async function buildSchedulePdfBlob(input: SchedulePdfInput) {
  const PERIODS = schedulePeriods(input.periodTimes)
  const breakIndex = input.periodTimes.findIndex(t=>t.is_break)
  const MORNING = breakIndex >= 0 ? breakIndex : SCHEDULE_MORNING_PERIODS
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  await applyThaiFonts(doc)

  const logo = await loadImageDataUrl(input.schoolLogoUrl, 200, 0.8)
  const pages = input.pages?.length ? input.pages : [{ title: input.title, gridData: input.gridData }]
  const signers = [
    { name: input.academicHeadName, role: 'หัวหน้าวิชาการ' },
    { name: input.directorName, role: input.directorPosition || 'ผู้อำนวยการสถานศึกษา' },
  ]
  const signStep = 6.3
  for (const [index, sheet] of pages.entries()) {
  if (index) doc.addPage()
  let y = MARGIN_TOP
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', (PAGE_W - LOGO_SIZE) / 2, y, LOGO_SIZE, LOGO_SIZE)
    } catch { /* ignore */ }
  } else {
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.rect((PAGE_W - LOGO_SIZE) / 2, y, LOGO_SIZE, LOGO_SIZE)
  }

  const textX = PAGE_W / 2
  const titleMaxW = PAGE_W - MARGIN_X * 2
  y += LOGO_SIZE + 6
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...TEXT)
  doc.text(fitText(doc, scheduleSchoolName(input.schoolName), titleMaxW), textX, y, { align: 'center' })

  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(14)
  y += 7
  doc.text(fitText(doc, sheet.title || '', titleMaxW), textX, y, { align: 'center' })

  y += 3
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y)
  y += 3

  const days = SCHEDULE_DAYS.filter(d => !input.days || input.days.includes(d.value))
  const { dayW, breakW, periodW } = columnWidths(PERIODS.length)
  const headerH = 12
  const signBlock = signStep * 3
  const maxTableBottom = PAGE_H - MARGIN_BOTTOM - signBlock - 8
  const rowH = Math.min(26, (maxTableBottom - y - headerH) / Math.max(days.length, 1))

  let x = MARGIN_X
  drawCell(doc, x, y, dayW, headerH, 'วัน', '', { fill: HEADER_BG, line1Size: 14 })
  x += dayW
  for (const p of PERIODS.slice(0, MORNING)) {
    drawCell(doc, x, y, periodW, headerH, `คาบ ${p}`, periodTimeLabel(input.periodTimes, p), {
      fill: HEADER_BG, line1Size: 14, line2Size: 11, line2Color: TEXT,
    })
    x += periodW
  }
  drawCell(doc, x, y, breakW, headerH, 'พักเที่ยง', '', { fill: BREAK_BG, line1Size: 13, line1Bold: true })
  x += breakW
  for (const p of PERIODS.slice(MORNING)) {
    drawCell(doc, x, y, periodW, headerH, `คาบ ${p}`, periodTimeLabel(input.periodTimes, p), {
      fill: HEADER_BG, line1Size: 14, line2Size: 11, line2Color: TEXT,
    })
    x += periodW
  }
  y += headerH

  for (const day of days) {
    x = MARGIN_X
    drawCell(doc, x, y, dayW, rowH, day.label, '', { fill: DAY_BG })
    x += dayW
    for (const p of PERIODS.slice(0, MORNING)) {
      const cell = sheet.gridData[`${day.value}-${p}`]
      drawCell(doc, x, y, periodW, rowH, cell?.line1 || '—', cell?.line2 || '', { line3: cell?.line3, line4: cell?.line4 })
      x += periodW
    }
    drawCell(doc, x, y, breakW, rowH, 'พัก', '', { fill: BREAK_BG, line2Color: BREAK_TEXT })
    x += breakW
    for (const p of PERIODS.slice(MORNING)) {
      const cell = sheet.gridData[`${day.value}-${p}`]
      drawCell(doc, x, y, periodW, rowH, cell?.line1 || '—', cell?.line2 || '', { line3: cell?.line3, line4: cell?.line4 })
      x += periodW
    }
    y += rowH
  }

  drawSigners(doc, Math.min(y + 8, PAGE_H - MARGIN_BOTTOM - signBlock), PAGE_W, MARGIN_X, signers)
  }
  const fileName = (input.fileName || scheduleFileName(input.title)).replace(/[\\/:*?"<>|]/g, '-')
  return { blob: doc.output('blob'), fileName }
}

export async function buildWorkloadPdfBlob(input: {
  schoolName: string
  schoolLogoUrl?: string | null
  title: string
  fileName: string
  academicHeadName?: string
  directorName?: string
  directorPosition?: string
  rows: { name: string; position: string | null; hours: number; note?: string }[]
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  await applyThaiFonts(doc)
  const logo = await loadImageDataUrl(input.schoolLogoUrl, 200, 0.8)
  const pageW = 210
  const margin = 14
  const drawHeader = () => {
    let y = 14
    if (logo) { try { doc.addImage(logo, 'JPEG', (pageW - 16) / 2, y, 16, 16) } catch { /* ignore */ } }
    y += 20
    doc.setFont('THSarabunNew', 'bold'); doc.setFontSize(18); doc.text(scheduleSchoolName(input.schoolName), pageW / 2, y, { align: 'center' })
    doc.setFont('THSarabunNew', 'normal'); doc.setFontSize(16); doc.text(input.title, pageW / 2, y + 8, { align: 'center' })
    return y + 16
  }
  let y = drawHeader()
  const widths = [14, 68, 46, 28, 26]
  const headers = ['ที่', 'ครูผู้สอน', 'ตำแหน่ง', 'คาบ/สัปดาห์', 'หมายเหตุ']
  const drawHead = () => {
    let x = margin
    headers.forEach((label, i) => { drawCell(doc, x, y, widths[i], 10, label, '', { fill: HEADER_BG, line1Size: 14 }); x += widths[i] })
    y += 10
  }
  drawHead()
  input.rows.forEach((row, index) => {
    if (y > 250) { doc.addPage(); y = drawHeader(); drawHead() }
    const values = [String(index + 1), row.name, row.position || '—', String(row.hours), row.note || '']
    let x = margin
    values.forEach((value, i) => { drawCell(doc, x, y, widths[i], 9, value, '', { line1Size: 13, line1Bold: i === 0 || i === 3 }); x += widths[i] })
    y += 9
  })
  if (y + 8 + 6.3 * 3 > 297 - 8) { doc.addPage(); y = 24 }
  y += 10
  drawSigners(doc, y, 210, 14, [
    { name: input.academicHeadName, role: 'หัวหน้าวิชาการ' },
    { name: input.directorName, role: input.directorPosition || 'ผู้อำนวยการสถานศึกษา' },
  ])
  return { blob: doc.output('blob'), fileName: input.fileName.replace(/[\\/:*?"<>|]/g, '-') }
}
