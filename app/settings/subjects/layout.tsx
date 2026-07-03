import { requireAcademicSettings } from '@/lib/settings-guard'

export default async function AcademicSettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAcademicSettings()
  return children
}
