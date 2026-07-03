import { redirect } from 'next/navigation'
import PeriodTimesEntry from '@/components/schedules/PeriodTimesEntry'
import { verifySession } from '@/lib/dal'
import { SCHEDULE_EDIT_ROLES } from '@/lib/schedules'

export default async function PeriodTimesPage() {
  const session = await verifySession()
  if (!SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])) {
    redirect('/schedules/class')
  }
  return <PeriodTimesEntry />
}
