import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'
import { seedEvaluationSettingsForSchool } from '@/lib/evaluation-settings-seed'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'district') {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const body = await req.json()
  const { email, password, full_name, prefix, position, school_id } = body

  if (!email || !password || !full_name || !school_id) {
    return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
  }

  const adminClient = createServerClient()

  // เลือกจาก catalog → สร้างโรงเรียนสมาชิกใหม่ (ID / รหัสสมาชิกใหม่) ไม่แชร์ข้อมูลกับฐานอ้างอิง
  let memberSchool: { id: string; name: string; member_code: string | null }
  try {
    const { resolveMemberSchoolId } = await import('@/lib/school-member')
    memberSchool = await resolveMemberSchoolId(String(school_id))
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'สร้างโรงเรียนสมาชิกไม่สำเร็จ',
    }, { status: 400 })
  }
  const memberSchoolId = memberSchool.id

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'admin' },
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || 'ไม่สามารถสร้างผู้ใช้ได้' }, { status: 400 })
  }

  const { error: profileError } = await adminClient.from('users').upsert({
    id: authData.user.id,
    email,
    full_name,
    prefix: prefix || 'นาย',
    position: position || '',
    role: 'admin',
    is_homeroom: false,
    school_id: memberSchoolId,
    is_active: true,
  })

  if (profileError) {
    // rollback auth user ถ้า profile ล้มเหลว
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  await logActivity({
    actor: session,
    schoolId: memberSchoolId,
    action: 'create',
    module: 'district_admins',
    targetType: 'user',
    targetId: authData.user.id,
    targetLabel: full_name,
    description: `เพิ่มผู้ดูแลโรงเรียน ${full_name}`,
    metadata: {
      email,
      catalogSchoolId: school_id,
      memberSchoolId,
      memberCode: memberSchool.member_code,
    },
  })

  await seedEvaluationSettingsForSchool(memberSchoolId)

  return NextResponse.json({
    success: true,
    userId: authData.user.id,
    schoolId: memberSchoolId,
    memberCode: memberSchool.member_code,
  })
}
