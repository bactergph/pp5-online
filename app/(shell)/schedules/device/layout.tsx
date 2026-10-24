import { verifySession } from '@/lib/dal'
import { readMembership } from '@/lib/member-plan'
import FreeScheduleDesk from '@/components/schedules/FreeScheduleDesk'

// Keep the local database session and unfinished draft mounted across menu pages.
export default async function FreeScheduleLayout({children}:{children:React.ReactNode}) {
  const session = await verifySession(true)
  if (!session.schoolId) return <p>ใช้ได้เฉพาะสมาชิกที่เข้าสู่ระบบแล้ว</p>
  const membership = await readMembership(session.schoolId)
  const tier = membership.kind === 'school' ? 'school' : membership.plan
  return <><FreeScheduleDesk tier={tier} teacherLimit={membership.freeTeacherLimit} registrationOwner={session.userId}/>{children}</>
}
