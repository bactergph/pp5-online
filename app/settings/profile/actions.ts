'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase'
import { getSession, createSession, type SessionPayload } from '@/lib/session'
import { formatStaffName } from '@/lib/roles'
import { joinFullName, splitFullName } from '@/lib/profile-name'
import { logActivity } from '@/lib/audit'

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  return session
}

async function refreshSession(session: SessionPayload) {
  const db = createServerClient()
  const { data: user } = await db.from('users')
    .select('email, role, school_id, full_name, prefix, is_homeroom')
    .eq('id', session.userId)
    .maybeSingle()
  if (!user) return
  await createSession({
    userId: session.userId,
    email: user.email,
    role: user.role,
    schoolId: user.school_id,
    fullName: formatStaffName(user.prefix, user.full_name),
    isHomeroom: user.is_homeroom,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    areaOffice: session.areaOffice,
  })
}

export async function fetchOwnProfile() {
  const session = await requireSession()
  const db = createServerClient()
  const { data } = await db.from('users')
    .select('id, email, username, prefix, full_name, position, role, signature_url')
    .eq('id', session.userId)
    .maybeSingle()
  if (!data) return null
  const { firstName, lastName } = splitFullName(data.full_name || '')
  return {
    ...data,
    first_name: firstName,
    last_name: lastName,
  }
}

export async function updateOwnProfile(payload: {
  prefix: string
  first_name: string
  last_name: string
  signature_url?: string | null
}) {
  const session = await requireSession()
  const full_name = joinFullName(payload.first_name, payload.last_name)
  if (!full_name) return { error: 'กรุณากรอกชื่อและนามสกุล' }

  const db = createServerClient()
  const updates: Record<string, string | null> = {
    prefix: payload.prefix.trim(),
    full_name,
  }
  if (payload.signature_url !== undefined) {
    updates.signature_url = payload.signature_url || null
  }

  const { error } = await db.from('users').update(updates).eq('id', session.userId)
  if (error) return { error: error.message }

  await refreshSession(session)
  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'update',
    module: 'profile',
    targetType: 'user',
    targetId: session.userId,
    targetLabel: formatStaffName(payload.prefix, full_name),
    description: 'แก้ไขข้อมูลตัวเอง',
    metadata: { fields: Object.keys(updates) },
  })

  revalidatePath('/settings/profile')
  return { success: true as const }
}

export async function changeOwnPassword(newPassword: string, confirmPassword: string) {
  const session = await requireSession()
  if (newPassword.length < 8) return { error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }
  if (newPassword !== confirmPassword) return { error: 'รหัสผ่านยืนยันไม่ตรงกัน' }

  const db = createServerClient()
  const { error } = await db.auth.admin.updateUserById(session.userId, { password: newPassword })
  if (error) return { error: error.message }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'change_password',
    module: 'profile',
    targetType: 'user',
    targetId: session.userId,
    description: 'เปลี่ยนรหัสผ่านของตัวเอง',
  })

  return { success: true as const }
}
