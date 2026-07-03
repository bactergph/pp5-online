import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// สมัครใช้งานเอง (public) — สร้างบัญชี admin สถานะ "รออนุมัติ" (is_active=false, ยังไม่มีโรงเรียน)
export async function POST(req: NextRequest) {
  const { email, password, prefix, full_name, position } = await req.json()

  if (!email || !password || !full_name) {
    return NextResponse.json({ error: 'กรุณากรอกอีเมล รหัสผ่าน และชื่อ-นามสกุล' }, { status: 400 })
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, { status: 400 })
  }

  const db = createServerClient()

  // กันอีเมลซ้ำ
  const { data: dup } = await db.from('users').select('id').eq('email', email).maybeSingle()
  if (dup) {
    return NextResponse.json({ error: 'อีเมลนี้ถูกใช้สมัครแล้ว' }, { status: 400 })
  }

  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'admin' },
  })
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || 'สมัครไม่สำเร็จ' }, { status: 400 })
  }

  const { error: profileError } = await db.from('users').upsert({
    id: authData.user.id,
    email,
    full_name,
    prefix: prefix || 'นาย',
    position: position || '',
    role: 'admin',
    is_homeroom: false,
    school_id: null,
    is_active: false,   // รออนุมัติ
  })
  if (profileError) {
    await db.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
