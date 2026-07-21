'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReportPayload } from '@/app/(shell)/reports/actions'
import { buildPp6PdfBlob } from '@/lib/jspdf-pp6'
import type { Pp6SectionLayout } from '@/lib/pp6-print-layout'

type Props = {
  data: ReportPayload
  term: 0 | 1 | 2
  individual: boolean
  selectedStudentId: string
  ranked: boolean
  showGrade: boolean
  layout: Pp6SectionLayout
  scale?: number
}

/** พรีวิว PDF จริงจาก jsPDF — อัปเดตเมื่อ layout/ข้อมูลเปลี่ยน (debounce) */
export default function Pp6JsPdfLivePreview({
  data,
  term,
  individual,
  selectedStudentId,
  ranked,
  showGrade,
  layout,
  scale = 88,
}: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [building, setBuilding] = useState(false)
  const urlRef = useRef<string | null>(null)
  const genRef = useRef(0)

  useEffect(() => {
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
    }, 280)

    return () => window.clearTimeout(timer)
  }, [data, term, individual, selectedStudentId, ranked, showGrade, layout])

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  return (
    <div className="pp6-jspdf-live">
      <div className="pp6-jspdf-live__bar">
        <span className="pp6-jspdf-live__badge">พรีวิว PDF (jsPDF) · A4</span>
        {building && <span className="pp6-jspdf-live__status">กำลังเรนเดอร์…</span>}
        {error && <span className="pp6-jspdf-live__error">{error}</span>}
      </div>
      <div
        className="pp6-jspdf-live__frame-wrap"
        style={{ transform: `scale(${scale / 100})`, transformOrigin: 'top center' }}
      >
        {url ? (
          <iframe
            title="พรีวิว ปพ.6 PDF"
            src={url}
            className="pp6-jspdf-live__frame"
          />
        ) : (
          <div className="pp6-jspdf-live__empty">
            {building ? 'กำลังสร้างพรีวิว…' : (error || 'ยังไม่มีพรีวิว')}
          </div>
        )}
      </div>
    </div>
  )
}
