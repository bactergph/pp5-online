import { createServerClient } from '@/lib/supabase'
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
      <div className="auth-scout-page" style={{ placeItems: 'center', justifyContent: 'center' }}>
        <div className="auth-scout-card" style={{ textAlign: 'center', maxWidth: 400 }}>
          <p style={{ color: '#6B5D45', margin: 0 }}>ไม่พบโรงเรียนนี้ — ตรวจสอบลิงก์อีกครั้ง</p>
        </div>
      </div>
    )
  }

  return (
    <SchoolLoginForm
      schoolId={school.id}
      logoUrl={school.logo_url}
      programName={school.program_name || 'ระบบ ปพ.5 ออนไลน์'}
      createdBy={school.created_by}
    />
  )
}
