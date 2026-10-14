import { createServerClient } from '@/lib/supabase'
import Link from 'next/link'
import AuthScreen from '@/components/auth/AuthScreen'
import SchoolLoginForm from './SchoolLoginForm'

export const dynamic = 'force-dynamic'

export default async function SchoolLoginPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const db = createServerClient()
  const { data: school } = await db.from('schools')
    .select('id, name, logo_url, program_name, created_by')
    .ilike('code', code).maybeSingle()

  if (!school) {
    return (
      <AuthScreen><h2>ไม่พบโรงเรียนนี้</h2><p>ตรวจสอบลิงก์เข้าสู่ระบบกับผู้ดูแลโรงเรียนอีกครั้ง</p><div className="welcome-login-bottom"><Link href="/login">ไปหน้าเข้าสู่ระบบหลัก</Link></div></AuthScreen>
    )
  }

  return (
    <SchoolLoginForm
      schoolId={school.id}
      schoolName={school.name}
      logoUrl={school.logo_url}
      programName={school.program_name || 'ระบบ ปพ.5 ออนไลน์'}
      createdBy={school.created_by}
    />
  )
}
