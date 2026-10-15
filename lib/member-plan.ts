import 'server-only'
import { createServerClient } from '@/lib/supabase'
import type { Membership } from '@/lib/membership'

export type MemberPlan = 'free' | 'pro'

/** ไม่มีคอลัมน์หรือยังไม่ระบุชนิด = สมาชิกรายโรงเรียน ใช้ระบบเดิมได้ทั้งก้อน */
export async function readMembership(schoolId: string): Promise<Membership> {
  const db = createServerClient()
  const result = await db.from('schools').select('membership_kind, member_plan').eq('id', schoolId).maybeSingle()
  if (result.error || !result.data) return { kind: 'school' }
  const row = result.data as { membership_kind?: string | null; member_plan?: string | null }
  if (row.membership_kind === 'individual') {
    return { kind: 'individual', plan: row.member_plan === 'pro' ? 'pro' : 'free' }
  }
  return { kind: 'school' }
}
