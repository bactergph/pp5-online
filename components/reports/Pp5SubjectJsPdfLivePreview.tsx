'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReportPayload, ReportSubject } from '@/app/(shell)/reports/actions'
import {
  buildPp5SubjectPdfBlob,
  type Pp5SubjectPdfSection,
} from '@/lib/jspdf-pp5-subject'
import type { Pp5PrintLayouts, Pp5PrintSection } from '@/lib/pp5-print-layout'
import './Pp5PrintLayoutTuner.css'

type Props = {
  open: boolean
  inline?: boolean
  data: ReportPayload
  subject: ReportSubject
  term: 0 | 1 | 2
  sections: Pp5SubjectPdfSection[]
  layouts: Pp5PrintLayouts
  previewSection?: Pp5SubjectPdfSection
}

export function pp5TunerSectionToPreview(section: Pp5PrintSection): Pp5SubjectPdfSection | undefined {
  if (section === 'coverSubject' || section === 'coverClass') return 'cover'
  if (
    section === 'criteria'
    || section === 'attendance'
    || section === 'scores'
    || section === 'character'
    || section === 'reading'
    || section === 'competency'
  ) {
    return section
  }
  return undefined
}

/** พรีวิว PDF จริง (jsPDF) — เปิดเป็นแผงแยกเมื่อกดปรับ layout ปพ.5 รายวิชา */
export default function Pp5SubjectJsPdfLivePreview({
  open,
  inline = false,
  data,
  subject,
  term,
  sections,
  layouts,
  previewSection,
}: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [building, setBuilding] = useState(false)
  const [previewScale, setPreviewScale] = useState(42)
  const urlRef = useRef<string | null>(null)
  const genRef = useRef(0)

  useEffect(() => {
    if (!open) return
    const gen = ++genRef.current
    const timer = window.setTimeout(() => {
      setBuilding(true)
      setError('')
      void (async () => {
        try {
          const result = await buildPp5SubjectPdfBlob({
            data,
            subject,
            term,
            sections,
            layouts,
            previewSection,
          })
          if (gen !== genRef.current) return
          const next = URL.createObjectURL(result.blob)
          if (urlRef.current) URL.revokeObjectURL(urlRef.current)
          urlRef.current = next
          setUrl(next)
        } catch (err) {
          if (gen !== genRef.current) return
          setError(err instanceof Error ? err.message : 'สร้างพรีวิว PDF ไม่สำเร็จ')
          setUrl(null)
        } finally {
          if (gen === genRef.current) setBuilding(false)
        }
      })()
    }, 220)

    return () => {
      window.clearTimeout(timer)
      genRef.current += 1
    }
  }, [open, data, subject, term, sections, layouts, previewSection])

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  if (!open) return null

  if (inline) return (
    <section aria-label="ตัวอย่าง ปพ.5 รายวิชา ขนาด A4" style={{ width: '100%', minWidth: 0 }}>
      {(building || error) && <div role="status" style={{ padding: '12px 16px', color: '#111827' }}>
        {building ? 'กำลังสร้างตัวอย่าง…' : error}
      </div>}
      {!building && !error && url && <iframe title="ตัวอย่าง ปพ.5 รายวิชา A4" src={url + '#view=FitH'} style={{ display: 'block', width: '100%', height: 'min(85vh, 1120px)', minHeight: 520, border: '1px solid #cbd5e1', borderRadius: 8, background: '#e5e7eb' }} />}
    </section>
  )


  return (
    <div className="ca-layout-live-preview pp6-jspdf-overlay" aria-label="พรีวิว PDF ปพ.5 รายวิชา">
      <div className="ca-layout-live-preview__toolbar">
        <div>
          <strong>พรีวิว PDF ปพ.5 รายวิชา (jsPDF)</strong>
          <span>เลื่อนค่าในแผงขวาแล้วดูผลทันที · A4 แนวตั้ง</span>
        </div>
        <label className="ca-layout-live-preview__scale-label">
          ขนาด
          <select
            value={previewScale}
            onChange={e => setPreviewScale(Number(e.target.value))}
          >
            {[28, 34, 42, 50, 60, 75, 88, 100].map(value => (
              <option key={value} value={value}>{value}%</option>
            ))}
          </select>
        </label>
        {building && <span className="pp6-jspdf-live__status">กำลังเรนเดอร์…</span>}
        {error && <span className="pp6-jspdf-live__error">{error}</span>}
      </div>
      <div className="ca-layout-live-preview__stage">
        <div
          className="ca-layout-live-preview__zoom"
          style={{ transform: `scale(${previewScale / 100})` }}
        >
          {url ? (
            <iframe
              title="พรีวิว ปพ.5 รายวิชา PDF"
              src={url}
              className="pp6-jspdf-overlay__frame"
            />
          ) : (
            <div className="ca-layout-live-preview__empty">
              {building ? 'กำลังสร้างพรีวิว…' : (error || 'ยังไม่มีพรีวิว')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
