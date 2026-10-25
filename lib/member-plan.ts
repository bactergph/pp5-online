import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { cache } from 'react'
import { membershipFromRow, type Membership } from '@/lib/membership'

export type MemberPlan = 'free' | 'pro' | 'pro_plus'

/** Preserve explicit legacy rows; missing schema or failed reads never grant access. */
export const readMembership = cache(async (schoolId: string): Promise<Membership> => {
  const db = createServerClient()
  const result = await db.from('schools').select('membership_kind,member_plan,membership_started_on,membership_expires_on,membership_version,free_schedule_teacher_limit,membership_student_count,membership_annual_price').eq('id', schoolId).maybeSingle()
  if (result.error || !result.data) throw Error('ตรวจสิทธิ์สมาชิกไม่สำเร็จ กรุณาตรวจฐานข้อมูลสมาชิก 082 หรือลองใหม่')
  return membershipFromRow(result.data)
})
