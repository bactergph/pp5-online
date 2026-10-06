export type TransferRow = { unit_scores: number[]; midterm: number | null; final: number | null; result: string }
export type TransferConfig = { between_scores: number[]; midterm_max: number; final_max: number }
export type TransferStudent = { id: string; student_number: number; prefix: string | null; first_name: string; last_name: string }

export function scoreTransferHeaders(config: TransferConfig, term: number) {
  return ['รหัสนักเรียน (ห้ามแก้)', 'เลขที่', 'ชื่อ–สกุล', ...config.between_scores.map((max, i) => `ระหว่างเรียน ${i + 1} (เต็ม ${max})`),
    ...(config.midterm_max > 0 ? [`กลางภาค (เต็ม ${config.midterm_max})`] : []), `ปลายภาค (เต็ม ${config.final_max})`, ...(term === 2 ? ['ผลการเรียน'] : [])]
}

export function scoreTransferData(students: TransferStudent[], rows: Record<string, TransferRow>, config: TransferConfig, term: number) {
  return [scoreTransferHeaders(config, term), ...students.map(student => {
    const row = rows[student.id]
    return [student.id, student.student_number, `${student.prefix || ''}${student.first_name} ${student.last_name}`,
      ...config.between_scores.map((_, i) => Number.isFinite(row?.unit_scores[i]) ? row.unit_scores[i] : ''),
      ...(config.midterm_max > 0 ? [row?.midterm ?? ''] : []), row?.final ?? '', ...(term === 2 ? [row?.result || 'เรียน'] : [])]
  })]
}

export function parseScoreTransfer(data: unknown[][], students: TransferStudent[], config: TransferConfig, term: number, results: string[]) {
  const headers = scoreTransferHeaders(config, term)
  if (!data.length || headers.some((header, i) => data[0][i] !== header) || data[0].length !== headers.length) throw new Error('หัวตารางไม่ตรงกับแบบฟอร์ม กรุณาดาวน์โหลดไฟล์จากห้องและภาคเรียนที่เลือกใหม่')
  const allowed = new Set(students.map(student => student.id))
  const parsed: Record<string, TransferRow> = {}
  for (let index = 1; index < data.length; index++) {
    const cells = data[index]
    if (cells.every(value => value === '' || value == null)) continue
    const id = String(cells[0] ?? '').trim()
    if (!allowed.has(id)) throw new Error(`แถว ${index + 1}: นักเรียนไม่อยู่ในห้องที่เลือก`)
    if (parsed[id]) throw new Error(`แถว ${index + 1}: นักเรียนซ้ำในไฟล์`)
    if (cells.slice(headers.length).some(value => value !== '' && value != null)) throw new Error(`แถว ${index + 1}: มีข้อมูลเกินคอลัมน์แบบฟอร์ม`)
    let column = 3
    const score = (max: number) => {
      const raw = cells[column++]
      if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return null
      if ((typeof raw !== 'number' && typeof raw !== 'string') || !/^\d+(\.\d+)?$/.test(String(raw).trim())) throw new Error(`แถว ${index + 1}: คะแนนต้องเป็นตัวเลขตั้งแต่ 0 ถึง ${max}`)
      const value = Number(raw)
      if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`แถว ${index + 1}: คะแนนเกินช่วง 0–${max}`)
      return value
    }
    const unit_scores = config.between_scores.map(max => score(max) ?? NaN)
    const midterm = config.midterm_max > 0 ? score(config.midterm_max) : null
    const final = score(config.final_max)
    const result = term === 2 ? String(cells[column] ?? '').trim() || 'เรียน' : 'เรียน'
    if (!results.includes(result)) throw new Error(`แถว ${index + 1}: ผลการเรียนไม่ถูกต้อง (${result})`)
    parsed[id] = { unit_scores, midterm, final, result }
  }
  if (!Object.keys(parsed).length) throw new Error('ไม่มีข้อมูลนักเรียนในไฟล์')
  return parsed
}
