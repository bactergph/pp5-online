import ClassroomAdminEntry from '@/components/classroom-admin/ClassroomAdminEntry'

export default function Page() {
  return <ClassroomAdminEntry
    mode="attendance"
    title="เช็กชื่อโฮมรูม"
    description="บันทึกการมาเรียนรายวันของห้องประจำชั้น ทั้งประถมและมัธยม · มา ลา ป่วย ขาด และบันทึกเรื่องที่อบรมของแต่ละวันที่มาเรียน"
  />
}
