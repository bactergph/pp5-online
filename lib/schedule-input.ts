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
export const SUBJECT_IMPORT_COLUMNS = ['ห้องนักเรียน', 'รหัสวิชา', 'ชื่อวิชา', 'คาบต่อสัปดาห์', 'กลุ่มสาระ', 'ประเภท'] as const
const subjectColumnAliases: Record<string, number> = { 'ห้องนักเรียน': 0, 'ห้อง': 0, 'รหัสวิชา': 1, 'รหัส': 1, 'ชื่อวิชา': 2, 'ชื่อ': 2, 'คาบต่อสัปดาห์': 3, 'คาบ/สัปดาห์': 3, 'กลุ่มสาระ': 4, 'หมวดวิชา': 4, 'ประเภท': 5, 'ประเภทวิชา': 5 }
export function parseSubjectTable(matrix: string[][]) {
  const rows = matrix.map(row => row.map(cell => String(cell ?? '').trim()))
  const headerAt = rows.findIndex(row => row.some(cell => cell === 'รหัสวิชา' || cell === 'ห้องนักเรียน'))
  const header = headerAt >= 0 ? rows[headerAt] : []
  const indexes = SUBJECT_IMPORT_COLUMNS.map((_, column) => headerAt < 0 ? column : header.findIndex(cell => subjectColumnAliases[cell] === column))
  const body = (headerAt >= 0 ? rows.slice(headerAt + 1) : rows).map(row => indexes.map(index => index >= 0 ? row[index] || '' : ''))
  return body.filter(row => row.some(Boolean))
}
export type SubjectInputRow = { classroomId: string; code: string; name: string; teacherId: string; count: number; pattern: number[]; venue: string; group: string; type: string }

/** Match a typed or pasted room. `1/IP` means the same room as `ม.1/IP`. */
export function matchClassroomLabel(cell: string, rooms: { id: string; name: string; numeric: string }[]) {
  const key = (value: string) => value.trim().replace(/\s+/g, '').toLowerCase()
  const text = key(cell)
  if (!text) return undefined
  const named = rooms.find(room => key(room.name) === text)
  if (named) return named
  const short = text.match(/^(\d+)\/(.+)$/)
  const expanded = short ? key(`ม.${short[1]}/${short[2]}`) : ''
  if (expanded) {
    const byName = rooms.find(room => key(room.name) === expanded)
    if (byName) return byName
    const byNumber = rooms.filter(room => key(room.numeric) === expanded)
    if (byNumber.length === 1) return byNumber[0]
  }
  const byNumber = rooms.filter(room => key(room.numeric) === text)
  return byNumber.length === 1 ? byNumber[0] : undefined
}
export const SUBJECT_GROUPS = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี', 'สังคมศึกษา ศาสนา และวัฒนธรรม', 'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ', 'ภาษาต่างประเทศ']
/** One workbook can hold a whole school. The database function still accepts 500 rows per call. */
export const SUBJECT_ROW_LIMIT = 2000
export function validateSubjectInputs(rows: SubjectInputRow[]) {
  if (!Array.isArray(rows) || !rows.length || rows.length > SUBJECT_ROW_LIMIT) throw Error(`บันทึกได้ครั้งละ 1–${SUBJECT_ROW_LIMIT} รายการ`)
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    const error = (text: string) => { throw Error(`แถว ${i + 1}: ${text}`) }
    if (!r.classroomId) error('เลือกห้องนักเรียนให้ครบ')
    if (!r.code?.trim() || r.code.length > 40 || !r.name?.trim() || r.name.length > 200) error('กรอกรหัสและชื่อวิชาให้ถูกต้อง')
    if (!Number.isInteger(r.count) || r.count < 1 || r.count > 40 || !Array.isArray(r.pattern) || !r.pattern.length || r.pattern.some(n => !Number.isInteger(n) || n < 1 || n > 8) || r.pattern.reduce((a, b) => a + b, 0) !== r.count) error('รูปแบบคาบต้องรวมเท่ากับคาบต่อสัปดาห์ และแต่ละช่วงไม่เกิน 8 คาบ')
    if ((r.group.trim() !== '' && !SUBJECT_GROUPS.includes(r.group)) || !['พื้นฐาน', 'เพิ่มเติม'].includes(r.type)) error('กลุ่มสาระหรือประเภทวิชาไม่ถูกต้อง')
    if (typeof r.venue !== 'string' || r.venue.length > 100) error('ชื่อสถานที่ยาวเกิน 100 ตัวอักษร')
    const key = r.classroomId + ':' + r.code.trim().toLowerCase()
    if (seen.has(key)) error('ห้องและรหัสวิชาซ้ำในชุดที่กำลังบันทึก')
    seen.add(key)
  })
}
