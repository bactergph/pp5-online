import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { emptyFreeScheduleAd, freeAdIsLive, safeHttpUrl, type FreeScheduleAd } from '@/lib/free-schedule-ad-window'

const MISSING = 'กรุณารัน migration 070 และ 082 สำหรับระบบสมาชิกและโฆษณา'

function missingTable(error: { code?: string; message?: string } | null) {
  const message = error?.message || ''
  return error?.code === 'PGRST204' || error?.code === '42703' || error?.code === '42P01' || message.includes('free_schedule_ads') || message.includes('schema cache')
}

function fromRow(row: { enabled?: boolean; title?: string | null; href?: string | null; image_url?: string | null; start_date?: string | null; end_date?: string | null } | null): FreeScheduleAd {
  return {
    enabled: row?.enabled !== false,
    title: row?.title || '',
    href: row?.href || '',
    imageUrl: row?.image_url || '',
    start: row?.start_date || '',
    end: row?.end_date || '',
  }
}

export async function readFreeScheduleAdSettings(): Promise<{ ad: FreeScheduleAd; error?: string }> {
  const db = createServerClient()
  const result = await db.from('free_schedule_ads').select('enabled,title, href, image_url, start_date, end_date').eq('id', 'current').maybeSingle()
  if (result.error) return { ad: emptyFreeScheduleAd, error: missingTable(result.error) ? MISSING : result.error.message }
  return { ad: fromRow(result.data) }
}

/** สมาชิกเห็นเฉพาะโฆษณาที่วันนี้ตกอยู่ในช่วงที่ Super Admin ตั้งไว้ */
export async function readLiveFreeScheduleAd() {
  const { ad, error } = await readFreeScheduleAdSettings()
  if (error || !freeAdIsLive(ad)) return null
  return { title: ad.title.trim(), href: safeHttpUrl(ad.href), imageUrl: safeHttpUrl(ad.imageUrl) }
}
