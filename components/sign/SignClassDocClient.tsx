'use client'

import { useCallback, useEffect, useState } from 'react'
import ApprovalQueueWithPreview from '@/components/sign/ApprovalQueueWithPreview'
import type { ApprovalQueueItem } from '@/components/sign/ApprovalQueue'
import {
  cancelClassDocumentProposal,
  fetchClassDocQueue,
  proposeClassDocument,
  putClassDocumentSignature,
  signClassDocument,
} from '@/app/sign/actions'
import type { ClassDocType } from '@/lib/approvals/types'
import { CLASS_DOC_TYPE_LABELS } from '@/lib/approvals/types'
import { classDocTypeToPreviewKind } from '@/lib/sign-document-preview'
import { getThaiMonthShort } from '@/lib/thaiDate'

type ClassDocRow = Awaited<ReturnType<typeof fetchClassDocQueue>>[number]

function mapClassDoc(row: ClassDocRow): ApprovalQueueItem & { classroom_id: string; doc_type: ClassDocType; term_value: number; month_value: number | null } {
  const isClassroomAdmin = row.doc_type === 'classroom_admin'
  const monthShort = row.month ? getThaiMonthShort(row.month) : ''
  return {
    key: `${row.doc_type}:${row.classroom_id}:${row.term}:${row.month ?? 0}`,
    title: isClassroomAdmin && monthShort
      ? `ชุดธุรการ ${row.classroom_label.replace(/ · ชุดเดือน .+$/, '')} · เดือน ${monthShort}`
      : `${CLASS_DOC_TYPE_LABELS[row.doc_type]} ${row.classroom_label}`,
    subtitle: isClassroomAdmin && monthShort
      ? `ทั้งชุดเดือน ${monthShort}`
      : CLASS_DOC_TYPE_LABELS[row.doc_type],
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
      month: isClassroomAdmin ? (row.month ?? null) : null,
    },
  }
}

export default function SignClassDocClient({ docType, title, subtitle, flowHint }: {
  docType: ClassDocType
  title: string
  subtitle: string
  flowHint: string
}) {
  const [items, setItems] = useState<ReturnType<typeof mapClassDoc>[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const rows = await fetchClassDocQueue([docType])
    setItems(rows.map(mapClassDoc))
    setLoading(false)
  }, [docType])

  useEffect(() => { reload() }, [reload])

  return (
    <div className="page-stack">
      <div className="page-hero">
        <div>
          <span className="page-hero-kicker">ลงนามอนุมัติ</span>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>
      <div className="card-padded sign-page-card">
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 14px' }}>{flowHint}</p>
        {loading ? (
          <p style={{ color: 'var(--text-3)' }}>กำลังโหลด...</p>
        ) : (
          <ApprovalQueueWithPreview
            items={items}
            emptyText={`ไม่มีเอกสาร ${CLASS_DOC_TYPE_LABELS[docType]} ในคิว`}
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
            onCancelProposal={async item => {
              const row = item as ReturnType<typeof mapClassDoc>
              const r = await cancelClassDocumentProposal(row.doc_type, row.classroom_id, row.term_value, row.month_value)
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
        )}
      </div>
    </div>
  )
}
