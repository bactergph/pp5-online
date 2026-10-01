import 'server-only'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'
import { SCHEDULE_EDIT_ROLES } from '@/lib/schedules'
import { lessonColumns, lessonKey, loadSchedule, persistSchedule, requireScheduleClass, type ScheduleSlot } from '@/lib/schedule-store'
import { solveSchoolSchedule } from '@/lib/schedule-solver'

async function context(yearId: string) {
  const session = await getSession()
  if (!session?.schoolId || !SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])) throw new Error('ไม่มีสิทธิ์แก้ไขตารางเรียน')
  return { session, data: await loadSchedule(session.schoolId, yearId) }
}
function cell(day: number, period: number) {
  if (!Number.isInteger(day) || day < 1 || day > 5 || !Number.isInteger(period) || period < 1 || period > 6) throw new Error('วันหรือคาบเรียนไม่ถูกต้อง')
}
async function commit(ctx: Awaited<ReturnType<typeof context>>, year: string, rows: ScheduleSlot[], description: string, unlock = false) {
  await persistSchedule(ctx.session.schoolId, year, ctx.data.slots, rows, unlock)
  await logActivity({ actor: ctx.session, schoolId: ctx.session.schoolId, action: 'update', module: 'schedules', targetType: 'class_schedule', description })
}
export async function saveCell(roomId: string, year: string, day: number, period: number, lesson: string | null, note: string | null) {
  cell(day, period)
  const ctx = await context(year)
  requireScheduleClass(ctx.data, roomId)
  const current = ctx.data.slots.find(s => s.classroom_id === roomId && s.day_of_week === day && s.period === period)
  if (current?.locked) throw new Error('กรุณาปลดล็อกคาบก่อนแก้ไข')
  if (lesson && !ctx.data.lessons.some(l => l.id === lesson && l.classroomId === roomId)) throw new Error('ไม่พบรายวิชาหรือกิจกรรมในห้องนี้')
  const rows = ctx.data.slots.filter(s => s !== current)
  if (lesson || note?.trim()) rows.push({ classroom_id: roomId, academic_year_id: year, day_of_week: day, period, ...lessonColumns(lesson), note: lesson ? null : note?.trim() || null, locked: false })
  await commit(ctx, year, rows, `แก้ไขตารางเรียน วัน ${day} คาบ ${period}`)
  return { ok: true }
}
export async function toggleLock(roomId: string, year: string, day: number, period: number) {
  cell(day, period)
  const ctx = await context(year)
  requireScheduleClass(ctx.data, roomId)
  const existing = ctx.data.slots.find(s => s.classroom_id === roomId && s.day_of_week === day && s.period === period)
  const locked = !existing?.locked
  const rows = ctx.data.slots.filter(s => s !== existing)
  rows.push({ ...(existing || { classroom_id: roomId, academic_year_id: year, day_of_week: day, period, class_subject_id: null, activity_id: null, note: null }), locked })
  await commit(ctx, year, rows, `${locked ? 'ล็อก' : 'ปลดล็อก'}คาบเรียน`, true)
  return { locked }
}
export async function clearRoom(roomId: string, year: string) {
  const ctx = await context(year)
  requireScheduleClass(ctx.data, roomId)
  await commit(ctx, year, ctx.data.slots.filter(s => s.classroom_id !== roomId || s.locked), 'ล้างคาบที่ไม่ล็อกในห้องเรียน')
  return { ok: true }
}
export async function copyRoom(from: string, to: string, year: string) {
  if (from === to) throw new Error('กรุณาเลือกห้องต้นทางต่างจากห้องปลายทาง')
  const ctx = await context(year)
  requireScheduleClass(ctx.data, from); requireScheduleClass(ctx.data, to)
  const targets = ctx.data.lessons.filter(l => l.classroomId === to)
  const locked = ctx.data.slots.filter(s => s.classroom_id === to && s.locked)
  const rows = ctx.data.slots.filter(s => s.classroom_id !== to || s.locked)
  let copied = 0
  for (const s of ctx.data.slots.filter(s => s.classroom_id === from)) {
    if (locked.some(l => l.day_of_week === s.day_of_week && l.period === s.period)) continue
    const source = ctx.data.lessons.find(l => l.id === lessonKey(s))
    const target = source ? targets.find(l => l.subjectId === source.subjectId && l.activity === source.activity) : null
    if (source && !target) throw new Error(`ห้องปลายทางไม่มี ${source.name} กรุณาเพิ่มรายวิชา/กิจกรรมก่อนคัดลอก`)
    rows.push({ ...s, classroom_id: to, ...lessonColumns(target?.id || null), locked: false }); copied++
  }
  if (!copied) throw new Error('ไม่มีคาบให้คัดลอก หรือคาบปลายทางถูกล็อกทั้งหมด')
  await commit(ctx, year, rows, `คัดลอกตารางเรียน ${copied} คาบ`)
  return { ok: true, copied }
}
export async function autoSchedule(year: string, roomId: string | null, clearFirst: boolean) {
  const ctx = await context(year)
  if (roomId) requireScheduleClass(ctx.data, roomId)
  const scope = new Set(roomId ? [roomId] : ctx.data.classrooms.filter(c => ctx.data.lessons.some(l => l.classroomId === c.id)).map(c => c.id))
  if (!scope.size) throw new Error('ยังไม่มีห้องเรียนที่กำหนดรายวิชาหรือกิจกรรมในปีนี้')
  const skipped = roomId ? [] : ctx.data.classrooms.filter(c => !scope.has(c.id)).map(c => `${c.level}/${c.room}`)
  for (const room of ctx.data.classrooms.filter(c => scope.has(c.id))) {
    if (!ctx.data.lessons.some(l => l.classroomId === room.id)) throw new Error(`${room.level}/${room.room}: ยังไม่กำหนดรายวิชาและครูผู้สอน`)
  }
  const retained = ctx.data.slots.filter(s => !scope.has(s.classroom_id) || s.locked || !clearFirst)
  const outsideCounts = new Map<string, number>()
  for (const s of retained.filter(s => !scope.has(s.classroom_id))) {
    const id = lessonKey(s); if (id) outsideCounts.set(id, (outsideCounts.get(id) || 0) + 1)
  }
  const lessons = ctx.data.lessons.map(l => ({ ...l, count: scope.has(l.classroomId) ? l.count : outsideCounts.get(l.id) || 0 }))
  const result = solveSchoolSchedule(lessons, retained.filter(s => s.locked || lessonKey(s) || s.note).map(s => ({ classroomId: s.classroom_id, lessonId: lessonKey(s), day: s.day_of_week, period: s.period })))
  if (result.error) throw new Error(result.error)
  const rows = retained.filter(s => s.locked || lessonKey(s) || s.note)
  for (const a of result.assignments) rows.push({ classroom_id: a.classroomId, academic_year_id: year, day_of_week: a.day, period: a.period, ...lessonColumns(a.lessonId), note: null, locked: false })
  await commit(ctx, year, rows, `จัดตาราง${roomId ? 'รายห้อง' : 'ทั้งโรงเรียน'} ${result.assignments.length} คาบ`)
  return { ok: true, assigned: result.assignments.length, classrooms: scope.size, skipped }
}

export async function activityOptions(year: string, roomId: string) {
  const ctx = await context(year)
  requireScheduleClass(ctx.data, roomId)
  const db = createServerClient()
  const [settings, teachers, offerings] = await Promise.all([
    db.from('evaluation_settings').select('id,label,hours_per_year').eq('school_id', ctx.session.schoolId!).eq('kind', 'activities').eq('is_active', true).order('sort_order'),
    db.from('users').select('id,prefix,full_name').eq('school_id', ctx.session.schoolId!).eq('is_active', true).in('role', ['teacher','academic_head','deputy_principal','principal','admin']).order('full_name'),
    db.from('class_schedule_activities').select('id,evaluation_setting_id,teacher_id,weekly_periods').eq('classroom_id', roomId).eq('academic_year_id', year),
  ])
  for (const r of [settings, teachers, offerings]) if (r.error) throw new Error(r.error.message)
  return { settings: settings.data || [], teachers: teachers.data || [], offerings: offerings.data || [] }
}
export async function saveActivity(year: string, roomId: string, settingId: string, teacherId: string, count: number) {
  const ctx = await context(year)
  requireScheduleClass(ctx.data, roomId)
  const opts = await activityOptions(year, roomId)
  if (!opts.settings.some(s => s.id === settingId) || !opts.teachers.some(t => t.id === teacherId) || !Number.isInteger(count) || count < 0 || count > 30) throw new Error('กิจกรรม ครู หรือจำนวนคาบไม่ถูกต้อง')
  const existing = opts.offerings.find(a => a.evaluation_setting_id === settingId)
  if (existing && ctx.data.slots.some(s => s.activity_id === existing.id)) throw new Error('กิจกรรมนี้มีในตารางแล้ว กรุณานำคาบกิจกรรมออกจากตารางก่อนเปลี่ยนครูหรือจำนวนคาบ')
  const { error } = await createServerClient().from('class_schedule_activities').upsert({ classroom_id: roomId, academic_year_id: year, evaluation_setting_id: settingId, teacher_id: teacherId, weekly_periods: count }, { onConflict: 'classroom_id,academic_year_id,evaluation_setting_id' })
  if (error) throw new Error(error.message)
  return { ok: true }
}
