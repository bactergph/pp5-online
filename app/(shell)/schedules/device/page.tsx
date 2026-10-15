import { verifySession } from '@/lib/dal'
import { readMembership } from '@/lib/member-plan'
import { readLiveFreeScheduleAd } from '@/lib/free-schedule-ad'
import FreeScheduleDesk from '@/components/schedules/FreeScheduleDesk'

export default async function FreeSchedulePage() {
  const session = await verifySession()
  if (!session.schoolId) {
    return <p style={{ color: '#52647c', fontWeight: 700 }}>ใช้ได้เฉพาะสมาชิกที่เข้าสู่ระบบแล้ว</p>
  }
  const membership = await readMembership(session.schoolId)
  const tier = membership.kind === 'school' ? 'school' : membership.plan
  const ad = tier === 'free' ? await readLiveFreeScheduleAd() : null
  return <FreeScheduleDesk tier={tier} ad={ad} />
}
