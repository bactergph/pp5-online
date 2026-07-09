import { Suspense } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import '../report-fonts.css'

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout title="รายงาน">
      <Suspense fallback={null}>{children}</Suspense>
    </AppLayout>
  )
}
