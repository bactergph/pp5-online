'use server'
import { requireDistrict } from '@/lib/district'
import { logActivity } from '@/lib/audit'
import { safeHttpUrl, type FreeScheduleAd } from '@/lib/free-schedule-ad-window'
import { createServerClient } from '@/lib/supabase'
import { validMembershipDate } from '@/lib/membership'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function saveFreeScheduleAd(input: FreeScheduleAd) {
  const session = await requireDistrict()
  const title = input.title.trim().slice(0, 120)
  const href = input.href.trim()
  const imageUrl = input.imageUrl.trim()
  const start = input.start
  const end = input.end
  if (href && !safeHttpUrl(href)) return { error: 'ลิงก์โฆษณาต้องขึ้นต้นด้วย http หรือ https' }
  if (imageUrl && !safeHttpUrl(imageUrl)) return { error: 'ลิงก์รูปต้องขึ้นต้นด้วย http หรือ https' }
  if ((start && (!DATE.test(start)||!validMembershipDate(start))) || (end && (!DATE.test(end)||!validMembershipDate(end)))) return { error: 'วันที่แสดงโฆษณาไม่ถูกต้อง' }
  if (start && end && start > end) return { error: 'วันเริ่มต้องไม่เกินวันสิ้นสุด' }

  const db = createServerClient()
  const { error } = await db.from('free_schedule_ads').upsert({
    id: 'current',
    enabled: input.enabled !== false,
    title,
    href: href ? safeHttpUrl(href) : '',
    image_url: imageUrl ? safeHttpUrl(imageUrl) : '',
    start_date: start || null,
    end_date: end || null,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    const missing = error.code === 'PGRST204' || error.code === '42703' || error.code === '42P01' || error.message.includes('free_schedule_ads') || error.message.includes('schema cache')
    return { error: missing ? 'กรุณารัน migration 070 และ 082 สำหรับตั้งค่าโฆษณา' : error.message }
  }
  await logActivity({
    actor: session,
    schoolId: null,
    action: 'update',
    module: 'free_schedule_ads',
    targetType: 'free_schedule_ad',
    targetId: 'current',
    targetLabel: title || 'ล้างโฆษณา',
    description: title ? `ตั้งโฆษณาตารางฟรี ${title} ${start}–${end}` : 'ล้างโฆษณาตารางฟรี',
  })
  return { error: null }
}
