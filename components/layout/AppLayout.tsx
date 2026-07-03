import { verifySession } from '@/lib/dal'
import { createServerClient } from '@/lib/supabase'
import { hasRoleInList, resolveNavRole } from '@/lib/roles'
import LayoutClient from './LayoutClient'

type Props = {
  children: React.ReactNode
  title?: string
  requireRole?: string[]
}

export default async function AppLayout({ children, title = 'ระบบ ปพ.5 ออนไลน์', requireRole }: Props) {
  const session = await verifySession()

  let schoolCode: string | null = null
  let isActingDirector = false
  if (session.schoolId && session.role !== 'district') {
    const db = createServerClient()
    const { data } = await db.from('schools')
      .select('code, acting_director_user_id')
      .eq('id', session.schoolId)
      .maybeSingle()
    schoolCode = data?.code ?? null
    isActingDirector = data?.acting_director_user_id === session.userId
  }

  const navRole = resolveNavRole(session.role, isActingDirector)
  const accessRole = isActingDirector ? 'principal' : session.role

  if (requireRole && !hasRoleInList(accessRole, requireRole)) {
    const { redirect } = await import('next/navigation')
    redirect('/dashboard')
  }

  return (
    <LayoutClient
      title={title}
      userRole={session.role}
      navRole={navRole}
      userFullName={session.fullName}
      isHomeroom={session.isHomeroom}
      schoolCode={schoolCode}
      isActingDirector={isActingDirector}
    >
      {children}
    </LayoutClient>
  )
}
