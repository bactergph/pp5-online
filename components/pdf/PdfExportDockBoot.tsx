'use client'

import { useEffect } from 'react'
import { startPdfExportDockDom } from '@/lib/pdf/pdf-export-dock-dom'
import { isPdfExportDockVisible } from '@/lib/pdf/pdf-export-queue'

/**
 * แค่บูตตัวเรนเดอร์ DOM นอก React —
 * UI จริงไม่อยู่ใน React tree จึงไม่หายตอน Next remount layout
 */
export default function PdfExportDockBoot() {
  useEffect(() => {
    startPdfExportDockDom()
    if (isPdfExportDockVisible()) {
      // เผื่อมีคิวค้างตอน hydrate
      startPdfExportDockDom()
    }
  }, [])
  return null
}
