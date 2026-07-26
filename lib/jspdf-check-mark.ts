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
