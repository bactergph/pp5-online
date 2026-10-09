import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { weeklyHoursFromYear } from '@/lib/schedule-helpers'

export async function loadScheduleConstraints(schoolId: string, yearId: string, semester: number) {
  const db = createServerClient()
  const [times, blocks] = await Promise.all([
    db.from('school_period_times').select('period').eq('school_id',schoolId).eq('is_break',false),
    db.from('schedule_teacher_blocks').select('teacher_id,day_of_week,period').eq('school_id',schoolId).eq('academic_year_id',yearId).eq('semester',semester),
  ])
  if (times.error) throw new Error(times.error.message)
  if (blocks.error && !['42P01','PGRST205'].includes(blocks.error.code)) throw new Error(blocks.error.message)
  const periodCount = times.data?.length || 6
  return {periodCount, blocks: (blocks.data || []).map(b=>({teacherId:b.teacher_id,day:b.day_of_week,period:b.period})), blocksSupported:!blocks.error}
}
import { LEARNER_DEVELOPMENT_KEY, LEARNER_DEVELOPMENT_NAME } from '@/lib/schedule-activity'

export type ScheduleSlot = {
  classroom_id: string; academic_year_id: string; day_of_week: number; period: number
  class_subject_id: string | null; activity_id: string | null; note: string | null; locked: boolean
}
export type ScheduleLesson = {
  id: string; classroomId: string; teacherId: string | null; count: number; label: string
  subjectId: string; code: string; name: string; teacherName: string; roomName?: string; activity: boolean; teacherOptional?: boolean; selectable?: boolean
}
export const slotFields = 'classroom_id,academic_year_id,day_of_week,period,class_subject_id,activity_id,note,locked'
export const lessonKey = (row: ScheduleSlot) => row.activity_id ? `activity:${row.activity_id}` : row.class_subject_id
export function lessonColumns(id: string | null) {
  return { class_subject_id: id && !id.startsWith('activity:') ? id : null, activity_id: id?.startsWith('activity:') ? id.slice(9) : null }
}
// PostgREST caps a response at 1,000 rows; a whole-school timetable may be larger.
async function readAll<T>(query: { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }> }) {
  const data: T[] = []
  for (let offset = 0; ; offset += 500) {
    const page = await query.range(offset, offset + 499)
    if (page.error) return { data: null, error: page.error }
    data.push(...(page.data || []))
    if ((page.data?.length || 0) < 500) return { data, error: null }
  }
}
async function readTermSlots(ids: string[], yearId: string, semester: number) {
  const query = () => createServerClient().from('class_schedule_slots').select(slotFields).in('classroom_id', ids).eq('academic_year_id', yearId).order('classroom_id').order('day_of_week').order('period')
  const result = await readAll(query().eq('semester', semester))
  if (result.error && ['42703', 'PGRST204'].includes(result.error.code || '') && result.error.message.includes('semester')) {
    if (semester === 1) return { ...await readAll(query()), legacy: true }
    throw new Error('กรุณารันไฟล์ฐานข้อมูล 057_schedule_semesters.sql เพื่อเปิดใช้ตารางแยกภาคเรียน')
  }
  return { ...result, legacy: false }
}
export async function loadSchedule(schoolId: string | null, yearId: string, semester = 1) {
  if (semester !== 1 && semester !== 2) throw new Error('ภาคเรียนไม่ถูกต้อง')
  if (!schoolId) throw new Error('กรุณาเลือกโรงเรียน')
  const db = createServerClient()
  const year = await db.from('academic_years').select('id').eq('id', yearId).eq('school_id', schoolId).maybeSingle()
  if (year.error || !year.data) throw new Error('ไม่พบปีการศึกษาในโรงเรียนนี้')
  const rooms = await readAll(db.from('classrooms').select('id,level,room').eq('school_id', schoolId).eq('academic_year_id', yearId).order('level').order('room').order('id'))
  if (rooms.error) throw new Error(rooms.error.message)
  const classrooms = rooms.data || []
  if (!classrooms.length) return { classrooms, lessons: [] as ScheduleLesson[], slots: [] as ScheduleSlot[] }
  const ids = classrooms.map(c => c.id)
  const [subjects, activities, slots, teachers] = await Promise.all([
    readAll(db.from('class_subjects').select('*,subjects(code,name,short_name,hours_per_year)').in('classroom_id', ids).eq('academic_year_id', yearId).order('id')),
    readAll(db.from('class_schedule_activities').select('id,classroom_id,evaluation_setting_id,teacher_id,weekly_periods,evaluation_settings(label,short_label,is_active,sort_order)').in('classroom_id', ids).eq('academic_year_id', yearId).order('id')),
    readTermSlots(ids, yearId, semester),
    readAll(db.from('users').select('id,prefix,full_name').eq('school_id', schoolId).order('id')),
  ])
  for (const r of [subjects, activities, slots, teachers]) if (r.error) {
    if (r.error.code === 'PGRST205' || r.error.code === '42703') throw new Error('ระบบตารางเรียนยังไม่พร้อม กรุณาให้ผู้ดูแลรันไฟล์ฐานข้อมูล 057_schedule_semesters.sql ก่อน')
    throw new Error(`โหลดตารางเรียนไม่สำเร็จ: ${r.error.message}`)
  }
  const names = new Map((teachers.data || []).map(t => [t.id, `${t.prefix || ''} ${t.full_name}`.trim()]))
  const labels = new Map(classrooms.map(c => [c.id, `${c.level}/${c.room}`]))
  const lessons: ScheduleLesson[] = (subjects.data || []).map(row => {
    const s = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects
    return { id: row.id, classroomId: row.classroom_id, teacherId: row.teacher_id, count: weeklyHoursFromYear(s?.hours_per_year),
      label: `${labels.get(row.classroom_id)} · ${s?.name || ''}`, subjectId: row.subject_id, code: s?.code || '',
      name: s?.short_name || s?.name || '', teacherName: names.get(row.teacher_id) || '', roomName: row.room_name || "", activity: false }
  })
  for (const row of activities.data || []) {
    const a = Array.isArray(row.evaluation_settings) ? row.evaluation_settings[0] : row.evaluation_settings
    const name = row.evaluation_setting_id ? a?.label || a?.short_label || '' : LEARNER_DEVELOPMENT_NAME
    lessons.push({ id: `activity:${row.id}`, classroomId: row.classroom_id, teacherId: row.teacher_id, count: 0,
      label: `${labels.get(row.classroom_id)} · ${name}`, subjectId: row.evaluation_setting_id || LEARNER_DEVELOPMENT_KEY, code: '',
      teacherOptional: true, selectable: !!row.evaluation_setting_id && !!a?.is_active, name, teacherName: names.get(row.teacher_id) || '', activity: true })
  }
  return { classrooms, lessons, slots: (slots.data || []) as ScheduleSlot[], semesterSupported: !slots.legacy }
}

export async function persistSchedule(schoolId: string | null, yearId: string, before: ScheduleSlot[], after: ScheduleSlot[], allowUnlock = false, semester = 1) {
  const { error } = await createServerClient().rpc('save_school_schedule_term', {
    p_school_id: schoolId, p_year_id: yearId, p_expected: before, p_rows: after, p_allow_unlock: allowUnlock, p_semester: semester,
  })
  if (error?.code === 'PGRST202') {
    if (semester !== 1) throw new Error('กรุณารันไฟล์ฐานข้อมูล 057_schedule_semesters.sql ก่อนบันทึกเทอม 2')
    const legacy = await createServerClient().rpc('save_school_schedule', { p_school_id: schoolId, p_year_id: yearId, p_expected: before, p_rows: after, p_allow_unlock: allowUnlock })
    if (legacy.error) throw new Error(legacy.error.message)
  } else if (error) throw new Error(error.message)
}

export function requireScheduleClass(data: Awaited<ReturnType<typeof loadSchedule>>, classroomId: string) {
  const room = data.classrooms.find(c => c.id === classroomId)
  if (!room) throw new Error('ไม่พบห้องเรียนในโรงเรียนและปีการศึกษานี้')
  return room
}
