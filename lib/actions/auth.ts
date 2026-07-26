// actions/auth.ts - Server Actions สำหรับ Login/Logout
'use server'
import { redirect } from 'next/navigation'
import { supabase, createServerClient } from '@/lib/supabase'
import { createSession, deleteSession, getSession } from '@/lib/session'

// ============================================================
// Login - รับ email/password, ตรวจสอบกับ Supabase Auth
// ============================================================
export async function login(
  prevState: { error?: string } | undefined,
  formData: FormData
) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const requestedSchoolId = String(formData.get('schoolId') || '').trim()

  if (!email || !password) {
    return { error: 'กรุณากรอก Email และ Password' }
  }

  // ตรวจสอบกับ Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError || !authData.user) {
    return { error: 'Email หรือ Password ไม่ถูกต้อง' }
  }

  // ดึงข้อมูล user profile จาก users table (ใช้ service role เพื่อข้าม RLS)
  const serverClient = createServerClient()
  const profileRes = await serverClient
    .from('users')
    .select('id, role, school_id, full_name, email, is_active, is_homeroom, must_change_password')
    .eq('id', authData.user.id)
    .single()

  let userProfile = profileRes.data
  if (profileRes.error && String(profileRes.error.message || '').includes('must_change_password')) {
    const fb = await serverClient
      .from('users')
      .select('id, role, school_id, full_name, email, is_active, is_homeroom')
      .eq('id', authData.user.id)
      .single()
    if (fb.error || !fb.data) {
      return { error: 'ไม่พบข้อมูลผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ' }
    }
    userProfile = { ...fb.data, must_change_password: false }
  } else if (profileRes.error || !userProfile) {
    return { error: 'ไม่พบข้อมูลผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ' }
  }

  if (!userProfile.is_active) {
    return { error: 'บัญชีนี้รอผู้ดูแลระบบอนุมัติ หรือถูกระงับการใช้งาน' }
  }

  const mustChangePassword = Boolean(userProfile.must_change_password)

  let effectiveSchoolId = userProfile.school_id
  let requestedSchoolCode = ''

  // Admin ที่เข้า login ผ่าน URL โรงเรียน แต่ profile เก่ายังไม่มี school_id
  // ให้ผูกกับโรงเรียนนั้นทันที เพื่อให้ Super Admin เห็นโรงเรียนที่กำหนดแล้ว
  if (!effectiveSchoolId && requestedSchoolId && userProfile.role === 'admin') {
    const { data: requestedSchool } = await serverClient
      .from('schools')
      .select('id, code')
      .eq('id', requestedSchoolId)
      .maybeSingle()

    if (requestedSchool?.id) {
      const { error: linkError } = await serverClient
        .from('users')
        .update({ school_id: requestedSchool.id })
        .eq('id', userProfile.id)

      if (!linkError) {
        effectiveSchoolId = requestedSchool.id
        requestedSchoolCode = requestedSchool.code ? String(requestedSchool.code).trim().toLowerCase() : ''
      }
    }
  }

  let redirectTo = '/dashboard'
  const { cookies } = await import('next/headers')
  // ทุกครั้งที่ login ใหม่ → ล้างการข้าม onboarding ของ session ก่อน
  // (กด "ตั้งค่าภายหลัง" ใช้ได้ในรอบนี้ แต่รอบ login ถัดไปจะตรวจความครบอีก)
  ;(await cookies()).delete('onboarding_skipped')

  if (mustChangePassword) {
    redirectTo = '/auth/change-password'
  } else if (userProfile.role === 'admin') {
    const { getAdminOnboardingGate, onboardingUrl } = await import('@/lib/onboarding-complete')
    const gate = await getAdminOnboardingGate(effectiveSchoolId)
    if (!gate.complete) {
      redirectTo = onboardingUrl(gate.step)
    } else if (effectiveSchoolId) {
      const { data: school } = await serverClient
        .from('schools')
        .select('code')
        .eq('id', effectiveSchoolId)
        .maybeSingle()
      const code = requestedSchoolCode || (school?.code ? String(school.code).trim().toLowerCase() : '')
      if (code) {
        const { schoolDashboardPath } = await import('@/lib/school-path')
        redirectTo = schoolDashboardPath(code)
      }
    }
  } else if (effectiveSchoolId && userProfile.role !== 'district') {
    const { data: school } = await serverClient
      .from('schools')
      .select('code')
      .eq('id', effectiveSchoolId)
      .maybeSingle()
    const code = requestedSchoolCode || (school?.code ? String(school.code).trim().toLowerCase() : '')
    if (code) {
      const { schoolDashboardPath } = await import('@/lib/school-path')
      redirectTo = schoolDashboardPath(code)
    }
  }

  // สร้าง session cookie
  await createSession({
    userId: userProfile.id,
    email: userProfile.email || email,
    role: userProfile.role,
    schoolId: effectiveSchoolId,
    fullName: userProfile.full_name,
    isHomeroom: userProfile.is_homeroom ?? false,
    // area_office เก็บใน Supabase app_metadata — ไม่ต้องเพิ่ม column
    areaOffice: (authData.user.app_metadata?.area_office as string) ?? null,
    mustChangePassword,
    expiresAt: new Date(),
  })

  redirect(redirectTo)
}

// ============================================================
// Logout - ลบ session ก่อนเสมอ แล้วค่อยออกจาก Supabase Auth
// ============================================================
export async function logout() {
  let redirectTo = '/login'

  try {
    const session = await getSession()
    if (session?.schoolId && session.role !== 'district') {
      const db = createServerClient()
      const { data } = await db.from('schools').select('code').eq('id', session.schoolId).maybeSingle()
      const code = data?.code ? String(data.code).trim().toLowerCase() : ''
      if (code) {
        const { schoolLoginPath } = await import('@/lib/school-path')
        redirectTo = schoolLoginPath(code)
      }
    }
  } catch {
    // ถ้าดึงโรงเรียนไม่สำเร็จ ให้ไปหน้า login กลาง
  }

  // ลบ cookie ของแอปก่อน — นี่คือสิ่งที่ proxy ใช้ตัดสินว่า login อยู่หรือไม่
  try {
    await deleteSession()
  } catch {
    // ignore
  }

  try {
    const { cookies } = await import('next/headers')
    ;(await cookies()).delete('onboarding_skipped')
  } catch {
    // ignore
  }

  // Supabase Auth เป็นเสริม ไม่ต้องบล็อกการออกจากระบบถ้าเน็ต/DNS ช้า
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise<void>(resolve => setTimeout(resolve, 1500)),
    ])
  } catch {
    // ignore
  }

  redirect(redirectTo)
}
