// สังเคราะห์ "อีเมลภายใน" จาก username + schoolId สำหรับสมาชิกที่ล็อกอินด้วย username ล้วน
// (Supabase Auth ต้องใช้อีเมล — เราสร้างให้อัตโนมัติ ผู้ใช้ไม่เห็น/ไม่ต้องมีอีเมลจริง)
// username ซ้ำข้ามโรงเรียนได้ เพราะผูกกับ schoolId → อีเมลไม่ซ้ำทั้งระบบ
export function schoolMemberEmail(username: string, schoolId: string): string {
  const u = username.trim().toLowerCase().replace(/\s+/g, '')
  return `${u}@${schoolId}.pp5.local`
}

/** username → อีเมลสังเคราะห์ / ถ้าระบุอีเมลจริง (เช่น admin รร.) ให้ใช้ตามนั้น */
export function resolveSchoolLoginEmail(identifier: string, schoolId: string): string {
  const value = identifier.trim().toLowerCase().replace(/\s+/g, '')
  if (value.includes('@')) return value
  return schoolMemberEmail(value, schoolId)
}
