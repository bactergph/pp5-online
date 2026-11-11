export type ScoreInputs = {
  unit_scores: Record<string, number>
  midterm_score: number | null
  final_score: number | null
  result: string
}

export type ScoreEdit = { student_id: string; before: ScoreInputs; after: ScoreInputs }

export function readScoreInputs(row?: Record<string, unknown>): ScoreInputs {
  const unit_scores: Record<string, number> = {}
  for (const [key, value] of Object.entries((row?.unit_scores || {}) as Record<string, unknown>)) {
    if (value != null && Number.isFinite(Number(value))) unit_scores[key] = Number(value)
  }
  return {
    unit_scores,
    midterm_score: row?.midterm_score == null ? null : Number(row.midterm_score),
    final_score: row?.final_score == null ? null : Number(row.final_score),
    result: typeof row?.result === 'string' && row.result ? row.result : 'เรียน',
  }
}

/** Apply edits to the latest row, preserving cells this editor did not change. */
export function mergeScoreEdit(before: ScoreInputs, after: ScoreInputs, current: ScoreInputs) {
  let changed = false
  function cell<T>(original: T, desired: T, latest: T): T {
    if (original === desired || latest === desired) return latest
    if (original !== latest) throw new Error('คะแนนช่องเดียวกันถูกแก้จากหน้าต่างอื่น กรุณาตรวจสอบคะแนนล่าสุดก่อนบันทึก')
    changed = true
    return desired
  }

  const unit_scores = { ...current.unit_scores }
  for (const key of new Set([...Object.keys(before.unit_scores), ...Object.keys(after.unit_scores)])) {
    const value = cell(before.unit_scores[key] ?? null, after.unit_scores[key] ?? null, current.unit_scores[key] ?? null)
    if (value === null) delete unit_scores[key]
    else unit_scores[key] = value
  }
  const inputs: ScoreInputs = {
    unit_scores,
    midterm_score: cell(before.midterm_score, after.midterm_score, current.midterm_score),
    final_score: cell(before.final_score, after.final_score, current.final_score),
    result: cell(before.result, after.result, current.result),
  }
  return { changed, inputs }
}

export function primaryAnnualTotal(current: number | null, previous: number | null, singleTerm: boolean) {
  if (current === null) return null
  if (singleTerm) return current
  return previous === null ? null : Math.round((previous + current) * 100) / 100
}
