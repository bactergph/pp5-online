'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession, createSession } from '@/lib/session'
import { requireDistrict } from '@/lib/district'

export async function getDistrictArea(): Promise<string | null> {
  const session = await getSession()
  if (!session || session.role !== 'district') return null
  const db = createServerClient()
  const { data } = await db.auth.admin.getUserById(session.userId)
  return (data?.user?.app_metadata?.area_office as string) || null
}

export async function saveDistrictArea(area_office: string) {
  const session = await getSession()
  if (!session || session.role !== 'district') throw new Error('ไม่มีสิทธิ์')

  const db = createServerClient()

  // บันทึก area_office ใน Supabase app_metadata (ไม่ต้องเพิ่ม column)
  const { error } = await db.auth.admin.updateUserById(session.userId, {
    app_metadata: { area_office },
  })

  if (error) return { error: error.message }

  // อัพเดต session JWT ด้วย areaOffice ใหม่ (ไม่ต้อง login ใหม่)
  await createSession({ ...session, areaOffice: area_office })

  return { error: null }
}
