'use server'

import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity, resolveClassSubjectContext } from '@/lib/audit'
import {
  buildTeachingWeeks,
  hoursPerWeek,
  hourlyCellKey,
  schoolDayCalendarFromLists,
  termDateRange,
  type HourlyStatus,
} from '@/lib/hourly-attendance'
import { fetchAllRows } from '@/lib/supabase-paginate'

const CAN_EDIT = ['admin', 'district', 'academic_head', 'deputy_principal', 'teacher']

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('ไม่มีสิทธิ์')
  return session
}

async function assertClassSubjectAccess(classSubjectId: string, session: Awaited<ReturnType<typeof requireSession>>) {
  const db = createServerClient()
  if (session.role === 'teacher') {
    const { data } = await db.from('class_subjects')
      .select('id, classroom_id, subject_id, academic_year_id')
      .eq('id', classSubjectId)
      .eq('teacher_id', session.userId)
      .maybeSingle()
    if (!data) throw new Error('บันทึกได้เฉพาะวิชาที่ตนสอน')
    return data
  }
  const { data } = await db.from('class_subjects')
    .select('id, classroom_id, subject_id, academic_year_id')
    .eq('id', classSubjectId)
    .maybeSingle()
  if (!data) throw new Error('ไม่พบรายวิชาในห้องนี้')
  return data
}

export async function fetchHourlyGrid(params: {
  classroomId: string
  classSubjectId: string
  academicYearId: string
  term: 1 | 2
}) {
  const session = await requireSession()
  const cs = await assertClassSubjectAccess(params.classSubjectId, session)
  if (cs.classroom_id !== params.classroomId) return { error: 'ห้องเรียนไม่ตรงกับรายวิชา กรุณาเลือกรายวิชาใหม่' }
  if (cs.academic_year_id !== params.academicYearId) return { error: 'ปีการศึกษาไม่ตรงกับรายวิชา กรุณาเลือกห้องและรายวิชาใหม่' }

  const db = createServerClient()
  const [yearR, studentsR, subjectR, records] = await Promise.all([
    db.from('academic_years')
      .select('id, year_be, term1_start_date, term1_end_date, term2_start_date, term2_end_date')
      .eq('id', params.academicYearId)
      .maybeSingle(),
    db.from('students')
      .select('id, student_number, student_code, prefix, first_name, last_name, status')
      .eq('classroom_id', params.classroomId)
      .order('student_number'),
    db.from('class_subjects')
      .select('id, subjects(code, name, hours_per_year)')
      .eq('id', params.classSubjectId)
      .maybeSingle(),
    fetchAllRows<{
      id: string
      student_id: string
      week_number: number
      hour_number: number
      status: string
    }>((from, to) => db.from('hourly_attendance')
      .select('id, student_id, week_number, hour_number, status')
      .eq('class_subject_id', params.classSubjectId)
      .eq('term', params.term)
      .order('week_number')
      .order('hour_number')
      .order('student_id')
      .range(from, to)),
  ])

  const year = yearR.data
  if (!year) return { error: 'ไม่พบปีการศึกษา กรุณาเลือกปีการศึกษาใหม่' }

  const students = studentsR.data || []
  const studentIds = students.map(row => row.id as string)

  const range = termDateRange(year, params.term)
  if (!range.start || !range.end) return { error: 'ยังไม่ได้กำหนดวันเปิด–ปิดภาคเรียน กรุณาตั้งค่าที่เมนูปีการศึกษา' }

  const [holidaysR, weekendR] = await Promise.all([
    db.from('holidays').select('date')
      .eq('academic_year_id', params.academicYearId)
      .gte('date', range.start)
      .lte('date', range.end),
    db.from('weekend_school_days').select('date')
      .eq('academic_year_id', params.academicYearId)
      .gte('date', range.start)
      .lte('date', range.end),
  ])
  const calendar = schoolDayCalendarFromLists(
    (holidaysR.data || []).map(row => row.date as string),
    (weekendR.data || []).map(row => row.date as string),
  )
  const weeks = buildTeachingWeeks(range.start, range.end, calendar)
  const teachingWeeks = weeks.slice(0, 20)
  const subjectJoin = subjectR.data?.subjects
  const subject = (Array.isArray(subjectJoin) ? subjectJoin[0] : subjectJoin) as
    { code: string; name: string; hours_per_year: number } | null | undefined
  const hpw = hoursPerWeek(subject?.hours_per_year || 0, teachingWeeks.length)
  const legacyRecords = records.filter(row => studentIds.includes(row.student_id) &&
    (row.hour_number < 1 || row.hour_number > hpw || !teachingWeeks.some(week => week.weekNumber === row.week_number)))

  const scheduleQuery = () => db.from('class_schedule_slots').select('period', { count: 'exact', head: true })
    .eq('classroom_id', params.classroomId).eq('academic_year_id', params.academicYearId).eq('class_subject_id', params.classSubjectId)
  let scheduled = await scheduleQuery().eq('semester', params.term)
  if (scheduled.error && ['42703', 'PGRST204'].includes(scheduled.error.code || '') && scheduled.error.message.includes('semester') && params.term === 1) scheduled = await scheduleQuery()
  const scheduleWarning = !scheduled.error && (scheduled.count || 0) > 0 && scheduled.count !== hpw
    ? `ตารางเรียนมี ${scheduled.count} คาบ/สัปดาห์ แต่ชั่วโมงรายวิชากำหนด ${hpw} คาบ/สัปดาห์ กรุณาตรวจสอบตารางเรียนหรือชั่วโมงรายวิชา` : ''

  const recordMap: Record<string, HourlyStatus> = {}
  for (const row of records) {
    const studentId = row.student_id as string
    if (studentIds.length && !studentIds.includes(studentId)) continue
    const key = hourlyCellKey(studentId, Number(row.week_number), Number(row.hour_number))
    recordMap[key] = row.status as HourlyStatus
  }

  return {
    role: session.role,
    canEdit: CAN_EDIT.includes(session.role),
    students,
    subject: {
      code: subject?.code || '',
      name: subject?.name || '',
      hoursPerYear: subject?.hours_per_year || 0,
    },
    weeks: teachingWeeks,
    hoursPerWeek: hpw,
    legacyRecords,
    scheduleWarning,
    records: recordMap,
    yearBe: year.year_be,
    termStart: range.start,
    termEnd: range.end,
  }
}

export async function saveHourlyCell(params: {
  classroomId: string
  classSubjectId: string
  term: 1 | 2
  studentId: string
  weekNumber: number
  slot: number
  anchorDate: string
  status: HourlyStatus
}) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  const cs = await assertClassSubjectAccess(params.classSubjectId, session)
  if (cs.classroom_id !== params.classroomId) return { error: 'ห้องเรียนไม่ตรงกับรายวิชา' }

  const db = createServerClient()
  const { data: subject, error: subjectError } = await db.from('subjects').select('hours_per_year').eq('id', cs.subject_id).maybeSingle()
  if (subjectError || !subject) return { error: 'ตรวจสอบชั่วโมงรายวิชาไม่สำเร็จ กรุณาลองใหม่' }
  const hpw = hoursPerWeek(subject.hours_per_year || 0, 20)
  if (!Number.isInteger(params.slot) || params.slot < 1 || params.slot > hpw ||
    !Number.isInteger(params.weekNumber) || params.weekNumber < 1 || params.weekNumber > 20) return { error: 'คาบหรือสัปดาห์เกินเวลาเรียนของรายวิชา กรุณารีเฟรชหน้า' }

  // Sparse: present (/) is default — delete row instead of storing '/'
  if (params.status === '/') {
    const { error } = await db.from('hourly_attendance')
      .delete()
      .eq('student_id', params.studentId)
      .eq('class_subject_id', params.classSubjectId)
      .eq('date', params.anchorDate)
      .eq('hour_number', params.slot)

    if (!error) {
      const context = await resolveClassSubjectContext(params.classSubjectId)
      await logActivity({
        actor: session,
        schoolId: context.schoolId ?? session.schoolId,
        action: 'delete',
        module: 'hourly_attendance',
        targetType: 'class_subject',
        targetId: params.classSubjectId,
        targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
        description: `ลบเวลาเรียนรายชั่วโมง (มา) ${context.subjectLabel || ''} สัปดาห์ ${params.weekNumber} คาบ ${params.slot}`,
        metadata: { ...params },
      })
    }
    return { error: error?.message ?? null }
  }

  const { error } = await db.from('hourly_attendance').upsert({
    student_id: params.studentId,
    classroom_id: params.classroomId,
    class_subject_id: params.classSubjectId,
    date: params.anchorDate,
    hour_number: params.slot,
    week_number: params.weekNumber,
    term: params.term,
    status: params.status,
    recorded_by: session.userId,
  }, { onConflict: 'student_id,class_subject_id,date,hour_number' })

  if (!error) {
    const context = await resolveClassSubjectContext(params.classSubjectId)
    await logActivity({
      actor: session,
      schoolId: context.schoolId ?? session.schoolId,
      action: 'upsert',
      module: 'hourly_attendance',
      targetType: 'class_subject',
      targetId: params.classSubjectId,
      targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
      description: `บันทึกเวลาเรียนรายชั่วโมง ${context.subjectLabel || ''} สัปดาห์ ${params.weekNumber} คาบ ${params.slot}`,
      metadata: { ...params },
    })
  }
  return { error: error?.message ?? null }
}

export async function fillHourlyPresentAll(params: {
  classroomId: string
  classSubjectId: string
  academicYearId: string
  term: 1 | 2
}) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์', filled: 0 }
  const cs = await assertClassSubjectAccess(params.classSubjectId, session)
  if (cs.classroom_id !== params.classroomId) return { error: 'ห้องเรียนไม่ตรงกับรายวิชา', filled: 0 }

  const db = createServerClient()
  const grid = await fetchHourlyGrid(params)
  if ('error' in grid) return { error: grid.error, filled: 0 }
  if (!grid.weeks.length) return { error: 'ไม่มีสัปดาห์เรียน', filled: 0 }
  const { count, error: countError } = await db.from('hourly_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('class_subject_id', params.classSubjectId)
    .eq('term', params.term)
    .gte('hour_number', 1).lte('hour_number', grid.hoursPerWeek)
    .in('week_number', grid.weeks.map(week => week.weekNumber))

  if (countError) return { error: countError.message, filled: 0 }
  const filled = count || 0
  if (filled === 0) return { error: null, filled: 0 }

  const { error } = await db.from('hourly_attendance')
    .delete()
    .eq('class_subject_id', params.classSubjectId)
    .eq('term', params.term)
    .gte('hour_number', 1).lte('hour_number', grid.hoursPerWeek)
    .in('week_number', grid.weeks.map(week => week.weekNumber))

  if (error) return { error: error.message, filled: 0 }

  const context = await resolveClassSubjectContext(params.classSubjectId)
  await logActivity({
    actor: session,
    schoolId: context.schoolId ?? session.schoolId,
    action: 'delete',
    module: 'hourly_attendance',
    targetType: 'class_subject',
    targetId: params.classSubjectId,
    targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
    description: `เช็คมาทั้งหมด (ลบ ${filled} แถว) · ${context.subjectLabel || ''} ภาคเรียนที่ ${params.term}`,
    metadata: { ...params, filled },
  })

  return { error: null, filled }
}

export async function fillHourlyPresentColumn(params: {
  classroomId: string
  classSubjectId: string
  academicYearId: string
  term: 1 | 2
  weekNumber: number
  slot: number
}) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์', filled: 0 }
  const cs = await assertClassSubjectAccess(params.classSubjectId, session)
  if (cs.classroom_id !== params.classroomId) return { error: 'ห้องเรียนไม่ตรงกับรายวิชา', filled: 0 }

  const db = createServerClient()
  const grid = await fetchHourlyGrid(params)
  if ('error' in grid) return { error: grid.error, filled: 0 }
  if (!grid.weeks.some(week => week.weekNumber === params.weekNumber) || !Number.isInteger(params.slot) || params.slot < 1 || params.slot > grid.hoursPerWeek) return { error: 'คาบหรือสัปดาห์ไม่ถูกต้อง', filled: 0 }
  const { count, error: countError } = await db.from('hourly_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('class_subject_id', params.classSubjectId)
    .eq('term', params.term)
    .eq('week_number', params.weekNumber)
    .eq('hour_number', params.slot)

  if (countError) return { error: countError.message, filled: 0 }
  const filled = count || 0
  if (filled === 0) return { error: null, filled: 0 }

  const { error } = await db.from('hourly_attendance')
    .delete()
    .eq('class_subject_id', params.classSubjectId)
    .eq('term', params.term)
    .eq('week_number', params.weekNumber)
    .eq('hour_number', params.slot)

  if (error) return { error: error.message, filled: 0 }

  const context = await resolveClassSubjectContext(params.classSubjectId)
  await logActivity({
    actor: session,
    schoolId: context.schoolId ?? session.schoolId,
    action: 'delete',
    module: 'hourly_attendance',
    targetType: 'class_subject',
    targetId: params.classSubjectId,
    targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
    description: `มาทุกคน (ลบ ${filled} แถว) สัปดาห์ ${params.weekNumber} คาบ ${params.slot} · ${context.subjectLabel || ''}`,
    metadata: { ...params, filled },
  })

  return { error: null, filled }
}

export async function clearHourlyPresentColumn(params: {
  classroomId: string
  classSubjectId: string
  academicYearId: string
  term: 1 | 2
  weekNumber: number
  slot: number
}) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์', deleted: 0 }
  const cs = await assertClassSubjectAccess(params.classSubjectId, session)
  if (cs.classroom_id !== params.classroomId) return { error: 'ห้องเรียนไม่ตรงกับรายวิชา', deleted: 0 }

  const db = createServerClient()
  const grid = await fetchHourlyGrid({
    classroomId: params.classroomId,
    classSubjectId: params.classSubjectId,
    academicYearId: params.academicYearId,
    term: params.term,
  })
  if ('error' in grid) return { error: grid.error, deleted: 0 }

  const week = grid.weeks.find(item => item.weekNumber === params.weekNumber)
  if (!week) return { error: 'ไม่พบสัปดาห์', deleted: 0 }
  if (params.slot < 1 || params.slot > grid.hoursPerWeek) return { error: 'คาบไม่ถูกต้อง', deleted: 0 }

  const rows = grid.students.map(student => ({
    student_id: student.id as string,
    classroom_id: params.classroomId,
    class_subject_id: params.classSubjectId,
    date: week.startDate,
    hour_number: params.slot,
    week_number: params.weekNumber,
    term: params.term,
    status: 'ข' as HourlyStatus,
    recorded_by: session.userId,
  }))

  if (rows.length === 0) return { error: null, deleted: 0 }

  const { error } = await db.from('hourly_attendance').upsert(rows, {
    onConflict: 'student_id,class_subject_id,date,hour_number',
  })
  if (error) return { error: error.message, deleted: 0 }

  const context = await resolveClassSubjectContext(params.classSubjectId)
  await logActivity({
    actor: session,
    schoolId: context.schoolId ?? session.schoolId,
    action: 'upsert',
    module: 'hourly_attendance',
    targetType: 'class_subject',
    targetId: params.classSubjectId,
    targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
    description: `ไม่มาทุกคน (ข) ${rows.length} ช่อง · สัปดาห์ ${params.weekNumber} คาบ ${params.slot} · ${context.subjectLabel || ''}`,
    metadata: { ...params, deleted: rows.length },
  })

  return { error: null, deleted: rows.length }
}

export async function clearHourlyAttendanceAll(params: {
  classroomId: string
  academicYearId: string
  classSubjectId: string
  term: 1 | 2
}) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์', deleted: 0 }
  await assertClassSubjectAccess(params.classSubjectId, session)

  const db = createServerClient()
  const grid = await fetchHourlyGrid(params)
  if ('error' in grid) return { error: grid.error, deleted: 0 }
  if (!grid.weeks.length) return { error: 'ไม่มีสัปดาห์เรียน', deleted: 0 }
  const { count, error: countError } = await db.from('hourly_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('class_subject_id', params.classSubjectId)
    .eq('term', params.term)
    .gte('hour_number', 1).lte('hour_number', grid.hoursPerWeek)
    .in('week_number', grid.weeks.map(week => week.weekNumber))

  if (countError) return { error: countError.message, deleted: 0 }

  const { error } = await db.from('hourly_attendance')
    .delete()
    .eq('class_subject_id', params.classSubjectId)
    .eq('term', params.term)
    .gte('hour_number', 1).lte('hour_number', grid.hoursPerWeek)
    .in('week_number', grid.weeks.map(week => week.weekNumber))

  if (error) return { error: error.message, deleted: 0 }

  const context = await resolveClassSubjectContext(params.classSubjectId)
  await logActivity({
    actor: session,
    schoolId: context.schoolId ?? session.schoolId,
    action: 'delete',
    module: 'hourly_attendance',
    targetType: 'class_subject',
    targetId: params.classSubjectId,
    targetLabel: [context.subjectLabel, context.classroomLabel].filter(Boolean).join(' · '),
    description: `ลบข้อมูลเวลาเรียนทั้งหมด ${count || 0} รายการ · ${context.subjectLabel || ''} ภาคเรียนที่ ${params.term}`,
    metadata: { ...params, deleted: count || 0 },
  })

  return { error: null, deleted: count || 0 }
}

export async function moveLegacyHourlyRecord(params: {
  classroomId: string; classSubjectId: string; academicYearId: string; term: 1 | 2
  recordId: string; weekNumber: number; slot: number
}) {
  const session = await requireSession()
  if (!CAN_EDIT.includes(session.role)) return { error: 'ไม่มีสิทธิ์' }
  const db = createServerClient()
  const { data: year } = await db.from('academic_years').select('id').eq('id', params.academicYearId).eq('school_id', session.schoolId || '').maybeSingle()
  if (!year) return { error: 'ไม่พบปีการศึกษาในโรงเรียนนี้' }
  const grid = await fetchHourlyGrid(params)
  if ('error' in grid) return { error: grid.error }
  const source = grid.legacyRecords.find(row => row.id === params.recordId)
  const week = grid.weeks.find(item => item.weekNumber === params.weekNumber)
  if (!source || !week || !Number.isInteger(params.slot) || params.slot < 1 || params.slot > grid.hoursPerWeek) return { error: 'ไม่พบรายการเดิมหรือคาบปลายทางไม่ถูกต้อง' }
  const { data: target, error: readError } = await db.from('hourly_attendance').select('id')
    .eq('class_subject_id', params.classSubjectId).eq('term', params.term).eq('student_id', source.student_id)
    .eq('week_number', params.weekNumber).eq('hour_number', params.slot).maybeSingle()
  if (readError || target) return { error: readError?.message || 'คาบปลายทางมีข้อมูลแล้ว กรุณาเลือกคาบอื่น ไม่สามารถเขียนทับได้' }
  // Copy first; never remove the original until the new row has been saved.
  const { error: copyError } = await db.from('hourly_attendance').insert({
    student_id: source.student_id, classroom_id: params.classroomId, class_subject_id: params.classSubjectId,
    date: week.startDate, week_number: params.weekNumber, hour_number: params.slot, term: params.term,
    status: source.status, recorded_by: session.userId,
  })
  if (copyError) return { error: 'บันทึกปลายทางไม่สำเร็จ ข้อมูลเดิมยังอยู่: ' + copyError.message }
  const { data: removed, error: deleteError } = await db.from('hourly_attendance').delete()
    .eq('id', source.id).eq('class_subject_id', params.classSubjectId).eq('term', params.term).eq('status', source.status).select('id')
  if (deleteError || !removed?.length) return { error: 'คัดลอกไปคาบปลายทางแล้ว แต่ยังนำรายการเดิมออกไม่ได้ กรุณารีเฟรชเพื่อตรวจสอบ ข้อมูลทั้งสองรายการยังอยู่' }
  await logActivity({ actor: session, schoolId: session.schoolId, action: 'update', module: 'hourly_attendance',
    targetType: 'class_subject', targetId: params.classSubjectId,
    description: `ย้ายรายการเวลาเรียนเดิม สัปดาห์ ${source.week_number} คาบ ${source.hour_number} ไปสัปดาห์ ${params.weekNumber} คาบ ${params.slot}`,
    metadata: { ...params, studentId: source.student_id },
  })
  return { error: null }
}
