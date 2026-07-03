import AppLayout from '@/components/layout/AppLayout'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout title="หน้าหลัก">{children}</AppLayout>
}
