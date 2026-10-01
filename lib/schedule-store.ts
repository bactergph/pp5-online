import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { weeklyHoursFromYear } from '@/lib/schedule-helpers'

export type ScheduleSlot = {
  classroom_id: string; academic_year_id: string; day_of_week: number; period: number
  class_subject_id: string | null; activity_id: string | null; note: string | null; locked: boolean
}
export type ScheduleLesson = {
  id: string; classroomId: string; teacherId: string | null; count: number; label: string
  subjectId: string; code: string; name: string; teacherName: string; activity: boolean
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
export async function loadSchedule(schoolId: string | null, yearId: string) {
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
    readAll(db.from('class_subjects').select('id,classroom_id,subject_id,teacher_id,subjects(code,name,short_name,hours_per_year)').in('classroom_id', ids).eq('academic_year_id', yearId).order('id')),
    readAll(db.from('class_schedule_activities').select('id,classroom_id,evaluation_setting_id,teacher_id,weekly_periods,evaluation_settings(label,short_label)').in('classroom_id', ids).eq('academic_year_id', yearId).order('id')),
    readAll(db.from('class_schedule_slots').select(slotFields).in('classroom_id', ids).eq('academic_year_id', yearId).order('classroom_id').order('day_of_week').order('period')),
    readAll(db.from('users').select('id,prefix,full_name').eq('school_id', schoolId).order('id')),
  ])
  for (const r of [subjects, activities, slots, teachers]) if (r.error) {
    if (r.error.code === 'PGRST205' || r.error.code === '42703') throw new Error('ระบบตารางเรียนยังไม่พร้อม กรุณาให้ผู้ดูแลรันไฟล์ฐานข้อมูล 053_school_schedule_solver.sql ก่อน')
    throw new Error(`โหลดตารางเรียนไม่สำเร็จ: ${r.error.message}`)
  }
  const names = new Map((teachers.data || []).map(t => [t.id, `${t.prefix || ''} ${t.full_name}`.trim()]))
  const labels = new Map(classrooms.map(c => [c.id, `${c.level}/${c.room}`]))
  const lessons: ScheduleLesson[] = (subjects.data || []).map(row => {
    const s = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects
    return { id: row.id, classroomId: row.classroom_id, teacherId: row.teacher_id, count: weeklyHoursFromYear(s?.hours_per_year),
      label: `${labels.get(row.classroom_id)} · ${s?.name || ''}`, subjectId: row.subject_id, code: s?.code || '',
      name: s?.short_name || s?.name || '', teacherName: names.get(row.teacher_id) || '', activity: false }
  })
  for (const row of activities.data || []) {
    const a = Array.isArray(row.evaluation_settings) ? row.evaluation_settings[0] : row.evaluation_settings
    lessons.push({ id: `activity:${row.id}`, classroomId: row.classroom_id, teacherId: row.teacher_id, count: row.weekly_periods,
      label: `${labels.get(row.classroom_id)} · ${a?.label || ''}`, subjectId: row.evaluation_setting_id, code: '',
      name: a?.short_label || a?.label || '', teacherName: names.get(row.teacher_id) || '', activity: true })
  }
  return { classrooms, lessons, slots: (slots.data || []) as ScheduleSlot[] }
}

export async function persistSchedule(schoolId: string | null, yearId: string, before: ScheduleSlot[], after: ScheduleSlot[], allowUnlock = false) {
  const { error } = await createServerClient().rpc('save_school_schedule', {
    p_school_id: schoolId, p_year_id: yearId, p_expected: before, p_rows: after, p_allow_unlock: allowUnlock,
  })
  if (error) throw new Error(error.message)
}

export function requireScheduleClass(data: Awaited<ReturnType<typeof loadSchedule>>, classroomId: string) {
  const room = data.classrooms.find(c => c.id === classroomId)
  if (!room) throw new Error('ไม่พบห้องเรียนในโรงเรียนและปีการศึกษานี้')
  return room
}
