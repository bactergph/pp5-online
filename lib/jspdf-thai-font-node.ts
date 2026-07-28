import 'server-only'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { jsPDF } from 'jspdf'

const FONT_CACHE = new Map<string, string>()

async function loadFontBase64FromDisk(relativePublicPath: string) {
  const cached = FONT_CACHE.get(relativePublicPath)
  if (cached) return cached
  const buf = await readFile(join(process.cwd(), 'public', relativePublicPath))
  const base64 = buf.toString('base64')
  FONT_CACHE.set(relativePublicPath, base64)
  return base64
}

/** ติดตั้งฟอนต์ไทยจากไฟล์ใน public/ — ใช้บนเซิร์ฟเวอร์เท่านั้น */
export async function applyThaiFontsFromDisk(doc: jsPDF) {
  const [regular, bold] = await Promise.all([
    loadFontBase64FromDisk('fonts/th-sarabun-new/regular-pdf.ttf'),
    loadFontBase64FromDisk('fonts/th-sarabun-new/bold.ttf'),
  ])
  doc.addFileToVFS('THSarabunNew.ttf', regular)
  doc.addFileToVFS('THSarabunNew-Bold.ttf', bold)
  doc.addFont('THSarabunNew.ttf', 'THSarabunNew', 'normal')
  doc.addFont('THSarabunNew-Bold.ttf', 'THSarabunNew', 'bold')
  doc.setFont('THSarabunNew', 'normal')
}
