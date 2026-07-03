import { requireAdminSettings } from '@/lib/settings-guard'

export default async function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSettings()
  return children
}
