import { requireAdminSettings } from '@/lib/settings-guard'

export default async function TeacherActivitiesLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSettings()
  return children
}
