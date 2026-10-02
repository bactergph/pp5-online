import { scheduleSchoolName } from '@/lib/schedule-school-name'
import { jsPDF } from 'jspdf'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import { SCHEDULE_DAYS, SCHEDULE_MORNING_PERIODS, SCHEDULE_PERIODS } from '@/lib/schedules'
import { periodTimeLabel, type PeriodTimeRow } from '@/lib/schedule-helpers'

const PAGE_W = 297
const MARGIN_X = 12
const LOGO_SIZE = 18
const PERIODS = SCHEDULE_PERIODS
const MORNING = SCHEDULE_MORNING_PERIODS

const BORDER: [number, number, number] = [145, 163, 180]
const HEADER_BG: [number, number, number] = [210, 224, 235]
const DAY_BG: [number, number, number] = [227, 214, 195]
const BREAK_BG: [number, number, number] = [247, 234, 196]
const BREAK_TEXT: [number, number, number] = [180, 83, 9]
const TEXT: [number, number, number] = [0, 0, 0]
const MUTED: [number, number, number] = [100, 116, 139]

export type SchedulePdfInput = {
  academicHeadName?: string
  directorName?: string
  directorPosition?: string
  schoolName: string
  schoolLogoUrl?: string | null
  title: string
  periodTimes: PeriodTimeRow[]
  gridData: Record<string, { line1: string; line2: string }>
  fileName?: string
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
function columnWidths() {
  const contentW = PAGE_W - MARGIN_X * 2
  const dayW = 26
  const breakW = 20
  const periodW = (contentW - dayW - breakW) / PERIODS.length
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
  },
) {
  if (opts?.fill) {
    doc.setFillColor(...opts.fill)
    doc.rect(x, y, w, h, 'F')
  }
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.2)
  doc.rect(x, y, w, h, 'S')

  const maxW = w - 2
  const hasLine2 = !!line2
  const line1Size = opts?.line1Size ?? 10

  doc.setFont('THSarabunNew', opts?.line1Bold === false ? 'normal' : 'bold')
  doc.setFontSize(line1Size)
  doc.setTextColor(...TEXT)
  const l1Y = hasLine2 ? y + h / 2 - 1.4 : y + h / 2
  doc.text(fitText(doc, line1, maxW), x + w / 2, l1Y, { align: 'center', baseline: 'middle' })

  if (hasLine2) {
    doc.setFont('THSarabunNew', 'normal')
    doc.setFontSize(opts?.line2Size ?? 8)
    doc.setTextColor(...(opts?.line2Color ?? MUTED))
    doc.text(fitText(doc, line2, maxW), x + w / 2, y + h / 2 + 3.2, { align: 'center', baseline: 'middle' })
  }
  doc.setTextColor(...TEXT)
}

/** สร้าง PDF ตารางเรียน/ตารางสอน ด้วย jsPDF บนเครื่องผู้ใช้ — คืน Blob ใส่คิวได้ */
export async function buildSchedulePdfBlob(input: SchedulePdfInput) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  await applyThaiFonts(doc)

  const logo = await loadImageDataUrl(input.schoolLogoUrl, 200, 0.8)

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
  doc.text(input.title || '', textX, y + 14, { align: 'center' })
  doc.setTextColor(...TEXT)

  y += LOGO_SIZE + 4
  doc.setDrawColor(30, 41, 59)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y)
  y += 6

  const { dayW, breakW, periodW } = columnWidths()
  const headerH = 12
  const rowH = 16

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
      fill: HEADER_BG, line1Size: 9, line2Size: 7,
    })
    x += periodW
  }
  y += headerH

  for (const day of SCHEDULE_DAYS) {
    x = MARGIN_X
    drawCell(doc, x, y, dayW, rowH, day.label, '', { fill: DAY_BG, line1Size: 11 })
    x += dayW
    for (const p of PERIODS.slice(0, MORNING)) {
      const cell = input.gridData[`${day.value}-${p}`]
      drawCell(doc, x, y, periodW, rowH, cell?.line1 || '—', cell?.line2 || '')
      x += periodW
    }
    drawCell(doc, x, y, breakW, rowH, 'พัก', '', { fill: BREAK_BG, line2Color: BREAK_TEXT, line1Size: 9 })
    x += breakW
    for (const p of PERIODS.slice(MORNING)) {
      const cell = input.gridData[`${day.value}-${p}`]
      drawCell(doc, x, y, periodW, rowH, cell?.line1 || '—', cell?.line2 || '')
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
  const fileName = (input.fileName || scheduleFileName(input.title)).replace(/[\\/:*?"<>|]/g, '-')
  return { blob: doc.output('blob'), fileName }
}
