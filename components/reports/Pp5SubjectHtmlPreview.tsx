'use client'
import { useEffect, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import type { ReportPayload, ReportSubject } from '@/app/(shell)/reports/actions'
import { buildPp5SubjectPdfBlob, type Pp5SubjectPdfSection } from '@/lib/jspdf-pp5-subject'
import type { Pp5PrintLayouts } from '@/lib/pp5-print-layout'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import { createPp5HtmlDrawing } from '@/lib/pp5-html-drawing'

type Props = { data: ReportPayload; subject: ReportSubject; term: 0 | 1 | 2; sections: Pp5SubjectPdfSection[]; layouts: Pp5PrintLayouts; scale: number }
export default function Pp5SubjectHtmlPreview({ data, subject, term, sections, layouts, scale }: Props) {
  const [pages, setPages] = useState<string[]>([])
  const [error, setError] = useState('')
  const images = useRef(new Map<string, Promise<string | null>>())
  const measure = useRef<Promise<jsPDF> | null>(null)
  useEffect(() => {
    let active = true
    if (!measure.current) measure.current = (async () => { const doc = new jsPDF({ unit: 'mm', format: 'a4' }); await applyThaiFonts(doc); return doc })()
    void measure.current.then(async doc => {
      if (!active) return
      const drawing = createPp5HtmlDrawing(doc)
      await buildPp5SubjectPdfBlob({ data, subject, term, sections, layouts }, { doc: drawing.doc, skipApplyFonts: true, loadImage: (url, size, quality) => {
        if (!url) return Promise.resolve(null)
        const key = JSON.stringify([url, size, quality])
        if (!images.current.has(key)) images.current.set(key, loadImageDataUrl(url, size, quality))
        return images.current.get(key)!
      } })
      if (active) { setPages(drawing.pages()); setError('') }
    }).catch(err => { if (active) { measure.current = null; setError(err instanceof Error ? err.message : 'โหลดตัวอย่างไม่สำเร็จ') } })
    return () => { active = false }
  }, [data, subject, term, sections, layouts])
  return <div style={{ overflow: 'auto', background: '#e5e7eb', padding: 16 }} aria-label="ตัวอย่าง HTML ปพ.5 รายวิชา">
    {error && <div role="alert">{error}</div>}
    {!pages.length && !error && <div role="status">กำลังโหลดตัวอย่าง…</div>}
    {pages.map((page, index) => <div key={index} style={{ width: `${210 * scale / 100}mm`, height: `${297 * scale / 100}mm`, margin: '0 auto 16px' }}><div style={{ transform: `scale(${scale / 100})`, transformOrigin: 'top left' }} dangerouslySetInnerHTML={{ __html: page }} /></div>)}
  </div>
}
