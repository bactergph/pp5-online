import { requireAdminSettings } from '@/lib/settings-guard'

export default async function BackupSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSettings()
  return children
}
