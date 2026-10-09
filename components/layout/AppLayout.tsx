import { verifySession } from '@/lib/dal'
import { getSchoolShell } from '@/lib/school-shell'
import { hasRoleInList, resolveNavRole } from '@/lib/roles'
import LayoutClient from './LayoutClient'
import { resolveSchoolEducationType, type SchoolEducationType } from '@/lib/school-education-type'

type Props = {
  children: React.ReactNode
  /** Optional override; normally Navbar title comes from pathname in LayoutClient */
  title?: string
  requireRole?: string[]
}

export default async function AppLayout({ children, title, requireRole }: Props) {
  const session = await verifySession()

  let schoolCode: string | null = null
  let schoolLogoUrl: string | null = null
  let schoolProgramName: string | null = null
  let schoolName: string | null = null
  let isActingDirector = false
  let educationType: SchoolEducationType = 'primary'
  if (session.schoolId && session.role !== 'district') {
    const data = await getSchoolShell(session.schoolId)
    schoolCode = data?.code ?? null
    schoolLogoUrl = data?.logo_url ?? null
    schoolProgramName = data?.program_name ? String(data.program_name).trim() || null : null
    schoolName = data?.name ? String(data.name).trim() || null : null
    isActingDirector = data?.acting_director_user_id === session.userId
    educationType = resolveSchoolEducationType(data?.education_type)
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
      schoolLogoUrl={schoolLogoUrl}
      schoolProgramName={schoolProgramName}
      schoolName={schoolName}
      educationType={educationType}
      hasSchool={Boolean(session.schoolId)}
      isActingDirector={isActingDirector}
    >
      {children}
    </LayoutClient>
  )
}
