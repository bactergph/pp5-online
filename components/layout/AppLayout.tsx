import { verifySession } from '@/lib/dal'
import { getSchoolShell } from '@/lib/school-shell'
import { hasRoleInList, resolveNavRole } from '@/lib/roles'
import LayoutClient from './LayoutClient'

type Props = {
  children: React.ReactNode
  /** Optional override; normally Navbar title comes from pathname in LayoutClient */
  title?: string
  requireRole?: string[]
}

export default async function AppLayout({ children, title, requireRole }: Props) {
  const session = await verifySession()

  let schoolCode: string | null = null
  let isActingDirector = false
  if (session.schoolId && session.role !== 'district') {
    const data = await getSchoolShell(session.schoolId)
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
      hasSchool={Boolean(session.schoolId)}
      isActingDirector={isActingDirector}
    >
      {children}
    </LayoutClient>
  )
}
