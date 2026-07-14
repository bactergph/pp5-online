import { redirect } from 'next/navigation'

/** เลิกใช้ผลลัพธ์รวม */
export default function DistrictResultsRedirect() {
  redirect('/dashboard')
}
