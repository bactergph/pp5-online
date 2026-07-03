import AppLayout from '@/components/layout/AppLayout'
import { SCHEDULE_VIEW_ROLES } from '@/lib/schedules'

export default function SchedulesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout title="ตารางเรียน / ตารางสอน" requireRole={[...SCHEDULE_VIEW_ROLES]}>
      {children}
    </AppLayout>
  )
}
