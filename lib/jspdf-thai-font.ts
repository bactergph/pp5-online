import { jsPDF } from 'jspdf'

const FONT_CACHE = new Map<string, string>()

/** ฟอนต์ย่อสำหรับ PDF (ไทย+ASCII) */
const PDF_FONT_REGULAR = '/fonts/th-sarabun-new/regular-pdf.ttf'
const PDF_FONT_BOLD = '/fonts/th-sarabun-new/bold.ttf'

function arrayBufferToBase64(buffer: ArrayBuffer | Buffer) {
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(buffer)) {
    return buffer.toString('base64')
  }
  let binary = ''
  const bytes = new Uint8Array(buffer as ArrayBuffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  if (typeof btoa === 'function') return btoa(binary)
  return Buffer.from(binary, 'binary').toString('base64')
}

async function loadFontBase64(path: string) {
  const cached = FONT_CACHE.get(path)
  if (cached) return cached
  const res = await fetch(path)
  if (!res.ok) throw new Error('โหลดฟอนต์ไม่สำเร็จ')
  const base64 = arrayBufferToBase64(await res.arrayBuffer())
  FONT_CACHE.set(path, base64)
  return base64
}

/** ติดตั้งฟอนต์ไทยให้ jsPDF — ฝั่งเบราว์เซอร์ (fetch จาก /public) */
export async function applyThaiFonts(doc: jsPDF) {
  const [regular, bold] = await Promise.all([
    loadFontBase64(PDF_FONT_REGULAR),
    loadFontBase64(PDF_FONT_BOLD),
  ])
  doc.addFileToVFS('THSarabunNew.ttf', regular)
  doc.addFileToVFS('THSarabunNew-Bold.ttf', bold)
  doc.addFont('THSarabunNew.ttf', 'THSarabunNew', 'normal')
  doc.addFont('THSarabunNew-Bold.ttf', 'THSarabunNew', 'bold')
  doc.setFont('THSarabunNew', 'normal')
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'))
    img.src = url
  })
}

/**
 * โหลดรูปแล้วย่อเป็น JPEG — ฝั่งเบราว์เซอร์
 * ฝั่งเซิร์ฟเวอร์: ฝัง base64 ตรงๆ (ไม่มี canvas)
 */
export async function loadImageDataUrl(
  url: string | null | undefined,
  maxPx = 240,
  quality = 0.72,
): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const mime = res.headers.get('content-type') || 'image/png'

    if (typeof document === 'undefined') {
      return `data:${mime};base64,${arrayBufferToBase64(buffer)}`
    }

    const blob = new Blob([buffer], { type: mime })
    const objectUrl = URL.createObjectURL(blob)
    try {
      const img = await loadImageElement(objectUrl)
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
      const w = Math.max(1, Math.round((img.naturalWidth || maxPx) * scale))
      const h = Math.max(1, Math.round((img.naturalHeight || maxPx) * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      return canvas.toDataURL('image/jpeg', quality)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

export function jsPdfToBuffer(doc: jsPDF): Buffer {
  return Buffer.from(doc.output('arraybuffer'))
}

export async function blobToBuffer(blob: Blob): Promise<Buffer> {
  return Buffer.from(await blob.arrayBuffer())
}
