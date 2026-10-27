import type { Metadata } from 'next'
import PublicWelcome from '@/components/auth/PublicWelcome'

export const metadata: Metadata = {
  title: 'จารย์เสก — ปพ.5 ปพ.6 ธุรการชั้นเรียน และจัดตารางเรียนฟรี',
  description: 'ระบบงานวิชาการสำหรับครูและโรงเรียน บันทึกคะแนนและเวลาเรียน จัดทำ ปพ.5 ปพ.6 ธุรการชั้นเรียน นำเข้า–ส่งออกข้อมูล พร้อมจัดตารางเรียน–ตารางสอนอัตโนมัติ เริ่มจัดตารางฟรี ครูสูงสุด 25 คน',
}

export default function HomePage() {
  return <PublicWelcome />
}
