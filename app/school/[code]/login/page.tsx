import { createServerClient } from '@/lib/supabase'
import SchoolLoginForm from './SchoolLoginForm'

export default async function SchoolLoginPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const db = createServerClient()
  const { data: school } = await db.from('schools')
    .select('id, name, logo_url, program_name, created_by')
    .ilike('code', code).maybeSingle()

  if (!school) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F8', fontFamily: 'Sarabun, sans-serif', color: '#6B7280' }}>
        ไม่พบโรงเรียนนี้ — ตรวจสอบลิงก์อีกครั้ง
      </div>
    )
  }

  return (
    <SchoolLoginForm
      schoolId={school.id}
      schoolName={school.name}
      logoUrl={school.logo_url}
      programName={school.program_name || 'ระบบ ปพ.5 ออนไลน์'}
      createdBy={school.created_by}
      showDemo
    />
  )
}
