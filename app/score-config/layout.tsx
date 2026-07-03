import AppLayout from '@/components/layout/AppLayout'

export default function ScoreConfigLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout title="สัดส่วนคะแนน" requireRole={['admin', 'district', 'academic_head', 'deputy_principal', 'teacher']}>
      {children}
    </AppLayout>
  )
}
