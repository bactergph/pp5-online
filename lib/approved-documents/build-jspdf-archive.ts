import 'server-only'
import { createServerClient } from '@/lib/supabase'
import { jsPDF } from 'jspdf'
import { isDailyPresentOrDefault } from '@/lib/daily-attendance'
import {
  buildClassroomAdminBookPdfBlob,
  type ClassroomAdminBookMonthData,
} from '@/lib/jspdf-classroom-admin-book'
import {
  buildPp5ClassPdfBlob,
  type Pp5ClassPdfSection,
} from '@/lib/jspdf-pp5-class'
import {
  buildPp5SubjectPdfBlob,
  type Pp5SubjectPdfSection,
} from '@/lib/jspdf-pp5-subject'
import { buildPp6PdfBlob } from '@/lib/jspdf-pp6'
import { applyThaiFontsFromDisk } from '@/lib/jspdf-thai-font-node'
import { blobToBuffer } from '@/lib/jspdf-thai-font'
import { loadClassDocReportSignatures } from '@/lib/report-signatures'
import { getClassroomStudentsCached } from '@/lib/students-cache'
import { getHolidaysCached, getWeekendSchoolDaysCached } from '@/lib/school-calendar-cache'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { loadReportDataForArchive } from '@/app/(shell)/reports/actions'
import { DEFAULT_PP5_PRINT_LAYOUTS } from '@/lib/pp5-print-layout'
import { DEFAULT_PP6_SECTION_LAYOUT } from '@/lib/pp6-print-layout'
import {
  canBuildSignDocumentWithJsPdf,
  PP5_CLASS_ARCHIVE_SECTIONS,
  PP5_SUBJECT_ARCHIVE_SECTIONS,
  reportTermForSignPreview,
  type SignDocumentPreviewTarget,
} from '@/lib/sign-document-preview'
import { appOrigin } from '@/lib/app-origin'

type AttendanceStatus = 'ม' | 'ป' | 'ล' | 'ข'
type ActivityType = 'saving' | 'milk' | 'cleaning' | 'brushing' | 'lunch'

const ATTENDANCE_SYNC_ACTIVITY_TYPES: ActivityType[] = ['brushing', 'milk', 'lunch', 'cleaning']

const CLASSROOM_ADMIN_REPORTS = [
  'attendance',
  'brushing',
  'milk',
  'lunch',
  'cleaning',
  'saving',
  'health',
  'inspection',
] as const

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

/** YYYY-MM ค.ศ. สำหรับเดือนในเทอม */
function classroomAdminMonthKey(month: number) {
  const now = new Date()
  let year = now.getFullYear()
  const nowMonth = now.getMonth() + 1
  if (month <= 4 && nowMonth >= 5) year += 1
  else if (month >= 5 && nowMonth <= 4) year -= 1
  return `${year}-${String(month).padStart(2, '0')}`
}

function resolveAssetUrl(url: string | null | undefined) {
  if (!url) return null
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  const origin = appOrigin().replace(/\/$/, '')
  return url.startsWith('/') ? `${origin}${url}` : `${origin}/${url}`
}

function withResolvedSchoolLogo<T extends { school?: { logo_url?: string | null } | null }>(data: T): T {
  if (!data.school?.logo_url) return data
  return {
    ...data,
    school: {
      ...data.school,
      logo_url: resolveAssetUrl(data.school.logo_url),
    },
  }
}

async function loadMonthData(params: {
  classroomId: string
  academicYearId: string
  monthKey: string
  term: 1 | 2
}): Promise<ClassroomAdminBookMonthData> {
  const db = createServerClient()
  const range = monthRange(params.monthKey)

  const [students, holidays, openWeekends, attendanceRows, activitiesRows, healthRes, inspectionRes] = await Promise.all([
    getClassroomStudentsCached(params.classroomId, async () => {
      const { data } = await db.from('students')
        .select('id, student_number, prefix, first_name, last_name, gender, status')
        .eq('classroom_id', params.classroomId)
        .order('student_number')
      return data || []
    }),
    getHolidaysCached(params.academicYearId, range.start, range.end, async () => {
      const { data } = await db.from('holidays')
        .select('date, name')
        .eq('academic_year_id', params.academicYearId)
        .gte('date', range.start)
        .lte('date', range.end)
      return data || []
    }),
    getWeekendSchoolDaysCached(params.academicYearId, range.start, range.end, async () => {
      const { data } = await db.from('weekend_school_days')
        .select('date, name')
        .eq('academic_year_id', params.academicYearId)
        .gte('date', range.start)
        .lte('date', range.end)
      return data || []
    }),
    fetchAllRows<{ student_id: string; date: string; status: string }>((from, to) =>
      db.from('daily_attendance')
        .select('student_id, date, status')
        .eq('classroom_id', params.classroomId)
        .gte('date', range.start)
        .lte('date', range.end)
        .order('date')
        .order('student_id')
        .range(from, to),
    ),
    fetchAllRows<{ student_id: string; date: string; activity_type: string; value: number | null }>((from, to) =>
      db.from('daily_activities')
        .select('student_id, date, activity_type, value')
        .eq('classroom_id', params.classroomId)
        .gte('date', range.start)
        .lte('date', range.end)
        .order('date')
        .order('student_id')
        .order('activity_type')
        .range(from, to),
    ),
    db.from('student_health')
      .select('student_id, weight, height, bmi, bmi_result, measured_date')
      .eq('academic_year_id', params.academicYearId)
      .eq('month', range.month),
    db.from('health_inspection')
      .select('student_id, nails, hair, ears, nose, teeth, skin, clothes, inspected_date')
      .eq('academic_year_id', params.academicYearId)
      .eq('term', params.term)
      .eq('month', range.month),
  ])

  const holidayMap = new Map(holidays.map(h => [h.date, h.name]))
  const openWeekendMap = new Map(openWeekends.map(d => [d.date, d.name]))
  const schoolDays = Array.from({ length: range.days }, (_, i) => i + 1).filter(day => {
    const date = dateOf(params.monthKey, day)
    if (holidayMap.has(date)) return false
    if (isWeekend(date) && !openWeekendMap.has(date)) return false
    return true
  })

  const attendance: Record<string, Record<number, AttendanceStatus>> = {}
  students.forEach(student => {
    attendance[student.id] = {}
  })
  attendanceRows.forEach(row => {
    attendance[row.student_id] = attendance[row.student_id] || {}
    attendance[row.student_id][dayOf(row.date)] = row.status as AttendanceStatus
  })

  const activities: Partial<Record<ActivityType, Record<string, Record<number, number>>>> = {
    brushing: {}, milk: {}, lunch: {}, cleaning: {}, saving: {},
  }
  ;(['brushing', 'milk', 'lunch', 'cleaning', 'saving'] as ActivityType[]).forEach(type => {
    const bucket = activities[type]!
    students.forEach(student => {
      bucket[student.id] = {}
      schoolDays.forEach(day => {
        bucket[student.id][day] = ATTENDANCE_SYNC_ACTIVITY_TYPES.includes(type)
          ? isDailyPresentOrDefault(attendance[student.id]?.[day]) ? 1 : 0
          : 0
      })
    })
  })
  activitiesRows.forEach(row => {
    const type = row.activity_type as ActivityType
    if (!activities[type]) return
    if (ATTENDANCE_SYNC_ACTIVITY_TYPES.includes(type)) return
    activities[type]![row.student_id] = activities[type]![row.student_id] || {}
    activities[type]![row.student_id][dayOf(row.date)] = Number(row.value ?? 0)
  })

  return {
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

function displayName(prefix?: string | null, first?: string | null, last?: string | null) {
  return [prefix, first, last].filter(Boolean).join('').trim() || 'ยังไม่กำหนด'
}

/**
 * สร้าง PDF ธุรการชั้นเรียนด้วย jsPDF บนเซิร์ฟเวอร์ (ไม่ใช้ Puppeteer)
 * — ใช้ตอนอนุมัติแล้วอัป Google Drive
 */
export async function buildClassroomAdminArchivePdfBuffer(params: {
  schoolId: string
  previewTarget: SignDocumentPreviewTarget
  fileName: string
}): Promise<Buffer> {
  const target = params.previewTarget
  if (target.kind !== 'classroom_admin') {
    throw new Error('buildClassroomAdminArchivePdfBuffer ใช้ได้เฉพาะธุรการชั้นเรียน')
  }

  const month = target.month != null && target.month >= 1 && target.month <= 12
    ? target.month
    : 5
  const term: 1 | 2 = target.signTerm === 2 ? 2 : 1
  const monthKey = classroomAdminMonthKey(month)
  const db = createServerClient()

  const [{ data: school }, { data: classroom }, { data: year }, monthData, signatures] = await Promise.all([
    db.from('schools')
      .select('name, logo_url, director_name, acting_director, acting_director_position')
      .eq('id', params.schoolId)
      .maybeSingle(),
    db.from('classrooms')
      .select('id, level, room, homeroom_teacher_id, homeroom_teacher2_id')
      .eq('id', target.classroomId)
      .maybeSingle(),
    db.from('academic_years').select('year_be').eq('id', target.academicYearId).maybeSingle(),
    loadMonthData({
      classroomId: target.classroomId,
      academicYearId: target.academicYearId,
      monthKey,
      term,
    }),
    loadClassDocReportSignatures(db, target.classroomId, target.academicYearId, 'classroom_admin', term, month),
  ])

  if (!classroom) throw new Error('ไม่พบห้องเรียนสำหรับสร้าง PDF')

  let homeroomTeacherName = 'ยังไม่กำหนด'
  const homeroomId = classroom.homeroom_teacher_id || classroom.homeroom_teacher2_id
  if (homeroomId) {
    const { data: teacher } = await db.from('users')
      .select('prefix, first_name, last_name')
      .eq('id', homeroomId)
      .maybeSingle()
    if (teacher) {
      homeroomTeacherName = displayName(teacher.prefix, teacher.first_name, teacher.last_name)
    }
  }

  const directorName = school?.acting_director || school?.director_name || 'ยังไม่กำหนด'
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })
  await applyThaiFontsFromDisk(doc)

  const result = await buildClassroomAdminBookPdfBlob({
    schoolName: school?.name || 'ชื่อโรงเรียน',
    schoolLogoUrl: resolveAssetUrl(school?.logo_url),
    yearBe: year?.year_be || new Date().getFullYear() + 543,
    classroomLabel: `${classroom.level}/${classroom.room}`,
    term,
    monthKeyBase: monthKey,
    months: [month],
    reports: [...CLASSROOM_ADMIN_REPORTS],
    dataByMonth: { [month]: monthData },
    signaturesByMonth: {
      [month]: {
        homeroom: signatures.homeroom || null,
        director: signatures.director || null,
      },
    },
    homeroomTeacherName,
    directorName,
    actingDirectorPosition: school?.acting_director_position || null,
    fileName: params.fileName,
  }, { doc, skipApplyFonts: true })

  return blobToBuffer(result.blob)
}

/** ปพ.5 รายวิชา — ชุดเดียวกับพรีวิวเซ็น (cover / criteria / scores) */
export async function buildPp5SubjectArchivePdfBuffer(params: {
  schoolId: string
  previewTarget: SignDocumentPreviewTarget
  fileName: string
}): Promise<Buffer> {
  const target = params.previewTarget
  if (target.kind !== 'pp5-subject' || !target.classSubjectId) {
    throw new Error('buildPp5SubjectArchivePdfBuffer ใช้ได้เฉพาะ ปพ.5 รายวิชา')
  }

  const term = reportTermForSignPreview(target) as 0 | 1 | 2
  const data = withResolvedSchoolLogo(await loadReportDataForArchive({
    schoolId: params.schoolId,
    academicYearId: target.academicYearId,
    classroomId: target.classroomId,
    term,
    classSubjectId: target.classSubjectId,
    mode: 'pp5-subject',
    sections: [...PP5_SUBJECT_ARCHIVE_SECTIONS],
  }))

  const subject = data.subjects.find(row => row.class_subject_id === target.classSubjectId)
  if (!subject) throw new Error('ไม่พบรายวิชาสำหรับสร้าง PDF')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  await applyThaiFontsFromDisk(doc)

  const result = await buildPp5SubjectPdfBlob({
    data,
    subject,
    term,
    sections: [...PP5_SUBJECT_ARCHIVE_SECTIONS] as Pp5SubjectPdfSection[],
    layouts: { ...DEFAULT_PP5_PRINT_LAYOUTS },
    fileName: params.fileName,
  }, { doc, skipApplyFonts: true })

  return blobToBuffer(result.blob)
}

/** ปพ.5 รวมชั้น — ชุดเดียวกับพรีวิวเซ็น (cover / criteria / scores) */
export async function buildPp5ClassArchivePdfBuffer(params: {
  schoolId: string
  previewTarget: SignDocumentPreviewTarget
  fileName: string
}): Promise<Buffer> {
  const target = params.previewTarget
  if (target.kind !== 'pp5-class') {
    throw new Error('buildPp5ClassArchivePdfBuffer ใช้ได้เฉพาะ ปพ.5 รวมชั้น')
  }

  const term = reportTermForSignPreview(target) as 0 | 1 | 2
  const data = withResolvedSchoolLogo(await loadReportDataForArchive({
    schoolId: params.schoolId,
    academicYearId: target.academicYearId,
    classroomId: target.classroomId,
    term,
    mode: 'pp5-class',
    sections: [...PP5_CLASS_ARCHIVE_SECTIONS],
  }))

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  await applyThaiFontsFromDisk(doc)

  const result = await buildPp5ClassPdfBlob({
    data,
    term,
    sections: [...PP5_CLASS_ARCHIVE_SECTIONS] as Pp5ClassPdfSection[],
    layouts: { ...DEFAULT_PP5_PRINT_LAYOUTS },
    fileName: params.fileName,
  }, { doc, skipApplyFonts: true })

  return blobToBuffer(result.blob)
}

/** ปพ.6 — หน้านักเรียนชุดเดียวกับที่ครูบันทึกจาก ReportBuilder */
export async function buildPp6ArchivePdfBuffer(params: {
  schoolId: string
  previewTarget: SignDocumentPreviewTarget
  fileName: string
}): Promise<Buffer> {
  const target = params.previewTarget
  if (target.kind !== 'pp6') {
    throw new Error('buildPp6ArchivePdfBuffer ใช้ได้เฉพาะ ปพ.6')
  }

  const term = reportTermForSignPreview(target) as 0 | 1 | 2
  const data = withResolvedSchoolLogo(await loadReportDataForArchive({
    schoolId: params.schoolId,
    academicYearId: target.academicYearId,
    classroomId: target.classroomId,
    term,
    mode: 'pp6',
  }))

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  await applyThaiFontsFromDisk(doc)

  const result = await buildPp6PdfBlob({
    data,
    term,
    ranked: true,
    showGrade: true,
    layout: { ...DEFAULT_PP6_SECTION_LAYOUT },
    fileName: params.fileName,
  }, { doc, skipApplyFonts: true })

  return blobToBuffer(result.blob)
}

/** สร้าง PDF ด้วย jsPDF ตามชนิดเอกสาร (archive / ดาวน์โหลดจากพรีวิว) */
export async function buildApprovedDocumentJsPdfBuffer(params: {
  schoolId: string
  previewTarget: SignDocumentPreviewTarget
  fileName: string
}): Promise<Buffer> {
  const kind = params.previewTarget.kind
  if (kind === 'classroom_admin') {
    return buildClassroomAdminArchivePdfBuffer(params)
  }
  if (kind === 'pp5-subject') {
    return buildPp5SubjectArchivePdfBuffer(params)
  }
  if (kind === 'pp5-class') {
    return buildPp5ClassArchivePdfBuffer(params)
  }
  if (kind === 'pp6') {
    return buildPp6ArchivePdfBuffer(params)
  }
  throw new Error(`ยังไม่รองรับ jsPDF สำหรับ ${kind}`)
}

/** true = ใช้ jsPDF บนเซิร์ฟเวอร์แทน Puppeteer */
export function canBuildArchiveWithJsPdf(kind: SignDocumentPreviewTarget['kind']) {
  return canBuildSignDocumentWithJsPdf(kind)
}
