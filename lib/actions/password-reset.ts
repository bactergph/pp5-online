'use server'

import { headers } from 'next/headers'
import { createServerClient, supabase } from '@/lib/supabase'
import { resolveRequestOrigin } from '@/lib/app-origin'

function isSyntheticSchoolEmail(email: string) {
  return email.toLowerCase().endsWith('.pp5.local')
}

const GENERIC_OK =
  'ถ้าอีเมลนี้เป็นบัญชีผู้ดูแลโรงเรียน ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้ — ตรวจสอบกล่องจดหมาย (รวมสแปม)'

/**
 * ลืมรหัสผ่านสำหรับผู้ดูแลโรงเรียน (admin) / เขต (district) ที่ใช้อีเมลจริงเท่านั้น
 * ครูและบุคลากรโรงเรียน → ให้แอดมินรรรีเซ็ตเอง ไม่ส่งอีเมล
 */
export async function requestAdminPasswordReset(
  _prev: { ok?: boolean; error?: string; message?: string } | undefined,
  formData: FormData,
): Promise<{ ok?: boolean; error?: string; message?: string }> {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { error: 'กรุณากรอกอีเมล' }
  }
  if (isSyntheticSchoolEmail(email)) {
    return {
      error: 'บัญชีครูใช้ชื่อผู้ใช้ ไม่สามารถรีเซ็ตทางอีเมลได้ — ติดต่อผู้ดูแลโรงเรียนให้ตั้งรหัสผ่านใหม่',
    }
  }

  const db = createServerClient()
  const { data: profile } = await db
    .from('users')
    .select('id, role, email, is_active')
    .eq('email', email)
    .maybeSingle()

  // ไม่บอกว่ามีบัญชีหรือไม่ (กัน enumerate) — ยกเว้นกรณีรู้ชัดว่าเป็นบัญชีครู
  if (!profile) {
    return { ok: true, message: GENERIC_OK }
  }

  if (!['admin', 'district'].includes(profile.role)) {
    return {
      error: 'บัญชีนี้รีเซ็ตทางอีเมลไม่ได้ — ติดต่อผู้ดูแลโรงเรียนให้ตั้งรหัสผ่านใหม่ที่เมนูผู้ใช้',
    }
  }

  if (!profile.is_active) {
    return { error: 'บัญชีนี้ยังไม่พร้อมใช้งาน หรือถูกระงับ — ติดต่อผู้ดูแลระบบ' }
  }

  const origin = resolveRequestOrigin(await headers())
  const redirectTo = `${origin}/auth/reset-password`

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) {
    console.error('[password-reset]', error.message)
    return { error: 'ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่ภายหลัง หรือติดต่อผู้ดูแลระบบ' }
  }

  return { ok: true, message: GENERIC_OK }
}
