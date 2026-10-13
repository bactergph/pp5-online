/** Excel-compatible TSV: quoted cells may contain tabs/newlines and escaped quotes. */
export function parseSchedulePaste(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"' && (quoted || !cell)) {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (!quoted && (c === '\t' || c === '\n' || c === '\r')) {
      row.push(cell.trim()); cell = ''
      if (c !== '\t') { rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++ }
    } else cell += c
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows.filter(r => r.some(Boolean))
}
export type SubjectInputRow = { classroomId: string; code: string; name: string; teacherId: string; count: number; pattern: number[]; venue: string; group: string; type: string }
export const SUBJECT_GROUPS = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี', 'สังคมศึกษา ศาสนา และวัฒนธรรม', 'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ', 'ภาษาต่างประเทศ']
export function validateSubjectInputs(rows: SubjectInputRow[]) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw Error('บันทึกได้ครั้งละ 1–500 รายการ')
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const error = (text: string) => { throw Error(`แถว ${i + 1}: ${text}`) }
    if (!r.classroomId || !r.teacherId) error('เลือกห้องนักเรียนและครูให้ครบ')
    if (!r.code?.trim() || r.code.length > 40 || !r.name?.trim() || r.name.length > 200) error('กรอกรหัสและชื่อวิชาให้ถูกต้อง')
    if (!Number.isInteger(r.count) || r.count < 1 || r.count > 40 || !Array.isArray(r.pattern) || !r.pattern.length || r.pattern.some(n => !Number.isInteger(n) || n < 1 || n > 8) || r.pattern.reduce((a, b) => a + b, 0) !== r.count) error('รูปแบบคาบต้องรวมเท่ากับคาบต่อสัปดาห์ และแต่ละช่วงไม่เกิน 8 คาบ')
    if (!SUBJECT_GROUPS.includes(r.group) || !['พื้นฐาน', 'เพิ่มเติม'].includes(r.type)) error('กลุ่มสาระหรือประเภทวิชาไม่ถูกต้อง')
    if (typeof r.venue !== 'string' || r.venue.length > 100) error('ชื่อสถานที่ยาวเกิน 100 ตัวอักษร')
    const key = r.classroomId + ':' + r.code.trim().toLowerCase()
    if (seen.has(key)) error('ห้องและรหัสวิชาซ้ำในชุดที่กำลังบันทึก')
    seen.add(key)
  })
}
