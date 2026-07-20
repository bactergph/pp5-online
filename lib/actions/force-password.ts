'use server'

import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import { createSession, getSession } from '@/lib/session'
import { logActivity } from '@/lib/audit'
import { SCHOOL_TEMP_PASSWORD } from '@/lib/school-temp-password'

export async function completeForcedPasswordChange(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session?.userId) {
    return { error: 'กรุณาเข้าสู่ระบบก่อน' }
  }

  const password = String(formData.get('password') || '')
  const password2 = String(formData.get('password2') || '')

  if (password.length < 8) {
    return { error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' }
  }
  if (password === SCHOOL_TEMP_PASSWORD) {
    return { error: 'ห้ามใช้รหัสชั่วคราว 123456 เป็นรหัสถาวร' }
  }
  if (password !== password2) {
    return { error: 'รหัสผ่านยืนยันไม่ตรงกัน' }
  }

  const db = createServerClient()
  const { data: profile } = await db
    .from('users')
    .select('must_change_password, role, school_id')
    .eq('id', session.userId)
    .maybeSingle()

  // อนุญาตถ้า flag ใน session หรือใน DB
  const needsChange = session.mustChangePassword || profile?.must_change_password
  if (!needsChange) {
    redirect('/dashboard')
  }

  const { error } = await db.auth.admin.updateUserById(session.userId, { password })
  if (error) return { error: error.message }

  const flagRes = await db.from('users').update({ must_change_password: false }).eq('id', session.userId)
  if (flagRes.error && !String(flagRes.error.message || '').includes('must_change_password')) {
    return { error: flagRes.error.message }
  }

  await createSession({
    ...session,
    mustChangePassword: false,
    expiresAt: new Date(),
  })

  await logActivity({
    actor: { ...session, mustChangePassword: false },
    schoolId: session.schoolId,
    action: 'change_password',
    module: 'auth',
    targetType: 'user',
    targetId: session.userId,
    description: 'ตั้งรหัสผ่านใหม่หลังรีเซ็ตโดยผู้ดูแลโรงเรียน',
  })

  let redirectTo = '/dashboard'
  if (session.schoolId && session.role !== 'district') {
    const { data: school } = await db.from('schools').select('code').eq('id', session.schoolId).maybeSingle()
    const code = school?.code ? String(school.code).trim().toLowerCase() : ''
    if (code) redirectTo = `/school/${code}/dashboard`
  }

  redirect(redirectTo)
}
