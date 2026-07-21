'use client'

import { jsPDF } from 'jspdf'

const FONT_CACHE = new Map<string, string>()

/** ฟอนต์ย่อสำหรับ PDF (ไทย+ASCII) — เล็กกว่า regular.ttf และไม่ฝัง bold ซ้ำ */
const PDF_FONT_PATH = '/fonts/th-sarabun-new/regular-pdf.ttf'

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
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

/** ติดตั้งฟอนต์ไทยให้ jsPDF — ฝังไฟล์เดียว (normal+bold ใช้ตัวเดียวกัน) เพื่อลดขนาด PDF */
export async function applyThaiFonts(doc: jsPDF) {
  const regular = await loadFontBase64(PDF_FONT_PATH)
  doc.addFileToVFS('THSarabunNew.ttf', regular)
  doc.addFont('THSarabunNew.ttf', 'THSarabunNew', 'normal')
  // ใช้ไฟล์เดียวกันเป็น bold — ไม่ฝังซ้ำใน VFS
  doc.addFont('THSarabunNew.ttf', 'THSarabunNew', 'bold')
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
 * โหลดรูปแล้วย่อเป็น JPEG คุณภาพกลาง — ลดขนาดโลโก้/ลายเซ็นใน PDF
 * maxPx = ความกว้าง/สูงสุดของรูปหลังย่อ
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
    const blob = await res.blob()
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
