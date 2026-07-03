/** ม.1–ม.6 / มัธยมศึกษา */
export function isSecondaryClassLevel(level: string | null | undefined) {
  const text = (level || '').trim()
  if (!text) return false
  if (/^ม\.?\s*[1-6]\b/i.test(text)) return true
  if (/มัธยม/i.test(text)) return true
  if (/^ม\s*[1-6]$/i.test(text)) return true
  return false
}

/** ป.1–ป.6 / ประถมศึกษา (ทุกระดับที่ไม่ใช่มัธยม) */
export function isPrimaryClassLevel(level: string | null | undefined) {
  const text = (level || '').trim()
  if (!text) return false
  return !isSecondaryClassLevel(text)
}

/**
 * ปพ.5 รายวิชา: ประถม = ทั้งปี (0) · มัธยม = ภาคเรียนที่เลือก (1/2)
 */
export function pp5SubjectReportTerm(level: string | null | undefined, selected: 0 | 1 | 2): 0 | 1 | 2 {
  if (isSecondaryClassLevel(level)) return selected === 0 ? 1 : selected
  return 0
}
