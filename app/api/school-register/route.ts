import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { schoolMemberEmail } from '@/lib/schoolAuth'
import { logActivity } from '@/lib/audit'

// สมัครสมาชิกผ่านหน้า login ของโรงเรียน (public) — username ล้วน, สถานะรออนุมัติ
export async function POST(req: NextRequest) {
  const { schoolId, username, prefix, full_name, password } = await req.json()

  if (!schoolId || !username || !full_name || !password) {
    return NextResponse.json({ error: 'กรุณากรอก username ชื่อ-สกุล และรหัสผ่าน' }, { status: 400 })
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 })
  }
  const uname = String(username).trim().toLowerCase().replace(/\s+/g, '')
  if (!/^[a-z0-9._]+$/.test(uname)) {
    return NextResponse.json({ error: 'username ใช้ได้เฉพาะ a-z 0-9 . _ (ไม่มีช่องว่าง/ภาษาไทย)' }, { status: 400 })
  }

  const db = createServerClient()

  // ตรวจว่าโรงเรียนมีจริง
  const { data: school } = await db.from('schools').select('id').eq('id', schoolId).maybeSingle()
  if (!school) return NextResponse.json({ error: 'ไม่พบโรงเรียน' }, { status: 404 })

  // กัน username ซ้ำในโรงเรียนเดียวกัน
  const { data: dup } = await db.from('users')
    .select('id').eq('school_id', schoolId).eq('username', uname).maybeSingle()
  if (dup) return NextResponse.json({ error: 'username นี้ถูกใช้แล้วในโรงเรียนนี้' }, { status: 400 })

  const email = schoolMemberEmail(uname, schoolId)
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name, role: 'teacher' },
  })
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || 'สมัครไม่สำเร็จ' }, { status: 400 })
  }

  const { error: profileError } = await db.from('users').upsert({
    id: authData.user.id,
    email, username: uname, full_name,
    prefix: prefix || 'นาย', role: 'teacher', is_homeroom: false,
    school_id: schoolId, is_active: false,   // รอ admin โรงเรียนอนุมัติ
  })
  if (profileError) {
    await db.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  await logActivity({
    actor: null,
    schoolId,
    action: 'register_pending',
    module: 'users',
    targetType: 'user',
    targetId: authData.user.id,
    targetLabel: full_name,
    description: `สมัครสมาชิกใหม่รออนุมัติ ${full_name}`,
    metadata: { username: uname, role: 'teacher' },
  })

  return NextResponse.json({ success: true })
}
