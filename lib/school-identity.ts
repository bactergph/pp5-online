/** รหัสสมาชิกที่แสดงผล — ไม่ใช้ชื่อโรงเรียนเป็นตัวอ้างอิง */
export function schoolMemberIdLabel(school: {
  id: string
  member_code?: string | null
}) {
  const code = String(school.member_code || '').trim()
  if (code) return code
  return school.id.slice(0, 8)
}

export function schoolMemberIdHint(school: {
  id: string
  member_code?: string | null
}) {
  return `รหัสสมาชิก ${schoolMemberIdLabel(school)}`
}
