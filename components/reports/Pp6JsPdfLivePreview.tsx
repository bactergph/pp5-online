'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReportPayload } from '@/app/(shell)/reports/actions'
import { buildPp6PdfBlob } from '@/lib/jspdf-pp6'
import type { Pp6SectionLayout } from '@/lib/pp6-print-layout'
import './Pp5PrintLayoutTuner.css'

type Props = {
  open: boolean
  data: ReportPayload
  term: 0 | 1 | 2
  individual: boolean
  selectedStudentId: string
  ranked: boolean
  showGrade: boolean
  layout: Pp6SectionLayout
}

/** พรีวิว PDF จริง (jsPDF) — เปิดเป็นแผงแยกเมื่อกดปรับ layout */
export default function Pp6JsPdfLivePreview({
  open,
  data,
  term,
  individual,
  selectedStudentId,
  ranked,
  showGrade,
  layout,
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
          const result = await buildPp6PdfBlob({
            data,
            term,
            individual,
            selectedStudentId,
            ranked,
            showGrade,
            layout,
          })
          if (gen !== genRef.current) return
          const blob = result instanceof Blob ? result : result.blob
          const next = URL.createObjectURL(blob)
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
  }, [open, data, term, individual, selectedStudentId, ranked, showGrade, layout])

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  if (!open) return null

  return (
    <div className="ca-layout-live-preview pp6-jspdf-overlay" aria-label="พรีวิว PDF ปพ.6">
      <div className="ca-layout-live-preview__toolbar">
        <div>
          <strong>พรีวิว PDF (jsPDF)</strong>
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
              title="พรีวิว ปพ.6 PDF"
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
