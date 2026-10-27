import type { Metadata } from 'next'
import PublicWelcome from '@/components/auth/PublicWelcome'

export const metadata: Metadata = {
  title: 'จารย์เสก — จัดตารางเรียนฟรี และระบบงานวิชาการ ปพ.5 / ปพ.6',
  description: 'จัดตารางเรียน–ตารางสอนอัตโนมัติ เริ่มใช้ฟรีรองรับครูสูงสุด 25 คน พร้อมล็อกคาบ คาบคู่ กิจกรรม สอนรวม และส่งออก PDF ต่อยอดงานคะแนน เวลาเรียน และเอกสาร ปพ.5 / ปพ.6 สำหรับครูและโรงเรียน',
}

export default function HomePage() {
  return <PublicWelcome />
}
