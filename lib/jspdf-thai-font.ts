'use client'

import { jsPDF } from 'jspdf'

const FONT_CACHE = new Map<string, string>()

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

/** ติดตั้งฟอนต์ไทย TH Sarabun New ให้ jsPDF */
export async function applyThaiFonts(doc: jsPDF) {
  const [regular, bold] = await Promise.all([
    loadFontBase64('/fonts/th-sarabun-new/regular.ttf'),
    loadFontBase64('/fonts/th-sarabun-new/bold.ttf'),
  ])
  doc.addFileToVFS('THSarabunNew.ttf', regular)
  doc.addFileToVFS('THSarabunNew-Bold.ttf', bold)
  doc.addFont('THSarabunNew.ttf', 'THSarabunNew', 'normal')
  doc.addFont('THSarabunNew-Bold.ttf', 'THSarabunNew', 'bold')
  doc.setFont('THSarabunNew', 'normal')
}

export async function loadImageDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
