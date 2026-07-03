import ClassroomAdminEntry from '@/components/classroom-admin/ClassroomAdminEntry'

export default function Page() {
  return (
    <ClassroomAdminEntry
      mode="activity"
      activityType="brushing"
      activityLabel="แปรงฟัน"
      title="แปรงฟัน"
      description="บันทึกการแปรงฟันของนักเรียนรายวัน"
    />
  )
}
