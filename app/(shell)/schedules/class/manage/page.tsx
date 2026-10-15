import { redirect } from 'next/navigation'
import ClassScheduleEntry from '@/components/schedules/ClassScheduleEntry'
import { verifySession } from '@/lib/dal'
import { SCHEDULE_EDIT_ROLES } from '@/lib/schedules'

export default async function ClassScheduleManagePage() {
  const session = await verifySession()
  if (!SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])) {
    redirect('/schedules/class')
  }
  return <ClassScheduleEntry mode="manage" />
}
