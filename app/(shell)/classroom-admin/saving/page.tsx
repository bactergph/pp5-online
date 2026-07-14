import ClassroomAdminEntry from '@/components/classroom-admin/ClassroomAdminEntry'

export default function Page() {
  return (
    <ClassroomAdminEntry
      mode="activity"
      activityType="saving"
      activityLabel="การออม"
      title="การออม"
      description="บันทึกจำนวนเงินออมทรัพย์รายวันของนักเรียน"
    />
  )
}
