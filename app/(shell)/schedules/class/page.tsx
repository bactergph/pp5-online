import OnlineScheduleProvider from '@/components/schedules/OnlineScheduleProvider'
import ClassScheduleEntry from '@/components/schedules/ClassScheduleEntry'

export default function ClassSchedulePage() {
  return <OnlineScheduleProvider><ClassScheduleEntry mode="view" /></OnlineScheduleProvider>
}
