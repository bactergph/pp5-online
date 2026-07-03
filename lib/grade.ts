// การคิดเกรด 8 ระดับ ตามเกณฑ์ สพฐ. (จากเปอร์เซ็นต์ของคะแนนเต็ม)
// 80-100=4 · 75-79=3.5 · 70-74=3 · 65-69=2.5 · 60-64=2 · 55-59=1.5 · 50-54=1 · 0-49=0
export function calcGrade(total: number, totalMax: number): number {
  if (!totalMax || totalMax <= 0) return 0
  const pct = (total / totalMax) * 100
  if (pct >= 80) return 4
  if (pct >= 75) return 3.5
  if (pct >= 70) return 3
  if (pct >= 65) return 2.5
  if (pct >= 60) return 2
  if (pct >= 55) return 1.5
  if (pct >= 50) return 1
  return 0
}

// ผลการเรียน: เรียน(ปกติ คิดเกรด) · ร(ไม่สมบูรณ์) · มส(เวลาเรียนไม่พอ) · มผ(ไม่ผ่านกิจกรรม)
export const RESULT_OPTIONS = ['เรียน', 'ร', 'มส', 'มผ'] as const
export type ResultType = (typeof RESULT_OPTIONS)[number]

export function gradeLabel(g: number): string {
  return Number.isInteger(g) ? String(g) : g.toFixed(1)
}

export function gradeColor(g: number): string {
  if (g >= 3.5) return '#059669'
  if (g >= 2.5) return '#2563EB'
  if (g >= 1) return '#D97706'
  return '#DC2626'
}
