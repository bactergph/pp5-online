import { calcGrade, gradeLabel } from '@/lib/grade'
import { selectClassSubjectOfferings } from '@/lib/class-subject-term'
import type { ReportPayload, ReportScore, ReportSubject } from '@/lib/report-data-server'

export type AcademicBand = 'primary' | 'secondary'
export type AcademicTerm = 1 | 2

/** A legacy semester=0 offering still has two independent secondary results. */
export function secondarySubjects(subjects: ReportSubject[], term: AcademicTerm) {
  return selectClassSubjectOfferings(subjects.map(subject => ({
    subject, subject_id: subject.subject.id || subject.class_subject_id, semester: subject.semester,
  })), 'มัธยม', term).map(row => row.subject)
}

export function secondaryCourseResult(data: ReportPayload, studentId: string, subject: ReportSubject, term: AcademicTerm) {
  const score = data.scores.find(row => row.student_id === studentId && row.class_subject_id === subject.class_subject_id && row.term === term)
  const config = data.scoreConfigs.find(row => row.class_subject_id === subject.class_subject_id && row.term === term)
  const result = score?.result || 'เรียน'
  const special = result !== 'เรียน'
  const total = score?.term_total ?? null
  const max = config?.total_max ?? subject.subject.max_score
  const grade = !special && total !== null && max != null && max > 0 ? calcGrade(total, max) : null
  return { score, total, grade, label: special ? result : grade === null ? 'รอบันทึก' : gradeLabel(grade), pending: special || grade === null }
}

export function secondaryTermSummary(data: ReportPayload, studentId: string, term: AcademicTerm) {
  const subjects = secondarySubjects(data.subjects, term)
  const rows = subjects.map(subject => ({ subject, ...secondaryCourseResult(data, studentId, subject, term) }))
  // Activity pass/fail results are reported separately, never counted as grade points.
  const academic = rows.filter(row => row.subject.subject.type !== 'กิจกรรม' && row.subject.subject.subject_group !== 'กิจกรรมพัฒนาผู้เรียน')
  const missingCredits = academic.filter(row => !(Number(row.subject.subject.credits) > 0))
  const pending = academic.filter(row => row.pending)
  const registeredCredits = academic.reduce((sum, row) => sum + (Number(row.subject.subject.credits) > 0 ? Number(row.subject.subject.credits) : 0), 0)
  const earnedCredits = academic.reduce((sum, row) => sum + (row.grade !== null && row.grade >= 1 && Number(row.subject.subject.credits) > 0 ? Number(row.subject.subject.credits) : 0), 0)
  const points = academic.reduce((sum, row) => sum + (row.grade ?? 0) * (Number(row.subject.subject.credits) > 0 ? Number(row.subject.subject.credits) : 0), 0)
  // Do not silently turn ร/มส/missing scores into 0, or invent one credit for an unset course.
  const gpa = registeredCredits > 0 && !pending.length && !missingCredits.length ? Math.floor((points / registeredCredits + Number.EPSILON) * 100) / 100 : null
  return { rows, registeredCredits, earnedCredits, gpa, pendingCount: pending.length, missingCreditCount: missingCredits.length }
}

export function secondaryTermRanks(data: ReportPayload, term: AcademicTerm) {
  const complete = data.students.map(student => ({ id: student.id, gpa: secondaryTermSummary(data, student.id, term).gpa })).filter(row => row.gpa !== null).sort((a, b) => b.gpa! - a.gpa!)
  const ranks = new Map<string, number>()
  complete.forEach((row, index) => ranks.set(row.id, index > 0 && row.gpa === complete[index - 1].gpa ? ranks.get(complete[index - 1].id)! : index + 1))
  return ranks
}

export function secondaryResultFromInput(score: Pick<ReportScore, 'term_total' | 'result'>, totalMax: number) {
  return score.result === 'เรียน' && score.term_total !== null && totalMax > 0 ? calcGrade(score.term_total, totalMax) : null
}

export function normalizeSecondaryScore<T extends { unit_scores: Record<string, number>; midterm_score: number | null; final_score: number | null; result: string }>(row: T, config: { between_scores: number[]; midterm_max: number; final_max: number; total_max: number }) {
  if (!Array.isArray(config.between_scores) || !(config.total_max > 0) || !['เรียน', 'ร', 'มส', 'มผ'].includes(row.result)) throw new Error('คะแนนหรือผลการเรียนรายภาคไม่ถูกต้อง')
  const valid = (value: number | null, max: number) => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
  let between = 0
  for (const [key, value] of Object.entries(row.unit_scores)) {
    const index = Number(key) - 1
    if (!/^\d+$/.test(key) || !Number.isInteger(index) || index < 0 || index >= config.between_scores.length || !valid(value, config.between_scores[index])) throw new Error('คะแนนระหว่างเรียนเกินช่วงที่กำหนด')
    between += value
  }
  if (!valid(row.midterm_score, config.midterm_max) || !valid(row.final_score, config.final_max)) throw new Error('คะแนนสอบเกินช่วงที่กำหนด')
  const any = Object.keys(row.unit_scores).length > 0 || row.midterm_score !== null || row.final_score !== null
  const total = any ? between + (config.midterm_max > 0 ? row.midterm_score ?? 0 : 0) + (row.final_score ?? 0) : null
  if (total !== null && total > config.total_max) throw new Error('คะแนนรวมเกินคะแนนเต็ม')
  return { ...row, between_total: between, term_total: total, year_total: null, grade: secondaryResultFromInput({ term_total: total, result: row.result }, config.total_max) }
}

export function secondaryActivityRows(records: { student_id: string; term: number; field_key: string; value_text: string | null }[], settings: { field_key: string; is_active: boolean }[]) {
  const rows = new Map<string, Record<string, string | number | null>>()
  for (const record of records) {
    if (record.term !== 1 && record.term !== 2) continue
    const key = `${record.student_id}:${record.term}`
    const row = rows.get(key) || { student_id: record.student_id, term: record.term }
    row[record.field_key] = record.value_text
    rows.set(key, row)
  }
  const keys = settings.filter(setting => setting.is_active).map(setting => setting.field_key)
  for (const row of rows.values()) row.overall_result = keys.some(key => row[key] === 'ไม่ผ่าน') ? 'ไม่ผ่าน' : keys.length && keys.every(key => row[key] === 'ผ่าน') ? 'ผ่าน' : null
  return [...rows.values()]
}

export function secondaryEvaluationSummary(data: ReportPayload, studentId: string, term: AcademicTerm) {
  const find = (rows: Record<string, string | number | null>[]) => rows.find(row => row.student_id === studentId && row.term === term)
  const character = find(data.evaluations.character)
  const reading = find(data.evaluations.reading)
  const competency = find(data.evaluations.competency)
  const activity = find(data.evaluations.activities)
  return [
    ['คุณลักษณะอันพึงประสงค์', String(character?.result_level || 'รอประเมิน')],
    ['อ่าน คิดวิเคราะห์ และเขียน', String(reading?.result_level || 'รอประเมิน')],
    ['สมรรถนะสำคัญ', String(competency?.result_level || 'รอประเมิน')],
    ...data.activitySettings.filter(setting => setting.is_active).map(setting => [setting.label, String(activity?.[setting.field_key] || 'รอประเมิน')]),
  ]
}
