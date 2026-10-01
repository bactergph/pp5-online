import { jsPDF } from 'jspdf'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import { periodTimeLabel, type PeriodTimeRow } from '@/lib/schedule-helpers'

export type SubstitutePdfInput = {
  schoolName: string; logoUrl?: string | null; date: string; year: number; term: string
  academicHead: string; director: string; times: PeriodTimeRow[]
  teachers: { id: string; prefix: string; full_name: string }[]
  entries: { absent_teacher_id: string; period: number; room_label: string | null; subject_label: string | null; substitute_teacher_id: string | null; leave_type: string; note: string | null }[]
}

export async function buildSubstitutePdf(input: SubstitutePdfInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  await applyThaiFonts(doc)
  const logo = await loadImageDataUrl(input.logoUrl)
  const names = new Map(input.teachers.map(t => [t.id, `${t.prefix || ''} ${t.full_name}`.trim()]))
  const date = new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date(input.date + 'T12:00:00+07:00'))
  let y = 16
  const text = (value: string, x: number, top: number, size = 14, bold = false) => {
    doc.setFont('THSarabunNew', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(25, 35, 50)
    doc.text(value, x, top)
  }
  function header() {
    y = 16
    if (logo) { doc.addImage(logo, 'JPEG', 97, y, 16, 16); y += 22 }
    for (const line of ['บันทึกการสอนแทน', input.schoolName, `${date} | ปีการศึกษา ${input.year} ภาคเรียนที่ ${input.term}`]) {
      doc.setFont('THSarabunNew', 'bold'); doc.setFontSize(15)
      doc.text(line, 105, y, { align: 'center' }); y += 7
    }
    y += 3
  }
  function space(height: number) { if (y + height > 274) { doc.addPage(); header() } }
  function row(values: string[], heading = false) {
    const widths = [13, 25, 16, 40, 34, 22, 30]
    doc.setFont('THSarabunNew', heading ? 'bold' : 'normal'); doc.setFontSize(12)
    const lines = values.map((v, i) => doc.splitTextToSize(v || '—', widths[i] - 3) as string[])
    const h = Math.max(heading ? 10 : 14, ...lines.map(l => l.length * 5 + 4))
    space(h)
    let x = 15
    values.forEach((_, i) => {
      doc.setFillColor(...(heading ? [246, 229, 210] : [247, 249, 252]) as [number, number, number])
      doc.setDrawColor(160, 172, 190); doc.rect(x, y, widths[i], h, 'FD')
      text(lines[i].join('\n'), x + 1.5, y + 5, 12, heading); x += widths[i]
    })
    y += h
  }
  header()
  for (const teacher of [...new Set(input.entries.map(e => e.absent_teacher_id))]) {
    const entries = input.entries.filter(e => e.absent_teacher_id === teacher).sort((a,b) => a.period - b.period)
    space(45)
    doc.setFillColor(246, 229, 210); doc.rect(15, y, 180, 10, 'F')
    text(`ครูที่ลา: ${names.get(teacher) || '—'} | ${[...new Set(entries.map(e => e.leave_type))].join(', ')}`, 18, y + 6, 14, true); y += 10
    row(['คาบ','เวลา','ห้อง','วิชา','ครูสอนแทน','หมายเหตุ','ลงชื่อหลังสอน'], true)
    for (const e of entries) row([String(e.period), periodTimeLabel(input.times,e.period),e.room_label || '',e.subject_label || '',names.get(e.substitute_teacher_id || '') || 'ยังไม่กำหนด',e.note || '', '.....................'])
    space(17); text('ลงชื่อครูผู้ลา ........................................................ วันที่ ........../........../..........', 18, y + 8); y += 20
  }
  space(40)
  for (const [x, name, role] of [[23,input.academicHead,'หัวหน้าฝ่ายวิชาการ'],[119,input.director,'ผู้อำนวยการสถานศึกษา']] as const) {
    text('ลงชื่อ ................................................', x, y + 8)
    text(`(${name || '........................................'})`, x, y + 15)
    text(role, x, y + 22); text('วันที่ ........../........../..........', x, y + 29)
  }
  for (let i=1;i<=doc.getNumberOfPages();i++) { doc.setPage(i); text(`หน้า ${i} / ${doc.getNumberOfPages()}`,175,287,10) }
  return { blob: doc.output('blob'), fileName: `บันทึกการสอนแทน-${input.date}.pdf` }
}
