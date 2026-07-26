export type DocumentSignCardTone = 'success' | 'info' | 'warning' | 'danger' | 'muted'

export type DocumentSignWorkflowStep = {
  label: string
  state: 'done' | 'current' | 'upcoming' | 'skipped' | string
}

export function documentSignCardStatus(status: string, statusLabel: string) {
  if (status === 'approved') {
    return { label: 'อนุมัติแล้ว', tone: 'success' as const }
  }
  if (status === 'rejected') {
    return {
      label: 'ส่งกลับแก้ไข',
      tone: 'danger' as const,
      detail: statusLabel.includes('—') ? statusLabel.split('—').slice(1).join('—').trim() : statusLabel,
    }
  }
  if (status === 'in_review') {
    // หัวการ์ดแสดงว่าอยู่ลำดับไหน เช่น "รอหัวหน้าวิชาการ"
    return { label: statusLabel || 'เสนอเซ็นแล้ว', tone: 'info' as const }
  }
  if (statusLabel.includes('ใส่ลายเซ็นแล้ว')) {
    return { label: 'ใส่ลายเซ็นแล้ว', tone: 'muted' as const }
  }
  return { label: 'ร่าง — ยังไม่เสนอเซ็น', tone: 'muted' as const }
}

/** ลำดับปัจจุบันในสายเซ็น (ข้ามขั้นตอนที่ skipped) */
export function documentSignCardStepMeta(workflowSteps?: DocumentSignWorkflowStep[] | null) {
  if (!workflowSteps?.length) return null
  const active = workflowSteps.filter(step => step.state !== 'skipped')
  if (!active.length) return null
  const currentIndex = active.findIndex(step => step.state === 'current')
  if (currentIndex < 0) return null
  return {
    orderLabel: `ลำดับ ${currentIndex + 1}/${active.length}`,
    currentLabel: active[currentIndex].label,
    steps: workflowSteps,
  }
}
