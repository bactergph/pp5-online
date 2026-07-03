import 'server-only'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity } from '@/lib/audit'
import {
  buildAutoAssignments,
  DEFAULT_PERIOD_TIMES,
  emptyScheduleCells,
  type PeriodTimeRow,
  weeklyHoursFromYear,
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

async function loadAllSlotsForYear(schoolId: string, yearId: string) {
  const db = createServerClient()
  const { data } = await db.from('class_schedule_slots')
    .select(`
      id, classroom_id, day_of_week, period, class_subject_id, locked,
      classrooms!inner(id, level, room, school_id, academic_year_id),
      class_subjects(id, teacher_id, subject_id, subjects(code, name, short_name, hours_per_year))
    `)
    .eq('classrooms.school_id', schoolId)
    .eq('classrooms.academic_year_id', yearId)
  return data || []
}

export async function fetchPeriodTimes() {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')
  const db = createServerClient()
  const { data } = await db.from('school_period_times')
    .select('period, label, start_time, end_time, is_break, sort_order')
    .eq('school_id', session.schoolId)
    .order('sort_order')
  if (!data?.length) return { times: DEFAULT_PERIOD_TIMES, isDefault: true }
  return { times: data as PeriodTimeRow[], isDefault: false }
}

export async function savePeriodTimes(times: PeriodTimeRow[]) {
  const session = await requireScheduleSession()
  if (!canEdit(session) || !session.schoolId) throw new Error('ไม่มีสิทธิ์')
  const db = createServerClient()
  await db.from('school_period_times').delete().eq('school_id', session.schoolId)
  const rows = times.map((t, i) => ({
    school_id: session.schoolId,
    period: t.period,
    label: t.label,
    start_time: t.start_time,
    end_time: t.end_time,
    is_break: t.is_break,
    sort_order: t.sort_order ?? i + 1,
  }))
  const { error } = await db.from('school_period_times').insert(rows)
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

export async function fetchScheduleQuotas(classroomId: string, yearId: string) {
  await requireScheduleSession()
  const db = createServerClient()
  const { data: classSubjects } = await db.from('class_subjects')
    .select('id, subject_id, subjects(code, name, short_name, hours_per_year)')
    .eq('classroom_id', classroomId)
    .eq('academic_year_id', yearId)
    .order('order_number')

  const { data: slots } = await db.from('class_schedule_slots')
    .select('class_subject_id')
    .eq('classroom_id', classroomId)
    .eq('academic_year_id', yearId)
    .not('class_subject_id', 'is', null)

  const usedMap: Record<string, number> = {}
  for (const s of slots || []) {
    if (s.class_subject_id) {
      usedMap[s.class_subject_id] = (usedMap[s.class_subject_id] || 0) + 1
    }
  }

  const items = (classSubjects || []).map(row => {
    const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects
    const target = weeklyHoursFromYear(subject?.hours_per_year)
    const used = usedMap[row.id] || 0
    return {
      class_subject_id: row.id,
      code: subject?.code ?? '',
      name: subject?.short_name || subject?.name || '',
      target,
      used,
      remaining: target - used,
    }
  })

  const filled = (slots || []).length
  const totalTarget = items.reduce((a, i) => a + i.target, 0)
  return { items, filled, totalTarget }
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

export async function toggleScheduleCellLock(
  classroomId: string,
  yearId: string,
  dayOfWeek: number,
  period: number,
) {
  const session = await requireScheduleSession()
  if (!canEdit(session)) throw new Error('ไม่มีสิทธิ์')

  const db = createServerClient()
  const { data: existing } = await db.from('class_schedule_slots')
    .select('id, locked')
    .eq('classroom_id', classroomId)
    .eq('academic_year_id', yearId)
    .eq('day_of_week', dayOfWeek)
    .eq('period', period)
    .maybeSingle()

  if (!existing) {
    await db.from('class_schedule_slots').insert({
      classroom_id: classroomId,
      academic_year_id: yearId,
      day_of_week: dayOfWeek,
      period,
      locked: true,
    })
    return { locked: true }
  }

  const locked = !existing.locked
  await db.from('class_schedule_slots').update({ locked, updated_at: new Date().toISOString() }).eq('id', existing.id)
  return { locked }
}

export async function copyClassSchedule(fromClassroomId: string, toClassroomId: string, yearId: string) {
  const session = await requireScheduleSession()
  if (!canEdit(session)) throw new Error('ไม่มีสิทธิ์')

  const db = createServerClient()

  const { data: targetSubjects } = await db.from('class_subjects')
    .select('id, subject_id')
    .eq('classroom_id', toClassroomId)
    .eq('academic_year_id', yearId)

  await db.from('class_schedule_slots')
    .delete()
    .eq('classroom_id', toClassroomId)
    .eq('academic_year_id', yearId)

  const { data: sourceSlots } = await db.from('class_schedule_slots')
    .select('day_of_week, period, class_subject_id, note, locked, class_subjects(subject_id)')
    .eq('classroom_id', fromClassroomId)
    .eq('academic_year_id', yearId)

  const subjectIdToCs = Object.fromEntries((targetSubjects || []).map(cs => [cs.subject_id, cs.id]))

  const inserts = []
  for (const row of sourceSlots || []) {
    const cs = Array.isArray(row.class_subjects) ? row.class_subjects[0] : row.class_subjects
    let classSubjectId: string | null = null
    if (cs?.subject_id && subjectIdToCs[cs.subject_id]) {
      classSubjectId = subjectIdToCs[cs.subject_id]
    }
    inserts.push({
      classroom_id: toClassroomId,
      academic_year_id: yearId,
      day_of_week: row.day_of_week,
      period: row.period,
      class_subject_id: classSubjectId,
      note: classSubjectId ? null : row.note,
      locked: row.locked,
    })
  }

  if (inserts.length) {
    await db.from('class_schedule_slots').insert(inserts)
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'copy',
    module: 'schedules',
    targetType: 'class_schedule',
    targetId: toClassroomId,
    description: `คัดลอกตารางเรียนจากห้องอื่น`,
  })

  return { ok: true, copied: inserts.length }
}

export async function clearClassSchedule(classroomId: string, yearId: string) {
  const session = await requireScheduleSession()
  if (!canEdit(session)) throw new Error('ไม่มีสิทธิ์')
  const db = createServerClient()
  await db.from('class_schedule_slots')
    .delete()
    .eq('classroom_id', classroomId)
    .eq('academic_year_id', yearId)
    .eq('locked', false)
  return { ok: true }
}

export async function runAutoScheduleClass(
  classroomId: string,
  yearId: string,
  mode: 'spread' | 'random' = 'spread',
  clearFirst = false,
) {
  const session = await requireScheduleSession()
  if (!canEdit(session)) throw new Error('ไม่มีสิทธิ์')

  const quotasData = await fetchScheduleQuotas(classroomId, yearId)
  const quotas = quotasData.items
    .map(i => ({
      classSubjectId: i.class_subject_id,
      count: Math.max(0, i.remaining),
    }))
    .filter(q => q.count > 0)

  const db = createServerClient()
  if (clearFirst) {
    await db.from('class_schedule_slots')
      .delete()
      .eq('classroom_id', classroomId)
      .eq('academic_year_id', yearId)
      .eq('locked', false)
  }

  const { data: existing } = await db.from('class_schedule_slots')
    .select('day_of_week, period, locked, class_subject_id')
    .eq('classroom_id', classroomId)
    .eq('academic_year_id', yearId)

  const occupied = new Set(
    (existing || [])
      .filter(r => r.locked || r.class_subject_id)
      .map(r => `${r.day_of_week}-${r.period}`),
  )

  const emptySlots: { day: number; period: number }[] = []
  for (const day of SCHEDULE_DAYS) {
    for (let period = 1; period <= SCHEDULE_PERIOD_COUNT; period++) {
      const key = `${day.value}-${period}`
      if (!occupied.has(key)) emptySlots.push({ day: day.value, period })
    }
  }

  const assignments = buildAutoAssignments(quotas, emptySlots, mode)
  for (const a of assignments) {
    await db.from('class_schedule_slots').upsert({
      classroom_id: classroomId,
      academic_year_id: yearId,
      day_of_week: a.day,
      period: a.period,
      class_subject_id: a.classSubjectId,
      note: null,
      locked: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'classroom_id,academic_year_id,day_of_week,period' })
  }

  await logActivity({
    actor: session,
    schoolId: session.schoolId,
    action: 'auto',
    module: 'schedules',
    targetType: 'class_schedule',
    targetId: classroomId,
    description: `จัดตารางอัตโนมัติ ${assignments.length} คาบ`,
  })

  return { ok: true, assigned: assignments.length }
}

export async function fetchScheduleExportContext() {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')
  const db = createServerClient()
  const { data: school } = await db.from('schools')
    .select('name, logo_url, director_name, director_position')
    .eq('id', session.schoolId)
    .maybeSingle()
  const periodTimes = await fetchPeriodTimes()
  return { school, periodTimes: periodTimes.times }
}

export async function fetchSubstituteDay(date: string, yearId: string) {
  const session = await requireScheduleSession()
  if (!session.schoolId) throw new Error('ไม่พบโรงเรียน')
  const db = createServerClient()

  const d = new Date(date + 'T12:00:00')
  const jsDay = d.getDay()
  const dayOfWeek = jsDay === 0 ? 7 : jsDay

  let { data: dayRow } = await db.from('schedule_substitute_days')
    .select('id, date, day_of_week, note')
    .eq('school_id', session.schoolId)
    .eq('date', date)
    .maybeSingle()

  if (!dayRow) {
    const { data: created } = await db.from('schedule_substitute_days')
      .insert({
        school_id: session.schoolId,
        academic_year_id: yearId,
        date,
        day_of_week: dayOfWeek,
      })
      .select('id, date, day_of_week, note')
      .single()
    dayRow = created
  }

  const { data: entries } = await db.from('schedule_substitute_entries')
    .select(`
      id, absent_teacher_id, period, class_subject_id, classroom_id,
      subject_label, room_label, substitute_teacher_id, leave_type, note
    `)
    .eq('substitute_day_id', dayRow!.id)
    .order('period')

  return {
    day: dayRow,
    day_label: SCHEDULE_DAYS.find(d => d.value === dayRow!.day_of_week)?.label || '',
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
        class_subject_id: row.class_subject_id,
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
    await db.from('schedule_substitute_entries').update({
      substitute_teacher_id: payload.substitute_teacher_id,
      leave_type: payload.leave_type,
      note: payload.note,
    }).eq('id', entryId)
  } else {
    await db.from('schedule_substitute_entries').insert({
      substitute_day_id: substituteDayId,
      ...payload,
    })
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

  await db.from('schedule_substitute_entries')
    .delete()
    .eq('substitute_day_id', substituteDayId)
    .eq('absent_teacher_id', absentTeacherId)

  if (slots.length) {
    await db.from('schedule_substitute_entries').insert(
      slots.map(s => ({
        substitute_day_id: substituteDayId,
        absent_teacher_id: absentTeacherId,
        period: s.period,
        class_subject_id: s.class_subject_id,
        classroom_id: s.classroom_id,
        subject_label: s.subject_label,
        room_label: s.room_label,
        leave_type: leaveType,
      })),
    )
  }
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
