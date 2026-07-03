import 'server-only'
import { getSession } from './session'
import { createServerClient } from './supabase'

// ดึง areaOffice จาก Supabase app_metadata ทุกครั้ง (authoritative source)
// ไม่พึ่ง session JWT เพื่อให้ตรงกับ settings เสมอ
export async function requireDistrict() {
  const session = await getSession()
  if (!session || session.role !== 'district') throw new Error('ไม่มีสิทธิ์')

  const db = createServerClient()
  const { data } = await db.auth.admin.getUserById(session.userId)
  const areaOffice = (data?.user?.app_metadata?.area_office as string) || null

  return { ...session, areaOffice }
}
