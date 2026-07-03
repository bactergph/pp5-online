import AppLayout from '@/components/layout/AppLayout'
export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout title="เช็คเวลาเรียนรายวิชา">{children}</AppLayout>
}
