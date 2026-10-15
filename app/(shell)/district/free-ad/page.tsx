import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { readFreeScheduleAdSettings } from '@/lib/free-schedule-ad'
import FreeAdEditor from './FreeAdEditor'

export default async function FreeAdPage() {
  const session = await getSession()
  if (!session || session.role !== 'district') redirect('/dashboard')
  const { ad, error } = await readFreeScheduleAdSettings()
  return <FreeAdEditor initial={ad} loadError={error} />
}
