'use server'
import { verifySession } from '@/lib/dal'
import { readMemberPlan } from '@/lib/member-plan'
import { logActivity } from '@/lib/audit'
import { storeDeviceSchedule } from '@/lib/device-schedule-import'
import { cleanDeviceSchedule, deviceScheduleHasContent, deviceScheduleHash, type DeviceScheduleUpload } from '@/lib/device-schedule-payload'

export async function uploadDeviceSchedule(raw: DeviceScheduleUpload) {
  const session = await verifySession()
  if (!session.schoolId) return { error: 'ใช้ได้เฉพาะสมาชิกของโรงเรียน' }
  const planName = await readMemberPlan(session.schoolId)
  if (planName !== 'pro') return { error: null, stored: false, message: '' }
  const plan = cleanDeviceSchedule(raw)
  if (!deviceScheduleHasContent(plan)) return { error: null, stored: false, message: '' }
  const hash = deviceScheduleHash(plan)
  const result = await storeDeviceSchedule(session.schoolId, session.userId, session.role, plan, hash)
  if (!result.error && result.stored) {
    await logActivity({
      actor: session,
      schoolId: session.schoolId,
      action: 'update',
      module: 'device_schedule_uploads',
      targetType: 'device_schedule',
      targetId: session.schoolId,
      targetLabel: 'ตารางจากเครื่องสมาชิก',
      description: result.message || 'ส่งตารางจากเครื่องขึ้นระบบ',
      metadata: { hash, teachers: plan.teachers.length, rooms: plan.rooms.length, subjects: plan.subjects.length, cells: plan.timetable.length },
    })
  }
  return { ...result, hash }
}
