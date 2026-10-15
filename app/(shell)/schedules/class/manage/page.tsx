import { redirect } from 'next/navigation'
import ClassScheduleEntry from '@/components/schedules/ClassScheduleEntry'
import DeviceScheduleUpload from '@/components/schedules/DeviceScheduleUpload'
import { verifySession } from '@/lib/dal'
import { readMemberPlan } from '@/lib/member-plan'
import { SCHEDULE_EDIT_ROLES } from '@/lib/schedules'

export default async function ClassScheduleManagePage() {
  const session = await verifySession()
  if (!SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])) {
    redirect('/schedules/class')
  }
  const memberPlan = session.schoolId ? await readMemberPlan(session.schoolId) : null
  return <>{memberPlan === 'pro' && <DeviceScheduleUpload />}<ClassScheduleEntry mode="manage" /></>
}
