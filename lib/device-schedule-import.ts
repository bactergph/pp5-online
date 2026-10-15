import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { currentScheduleSemester } from '@/lib/schedule-helpers'
import { parseDeviceRoom, type DeviceScheduleUpload } from '@/lib/device-schedule-payload'

const REPLACE_ROLES = new Set(['admin', 'academic_head', 'deputy_principal', 'district'])

export async function storeDeviceSchedule(schoolId: string, userId: string, role: string, plan: DeviceScheduleUpload, hash: string, copyToOnline = false) {
  const db = createServerClient()
  const existing = await db.from('device_schedule_uploads').select('content_hash').eq('school_id', schoolId).maybeSingle()
  if (existing.error) {
    const missing = ['PGRST204', '42703', '42P01'].includes(existing.error.code || '') || existing.error.message.includes('device_schedule_uploads') || existing.error.message.includes('schema cache')
    return { error: missing ? 'ยังไม่มีตารางรับข้อมูลจากเครื่อง — รันไฟล์ supabase/migrations/071_device_schedule_uploads.sql' : existing.error.message }
  }
  if (existing.data?.content_hash === hash) return { error: null, stored: true, replaced: false, copied: false, message: 'ข้อมูลชุดนี้ขึ้นระบบแล้ว' }
  if (existing.data && !REPLACE_ROLES.has(role)) return { error: null, stored: false, replaced: false, copied: false, message: 'มีสำเนาจากเครื่องอื่นบนระบบแล้ว' }
  const saved = await db.from('device_schedule_uploads').upsert({
    school_id: schoolId,
    payload: plan,
    content_hash: hash,
    uploaded_by: userId,
    uploaded_at: new Date().toISOString(),
  })
  if (saved.error) return { error: saved.error.message }
  const copied = copyToOnline ? await copyOntoEmptyTimetable(schoolId, plan) : { copied: false, slots: 0, kept: false }
  return {
    error: null,
    stored: true,
    replaced: Boolean(existing.data),
    copied: copied.copied,
    message: copied.copied
      ? `ส่งครู ${plan.teachers.length} คน ห้อง ${plan.rooms.length} ห้อง วิชา ${plan.subjects.length} รายการ และ ${copied.slots} คาบขึ้นตารางออนไลน์แล้ว`
      : copied.kept
        ? 'ส่งสำเนาจากเครื่องขึ้นระบบแล้ว ตารางออนไลน์เดิมของโรงเรียนยังอยู่'
        : 'ส่งสำเนาจากเครื่องขึ้นระบบแล้ว',
  }
}

async function copyOntoEmptyTimetable(schoolId: string, plan: DeviceScheduleUpload) {
  const db = createServerClient()
  const year = await db.from('academic_years').select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle()
  if (!year.data?.id) return { copied: false, slots: 0, kept: false }
  const rooms = await db.from('classrooms').select('id').eq('school_id', schoolId).eq('academic_year_id', year.data.id)
  const roomKeys = (rooms.data || []).map(room => room.id)
  if (roomKeys.length) {
    const occupied = await db.from('class_schedule_slots').select('id').in('classroom_id', roomKeys).limit(1)
    if (occupied.error || occupied.data?.length) return { copied: false, slots: 0, kept: true }
  }
  const roomIds = new Map<string, string>()
  for (const [index, room] of plan.rooms.entries()) {
    const parsed = parseDeviceRoom(room.label, index)
    const found = await db.from('classrooms').select('id').eq('school_id', schoolId).eq('academic_year_id', year.data.id).eq('level', parsed.level).eq('room', parsed.room).maybeSingle()
    if (found.data?.id) {
      roomIds.set(room.id, found.data.id)
      continue
    }
    const created = await db.from('classrooms').insert({ school_id: schoolId, academic_year_id: year.data.id, level: parsed.level, room: parsed.room }).select('id').maybeSingle()
    if (created.data?.id) roomIds.set(room.id, created.data.id)
  }
  const teachers = new Map(plan.teachers.map(teacher => [teacher.id, teacher.name]))
  const subjects = new Map(plan.subjects.map(subject => [subject.id, subject]))
  const semester = currentScheduleSemester()
  let slots = 0
  for (const cell of plan.timetable) {
    const classroomId = roomIds.get(cell.classroomId)
    const subject = subjects.get(cell.subjectId)
    if (!classroomId || !subject) continue
    const note = `${subject.name} · ${teachers.get(subject.teacherId) || ''}`.trim().slice(0, 200)
    const inserted = await db.from('class_schedule_slots').insert({
      classroom_id: classroomId,
      academic_year_id: year.data.id,
      semester,
      day_of_week: cell.day,
      period: cell.period,
      class_subject_id: null,
      activity_id: null,
      note,
      locked: false,
    }).select('id').maybeSingle()
    if (inserted.data?.id) slots += 1
  }
  return { copied: roomIds.size > 0, slots, kept: false }
}
