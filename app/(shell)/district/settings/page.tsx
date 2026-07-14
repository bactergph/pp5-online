import { redirect } from 'next/navigation'

/** เลิกใช้ตั้งค่าสำนักงานเขต — ไปที่สมาชิกโรงเรียนแทน */
export default function DistrictSettingsRedirect() {
  redirect('/district/admins')
}
