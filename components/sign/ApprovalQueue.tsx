'use client'

import { useState } from 'react'
import { openDocumentPreviewPopup } from '@/lib/document-preview-popup'
import { buildDocumentPreviewShellUrl } from '@/lib/sign-document-preview'
import {
  documentSignCardStatus,
  documentSignCardStepMeta,
  type DocumentSignWorkflowStep,
} from '@/lib/document-sign-card-status'
import type { SignDocumentPreviewTarget } from '@/lib/sign-document-preview'
import { useAppAlert } from '@/lib/use-app-alert'

export type ApprovalQueueItem = {
  id?: string | null
  key: string
  title: string
  subtitle: string
  term: number
  status: string
  status_label: string
  next_step: string | null
  workflow_steps?: DocumentSignWorkflowStep[]
  canSign: boolean
  canPutSignature: boolean
  canPropose: boolean
  canCancelProposal?: boolean
  preview?: SignDocumentPreviewTarget
}

type Props = {
  items: ApprovalQueueItem[]
  emptyText?: string
  onPutSignature: (item: ApprovalQueueItem) => Promise<{ error?: string; success?: boolean }>
  onPropose: (item: ApprovalQueueItem) => Promise<{ error?: string; success?: boolean }>
  onCancelProposal?: (item: ApprovalQueueItem) => Promise<{ error?: string; success?: boolean }>
  onSign: (item: ApprovalQueueItem, decision?: 'approve' | 'reject', note?: string) => Promise<{ error?: string; success?: boolean }>
  directorStepLabel?: string
}

export default function ApprovalQueue({
  items,
  emptyText = 'ไม่มีเอกสารในคิว',
  onCancelProposal,
}: Props) {
  const { notify, confirm, AlertModal } = useAppAlert('ดำเนินการสำเร็จ', 'ดำเนินการไม่สำเร็จ')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  async function handleCancel(item: ApprovalQueueItem) {
    if (!onCancelProposal || !item.canCancelProposal) return
    const ok = await confirm({
      title: 'ยกเลิกการเสนอเซ็น?',
      message: `${item.title}\n\nเอกสารจะกลับเป็นร่าง\nยกเลิกได้เฉพาะเมื่อลำดับถัดไปยังไม่ลงนาม`,
      confirmLabel: 'ยืนยันยกเลิก',
      cancelLabel: 'เก็บไว้',
    })
    if (!ok) return

    setBusyKey(item.key)
    try {
      const result = await onCancelProposal(item)
      if (result.error) notify('error', result.error)
      else notify('success', 'ยกเลิกการเสนอเซ็นแล้ว')
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ')
    } finally {
      setBusyKey(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '32px 16px' }}>
        <div style={{ color: 'var(--text-3)', fontSize: 14 }}>{emptyText}</div>
      </div>
    )
  }

  return (
    <>
      <div className="document-sign-cards">
        {items.map(item => {
          const statusMeta = documentSignCardStatus(item.status, item.status_label)
          const stepMeta = item.status === 'in_review'
            ? documentSignCardStepMeta(item.workflow_steps)
            : null
          const cancelBusy = busyKey === item.key
          return (
            <article key={item.key} className={`document-sign-card document-sign-card--${statusMeta.tone}`}>
              <div className="document-sign-card__top">
                <div className="document-sign-card__status-stack">
                  {stepMeta && (
                    <span className="document-sign-card__order">{stepMeta.orderLabel}</span>
                  )}
                  <span className={`document-sign-card__status document-sign-card__status--${statusMeta.tone}`}>
                    {statusMeta.label}
                  </span>
                </div>
                <span className="document-sign-card__term">เทอม {item.term}</span>
              </div>

              {stepMeta && stepMeta.steps.length > 0 && (
                <ol className="document-sign-card__steps" aria-label="ลำดับการลงนาม">
                  {stepMeta.steps.map((step, index) => (
                    <li
                      key={`${item.key}-step-${index}`}
                      className={`document-sign-card__step document-sign-card__step--${step.state}`}
                      title={step.state === 'skipped' ? `${step.label} (ข้าม)` : step.label}
                    >
                      <span className="document-sign-card__step-dot" />
                      <span className="document-sign-card__step-label">{step.label}</span>
                    </li>
                  ))}
                </ol>
              )}

              <h3 className="document-sign-card__title">{item.title}</h3>
              <p className="document-sign-card__subtitle">{item.subtitle}</p>
              {statusMeta.detail && item.status === 'rejected' && (
                <p className="document-sign-card__detail document-sign-card__detail--danger">{statusMeta.detail}</p>
              )}
              <div className="document-sign-card__actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm document-sign-card__view"
                  onClick={() => {
                    if (!item.preview) return
                    openDocumentPreviewPopup(buildDocumentPreviewShellUrl(item.preview, { title: item.title }))
                  }}
                >
                  ดูเอกสาร
                </button>
                {item.canCancelProposal && onCancelProposal && (
                  <button
                    type="button"
                    className="btn btn-sm document-sign-card__cancel"
                    disabled={cancelBusy}
                    onClick={() => void handleCancel(item)}
                  >
                    {cancelBusy ? 'กำลังยกเลิก...' : 'ยกเลิกเสนอเซ็น'}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
      <AlertModal />
    </>
  )
}
