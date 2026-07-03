import 'server-only'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { hasRoleInList } from '@/lib/roles'

const ACADEMIC_SETTINGS_ROLES = ['admin', 'district', 'academic_head', 'deputy_principal'] as const

export async function requireAdminSettings() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!['admin', 'district'].includes(session.role)) redirect('/settings/profile')
  return session
}

export async function requireAcademicSettings() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!hasRoleInList(session.role, ACADEMIC_SETTINGS_ROLES)) redirect('/settings/profile')
  return session
}
