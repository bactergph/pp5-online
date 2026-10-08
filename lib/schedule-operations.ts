import 'server-only'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { logActivity } from '@/lib/audit'
import { SCHEDULE_EDIT_ROLES } from '@/lib/schedules'
import { lessonColumns, lessonKey, loadSchedule, loadScheduleConstraints, persistSchedule, requireScheduleClass, type ScheduleSlot } from '@/lib/schedule-store'
import { solveSchoolSchedule } from '@/lib/schedule-solver'
import { LEARNER_DEVELOPMENT_KEY } from '@/lib/schedule-activity'

async function context(yearId: string, semester = 1) {
  const session = await getSession()
  if (!session?.schoolId || !SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])) throw new Error('ไม่มีสิทธิ์แก้ไขตารางเรียน')
  const [data,constraints] = await Promise.all([loadSchedule(session.schoolId,yearId,semester),loadScheduleConstraints(session.schoolId,yearId,semester)])
  return { session, semester, data, constraints }
}
function cell(day: number, period: number) {
  if (!Number.isInteger(day) || day < 1 || day > 5 || !Number.isInteger(period) || period < 1 || period > 8) throw new Error('วันหรือคาบเรียนไม่ถูกต้อง')
}
async function commit(ctx: Awaited<ReturnType<typeof context>>, year: string, rows: ScheduleSlot[], description: string, unlock = false) {
  for (const lesson of ctx.data.lessons) {
    const used = rows.filter(s=>s.classroom_id===lesson.classroomId&&lessonKey(s)===lesson.id).length
    const before = ctx.data.slots.filter(s=>s.classroom_id===lesson.classroomId&&lessonKey(s)===lesson.id).length
    const target = lesson.activity ? 1 : lesson.count
    if (used>target && used>before) throw new Error(`${lesson.label} ลงครบ ${target} คาบต่อสัปดาห์แล้ว กรุณานำคาบเดิมออกก่อนเพิ่ม`)
  }
  await persistSchedule(ctx.session.schoolId, year, ctx.data.slots, rows, unlock, ctx.semester)
  await logActivity({ actor: ctx.session, schoolId: ctx.session.schoolId, action: 'update', module: 'schedules', targetType: 'class_schedule', description })
}
export async function saveCell(roomId: string, year: string, day: number, period: number, lesson: string | null, note: string | null, semester = 1) {
  cell(day, period)
  const ctx = await context(year, semester)
  if (period > ctx.constraints.periodCount) throw new Error('คาบนี้ยังไม่ได้ตั้งเวลาเรียน')
  const teacherId = ctx.data.lessons.find(l=>l.id===lesson)?.teacherId
  if (teacherId && ctx.constraints.blocks.some(b=>b.teacherId===teacherId && b.day===day && b.period===period)) throw new Error('ครูล็อกคาบว่างนี้ไว้ กรุณาเลือกคาบอื่น')
  requireScheduleClass(ctx.data, roomId)
  const current = ctx.data.slots.find(s => s.classroom_id === roomId && s.day_of_week === day && s.period === period)
  if (current?.locked) throw new Error('กรุณาปลดล็อกคาบก่อนแก้ไข')
  if (lesson && !ctx.data.lessons.some(l => l.id === lesson && l.classroomId === roomId && l.selectable !== false)) throw new Error('ไม่พบรายวิชาหรือกิจกรรมในห้องนี้')
  const rows = ctx.data.slots.filter(s => s !== current)
  if (lesson || note?.trim()) rows.push({ classroom_id: roomId, academic_year_id: year, day_of_week: day, period, ...lessonColumns(lesson), note: lesson ? null : note?.trim() || null, locked: false })
  await commit(ctx, year, rows, `แก้ไขตารางเรียน วัน ${day} คาบ ${period}`)
  return { ok: true }
}
export async function toggleLock(roomId: string, year: string, day: number, period: number, semester = 1) {
  cell(day, period)
  const ctx = await context(year, semester)
  requireScheduleClass(ctx.data, roomId)
  const existing = ctx.data.slots.find(s => s.classroom_id === roomId && s.day_of_week === day && s.period === period)
  const locked = !existing?.locked
  const rows = ctx.data.slots.filter(s => s !== existing)
  rows.push({ ...(existing || { classroom_id: roomId, academic_year_id: year, day_of_week: day, period, class_subject_id: null, activity_id: null, note: null }), locked })
  await commit(ctx, year, rows, `${locked ? 'ล็อก' : 'ปลดล็อก'}คาบเรียน`, true)
  return { locked }
}

export async function teacherAvailability(year: string, semester = 1) {
  const ctx = await context(year,semester)
  const {data,error} = await createServerClient().from('users').select('id,prefix,full_name').eq('school_id',ctx.session.schoolId).eq('is_active',true).in('role',['teacher','academic_head','deputy_principal','principal','admin']).order('full_name')
  if (error) throw new Error(error.message)
  return {quotas:ctx.data.lessons.filter(l=>l.teacherId).map(l=>({id:l.id,teacherId:l.teacherId,label:l.label,activity:l.activity,target:l.activity?1:l.count,used:ctx.data.slots.filter(s=>s.classroom_id===l.classroomId&&lessonKey(s)===l.id).length})),teachers:(data||[]).map(t=>({id:t.id,name:`${t.prefix||''} ${t.full_name}`.trim()})),blocks:ctx.constraints.blocks,supported:ctx.constraints.blocksSupported,lessons:ctx.data.lessons.filter(l=>!l.activity&&l.selectable!==false).map(l=>({id:l.id,teacherId:l.teacherId,classroomId:l.classroomId,label:l.label})),slots:ctx.data.slots.map(s=>({classroomId:s.classroom_id,day:s.day_of_week,period:s.period,lessonId:lessonKey(s),locked:s.locked})),busy:ctx.data.slots.flatMap(s=>{const l=ctx.data.lessons.find(l=>l.id===lessonKey(s));return l?.teacherId?[{teacherId:l.teacherId,day:s.day_of_week,period:s.period,label:l.label,classroomId:s.classroom_id,lessonId:l.id,locked:s.locked}]:[]})}
}
export async function editTeacherCell(year: string, semester: number, teacherId: string, roomId: string, day: number, period: number, expectedLesson: string|null, lessonId: string|null) {
  cell(day,period)
  const ctx=await context(year,semester)
  requireScheduleClass(ctx.data,roomId)
  const current=ctx.data.slots.find(s=>s.classroom_id===roomId&&s.day_of_week===day&&s.period===period)
  if ((current?lessonKey(current):null)!==expectedLesson) throw new Error('คาบนี้ถูกแก้ไขแล้ว กรุณาโหลดตารางใหม่')
  if(current?.locked)throw new Error('กรุณาปลดล็อกคาบเรียนก่อนแก้ไข')
  const old=current&&ctx.data.lessons.find(l=>l.id===lessonKey(current))
  if(current&&(!old||old.teacherId!==teacherId))throw new Error('คาบนี้ไม่ใช่คาบของครูที่เลือก')
  const next=lessonId&&ctx.data.lessons.find(l=>l.id===lessonId&&l.classroomId===roomId&&l.teacherId===teacherId&&l.selectable!==false)
  if(lessonId&&!next)throw new Error('รายวิชานี้ไม่ได้กำหนดให้ครูสอนในห้องที่เลือก')
  if(lessonId&&ctx.constraints.blocks.some(b=>b.teacherId===teacherId&&b.day===day&&b.period===period))throw new Error('กรุณาปลดล็อกคาบว่างของครูก่อนเลือกวิชา')
  if(period>ctx.constraints.periodCount)throw new Error('คาบนี้ยังไม่ได้ตั้งเวลาเรียน')
  const rows=ctx.data.slots.filter(s=>s!==current)
  if(lessonId)rows.push({classroom_id:roomId,academic_year_id:year,day_of_week:day,period,...lessonColumns(lessonId),note:null,locked:false})
  await commit(ctx,year,rows,lessonId?'เปลี่ยนวิชาจากตารางสอนครู':'นำวิชาออกจากตารางสอนครู')
  return {ok:true}
}
export async function setTeacherBlock(year: string, semester: number, teacherId: string, day: number, period: number, blocked: boolean) {
  cell(day,period)
  const ctx = await context(year,semester)
  if (period>ctx.constraints.periodCount) throw new Error('คาบนี้ยังไม่ได้ตั้งเวลาเรียน')
  if (!ctx.constraints.blocksSupported) throw new Error('กรุณารันฐานข้อมูล 058_schedule_eight_periods_teacher_blocks.sql ก่อน')
  const {error} = await createServerClient().rpc('set_schedule_teacher_block',{p_school_id:ctx.session.schoolId,p_year_id:year,p_semester:semester,p_teacher_id:teacherId,p_day:day,p_period:period,p_blocked:blocked})
  if (error) throw new Error(error.message)
  await logActivity({actor:ctx.session,schoolId:ctx.session.schoolId,action:'update',module:'schedules',targetType:'teacher_availability',description:`${blocked?'ล็อก':'ปลดล็อก'}คาบว่างครู วัน ${day} คาบ ${period}`})
  return {ok:true}
}
export async function clearRoom(roomId: string, year: string, semester = 1) {
  const ctx = await context(year, semester)
  requireScheduleClass(ctx.data, roomId)
  await commit(ctx, year, ctx.data.slots.filter(s => s.classroom_id !== roomId || s.locked), 'ล้างคาบที่ไม่ล็อกในห้องเรียน')
  return { ok: true }
}
export async function clearScope(year:string,semester:number,scope:'room'|'level'|'school',roomId:string) {
  const ctx=await context(year,semester)
  if(!['room','level','school'].includes(scope))throw new Error('ขอบเขตการล้างไม่ถูกต้อง')
  const room=requireScheduleClass(ctx.data,roomId)
  const rooms=ctx.data.classrooms.filter(c=>scope==='school'||(scope==='level'?c.level===room.level:c.id===room.id))
  const ids=new Set(rooms.map(c=>c.id))
  const removed=ctx.data.slots.filter(s=>ids.has(s.classroom_id)&&!s.locked)
  await commit(ctx,year,ctx.data.slots.filter(s=>!ids.has(s.classroom_id)||s.locked),`ล้างตาราง ${scope==='school'?'ทั้งโรงเรียน':scope==='level'?`ระดับชั้น ${room.level}`:'รายห้อง'} · ${rooms.length} ห้อง · ${removed.length} คาบ`)
  return {rooms:rooms.length,removed:removed.length}
}
export async function clearTeacher(year:string,semester:number,teacherId:string) {
  const ctx=await context(year,semester)
  if(!teacherId)throw new Error('กรุณาเลือกครู')
  const lessonIds=new Set(ctx.data.lessons.filter(l=>l.teacherId===teacherId&&!l.activity).map(l=>l.id))
  const removed=ctx.data.slots.filter(s=>!s.locked&&lessonIds.has(lessonKey(s)||''))
  await commit(ctx,year,ctx.data.slots.filter(s=>s.locked||!lessonIds.has(lessonKey(s)||'')),`ล้างตารางสอนครู ${teacherId} · ${removed.length} คาบ`)
  return {removed:removed.length}
}
export async function copyRoom(from: string, to: string, year: string, semester = 1) {
  if (from === to) throw new Error('กรุณาเลือกห้องต้นทางต่างจากห้องปลายทาง')
  const ctx = await context(year, semester)
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
export async function autoSchedule(year: string, roomId: string | null, clearFirst: boolean, semester = 1) {
  const ctx = await context(year, semester)
  if (roomId) requireScheduleClass(ctx.data, roomId)
  const scope = new Set(roomId ? [roomId] : ctx.data.classrooms.filter(c => ctx.data.lessons.some(l => l.classroomId === c.id && !l.activity)).map(c => c.id))
  if (!scope.size) throw new Error('ยังไม่มีห้องเรียนที่กำหนดรายวิชาหรือกิจกรรมในปีนี้')
  const skipped = roomId ? [] : ctx.data.classrooms.filter(c => !scope.has(c.id)).map(c => `${c.level}/${c.room}`)
  for (const room of ctx.data.classrooms.filter(c => scope.has(c.id))) {
    if (!ctx.data.lessons.some(l => l.classroomId === room.id && !l.activity)) throw new Error(`${room.level}/${room.room}: ยังไม่กำหนดรายวิชาและครูผู้สอน`)
  }
  const retained = ctx.data.slots.filter(s => !scope.has(s.classroom_id) || s.locked || !!s.activity_id || !clearFirst)
  const outsideCounts = new Map<string, number>()
  for (const s of retained.filter(s => !scope.has(s.classroom_id) || !!s.activity_id)) {
    const id = lessonKey(s); if (id) outsideCounts.set(id, (outsideCounts.get(id) || 0) + 1)
  }
  const lessons = ctx.data.lessons.map(l => ({ ...l, count: !l.activity && scope.has(l.classroomId) ? l.count : outsideCounts.get(l.id) || 0 }))
  const result = solveSchoolSchedule(lessons, retained.filter(s => s.locked || lessonKey(s) || s.note).map(s => ({ classroomId: s.classroom_id, lessonId: lessonKey(s), day: s.day_of_week, period: s.period })),150000,ctx.constraints.periodCount,ctx.constraints.blocks)
  if (result.error) throw new Error(result.error)
  const rows = retained.filter(s => s.locked || lessonKey(s) || s.note)
  for (const a of result.assignments) rows.push({ classroom_id: a.classroomId, academic_year_id: year, day_of_week: a.day, period: a.period, ...lessonColumns(a.lessonId), note: null, locked: false })
  await commit(ctx, year, rows, `จัดตาราง${roomId ? 'รายห้อง' : 'ทั้งโรงเรียน'} ${result.assignments.length} คาบ`)
  return { ok: true, assigned: result.assignments.length, classrooms: scope.size, skipped }
}

export async function activityOptions(year: string, roomId: string, semester = 1) {
  const ctx = await context(year, semester)
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
export async function saveActivity(year: string, roomId: string, settingId: string, teacherId: string, count: number, semester = 1) {
  const ctx = await context(year, semester)
  requireScheduleClass(ctx.data, roomId)
  const opts = await activityOptions(year, roomId)
  const combined = settingId === LEARNER_DEVELOPMENT_KEY
  if ((!combined && !opts.settings.some(s => s.id === settingId)) || !opts.teachers.some(t => t.id === teacherId) || !Number.isInteger(count) || count < 0 || count > 30) throw new Error('กิจกรรม ครู หรือจำนวนคาบไม่ถูกต้อง')
  const existing = opts.offerings.find(a => a.evaluation_setting_id === (combined ? null : settingId))
  if (existing?.teacher_id === teacherId && existing.weekly_periods === count) return { ok: true }
  if (existing && ctx.data.slots.some(s => s.activity_id === existing.id)) throw new Error('กิจกรรมนี้มีในตารางแล้ว กรุณานำคาบกิจกรรมออกจากตารางก่อนเปลี่ยนครูหรือจำนวนคาบ')
  const { error } = await createServerClient().from('class_schedule_activities').upsert({ classroom_id: roomId, academic_year_id: year, evaluation_setting_id: combined ? null : settingId, teacher_id: teacherId, weekly_periods: count }, { onConflict: combined ? 'classroom_id,academic_year_id,activity_key' : 'classroom_id,academic_year_id,evaluation_setting_id' })
  if (combined && error && ['42703','42P10','23502','PGRST204'].includes(error.code)) throw new Error('กรุณารันไฟล์ฐานข้อมูล 054_learner_development_subject.sql ก่อนเพิ่มวิชากิจกรรมพัฒนาผู้เรียน')
  if (error) throw new Error(error.message)
  return { ok: true }
}
