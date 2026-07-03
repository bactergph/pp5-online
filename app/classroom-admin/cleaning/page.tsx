import ClassroomAdminEntry from '@/components/classroom-admin/ClassroomAdminEntry'

export default function Page() {
  return (
    <ClassroomAdminEntry
      mode="activity"
      activityType="cleaning"
      activityLabel="ทำความสะอาดห้อง"
      title="ทำความสะอาดห้อง"
      description="บันทึกการทำความสะอาดห้องเรียนของนักเรียนรายวัน"
    />
  )
}
