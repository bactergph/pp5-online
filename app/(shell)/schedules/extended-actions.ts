import 'server-only'
import { loadSchedule, lessonKey, requireScheduleClass } from '@/lib/schedule-store'
import * as scheduleOps from '@/lib/schedule-operations'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity } from '@/lib/audit'
import {
  DEFAULT_PERIOD_TIMES,
  type PeriodTimeRow,
  workloadStatus,
  workloadLabel,
} from '@/lib/schedule-helpers'
import {
  SCHEDULE_DAYS,
  SCHEDULE_EDIT_ROLES,
  SCHEDULE_PERIOD_COUNT,
  SCHEDULE_VIEW_ROLES,
} from '@/lib/schedules'

type ScheduleSession = {
  userId: string
  role: string
  schoolId: string | null
  fullName: string
  isHomeroom: boolean
}

async function requireScheduleSession() {
  const session = await getSession()
  if (!session || !SCHEDULE_VIEW_ROLES.includes(session.role as typeof SCHEDULE_VIEW_ROLES[number])) {
    throw new Error('ไม่มีสิทธิ์')
  }
  return session as ScheduleSession
}

function canEdit(session: ScheduleSession) {
  return SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])
}

async function loadAllSlotsForYear(schoolId:string,yearId:string) {
 const data=await loadSchedule(schoolId,yearId)
 return data.slots.map(row=>{const l=data.lessons.find(l=>l.id===lessonKey(row));const room=data.classrooms.find(c=>c.id===row.classroom_id)!;return {...row,class_subject_id:lessonKey(row),classrooms:room,class_subjects:l?{id:l.id,teacher_id:l.teacherId,subject_id:l.subjectId,subjects:{code:l.code,name:l.name,short_name:l.name,hours_per_year:l.count*40}}:null}})
}

export async function fetchPeriodTimes() {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')
  const db = createServerClient()
  const { data, error } = await db.from('school_period_times')
    .select('period, label, start_time, end_time, is_break, sort_order')
    .eq('school_id', session.schoolId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  if (!data?.length) return { times: DEFAULT_PERIOD_TIMES, isDefault: true }
  const teachingCount = (data as PeriodTimeRow[]).filter(t => !t.is_break).length
  // ค่าเก่า (เช่น 8 คาบ) ไม่ตรงโครงประถม 6 คาบ → ใช้ค่าเริ่มต้นใหม่
  if (teachingCount !== SCHEDULE_PERIOD_COUNT) {
    return { times: DEFAULT_PERIOD_TIMES, isDefault: true }
  }
  return { times: data as PeriodTimeRow[], isDefault: false }
}

export async function savePeriodTimes(times: PeriodTimeRow[]) {
  const session = await requireScheduleSession()
  if (!canEdit(session) || !session.schoolId) throw new Error('ไม่มีสิทธิ์')
  const db = createServerClient()
  const { error } = await db.rpc('save_school_period_times', { p_school_id: session.schoolId, p_rows: times })
  if (error) throw new Error(error.message)
  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'update',
    module: 'schedules',
    targetType: 'period_times',
    description: 'บันทึกเวลาคาบเรียน',
  })
  return { ok: true }
}

export async function fetchScheduleQuotas(classroomId:string,yearId:string) {
  const session=await requireScheduleSession()
  const data=await loadSchedule(session.schoolId,yearId)
  requireScheduleClass(data,classroomId)
  const slots=data.slots.filter(s=>s.classroom_id===classroomId)
  const items=data.lessons.filter(l=>l.classroomId===classroomId && !l.activity).map(l=>{ const used=slots.filter(s=>lessonKey(s)===l.id).length; return {class_subject_id:l.id,code:l.code,name:l.name,target:l.count,used,remaining:l.count-used} })
  return {items,filled:slots.filter(s=>lessonKey(s)).length,totalTarget:items.reduce((n,i)=>n+i.target,0)}
}

export async function fetchScheduleConflicts(yearId: string) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const slots = await loadAllSlotsForYear(session.schoolId, yearId)
  const teacherMap: Record<string, Record<string, Record<number, { room: string; subject: string }[]>>> = {}

  for (const row of slots) {
    const cs = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects
    if (!cs?.teacher_id || !row.class_subject_id) continue
    const classroom = Array.isArray(row.classrooms) ? row.classrooms[0] : row.classrooms
    const subject = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects
    const room = classroom ? `${classroom.level}/${classroom.room}` : '?'
    const subj = subject?.short_name || subject?.name || ''
    const tid = cs.teacher_id
    const day = String(row.day_of_week)
    const period = row.period
    if (!teacherMap[tid]) teacherMap[tid] = {}
    if (!teacherMap[tid][day]) teacherMap[tid][day] = {}
    if (!teacherMap[tid][day][period]) teacherMap[tid][day][period] = []
    teacherMap[tid][day][period].push({ room, subject: subj })
  }

  const db = createServerClient()
  const teacherIds = Object.keys(teacherMap)
  const { data: teachers } = teacherIds.length
    ? await db.from('users').select('id, prefix, full_name').in('id', teacherIds)
    : { data: [] }
  const nameMap = Object.fromEntries(
    (teachers || []).map(t => [t.id, `${t.prefix} ${t.full_name}`.trim()]),
  )

  const conflicts: {
    teacher_id: string
    teacher_name: string
    day: number
    period: number
    day_label: string
    rooms: { room: string; subject: string }[]
  }[] = []

  for (const tid of teacherIds) {
    for (const day of Object.keys(teacherMap[tid])) {
      for (const period of Object.keys(teacherMap[tid][day])) {
        const rooms = teacherMap[tid][day][Number(period)]
        if (rooms.length >= 2) {
          conflicts.push({
            teacher_id: tid,
            teacher_name: nameMap[tid] || tid,
            day: Number(day),
            period: Number(period),
            day_label: SCHEDULE_DAYS.find(d => d.value === Number(day))?.label || day,
            rooms,
          })
        }
      }
    }
  }

  return { conflicts, count: conflicts.length }
}

export async function fetchScheduleWorkload(yearId: string) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const slots = await loadAllSlotsForYear(session.schoolId, yearId)
  const hoursMap: Record<string, number> = {}

  for (const row of slots) {
    const cs = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects
    if (!cs?.teacher_id || !row.class_subject_id) continue
    hoursMap[cs.teacher_id] = (hoursMap[cs.teacher_id] || 0) + 1
  }

  const db = createServerClient()
  const { data: teachers } = await db.from('users')
    .select('id, prefix, full_name, position')
    .eq('school_id', session.schoolId)
    .in('role', ['teacher', 'academic_head', 'deputy_principal', 'admin', 'principal'])
    .order('full_name')

  return (teachers || []).map(t => {
    const hours = hoursMap[t.id] || 0
    const status = workloadStatus(hours)
    return {
      id: t.id,
      name: `${t.prefix} ${t.full_name}`.trim(),
      position: t.position,
      hours,
      status,
      status_label: workloadLabel(status),
    }
  }).sort((a, b) => b.hours - a.hours)
}

export async function fetchScheduleCurriculumCheck(classroomId: string, yearId: string) {
  const quotas = await fetchScheduleQuotas(classroomId, yearId)
  return quotas.items.map(item => ({
    ...item,
    label: item.code ? `${item.code} ${item.name}`.trim() : item.name,
    ok: item.remaining === 0,
    over: item.remaining < 0,
    under: item.remaining > 0,
  }))
}

export async function toggleScheduleCellLock(classroomId:string,yearId:string,day:number,period:number) { return scheduleOps.toggleLock(classroomId,yearId,day,period) }

export async function copyClassSchedule(from:string,to:string,yearId:string) { return scheduleOps.copyRoom(from,to,yearId) }

export async function clearClassSchedule(classroomId:string,yearId:string) { return scheduleOps.clearRoom(classroomId,yearId) }

export async function runAutoScheduleClass(classroomId:string,yearId:string,mode:'spread'|'random'='spread',clearFirst=false) { if (!['spread','random'].includes(mode)) throw new Error('รูปแบบไม่ถูกต้อง'); return scheduleOps.autoSchedule(yearId,classroomId,clearFirst) }

export async function fetchScheduleExportContext() {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')
  const db = createServerClient()
  const { data: school, error: schoolError } = await db.from('schools')
    .select('name, logo_url, director_name, academic_head_name, acting_director, acting_director_position')
    .eq('id', session.schoolId)
    .maybeSingle()
  if (schoolError) throw new Error('โหลดข้อมูลโรงเรียนไม่สำเร็จ')
  const periodTimes = await fetchPeriodTimes()
  return { school: school ? { ...school, director_position: 'ผู้อำนวยการสถานศึกษา' } : null, periodTimes: periodTimes.times }
}

export async function fetchSubstituteDay(date: string, yearId: string) {
  const session = await requireScheduleSession()
  if (!session.schoolId || !canEdit(session)) throw new Error('ไม่มีสิทธิ์')
  const schedule = await loadSchedule(session.schoolId, yearId)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('วันที่ไม่ถูกต้อง')
  const db = createServerClient()

  const d = new Date(date + 'T12:00:00')
  const jsDay = d.getDay()
  const dayOfWeek = jsDay === 0 ? 7 : jsDay

  const dayResult = await db.from('schedule_substitute_days')
    .select('id, date, day_of_week, note')
    .eq('school_id', session.schoolId)
    .eq('date', date)
    .maybeSingle()
  if (dayResult.error) throw new Error(dayResult.error.message)
  let dayRow = dayResult.data
  if (dayRow) {
    const { data: owner } = await db.from('schedule_substitute_days').select('academic_year_id').eq('id', dayRow.id).single()
    if (owner?.academic_year_id !== yearId) throw new Error('วันที่นี้มีตารางสอนแทนอยู่ในปีการศึกษาอื่น')
  }

  if (!dayRow) {
    const { data: created, error } = await db.from('schedule_substitute_days')
      .upsert({
        school_id: session.schoolId,
        academic_year_id: yearId,
        date,
        day_of_week: dayOfWeek,
      }, { onConflict: 'school_id,date', ignoreDuplicates: true })
      .select('id, date, day_of_week, note')
      .maybeSingle()
    if (error) throw new Error(error.message)
    dayRow = created
    if (!dayRow) {
      const retry = await db.from('schedule_substitute_days').select('id,date,day_of_week,note,academic_year_id').eq('school_id', session.schoolId).eq('date', date).single()
      if (retry.error || retry.data.academic_year_id !== yearId) throw new Error('โหลดวันที่ไม่สำเร็จ กรุณาลองใหม่')
      dayRow = retry.data
    }
  }

  const { data: entries, error: entriesError } = await db.from('schedule_substitute_entries')
    .select(`
      id, absent_teacher_id, period, class_subject_id, classroom_id,
      subject_label, room_label, substitute_teacher_id, leave_type, note
    `)
    .eq('substitute_day_id', dayRow!.id)
    .order('period')
  if (entriesError) throw new Error(entriesError.message)

  return {
    day: dayRow,
    day_label: SCHEDULE_DAYS.find(d => d.value === dayRow!.day_of_week)?.label || '',
    busy: schedule.slots.filter(s => s.day_of_week === dayOfWeek).flatMap(s => {
      const teacherId = schedule.lessons.find(l => l.id === lessonKey(s))?.teacherId
      return teacherId ? [{ teacherId, period: s.period }] : []
    }),
    entries: entries || [],
  }
}

export async function loadSubstituteSlotsForTeacher(
  date: string,
  yearId: string,
  absentTeacherId: string,
) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const d = new Date(date + 'T12:00:00')
  const jsDay = d.getDay()
  const dayOfWeek = jsDay === 0 ? 7 : jsDay

  const slots = await loadAllSlotsForYear(session.schoolId, yearId)
  return slots
    .filter(row => {
      const cs = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects
      return cs?.teacher_id === absentTeacherId
        && row.day_of_week === dayOfWeek
        && row.class_subject_id
    })
    .map(row => {
      const cs = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects
      const classroom = Array.isArray(row.classrooms) ? row.classrooms[0] : row.classrooms
      const subject = cs && (Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects)
      return {
        period: row.period,
        class_subject_id: row.activity_id ? null : row.class_subject_id,
        classroom_id: row.classroom_id,
        room_label: classroom ? `${classroom.level}/${classroom.room}` : '',
        subject_label: subject
          ? `${subject.code || ''} ${subject.short_name || subject.name || ''}`.trim()
          : '',
      }
    })
    .sort((a, b) => a.period - b.period)
}

export async function saveSubstituteTeacher(
  substituteDayId: string,
  entryId: string | null,
  payload: {
    absent_teacher_id: string
    period: number
    class_subject_id: string | null
    classroom_id: string | null
    subject_label: string
    room_label: string
    substitute_teacher_id: string | null
    leave_type: string
    note: string | null
  },
) {
  const session = await requireScheduleSession()
  if (!canEdit(session)) throw new Error('ไม่มีสิทธิ์')
  const db = createServerClient()

  if (entryId) {
    const { data: day } = await db.from('schedule_substitute_days').select('id').eq('id', substituteDayId).eq('school_id', session.schoolId || '').maybeSingle()
    if (!day) throw new Error('ไม่พบตารางสอนแทนของโรงเรียนนี้')
    const { data, error } = await db.from('schedule_substitute_entries').update({
      substitute_teacher_id: payload.substitute_teacher_id,
      leave_type: payload.leave_type,
      note: payload.note,
    }).eq('id', entryId).eq('substitute_day_id', substituteDayId).select('id').maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('ไม่พบคาบสอนแทน')
  } else {
    throw new Error('กรุณานำเข้าคาบจากตารางเรียนก่อนกำหนดครูสอนแทน')
  }
  return { ok: true }
}

export async function importSubstituteFromSchedule(
  substituteDayId: string,
  date: string,
  yearId: string,
  absentTeacherId: string,
  leaveType: string,
) {
  const session = await requireScheduleSession()
  if (!canEdit(session)) throw new Error('ไม่มีสิทธิ์')
  const slots = await loadSubstituteSlotsForTeacher(date, yearId, absentTeacherId)
  const db = createServerClient()
  if (!slots.length) throw new Error('ครูท่านนี้ไม่มีคาบสอนในวันที่เลือก')
  const { data: day } = await db.from('schedule_substitute_days').select('id').eq('id', substituteDayId).eq('school_id', session.schoolId || '').eq('academic_year_id', yearId).eq('date', date).maybeSingle()
  if (!day) throw new Error('วันหรือปีการศึกษาของตารางสอนแทนไม่ตรงกัน')
  const { error } = await db.rpc('replace_substitute_slots', { p_school_id: session.schoolId, p_day_id: substituteDayId, p_teacher_id: absentTeacherId, p_leave_type: leaveType, p_rows: slots })
  if (error) throw new Error(error.message)
  return { ok: true, count: slots.length }
}

export async function getTeacherConflictAt(
  yearId: string,
  teacherId: string,
  day: number,
  period: number,
  ignoreClassroomId?: string,
) {
  const session = await requireScheduleSession()
  if (!session.schoolId) return { busy: false, rooms: [] as string[] }

  const slots = await loadAllSlotsForYear(session.schoolId, yearId)
  const rooms: string[] = []
  for (const row of slots) {
    if (row.day_of_week !== day || row.period !== period) continue
    if (ignoreClassroomId && row.classroom_id === ignoreClassroomId) continue
    const cs = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects
    if (cs?.teacher_id !== teacherId || !row.class_subject_id) continue
    const classroom = Array.isArray(row.classrooms) ? row.classrooms[0] : row.classrooms
    if (classroom) rooms.push(`${classroom.level}/${classroom.room}`)
  }
  return { busy: rooms.length > 0, rooms }
}

export type SubstituteChange = { id: string; substitute_teacher_id: string | null; leave_type: string; note: string | null }
export async function saveSubstituteDay(substituteDayId: string, expected: SubstituteChange[], rows: SubstituteChange[]) {
  const session = await requireScheduleSession()
  if (!session.schoolId || !canEdit(session)) throw new Error('ไม่มีสิทธิ์')
  const { error } = await createServerClient().rpc('save_substitute_day', { p_school_id: session.schoolId, p_day_id: substituteDayId, p_expected: expected, p_rows: rows })
  if (error) throw new Error(error.code === 'PGRST202' ? 'กรุณารันไฟล์ฐานข้อมูล 055_substitute_batch_save.sql ก่อนบันทึก' : error.message)
  return { ok: true }
}
export async function fetchSubstitutePdfContext() {
  const session = await requireScheduleSession()
  if (!session.schoolId || !canEdit(session)) throw new Error('ไม่มีสิทธิ์')
  const context = await fetchScheduleExportContext()
  return { ...context, academicHead: context.school?.academic_head_name || '' }
}
