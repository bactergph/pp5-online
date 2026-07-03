import { redirect } from 'next/navigation'

/** Phase 1: ตารางสอนดึงจากตารางเรียน — จัดการที่หน้าตารางเรียนเท่านั้น */
export default function TeachingScheduleManageRedirect() {
  redirect('/schedules/class/manage')
}
