import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

// หน้าหลัก: redirect ไป dashboard หรือ login ตาม session
export default async function HomePage() {
  const session = await getSession()
  if (session?.userId) {
    redirect('/dashboard')
  }
  redirect('/login')
}
