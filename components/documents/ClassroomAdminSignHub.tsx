'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ApprovalQueueWithPreview from '@/components/sign/ApprovalQueueWithPreview'
import type { ApprovalQueueItem } from '@/components/sign/ApprovalQueue'
import ApprovedDocumentsClient from '@/components/approved-documents/ApprovedDocumentsClient'
import {
  cancelClassDocumentProposal,
  fetchClassDocQueue,
  proposeClassDocument,
  putClassDocumentSignature,
  signClassDocument,
} from '@/app/sign/actions'
import type { ClassDocType } from '@/lib/approvals/types'
import { classDocTypeToPreviewKind } from '@/lib/sign-document-preview'
import { getThaiMonthShort } from '@/lib/thaiDate'

type SectionTab = 'pending' | 'approved'
type ClassDocRow = Awaited<ReturnType<typeof fetchClassDocQueue>>[number]

function mapClassDoc(row: ClassDocRow): ApprovalQueueItem & {
  classroom_id: string
  doc_type: ClassDocType
  term_value: number
  month_value: number | null
} {
  const monthShort = row.month ? getThaiMonthShort(row.month) : ''
  return {
    key: `${row.doc_type}:${row.classroom_id}:${row.term}:${row.month ?? 0}`,
    title: monthShort
      ? `ชุดธุรการ ${row.classroom_label.replace(/ · ชุดเดือน .+$/, '')} · เดือน ${monthShort}`
      : `ชุดธุรการ ${row.classroom_label}`,
    subtitle: monthShort
      ? `ทั้งชุดเดือน ${monthShort} (เวลาเรียน · แปรงฟัน · ดื่มนม · อาหารกลางวัน · ทำความสะอาด · ออมเงิน · สุขภาพ)`
      : 'ธุรการชั้นเรียนทั้งชุดรายเดือน',
    term: row.term,
    status: row.status,
    status_label: row.status_label,
    next_step: row.next_step,
    workflow_steps: row.workflow_steps,
    canSign: row.canSign,
    canPutSignature: row.canPutSignature,
    canPropose: row.canPropose,
    canCancelProposal: row.canCancelProposal,
    classroom_id: row.classroom_id,
    doc_type: row.doc_type,
    term_value: row.term,
    month_value: row.month ?? null,
    preview: {
      kind: classDocTypeToPreviewKind(row.doc_type),
      academicYearId: row.academic_year_id,
      classroomId: row.classroom_id,
      level: row.level,
      signTerm: row.term,
      month: row.month ?? null,
    },
  }
}

function submittedOnly<T extends { status: string }>(items: T[]) {
  return items.filter(item => item.status === 'in_review' || item.status === 'rejected')
}

function parseSectionTab(value: string | null): SectionTab {
  return value === 'approved' ? 'approved' : 'pending'
}

export default function ClassroomAdminSignHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sectionTab, setSectionTab] = useState<SectionTab>(() => parseSectionTab(searchParams.get('section')))
  const [items, setItems] = useState<ReturnType<typeof mapClassDoc>[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const submitted = useMemo(() => submittedOnly(items), [items])

  const syncUrl = useCallback((section: SectionTab) => {
    const params = new URLSearchParams()
    if (section !== 'pending') params.set('section', section)
    const query = params.toString()
    const path = typeof window !== 'undefined' ? window.location.pathname : '/classroom-admin/sign'
    router.replace(query ? `${path}?${query}` : path, { scroll: false })
  }, [router])

  useEffect(() => {
    setSectionTab(parseSectionTab(searchParams.get('section')))
  }, [searchParams])

  const reloadPending = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await fetchClassDocQueue(['classroom_admin'])
      setItems(rows.map(mapClassDoc))
    } catch (err) {
      console.error(err)
      setItems([])
      setLoadError('โหลดคิวเอกสารไม่สำเร็จ — ลองรีเฟรชหน้า')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sectionTab === 'pending') void reloadPending()
  }, [sectionTab, reloadPending])

  useEffect(() => {
    function onPreviewUpdated(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'pp5-document-preview-updated') return
      if (sectionTab === 'pending') void reloadPending()
    }
    window.addEventListener('message', onPreviewUpdated)
    return () => window.removeEventListener('message', onPreviewUpdated)
  }, [reloadPending, sectionTab])

  const selectSectionTab = (section: SectionTab) => {
    setSectionTab(section)
    syncUrl(section)
  }

  return (
    <div className="page-stack documents-sign-hub">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">ธุรการเสนอเซ็น</span>
          <h1 className="page-title">ธุรการเสนอเซ็น</h1>
          <p className="page-subtitle">
            {sectionTab === 'pending'
              ? 'เอกสารธุรการชั้นเรียนที่เสนอเซ็นแล้ว'
              : 'เอกสารธุรการชั้นเรียนที่อนุมัติแล้ว'}
          </p>
        </div>
      </div>

      <div className="card-padded sign-page-card">
        <div className="documents-sign-section-tabs">
          <button
            type="button"
            className={`documents-sign-section-tab${sectionTab === 'pending' ? ' is-active' : ''}`}
            onClick={() => selectSectionTab('pending')}
          >
            เสนอเซ็นแล้ว
            {sectionTab === 'pending' && submitted.length > 0 && (
              <span className="documents-sign-tab-count">{submitted.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`documents-sign-section-tab${sectionTab === 'approved' ? ' is-active' : ''}`}
            onClick={() => selectSectionTab('approved')}
          >
            อนุมัติแล้ว
          </button>
        </div>

        {sectionTab === 'approved' ? (
          <ApprovedDocumentsClient
            embedded
            docKinds={['classroom_admin']}
            pageSubtitle="เอกสารธุรการชั้นเรียนที่อนุมัติแล้ว"
          />
        ) : loading ? (
          <p style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
        ) : loadError ? (
          <div className="empty-state" style={{ padding: '32px 16px' }}>
            <div style={{ color: 'var(--danger, #b91c1c)', fontSize: 14 }}>{loadError}</div>
          </div>
        ) : (
          <>
            <p className="documents-sign-flow-hint">
              ลำดับ: ครูประจำชั้น → ผอ./รักษาการ — แต่ละรายการคือชุดเอกสารทั้งชุดของเดือนนั้น
              (ส่งจากหน้าบันทึกธุรการ เช่น เวลาเรียน/แปรงฟัน)
            </p>
            <ApprovalQueueWithPreview
              items={submitted}
              emptyText="ยังไม่มีเอกสารที่เสนอเซ็น — ส่งจากหน้าบันทึกธุรการชั้นเรียน"
              onPutSignature={async item => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await putClassDocumentSignature(row.doc_type, row.classroom_id, row.term_value, row.month_value)
                if (!r.error) await reloadPending()
                return r
              }}
              onPropose={async item => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await proposeClassDocument(row.doc_type, row.classroom_id, row.term_value, row.month_value)
                if (!r.error) await reloadPending()
                return r
              }}
              onCancelProposal={async item => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await cancelClassDocumentProposal(row.doc_type, row.classroom_id, row.term_value, row.month_value)
                if (!r.error) await reloadPending()
                return r
              }}
              onSign={async (item, decision, note) => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await signClassDocument(row.doc_type, row.classroom_id, row.term_value, decision, note, row.month_value)
                if (!r.error) await reloadPending()
                return r
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
