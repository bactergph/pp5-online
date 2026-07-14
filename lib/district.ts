import 'server-only'
import { cache } from 'react'
import { getSession } from './session'
import { createServerClient } from './supabase'

const getDistrictAreaOffice = cache(async (userId: string) => {
  const db = createServerClient()
  const { data } = await db.auth.admin.getUserById(userId)
  return (data?.user?.app_metadata?.area_office as string) || null
})

// ดึง areaOffice จาก Supabase app_metadata ทุกครั้ง (authoritative source)
// ไม่พึ่ง session JWT เพื่อให้ตรงกับ settings เสมอ
export async function requireDistrict() {
  const session = await getSession()
  if (!session || session.role !== 'district') throw new Error('ไม่มีสิทธิ์')

  const areaOffice = await getDistrictAreaOffice(session.userId)
  return { ...session, areaOffice }
}
