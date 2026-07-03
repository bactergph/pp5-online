import AppLayout from '@/components/layout/AppLayout'

export default function DistrictLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout title="สำนักงานเขต" requireRole={['district']}>
      {children}
    </AppLayout>
  )
}
