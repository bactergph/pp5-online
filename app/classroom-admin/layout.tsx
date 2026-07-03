import AppLayout from '@/components/layout/AppLayout'
export default function ClassroomAdminLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout title="ธุรการชั้นเรียน">{children}</AppLayout>
}
