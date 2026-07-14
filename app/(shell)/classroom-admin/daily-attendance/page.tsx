import ClassroomAdminEntry from '@/components/classroom-admin/ClassroomAdminEntry'

export default function Page() {
  return (
    <ClassroomAdminEntry
      mode="attendance"
      title="เวลาเรียนรายวัน"
      description="บันทึกการมาเรียนรายวันของนักเรียน (มา / ลาป่วย / ลากิจ / ขาด)"
    />
  )
}
