'use server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { isDailyPresent } from '@/lib/daily-attendance'
import { loadClassDocReportSignatures } from '@/lib/report-signatures'
import {
  fetchClassDocApprovalStatus,
  proposeClassDocument,
  putClassDocumentSignature,
} from '@/app/sign/actions'
import { getClassroomStudentsCached } from '@/lib/students-cache'
import { getHolidaysCached, getWeekendSchoolDaysCached } from '@/lib/school-calendar-cache'

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

  let school: {
    id: string
    name: string | null
    logo_url: string | null
    director_name: string | null
    acting_director: string | null
    acting_director_position?: string | null
  } | null = null
  const schoolWithPosition = await db.from('schools')
    .select('id, name, logo_url, director_name, acting_director, acting_director_position')
    .eq('id', schoolId)
    .maybeSingle()
  if (schoolWithPosition.error) {
    const fallback = await db.from('schools')
      .select('id, name, logo_url, director_name, acting_director')
      .eq('id', schoolId)
      .maybeSingle()
    school = fallback.data ? { ...fallback.data, acting_director_position: null } : null
  } else {
    school = schoolWithPosition.data
  }

  const [yearsRes] = await Promise.all([
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

  const teacherIds = [...new Set(
    (classroomsRes.data || [])
      .flatMap(c => [c.homeroom_teacher_id, c.homeroom_teacher2_id])
      .filter(Boolean) as string[],
  )]
  const teachersRes = teacherIds.length
    ? await db.from('users').select('id, full_name').in('id', teacherIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const teacherNameById = Object.fromEntries(
    (teachersRes.data || []).map(u => [u.id, u.full_name || 'ยังไม่กำหนด']),
  )

  const directorName = school?.acting_director || school?.director_name || 'ยังไม่กำหนด'

  return {
    school,
    years,
    classrooms: classroomsRes.data || [],
    layoutTunerEnabled,
    teacherNameById,
    directorName,
    actingDirectorPosition: school?.acting_director_position || null,
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

  const [students, yearRes, holidays, openWeekends, attendanceRes, activitiesRes, healthRes, inspectionRes] = await Promise.all([
    getClassroomStudentsCached(classroomId, async () => {
      const { data } = await db.from('students')
        .select('id, student_number, prefix, first_name, last_name, gender, status')
        .eq('classroom_id', classroomId)
        .order('student_number')
      return data || []
    }),
    db.from('academic_years').select('id, year_be').eq('id', academicYearId).maybeSingle(),
    getHolidaysCached(academicYearId, range.start, range.end, async () => {
      const { data } = await db.from('holidays')
        .select('date, name')
        .eq('academic_year_id', academicYearId)
        .gte('date', range.start)
        .lte('date', range.end)
      return data || []
    }),
    getWeekendSchoolDaysCached(academicYearId, range.start, range.end, async () => {
      const { data } = await db.from('weekend_school_days')
        .select('date, name')
        .eq('academic_year_id', academicYearId)
        .gte('date', range.start)
        .lte('date', range.end)
      return data || []
    }),
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

export type ClassroomAdminMonthSignStatus = {
  month: number
  hasSignature: boolean
  status: string
  statusLabel: string
  skipped: boolean
  proposed: boolean
  error?: string
}

/** โหลดลายเซ็นรายเดือนสำหรับแสดงในช่องเซ็นเอกสาร */
export async function fetchClassroomAdminExportSignatures(
  classroomId: string,
  academicYearId: string,
  term: 1 | 2,
  months: number[],
) {
  const session = await requireExportSession()
  const db = createServerClient()

  const { data: classroom } = await db.from('classrooms')
    .select('id, school_id, homeroom_teacher_id, homeroom_teacher2_id')
    .eq('id', classroomId)
    .maybeSingle()
  if (!classroom || classroom.school_id !== session.schoolId) {
    return { error: 'ไม่พบห้องเรียน', signaturesByMonth: {} as Record<number, { homeroom?: string | null; director?: string | null }>, statuses: [] as ClassroomAdminMonthSignStatus[] }
  }

  const uniqueMonths = [...new Set(months.filter(m => m >= 1 && m <= 12))]
  const signaturesByMonth: Record<number, { homeroom?: string | null; director?: string | null }> = {}
  const statuses: ClassroomAdminMonthSignStatus[] = []

  await Promise.all(uniqueMonths.map(async month => {
    const [sigs, status] = await Promise.all([
      loadClassDocReportSignatures(db, classroomId, academicYearId, 'classroom_admin', term, month),
      fetchClassDocApprovalStatus('classroom_admin', classroomId, term, month),
    ])
    signaturesByMonth[month] = {
      homeroom: sigs.homeroom || null,
      director: sigs.director || null,
    }
    statuses.push({
      month,
      hasSignature: Boolean(status?.hasDocumentSignature),
      status: status?.status || 'draft',
      statusLabel: status?.status_label || 'ยังไม่ใส่ลายเซ็น',
      skipped: false,
      proposed: false,
    })
  }))

  statuses.sort((a, b) => a.month - b.month)
  return { error: null as string | null, signaturesByMonth, statuses }
}

/**
 * เสนอเซ็นเป็นชุดตามเดือนที่เลือก
 * - เดือนที่มีลายเซ็นแล้ว → ข้าม (แสดงลายเซ็นในเอกสารอย่างเดียว)
 * - เดือนที่ยังไม่มี → ใส่ลายเซ็น + เสนอเซ็น
 */
export async function batchProposeClassroomAdminMonths(
  classroomId: string,
  term: 1 | 2,
  months: number[],
) {
  const session = await requireExportSession()
  if (!['teacher', 'admin', 'district'].includes(session.role)) {
    return { error: 'ไม่มีสิทธิ์เสนอเซ็น', results: [] as ClassroomAdminMonthSignStatus[] }
  }

  const uniqueMonths = [...new Set(months.filter(m => m >= 1 && m <= 12))]
  const results: ClassroomAdminMonthSignStatus[] = []

  for (const month of uniqueMonths) {
    const status = await fetchClassDocApprovalStatus('classroom_admin', classroomId, term, month)
    if (!status) {
      results.push({
        month,
        hasSignature: false,
        status: 'draft',
        statusLabel: 'โหลดสถานะไม่สำเร็จ',
        skipped: true,
        proposed: false,
        error: 'โหลดสถานะไม่สำเร็จ',
      })
      continue
    }

    if (status.hasDocumentSignature) {
      results.push({
        month,
        hasSignature: true,
        status: status.status,
        statusLabel: status.status_label,
        skipped: true,
        proposed: false,
      })
      continue
    }

    const put = await putClassDocumentSignature('classroom_admin', classroomId, term, month)
    if (put.error) {
      results.push({
        month,
        hasSignature: false,
        status: status.status,
        statusLabel: status.status_label,
        skipped: false,
        proposed: false,
        error: put.error,
      })
      continue
    }

    const propose = await proposeClassDocument('classroom_admin', classroomId, term, month)
    if (propose.error) {
      results.push({
        month,
        hasSignature: true,
        status: 'draft',
        statusLabel: 'ใส่ลายเซ็นแล้ว แต่เสนอไม่สำเร็จ',
        skipped: false,
        proposed: false,
        error: propose.error,
      })
      continue
    }

    const next = await fetchClassDocApprovalStatus('classroom_admin', classroomId, term, month)
    results.push({
      month,
      hasSignature: true,
      status: next?.status || 'in_review',
      statusLabel: next?.status_label || 'เสนอเซ็นแล้ว',
      skipped: false,
      proposed: true,
    })
  }

  const proposedCount = results.filter(r => r.proposed).length
  const skippedCount = results.filter(r => r.skipped && r.hasSignature).length
  const errorCount = results.filter(r => r.error).length

  return {
    error: errorCount && !proposedCount
      ? results.find(r => r.error)?.error || 'เสนอเป็นชุดไม่สำเร็จ'
      : null as string | null,
    summary: `เสนอแล้ว ${proposedCount} เดือน · ข้ามที่มีลายเซ็น ${skippedCount} เดือน${errorCount ? ` · ไม่สำเร็จ ${errorCount}` : ''}`,
    results,
  }
}
