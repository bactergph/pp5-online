import { SCHEDULE_VIEW_ROLES, SCHEDULE_EDIT_ROLES } from '@/lib/schedules'
import { requireShellRoles } from '@/lib/shell-guard'
import ScheduleNavigation from '@/components/schedules/ScheduleNavigation'

export default async function SchedulesLayout({ children }: { children: React.ReactNode }) {
  const session = await requireShellRoles(SCHEDULE_VIEW_ROLES)
  return <><ScheduleNavigation canEdit={SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])} />{children}</>
}
