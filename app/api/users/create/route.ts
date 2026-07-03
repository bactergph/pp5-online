// route.ts - API สำหรับสร้างผู้ใช้งานใหม่ด้วย service role key
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { schoolMemberEmail } from '@/lib/schoolAuth'
import { logActivity } from '@/lib/audit'

export async function POST(req: NextRequest) {
  // ตรวจสอบว่าผู้ขอเป็น admin
  const session = await getSession()
  if (!session || !['district', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const body = await req.json()
  const { email, username, password, full_name, prefix, position, role, is_homeroom } = body

  if (!password || !full_name) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
  }

  // ใช้ service role client ที่มีสิทธิ์สร้าง user ใน Auth
  const adminClient = createServerClient()

  // สมาชิกโรงเรียนใช้ username ล้วน → สังเคราะห์อีเมลภายใน; ถ้าไม่ส่ง username ให้ใช้ email
  let finalEmail = email as string | undefined
  let finalUsername: string | null = null
  if (username) {
    finalUsername = String(username).trim().toLowerCase().replace(/\s+/g, '')
    if (!/^[a-z0-9._]+$/.test(finalUsername)) {
      return NextResponse.json({ error: 'username ใช้ได้เฉพาะ a-z 0-9 . _' }, { status: 400 })
    }
    if (!session.schoolId) return NextResponse.json({ error: 'ยังไม่ได้เลือกโรงเรียน' }, { status: 400 })
    const { data: dup } = await adminClient.from('users')
      .select('id').eq('school_id', session.schoolId).eq('username', finalUsername).maybeSingle()
    if (dup) return NextResponse.json({ error: 'username นี้ถูกใช้แล้วในโรงเรียน' }, { status: 400 })
    finalEmail = schoolMemberEmail(finalUsername, session.schoolId)
  }
  if (!finalEmail) {
    return NextResponse.json({ error: 'กรุณากรอก username หรือ email' }, { status: 400 })
  }

  // บังคับโควต้า — admin สร้าง user ในโรงเรียนได้ไม่เกินโควต้า (super admin/district ไม่จำกัด)
  if (session.role === 'admin' && session.schoolId) {
    const { data: au } = await adminClient.auth.admin.getUserById(session.userId)
    const quota = Number(au?.user?.app_metadata?.user_quota ?? 15)
    const { count } = await adminClient.from('users')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', session.schoolId).neq('role', 'district')
    if ((count ?? 0) >= quota) {
      return NextResponse.json({ error: `เกินโควต้าผู้ใช้ของโรงเรียน (${count}/${quota} คน) — ติดต่อผู้ดูแลระบบเพื่อขอเพิ่มโควต้า` }, { status: 400 })
    }
  }

  // สร้าง Auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: finalEmail,
    password,
    email_confirm: true, // ยืนยัน email อัตโนมัติ
    user_metadata: { full_name, role },
  })

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message || 'ไม่สามารถสร้างผู้ใช้ได้' },
      { status: 400 }
    )
  }

  // อัปเดต users table ด้วยข้อมูลเพิ่มเติม
  const { error: profileError } = await adminClient
    .from('users')
    .upsert({
      id: authData.user.id,
      email: finalEmail,
      username: finalUsername,
      full_name,
      prefix,
      position,
      role: role || 'teacher',
      is_homeroom: is_homeroom ?? false,
      school_id: session.schoolId,
      is_active: true,
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  if (session.schoolId && role) {
    const { syncUserRoleToSchoolLeaders } = await import('@/lib/school-leaders')
    await syncUserRoleToSchoolLeaders(adminClient, session.schoolId, {
      id: authData.user.id,
      prefix,
      full_name,
      role: role || 'teacher',
    })
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'create',
    module: 'users',
    targetType: 'user',
    targetId: authData.user.id,
    targetLabel: full_name,
    description: `เพิ่มผู้ใช้ ${full_name}`,
    metadata: { role: role || 'teacher', username: finalUsername, isHomeroom: Boolean(is_homeroom) },
  })

  return NextResponse.json({ success: true, userId: authData.user.id })
}
