import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Every self-service registration starts as an isolated, active Free account.
export async function POST(req: NextRequest) {
  let input
  try { input = await req.json() } catch { return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }) }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  const { password, prefix, position } = input
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const full_name = typeof input.full_name === 'string' ? input.full_name.trim() : ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || !full_name || full_name.length > 200) {
    return NextResponse.json({ error: 'กรุณากรอกอีเมล รหัสผ่าน และชื่อ-นามสกุล' }, { status: 400 })
  }
  if (String(password).length < 8) {
    return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, { status: 400 })
  }
  const resolvedPrefix = String(prefix || '').trim()
  if (!resolvedPrefix || resolvedPrefix === 'อื่นๆ') {
    return NextResponse.json({ error: 'กรุณาระบุคำนำหน้า' }, { status: 400 })
  }
  if (resolvedPrefix.length > 40) {
    return NextResponse.json({ error: 'คำนำหน้ายาวเกินไป' }, { status: 400 })
  }
  const resolvedPosition = String(position || '').trim()
  if (resolvedPosition.length > 80) {
    return NextResponse.json({ error: 'ตำแหน่งยาวเกินไป' }, { status: 400 })
  }

  const db = createServerClient()

  // กันอีเมลซ้ำ
  const { data: dup, error: lookupError } = await db.from('users').select('id').eq('email', email).maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'ตรวจบัญชีไม่สำเร็จ กรุณาลองใหม่' }, { status: 503 })
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

  const { error: profileError } = await db.rpc('register_free_member', {
    p_user: authData.user.id, p_email: email, p_name: full_name,
    p_prefix: resolvedPrefix, p_position: resolvedPosition,
  })
  if (profileError) {
    await db.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: 'สร้างพื้นที่สมาชิกไม่สำเร็จ กรุณาตรวจฐานข้อมูลสมาชิก 082 หรือลองใหม่' }, { status: 503 })
  }

  return NextResponse.json({ success: true })
}
