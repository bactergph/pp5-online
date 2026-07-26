import { redirect } from 'next/navigation'

/** URL เก่าย้ายไปเมนูธุรการเสนอเซ็นใต้งานประจำชั้น */
export default function Page() {
  redirect('/classroom-admin/sign')
}
