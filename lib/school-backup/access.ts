import 'server-only'
import { getSession, type SessionPayload } from '@/lib/session'
import { readMembership } from '@/lib/member-plan'
import { isFreeMembership } from '@/lib/membership'

export type BackupActor = SessionPayload & { schoolId: string }

export async function requireBackupActor(): Promise<{ actor: BackupActor } | { error: string; status: number }> {
  const session = await getSession()
  if (!session?.userId || !session.schoolId || session.mustChangePassword) {
    return { error: 'ไม่มีสิทธิ์สำรองข้อมูล', status: 401 }
  }
  if (!['admin', 'district'].includes(session.role)) {
    return { error: 'เฉพาะผู้ดูแลโรงเรียนที่สำรองหรือนำเข้าข้อมูลได้', status: 403 }
  }
  if (session.role !== 'district' && isFreeMembership(await readMembership(session.schoolId))) {
    return { error: 'สมาชิกฟรีใช้ได้เฉพาะจัดตารางบนอุปกรณ์', status: 403 }
  }
  return { actor: { ...session, schoolId: session.schoolId } }
}
