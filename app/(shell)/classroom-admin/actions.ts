'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { logActivity } from '@/lib/audit'
import { DAILY_BLANK, isDailyPresent } from '@/lib/daily-attendance'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { getClassroomStudentsCached } from '@/lib/students-cache'
import { getHolidaysCached, getWeekendSchoolDaysCached } from '@/lib/school-calendar-cache'
import { ensureThaiNamePrefixJoined, formatStaffName } from '@/lib/roles'
import {
  getHealthInspectionRecordsCached,
  getMonthlyActivityRowsCached,
  getWeightHeightRecordsCached,
  invalidateHealthInspectionCache,
  invalidateMonthlyActivityCache,
  invalidateWeightHeightCache,
} from '@/lib/classroom-admin-records-cache'

type ClassroomAdminSession = {
  userId: string
  role: string
  schoolId: string | null
  fullName: string
}

type AttendanceStatus = 'ม' | 'ป' | 'ล' | 'ข' | typeof DAILY_BLANK
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
  return getClassroomStudentsCached(classroomId, async () => {
    const db = createServerClient()
    const { data } = await db.from('students')
      .select('id, student_number, prefix, first_name, last_name, gender, birth_date, status')
      .eq('classroom_id', classroomId)
      .order('student_number')
    return data || []
  })
}

async function fetchWeekendSchoolDaysForRange(academicYearId: string, start: string, end: string) {
  return getWeekendSchoolDaysCached(academicYearId, start, end, async () => {
    const db = createServerClient()
    const { data, error } = await db.from('weekend_school_days')
      .select('date, name')
      .eq('academic_year_id', academicYearId)
      .gte('date', start)
      .lte('date', end)
    if (error) return []
    return data || []
  })
}

async function fetchHolidaysForRange(academicYearId: string, start: string, end: string) {
  return getHolidaysCached(academicYearId, start, end, async () => {
    const db = createServerClient()
    const { data } = await db.from('holidays')
      .select('date, name')
      .eq('academic_year_id', academicYearId)
      .gte('date', start)
      .lte('date', end)
    return data || []
  })
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

async function filterRowsForTeachingDays<T extends { day: number }>(academicYearId: string, monthKey: string, rows: T[]) {
  const range = monthRange(monthKey)
  const [holidays, weekendSchoolDays] = await Promise.all([
    fetchHolidaysForRange(academicYearId, range.start, range.end),
    fetchWeekendSchoolDaysForRange(academicYearId, range.start, range.end),
  ])
  const holidayDates = new Set(holidays.map(h => h.date))
  const openWeekendDays = new Set(weekendSchoolDays.map(d => d.date))

  return rows.filter(row => {
    const date = isoDateFromMonthDay(monthKey, row.day)
    if (holidayDates.has(date)) return false
    if (isWeekendDate(date) && !openWeekendDays.has(date)) return false
    return true
  })
}

async function fetchDailyActivityRows(
  classroomId: string,
  activityType: ActivityType,
  start: string,
  end?: string,
  manualOverridesOnly = false,
) {
  const db = createServerClient()

  // ตรวจว่ามีคอลัมน์ is_manual_override หรือไม่ (ฐานข้อมูลเก่าอาจยังไม่มี)
  const probe = await db.from('daily_activities')
    .select('student_id, is_manual_override')
    .eq('classroom_id', classroomId)
    .eq('activity_type', activityType)
    .limit(1)
  const hasOverrideColumn = !probe.error
  if (!hasOverrideColumn && manualOverridesOnly) return []

  if (hasOverrideColumn) {
    return fetchAllRows<ActivityRecord>((from, to) => {
      let q = db.from('daily_activities')
        .select('student_id, date, value, is_manual_override')
        .eq('classroom_id', classroomId)
        .eq('activity_type', activityType)
      if (end) q = q.gte('date', start).lte('date', end)
      else q = q.eq('date', start)
      if (manualOverridesOnly) q = q.eq('is_manual_override', true)
      return q.order('date').order('student_id').range(from, to)
    })
  }

  return fetchAllRows<ActivityRecord>((from, to) => {
    let q = db.from('daily_activities')
      .select('student_id, date, value')
      .eq('classroom_id', classroomId)
      .eq('activity_type', activityType)
    if (end) q = q.gte('date', start).lte('date', end)
    else q = q.eq('date', start)
    return q.order('date').order('student_id').range(from, to)
  })
}

async function upsertDailyActivities(rows: Record<string, unknown>[]) {
  const db = createServerClient()
  const withOverride = await db.from('daily_activities').upsert(rows, { onConflict: 'student_id,date,activity_type' })
  if (!withOverride.error) return withOverride

  const fallbackRows = rows.map(row => {
    const fallback = { ...row }
    delete fallback.is_manual_override
    return fallback
  })
  return db.from('daily_activities').upsert(fallbackRows, { onConflict: 'student_id,date,activity_type' })
}

export async function fetchClassroomAdminContext() {
  const session = await requireClassroomAdminSession()
  const db = createServerClient()
  const sid = session.schoolId || ''

  let classroomQuery = db.from('classrooms')
    .select('id, level, room, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('school_id', sid)
    .order('level')
    .order('room')

  if (session.role === 'teacher') {
    classroomQuery = classroomQuery.or(`homeroom_teacher_id.eq.${session.userId},homeroom_teacher2_id.eq.${session.userId}`)
  }

  const [yearsRes, classroomsRes, schoolWithPosition] = await Promise.all([
    db.from('academic_years')
      .select('id, year_be, is_active')
      .eq('school_id', sid)
      .order('year_be', { ascending: false }),
    classroomQuery,
    db.from('schools')
      .select('name, logo_url, director_name, acting_director, acting_director_position, layout_tuner_enabled')
      .eq('id', sid)
      .maybeSingle(),
  ])
  const classrooms = classroomsRes.data || []
  const classroomIds = classrooms.map(c => c.id)
  const teacherIds = Array.from(new Set(classrooms.flatMap(c => [c.homeroom_teacher_id, c.homeroom_teacher2_id]).filter(Boolean)))

  const [studentsRes, teachersRes] = await Promise.all([
    classroomIds.length > 0
      ? db.from('students').select('classroom_id').in('classroom_id', classroomIds)
      : Promise.resolve({ data: [] }),
    teacherIds.length > 0
      ? db.from('users').select('id, prefix, full_name').in('id', teacherIds)
      : Promise.resolve({ data: [] }),
  ])
  const countMap = (studentsRes.data || []).reduce((acc: Record<string, number>, row: { classroom_id: string }) => {
      acc[row.classroom_id] = (acc[row.classroom_id] || 0) + 1
      return acc
    }, {})
  const teacherNameMap: Record<string, string> = Object.fromEntries(
    (teachersRes.data || []).map(t => [t.id, formatStaffName(t.prefix, t.full_name)]),
  )

  let school: {
    name: string | null
    logo_url: string | null
    director_name: string | null
    acting_director: string | null
    acting_director_position?: string | null
    layout_tuner_enabled?: boolean | null
  } | null = null
  if (schoolWithPosition.error) {
    const fallback = await db.from('schools')
      .select('name, logo_url, director_name, acting_director')
      .eq('id', sid)
      .maybeSingle()
    school = fallback.data ? { ...fallback.data, acting_director_position: null } : null
  } else {
    school = schoolWithPosition.data
  }

  // ถ้าฐานข้อมูลเก่ายังไม่มีคอลัมน์ ให้เปิดไว้ตามพฤติกรรมเดิม
  const layoutTunerEnabled = school?.layout_tuner_enabled !== false

  return {
    role: session.role,
    canEdit: canEdit(session) && session.role !== 'principal',
    currentUserName: session.fullName,
    layoutTunerEnabled,
    schoolName: school?.name || '',
    schoolLogoUrl: school?.logo_url || '',
    directorName: ensureThaiNamePrefixJoined(school?.director_name || ''),
    actingDirector: ensureThaiNamePrefixJoined(school?.acting_director || ''),
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
  // Sparse: มา (ม) = ไม่มีแถว — ลบแถวแทนการเก็บ ม
  const toDelete = rows.filter(row => row.status === 'ม').map(row => row.student_id)
  const toUpsert = rows.filter(row => row.status !== 'ม')

  let error: { message: string } | null = null
  if (toUpsert.length > 0) {
    const payload = toUpsert.map(row => ({
      student_id: row.student_id,
      classroom_id: classroomId,
      date,
      status: row.status,
      recorded_by: session.userId,
    }))
    error = (await db.from('daily_attendance').upsert(payload, { onConflict: 'student_id,date' })).error
  }
  if (!error && toDelete.length > 0) {
    error = (await db.from('daily_attendance')
      .delete()
      .eq('classroom_id', classroomId)
      .eq('date', date)
      .in('student_id', toDelete)).error
  }
  if (!error) {
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
  return { error: error?.message || null, count: error ? 0 : rows.length }
}

export async function fetchMonthlyAttendance(classroomId: string, academicYearId: string, monthKey: string) {
  const session = await requireClassroomAdminSession()
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, students: [], records: {}, holidays: [], days: 0 }

  const db = createServerClient()
  const range = monthRange(monthKey)
  const [students, attendanceRows, holidays, weekendSchoolDays] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    fetchAllRows<{ student_id: string; date: string; status: string }>((from, to) =>
      db.from('daily_attendance')
        .select('student_id, date, status')
        .eq('classroom_id', classroomId)
        .gte('date', range.start)
        .lte('date', range.end)
        .order('date')
        .order('student_id')
        .range(from, to),
    ),
    fetchHolidaysForRange(academicYearId, range.start, range.end),
    fetchWeekendSchoolDaysForRange(academicYearId, range.start, range.end),
  ])

  const records = attendanceRows.reduce((acc: Record<string, Record<number, AttendanceStatus>>, row) => {
    acc[row.student_id] = acc[row.student_id] || {}
    acc[row.student_id][dayOf(row.date)] = row.status as AttendanceStatus
    return acc
  }, {})

  return { error: null, students, records, holidays, weekendSchoolDays, days: range.days }
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

  // Sparse: มา (ม) = ไม่มีแถว — ลบแถวแทนการเก็บ ม
  const toUpsert = teachingRows.filter(row => row.status !== 'ม')
  const toDelete = teachingRows.filter(row => row.status === 'ม')

  let error: { message: string } | null = null
  if (toUpsert.length > 0) {
    const payload = toUpsert.map(row => ({
      student_id: row.student_id,
      classroom_id: classroomId,
      date: isoDateFromMonthDay(monthKey, row.day),
      status: row.status,
      recorded_by: session.userId,
    }))
    error = (await db.from('daily_attendance').upsert(payload, { onConflict: 'student_id,date' })).error
  }
  if (!error && toDelete.length > 0) {
    const results = await Promise.all(toDelete.map(row => db.from('daily_attendance')
      .delete()
      .eq('classroom_id', classroomId)
      .eq('student_id', row.student_id)
      .eq('date', isoDateFromMonthDay(monthKey, row.day))))
    error = results.find(r => r.error)?.error || null
  }
  if (!error) {
    await logActivity({
      actor: session,
      schoolId: access.classroom.school_id,
      action: 'upsert',
      module: 'classroom_admin',
      targetType: 'daily_attendance',
      targetId: classroomId,
      targetLabel: `${access.classroom.level}/${access.classroom.room}`,
      description: `บันทึกเวลาเรียนรายเดือน ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey} จำนวน ${teachingRows.length} ช่อง`,
      metadata: { classroomId, monthKey, count: teachingRows.length, skippedClosedDays: rows.length - teachingRows.length },
    })
  }
  return { error: error?.message || null, count: error ? 0 : teachingRows.length }
}

export async function fillDailyPresentAll(classroomId: string, monthKey: string) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', filled: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, filled: 0 }
  if (!monthKey) return { error: 'ไม่พบเดือน', filled: 0 }

  // Sparse: มา = ไม่มีแถว — เช็คมาทั้งหมดคือลบแถวขาด/ลา/ป่วยที่มีอยู่ทั้งเดือน
  const db = createServerClient()
  const range = monthRange(monthKey)
  const { count, error: countError } = await db.from('daily_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('classroom_id', classroomId)
    .gte('date', range.start)
    .lte('date', range.end)

  if (countError) return { error: countError.message, filled: 0 }
  const filled = count || 0
  if (filled === 0) return { error: null, filled: 0 }

  const { error } = await db.from('daily_attendance')
    .delete()
    .eq('classroom_id', classroomId)
    .gte('date', range.start)
    .lte('date', range.end)

  if (error) return { error: error.message, filled: 0 }

  await logActivity({
    actor: session,
    schoolId: access.classroom.school_id,
    action: 'delete',
    module: 'classroom_admin',
    targetType: 'daily_attendance',
    targetId: classroomId,
    targetLabel: `${access.classroom.level}/${access.classroom.room}`,
    description: `เช็คมาทั้งหมด (ลบ ${filled} แถว) · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
    metadata: { classroomId, monthKey, filled },
  })
  return { error: null, filled }
}

export async function fillDailyPresentColumn(classroomId: string, monthKey: string, day: number) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', filled: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, filled: 0 }
  if (!monthKey || day < 1) return { error: 'ข้อมูลไม่ครบ', filled: 0 }

  const teachingRows = await filterRowsForTeachingDays(access.classroom.academic_year_id, monthKey, [{ day }])
  if (teachingRows.length === 0) return { error: 'ไม่มีวันเปิดสอนให้บันทึก', filled: 0 }

  // Sparse: มาทุกคน = ลบแถวขาด/ลา/ป่วยของวันนี้ทั้งหมด
  const date = isoDateFromMonthDay(monthKey, day)
  const db = createServerClient()
  const { count, error: countError } = await db.from('daily_attendance')
    .select('id', { count: 'exact', head: true })
    .eq('classroom_id', classroomId)
    .eq('date', date)

  if (countError) return { error: countError.message, filled: 0 }
  const filled = count || 0
  if (filled === 0) return { error: null, filled: 0 }

  const { error } = await db.from('daily_attendance')
    .delete()
    .eq('classroom_id', classroomId)
    .eq('date', date)

  if (error) return { error: error.message, filled: 0 }

  await logActivity({
    actor: session,
    schoolId: access.classroom.school_id,
    action: 'delete',
    module: 'classroom_admin',
    targetType: 'daily_attendance',
    targetId: classroomId,
    targetLabel: `${access.classroom.level}/${access.classroom.room}`,
    description: `มาทุกคน (ลบ ${filled} แถว) วันที่ ${day} · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
    metadata: { classroomId, monthKey, day, filled },
  })
  return { error: null, filled }
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

  // Sparse: ไม่มาทุกคน = upsert ข ให้ทุกคนของวันนี้ (แทนการลบแถว)
  const students = await fetchStudentsForClassroom(classroomId)
  if (students.length === 0) return { error: null, deleted: 0 }

  const date = isoDateFromMonthDay(monthKey, day)
  const db = createServerClient()
  const payload = students.map(student => ({
    student_id: student.id,
    classroom_id: classroomId,
    date,
    status: 'ข' as AttendanceStatus,
    recorded_by: session.userId,
  }))
  const { error } = await db.from('daily_attendance').upsert(payload, { onConflict: 'student_id,date' })
  if (error) return { error: error.message, deleted: 0 }

  await logActivity({
    actor: session,
    schoolId: access.classroom.school_id,
    action: 'upsert',
    module: 'classroom_admin',
    targetType: 'daily_attendance',
    targetId: classroomId,
    targetLabel: `${access.classroom.level}/${access.classroom.room}`,
    description: `ไม่มาทุกคน (ข) ${students.length} คน · วันที่ ${day} · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
    metadata: { classroomId, monthKey, day, deleted: students.length },
  })

  return { error: null, deleted: students.length }
}

export async function clearDailyAttendanceMonth(classroomId: string, monthKey: string) {
  const session = await requireClassroomAdminSession()
  if (!canEdit(session) || session.role === 'principal') return { error: 'ไม่มีสิทธิ์', deleted: 0 }
  const access = await getClassroomForAccess(classroomId, session)
  if (access.error || !access.classroom) return { error: access.error, deleted: 0 }
  if (!monthKey) return { error: 'ไม่พบเดือน', deleted: 0 }

  const students = await fetchStudentsForClassroom(classroomId)
  if (students.length === 0) return { error: null, deleted: 0 }

  const range = monthRange(monthKey)
  const dayRows = Array.from({ length: range.days }, (_, i) => ({ day: i + 1 }))
  const teachingDays = await filterRowsForTeachingDays(access.classroom.academic_year_id, monthKey, dayRows)
  if (teachingDays.length === 0) return { error: 'ไม่มีวันเปิดสอนให้ลบ', deleted: 0 }

  // ลบทั้งหมด = บันทึกช่องว่าง (-) ทุกคนทุกวันเปิดสอน (คนละค่ากับไม่มีแถว = มา)
  const db = createServerClient()
  const payload = teachingDays.flatMap(({ day }) =>
    students.map(student => ({
      student_id: student.id,
      classroom_id: classroomId,
      date: isoDateFromMonthDay(monthKey, day),
      status: DAILY_BLANK as AttendanceStatus,
      recorded_by: session.userId,
    })),
  )

  const chunkSize = 500
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize)
    const { error } = await db.from('daily_attendance').upsert(chunk, { onConflict: 'student_id,date' })
    if (error) return { error: error.message, deleted: 0 }
  }

  const deleted = payload.length
  await logActivity({
    actor: session,
    schoolId: access.classroom.school_id,
    action: 'upsert',
    module: 'classroom_admin',
    targetType: 'daily_attendance',
    targetId: classroomId,
    targetLabel: `${access.classroom.level}/${access.classroom.room}`,
    description: `ลบทั้งหมด → ช่องว่าง ${deleted} ช่อง · ${access.classroom.level}/${access.classroom.room} เดือน ${monthKey}`,
    metadata: { classroomId, monthKey, deleted, status: DAILY_BLANK },
  })

  return { error: null, deleted }
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
  const attendanceSynced = isAttendanceSyncedActivity(activityType)
  const [students, records, holidays, attendanceRes, weekendSchoolDays] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    getMonthlyActivityRowsCached(classroomId, monthKey, activityType, () =>
      fetchDailyActivityRows(classroomId, activityType, range.start, range.end, attendanceSynced),
    ),
    fetchHolidaysForRange(academicYearId, range.start, range.end),
    attendanceSynced
      ? db.from('daily_attendance')
        .select('student_id, date, status')
        .eq('classroom_id', classroomId)
        .gte('date', range.start)
        .lte('date', range.end)
      : Promise.resolve({ data: [] }),
    fetchWeekendSchoolDaysForRange(academicYearId, range.start, range.end),
  ])

  const attendanceDefaults: Record<string, Record<number, number>> = attendanceSynced
    ? students.reduce((acc: Record<string, Record<number, number>>, student) => {
      acc[student.id] = {}
      for (let day = 1; day <= range.days; day += 1) {
        acc[student.id][day] = 1
      }
      return acc
    }, {})
    : {}

  if (attendanceSynced) {
    ;(attendanceRes.data || []).forEach(row => {
      attendanceDefaults[row.student_id] = attendanceDefaults[row.student_id] || {}
      attendanceDefaults[row.student_id][dayOf(row.date)] = isDailyPresent(row.status as AttendanceStatus) ? 1 : 0
    })
  }

  const mergedRecords = records.reduce((acc: Record<string, Record<number, number>>, row) => {
    acc[row.student_id] = acc[row.student_id] || {}
    acc[row.student_id][dayOf(row.date || '')] = Number(row.value ?? 0)
    return acc
  }, attendanceDefaults)

  return { error: null, students, records: mergedRecords, holidays, weekendSchoolDays, days: range.days }
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
    invalidateMonthlyActivityCache(classroomId, monthKey, activityType)
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
  const [students, records] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    getWeightHeightRecordsCached(classroomId, academicYearId, month, async () => {
      const { data } = await db.from('student_health')
        .select('student_id, measured_date, weight, height, bmi, bmi_result, height_result, students!inner(classroom_id)')
        .eq('academic_year_id', academicYearId)
        .eq('month', month)
        .eq('students.classroom_id', classroomId)
      return Object.fromEntries((data || []).map(r => [r.student_id, r]))
    }),
  ])
  return { error: null, students, records }
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
    invalidateWeightHeightCache(classroomId, academicYearId, month)
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
  const [students, records] = await Promise.all([
    fetchStudentsForClassroom(classroomId),
    getHealthInspectionRecordsCached(classroomId, academicYearId, term, month, async () => {
      const { data } = await db.from('health_inspection')
        .select('student_id, nails, hair, ears, nose, teeth, skin, clothes, inspected_date, students!inner(classroom_id)')
        .eq('academic_year_id', academicYearId)
        .eq('term', term)
        .eq('month', month)
        .eq('students.classroom_id', classroomId)
      return Object.fromEntries((data || []).map(r => [r.student_id, r]))
    }),
  ])
  return { error: null, students, records }
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
    invalidateHealthInspectionCache(classroomId, academicYearId, term, month)
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
