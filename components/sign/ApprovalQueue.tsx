'use client'

import { openDocumentPreviewPopup } from '@/lib/document-preview-popup'
import { buildDocumentPreviewShellUrl } from '@/lib/sign-document-preview'
import { documentSignCardStatus } from '@/lib/document-sign-card-status'
import type { SignDocumentPreviewTarget } from '@/lib/sign-document-preview'

export type ApprovalQueueItem = {
  id?: string | null
  key: string
  title: string
  subtitle: string
  term: number
  status: string
  status_label: string
  next_step: string | null
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
}: Pick<Props, 'items' | 'emptyText'>) {
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
          return (
            <article key={item.key} className={`document-sign-card document-sign-card--${statusMeta.tone}`}>
              <div className="document-sign-card__top">
                <span className={`document-sign-card__status document-sign-card__status--${statusMeta.tone}`}>
                  {statusMeta.label}
                </span>
                <span className="document-sign-card__term">เทอม {item.term}</span>
              </div>
              <h3 className="document-sign-card__title">{item.title}</h3>
              <p className="document-sign-card__subtitle">{item.subtitle}</p>
              {statusMeta.detail && (
                <p className="document-sign-card__detail">{statusMeta.detail}</p>
              )}
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
            </article>
          )
        })}
      </div>
    </>
  )
}
