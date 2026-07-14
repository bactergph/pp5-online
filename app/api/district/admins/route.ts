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

  // ตรวจว่าโรงเรียนนี้มีผู้ดูแลอยู่แล้วหรือยัง
  const { data: existing } = await adminClient
    .from('users')
    .select('id, full_name')
    .eq('school_id', school_id)
    .eq('role', 'admin')
    .eq('is_active', true)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `โรงเรียนนี้มีผู้ดูแลอยู่แล้ว (${existing.full_name}) — 1 โรงเรียน ต่อ 1 ผู้ดูแลเท่านั้น` }, { status: 400 })
  }

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
    school_id,
    is_active: true,
  })

  if (profileError) {
    // rollback auth user ถ้า profile ล้มเหลว
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  await logActivity({
    actor: session,
    schoolId: school_id,
    action: 'create',
    module: 'district_admins',
    targetType: 'user',
    targetId: authData.user.id,
    targetLabel: full_name,
    description: `เพิ่มผู้ดูแลโรงเรียน ${full_name}`,
    metadata: { email },
  })

  await seedEvaluationSettingsForSchool(school_id)

  return NextResponse.json({ success: true, userId: authData.user.id })
}
