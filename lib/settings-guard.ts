import 'server-only'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { hasRoleInList } from '@/lib/roles'

const ACADEMIC_SETTINGS_ROLES = ['admin', 'district', 'academic_head', 'deputy_principal'] as const

export async function requireAdminSettings() {
  const session = await verifySession()
  if (!['admin', 'district'].includes(session.role)) redirect('/settings/profile')
  return session
}

export async function requireAcademicSettings() {
  const session = await verifySession()
  if (!hasRoleInList(session.role, ACADEMIC_SETTINGS_ROLES)) redirect('/settings/profile')
  return session
}
