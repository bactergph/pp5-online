import { Suspense } from 'react'
import '../report-fonts.css'
import AppLayout from '@/components/layout/AppLayout'

export default function ExportLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout title="Export">
      <Suspense fallback={null}>{children}</Suspense>
    </AppLayout>
  )
}
