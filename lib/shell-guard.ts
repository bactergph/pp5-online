import 'server-only'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { getSchoolShell } from '@/lib/school-shell'
import { hasRoleInList } from '@/lib/roles'

/** Role gate for nested layouts under the shared shell (no AppLayout remount). */
export async function requireShellRoles(roles: readonly string[] | string[]) {
  const session = await verifySession()
  let accessRole = session.role
  if (session.schoolId && session.role !== 'district') {
    const school = await getSchoolShell(session.schoolId)
    if (school?.acting_director_user_id === session.userId) accessRole = 'principal'
  }
  if (!hasRoleInList(accessRole, roles)) redirect('/dashboard')
  return session
}
