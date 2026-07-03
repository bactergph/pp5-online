import AppLayout from '@/components/layout/AppLayout'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout title="ตั้งค่า">
      {children}
    </AppLayout>
  )
}
