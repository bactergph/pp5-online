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
  const { data: userProfile, error: profileError } = await serverClient
    .from('users')
    .select('id, role, school_id, full_name, email, is_active, is_homeroom')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !userProfile) {
    return { error: 'ไม่พบข้อมูลผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ' }
  }

  if (!userProfile.is_active) {
    return { error: 'บัญชีนี้รอผู้ดูแลระบบอนุมัติ หรือถูกระงับการใช้งาน' }
  }

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
  if (effectiveSchoolId && userProfile.role !== 'district') {
    const { data: school } = await serverClient
      .from('schools')
      .select('code')
      .eq('id', effectiveSchoolId)
      .maybeSingle()
    const code = requestedSchoolCode || (school?.code ? String(school.code).trim().toLowerCase() : '')
    if (code) redirectTo = `/school/${code}/dashboard`
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
    expiresAt: new Date(),
  })

  redirect(redirectTo)
}

// ============================================================
// Logout - ลบ session และ logout จาก Supabase
// ============================================================
export async function logout() {
  const session = await getSession()
  let redirectTo = '/login'

  if (session?.schoolId && session.role !== 'district') {
    const db = createServerClient()
    const { data } = await db.from('schools').select('code').eq('id', session.schoolId).maybeSingle()
    const code = data?.code ? String(data.code).trim().toLowerCase() : ''
    if (code) redirectTo = `/school/${code}/login`
  }

  await supabase.auth.signOut()
  await deleteSession()
  redirect(redirectTo)
}
