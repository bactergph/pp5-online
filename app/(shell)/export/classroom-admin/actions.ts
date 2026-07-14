'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { isDailyPresent } from '@/lib/daily-attendance'

type RoleSession = {
  userId: string
  role: string
  schoolId: string | null
}

type AttendanceStatus = 'ม' | 'ป' | 'ล' | 'ข'
type ActivityType = 'saving' | 'milk' | 'cleaning' | 'brushing' | 'lunch'

const VIEW_ROLES = ['admin', 'academic_head', 'deputy_principal', 'principal', 'teacher']
const ATTENDANCE_SYNC_ACTIVITY_TYPES: ActivityType[] = ['brushing', 'milk', 'lunch', 'cleaning']

async function requireExportSession() {
  const session = await getSession()
  if (!session || !VIEW_ROLES.includes(session.role)) throw new Error('ไม่มีสิทธิ์')
  return session as RoleSession
}

function monthRange(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const endDate = new Date(year, month, 0)
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`,
    days: endDate.getDate(),
    month,
  }
}

function dayOf(date: string) {
  return Number(date.slice(8, 10))
}

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00`).getDay()
  return day === 0 || day === 6
}

function dateOf(monthKey: string, day: number) {
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

export async function fetchClassroomAdminExportContext() {
  const session = await requireExportSession()
  const db = createServerClient()
  const schoolId = session.schoolId || ''

  const [schoolRes, yearsRes] = await Promise.all([
    db.from('schools').select('id, name, logo_url').eq('id', schoolId).maybeSingle(),
    db.from('academic_years').select('id, year_be, is_active').eq('school_id', schoolId).order('year_be', { ascending: false }),
  ])

  const years = yearsRes.data || []
  const yearIds = years.map(y => y.id)
  let classroomQuery = db.from('classrooms')
    .select('id, level, room, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('school_id', schoolId)
    .order('level')
    .order('room')

  if (session.role === 'teacher') {
    classroomQuery = classroomQuery.or(`homeroom_teacher_id.eq.${session.userId},homeroom_teacher2_id.eq.${session.userId}`)
  }

  const classroomsRes = yearIds.length ? await classroomQuery.in('academic_year_id', yearIds) : { data: [] }
  // อ่านสวิตช์เมนู "ปรับ layout" แบบ defensive (ถ้าคอลัมน์ยังไม่มี ให้ถือว่าเปิด)
  const tunerR = await db.from('schools').select('layout_tuner_enabled').eq('id', schoolId).maybeSingle()
  const layoutTunerEnabled = (tunerR.data as { layout_tuner_enabled?: boolean } | null)?.layout_tuner_enabled !== false
  return {
    school: schoolRes.data,
    years,
    classrooms: classroomsRes.data || [],
    layoutTunerEnabled,
  }
}

export async function fetchClassroomAdminExportData(classroomId: string, academicYearId: string, monthKey: string, term: 1 | 2) {
  const session = await requireExportSession()
  const db = createServerClient()
  const range = monthRange(monthKey)

  const { data: classroom } = await db.from('classrooms')
    .select('id, level, room, school_id, academic_year_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom) return { error: 'ไม่พบห้องเรียน' }
  if (classroom.school_id !== session.schoolId) return { error: 'ไม่มีสิทธิ์เข้าถึงห้องนี้' }
  if (session.role === 'teacher' && classroom.homeroom_teacher_id !== session.userId && classroom.homeroom_teacher2_id !== session.userId) {
    return { error: 'ดูได้เฉพาะห้องที่เป็นครูประจำชั้น' }
  }

  const [studentsRes, yearRes, holidaysRes, weekendSchoolDaysRes, attendanceRes, activitiesRes, healthRes, inspectionRes] = await Promise.all([
    db.from('students')
      .select('id, student_number, prefix, first_name, last_name, gender, status')
      .eq('classroom_id', classroomId)
      .order('student_number'),
    db.from('academic_years').select('id, year_be').eq('id', academicYearId).maybeSingle(),
    db.from('holidays')
      .select('date, name')
      .eq('academic_year_id', academicYearId)
      .gte('date', range.start)
      .lte('date', range.end),
    db.from('weekend_school_days')
      .select('date, name')
      .eq('academic_year_id', academicYearId)
      .gte('date', range.start)
      .lte('date', range.end),
    db.from('daily_attendance')
      .select('student_id, date, status')
      .eq('classroom_id', classroomId)
      .gte('date', range.start)
      .lte('date', range.end),
    db.from('daily_activities')
      .select('student_id, date, activity_type, value')
      .eq('classroom_id', classroomId)
      .gte('date', range.start)
      .lte('date', range.end),
    db.from('student_health')
      .select('student_id, weight, height, bmi, bmi_result, measured_date')
      .eq('academic_year_id', academicYearId)
      .eq('month', range.month),
    db.from('health_inspection')
      .select('student_id, nails, hair, ears, nose, teeth, skin, clothes, inspected_date')
      .eq('academic_year_id', academicYearId)
      .eq('term', term)
      .eq('month', range.month),
  ])

  const students = studentsRes.data || []
  const holidays = holidaysRes.data || []
  const openWeekends = weekendSchoolDaysRes.data || []
  const holidayMap = new Map(holidays.map(h => [h.date, h.name]))
  const openWeekendMap = new Map(openWeekends.map(d => [d.date, d.name]))
  const schoolDays = Array.from({ length: range.days }, (_, i) => i + 1).filter(day => {
    const date = dateOf(monthKey, day)
    if (holidayMap.has(date)) return false
    if (isWeekend(date) && !openWeekendMap.has(date)) return false
    return true
  })

  const attendance: Record<string, Record<number, AttendanceStatus>> = {}
  students.forEach(student => {
    attendance[student.id] = {}
  })
  ;(attendanceRes.data || []).forEach(row => {
    attendance[row.student_id] = attendance[row.student_id] || {}
    attendance[row.student_id][dayOf(row.date)] = row.status as AttendanceStatus
  })

  const activities: Record<ActivityType, Record<string, Record<number, number>>> = {
    brushing: {}, milk: {}, lunch: {}, cleaning: {}, saving: {},
  }
  ;(['brushing', 'milk', 'lunch', 'cleaning', 'saving'] as ActivityType[]).forEach(type => {
    students.forEach(student => {
      activities[type][student.id] = {}
      schoolDays.forEach(day => {
        activities[type][student.id][day] = ATTENDANCE_SYNC_ACTIVITY_TYPES.includes(type)
          ? isDailyPresent(attendance[student.id]?.[day]) ? 1 : 0
          : 0
      })
    })
  })
  ;(activitiesRes.data || []).forEach(row => {
    const type = row.activity_type as ActivityType
    if (!activities[type]) return
    if (ATTENDANCE_SYNC_ACTIVITY_TYPES.includes(type)) return
    activities[type][row.student_id] = activities[type][row.student_id] || {}
    activities[type][row.student_id][dayOf(row.date)] = Number(row.value ?? 0)
  })

  return {
    error: null,
    classroom,
    academicYear: yearRes.data,
    students,
    days: range.days,
    schoolDays,
    holidays,
    weekendSchoolDays: openWeekends,
    attendance,
    activities,
    health: Object.fromEntries((healthRes.data || []).map(row => [row.student_id, row])),
    inspection: Object.fromEntries((inspectionRes.data || []).map(row => [row.student_id, row])),
  }
}
