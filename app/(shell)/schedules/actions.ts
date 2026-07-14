'use server'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity } from '@/lib/audit'
import {
  SCHEDULE_DAYS,
  SCHEDULE_EDIT_ROLES,
  SCHEDULE_PERIOD_COUNT,
  SCHEDULE_VIEW_ROLES,
} from '@/lib/schedules'
import type { PeriodTimeRow } from '@/lib/schedule-helpers'

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

function canEditSchedule(session: ScheduleSession) {
  return SCHEDULE_EDIT_ROLES.includes(session.role as typeof SCHEDULE_EDIT_ROLES[number])
}

export async function fetchScheduleInit() {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const db = createServerClient()
  const { data: years } = await db.from('academic_years')
    .select('id, year_be, is_active')
    .eq('school_id', session.schoolId)
    .order('year_be', { ascending: false })

  const activeYearId = (years || []).find(y => y.is_active)?.id || years?.[0]?.id || null

  let homeroomClassroomIds: string[] = []
  if (session.role === 'teacher' && activeYearId) {
    const { data: homeroomRooms } = await db.from('classrooms')
      .select('id')
      .eq('school_id', session.schoolId)
      .eq('academic_year_id', activeYearId)
      .or(`homeroom_teacher_id.eq.${session.userId},homeroom_teacher2_id.eq.${session.userId}`)
    homeroomClassroomIds = (homeroomRooms || []).map(r => r.id)
  }

  const { data: teachers } = await db.from('users')
    .select('id, prefix, full_name')
    .eq('school_id', session.schoolId)
    .in('role', ['teacher', 'academic_head', 'deputy_principal', 'admin', 'principal'])
    .order('full_name')

  return {
    canEdit: canEditSchedule(session),
    years: years || [],
    teachers: teachers || [],
    homeroomClassroomIds,
    defaultTeacherId: session.role === 'teacher' ? session.userId : teachers?.[0]?.id ?? null,
    role: session.role,
  }
}

export async function fetchScheduleClassrooms(yearId: string) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')

  const db = createServerClient()
  const { data } = await db.from('classrooms')
    .select('id, level, room, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('school_id', session.schoolId)
    .eq('academic_year_id', yearId)
    .order('level')
    .order('room')

  let classrooms = data || []

  return classrooms.map(c => ({
    id: c.id,
    level: c.level,
    room: c.room,
    label: `${c.level}/${c.room}`,
  }))
}

export async function fetchClassScheduleSubjects(classroomId: string) {
  const session = await requireScheduleSession()
  const db = createServerClient()

  const { data: classroom } = await db.from('classrooms')
    .select('id, school_id, academic_year_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom) throw new Error('ไม่พบห้องเรียน')
  if (session.role !== 'district' && classroom.school_id !== session.schoolId) {
    throw new Error('ไม่มีสิทธิ์เข้าถึงห้องเรียนนี้')
  }

  const { data } = await db.from('class_subjects')
    .select('id, subject_id, teacher_id, subjects(code, name, short_name)')
    .eq('classroom_id', classroomId)
    .eq('academic_year_id', classroom.academic_year_id)
    .order('order_number')

  const teacherIds = [...new Set((data || []).map(row => row.teacher_id).filter(Boolean))] as string[]
  let teacherMap: Record<string, string> = {}
  if (teacherIds.length > 0) {
    const { data: teachers } = await db.from('users')
      .select('id, prefix, full_name')
      .in('id', teacherIds)
    teacherMap = Object.fromEntries(
      (teachers || []).map(t => [t.id, `${t.prefix} ${t.full_name}`.trim()]),
    )
  }

  return (data || []).map(row => {
    const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects
    const code = subject?.code ?? ''
    const name = subject?.short_name || subject?.name || ''
    const teacherName = row.teacher_id ? (teacherMap[row.teacher_id] || '') : ''
    return {
      id: row.id,
      teacher_id: row.teacher_id,
      subject_code: code,
      subject_name: name,
      teacher_name: teacherName,
      label: code ? `${code} ${name}`.trim() : name,
    }
  })
}

export async function fetchClassScheduleGrid(classroomId: string, yearId: string) {
  await requireScheduleSession()
  const db = createServerClient()

  const { data } = await db.from('class_schedule_slots')
    .select('day_of_week, period, class_subject_id, note, locked')
    .eq('classroom_id', classroomId)
    .eq('academic_year_id', yearId)

  const cells: Record<string, { class_subject_id: string | null; note: string | null; locked: boolean }> = {}
  for (const day of SCHEDULE_DAYS) {
    for (let period = 1; period <= SCHEDULE_PERIOD_COUNT; period++) {
      cells[`${day.value}-${period}`] = { class_subject_id: null, note: null, locked: false }
    }
  }
  for (const row of data || []) {
    cells[`${row.day_of_week}-${row.period}`] = {
      class_subject_id: row.class_subject_id,
      note: row.note,
      locked: row.locked ?? false,
    }
  }
  return cells
}

export async function saveClassScheduleCell(
  classroomId: string,
  yearId: string,
  dayOfWeek: number,
  period: number,
  classSubjectId: string | null,
  note: string | null = null,
) {
  const session = await requireScheduleSession()
  if (!canEditSchedule(session)) throw new Error('ไม่มีสิทธิ์แก้ไข')

  const db = createServerClient()
  const { data: classroom } = await db.from('classrooms')
    .select('id, school_id, level, room')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom || classroom.school_id !== session.schoolId) {
    throw new Error('ไม่พบห้องเรียน')
  }

  if (classSubjectId) {
    const { data: cs } = await db.from('class_subjects')
      .select('id, classroom_id')
      .eq('id', classSubjectId)
      .maybeSingle()
    if (!cs || cs.classroom_id !== classroomId) {
      throw new Error('รายวิชานี้ไม่ได้เปิดสอนในห้องเรียนนี้')
    }
  }

  if (!classSubjectId && !note?.trim()) {
    await db.from('class_schedule_slots')
      .delete()
      .eq('classroom_id', classroomId)
      .eq('academic_year_id', yearId)
      .eq('day_of_week', dayOfWeek)
      .eq('period', period)
  } else if (classSubjectId) {
    await db.from('class_schedule_slots').upsert({
      classroom_id: classroomId,
      academic_year_id: yearId,
      day_of_week: dayOfWeek,
      period,
      class_subject_id: classSubjectId,
      note: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'classroom_id,academic_year_id,day_of_week,period' })
  } else {
    await db.from('class_schedule_slots').upsert({
      classroom_id: classroomId,
      academic_year_id: yearId,
      day_of_week: dayOfWeek,
      period,
      class_subject_id: null,
      note: note?.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'classroom_id,academic_year_id,day_of_week,period' })
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'update',
    module: 'schedules',
    targetType: 'class_schedule',
    targetId: classroomId,
    targetLabel: `${classroom.level}/${classroom.room}`,
    description: `แก้ไขตารางเรียน ${classroom.level}/${classroom.room} วัน${dayOfWeek} คาบ${period}`,
  })

  return { ok: true }
}

export async function fetchTeachingScheduleGrid(teacherId: string, yearId: string) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')
  if (session.role === 'teacher' && teacherId !== session.userId) {
    throw new Error('ไม่มีสิทธิ์ดูตารางสอนของครูท่านอื่น')
  }

  const db = createServerClient()
  const { data: slots } = await db.from('class_schedule_slots')
    .select(`
      day_of_week, period, class_subject_id, note,
      classrooms!inner(id, level, room, school_id, academic_year_id),
      class_subjects(id, teacher_id, subjects(code, name, short_name))
    `)
    .eq('classrooms.school_id', session.schoolId)
    .eq('classrooms.academic_year_id', yearId)

  const cells: Record<string, { label: string; subject_line: string; room_line: string }> = {}
  for (const day of SCHEDULE_DAYS) {
    for (let period = 1; period <= SCHEDULE_PERIOD_COUNT; period++) {
      cells[`${day.value}-${period}`] = { label: '', subject_line: '', room_line: '' }
    }
  }

  for (const row of slots || []) {
    const cs = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects
    if (row.class_subject_id && (!cs || cs.teacher_id !== teacherId)) continue
    const classroom = Array.isArray(row.classrooms) ? row.classrooms[0] : row.classrooms
    if (!classroom) continue

    const roomLine = `${classroom.level}/${classroom.room}`
    let subjectLine = row.note || ''
    if (cs) {
      const subject = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects
      const code = subject?.code ?? ''
      const name = subject?.short_name || subject?.name || ''
      subjectLine = code ? `${code} ${name}`.trim() : name
    }

    const key = `${row.day_of_week}-${row.period}`
    const line = subjectLine ? `${roomLine}\n${subjectLine}` : roomLine
    const existing = cells[key]
    if (existing?.label) {
      cells[key] = {
        label: `${existing.label}\n${line}`,
        subject_line: existing.subject_line,
        room_line: existing.room_line,
      }
    } else {
      cells[key] = {
        label: line,
        subject_line: subjectLine,
        room_line: roomLine,
      }
    }
  }

  return cells
}

export async function fetchPeriodTimes() {
  const mod = await import('./extended-actions')
  return mod.fetchPeriodTimes()
}

export async function savePeriodTimes(times: PeriodTimeRow[]) {
  const mod = await import('./extended-actions')
  return mod.savePeriodTimes(times)
}

export async function fetchScheduleQuotas(classroomId: string, yearId: string) {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleQuotas(classroomId, yearId)
}

export async function fetchScheduleConflicts(yearId: string) {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleConflicts(yearId)
}

export async function fetchScheduleWorkload(yearId: string) {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleWorkload(yearId)
}

export async function fetchScheduleCurriculumCheck(classroomId: string, yearId: string) {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleCurriculumCheck(classroomId, yearId)
}

export async function toggleScheduleCellLock(
  classroomId: string,
  yearId: string,
  dayOfWeek: number,
  period: number,
) {
  const mod = await import('./extended-actions')
  return mod.toggleScheduleCellLock(classroomId, yearId, dayOfWeek, period)
}

export async function copyClassSchedule(fromClassroomId: string, toClassroomId: string, yearId: string) {
  const mod = await import('./extended-actions')
  return mod.copyClassSchedule(fromClassroomId, toClassroomId, yearId)
}

export async function clearClassSchedule(classroomId: string, yearId: string) {
  const mod = await import('./extended-actions')
  return mod.clearClassSchedule(classroomId, yearId)
}

export async function runAutoScheduleClass(
  classroomId: string,
  yearId: string,
  mode: 'spread' | 'random' = 'spread',
  clearFirst = false,
) {
  const mod = await import('./extended-actions')
  return mod.runAutoScheduleClass(classroomId, yearId, mode, clearFirst)
}

export async function fetchScheduleExportContext() {
  const mod = await import('./extended-actions')
  return mod.fetchScheduleExportContext()
}

export async function fetchSubstituteDay(date: string, yearId: string) {
  const mod = await import('./extended-actions')
  return mod.fetchSubstituteDay(date, yearId)
}

export async function loadSubstituteSlotsForTeacher(
  date: string,
  yearId: string,
  absentTeacherId: string,
) {
  const mod = await import('./extended-actions')
  return mod.loadSubstituteSlotsForTeacher(date, yearId, absentTeacherId)
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
  const mod = await import('./extended-actions')
  return mod.saveSubstituteTeacher(substituteDayId, entryId, payload)
}

export async function importSubstituteFromSchedule(
  substituteDayId: string,
  date: string,
  yearId: string,
  absentTeacherId: string,
  leaveType: string,
) {
  const mod = await import('./extended-actions')
  return mod.importSubstituteFromSchedule(substituteDayId, date, yearId, absentTeacherId, leaveType)
}

export async function getTeacherConflictAt(
  yearId: string,
  teacherId: string,
  day: number,
  period: number,
  ignoreClassroomId?: string,
) {
  const mod = await import('./extended-actions')
  return mod.getTeacherConflictAt(yearId, teacherId, day, period, ignoreClassroomId)
}
