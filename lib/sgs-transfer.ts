import { parsePacket, type ScorePacket } from '@/extensions/jarnsek-sgs/core'
import type { TransferConfig, TransferRow } from '@/lib/score-transfer'

export function buildSGSScorePacket(params: {
  yearBe: number; term: 1 | 2; classroom: string; subjectCode: string; subjectName: string
  students: {id: string; student_code: string | null; prefix: string | null; first_name: string; last_name: string}[]
  config: TransferConfig; rows: Record<string, TransferRow>
}): ScorePacket {
  const {config} = params
  const units=config.between_scores.map((max,index)=>({max,index})).filter(unit=>unit.max>0)
  const columns = [
    ...units.map(({max,index}) => ({key: `unit_${index + 1}`, label: `ระหว่างเรียน ${index + 1}`, max})),
    ...(config.midterm_max > 0 ? [{key: 'midterm', label: 'กลางภาค', max: config.midterm_max}] : []),
    ...(config.final_max > 0 ? [{key: 'final', label: 'ปลายภาค', max: config.final_max}] : []),
  ]
  const students = params.students.map(student => {
    if (!student.student_code?.trim()) throw new Error(`${student.first_name} ${student.last_name} ยังไม่มีเลขประจำตัวนักเรียน กรุณาเพิ่มในเมนูนักเรียนก่อนส่ง SGS`)
    const row = params.rows[student.id]
    return {studentCode: student.student_code, name: `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim(), values: [
      ...units.map(({index}) => Number.isFinite(row?.unit_scores[index]) ? row.unit_scores[index] : null),
      ...(config.midterm_max > 0 ? [row?.midterm ?? null] : []),
      ...(config.final_max > 0 ? [row?.final ?? null] : []),
    ]}
  })
  return parsePacket({format:'jarnsek-sgs-scores',version:1,context:{yearBe:params.yearBe,term:params.term,classroom:params.classroom,subjectCode:params.subjectCode,subjectName:params.subjectName},columns,students})
}
