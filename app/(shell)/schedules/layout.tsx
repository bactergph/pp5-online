import { SCHEDULE_VIEW_ROLES } from '@/lib/schedules'
import { requireShellRoles } from '@/lib/shell-guard'

export default async function SchedulesLayout({ children }: { children: React.ReactNode }) {
  await requireShellRoles(SCHEDULE_VIEW_ROLES)
  return children
}
