import { Suspense } from 'react'
import '../report-fonts.css'
import AppLayout from '@/components/layout/AppLayout'

export default function ClassroomAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout title="ธุรการชั้นเรียน">
      <Suspense fallback={null}>{children}</Suspense>
    </AppLayout>
  )
}
