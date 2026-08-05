'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReportPayload } from '@/app/(shell)/reports/actions'
import {
  buildPp5ClassPdfBlob,
  type Pp5ClassPdfSection,
} from '@/lib/jspdf-pp5-class'
import type { Pp5PrintLayouts, Pp5PrintSection } from '@/lib/pp5-print-layout'
import './Pp5PrintLayoutTuner.css'

type Props = {
  open: boolean
  data: ReportPayload
  term: 0 | 1 | 2
  sections: Pp5ClassPdfSection[]
  layouts: Pp5PrintLayouts
  previewSection?: Pp5ClassPdfSection
}

export function pp5ClassTunerSectionToPreview(section: Pp5PrintSection): Pp5ClassPdfSection | undefined {
  if (section === 'coverClass' || section === 'coverSubject') return 'cover'
  if (
    section === 'criteria'
    || section === 'attendance'
    || section === 'scores'
    || section === 'achievement'
    || section === 'character'
    || section === 'reading'
    || section === 'competency'
    || section === 'activities'
  ) {
    return section
  }
  return undefined
}

/** พรีวิว PDF จริง (jsPDF) — ปพ.5 รวมชั้นเรียน */
export default function Pp5ClassJsPdfLivePreview({
  open,
  data,
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
    setBuilding(true)
    setError('')
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await buildPp5ClassPdfBlob({
            data,
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

    return () => window.clearTimeout(timer)
  }, [open, data, term, sections, layouts, previewSection])

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  if (!open) return null

  return (
    <div className="ca-layout-live-preview pp6-jspdf-overlay" aria-label="พรีวิว PDF ปพ.5 รวมชั้นเรียน">
      <div className="ca-layout-live-preview__toolbar">
        <div>
          <strong>พรีวิว PDF ปพ.5 รวมชั้นเรียน (jsPDF)</strong>
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
              title="พรีวิว ปพ.5 รวมชั้นเรียน PDF"
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
