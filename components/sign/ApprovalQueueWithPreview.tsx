'use client'

import ApprovalQueue, { type ApprovalQueueItem } from '@/components/sign/ApprovalQueue'

type Props = {
  items: ApprovalQueueItem[]
  emptyText?: string
  onPutSignature: (item: ApprovalQueueItem) => Promise<{ error?: string; success?: boolean }>
  onPropose: (item: ApprovalQueueItem) => Promise<{ error?: string; success?: boolean }>
  onCancelProposal?: (item: ApprovalQueueItem) => Promise<{ error?: string; success?: boolean }>
  onSign: (item: ApprovalQueueItem, decision?: 'approve' | 'reject', note?: string) => Promise<{ error?: string; success?: boolean }>
  directorStepLabel?: string
}

export default function ApprovalQueueWithPreview(props: Props) {
  return <ApprovalQueue {...props} />
}
