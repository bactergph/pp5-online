import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'
import { seedEvaluationSettingsForSchool } from '@/lib/evaluation-settings-seed'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'district' || session.mustChangePassword) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 })
  }

  let body
  try {body=await req.json()} catch {return NextResponse.json({error:'ข้อมูลไม่ถูกต้อง'},{status:400})}
  if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'ข้อมูลไม่ถูกต้อง'},{status:400})
  const email=typeof body.email==='string'?body.email.trim().toLowerCase():''
  const password=typeof body.password==='string'?body.password:''
  const full_name=typeof body.full_name==='string'?body.full_name.trim():''
  const prefix=typeof body.prefix==='string'?body.prefix.trim():'นาย'
  const position=typeof body.position==='string'?body.position.trim():''
  const school_id=typeof body.school_id==='string'?body.school_id.trim():''
  const school_name=typeof body.school_name==='string'?body.school_name.trim():''
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!full_name||full_name.length>200||password.length<8||prefix.length>40||position.length>80||school_name.length>200){
    return NextResponse.json({error:'กรอกชื่อ อีเมล และรหัสผ่านอย่างน้อย 8 ตัวอักษรให้ถูกต้อง'},{status:400})
  }

  const adminClient = createServerClient()

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'admin' },
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || 'ไม่สามารถสร้างผู้ใช้ได้' }, { status: 400 })
  }

  // An account may start with its own named Free workspace, without catalog search.
  let memberSchool: { id: string; name: string; member_code: string | null }
  try {
    const {resolveMemberSchoolId,createMemberSchool}=await import('@/lib/school-member')
    memberSchool=school_id?await resolveMemberSchoolId(school_id):await createMemberSchool({name:school_name||`สมาชิก ${full_name}`})
  } catch(error) {
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({error:error instanceof Error?error.message:'สร้างพื้นที่สมาชิกไม่สำเร็จ'},{status:400})
  }
  const memberSchoolId=memberSchool.id

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
    if(!school_id)await adminClient.from('schools').delete().eq('id',memberSchoolId)
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

  if(school_id)await seedEvaluationSettingsForSchool(memberSchoolId)

  return NextResponse.json({
    success: true,
    userId: authData.user.id,
    schoolId: memberSchoolId,
    memberCode: memberSchool.member_code,
  })
}
