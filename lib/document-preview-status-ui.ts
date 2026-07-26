import { documentSignCardStatus, type DocumentSignCardTone } from '@/lib/document-sign-card-status'
import type { WorkflowStepUiState } from '@/lib/approvals/pp5-subject'
import type { SignDocumentPreviewTarget } from '@/lib/sign-document-preview'

export type PreviewSignStatus = {
  status: string
  status_label: string
  next_step?: string | null
  canPutSignature?: boolean
  canPropose?: boolean
  canSign?: boolean
  isDirectorStep?: boolean
  workflow_steps?: Array<{ label: string; state: WorkflowStepUiState }>
}

export type PreviewShellStatusUi = {
  badge: string
  tone: DocumentSignCardTone
  message: string
  signLabel: string | null
  canShowSign: boolean
  workflowStepStates: Array<{ label: string; state: WorkflowStepUiState }>
}

const EMPTY_WORKFLOW: PreviewShellStatusUi['workflowStepStates'] = []

export function buildPreviewShellStatusUi(
  status: PreviewSignStatus | null,
  options: { readonly?: boolean; loading?: boolean },
): PreviewShellStatusUi {
  const { readonly = false, loading = false } = options

  if (readonly) {
    return {
      badge: 'อนุมัติแล้ว',
      tone: 'success',
      message: 'เอกสารอนุมัติแล้ว — ดู พิมพ์ หรือบันทึก PDF ได้',
      signLabel: null,
      canShowSign: false,
      workflowStepStates: EMPTY_WORKFLOW,
    }
  }

  if (loading || !status) {
    return {
      badge: 'กำลังตรวจสอบ',
      tone: 'muted',
      message: 'กำลังโหลดสถานะเอกสาร...',
      signLabel: null,
      canShowSign: false,
      workflowStepStates: EMPTY_WORKFLOW,
    }
  }

  const card = documentSignCardStatus(status.status, status.status_label)
  const canAct = Boolean(status.canPutSignature || status.canPropose || status.canSign)

  let message = status.status_label
  if (status.canPutSignature) {
    message = 'ใส่ลายเซ็นในเอกสารก่อน จากนั้นกดเสนอเซ็น'
  } else if (status.canPropose) {
    message = 'พร้อมเสนอเซ็นแล้ว — กดเสนอเซ็นเพื่อส่งเข้าสายอนุมัติ'
  } else if (status.canSign) {
    message = status.isDirectorStep
      ? 'ถึงลำดับผู้อำนวยการแล้ว — กดอนุมัติจะใส่ลายเซ็นผอ. พร้อมบันทึกผล (ต้องมีลายเซ็นในโปรไฟล์)'
      : 'ถึงลำดับของท่านแล้ว — กดเซ็นจะใส่ลายเซ็นจากโปรไฟล์ลงเอกสาร'
  } else if (status.status === 'in_review' && status.next_step) {
    message = `ยังไม่ถึงลำดับของท่าน — รอ${status.next_step}ลงนามก่อน`
  } else if (status.status === 'approved') {
    message = 'เอกสารอนุมัติครบแล้ว'
  } else if (status.status === 'rejected') {
    message = 'เอกสารถูกส่งกลับ — ครูผู้รับผิดชอบต้องแก้ไขและเสนอใหม่'
  }

  let signLabel: string | null = 'เซ็น'
  if (status.canPutSignature) signLabel = 'ใส่ลายเซ็น'
  else if (status.canPropose) signLabel = 'เสนอเซ็น'
  else if (status.canSign && status.isDirectorStep) signLabel = 'ลงนามและอนุมัติ'
  else if (!canAct) signLabel = null

  const badge = status.status === 'in_review' && status.status_label
    ? status.status_label
    : card.label

  return {
    badge,
    tone: card.tone,
    message,
    signLabel,
    canShowSign: canAct,
    workflowStepStates: status.workflow_steps ?? EMPTY_WORKFLOW,
  }
}
