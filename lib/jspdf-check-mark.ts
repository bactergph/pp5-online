import type { jsPDF } from 'jspdf'

/** วาดช่องสี่เหลี่ยม + เครื่องหมายถูกทับ (ไม่พึ่ง glyph ในฟอนต์ไทย) */
export function drawJsPdfCheckbox(
  doc: jsPDF,
  x: number,
  centerY: number,
  size: number,
  checked: boolean,
  opts?: { strokeRgb?: [number, number, number]; boxStroke?: number; checkStroke?: number },
) {
  const strokeRgb = opts?.strokeRgb || ([17, 24, 39] as [number, number, number])
  const boxStroke = opts?.boxStroke ?? 0.35
  const checkStroke = opts?.checkStroke ?? Math.max(0.9, size * 0.14)
  const top = centerY - size / 2

  doc.setDrawColor(...strokeRgb)
  doc.setLineWidth(boxStroke)
  doc.rect(x, top, size, size, 'S')

  if (!checked) return

  // เครื่องหมายถูกทับช่อง — ยื่นเล็กน้อยให้อ่านชัดบน PDF
  const inset = size * 0.12
  const x1 = x + inset
  const y1 = centerY + size * 0.02
  const x2 = x + size * 0.38
  const y2 = centerY + size * 0.32
  const x3 = x + size - inset * 0.35
  const y3 = centerY - size * 0.34

  doc.setLineWidth(checkStroke)
  doc.setLineCap(1)
  doc.setLineJoin(1)
  doc.line(x1, y1, x2, y2)
  doc.line(x2, y2, x3, y3)
  doc.setLineCap(0)
  doc.setLineJoin(0)
}

export function isPdfCheckMark(value: string) {
  return value === '✓' || value === '✔'
}

/** เครื่องหมายถูกอย่างเดียว — ฟอนต์ PDF มีแค่ไทยกับ ASCII จึงวาดเส้นแทน glyph */
export function drawJsPdfTick(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number] = [17, 24, 39],
) {
  const size = Math.min(w * 0.72, h * 0.62)
  const cx = x + w / 2
  const cy = y + h / 2 + size * 0.04
  const x1 = cx - size * 0.46
  const y1 = cy
  const x2 = cx - size * 0.1
  const y2 = cy + size * 0.34
  const x3 = cx + size * 0.5
  const y3 = cy - size * 0.4

  doc.setDrawColor(color[0], color[1], color[2])
  doc.setLineWidth(Math.max(0.28, size * 0.16))
  doc.setLineCap(1)
  doc.setLineJoin(1)
  doc.line(x1, y1, x2, y2)
  doc.line(x2, y2, x3, y3)
  doc.setLineCap(0)
  doc.setLineJoin(0)
}
