import { redirect } from 'next/navigation'

/** เลิกใช้หน้าภาพรวมมัธยม */
export default function SecondaryOverviewRedirect() {
  redirect('/scores/secondary')
}
