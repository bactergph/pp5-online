// route.ts - API สำหรับสร้างผู้ใช้งานใหม่ด้วย service role key
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { schoolMemberEmail } from '@/lib/schoolAuth'
import { logActivity } from '@/lib/audit'
import { saveStaffRows } from '@/lib/staff-table'
import { staffAccessError } from '@/lib/staff-permissions'
import { readMembership } from '@/lib/member-plan'

export async function POST(req: NextRequest) {
  // ตรวจสอบว่าผู้ขอเป็น admin
  const session = await getSession()
  if (!session || staffAccessError(session)) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  const body = await req.json()
  const { email, username, password, full_name, prefix, position, role, is_homeroom } = body

  if (!username && !email && !password) {
    try {
      const [result] = await saveStaffRows([{key:'single',prefix,full_name,position,role:role || '',username:'',password:'',is_homeroom:Boolean(is_homeroom)}])
      return NextResponse.json(result.error?{error:result.error}:{success:true,userId:result.id},{status:result.error?400:200})
    } catch(e) {
      return NextResponse.json({error:e instanceof Error?e.message:'บันทึกไม่สำเร็จ'},{status:400})
    }
  }

  if (!['teacher','academic_head','deputy_principal','principal','admin'].includes(role)) {
    return NextResponse.json({error:'กรุณาเลือกบทบาทก่อนเปิดบัญชีใช้งาน'},{status:400})
  }

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

  if(session.role!=='district'&&session.schoolId&&(await readMembership(session.schoolId)).kind==='individual')return NextResponse.json({error:'Pro / Pro Plus ใช้ได้ 1 บัญชี เพิ่มรายชื่อครูได้โดยเว้นชื่อผู้ใช้และรหัสผ่าน หากต้องการหลายบัญชีให้ใช้ School'},{status:400})

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
    await adminClient.auth.admin.deleteUser(authData.user.id)
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
