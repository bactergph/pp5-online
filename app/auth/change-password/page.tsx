import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import ChangePasswordForm from './ChangePasswordForm'

export const dynamic = 'force-dynamic'

export default async function ForceChangePasswordPage() {
  const session = await getSession()
  if (!session?.userId) {
    redirect('/login')
  }

  let logoUrl: string | null = null
  let programName = 'ระบบ ปพ.5 ออนไลน์'

  if (session.schoolId) {
    const db = createServerClient()
    const { data: school } = await db
      .from('schools')
      .select('logo_url, program_name')
      .eq('id', session.schoolId)
      .maybeSingle()

    if (school) {
      logoUrl = school.logo_url
      programName = school.program_name || programName
    }
  }

  return (
    <ChangePasswordForm
      logoUrl={logoUrl}
      programName={programName}
    />
  )
}
