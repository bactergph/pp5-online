import { SCHEDULE_VIEW_ROLES, SCHEDULE_EDIT_ROLES } from '@/lib/schedules'
import { headers } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { requireShellRoles } from '@/lib/shell-guard'
import ScheduleNavigation from '@/components/schedules/ScheduleNavigation'

export default async function SchedulesLayout({ children }: { children: React.ReactNode }) {
  // The local scheduler shares this parent layout but does not require a paid plan.
  const appPath = (await headers()).get('x-app-path') || ''
  if (appPath === '/schedules/device' || appPath.startsWith('/schedules/device/')) {
    await verifySession(true)
    return <>{children}</>
  }
  const session = await requireShellRoles(SCHEDULE_VIEW_ROLES)
  return <><ScheduleNavigation canEdit={SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])} />{children}</>
}
