import OnlineScheduleProvider from '@/components/schedules/OnlineScheduleProvider'
import TeacherActivitiesSettings from '@/components/schedules/TeacherActivitiesSettings'

export default function TeacherActivitiesPage() {
  return (
    <OnlineScheduleProvider>
      <TeacherActivitiesSettings />
    </OnlineScheduleProvider>
  )
}
