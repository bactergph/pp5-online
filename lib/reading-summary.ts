import { activeScorableEvaluationSettings, type EvaluationSetting } from './evaluation-settings'

export const READING_RESULT_LABELS = ['ดีเยี่ยม', 'ดี', 'ผ่าน', 'ไม่ผ่าน', 'ยังไม่ครบ'] as const
export type ReadingResult = typeof READING_RESULT_LABELS[number]
export type ReadingSummaryRow = {
  student_id: string
  total: number | null
  max: number
  completed: number
  required: number
  result: ReadingResult
  values: Record<string, number | null>
}

// Read the same active indicators and thresholds used by saveEvaluationRows.
// An absent result is never converted to a zero or a failing result.
export function summarizeReading(studentIds: string[], rows: Record<string, unknown>[], settings: EvaluationSetting[]): ReadingSummaryRow[] {
  const criteria = activeScorableEvaluationSettings(settings, 'reading').filter(item => item.score_type === 'score_0_3')
  const max = criteria.reduce((sum, item) => sum + item.max_score, 0)
  const byStudent = new Map(rows.map(row => [String(row.student_id), row]))
  return studentIds.map(student_id => {
    const row = byStudent.get(student_id)
    const values = Object.fromEntries(criteria.map(item => {
      const raw = row?.[item.field_key]
      const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN
      return [item.field_key, Number.isFinite(value) && value >= 0 && value <= item.max_score ? value : null]
    })) as Record<string, number | null>
    const completed = Object.values(values).filter(value => value !== null).length
    const total = criteria.length > 0 && completed === criteria.length && max > 0
      ? Object.values(values).reduce<number>((sum, value) => sum + (value ?? 0), 0) : null
    const percent = total === null ? null : total / max * 100
    const result: ReadingResult = percent === null ? 'ยังไม่ครบ' : percent >= 80 ? 'ดีเยี่ยม' : percent >= 65 ? 'ดี' : percent >= 50 ? 'ผ่าน' : 'ไม่ผ่าน'
    return { student_id, total, max, completed, required: criteria.length, result, values }
  })
}

export function countReadingResults(rows: ReadingSummaryRow[]) {
  return READING_RESULT_LABELS.map(label => ({ label, count: rows.filter(row => row.result === label).length }))
}
