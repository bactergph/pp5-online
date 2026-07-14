import ClassroomAdminEntry from '@/components/classroom-admin/ClassroomAdminEntry'

export default function Page() {
  return (
    <ClassroomAdminEntry
      mode="weightHeight"
      title="น้ำหนัก/ส่วนสูง"
      description="บันทึกน้ำหนักและส่วนสูงนักเรียนรายเดือน พร้อมคำนวณ BMI เบื้องต้น"
    />
  )
}
