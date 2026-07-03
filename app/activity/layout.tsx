import AppLayout from '@/components/layout/AppLayout'

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout title="ประวัติการใช้งาน">{children}</AppLayout>
}
