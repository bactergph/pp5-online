export const staffColumns = ['prefix', 'full_name', 'position', 'username', 'password', 'role', 'is_homeroom'] as const

// Excel quotes cells containing tabs, newlines or quotes.
export function parseStaffClipboard(text: string): string[][] {
  if (text.length > 1_000_000) throw new Error('ข้อมูลมากเกินไป กรุณาแบ่งวางเป็นชุด')
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '"' && (quoted || !cell)) {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (!quoted && (c === '\t' || c === '\n')) {
      row.push(cell.trim()); cell = ''
      if (c === '\n') { rows.push(row); row = [] }
    } else cell += c
  }
  if (quoted) throw new Error('ข้อมูลที่วางมีเครื่องหมายคำพูดไม่ครบ')
  row.push(cell.trim()); rows.push(row)
  const result = rows.filter(r => r.some(Boolean))
  if (result.length > 1000) throw new Error('วางได้สูงสุดครั้งละ 1,000 แถว')
  return result
}

export function staffClipboardValue(field: typeof staffColumns[number], value: string): string | boolean {
  if (field === 'role') {
    const roles: Record<string, string> = {'ครูผู้สอน':'teacher','ครู':'teacher','หัวหน้าวิชาการ':'academic_head','รองผู้อำนวยการ':'deputy_principal','ผู้อำนวยการ':'principal','ผู้ดูแลโรงเรียน':'admin','กำหนดภายหลัง':''}
    const role = roles[value] ?? value
    if (!['','teacher','academic_head','deputy_principal','principal','admin'].includes(role)) throw new Error(`ไม่พบบทบาท: ${value}`)
    return role
  }
  if (field === 'is_homeroom') {
    if (['','0','false','ไม่','ไม่ใช่'].includes(value.toLowerCase())) return false
    if (['1','true','ใช่','ประจำชั้น','ครูประจำชั้น','✓'].includes(value.toLowerCase())) return true
    throw new Error(`ค่าประจำชั้นต้องเป็น ใช่ / ไม่ใช่: ${value}`)
  }
  return value
}
