import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import {
  groupHomeroomWeeks,
  homeroomClassTitle,
  homeroomCountText,
  thaiHomeroomDate,
  type HomeroomDayCounts,
} from '@/lib/homeroom-activity'

export type HomeroomActivityPdfDay = {
  date: string
  topics: string[]
  counts: HomeroomDayCounts
}

export type HomeroomActivityPdfInput = {
  schoolName: string
  schoolLogoUrl?: string | null
  level: string
  room: number
  yearBe: number
  term: 1 | 2
  advisors?: string[]
  days: HomeroomActivityPdfDay[]
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG'
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP'
  return 'JPEG'
}

function drawAdvisorSignatures(doc: jsPDF, names: string[]) {
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const content = width - 24
  const gap = 10
  const slots = names.map(name => name.trim()).filter(Boolean)
  const shown = slots.length ? slots : ['']
  const y = height - 18
  doc.setFont('THSarabunNew', 'normal')
  doc.setFontSize(16)
  doc.setTextColor(0)
  const block = shown.length === 1 ? 110 : (content - gap) / 2
  const start = (width - (block * shown.length + gap * (shown.length - 1))) / 2
  shown.forEach((name, index) => {
    const x = start + index * (block + gap)
    const prefix = 'ลงชื่อ'
    const role = 'ครูประจำชั้น'
    const dotWidth = doc.getTextWidth('.')
    const dots = '.'.repeat(Math.max(12, Math.floor((block - doc.getTextWidth(prefix) - doc.getTextWidth(role) - 2) / dotWidth)))
    doc.text(prefix + dots + role, x, y)
    doc.text(`(${name || '................................'})`, x + block / 2, y + 7, { align: 'center' })
  })
}

function studentLines(counts: HomeroomDayCounts) {
  return [
    `นักเรียนทั้งหมด ${counts.total} คน`,
    `มา ${counts.present} คน`,
    `ลา ${homeroomCountText(counts.leave)} คน`,
    `ขาด ${homeroomCountText(counts.absent)} คน`,
    `ป่วย ${homeroomCountText(counts.sick)} คน`,
  ].join('\n')
}

export async function buildHomeroomActivityPdf(input: HomeroomActivityPdfInput) {
  const weeks = groupHomeroomWeeks(input.days.map(day => day.date))
  if (!weeks.length) throw new Error('เดือนนี้ยังไม่มีวันที่จะออกรายงาน')
  const byDate = new Map(input.days.map(day => [day.date, day]))
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  doc.setLineHeightFactor(1.15)
  await applyThaiFonts(doc)
  const logo = await loadImageDataUrl(input.schoolLogoUrl, 200, 0.8)
  const classTitle = homeroomClassTitle(input.level, input.room)
  const school = input.schoolName.trim() || 'โรงเรียน'
  const advisors = [input.advisors?.[0] || '', input.advisors?.[1] || ''].map(name => name.trim())
  const fileName = `แบบบันทึกกิจกรรม-Homeroom-${input.level}-${input.room}-${input.yearBe}-เทอม${input.term}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
  weeks.forEach((dates, index) => {
    if (index) doc.addPage()
    const width = doc.internal.pageSize.getWidth()
    let cursor = 12
    if (logo) {
      try {
        doc.addImage(logo, imageFormat(logo), (width - 16) / 2, cursor, 16, 16)
        cursor += 18
      } catch { /* โลโก้ที่อ่านไม่ได้ไม่ควรทำให้ทั้งรายงานหาย */ }
    }
    doc.setFont('THSarabunNew', 'bold')
    doc.setFontSize(18)
    doc.text(`แบบบันทึกกิจกรรม Homeroom ${classTitle}`, width / 2, cursor + 6, { align: 'center' })
    doc.setFont('THSarabunNew', 'normal')
    doc.setFontSize(16)
    doc.text(`ภาคเรียนที่ ${input.term} ปีการศึกษา ${input.yearBe} ${school}`, width / 2, cursor + 14, { align: 'center' })
    autoTable(doc, {
      startY: cursor + 20,
      margin: { left: 12, right: 12, bottom: 28 },
      head: [['วัน/เดือน/ปี', 'เรื่องที่อบรม/แนะนำ/แจ้งข่าวสาร', 'ข้อมูลนักเรียน']],
      body: dates.map(date => {
        const day = byDate.get(date)
        return [
          thaiHomeroomDate(date),
          day?.topics.filter(Boolean).join('\n') || '-',
          day ? studentLines(day.counts) : '-',
        ]
      }),
      styles: {
        font: 'THSarabunNew',
        fontSize: 14,
        textColor: 0,
        lineColor: 40,
        lineWidth: 0.2,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        valign: 'top',
        overflow: 'linebreak',
      },
      headStyles: { font: 'THSarabunNew', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: 0, halign: 'center', valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 63 },
        1: { cellWidth: 76 },
        2: { cellWidth: 47 },
      },
      theme: 'grid',
    })
    drawAdvisorSignatures(doc, advisors)
  })
  return { blob: doc.output('blob'), fileName }
}
