import ClassroomAdminEntry from '@/components/classroom-admin/ClassroomAdminEntry'

export default function Page() {
  return (
    <ClassroomAdminEntry
      mode="activity"
      activityType="lunch"
      activityLabel="อาหารกลางวัน"
      title="อาหารกลางวัน"
      description="บันทึกการรับประทานอาหารกลางวันของนักเรียนรายวัน"
    />
  )
}
