'use client'

import { useCallback, useEffect, useState } from 'react'
import ApprovalQueueWithPreview from '@/components/sign/ApprovalQueueWithPreview'
import type { ApprovalQueueItem } from '@/components/sign/ApprovalQueue'
import {
  fetchClassDocQueue,
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

function mapClassDoc(row: ClassDocRow): ApprovalQueueItem & { classroom_id: string; doc_type: ClassDocType; term_value: number; month_value: number | null } {
  return {
    key: `${row.doc_type}:${row.classroom_id}:${row.term}:${row.month ?? 0}`,
    title: `${CLASS_DOC_TYPE_LABELS[row.doc_type]} ${row.classroom_label}`,
    subtitle: CLASS_DOC_TYPE_LABELS[row.doc_type],
    term: row.term,
    status: row.status,
    status_label: row.status_label,
    next_step: row.next_step,
    canSign: row.canSign,
    canPutSignature: row.canPutSignature,
    canPropose: row.canPropose,
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
    },
  }
}

export default function SignPp5Client() {
  const [tab, setTab] = useState<'subject' | 'class'>('subject')
  const [subjectItems, setSubjectItems] = useState<ReturnType<typeof mapPp5Subject>[]>([])
  const [classItems, setClassItems] = useState<ReturnType<typeof mapClassDoc>[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const [subject, classRows] = await Promise.all([
      fetchPp5SubjectQueue(),
      fetchClassDocQueue(['pp5_class']),
    ])
    setSubjectItems(subject.map(mapPp5Subject))
    setClassItems(classRows.map(mapClassDoc))
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">ลงนามอนุมัติ</span>
          <h1 className="page-title">ปพ.5</h1>
          <p className="page-subtitle">ครูส่งขอลงนาม → ผู้บริหารลงนามตามลำดับ → ผอ.อนุมัติแล้วล็อกคะแนน (รายวิชา)</p>
        </div>
      </div>

      <div className="card-padded sign-page-card">
        <div className="score-entry-tabs" style={{ marginBottom: 16 }}>
          <button type="button" className={`score-entry-tab${tab === 'subject' ? ' is-active' : ''}`} onClick={() => setTab('subject')}>
            ปพ.5 รายวิชา
          </button>
          <button type="button" className={`score-entry-tab${tab === 'class' ? ' is-active' : ''}`} onClick={() => setTab('class')}>
            ปพ.5 รายห้อง
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
        ) : tab === 'subject' ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 14px' }}>
              ลำดับ: ครูผู้สอน → หัวหน้ากลุ่มสาระ → หัวหน้างานวัดผล → หัวหน้าวิชาการ → รองผอ. (ถ้ามี) → ผอ./รักษาการ
            </p>
            <ApprovalQueueWithPreview
              items={subjectItems}
              emptyText="ไม่มีเอกสารในคิว — ครูผู้สอนส่งจากหน้าบันทึกคะแนน"
              onPutSignature={async item => {
                const row = item as ReturnType<typeof mapPp5Subject>
                const r = await putPp5SubjectSignature(row.class_subject_id, row.term_value)
                if (!r.error) await reload()
                return r
              }}
              onPropose={async item => {
                const row = item as ReturnType<typeof mapPp5Subject>
                const r = await proposePp5Subject(row.class_subject_id, row.term_value)
                if (!r.error) await reload()
                return r
              }}
              onSign={async (item, decision, note) => {
                const row = item as ReturnType<typeof mapPp5Subject>
                const r = await signPp5Subject(row.class_subject_id, row.term_value, decision, note)
                if (!r.error) await reload()
                return r
              }}
            />
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 14px' }}>
              ลำดับ: ครูประจำชั้น → หัวหน้าวิชาการ → รองผอ. (ถ้ามี) → ผอ./รักษาการ
            </p>
            <ApprovalQueueWithPreview
              items={classItems}
              emptyText="ไม่มีเอกสารในคิว — ครูประจำชั้นส่งขอลงนามจากแท็บนี้"
              onPutSignature={async item => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await putClassDocumentSignature(row.doc_type, row.classroom_id, row.term_value, row.month_value)
                if (!r.error) await reload()
                return r
              }}
              onPropose={async item => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await proposeClassDocument(row.doc_type, row.classroom_id, row.term_value, row.month_value)
                if (!r.error) await reload()
                return r
              }}
              onSign={async (item, decision, note) => {
                const row = item as ReturnType<typeof mapClassDoc>
                const r = await signClassDocument(row.doc_type, row.classroom_id, row.term_value, decision, note, row.month_value)
                if (!r.error) await reload()
                return r
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
