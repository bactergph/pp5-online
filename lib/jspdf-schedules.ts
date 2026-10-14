import { scheduleSchoolName } from '@/lib/schedule-school-name'
import { jsPDF } from 'jspdf'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import { SCHEDULE_DAYS, SCHEDULE_MORNING_PERIODS, SCHEDULE_PERIODS } from '@/lib/schedules'
import { periodTimeLabel, schedulePeriods, type PeriodTimeRow } from '@/lib/schedule-helpers'

const PAGE_W = 297
const MARGIN_X = 12
const LOGO_SIZE = 18
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

function scheduleFileName(title: string) {
  const safe = (title || 'ตารางเรียน').replace(/[\\/:*?"<>|]+/g, '-')
  return `${safe}.pdf`
}

/** ความกว้างคอลัมน์: วัน + คาบเช้า + พักเที่ยง + คาบบ่าย */
function columnWidths(count: number) {
  const contentW = PAGE_W - MARGIN_X * 2
  const dayW = 26
  const breakW = 20
  const periodW = (contentW - dayW - breakW) / count
  return { dayW, breakW, periodW }
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

  const lines = [line1, line2, opts?.line3, opts?.line4].filter((line): line is string => !!line)
  if (!lines.length) return
  const maxW = w - 2
  const sizes = lines.length > 2 ? [10, 8, 8, 7] : [opts?.line1Size ?? 12, opts?.line2Size ?? 10]
  const step = lines.length > 2 ? 3.6 : 4.6
  let baseline = y + h / 2 - ((lines.length - 1) * step) / 2
  lines.forEach((text, index) => {
    doc.setFont('THSarabunNew', index === 0 && opts?.line1Bold !== false ? 'bold' : 'normal')
    doc.setFontSize(sizes[index] || 8)
    doc.setTextColor(...(index === 0 ? TEXT : opts?.line2Color ?? MUTED))
    doc.text(fitText(doc, text, maxW), x + w / 2, baseline, { align: 'center', baseline: 'middle' })
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
  for (const [index, sheet] of pages.entries()) {
  if (index) doc.addPage()
  let y = 14
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', (PAGE_W - LOGO_SIZE) / 2, y, LOGO_SIZE, LOGO_SIZE)
    } catch { /* ignore */ }
  } else {
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.rect((PAGE_W - LOGO_SIZE) / 2, y, LOGO_SIZE, LOGO_SIZE)
  }

  y += LOGO_SIZE + 2
  const textX = PAGE_W / 2
  doc.setFont('THSarabunNew', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...TEXT)
  doc.text(scheduleSchoolName(input.schoolName), textX, y + 7, { align: 'center' })

  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(15)
  doc.setTextColor(...TEXT)
  doc.text(sheet.title || '', textX, y + 14, { align: 'center' })
  doc.setTextColor(...TEXT)

  y += LOGO_SIZE + 4
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y)
  y += 6

  const { dayW, breakW, periodW } = columnWidths(PERIODS.length)
  const detailed = Object.values(sheet.gridData).some(cell => cell.line3 || cell.line4)
  const headerH = 12
  const rowH = detailed ? 20 : 16

  let x = MARGIN_X
  drawCell(doc, x, y, dayW, headerH, 'วัน', '', { fill: HEADER_BG, line1Size: 12 })
  x += dayW
  for (const p of PERIODS.slice(0, MORNING)) {
    drawCell(doc, x, y, periodW, headerH, `คาบ ${p}`, periodTimeLabel(input.periodTimes, p), {
      fill: HEADER_BG, line1Size: 12, line2Size: 9, line2Color: TEXT,
    })
    x += periodW
  }
  drawCell(doc, x, y, breakW, headerH, 'พักเที่ยง', '', { fill: BREAK_BG, line1Size: 11, line1Bold: true })
  x += breakW
  for (const p of PERIODS.slice(MORNING)) {
    drawCell(doc, x, y, periodW, headerH, `คาบ ${p}`, periodTimeLabel(input.periodTimes, p), {
      fill: HEADER_BG, line1Size: 12, line2Size: 9, line2Color: TEXT,
    })
    x += periodW
  }
  y += headerH

  for (const day of SCHEDULE_DAYS.filter(d=>!input.days||input.days.includes(d.value))) {
    x = MARGIN_X
    drawCell(doc, x, y, dayW, rowH, day.label, '', { fill: DAY_BG, line1Size: 11 })
    x += dayW
    for (const p of PERIODS.slice(0, MORNING)) {
      const cell = sheet.gridData[`${day.value}-${p}`]
      drawCell(doc, x, y, periodW, rowH, cell?.line1 || '—', cell?.line2 || '', { line3: cell?.line3, line4: cell?.line4 })
      x += periodW
    }
    drawCell(doc, x, y, breakW, rowH, 'พัก', '', { fill: BREAK_BG, line2Color: BREAK_TEXT, line1Size: 9 })
    x += breakW
    for (const p of PERIODS.slice(MORNING)) {
      const cell = sheet.gridData[`${day.value}-${p}`]
      drawCell(doc, x, y, periodW, rowH, cell?.line1 || '—', cell?.line2 || '', { line3: cell?.line3, line4: cell?.line4 })
      x += periodW
    }
    y += rowH
  }

  y += 16
  for (const signer of [
    { x: 82, name: input.academicHeadName, role: 'หัวหน้าวิชาการ' },
    { x: 215, name: input.directorName, role: input.directorPosition || 'ผู้อำนวยการสถานศึกษา' },
  ]) {
    doc.setFont('THSarabunNew', 'normal'); doc.setFontSize(14)
    doc.setTextColor(...TEXT)
    doc.text('ลงชื่อ ........................................................', signer.x, y, { align: 'center' })
    doc.text('(' + (signer.name || '........................................................') + ')', signer.x, y + 7, { align: 'center' })
    doc.text(signer.role, signer.x, y + 14, { align: 'center' })
    doc.text('วันที่ ........../........../..........', signer.x, y + 21, { align: 'center' })
  }
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
  rows: { name: string; position: string | null; hours: number; status_label: string }[]
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
  const headers = ['ที่', 'ครูผู้สอน', 'ตำแหน่ง', 'คาบ/สัปดาห์', 'สถานะ']
  const drawHead = () => {
    let x = margin
    headers.forEach((label, i) => { drawCell(doc, x, y, widths[i], 10, label, '', { fill: HEADER_BG, line1Size: 14 }); x += widths[i] })
    y += 10
  }
  drawHead()
  input.rows.forEach((row, index) => {
    if (y > 250) { doc.addPage(); y = drawHeader(); drawHead() }
    const values = [String(index + 1), row.name, row.position || '—', String(row.hours), row.status_label]
    let x = margin
    values.forEach((value, i) => { drawCell(doc, x, y, widths[i], 9, value, '', { line1Size: 13, line1Bold: i === 0 || i === 3 }); x += widths[i] })
    y += 9
  })
  if (y > 240) { doc.addPage(); y = 24 }
  y += 16
  for (const signer of [
    { x: 58, name: input.academicHeadName, role: 'หัวหน้าวิชาการ' },
    { x: 152, name: input.directorName, role: input.directorPosition || 'ผู้อำนวยการสถานศึกษา' },
  ]) {
    doc.setFont('THSarabunNew', 'normal'); doc.setFontSize(14)
    doc.text('ลงชื่อ ........................................', signer.x, y, { align: 'center' })
    doc.text('(' + (signer.name || '........................................') + ')', signer.x, y + 7, { align: 'center' })
    doc.text(signer.role, signer.x, y + 14, { align: 'center' })
    doc.text('วันที่ ........../........../..........', signer.x, y + 21, { align: 'center' })
  }
  return { blob: doc.output('blob'), fileName: input.fileName.replace(/[\\/:*?"<>|]/g, '-') }
}
