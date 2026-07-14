import ClassroomAdminEntry from '@/components/classroom-admin/ClassroomAdminEntry'

export default function Page() {
  return (
    <ClassroomAdminEntry
      mode="activity"
      activityType="milk"
      activityLabel="ดื่มนม"
      title="ดื่มนม"
      description="บันทึกการดื่มนมโรงเรียนของนักเรียนรายวัน"
    />
  )
}
