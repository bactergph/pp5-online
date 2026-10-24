import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { getSchoolShell } from '@/lib/school-shell'
import { hasRoleInList, resolveNavRole } from '@/lib/roles'
import { readMembership } from '@/lib/member-plan'
import { membershipAllows, membershipHome, type Membership } from '@/lib/membership'
import LayoutClient from './LayoutClient'
import { resolveSchoolEducationType, type SchoolEducationType } from '@/lib/school-education-type'
import { readLiveFreeScheduleAd } from '@/lib/free-schedule-ad'
import { isFreeMembership } from '@/lib/membership'

type Props = {
  children: React.ReactNode
  /** Optional override; normally Navbar title comes from pathname in LayoutClient */
  title?: string
  requireRole?: string[]
}

export default async function AppLayout({ children, title, requireRole }: Props) {
  const session = await verifySession(true)

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
    if (data && data.education_type !== 'primary' && data.education_type !== 'secondary') {
      const { createServerClient } = await import('@/lib/supabase')
      const rooms = await createServerClient().from('classrooms').select('level').eq('school_id', session.schoolId).in('level', ['ม.4', 'ม.5', 'ม.6']).limit(1)
      educationType = resolveSchoolEducationType(data.education_type, (rooms.data || []).map(row => row.level))
    }
  }

  const navRole = resolveNavRole(session.role, isActingDirector)
  const accessRole = isActingDirector ? 'principal' : session.role
  let membership: Membership | null = null
  if (session.role !== 'district' && session.schoolId) {
    membership = await readMembership(session.schoolId)
    const appPath = (await headers()).get('x-app-path') || ''
    if (appPath && !membershipAllows(appPath, membership)) redirect(membershipHome(membership) + '?upgrade=1')
  }

  if (requireRole && !hasRoleInList(accessRole, requireRole)) {
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
      membership={membership}
      membershipAd={membership&&isFreeMembership(membership)?await readLiveFreeScheduleAd():null}
    >
      {children}
    </LayoutClient>
  )
}
