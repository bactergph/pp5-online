import 'server-only'
import { applyClassroomLevels } from '@/app/(shell)/classrooms/actions'
import { createServerClient } from '@/lib/supabase'
import { isTimetableClassroom } from '@/lib/schedules'
import { emptyPlan, type SchedulePlan } from '@/lib/schedule-planning'
import { preparation } from '@/lib/schedule-preparation'

export function normalizeRoomNames(names: string[]) {
  const cleaned = names.map(name => name.trim())
  if (cleaned.length > 30) throw new Error('เปิดได้ไม่เกิน 30 ห้องต่อชั้น')
  if (cleaned.some(name => !name || name.length > 20 || /[\\/]/.test(name))) throw new Error('ชื่อห้องต้องมี 1–20 ตัวอักษร และห้ามมี /')
  if (new Set(cleaned.map(name => name.toLowerCase())).size !== cleaned.length) throw new Error('ชื่อห้องในชั้นเดียวกันซ้ำ')
  return cleaned
}

async function occupiedRoomIds(ids: string[]) {
  if (!ids.length) return new Set<string>()
  const db = createServerClient()
  const checks = await Promise.all(ids.map(async id => {
    const [students, subjects, slots] = await Promise.all([
      db.from('students').select('id', { count: 'exact', head: true }).eq('classroom_id', id),
      db.from('class_subjects').select('id', { count: 'exact', head: true }).eq('classroom_id', id),
      db.from('class_schedule_slots').select('id', { count: 'exact', head: true }).eq('classroom_id', id),
    ])
    for (const result of [students, subjects, slots]) if (result.error) throw new Error('ตรวจข้อมูลห้องเดิมไม่สำเร็จ')
    return (students.count || 0) + (subjects.count || 0) + (slots.count || 0) > 0 ? id : ''
  }))
  return new Set(checks.filter(Boolean))
}

/** Open levels, set how many rooms each has, and store the displayed room name. */
export async function saveTimetableRooms(yearId: string, term: number, levels: { level: string; names: string[] }[]) {
  if (term !== 1 && term !== 2) throw new Error('ภาคเรียนไม่ถูกต้อง')
  const current = await preparation(yearId, term)
  const normalized = levels.map(row => ({ level: row.level.trim(), names: normalizeRoomNames(row.names || []) }))
  if (!normalized.length || normalized.some(row => !row.level || !isTimetableClassroom(row.level) || normalized.filter(item => item.level === row.level).length > 1)) throw new Error('ระดับชั้นไม่ถูกต้อง')
  const wanted = new Map(normalized.map(row => [row.level, row.names.length]))
  const doomed = current.classrooms.filter(room => wanted.has(room.level) && room.room > (wanted.get(room.level) || 0))
  const busy = await occupiedRoomIds(doomed.map(room => room.id))
  const blocked = doomed.filter(room => busy.has(room.id)).map(room => `${room.level}/${current.plan.roomLabels?.[room.id]?.trim() || room.name || room.room}`)
  if (blocked.length) throw new Error(`ยังลบห้องเหล่านี้ไม่ได้ เพราะมีนักเรียน รายวิชา หรือตารางอยู่แล้ว: ${blocked.join(', ')}`)
  const applied = await applyClassroomLevels(yearId, normalized.map(row => ({ level: row.level, rooms: row.names.length })))
  if (applied.error) throw new Error(applied.error)
  if (applied.blocked?.length) throw new Error(`ยังลบห้องเหล่านี้ไม่ได้ เพราะมีนักเรียน: ${applied.blocked.join(', ')}`)

  const db = createServerClient()
  const year = await db.from('academic_years').select('school_id').eq('id', yearId).maybeSingle()
  if (year.error || !year.data) throw new Error('ไม่พบปีการศึกษา')
  const sessionRooms = await db.from('classrooms').select('id, level, room').eq('school_id', year.data.school_id).eq('academic_year_id', yearId)
  if (sessionRooms.error) throw new Error('โหลดห้องหลังบันทึกไม่สำเร็จ')
  const labels: Record<string, string> = { ...(current.plan.roomLabels || {}) }
  for (const row of normalized) {
    for (const old of current.classrooms.filter(room => room.level === row.level)) delete labels[old.id]
    const levelRooms = (sessionRooms.data || []).filter(room => room.level === row.level).sort((a, b) => a.room - b.room)
    levelRooms.forEach((room, index) => { labels[room.id] = row.names[index] || String(room.room) })
  }
  const plans = await db.from('schedule_plans').select('semester, config').eq('school_id', year.data.school_id).eq('academic_year_id', yearId).in('semester', [1, 2])
  if (plans.error) throw new Error('โหลดชื่อห้องเดิมไม่สำเร็จ')
  const terms = new Set<number>((plans.data || []).map(row => Number(row.semester)))
  terms.add(term)
  for (const semester of terms) {
    const previous = (plans.data || []).find(row => Number(row.semester) === semester)?.config || emptyPlan()
    const config = { ...previous, roomLabels: { ...labels } } as SchedulePlan
    const saved = await db.from('schedule_plans').upsert({
      school_id: year.data.school_id,
      academic_year_id: yearId,
      semester,
      config,
    }, { onConflict: 'school_id,academic_year_id,semester' })
    if (saved.error) throw new Error(saved.error.message)
  }
  return { created: applied.created || 0, deleted: applied.deleted || 0 }
}
