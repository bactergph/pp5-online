export type DocumentSignCardTone = 'success' | 'info' | 'warning' | 'danger' | 'muted'

export function documentSignCardStatus(status: string, statusLabel: string) {
  if (status === 'approved') {
    return { label: 'อนุมัติแล้ว', tone: 'success' as const }
  }
  if (status === 'rejected') {
    return { label: 'ส่งกลับแก้ไข', tone: 'danger' as const }
  }
  if (status === 'in_review') {
    return { label: 'เสนอเซ็นแล้ว', tone: 'info' as const, detail: statusLabel }
  }
  if (statusLabel.includes('ใส่ลายเซ็นแล้ว')) {
    return { label: 'ใส่ลายเซ็นแล้ว', tone: 'muted' as const }
  }
  return { label: 'ร่าง — ยังไม่เสนอเซ็น', tone: 'muted' as const }
}
