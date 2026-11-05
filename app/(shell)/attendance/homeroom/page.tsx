import ClassroomAdminEntry from '@/components/classroom-admin/ClassroomAdminEntry'

export default function Page() {
  return <ClassroomAdminEntry
    mode="attendance"
    educationBand="secondary"
    title="เช็กชื่อโฮมรูม"
    description="บันทึกการมาเรียนรายวันของห้องประจำชั้น ม.1–ม.6 · มา ลา ป่วย ขาด พร้อมสรุปประจำเดือน แยกจากเวลาเรียนรายวิชา"
  />
}
