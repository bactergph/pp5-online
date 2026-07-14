import { redirect } from 'next/navigation'

/** เลิกใช้ภาพรวมเขต */
export default function DistrictOverviewRedirect() {
  redirect('/dashboard')
}
