import { jsPDF } from 'jspdf'
import { applyThaiFonts, loadImageDataUrl } from '@/lib/jspdf-thai-font'
import {
  buildDailyAttendancePdfBlob,
  isMonthlyJsPdfReportType,
  type MonthlyJsPdfReportType,
} from '@/lib/jspdf-daily-attendance'
import {
  buildStandardClassroomAdminPdfBlob,
  isStandardJsPdfReportType,
  type StandardJsPdfReportType,
  type StandardPdfSheet,
} from '@/lib/jspdf-classroom-admin-standard'
import type { ClassroomAdminReportKey } from '@/lib/classroom-admin-document-titles'
import type { ClassroomAdminMonthlyLayout, ClassroomAdminStandardLayout } from '@/lib/classroom-admin-print-layout'

export const JSPDF_BOOK_REPORT_TYPES: ClassroomAdminReportKey[] = [
  'attendance',
  'brushing',
  'milk',
  'lunch',
  'cleaning',
  'saving',
  'health',
  'inspection',
]

export function isJsPdfBookReportType(value: string): value is ClassroomAdminReportKey {
  return (JSPDF_BOOK_REPORT_TYPES as string[]).includes(value)
}

export type ClassroomAdminBookMonthData = {
  students?: {
    id: string
    student_number: number
    prefix?: string | null
    first_name: string
    last_name: string
  }[]
  days?: number
  schoolDays?: number[]
  holidays?: { date: string; name?: string | null }[]
  weekendSchoolDays?: { date: string; name?: string | null }[]
  attendance?: Record<string, Record<number, string | undefined>>
  activities?: Partial<Record<MonthlyJsPdfReportType, Record<string, Record<number, number | undefined>>>>
  health?: Record<string, {
    weight?: number | string | null
    height?: number | string | null
    bmi?: number | string | null
    bmi_result?: string | null
  } | undefined>
  inspection?: Record<string, Record<string, string | null> | undefined>
}

export type ClassroomAdminBookPdfInput = {
  schoolName: string
  schoolLogoUrl?: string | null
  yearBe: number
  classroomLabel: string
  term: 1 | 2
  /** ฐาน YYYY-MM — จะแทนเดือนด้วย months[] */
  monthKeyBase: string
  months: number[]
  reports: ClassroomAdminReportKey[]
  dataByMonth: Record<number, ClassroomAdminBookMonthData | undefined>
  signaturesByMonth?: Record<number, { homeroom?: string | null; director?: string | null } | undefined>
  monthlyLayout?: ClassroomAdminMonthlyLayout
  standardLayout?: ClassroomAdminStandardLayout
  homeroomTeacherName: string
  directorName: string
  actingDirectorPosition?: string | null
  fileName?: string
}

function setMonthInKey(monthKey: string, month: number) {
  const [year] = monthKey.split('-')
  return `${year}-${String(month).padStart(2, '0')}`
}

export type ClassroomAdminBookPdfOptions = {
  loadImage?: typeof loadImageDataUrl
  /** ใช้ doc ที่สร้างไว้แล้ว (เช่น ฝั่งเซิร์ฟเวอร์ติดตั้งฟอนต์จากดิสก์แล้ว) */
  doc?: jsPDF
  skipApplyFonts?: boolean
}

/**
 * รวมรายงานธุรการชั้นเรียนทั้งหมดที่เป็น jsPDF เข้าเป็นเล่มเดียว
 * ลำดับ: เดือน × หมวดรายงาน (เหมือนพรีวิวหน้า export)
 */
export async function buildClassroomAdminBookPdfBlob(
  input: ClassroomAdminBookPdfInput,
  options?: ClassroomAdminBookPdfOptions,
) {
  const loadImage = options?.loadImage ?? loadImageDataUrl
  const reports = input.reports.filter(isJsPdfBookReportType)
  if (!reports.length) throw new Error('ไม่มีรายงานที่รองรับ jsPDF')

  const months = input.months.filter(month => input.dataByMonth[month])
  if (!months.length) throw new Error('ไม่พบข้อมูลสำหรับสร้างเล่ม PDF')

  const doc = options?.doc ?? new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
  })
  if (!options?.skipApplyFonts) await applyThaiFonts(doc)
  const logoData = await loadImage(input.schoolLogoUrl, 160, 0.7)

  let isFirstSheet = true
  const shared = {
    schoolName: input.schoolName || 'ชื่อโรงเรียน',
    schoolLogoUrl: input.schoolLogoUrl,
    yearBe: input.yearBe,
    classroomLabel: input.classroomLabel,
    homeroomTeacherName: input.homeroomTeacherName || 'ยังไม่กำหนด',
    directorName: input.directorName || 'ยังไม่กำหนด',
    actingDirectorPosition: input.actingDirectorPosition || null,
  }

  for (const month of months) {
    const data = input.dataByMonth[month]
    if (!data) continue
    const monthKey = setMonthInKey(input.monthKeyBase, month)
    const signatures = input.signaturesByMonth?.[month] || {}

    for (const report of reports) {
      const startWithNewPage = !isFirstSheet

      if (isMonthlyJsPdfReportType(report)) {
        await buildDailyAttendancePdfBlob(
          {
            ...shared,
            reportType: report,
            term: input.term,
            monthKey,
            days: data.days || 0,
            schoolDays: data.schoolDays || [],
            holidays: data.holidays || [],
            weekendSchoolDays: data.weekendSchoolDays || [],
            students: data.students || [],
            attendance: report === 'attendance' ? (data.attendance || {}) : undefined,
            activities: report !== 'attendance'
              ? (data.activities?.[report] || {})
              : undefined,
            signatures,
            layout: input.monthlyLayout,
          },
          { doc, startWithNewPage, logoData, loadImage },
        )
      } else if (isStandardJsPdfReportType(report)) {
        const sheet: StandardPdfSheet = {
          reportType: report as StandardJsPdfReportType,
          monthKey,
          term: input.term,
          students: data.students || [],
          health: report === 'health' ? (data.health || {}) : undefined,
          inspection: report === 'inspection' ? (data.inspection || {}) : undefined,
          signatures,
        }
        await buildStandardClassroomAdminPdfBlob(
          {
            ...shared,
            layout: input.standardLayout,
            sheets: [sheet],
          },
          { doc, startWithNewPage, logoData },
        )
      }

      isFirstSheet = false
    }
  }

  if (isFirstSheet) throw new Error('ไม่พบแผ่นรายงานสำหรับสร้างเล่ม PDF')

  const safeClass = input.classroomLabel.replace(/[\\/:*?"<>|]+/g, '-')
  const fileName = input.fileName
    || `เล่มรายงานธุรการ_${safeClass}_${months.join('-')}.pdf`
  return { blob: doc.output('blob'), fileName }
}
