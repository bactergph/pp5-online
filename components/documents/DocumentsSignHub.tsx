'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ApprovalQueueWithPreview from '@/components/sign/ApprovalQueueWithPreview'
import type { ApprovalQueueItem } from '@/components/sign/ApprovalQueue'
import ApprovedDocumentsClient from '@/components/approved-documents/ApprovedDocumentsClient'
import {
  cancelClassDocumentProposal,
  cancelPp5SubjectProposal,
  fetchClassDocQueue,
  fetchDocumentsSignPageContext,
  fetchPp5SubjectQueue,
  proposeClassDocument,
  proposePp5Subject,
  putClassDocumentSignature,
  putPp5SubjectSignature,
  signClassDocument,
  signPp5Subject,
} from '@/app/sign/actions'
import type { ClassDocType } from '@/lib/approvals/types'
import { CLASS_DOC_TYPE_LABELS } from '@/lib/approvals/types'
import { classDocTypeToPreviewKind } from '@/lib/sign-document-preview'

type MainTab = 'subject' | 'class_pp6'
type SectionTab = 'pending' | 'approved'

type ClassDocRow = Awaited<ReturnType<typeof fetchClassDocQueue>>[number]
type Pp5Row = Awaited<ReturnType<typeof fetchPp5SubjectQueue>>[number]

function mapPp5Subject(row: Pp5Row): ApprovalQueueItem & { class_subject_id: string; term_value: number } {
  return {
    key: `pp5-subject:${row.class_subject_id}:${row.term}`,
    title: `${row.subject_code} ${row.subject_name}`,
    subtitle: `ห้อง ${row.classroom_label} · ${row.subject_group}`,
    term: row.term,
    status: row.status,
    status_label: row.status_label,
    next_step: row.next_step,
    canSign: row.canSign,
    canPutSignature: row.canPutSignature,
    canPropose: row.canPropose,
    canCancelProposal: row.canCancelProposal,
    class_subject_id: row.class_subject_id,
    term_value: row.term,
    preview: {
      kind: 'pp5-subject',
      academicYearId: row.academic_year_id,
      classroomId: row.classroom_id,
      level: row.level,
      signTerm: row.term,
      classSubjectId: row.class_subject_id,
    },
  }
}

function mapClassDoc(row: ClassDocRow): ApprovalQueueItem & { classroom_id: string; doc_type: ClassDocType; term_value: number } {
  return {
    key: `${row.doc_type}:${row.classroom_id}:${row.term}`,
    title: `${CLASS_DOC_TYPE_LABELS[row.doc_type]} ${row.classroom_label}`,
    subtitle: CLASS_DOC_TYPE_LABELS[row.doc_type],
    term: row.term,
    status: row.status,
    status_label: row.status_label,
    next_step: row.next_step,
    canSign: row.canSign,
    canPutSignature: row.canPutSignature,
    canPropose: row.canPropose,
    canCancelProposal: row.canCancelProposal,
    classroom_id: row.classroom_id,
    doc_type: row.doc_type,
    term_value: row.term,
    preview: {
      kind: classDocTypeToPreviewKind(row.doc_type),
      academicYearId: row.academic_year_id,
      classroomId: row.classroom_id,
      level: row.level,
      signTerm: row.term,
    },
  }
}

function parseMainTab(value: string | null): MainTab {
  return value === 'class_pp6' ? 'class_pp6' : 'subject'
}

function parseSectionTab(value: string | null): SectionTab {
  return value === 'approved' ? 'approved' : 'pending'
}

export default function DocumentsSignHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mainTab, setMainTab] = useState<MainTab>(() => parseMainTab(searchParams.get('tab')))
  const [sectionTab, setSectionTab] = useState<SectionTab>(() => parseSectionTab(searchParams.get('section')))
  const [subjectItems, setSubjectItems] = useState<ReturnType<typeof mapPp5Subject>[]>([])
  const [pp5ClassItems, setPp5ClassItems] = useState<ReturnType<typeof mapClassDoc>[]>([])
  const [pp6Items, setPp6Items] = useState<ReturnType<typeof mapClassDoc>[]>([])
  const [loading, setLoading] = useState(true)
  const [trackingView, setTrackingView] = useState(false)

  const classItems = useMemo(
    () => [...pp5ClassItems, ...pp6Items],
    [pp5ClassItems, pp6Items],
  )

  const syncUrl = useCallback((tab: MainTab, section: SectionTab) => {
    const params = new URLSearchParams()
    if (tab !== 'subject') params.set('tab', tab)
    if (section !== 'pending') params.set('section', section)
    const query = params.toString()
    router.replace(query ? `/documents/sign?${query}` : '/documents/sign', { scroll: false })
  }, [router])

  useEffect(() => {
    setMainTab(parseMainTab(searchParams.get('tab')))
    setSectionTab(parseSectionTab(searchParams.get('section')))
  }, [searchParams])

  useEffect(() => {
    void fetchDocumentsSignPageContext().then(ctx => setTrackingView(ctx.trackingView))
  }, [])

  const reloadPending = useCallback(async () => {
    setLoading(true)
    const [subject, classRows, pp6Rows] = await Promise.all([
      fetchPp5SubjectQueue(),
      fetchClassDocQueue(['pp5_class']),
      fetchClassDocQueue(['pp6']),
    ])
    setSubjectItems(subject.map(mapPp5Subject))
    setPp5ClassItems(classRows.map(mapClassDoc))
    setPp6Items(pp6Rows.map(mapClassDoc))
    setLoading(false)
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

  const heroSubtitle = useMemo(() => {
    if (trackingView) {
      if (mainTab === 'subject') {
        return sectionTab === 'pending'
          ? 'ปพ.5 รายวิชา — เอกสารที่เสนอเซ็นแล้ว'
          : 'ปพ.5 รายวิชา — เอกสารที่อนุมัติแล้ว'
      }
      return sectionTab === 'pending'
        ? 'ปพ.5 รวมชั้น / ปพ.6 — เอกสารที่เสนอเซ็นแล้ว'
        : 'ปพ.5 รวมชั้น / ปพ.6 — เอกสารที่อนุมัติแล้ว'
    }
    if (mainTab === 'subject') {
      return sectionTab === 'pending'
        ? 'ปพ.5 รายวิชา — เอกสารที่รอลงนาม / อนุมัติ'
        : 'ปพ.5 รายวิชา — เอกสารที่อนุมัติแล้ว'
    }
    return sectionTab === 'pending'
      ? 'ปพ.5 รวมชั้นเรียน และ ปพ.6 — เอกสารที่รอลงนาม / อนุมัติ'
      : 'ปพ.5 รวมชั้นเรียน และ ปพ.6 — เอกสารที่อนุมัติแล้ว'
  }, [mainTab, sectionTab, trackingView])

  const selectMainTab = (tab: MainTab) => {
    setMainTab(tab)
    syncUrl(tab, sectionTab)
  }

  const selectSectionTab = (section: SectionTab) => {
    setSectionTab(section)
    syncUrl(mainTab, section)
  }

  return (
    <div className="page-stack documents-sign-hub">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">เอกสารเสนอเซ็น</span>
          <h1 className="page-title">เอกสารเสนอเซ็น</h1>
          <p className="page-subtitle">{heroSubtitle}</p>
        </div>
      </div>

      <div className="card-padded sign-page-card">
        <div className="score-entry-tabs documents-sign-main-tabs">
          <button
            type="button"
            className={`score-entry-tab${mainTab === 'subject' ? ' is-active' : ''}`}
            onClick={() => selectMainTab('subject')}
          >
            ปพ.5 รายวิชา
          </button>
          <button
            type="button"
            className={`score-entry-tab${mainTab === 'class_pp6' ? ' is-active' : ''}`}
            onClick={() => selectMainTab('class_pp6')}
          >
            ปพ.5 รวมชั้น / ปพ.6
          </button>
        </div>

        <div className="documents-sign-section-tabs">
          <button
            type="button"
            className={`documents-sign-section-tab${sectionTab === 'pending' ? ' is-active' : ''}`}
            onClick={() => selectSectionTab('pending')}
          >
            รออนุมัติ
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
            docKinds={['pp5_subject', 'pp5_class', 'pp6']}
            pageSubtitle="เอกสารที่อนุมัติแล้วทั้งหมด (ปพ.5 รายวิชา · ปพ.5 รวมชั้น · ปพ.6)"
          />
        ) : loading ? (
          <p style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
        ) : mainTab === 'subject' ? (
          <>
            {!trackingView && (
              <p className="documents-sign-flow-hint">
                ลำดับ: ครูผู้สอน → หัวหน้ากลุ่มสาระ → หัวหน้างานวัดผล → หัวหน้าวิชาการ → รองผอ. (ถ้ามี) → ผอ./รักษาการ
              </p>
            )}
            <ApprovalQueueWithPreview
              items={subjectItems}
              emptyText={
                trackingView
                  ? 'ยังไม่มีเอกสารที่เสนอเซ็น — ส่งจากหน้าบันทึกคะแนน'
                  : 'ไม่มีเอกสารในคิว — ครูผู้สอนส่งจากหน้าบันทึกคะแนน'
              }
              onPutSignature={async item => {
                const row = item as ReturnType<typeof mapPp5Subject>
                const r = await putPp5SubjectSignature(row.class_subject_id, row.term_value)
                if (!r.error) await reloadPending()
                return r
              }}
              onPropose={async item => {
                const row = item as ReturnType<typeof mapPp5Subject>
                const r = await proposePp5Subject(row.class_subject_id, row.term_value)
                if (!r.error) await reloadPending()
                return r
              }}
              onCancelProposal={async item => {
                const row = item as ReturnType<typeof mapPp5Subject>
                const r = await cancelPp5SubjectProposal(row.class_subject_id, row.term_value)
                if (!r.error) await reloadPending()
                return r
              }}
              onSign={async (item, decision, note) => {
                const row = item as ReturnType<typeof mapPp5Subject>
                const r = await signPp5Subject(row.class_subject_id, row.term_value, decision, note)
                if (!r.error) await reloadPending()
                return r
              }}
            />
          </>
        ) : (
          <>
            {!trackingView && (
              <p className="documents-sign-flow-hint">
                ลำดับ: ครูประจำชั้น → หัวหน้าวิชาการ → รองผอ. (ถ้ามี) → ผอ./รักษาการ
              </p>
            )}
            <ApprovalQueueWithPreview
              items={classItems}
              emptyText={
                trackingView
                  ? 'ยังไม่มีเอกสารที่เสนอเซ็น — ส่งจากหน้ารายงาน'
                  : 'ไม่มีเอกสาร ปพ.5 รวมชั้น / ปพ.6 ในคิว'
              }
              onPutSignature={async item => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await putClassDocumentSignature(row.doc_type, row.classroom_id, row.term_value)
                if (!r.error) await reloadPending()
                return r
              }}
              onPropose={async item => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await proposeClassDocument(row.doc_type, row.classroom_id, row.term_value)
                if (!r.error) await reloadPending()
                return r
              }}
              onCancelProposal={async item => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await cancelClassDocumentProposal(row.doc_type, row.classroom_id, row.term_value)
                if (!r.error) await reloadPending()
                return r
              }}
              onSign={async (item, decision, note) => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await signClassDocument(row.doc_type, row.classroom_id, row.term_value, decision, note)
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
