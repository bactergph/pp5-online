import { verifySession } from '@/lib/dal'
import { readMemberPlan } from '@/lib/member-plan'
import { readLiveFreeScheduleAd } from '@/lib/free-schedule-ad'
import FreeScheduleDesk from '@/components/schedules/FreeScheduleDesk'

export default async function FreeSchedulePage() {
  const session = await verifySession()
  if (!session.schoolId) {
    return <p style={{ color: '#52647c', fontWeight: 700 }}>ใช้ได้เฉพาะสมาชิกของโรงเรียน</p>
  }
  const [plan, ad] = await Promise.all([readMemberPlan(session.schoolId), readLiveFreeScheduleAd()])
  return <FreeScheduleDesk plan={plan} ad={ad} />
}
