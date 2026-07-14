'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity } from '@/lib/audit'
import { isDailyPresent } from '@/lib/daily-attendance'

type ClassroomAdminSession = {
  userId: string
  role: string
  schoolId: string | null
  fullName: string
}

type AttendanceStatus = 'ม' | 'ป' | 'ล' | 'ข'
type ActivityType = 'saving' | 'milk' | 'cleaning' | 'brushing' | 'lunch'
type InspectionField = 'nails' | 'hair' | 'ears' | 'nose' | 'teeth' | 'skin' | 'clothes'
type ActivityRecord = { student_id: string; date?: string; value: number | null; is_manual_override?: boolean | null }

const EDIT_ROLES = ['admin', 'academic_head', 'deputy_principal']
const VIEW_ROLES = ['admin', 'academic_head', 'deputy_principal', 'principal', 'teacher']
const ACTIVITY_LABELS: Record<ActivityType, string> = {
  saving: 'การออม',
  milk: 'ดื่มนม',
  cleaning: 'ทำความสะอาดห้อง',
  brushing: 'แปรงฟัน',
  lunch: 'อาหารกลางวัน',
}
const ATTENDANCE_SYNC_ACTIVITY_TYPES: ActivityType[] = ['brushing', 'milk', 'lunch', 'cleaning']

async function requireClassroomAdminSession() {
  const session = await getSession()
  if (!session || !VIEW_ROLES.includes(session.role)) throw new Error('ไม่มีสิทธิ์')
  return session as ClassroomAdminSession
}

function canEdit(session: ClassroomAdminSession) {
  return EDIT_ROLES.includes(session.role) || session.role === 'teacher'
}

async function getClassroomForAccess(classroomId: string, session: ClassroomAdminSession) {
  const db = createServerClient()
  const { data: classroom } = await db.from('classrooms')
    .select('id, level, room, school_id, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', classroomId)
    .maybeSingle()

  if (!classroom) return { error: 'ไม่พบห้องเรียน' as const, classroom: null }
  if (session.role !== 'district' && classroom.school_id !== session.schoolId) {
    return { error: 'ไม่มีสิทธิ์เข้าถึงห้องเรียนนี้' as const, classroom: null }
  }
  if (session.role === 'teacher') {
    const isHomeroom = classroom.homeroom_teacher_id === session.userId || classroom.homeroom_teacher2_id === session.userId
    if (!isHomeroom) return { error: 'บันทึกได้เฉพาะห้องที่เป็นครูประจำชั้น' as const, classroom: null }
  }
  return { error: null, classroom }
}

async function fetchStudentsForClassroom(classroomId: string) {
  const db = createServerClient()
  const { data } = await db.from('students')
    .select('id, student_number, prefix, first_name, last_name, gender, birth_date, status')
    .eq('classroom_id', classroomId)
    .order('student_number')
  return data || []
}

function calcBmi(weight: number | null, height: number | null) {
  if (!weight || !height || height <= 0) return null
  const meters = height / 100
  return Number((weight / (meters * meters)).toFixed(2))
}

function bmiResult(bmi: number | null) {
  if (bmi == null) return null
  if (bmi < 18.5) return 'ผอม'
  if (bmi < 23) return 'สมส่วน'
  if (bmi < 25) return 'ท้วม'
  return 'อ้วน'
}

function monthRange(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = new Date(year, month, 0)
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
  return { year, month, start, end, days: endDate.getDate() }
}

function dayOf(date: string) {
  return Number(date.slice(8, 10))
}

function isoDateFromMonthDay(monthKey: string, day: number) {
  const { year, month } = monthRange(monthKey)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isWeekendDate(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay()
  return day === 0 || day === 6
}

function isAttendanceSyncedActivity(activityType: ActivityType) {
  return ATTENDANCE_SYNC_ACTIVITY_TYPES.includes(activityType)
}

async function fetchWeekendSchoolDaysForRange(academicYearId: string, start: string, end: string) {
  const db = createServerClient()
  const { data, error } = await db.from('weekend_school_days')
    .select('date, name')
    .eq('academic_year_id', academicYearId)
    .gte('date', start)
    .lte('date', end)
  if (error) return []
  return data || []
}

async function filterRowsForTeachingDays<T extends { day: number }>(academicYearId: string, monthKey: string, rows: T[]) {
  const db = createServerClient()
  const range = monthRange(monthKey)
  const [holidaysRes, weekendSchoolDays] = await Promise.all([
    db.from('holidays')
      .select('date')
      .eq('academic_year_id', academicYearId)
      .gte('date', range.start)
      .lte('date', range.end),
    fetchWeekendSchoolDaysForRange(academicYearId, range.start, range.end),
  ])
  const holidays = new Set((holidaysRes.data || []).map(h => h.date))
  const openWeekendDays = new Set(weekendSchoolDays.map(d => d.date))

  return rows.filter(row => {
    const date = isoDateFromMonthDay(monthKey, row.day)
    if (holidays.has(date)) return false
    if (isWeekendDate(date) && !openWeekendDays.has(date)) return false
    return true
  })
}

async function fetchAcademicYearTermResolver(academicYearId: string) {
  const db = createServerClient()
  const { data } = await db.from('academic_years')
    .select('term1_start_date, term1_end_date, term2_start_date, term2_end_date')
    .eq('id', academicYearId)
    .maybeSingle()

  return (date: string): 1 | 2 => {
    if (data?.term2_start_date && data?.term2_end_date && date >= data.term2_start_date && date <= data.term2_end_date) {
      return 2
    }
    return 1
  }
}

async function syncAttendanceActivitiesFromDates(
  classroomId: string,
  academicYearId: string,
  userId: string,
  rows: { student_id: string; date: string; status: AttendanceStatus }[],
) {
  if (rows.length === 0) return null
  const db = createServerClient()
  const resolveTerm = await fetchAcademicYearTermResolver(academicYearId)
  const payload = rows.flatMap(row => ATTENDANCE_SYNC_ACTIVITY_TYPES.map(activityType => ({
    student_id: row.student_id,
    classroom_id: classroomId,
    date: row.date,
    term: resolveTerm(row.date),
    activity_type: activityType,
    value: isDailyPresent(row.status) ? 1 : 0,
    recorded_by: userId,
    is_manual_override: false,
  })))

  const { error } = await upsertDailyActivities(payload)
  return error?.message || null
}

async function fetchDailyActivityRows(
  classroomId: string,
  activityType: ActivityType,
  start: string,
  end?: string,
) {
  const db = createServerClient()
  const base = db.from('daily_activities')
  const query = (select: string) => {
    let q = base.select(select)
      .eq('classroom_id', classroomId)
      .eq('activity_type', activityType)
    if (end) q = q.gte('date', start).lte('date', end)
    else q = q.eq('date', start)
    return q
  }

  const withOverride = await query('student_id, date, value, is_manual_override')
  if (!withOverride.error) return (withOverride.data ?? []) as unknown as ActivityRecord[]

  const withoutOverride = await query('student_id, date, value')
  return (withoutOverride.data ?? []) as unknown as ActivityRecord[]
}

async function upsertDailyActivities(rows: Record<string, unknown>[]) {
  const db = createServerClient()
  const withOverride = await db.from('daily_activities').upsert(rows, { onConflict: 'student_id,date,activity_type' })
  if (!withOverride.error) return withOverride

  const fallbackRows = rows.map(({ is_manual_override: _unused, ...row }) => row)
  return db.from('daily_activities').upsert(fallbackRows, { onConflict: 'student_id,date,activity_type' })
}

export async function fetchClassroomAdminContext() {
  const session = await requireClassroomAdminSession()
  const db = createServerClient()
  const sid = session.schoolId || ''

  const yearsRes = await db.from('academic_years')
    .select('id, year_be, is_active')
    .eq('school_id', sid)
    .order('year_be', { ascending: false })

  let classroomQuery = db.from('classrooms')
    .select('id, level, room, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('school_id', sid)
    .order('level')
    .order('room')

  if (session.role === 'teacher') {
    classroomQuery = classroomQuery.or(`homeroom_teacher_id.eq.${session.userId},homeroom_teacher2_id.eq.${session.userId}`)
  }

  const classroomsRes = await classroomQuery
  const classrooms = classroomsRes.data || []
  const classroomIds = classrooms.map(c => c.id)
  const teacherIds = Array.from(new Set(classrooms.flatMap(c => [c.homeroom_teacher_id, c.homeroom_teacher2_id]).filter(Boolean)))
  let countMap: Record<string, number> = {}
  if (classroomIds.length > 0) {
    const { data: students } = await db.from('students').select('classroom_id').in('classroom_id', classroomIds)
    countMap = (students || []).reduce((acc: Record<string, number>, row: { classroom_id: string }) => {
      acc[row.classroom_id] = (acc[row.classroom_id] || 0) + 1
      return acc
    }, {})
  }
  let teacherNameMap: Record<string, string> = {}
  if (teacherIds.length > 0) {
    const { data: teachers } = await db.from('users').select('id, full_name').in('id', teacherIds)
    teacherNameMap = Object.fromEntries((teachers || []).map(t => [t.id, t.full_name]))
  }
  let school: {
    name: string | null
    logo_url: string | null
    director_name: string | null
    acting_director: string | null
    acting_director_position?: string | null
  } | null = null
  const schoolWithPosition = await db.from('schools')
    .select('name, logo_url, director_name, acting_director, acting_director_position')
    .eq('id', sid)
    .maybeSingle()
  if (schoolWithPosition.error?.message?.includes('acting_director_position')) {
    const fallback = await db.from('schools')
      .select('name, logo_url, director_name, acting_director')
      .eq('id', sid)
      .maybeSingle()
    school = fallback.data ? { ...fallback.data, acting_director_position: null } : null
  } else {
    school = schoolWithPosition.data
  }

  // อ่านสวิตช์เมนู "ปรับ layout" แบบ defensive (ถ้าคอลัมน์ยังไม่มี ให้ถือว่าเปิด)
  const tunerR = await db.from('schools').select('layout_tuner_enabled').eq('id', sid).maybeSingle()
  const layoutTunerEnabled = (tunerR.data as { layout_tuner_enabled?: boolean } | null)?.layout_tuner_enabled !== false

  return {
    role: session.role,
    canEdit: canEdit(session) && session.role !== 'principal',
    currentUserName: session.fullName,
    layoutTunerEnabled,
    schoolName: school?.name || '',
    schoolLogoUrl: school?.logo_url || '',
    directorName: school?.director_name || '',
    actingDirector: school?.acting_director || '',
    actingDirectorPosition: school?.acting_director_position || '',
    years: yearsRes.data || [],
    classrooms: classrooms.map(c => ({
      ...c,
      student_count: countMap[c.id] || 0,
      homeroom_teacher_name: c.homeroom_teacher_id ? teacherNameMap[c.homeroom_teacher_id] || '' : '',
      homeroom_teacher2_name: c.homeroom_teacher2_id ? teacherNameMap[c.homeroom_teacher2_id] || '' : '',
    })),
  }
}

export async function fetchDailyAttendance(classroomId: string, date: string) {
  const session = await requireClassroomAdminSession()
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, students: [], records: {} }

  const db = createServerClient()
  const [students, recordsRes] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    db.from('daily_attendance').select('student_id, status').eq('classroom_id', classroomId).eq('date', date),
  ])

  return {
    error: null,
    students,
    records: Object.fromEntries((recordsRes.data || []).map(r => [r.student_id, r.status])),
  }
}

export async function saveDailyAttendance(classroomId: string, date: string, rows: { student_id: string; status: AttendanceStatus }[]) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', count: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, count: 0 }
  if (!date || rows.length === 0) return { error: 'ไม่มีข้อมูลให้บันทึก', count: 0 }

  const db = createServerClient()
  const payload = rows.map(row => ({
    student_id: row.student_id,
    classroom_id: classroomId,
    date,
    status: row.status,
    recorded_by: session.userId,
  }))
  const { error } = await db.from('daily_attendance').upsert(payload, { onConflict: 'student_id,date' })
  let syncError: string | null = null
  if (!error) {
    syncError = await syncAttendanceActivitiesFromDates(
      classroomId,
      access.classroom.academic_year_id,
      session.userId,
      payload.map(row => ({ student_id: row.student_id, date: row.date, status: row.status })),
    )
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_attendance',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `บันทึกเวลาเรียนรายวัน ${access.classroom.level}/${access.classroom.room} วันที่ ${date} จำนวน ${rows.length} คน`,
      metadata: { classroomId, date, count: rows.length },
    })
  }
  return { error: error?.message || (syncError ? `บันทึกเวลาเรียนแล้ว แต่ sync กิจกรรมไม่สำเร็จ: ${syncError}` : null), count: error ? 0 : rows.length }
}

export async function fetchMonthlyAttendance(classroomId: string, academicYearId: string, monthKey: string) {
  const session = await requireClassroomAdminSession()
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, students: [], records: {}, holidays: [], days: 0 }

  const db = createServerClient()
  const range = monthRange(monthKey)
  const [students, recordsRes, holidaysRes, weekendSchoolDays] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    db.from('daily_attendance')
      .select('student_id, date, status')
      .eq('classroom_id', classroomId)
      .gte('date', range.start)
      .lte('date', range.end),
    db.from('holidays')
      .select('date, name')
      .eq('academic_year_id', academicYearId)
      .gte('date', range.start)
      .lte('date', range.end),
    fetchWeekendSchoolDaysForRange(academicYearId, range.start, range.end),
  ])

  const records = (recordsRes.data || []).reduce((acc: Record<string, Record<number, AttendanceStatus>>, row) => {
    acc[row.student_id] = acc[row.student_id] || {}
    acc[row.student_id][dayOf(row.date)] = row.status as AttendanceStatus
    return acc
  }, {})

  return { error: null, students, records, holidays: holidaysRes.data || [], weekendSchoolDays, days: range.days }
}

export async function saveMonthlyAttendance(
  classroomId: string,
  monthKey: string,
  rows: { student_id: string; day: number; status: AttendanceStatus }[],
) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', count: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, count: 0 }
  if (!monthKey || rows.length === 0) return { error: 'ไม่มีข้อมูลให้บันทึก', count: 0 }

  const db = createServerClient()
  const teachingRows = await filterRowsForTeachingDays(access.classroom.academic_year_id, monthKey, rows)
  if (teachingRows.length === 0) return { error: 'ไม่มีวันเปิดสอนให้บันทึก', count: 0 }
  const payload = teachingRows.map(row => ({
    student_id: row.student_id,
    classroom_id: classroomId,
    date: isoDateFromMonthDay(monthKey, row.day),
    status: row.status,
    recorded_by: session.userId,
  }))
  const { error } = await db.from('daily_attendance').upsert(payload, { onConflict: 'student_id,date' })
  let syncError: string | null = null
  if (!error) {
    syncError = await syncAttendanceActivitiesFromDates(
      classroomId,
      access.classroom.academic_year_id,
      session.userId,
      payload.map(row => ({ student_id: row.student_id, date: row.date, status: row.status })),
    )
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_attendance',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `บันทึกเวลาเรียนรายเดือน ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey} จำนวน ${teachingRows.length} ช่อง`,
      metadata: { classroomId, monthKey, count: teachingRows.length, skippedClosedDays: rows.length - teachingRows.length, syncedActivities: !syncError },
    })
  }
  return { error: error?.message || (syncError ? `บันทึกเวลาเรียนแล้ว แต่ sync กิจกรรมไม่สำเร็จ: ${syncError}` : null), count: error ? 0 : teachingRows.length }
}

export async function fillDailyPresentAll(classroomId: string, monthKey: string) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', filled: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, filled: 0 }
  if (!monthKey) return { error: 'ไม่พบเดือน', filled: 0 }

  const db = createServerClient()
  const range = monthRange(monthKey)
  const [students, recordsRes] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    db.from('daily_attendance')
      .select('student_id, date')
      .eq('classroom_id', classroomId)
      .gte('date', range.start)
      .lte('date', range.end),
  ])

  const existing = new Set((recordsRes.data || []).map(row => `${row.student_id}:${dayOf(row.date)}`))
  const rows: { student_id: string; day: number; status: AttendanceStatus }[] = []

  for (const student of students) {
    for (let day = 1; day <= range.days; day += 1) {
      if (existing.has(`${student.id}:${day}`)) continue
      rows.push({ student_id: student.id, day, status: 'ม' })
    }
  }

  if (rows.length === 0) return { error: null, filled: 0 }

  const teachingRows = await filterRowsForTeachingDays(access.classroom.academic_year_id, monthKey, rows)
  if (teachingRows.length === 0) return { error: null, filled: 0 }

  const payload = teachingRows.map(row => ({
    student_id: row.student_id,
    classroom_id: classroomId,
    date: isoDateFromMonthDay(monthKey, row.day),
    status: row.status,
    recorded_by: session.userId,
  }))
  const { error } = await db.from('daily_attendance').upsert(payload, { onConflict: 'student_id,date' })
  let syncError: string | null = null
  if (!error) {
    syncError = await syncAttendanceActivitiesFromDates(
      classroomId,
      access.classroom.academic_year_id,
      session.userId,
      payload.map(row => ({ student_id: row.student_id, date: row.date, status: row.status })),
    )
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_attendance',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `เช็คมาทั้งหมด ${teachingRows.length} ช่อง · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
      metadata: { classroomId, monthKey, filled: teachingRows.length },
    })
  }
  return {
    error: error?.message || (syncError ? `บันทึกเวลาเรียนแล้ว แต่ sync กิจกรรมไม่สำเร็จ: ${syncError}` : null),
    filled: error ? 0 : teachingRows.length,
  }
}

export async function fillDailyPresentColumn(classroomId: string, monthKey: string, day: number) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', filled: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, filled: 0 }
  if (!monthKey || day < 1) return { error: 'ข้อมูลไม่ครบ', filled: 0 }

  const students = await fetchStudentsForClassroom(classroomId)
  const rows = students.map(student => ({ student_id: student.id, day, status: 'ม' as AttendanceStatus }))
  const teachingRows = await filterRowsForTeachingDays(access.classroom.academic_year_id, monthKey, rows)
  if (teachingRows.length === 0) return { error: 'ไม่มีวันเปิดสอนให้บันทึก', filled: 0 }

  const db = createServerClient()
  const payload = teachingRows.map(row => ({
    student_id: row.student_id,
    classroom_id: classroomId,
    date: isoDateFromMonthDay(monthKey, row.day),
    status: row.status,
    recorded_by: session.userId,
  }))
  const { error } = await db.from('daily_attendance').upsert(payload, { onConflict: 'student_id,date' })
  let syncError: string | null = null
  if (!error) {
    syncError = await syncAttendanceActivitiesFromDates(
      classroomId,
      access.classroom.academic_year_id,
      session.userId,
      payload.map(row => ({ student_id: row.student_id, date: row.date, status: row.status })),
    )
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_attendance',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `มาทุกคน วันที่ ${day} · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
      metadata: { classroomId, monthKey, day, filled: teachingRows.length },
    })
  }
  return {
    error: error?.message || (syncError ? `บันทึกเวลาเรียนแล้ว แต่ sync กิจกรรมไม่สำเร็จ: ${syncError}` : null),
    filled: error ? 0 : teachingRows.length,
  }
}

export async function clearDailyPresentColumn(classroomId: string, monthKey: string, day: number) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', deleted: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, deleted: 0 }
  if (!monthKey || day < 1) return { error: 'ข้อมูลไม่ครบ', deleted: 0 }

  const teachingRows = await filterRowsForTeachingDays(
    access.classroom.academic_year_id,
    monthKey,
    [{ day }],
  )
  if (teachingRows.length === 0) return { error: 'ไม่มีวันเปิดสอนให้ลบ', deleted: 0 }

  const date = isoDateFromMonthDay(monthKey, day)
  const db = createServerClient()
  const { data: records, error: fetchError } = await db.from('daily_attendance')
    .select('student_id, date')
    .eq('classroom_id', classroomId)
    .eq('date', date)

  if (fetchError) return { error: fetchError.message, deleted: 0 }

  const deletedCount = records?.length || 0
  if (deletedCount === 0) return { error: null, deleted: 0 }

  const { error } = await db.from('daily_attendance')
    .delete()
    .eq('classroom_id', classroomId)
    .eq('date', date)

  if (error) return { error: error.message, deleted: 0 }

  const syncError = await syncAttendanceActivitiesFromDates(
    classroomId,
    access.classroom.academic_year_id,
    session.userId,
    (records || []).map(row => ({ student_id: row.student_id, date: row.date, status: 'ข' as AttendanceStatus })),
  )

  await logActivity({
    actor: session,
    schoolId: access.classroom.school_id,
    action: 'delete',
    module: 'classroom_admin',
    targetType: 'daily_attendance',
    targetId: classroomId,
    targetLabel: `${access.classroom.level}/${access.classroom.room}`,
    description: `ไม่มาทุกคน ลบ ${deletedCount} ช่อง · วันที่ ${day} · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
    metadata: { classroomId, monthKey, day, deleted: deletedCount },
  })

  return {
    error: syncError ? `ลบข้อมูลแล้ว แต่ sync กิจกรรมไม่สำเร็จ: ${syncError}` : null,
    deleted: deletedCount,
  }
}

export async function clearDailyAttendanceMonth(classroomId: string, monthKey: string) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', deleted: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, deleted: 0 }
  if (!monthKey) return { error: 'ไม่พบเดือน', deleted: 0 }

  const db = createServerClient()
  const range = monthRange(monthKey)
  const { data: records, error: fetchError } = await db.from('daily_attendance')
    .select('student_id, date')
    .eq('classroom_id', classroomId)
    .gte('date', range.start)
    .lte('date', range.end)

  if (fetchError) return { error: fetchError.message, deleted: 0 }

  const deletedCount = records?.length || 0
  if (deletedCount === 0) return { error: null, deleted: 0 }

  const { error } = await db.from('daily_attendance')
    .delete()
    .eq('classroom_id', classroomId)
    .gte('date', range.start)
    .lte('date', range.end)

  if (error) return { error: error.message, deleted: 0 }

  const syncError = await syncAttendanceActivitiesFromDates(
    classroomId,
    access.classroom.academic_year_id,
    session.userId,
    (records || []).map(row => ({ student_id: row.student_id, date: row.date, status: 'ข' as AttendanceStatus })),
  )

  await logActivity({
    actor: session,
    schoolId: access.classroom.school_id,
    action: 'delete',
    module: 'classroom_admin',
    targetType: 'daily_attendance',
    targetId: classroomId,
    targetLabel: `${access.classroom.level}/${access.classroom.room}`,
    description: `ลบข้อมูลเวลาเรียนรายเดือน ${deletedCount} ช่อง · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
    metadata: { classroomId, monthKey, deleted: deletedCount },
  })

  return {
    error: syncError ? `ลบข้อมูลแล้ว แต่ sync กิจกรรมไม่สำเร็จ: ${syncError}` : null,
    deleted: deletedCount,
  }
}

async function upsertSyncedActivityTeachingRows(
  classroomId: string,
  monthKey: string,
  term: 1 | 2,
  activityType: ActivityType,
  session: ClassroomAdminSession,
  classroom: NonNullable<Awaited<ReturnType<typeof getClassroomForAccess>>['classroom']>,
  rows: { student_id: string; day: number; value: number }[],
) {
  if (!isAttendanceSyncedActivity(activityType)) return { error: 'ไม่รองรับกิจกรรมนี้', count: 0 }
  if (rows.length === 0) return { error: null, count: 0 }

  const teachingRows = await filterRowsForTeachingDays(classroom.academic_year_id, monthKey, rows)
  if (teachingRows.length === 0) return { error: null, count: 0 }

  const payload = teachingRows.map(row => ({
    student_id: row.student_id,
    classroom_id: classroomId,
    date: isoDateFromMonthDay(monthKey, row.day),
    term,
    activity_type: activityType,
    value: row.value,
    recorded_by: session.userId,
    is_manual_override: true,
  }))
  const { error } = await upsertDailyActivities(payload)
  return { error: error?.message || null, count: error ? 0 : teachingRows.length }
}

async function buildSyncedActivityEffectiveDone(
  classroomId: string,
  monthKey: string,
  activityType: ActivityType,
) {
  const db = createServerClient()
  const range = monthRange(monthKey)
  const students = await fetchStudentsForClassroom(classroomId)
  const [records, attendanceRes] = await Promise.all([
    fetchDailyActivityRows(classroomId, activityType, range.start, range.end),
    db.from('daily_attendance')
      .select('student_id, date, status')
      .eq('classroom_id', classroomId)
      .gte('date', range.start)
      .lte('date', range.end),
  ])

  const manualMap = new Map<string, number>()
  for (const row of records) {
    if (row.is_manual_override === true) {
      manualMap.set(`${row.student_id}:${dayOf(row.date || '')}`, Number(row.value ?? 0))
    }
  }

  const attendanceMap = new Map<string, boolean>()
  for (const row of attendanceRes.data || []) {
    attendanceMap.set(`${row.student_id}:${dayOf(row.date)}`, isDailyPresent(row.status as AttendanceStatus))
  }

  function isDone(studentId: string, day: number) {
    const key = `${studentId}:${day}`
    if (manualMap.has(key)) return manualMap.get(key)! === 1
    return attendanceMap.get(key) ?? true
  }

  return { students, range, isDone }
}

export async function fillActivityDoneAll(
  classroomId: string,
  monthKey: string,
  term: 1 | 2,
  activityType: ActivityType,
) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', filled: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, filled: 0 }
  if (!monthKey || !isAttendanceSyncedActivity(activityType)) return { error: 'ไม่รองรับกิจกรรมนี้', filled: 0 }

  const { students, range, isDone } = await buildSyncedActivityEffectiveDone(classroomId, monthKey, activityType)
  const rows: { student_id: string; day: number; value: number }[] = []
  for (const student of students) {
    for (let day = 1; day <= range.days; day += 1) {
      if (!isDone(student.id, day)) rows.push({ student_id: student.id, day, value: 1 })
    }
  }

  const result = await upsertSyncedActivityTeachingRows(
    classroomId,
    monthKey,
    term,
    activityType,
    session,
    access.classroom,
    rows,
  )
  if (!result.error && result.count > 0) {
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_activity',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `เช็คทั้งหมด ${result.count} ช่อง · ${ACTIVITY_LABELS[activityType]} · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
      metadata: { classroomId, monthKey, activityType, filled: result.count },
    })
  }
  return { error: result.error, filled: result.count }
}

export async function fillActivityDoneColumn(
  classroomId: string,
  monthKey: string,
  term: 1 | 2,
  activityType: ActivityType,
  day: number,
) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', filled: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, filled: 0 }
  if (!monthKey || day < 1 || !isAttendanceSyncedActivity(activityType)) return { error: 'ข้อมูลไม่ครบ', filled: 0 }

  const students = await fetchStudentsForClassroom(classroomId)
  const rows = students.map(student => ({ student_id: student.id, day, value: 1 }))
  const result = await upsertSyncedActivityTeachingRows(
    classroomId,
    monthKey,
    term,
    activityType,
    session,
    access.classroom,
    rows,
  )
  if (!result.error && result.count > 0) {
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_activity',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `มาทุกคน วันที่ ${day} · ${ACTIVITY_LABELS[activityType]} · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
      metadata: { classroomId, monthKey, day, activityType, filled: result.count },
    })
  }
  return { error: result.error, filled: result.count }
}

export async function clearActivityDoneColumn(
  classroomId: string,
  monthKey: string,
  term: 1 | 2,
  activityType: ActivityType,
  day: number,
) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', cleared: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, cleared: 0 }
  if (!monthKey || day < 1 || !isAttendanceSyncedActivity(activityType)) return { error: 'ข้อมูลไม่ครบ', cleared: 0 }

  const students = await fetchStudentsForClassroom(classroomId)
  const rows = students.map(student => ({ student_id: student.id, day, value: 0 }))
  const result = await upsertSyncedActivityTeachingRows(
    classroomId,
    monthKey,
    term,
    activityType,
    session,
    access.classroom,
    rows,
  )
  if (!result.error && result.count > 0) {
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_activity',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `ไม่มาทุกคน วันที่ ${day} · ${ACTIVITY_LABELS[activityType]} · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
      metadata: { classroomId, monthKey, day, activityType, cleared: result.count },
    })
  }
  return { error: result.error, cleared: result.count }
}

export async function clearActivityMonth(
  classroomId: string,
  monthKey: string,
  term: 1 | 2,
  activityType: ActivityType,
) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', cleared: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, cleared: 0 }
  if (!monthKey || !isAttendanceSyncedActivity(activityType)) return { error: 'ไม่รองรับกิจกรรมนี้', cleared: 0 }

  const { students, range } = await buildSyncedActivityEffectiveDone(classroomId, monthKey, activityType)
  const rows: { student_id: string; day: number; value: number }[] = []
  for (const student of students) {
    for (let day = 1; day <= range.days; day += 1) {
      rows.push({ student_id: student.id, day, value: 0 })
    }
  }

  const result = await upsertSyncedActivityTeachingRows(
    classroomId,
    monthKey,
    term,
    activityType,
    session,
    access.classroom,
    rows,
  )
  if (!result.error && result.count > 0) {
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'delete',
      module: 'classroom_admin',
      targetType: 'daily_activity',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `ลบทั้งหมด ${result.count} ช่อง · ${ACTIVITY_LABELS[activityType]} · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
      metadata: { classroomId, monthKey, activityType, cleared: result.count },
    })
  }
  return { error: result.error, cleared: result.count }
}

export async function fetchDailyActivity(classroomId: string, date: string, activityType: ActivityType) {
  const session = await requireClassroomAdminSession()
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, students: [], records: {} }

  const db = createServerClient()
  const [students, records, attendanceRes] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    fetchDailyActivityRows(classroomId, activityType, date),
    isAttendanceSyncedActivity(activityType)
      ? db.from('daily_attendance')
        .select('student_id, status')
        .eq('classroom_id', classroomId)
        .eq('date', date)
      : Promise.resolve({ data: [] }),
  ])

  const attendanceDefaults = isAttendanceSyncedActivity(activityType)
    ? {
      ...Object.fromEntries(students.map(s => [s.id, 1])),
      ...Object.fromEntries((attendanceRes.data || []).map(r => [r.student_id, isDailyPresent(r.status as AttendanceStatus) ? 1 : 0])),
    }
    : {}

  return {
    error: null,
    students,
    records: {
      ...attendanceDefaults,
      ...Object.fromEntries(records
        .filter(r => !isAttendanceSyncedActivity(activityType) || r.is_manual_override === true)
        .map(r => [r.student_id, Number(r.value ?? 0)])),
    },
  }
}

export async function saveDailyActivity(
  classroomId: string,
  date: string,
  term: 1 | 2,
  activityType: ActivityType,
  rows: { student_id: string; value: number }[],
) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', count: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, count: 0 }
  if (!date || rows.length === 0) return { error: 'ไม่มีข้อมูลให้บันทึก', count: 0 }

  const db = createServerClient()
  const payload = rows.map(row => ({
    student_id: row.student_id,
    classroom_id: classroomId,
    date,
    term,
    activity_type: activityType,
    value: row.value,
    recorded_by: session.userId,
  }))
  const { error } = await upsertDailyActivities(payload.map(row => ({
    ...row,
    is_manual_override: isAttendanceSyncedActivity(activityType),
  })))
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_activity',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `บันทึก${ACTIVITY_LABELS[activityType]} ${access.classroom.level}/${access.classroom.room} วันที่ ${date} จำนวน ${rows.length} คน`,
      metadata: { classroomId, date, term, activityType, count: rows.length },
    })
  }
  return { error: error?.message || null, count: error ? 0 : rows.length }
}

export async function fetchMonthlyActivity(classroomId: string, academicYearId: string, monthKey: string, activityType: ActivityType) {
  const session = await requireClassroomAdminSession()
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, students: [], records: {}, holidays: [], days: 0 }

  const db = createServerClient()
  const range = monthRange(monthKey)
  const [students, records, holidaysRes, attendanceRes, weekendSchoolDays] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    fetchDailyActivityRows(classroomId, activityType, range.start, range.end),
    db.from('holidays')
      .select('date, name')
      .eq('academic_year_id', academicYearId)
      .gte('date', range.start)
      .lte('date', range.end),
    isAttendanceSyncedActivity(activityType)
      ? db.from('daily_attendance')
        .select('student_id, date, status')
        .eq('classroom_id', classroomId)
        .gte('date', range.start)
        .lte('date', range.end)
      : Promise.resolve({ data: [] }),
    fetchWeekendSchoolDaysForRange(academicYearId, range.start, range.end),
  ])

  const attendanceDefaults: Record<string, Record<number, number>> = isAttendanceSyncedActivity(activityType)
    ? students.reduce((acc: Record<string, Record<number, number>>, student) => {
      acc[student.id] = {}
      for (let day = 1; day <= range.days; day += 1) {
        acc[student.id][day] = 1
      }
      return acc
    }, {})
    : {}

  if (isAttendanceSyncedActivity(activityType)) {
    ;(attendanceRes.data || []).forEach(row => {
      attendanceDefaults[row.student_id] = attendanceDefaults[row.student_id] || {}
      attendanceDefaults[row.student_id][dayOf(row.date)] = isDailyPresent(row.status as AttendanceStatus) ? 1 : 0
    })
  }

  const activityOverrides = isAttendanceSyncedActivity(activityType)
    ? records.filter(row => row.is_manual_override === true)
    : records

  const mergedRecords = activityOverrides.reduce((acc: Record<string, Record<number, number>>, row) => {
    acc[row.student_id] = acc[row.student_id] || {}
    acc[row.student_id][dayOf(row.date || '')] = Number(row.value ?? 0)
    return acc
  }, attendanceDefaults)

  return { error: null, students, records: mergedRecords, holidays: holidaysRes.data || [], weekendSchoolDays, days: range.days }
}

export async function saveMonthlyActivity(
  classroomId: string,
  monthKey: string,
  term: 1 | 2,
  activityType: ActivityType,
  rows: { student_id: string; day: number; value: number }[],
) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', count: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, count: 0 }
  if (!monthKey || rows.length === 0) return { error: 'ไม่มีข้อมูลให้บันทึก', count: 0 }

  const db = createServerClient()
  const teachingRows = await filterRowsForTeachingDays(access.classroom.academic_year_id, monthKey, rows)
  if (teachingRows.length === 0) return { error: 'ไม่มีวันเปิดสอนให้บันทึก', count: 0 }
  const payload = teachingRows.map(row => ({
    student_id: row.student_id,
    classroom_id: classroomId,
    date: isoDateFromMonthDay(monthKey, row.day),
    term,
    activity_type: activityType,
    value: row.value,
    recorded_by: session.userId,
  }))
  const { error } = await upsertDailyActivities(payload.map(row => ({
    ...row,
    is_manual_override: isAttendanceSyncedActivity(activityType),
  })))
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_activity',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `บันทึก${ACTIVITY_LABELS[activityType]}รายเดือน ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey} จำนวน ${teachingRows.length} ช่อง`,
      metadata: { classroomId, monthKey, term, activityType, count: teachingRows.length, skippedClosedDays: rows.length - teachingRows.length },
    })
  }
  return { error: error?.message || null, count: error ? 0 : teachingRows.length }
}

export async function fetchWeightHeight(classroomId: string, academicYearId: string, month: number) {
  const session = await requireClassroomAdminSession()
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, students: [], records: {} }

  const db = createServerClient()
  const [students, recordsRes] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    db.from('student_health')
      .select('student_id, measured_date, weight, height, bmi, bmi_result, height_result')
      .eq('academic_year_id', academicYearId)
      .eq('month', month),
  ])
  const studentIds = new Set(students.map(s => s.id))
  const records = (recordsRes.data || []).filter(r => studentIds.has(r.student_id))
  return { error: null, students, records: Object.fromEntries(records.map(r => [r.student_id, r])) }
}

export async function saveWeightHeight(
  classroomId: string,
  academicYearId: string,
  month: number,
  measuredDate: string,
  rows: { student_id: string; weight: number | null; height: number | null }[],
) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', count: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, count: 0 }

  const db = createServerClient()
  const payload = rows.map(row => {
    const bmi = calcBmi(row.weight, row.height)
    return {
      student_id: row.student_id,
      academic_year_id: academicYearId,
      month,
      measured_date: measuredDate || null,
      weight: row.weight,
      height: row.height,
      bmi,
      bmi_result: bmiResult(bmi),
      height_result: null,
    }
  })
  const { error } = await db.from('student_health').upsert(payload, { onConflict: 'student_id,academic_year_id,month' })
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'student_health',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `บันทึกน้ำหนัก/ส่วนสูง ${access.classroom.level}/${access.classroom.room} เดือน ${month} จำนวน ${rows.length} คน`,
      metadata: { classroomId, academicYearId, month, count: rows.length },
    })
  }
  return { error: error?.message || null, count: error ? 0 : rows.length }
}

export async function fetchHealthInspection(classroomId: string, academicYearId: string, term: 1 | 2, month: number) {
  const session = await requireClassroomAdminSession()
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, students: [], records: {} }

  const db = createServerClient()
  const [students, recordsRes] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    db.from('health_inspection')
      .select('student_id, nails, hair, ears, nose, teeth, skin, clothes, inspected_date')
      .eq('academic_year_id', academicYearId)
      .eq('term', term)
      .eq('month', month),
  ])
  const studentIds = new Set(students.map(s => s.id))
  const records = (recordsRes.data || []).filter(r => studentIds.has(r.student_id))
  return { error: null, students, records: Object.fromEntries(records.map(r => [r.student_id, r])) }
}

export async function saveHealthInspection(
  classroomId: string,
  academicYearId: string,
  term: 1 | 2,
  month: number,
  inspectedDate: string,
  rows: ({ student_id: string } & Record<InspectionField, string>)[],
) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', count: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, count: 0 }

  const db = createServerClient()
  const payload = rows.map(row => ({
    student_id: row.student_id,
    academic_year_id: academicYearId,
    term,
    month,
    inspected_date: inspectedDate || null,
    nails: row.nails,
    hair: row.hair,
    ears: row.ears,
    nose: row.nose,
    teeth: row.teeth,
    skin: row.skin,
    clothes: row.clothes,
  }))
  const { error } = await db.from('health_inspection').upsert(payload, { onConflict: 'student_id,academic_year_id,term,month' })
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'health_inspection',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `บันทึกตรวจสุขภาพ ${access.classroom.level}/${access.classroom.room} ภาคเรียน ${term} เดือน ${month} จำนวน ${rows.length} คน`,
      metadata: { classroomId, academicYearId, term, month, count: rows.length },
    })
  }
  return { error: error?.message || null, count: error ? 0 : rows.length }
}
