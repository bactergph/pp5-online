import type { Metadata } from 'next'
import PublicWelcome from '@/components/auth/PublicWelcome'

export const metadata: Metadata = {
  title: 'จารย์เสก — คะแนน เวลาเรียน และรายงาน ปพ.5 / ปพ.6',
  description: 'รู้จักจารย์เสก ระบบงานวิชาการสำหรับโรงเรียนประถมและมัธยม บันทึกคะแนน เวลาเรียน จัดตารางสอน และจัดทำรายงาน ปพ.5 / ปพ.6 พร้อมตัวอย่างและขั้นตอนสมัครใช้งาน',
}

export default function HomePage() {
  return <PublicWelcome />
}
