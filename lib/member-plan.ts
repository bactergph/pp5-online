import 'server-only'
import { createServerClient } from '@/lib/supabase'

export type MemberPlan = 'free' | 'pro'

/** ไม่มีคอลัมน์หรือยังไม่ระบุ = ยังไม่ใช่โปร สมาชิกใช้จัดตารางฟรีบนเครื่องได้ */
export async function readMemberPlan(schoolId: string): Promise<MemberPlan | null> {
  const db = createServerClient()
  const result = await db.from('schools').select('member_plan').eq('id', schoolId).maybeSingle()
  if (result.error) {
    if (['PGRST204', '42703'].includes(result.error.code || '')) return null
    return null
  }
  const value = (result.data as { member_plan?: string | null } | null)?.member_plan
  return value === 'pro' || value === 'free' ? value : null
}
