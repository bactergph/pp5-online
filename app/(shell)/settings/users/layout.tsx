import { requireAdminSettings } from '@/lib/settings-guard'
import { redirect } from 'next/navigation'

export default async function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSettings()
  if (!session.schoolId) redirect(session.role==='district'?'/district/admins':'/settings/school')
  return children
}
