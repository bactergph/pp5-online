'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchClassroomAdminExportContext, fetchClassroomAdminExportData, fetchClassroomAdminExportSignatures, batchProposeClassroomAdminMonths } from './actions'
import type { ClassroomAdminMonthSignStatus } from './actions'
import { useAppAlert } from '@/lib/use-app-alert'
import ClassroomAdminPrintLayoutTuner, { useClassroomAdminPrintLayoutsState } from '@/components/classroom-admin/ClassroomAdminPrintLayoutTuner'
import { classroomAdminPrintStyles } from '@/components/classroom-admin/classroom-admin-print-styles'
import { CLASSROOM_ADMIN_A4_LANDSCAPE_CSS } from '@/lib/classroom-admin-a4-landscape'
import { toDailyDisplay } from '@/lib/daily-attendance'
import {
  classroomAdminPrintSectionForReport,
  classroomAdminSectionLayoutStyle,
  saveClassroomAdminPrintLayouts,
  type ClassroomAdminPrintSection,
} from '@/lib/classroom-admin-print-layout'
import { ClassroomAdminPrintLayoutsProvider } from '@/lib/classroom-admin-print-layout-context'
import { reportFontFaceCss, waitForReportFonts } from '@/lib/report-font-faces'
import { classroomAdminDocumentTitle } from '@/lib/classroom-admin-document-titles'
import {
  classroomAdminStandardTableWidthStyle,
  classroomAdminWeightHeightTableWidthStyle,
  CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS,
  CLASSROOM_ADMIN_WEIGHT_HEIGHT_COL_WIDTHS,
} from '@/lib/classroom-admin-standard-table-columns'
import { buildClassroomAdminBookPdfBlob, isJsPdfBookReportType } from '@/lib/jspdf-classroom-admin-book'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { CLASSROOM_ADMIN_CHECK_MARK, classroomAdminDoneMark } from '@/lib/classroom-admin-check-mark'
import { REPORT_FONT_FAMILY } from '@/lib/report-font'
import { downscaleImageUrl } from '@/lib/downscale-image-url'
import {
  PRINT_STUDENTS_PER_PAGE,
  chunkStudentsForPrintPages,
  printPageRowCount,
} from '@/lib/print-student-pages'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = { id: string; level: string; room: number; academic_year_id: string; homeroom_teacher_id?: string | null; homeroom_teacher2_id?: string | null }
type Student = { id: string; student_number: number; prefix: string | null; first_name: string; last_name: string; gender: string; status: string }
type ActivityType = 'brushing' | 'milk' | 'lunch' | 'cleaning' | 'saving'
type ReportType = 'attendance' | ActivityType | 'health' | 'inspection'
type ExportData = {
  error?: string | null
  classroom?: Classroom
  academicYear?: Year
  students?: Student[]
  days?: number
  schoolDays?: number[]
  holidays?: { date: string; name: string }[]
  weekendSchoolDays?: { date: string; name: string }[]
  attendance?: Record<string, Record<number, string>>
  activities?: Record<ActivityType, Record<string, Record<number, number>>>
  health?: Record<string, { weight?: number | null; height?: number | null; bmi?: number | null; bmi_result?: string | null }>
  inspection?: Record<string, Record<string, string | null>>
}

const MONTHS = [
  { value: 1, label: 'มกราคม' }, { value: 2, label: 'กุมภาพันธ์' }, { value: 3, label: 'มีนาคม' },
  { value: 4, label: 'เมษายน' }, { value: 5, label: 'พฤษภาคม' }, { value: 6, label: 'มิถุนายน' },
  { value: 7, label: 'กรกฎาคม' }, { value: 8, label: 'สิงหาคม' }, { value: 9, label: 'กันยายน' },
  { value: 10, label: 'ตุลาคม' }, { value: 11, label: 'พฤศจิกายน' }, { value: 12, label: 'ธันวาคม' },
]
const MONTH_SHORT_LABELS: Record<number, string> = {
  1: 'ม.ค.',
  2: 'ก.พ.',
  3: 'มี.ค.',
  4: 'เม.ย.',
  5: 'พ.ค.',
  6: 'มิ.ย.',
  7: 'ก.ค.',
  8: 'ส.ค.',
  9: 'ก.ย.',
  10: 'ต.ค.',
  11: 'พ.ย.',
  12: 'ธ.ค.',
}
const TERM_MONTHS: Record<1 | 2, number[]> = {
  1: [5, 6, 7, 8, 9, 10],
  2: [11, 12, 1, 2, 3],
}
const ACTIVITY_LABELS: Record<ActivityType, string> = {
  brushing: 'แปรงฟัน',
  milk: 'ดื่มนม',
  lunch: 'อาหารกลางวัน',
  cleaning: 'ทำความสะอาดห้อง',
  saving: 'การออมเงิน',
}
const REPORT_TYPES: { key: ReportType; label: string; hint: string }[] = [
  { key: 'attendance', label: 'เวลาเรียน', hint: 'มา/ป่วย/ลา/ขาด' },
  { key: 'brushing', label: 'แปรงฟัน', hint: 'กิจวัตรรายวัน' },
  { key: 'milk', label: 'ดื่มนม', hint: 'กิจวัตรรายวัน' },
  { key: 'lunch', label: 'อาหารกลางวัน', hint: 'กิจวัตรรายวัน' },
  { key: 'cleaning', label: 'ทำความสะอาดห้อง', hint: 'กิจวัตรรายวัน' },
  { key: 'saving', label: 'การออมเงิน', hint: 'ยอดออมรายวัน' },
  { key: 'health', label: 'น้ำหนัก-ส่วนสูง', hint: 'BMI รายเดือน' },
  { key: 'inspection', label: 'ตรวจสุขภาพ', hint: 'สุขอนามัย' },
]
const PREVIEW_SCALE_OPTIONS = [50, 60, 70, 80, 90, 100, 125, 150] as const
const INSPECTION_FIELDS = [
  { key: 'nails', label: 'เล็บ' },
  { key: 'hair', label: 'ผม' },
  { key: 'ears', label: 'หู' },
  { key: 'nose', label: 'จมูก' },
  { key: 'teeth', label: 'ฟัน' },
  { key: 'skin', label: 'ผิวหนัง' },
  { key: 'clothes', label: 'เสื้อผ้า' },
]

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7)
}

function monthName(monthKey: string) {
  return MONTHS.find(m => m.value === Number(monthKey.slice(5, 7)))?.label || ''
}

function setMonthInKey(monthKey: string, month: number) {
  const baseMonthKey = monthKey || currentMonthKey()
  return `${baseMonthKey.slice(0, 4)}-${String(month).padStart(2, '0')}`
}

function studentName(student: Student) {
  return `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim()
}

function dayLabel(monthKey: string, day: number) {
  return ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][new Date(`${monthKey}-${String(day).padStart(2, '0')}T00:00:00`).getDay()]
}

function dayDateKey(monthKey: string, day: number) {
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

function holidayColumnLabel(day: number, name: string) {
  return `วันที่ ${day}: ${name}`
}

function summaryFor(student: Student, data: ExportData) {
  const out = { 'ม': 0, 'ป': 0, 'ล': 0, 'ข': 0 } as Record<string, number>
  ;(data.schoolDays || []).forEach(day => {
    const value = data.attendance?.[student.id]?.[day]
    if (!value) return
    out[value] = (out[value] || 0) + 1
  })
  return out
}

/** จำนวนวันที่ทำกิจวัตร (เช็ค) หรือยอดรวมเงินออม */
function activitySummaryFor(studentId: string, type: ActivityType, data: ExportData) {
  return (data.schoolDays || []).reduce((sum, day) => {
    const value = Number(data.activities?.[type]?.[studentId]?.[day] || 0)
    if (!value) return sum
    return type === 'saving' ? sum + value : sum + 1
  }, 0)
}

function isRoutineActivityReport(type: ReportType): type is Exclude<ActivityType, 'saving'> {
  return type === 'brushing' || type === 'milk' || type === 'lunch' || type === 'cleaning'
}

function attendanceExportDisplay(studentId: string, day: number, data: ExportData) {
  return toDailyDisplay(data.attendance?.[studentId]?.[day] as 'ม' | 'ป' | 'ล' | 'ข' | undefined) || ''
}

export default function ClassroomAdminExportPage() {
  const searchParams = useSearchParams()
  const printMode = searchParams.get('print') === '1'
  const embedMode = searchParams.get('embed') === '1'
  const autoPrintMode = searchParams.get('autoprint') === '1'
  const deepLinkMode = printMode || embedMode || autoPrintMode
  const [years, setYears] = useState<Year[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [schoolName, setSchoolName] = useState('')
  const [schoolLogoUrl, setSchoolLogoUrl] = useState('')
  const [logoSrc, setLogoSrc] = useState('')
  const [logoResolved, setLogoResolved] = useState(true)
  const [teacherNameById, setTeacherNameById] = useState<Record<string, string>>({})
  const [directorName, setDirectorName] = useState('ยังไม่กำหนด')
  const [actingDirectorPosition, setActingDirectorPosition] = useState<string | null>(null)
  const [signaturesByMonth, setSignaturesByMonth] = useState<Record<number, { homeroom?: string | null; director?: string | null }>>({})
  const [monthSignStatuses, setMonthSignStatuses] = useState<ClassroomAdminMonthSignStatus[]>([])
  const [batchProposing, setBatchProposing] = useState(false)
  const { notify, AlertModal } = useAppAlert('เสนอเซ็นสำเร็จ', 'เสนอเซ็นไม่สำเร็จ')
  const [yearId, setYearId] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [monthKey, setMonthKey] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)
  const [selectedMonths, setSelectedMonths] = useState<number[]>([])
  const [selectedReports, setSelectedReports] = useState<ReportType[]>([])
  const [dataByMonth, setDataByMonth] = useState<Record<number, ExportData>>({})
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [layoutTunerOpen, setLayoutTunerOpen] = useState(false)
  const [layoutTunerEnabled, setLayoutTunerEnabled] = useState(true)
  const [layoutTunerSection, setLayoutTunerSection] = useState<ClassroomAdminPrintSection>('monthly')
  const [layoutSaved, setLayoutSaved] = useState(false)
  const { layouts: printLayouts, setLayouts: setPrintLayouts } = useClassroomAdminPrintLayoutsState()
  const [previewScale, setPreviewScale] = useState(100)
  const loadRequestRef = useRef(0)

  useEffect(() => {
    fetchClassroomAdminExportContext().then(result => {
      setSchoolName(result.school?.name || '')
      setSchoolLogoUrl(result.school?.logo_url || '')
      setYears(result.years as Year[])
      setClassrooms(result.classrooms as Classroom[])
      setLayoutTunerEnabled(result.layoutTunerEnabled !== false)
      setTeacherNameById(result.teacherNameById || {})
      setDirectorName(result.directorName || 'ยังไม่กำหนด')
      setActingDirectorPosition(result.actingDirectorPosition || null)

      if (deepLinkMode) {
        const nextTerm = searchParams.get('term') === '2' ? 2 : 1
        setMonthKey(searchParams.get('monthkey') || currentMonthKey())
        setTerm(nextTerm)
        const yearParam = searchParams.get('year')
        const classroomParam = searchParams.get('classroom')
        const monthsParam = searchParams.get('months')
        const reportsParam = searchParams.get('reports')
        if (yearParam) setYearId(yearParam)
        if (classroomParam) setClassroomId(classroomParam)
        if (monthsParam) setSelectedMonths(monthsParam.split(',').map(Number).filter(n => !Number.isNaN(n)))
        else setSelectedMonths(TERM_MONTHS[nextTerm])
        if (reportsParam) setSelectedReports(reportsParam.split(',').filter(Boolean) as ReportType[])
        else setSelectedReports(REPORT_TYPES.map(report => report.key))
        return
      }

      const nowMonthKey = currentMonthKey()
      const nowMonth = Number(nowMonthKey.slice(5, 7))
      const nowTerm = nowMonth >= 5 && nowMonth <= 10 ? 1 : 2
      const termMonths = TERM_MONTHS[nowTerm]
      setMonthKey(nowMonthKey)
      setTerm(nowTerm)
      setSelectedMonths([termMonths.includes(nowMonth) ? nowMonth : termMonths[0]])
      setSelectedReports(['attendance', 'brushing', 'milk', 'lunch', 'cleaning', 'saving'])
      const active = (result.years as Year[]).find(y => y.is_active) || (result.years as Year[])[0]
      const firstClass = (result.classrooms as Classroom[]).find(c => c.academic_year_id === active?.id) || (result.classrooms as Classroom[])[0]
      setYearId(active?.id || '')
      setClassroomId(firstClass?.id || '')
    })
  }, [deepLinkMode, searchParams])

  const filteredClassrooms = useMemo(
    () => classrooms.filter(c => !yearId || c.academic_year_id === yearId),
    [classrooms, yearId],
  )

  useEffect(() => {
    if (!schoolLogoUrl) {
      setLogoSrc('')
      setLogoResolved(true)
      return
    }
    let active = true
    setLogoResolved(false)
    downscaleImageUrl(schoolLogoUrl, 320)
      .then(src => { if (active) setLogoSrc(src) })
      .finally(() => { if (active) setLogoResolved(true) })
    return () => { active = false }
  }, [schoolLogoUrl])

  function handleYearChange(nextYearId: string) {
    setYearId(nextYearId)
    const firstClassroom = classrooms.find(c => c.academic_year_id === nextYearId)
    setClassroomId(firstClassroom?.id || '')
  }

  function toggleReport(type: ReportType) {
    setSelectedReports(prev => (
      prev.includes(type)
        ? prev.length === 1 ? prev : prev.filter(item => item !== type)
        : [...prev, type]
    ))
  }

  function selectReportPreset(preset: 'daily' | 'health' | 'all') {
    if (preset === 'daily') setSelectedReports(['attendance', 'brushing', 'milk', 'lunch', 'cleaning', 'saving'])
    else if (preset === 'health') setSelectedReports(['health', 'inspection'])
    else setSelectedReports(REPORT_TYPES.map(r => r.key))
  }

  async function loadSelectedMonths(): Promise<Record<number, ExportData> | null> {
    if (!yearId || !classroomId || !monthKey || selectedMonths.length === 0 || selectedReports.length === 0) return null
    const requestId = ++loadRequestRef.current
    if (printMode) {
      (window as unknown as { __REPORT_READY__?: boolean }).__REPORT_READY__ = false
    }
    setIsLoading(true)
    setError('')
    try {
      const results = await Promise.all(selectedMonths.map(async month => {
        const result = await fetchClassroomAdminExportData(classroomId, yearId, setMonthInKey(monthKey, month), term)
        return [month, result] as const
      }))
      if (requestId !== loadRequestRef.current) return null
      const firstError = results.find(([, result]) => result.error)?.[1].error
      if (firstError) {
        setError(firstError)
        setDataByMonth({})
        return null
      }
      const nextData = Object.fromEntries(results.map(([month, result]) => [month, result as ExportData]))
      setDataByMonth(nextData)
      void loadMonthSignatures(selectedMonths)
      return nextData
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false)
    }
  }

  async function loadMonthSignatures(months: number[]) {
    if (!yearId || !classroomId || months.length === 0) {
      setSignaturesByMonth({})
      setMonthSignStatuses([])
      return
    }
    const result = await fetchClassroomAdminExportSignatures(classroomId, yearId, term, months)
    if (result.error) return
    setSignaturesByMonth(result.signaturesByMonth || {})
    setMonthSignStatuses(result.statuses || [])
  }

  async function handleBatchPropose() {
    if (!classroomId || selectedMonths.length === 0) return
    setBatchProposing(true)
    try {
      const result = await batchProposeClassroomAdminMonths(classroomId, term, selectedMonths)
      if (result.error && !result.results?.some(r => r.proposed)) {
        notify('error', result.error)
        return
      }
      notify(
        result.error ? 'error' : 'success',
        result.summary || (result.error ? result.error : 'เสนอเป็นชุดเรียบร้อย'),
      )
      await loadMonthSignatures(selectedMonths)
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'เสนอเป็นชุดไม่สำเร็จ')
    } finally {
      setBatchProposing(false)
    }
  }

  async function waitForPreviewRender() {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }

  async function printExportDocument() {
    let sourceData = dataByMonth
    if (Object.keys(sourceData).length === 0) {
      const loaded = await loadSelectedMonths()
      if (!loaded) return
      sourceData = loaded
    }
    await waitForPreviewRender()

    const book = document.querySelector('.classroom-export-book') as HTMLElement | null
    if (!book) {
      setError('ไม่พบเอกสารสำหรับพิมพ์')
      return
    }

    const images = Array.from(book.querySelectorAll<HTMLImageElement>('img'))
    await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
      img.addEventListener('load', () => resolve(), { once: true })
      img.addEventListener('error', () => resolve(), { once: true })
    })))

    const printStyles = classroomAdminPrintStyles(window.location.origin)
    const firstData = sourceData[selectedMonths.find(month => sourceData[month]) || selectedMonths[0]]
    const printTitle = `เล่มรายงานธุรการ_${firstData?.classroom?.level || ''}-${firstData?.classroom?.room || ''}_${selectedMonths.join('-')}`.trim()
    const escapeHtml = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
    const printWindow = window.open('', '_blank', 'width=1200,height=800')

    if (!printWindow) {
      window.print()
      return
    }

    printWindow.document.open()
    printWindow.document.write(`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(printTitle)}</title>
  <style>${printStyles}</style>
  <style>
    body { margin: 0; background: #ffffff; }
    .classroom-export-print-window { display: grid; place-items: start center; padding: 0; }
    .classroom-export-book { transform: none !important; }
    .attendance-print-sheet { box-shadow: none !important; }
  </style>
</head>
<body>
  <main class="classroom-export-print-window">${book.outerHTML}</main>
  <script>
    window.addEventListener('load', function () {
      window.setTimeout(function () {
        window.focus();
        window.print();
      }, 180);
    });
  </script>
</body>
</html>`)
    printWindow.document.close()
  }

  async function exportExcel() {
    let sourceData = dataByMonth
    let loadedMonths = selectedMonths.filter(month => sourceData[month])
    if (loadedMonths.length === 0) {
      const loaded = await loadSelectedMonths()
      if (!loaded) return
      sourceData = loaded
      loadedMonths = selectedMonths
    }
    if (loadedMonths.length === 0) return
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const baseHeaders = ['เลขที่', 'ชื่อ-นามสกุล']

    loadedMonths.forEach(month => {
      const data = sourceData[month]
      const days = Array.from({ length: data.days || 0 }, (_, i) => i + 1)
      const attendanceRows = data.students?.map(student => {
        const summary = summaryFor(student, data)
        return [
          student.student_number,
          studentName(student),
          ...days.map(day => data.schoolDays?.includes(day) ? attendanceExportDisplay(student.id, day, data) : ''),
          summary['ม'], summary['ป'], summary['ล'], summary['ข'],
        ]
      }) || []
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        [...baseHeaders, ...days.map(String), 'มา', 'ป่วย', 'ลา', 'ขาด'],
        ...attendanceRows,
      ]), `เวลาเรียน-${MONTH_SHORT_LABELS[month]}`.slice(0, 31))

      ;(['brushing', 'milk', 'lunch', 'cleaning', 'saving'] as ActivityType[]).forEach(type => {
        const rows = data.students?.map(student => {
          const summary = activitySummaryFor(student.id, type, data)
          return [
            student.student_number,
            studentName(student),
            ...days.map(day => data.schoolDays?.includes(day) ? (data.activities?.[type]?.[student.id]?.[day] || '') : ''),
            summary || '',
          ]
        }) || []
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
          [...baseHeaders, ...days.map(String), type === 'saving' ? 'รวม' : 'สรุปผล'],
          ...rows,
        ]), `${ACTIVITY_LABELS[type]}-${MONTH_SHORT_LABELS[month]}`.slice(0, 31))
      })
    })

    const firstData = sourceData[loadedMonths[0]]
    XLSX.writeFile(wb, `classroom-admin-${firstData.classroom?.level}-${firstData.classroom?.room}-${loadedMonths.join('-')}.xlsx`)
  }

  async function exportPdf() {
    let sourceData = dataByMonth
    if (Object.keys(dataByMonth).length === 0) {
      const loaded = await loadSelectedMonths()
      if (!loaded) return
      sourceData = loaded
    }

    setError('')
    const firstData = sourceData[selectedMonths.find(month => sourceData[month]) || selectedMonths[0]]
    const classLabel = `${firstData?.classroom?.level || ''}-${firstData?.classroom?.room || ''}`
    const fileName = `เล่มรายงานธุรการ_${classLabel}_${selectedMonths.join('-')}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
    const label = `เล่มธุรการ · ${classLabel} · ${selectedMonths.length} เดือน`

    const unsupported = selectedReports.filter(report => !isJsPdfBookReportType(report))
    if (unsupported.length > 0) {
      setError(`ยังไม่รองรับ jsPDF: ${unsupported.join(', ')}`)
      return
    }
    if (selectedReports.length === 0) {
      setError('กรุณาเลือกหมวดรายงาน')
      return
    }

    const exportMonths = selectedMonths.filter(month => sourceData[month])
    if (exportMonths.length === 0) {
      setError('ไม่พบข้อมูลสำหรับสร้าง PDF')
      return
    }

    const exportReports = [...selectedReports]
    const exportSource = sourceData
    const exportMonthKeyBase = monthKey
    const exportTerm = term
    const exportMonthlyLayout = printLayouts.monthly
    const exportStandardLayout = printLayouts.standard

    enqueueFileExport({
      fileName,
      label,
      run: async () => {
        const sigResult = await fetchClassroomAdminExportSignatures(
          classroomId,
          yearId,
          exportTerm,
          exportMonths,
        )
        return buildClassroomAdminBookPdfBlob({
          schoolName: schoolName || 'ชื่อโรงเรียน',
          schoolLogoUrl: schoolLogoUrl || null,
          yearBe: firstData?.academicYear?.year_be || years.find(y => y.id === yearId)?.year_be || 0,
          classroomLabel: `${firstData?.classroom?.level || ''}/${firstData?.classroom?.room || ''}`,
          term: exportTerm,
          monthKeyBase: exportMonthKeyBase,
          months: exportMonths,
          reports: exportReports,
          dataByMonth: exportSource,
          signaturesByMonth: sigResult.signaturesByMonth || {},
          monthlyLayout: exportMonthlyLayout,
          standardLayout: exportStandardLayout,
          homeroomTeacherName,
          directorName,
          actingDirectorPosition,
          fileName,
        })
      },
    })
  }
  const activeMonths = selectedMonths.filter(month => dataByMonth[month])
  const hasData = activeMonths.length > 0
  const canGenerate = Boolean(yearId && classroomId && selectedMonths.length > 0 && selectedReports.length > 0)
  const selectedClassroom = filteredClassrooms.find(c => c.id === classroomId)
  const homeroomTeacherName = selectedClassroom?.homeroom_teacher_id
    ? (teacherNameById[selectedClassroom.homeroom_teacher_id] || 'ยังไม่กำหนด')
    : 'ยังไม่กำหนด'
  const unsignedSelectedCount = selectedMonths.filter(month => {
    const status = monthSignStatuses.find(item => item.month === month)
    return !status?.hasSignature
  }).length
  const canBatchPropose = Boolean(classroomId && selectedMonths.length > 0 && unsignedSelectedCount > 0 && !isLoading && !batchProposing)

  const selectedMonthsKey = selectedMonths.join(',')

  useEffect(() => {
    if (!canGenerate) {
      setDataByMonth({})
      return
    }
    void loadSelectedMonths()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, classroomId, monthKey, term, selectedMonthsKey])

  useEffect(() => {
    if (!printMode) return
    if (isLoading || !hasData || !logoResolved) {
      (window as unknown as { __REPORT_READY__?: boolean }).__REPORT_READY__ = false
      return
    }
    let cancelled = false
    const markReady = async () => {
      try {
        if ('fonts' in document) await (document as { fonts: { ready: Promise<unknown> } }).fonts.ready
      } catch {}
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('.classroom-export-book img'))
      await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })))
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      await new Promise(resolve => setTimeout(resolve, 300))
      if (!cancelled) (window as unknown as { __REPORT_READY__?: boolean }).__REPORT_READY__ = true
    }
    void markReady()
    return () => { cancelled = true }
  }, [printMode, isLoading, hasData, logoResolved, activeMonths.length, selectedReports.length])

  // มาจากหน้าบันทึกธุรการ (autoprint=1) — โหลดเอกสารรูปแบบเมนูพิมพ์แล้วสั่งพิมพ์ทันที
  useEffect(() => {
    if (!autoPrintMode || printMode) return
    if (isLoading || !hasData || !logoResolved) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) void printExportDocument()
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrintMode, printMode, isLoading, hasData, logoResolved, activeMonths.length, selectedReports.length])

  const reportLabel = (type: ReportType) => classroomAdminDocumentTitle(type)

  function renderReportSheet(type: ReportType, data: ExportData, sheetMonthKey: string) {
    const monthly = type === 'attendance' || ['brushing', 'milk', 'lunch', 'cleaning', 'saving'].includes(type)
    const showActivitySummary = isRoutineActivityReport(type) || type === 'saving'
    const days = Array.from({ length: data.days || 0 }, (_, i) => i + 1)
    const allStudents = data.students || []
    const studentPages = chunkStudentsForPrintPages(allStudents)
    const holidayMap = Object.fromEntries((data.holidays || []).map(item => [item.date, item.name]))
    const isClosedWeekend = (day: number) => !(data.schoolDays || []).includes(day)
    const isOpenWeekend = (day: number) => Boolean(data.weekendSchoolDays?.some(item => item.date === dayDateKey(sheetMonthKey, day)))
    const isHoliday = (day: number) => Boolean(holidayMap[dayDateKey(sheetMonthKey, day)])
    const isSchoolDay = (day: number) => (data.schoolDays || []).includes(day) && !isHoliday(day)

    const sheetLayoutSection = classroomAdminPrintSectionForReport(type)
    const sheetLayoutStyle = classroomAdminSectionLayoutStyle(sheetLayoutSection, printLayouts[sheetLayoutSection])
    const pageCount = studentPages.length

    return studentPages.map((pageStudents, pageIndex) => {
      const pageOffset = pageIndex * PRINT_STUDENTS_PER_PAGE
      const targetRows = monthly
        ? printPageRowCount(pageStudents.length, {
          pageSize: PRINT_STUDENTS_PER_PAGE,
          minRows: printLayouts.monthly.minBlankRows,
        })
        : pageStudents.length
      // ให้คอลัมน์วันหยุดยาวเต็มตาราง (รวมแถวว่าง) เหมือนหน้า 1
      const holidayRowSpan = targetRows
      type PrintRow =
        | { type: 'student'; student: Student; number: number }
        | { type: 'blank'; number: number }
      const printRows: PrintRow[] = monthly
        ? [
            ...pageStudents.map((student, index) => ({
              type: 'student' as const,
              student,
              number: student.student_number || pageOffset + index + 1,
            })),
            ...Array.from({ length: Math.max(0, targetRows - pageStudents.length) }, (_, index) => ({
              type: 'blank' as const,
              number: pageOffset + pageStudents.length + index + 1,
            })),
          ]
        : []

      function renderExportPrintDayCells(bodyRowIndex: number, row: PrintRow | null) {
        return days.map(day => {
          const dateKey = dayDateKey(sheetMonthKey, day)
          const holiday = holidayMap[dateKey]
          if (holiday) {
            if (bodyRowIndex < holidayRowSpan) {
              if (bodyRowIndex > 0) return null
              return (
                <td
                  key={day}
                  rowSpan={holidayRowSpan}
                  className="attendance-print-status-cell attendance-print-holiday-cell is-holiday"
                  title={holidayColumnLabel(day, holiday)}
                >
                  <div className="attendance-print-holiday-stack">
                    <span className="attendance-print-holiday-name">{holiday}</span>
                  </div>
                </td>
              )
            }
            return <td key={day} className="attendance-print-empty-cell">&nbsp;</td>
          }

          if (!row || row.type === 'blank') {
            return <td key={day} className="attendance-print-empty-cell">&nbsp;</td>
          }

          const closedWeekend = isClosedWeekend(day)
          const openWeekend = isOpenWeekend(day)
          const schoolDay = isSchoolDay(day)
          const attendanceValue = type === 'attendance' && schoolDay ? attendanceExportDisplay(row.student.id, day, data) : ''
          const activityValue = type !== 'attendance' && schoolDay ? (data.activities?.[type as ActivityType]?.[row.student.id]?.[day] || 0) : 0
          const displayValue = type === 'attendance'
            ? attendanceValue
            : type === 'saving'
              ? (activityValue ? String(activityValue) : '')
              : classroomAdminDoneMark(activityValue)
          const attendanceClass = type === 'attendance' && attendanceValue
            ? (attendanceValue === 'ม' ? 'attendance-print-status-present' : `attendance-print-status-${attendanceValue}`)
            : type !== 'attendance' && type !== 'saving' && displayValue === CLASSROOM_ADMIN_CHECK_MARK
              ? 'attendance-print-status-present'
              : ''

          return (
            <td
              key={day}
              className={[
                'attendance-print-status-cell',
                attendanceClass,
                closedWeekend ? 'is-weekend' : '',
                openWeekend ? 'is-open-weekend' : '',
              ].filter(Boolean).join(' ')}
            >
              {displayValue}
            </td>
          )
        })
      }

      const pageLabel = pageCount > 1 ? `  |  หน้า ${pageIndex + 1}/${pageCount}` : ''

      return (
      <section className="attendance-print-sheet" key={`${type}-${sheetMonthKey}-p${pageIndex}`} style={sheetLayoutStyle}>
        <header className="attendance-print-head">
          <div className="attendance-print-logo-slot">
            {schoolLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc || schoolLogoUrl} alt="โลโก้โรงเรียน" />
            ) : (
              <span>ตรา</span>
            )}
          </div>
          <div>
            <h1>{reportLabel(type)}</h1>
            <div className="attendance-print-school">{schoolName || 'ชื่อโรงเรียน'}</div>
            <p>ภาคเรียนที่ {term}  |  ห้อง {data.classroom?.level}/{data.classroom?.room}  |  เดือน{monthName(sheetMonthKey)} พ.ศ.{data.academicYear?.year_be}{pageLabel}</p>
          </div>
        </header>

        {monthly ? (
          <table className="attendance-print-table">
            <colgroup>
              <col className="attendance-print-number-col" />
              <col className="attendance-print-name-col" />
              {days.map(day => <col key={day} />)}
              {type === 'attendance' && (
                <>
                  <col className="attendance-print-summary-col" />
                  <col className="attendance-print-summary-col" />
                  <col className="attendance-print-summary-col" />
                  <col className="attendance-print-summary-col" />
                </>
              )}
              {showActivitySummary && <col className="attendance-print-summary-col" />}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={3}>เลขที่</th>
                <th rowSpan={3}>ชื่อ-นามสกุล</th>
                <th colSpan={days.length} className="attendance-print-month-title">เดือน{monthName(sheetMonthKey)} พ.ศ.{data.academicYear?.year_be}</th>
                {type === 'attendance' && <th colSpan={4} className="attendance-print-summary-title">สรุปผล</th>}
                {showActivitySummary && (
                  <th rowSpan={3} className="attendance-print-summary-title">
                    {type === 'saving' ? 'รวม' : 'สรุปผล'}
                  </th>
                )}
              </tr>
              <tr>
                {days.map(day => (
                  <th
                    key={day}
                    className={[
                      'attendance-print-day',
                      isClosedWeekend(day) ? 'is-weekend' : '',
                      isOpenWeekend(day) ? 'is-open-weekend' : '',
                      isHoliday(day) ? 'is-holiday' : '',
                    ].filter(Boolean).join(' ')}
                    title={isHoliday(day) ? holidayColumnLabel(day, holidayMap[dayDateKey(sheetMonthKey, day)]) : undefined}
                  >
                    {day}
                  </th>
                ))}
                {type === 'attendance' && (
                  <>
                    <th rowSpan={2} className="attendance-print-summary-good">มา</th>
                    <th rowSpan={2} className="attendance-print-summary-sick">ป่วย</th>
                    <th rowSpan={2} className="attendance-print-summary-leave">ลา</th>
                    <th rowSpan={2} className="attendance-print-summary-absent">ขาด</th>
                  </>
                )}
              </tr>
              <tr>
                {days.map(day => (
                  <th
                    key={`weekday-${type}-${day}`}
                    className={[
                      'attendance-print-weekday',
                      isClosedWeekend(day) ? 'is-weekend' : '',
                      isOpenWeekend(day) ? 'is-open-weekend' : '',
                      isHoliday(day) ? 'is-holiday' : '',
                    ].filter(Boolean).join(' ')}
                    title={isHoliday(day) ? holidayColumnLabel(day, holidayMap[dayDateKey(sheetMonthKey, day)]) : undefined}
                  >
                    {dayLabel(sheetMonthKey, day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {printRows.map((row, bodyRowIndex) => {
                if (row.type === 'blank') {
                  return (
                    <tr key={`${type}-blank-${row.number}-p${pageIndex}`}>
                      <td>{row.number}</td>
                      <td>&nbsp;</td>
                      {renderExportPrintDayCells(bodyRowIndex, row)}
                      {type === 'attendance' && (
                        <>
                          <td className="attendance-print-summary-good">&nbsp;</td>
                          <td className="attendance-print-summary-sick">&nbsp;</td>
                          <td className="attendance-print-summary-leave">&nbsp;</td>
                          <td className="attendance-print-summary-absent">&nbsp;</td>
                        </>
                      )}
                      {showActivitySummary && <td className="attendance-print-summary-good">&nbsp;</td>}
                    </tr>
                  )
                }

                const summary = type === 'attendance' ? summaryFor(row.student, data) : null
                const activitySummary = showActivitySummary
                  ? activitySummaryFor(row.student.id, type as ActivityType, data)
                  : null
                return (
                  <tr key={`${type}-${row.student.id}-p${pageIndex}`}>
                    <td>{row.number}</td>
                    <td className="attendance-print-student-name">{studentName(row.student)}</td>
                    {renderExportPrintDayCells(bodyRowIndex, row)}
                    {summary && (
                      <>
                        <td className="attendance-print-summary-good">{summary['ม']}</td>
                        <td className="attendance-print-summary-sick">{summary['ป']}</td>
                        <td className="attendance-print-summary-leave">{summary['ล']}</td>
                        <td className="attendance-print-summary-absent">{summary['ข']}</td>
                      </>
                    )}
                    {activitySummary !== null && (
                      <td className="attendance-print-summary-good">
                        {activitySummary ? (type === 'saving' ? activitySummary.toLocaleString('th-TH') : activitySummary) : ''}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table
            className={`attendance-print-table attendance-print-standard-table${
              type === 'health'
                ? ' attendance-print-weight-table'
                : type === 'inspection'
                  ? ' attendance-print-inspection-table'
                  : ''
            }`}
            style={
              type === 'health'
                ? classroomAdminWeightHeightTableWidthStyle()
                : type === 'inspection'
                  ? classroomAdminStandardTableWidthStyle(INSPECTION_FIELDS.length)
                  : undefined
            }
          >
            {type === 'health' && (
              <colgroup>
                <col className="attendance-print-weight-number-col" />
                <col className="attendance-print-weight-name-col" />
                <col className="attendance-print-weight-field-col" />
                <col className="attendance-print-weight-field-col" />
                <col className="attendance-print-weight-field-col" />
                <col className="attendance-print-weight-field-col" />
              </colgroup>
            )}
            {type === 'inspection' && (
              <colgroup>
                <col className="attendance-print-inspection-number-col" />
                <col className="attendance-print-inspection-name-col" />
                {INSPECTION_FIELDS.map(field => (
                  <col key={field.key} className="attendance-print-inspection-field-col" />
                ))}
              </colgroup>
            )}
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>ชื่อ-นามสกุล</th>
                {type === 'health' ? (
                  <>
                    <th>น้ำหนัก (กก.)</th>
                    <th>ส่วนสูง (ซม.)</th>
                    <th>BMI</th>
                    <th>ผล</th>
                  </>
                ) : INSPECTION_FIELDS.map(field => <th key={field.key}>{field.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {pageStudents.map((student, index) => {
                const health = data.health?.[student.id]
                const inspection = data.inspection?.[student.id] || {}
                return (
                  <tr key={`${type}-${student.id}-p${pageIndex}`}>
                    <td>{student.student_number || pageOffset + index + 1}</td>
                    <td className="attendance-print-student-name">{studentName(student)}</td>
                    {type === 'health' ? (
                      <>
                        <td>{health?.weight ?? ''}</td>
                        <td>{health?.height ?? ''}</td>
                        <td>{health?.bmi ?? ''}</td>
                        <td>{health?.bmi_result ?? ''}</td>
                      </>
                    ) : INSPECTION_FIELDS.map(field => {
                      const value = inspection[field.key] || 'ผ่าน'
                      return <td key={field.key} className={value === 'ผ่าน' ? 'attendance-print-value-done' : 'attendance-print-value-alert'}>{value}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <footer className="attendance-print-signatures">
          <div>
            <div className="attendance-print-sign-line">
              ลงชื่อ{' '}
              {signaturesByMonth[Number(sheetMonthKey.slice(5, 7))]?.homeroom ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signaturesByMonth[Number(sheetMonthKey.slice(5, 7))]!.homeroom!}
                  alt=""
                  className="attendance-print-sign-img"
                />
              ) : (
                '...........................................'
              )}
            </div>
            <strong>( {homeroomTeacherName} )</strong>
            <span>ครูประจำชั้น</span>
          </div>
          <div>
            <div className="attendance-print-sign-line">
              ลงชื่อ{' '}
              {signaturesByMonth[Number(sheetMonthKey.slice(5, 7))]?.director ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signaturesByMonth[Number(sheetMonthKey.slice(5, 7))]!.director!}
                  alt=""
                  className="attendance-print-sign-img"
                />
              ) : (
                '...........................................'
              )}
            </div>
            <strong>( {directorName} )</strong>
            {actingDirectorPosition && <span>{actingDirectorPosition}</span>}
            <span>ผู้อำนวยการโรงเรียน{schoolName || 'ยังไม่กำหนด'}</span>
          </div>
        </footer>
      </section>
      )
    })
  }


  return (
    <ClassroomAdminPrintLayoutsProvider layouts={printLayouts}>
    <div className={`page-stack classroom-export-page${embedMode || autoPrintMode ? ' classroom-export-page--embed' : ''}${printMode ? ' classroom-export-page--print' : ''}`}>
      <ExportPageStyles />
      <ClassroomAdminPrintLayoutTuner
        open={layoutTunerOpen}
        onClose={() => setLayoutTunerOpen(false)}
        activeSection={layoutTunerSection}
        onActiveSectionChange={setLayoutTunerSection}
        layouts={printLayouts}
        onChange={setPrintLayouts}
        onSave={() => {
          saveClassroomAdminPrintLayouts(printLayouts)
          setLayoutSaved(true)
          window.setTimeout(() => setLayoutSaved(false), 2000)
        }}
        saved={layoutSaved}
        previewHint="เลื่อนค่าทางขวาแล้วดูผลบนหน้ากระดาษทันที"
        preview={
          hasData
            ? (
              <div className="classroom-export-book">
                {activeMonths.flatMap(month => {
                  const sheetData = dataByMonth[month]
                  const sheetMonthKey = setMonthInKey(monthKey, month)
                  return selectedReports.flatMap(report => renderReportSheet(report, sheetData, sheetMonthKey))
                })}
              </div>
            )
            : (
              <div className="ca-layout-live-preview__empty">
                เลือกเดือนและหมวดรายงานก่อน เพื่อดูพรีวิว
              </div>
            )
        }
      />
      <div className="classroom-export-workspace">
      {!embedMode && !printMode && !autoPrintMode && (
      <div className="classroom-export-control-card no-print">
        <div className="classroom-export-panel-section">
          <span>1</span>
          <strong>เลือกงานที่จะพิมพ์</strong>
        </div>
        <div className="classroom-export-presets">
          <button type="button" onClick={() => selectReportPreset('daily')}>ชุดกิจวัตร</button>
          <button type="button" onClick={() => selectReportPreset('health')}>ชุดสุขภาพ</button>
          <button type="button" onClick={() => selectReportPreset('all')}>ทั้งเล่ม</button>
        </div>
        <div className="classroom-export-report-tabs" aria-label="เลือกหมวดรายงาน">
          {REPORT_TYPES.map(report => (
            <button
              type="button"
              key={report.key}
              className={selectedReports.includes(report.key) ? 'is-selected' : ''}
              onClick={() => toggleReport(report.key)}
              title={report.hint}
            >
              <span>{report.label}</span>
            </button>
          ))}
        </div>

        <div className="classroom-export-panel-section">
          <span>2</span>
          <strong>ข้อมูลห้องเรียน</strong>
        </div>
        <div className="classroom-export-controls">
          <label>
            <span>ปี</span>
            <select value={yearId} onChange={e => handleYearChange(e.target.value)}>
              {years.map(y => <option key={y.id} value={y.id}>{y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
            </select>
          </label>
          <label>
            <span>ห้อง</span>
            <select value={classroomId} onChange={e => setClassroomId(e.target.value)}>
              <option value="">เลือกห้อง</option>
              {filteredClassrooms.map(c => <option key={c.id} value={c.id}>{c.level}/{c.room}</option>)}
            </select>
          </label>
          <label>
            <span>ภาคเรียน</span>
            <select value={term} onChange={e => {
              const nextTerm = Number(e.target.value) as 1 | 2
              setTerm(nextTerm)
              setSelectedMonths(TERM_MONTHS[nextTerm])
              setMonthKey(setMonthInKey(monthKey, TERM_MONTHS[nextTerm][0]))
            }}>
              <option value={1}>ภาคเรียนที่ 1</option>
              <option value={2}>ภาคเรียนที่ 2</option>
            </select>
          </label>
        </div>

        <div className="classroom-export-panel-section">
          <span>3</span>
          <strong>เลือกเดือน</strong>
        </div>
        <div className="classroom-export-month-row">
          <div className="classroom-export-month-tabs">
            {TERM_MONTHS[term].map(month => (
              <button
                key={month}
                type="button"
                className={selectedMonths.includes(month) ? 'is-active' : ''}
                onClick={() => {
                  setSelectedMonths(prev => {
                    if (prev.includes(month)) return prev.length === 1 ? prev : prev.filter(item => item !== month)
                    return [...prev, month].sort((a, b) => TERM_MONTHS[term].indexOf(a) - TERM_MONTHS[term].indexOf(b))
                  })
                  setMonthKey(setMonthInKey(monthKey, month))
                }}
              >
                {MONTH_SHORT_LABELS[month]}
                {monthSignStatuses.find(item => item.month === month)?.hasSignature ? (
                  <em className="classroom-export-month-signed" aria-label="มีลายเซ็นแล้ว">เซ็นแล้ว</em>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              className={selectedMonths.length === TERM_MONTHS[term].length ? 'is-summary is-active' : 'is-summary'}
              onClick={() => setSelectedMonths(TERM_MONTHS[term])}
            >
              สรุป
            </button>
          </div>
          <div className="classroom-export-status">
            {isLoading ? 'กำลังโหลดข้อมูล...' : canGenerate ? `พร้อมสร้าง ${selectedMonths.length} เดือน · ${selectedReports.length} หมวด` : 'เลือกเดือนและหมวดรายงานก่อน'}
          </div>
        </div>
      </div>
      )}

      {error && <div className="alert alert-error no-print">{error}</div>}

      <div className="classroom-export-preview-pane">
      {!embedMode && !printMode && !autoPrintMode && (
        <div className="classroom-export-preview-toolbar no-print">
          <label>
            <span>ขนาด</span>
            <select value={previewScale} onChange={e => setPreviewScale(Number(e.target.value))} disabled={!hasData}>
              {PREVIEW_SCALE_OPTIONS.map(value => (
                <option key={value} value={value}>{value}%</option>
              ))}
            </select>
          </label>
          <div className="classroom-export-preview-toolbar-actions">
            {layoutTunerEnabled && (
            <button
              type="button"
              className={`classroom-export-secondary-btn pp5-tuner-toggle${layoutTunerOpen ? ' active' : ''}`}
              onClick={() => setLayoutTunerOpen(open => !open)}
              disabled={!canGenerate}
            >
              {layoutTunerOpen ? 'ปิดปรับ layout' : 'ปรับ layout'}
            </button>
            )}
            <button type="button" onClick={exportExcel} className="classroom-export-secondary-btn" disabled={!canGenerate || isLoading}>Excel</button>
            <button
              type="button"
              onClick={handleBatchPropose}
              className="classroom-export-propose-btn"
              disabled={!canBatchPropose}
              title={unsignedSelectedCount === 0 ? 'เดือนที่เลือกมีลายเซ็นครบแล้ว' : `เสนอเซ็น ${unsignedSelectedCount} เดือนที่ยังไม่มีลายเซ็น`}
            >
              {batchProposing ? 'กำลังเสนอ...' : `เสนอเป็นชุด${unsignedSelectedCount ? ` (${unsignedSelectedCount})` : ''}`}
            </button>
            <button type="button" onClick={() => void exportPdf()} className="classroom-export-pdf-btn" disabled={!canGenerate || isLoading}>
              บันทึก PDF
            </button>
            <button type="button" onClick={printExportDocument} className="classroom-export-primary-btn" disabled={!canGenerate || isLoading}>พิมพ์</button>
          </div>
        </div>
      )}
      {hasData ? (
        <div className="classroom-export-preview-card">
          <div className="classroom-export-preview-stage">
            <div
              className={`classroom-export-book${printMode ? ' is-pdf-export' : ''}`}
              style={printMode ? undefined : { transform: `scale(${(embedMode ? 72 : previewScale) / 100})`, transformOrigin: 'top center' }}
            >
              {activeMonths.flatMap(month => {
                const sheetData = dataByMonth[month]
                const sheetMonthKey = setMonthInKey(monthKey, month)
                return selectedReports.flatMap(report => renderReportSheet(report, sheetData, sheetMonthKey))
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="classroom-export-preview-empty no-print">
          <div>
            <strong>{isLoading ? 'กำลังโหลดตัวอย่าง...' : 'ยังไม่แสดงตัวอย่าง'}</strong>
            <p>{isLoading ? 'รอสักครู่ ระบบกำลังดึงข้อมูลรายเดือน' : 'เลือกเดือนและหมวดรายงานทางซ้าย ตัวอย่างจะแสดงอัตโนมัติ'}</p>
          </div>
        </div>
      )}
      </div>
      </div>
      <AlertModal />
    </div>
    </ClassroomAdminPrintLayoutsProvider>
  )
}

function ExportPageStyles() {
  const fontFaces = reportFontFaceCss()
  const caPageW = CLASSROOM_ADMIN_A4_LANDSCAPE_CSS.width
  const caPageH = CLASSROOM_ADMIN_A4_LANDSCAPE_CSS.height
  return (
    <style>{`
${fontFaces}
      .classroom-export-page {
        --export-border: #D7DEE8;
        --export-ink: #0F172A;
        --export-muted: #64748B;
        gap: 0;
      }
      .classroom-export-workspace {
        display: grid;
        grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }
      .classroom-export-hero {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: center;
        padding: 26px;
        border: 1px solid rgba(184, 149, 106, 0.16);
        border-radius: 30px;
        background: radial-gradient(circle at top left, rgba(139, 107, 69, 0.18), transparent 34%), linear-gradient(135deg, #FFFFFF 0%, #FFFDF9 52%, #F5EDE3 100%);
        box-shadow: 0 24px 50px rgba(139, 107, 69, 0.12);
      }
      .classroom-export-hero-copy span,
      .classroom-export-preview-head span,
      .classroom-export-cover span {
        display: inline-flex;
        color: #8B6B45;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.1em;
      }
      .classroom-export-hero-copy h1 {
        margin: 6px 0 8px;
        color: var(--export-ink);
        font-size: clamp(28px, 4vw, 42px);
        font-weight: 900;
        line-height: 1.1;
      }
      .classroom-export-hero-copy p {
        max-width: 660px;
        margin: 0;
        color: var(--export-muted);
        font-size: 15px;
        line-height: 1.75;
      }
      .classroom-export-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .classroom-export-primary-btn,
      .classroom-export-preview-btn,
      .classroom-export-pdf-btn,
      .classroom-export-propose-btn,
      .classroom-export-close-btn,
      .classroom-export-secondary-btn,
      .classroom-export-controls button {
        border: 0;
        border-radius: 10px;
        padding: 10px 16px;
        font-weight: 900;
        cursor: pointer;
        transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
      }
      .classroom-export-primary-btn {
        color: white;
        background: linear-gradient(135deg, #16A34A, #059669);
        box-shadow: 0 10px 18px rgba(22, 163, 74, 0.22);
      }
      .classroom-export-secondary-btn,
      .classroom-export-controls button {
        color: #C2410C;
        background: #FFEDD5;
      }
      .classroom-export-preview-btn {
        color: #6B4F32;
        background: #EFF6FF;
        box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.14);
      }
      .classroom-export-pdf-btn {
        color: #5C4330;
        background: #F5EDE3;
        box-shadow: 0 10px 18px rgba(139, 107, 69, 0.14);
      }
      .classroom-export-propose-btn {
        color: #78350F;
        background: linear-gradient(135deg, #FDE68A, #FBBF24);
        box-shadow: 0 10px 18px rgba(245, 158, 11, 0.22);
      }
      .classroom-export-propose-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }
      .classroom-export-month-signed {
        display: block;
        margin-top: 2px;
        font-size: 9px;
        font-style: normal;
        font-weight: 800;
        color: #15803D;
        line-height: 1;
      }
      .classroom-export-month-tabs button.is-active .classroom-export-month-signed {
        color: #DCFCE7;
      }
      .classroom-export-close-btn {
        color: #475569;
        background: #F1F5F9;
      }
      .classroom-export-primary-btn:hover,
      .classroom-export-secondary-btn:hover,
      .classroom-export-controls button:hover {
        transform: translateY(-1px);
      }
      .classroom-export-primary-btn:disabled,
      .classroom-export-preview-btn:disabled,
      .classroom-export-pdf-btn:disabled,
      .classroom-export-close-btn:disabled,
      .classroom-export-secondary-btn:disabled,
      .classroom-export-controls button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
        transform: none;
        box-shadow: none;
      }
      .classroom-export-control-card {
        display: grid;
        gap: 10px;
        padding: 12px;
        border: 1px solid #E2E8F0;
        border-radius: 14px;
        background: #FFFFFF;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
        position: sticky;
        top: 0;
        font-size: 12px;
      }
      .classroom-export-panel-section {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 2px;
        color: #475569;
      }
      .classroom-export-panel-section span {
        display: grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 8px;
        color: #6B4F32;
        background: #F5EDE3;
        font-size: 11px;
        font-weight: 900;
      }
      .classroom-export-panel-section strong {
        font-size: 13px;
        font-weight: 900;
      }
      .classroom-export-report-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        align-items: center;
        padding-bottom: 2px;
      }
      .classroom-export-report-tabs button {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        gap: 4px;
        min-height: 32px;
        padding: 6px 8px;
        border: 0;
        border-radius: 999px;
        background: rgba(255,255,255,0.62);
        color: #475569;
        font-size: 11px;
        font-weight: 900;
        white-space: nowrap;
        cursor: pointer;
        box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.22);
      }
      .classroom-export-report-tabs button.is-selected {
        color: #FFFFFF;
        background: linear-gradient(135deg, #6B4F32, #8B6B45);
        box-shadow: 0 8px 16px rgba(107, 79, 50, 0.22);
      }
      .classroom-export-control-title {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 14px;
      }
      .classroom-export-control-title strong {
        display: block;
        color: var(--export-ink);
        font-size: 18px;
        font-weight: 900;
      }
      .classroom-export-control-title p {
        margin: 4px 0 0;
        color: var(--export-muted);
        font-size: 13px;
      }
      .classroom-export-control-title > span {
        padding: 6px 10px;
        border-radius: 999px;
        color: #0369A1;
        background: #E0F2FE;
        font-size: 12px;
        font-weight: 900;
        white-space: nowrap;
      }
      .classroom-export-controls {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        align-items: stretch;
      }
      .classroom-export-controls label {
        display: grid;
        gap: 7px;
      }
      .classroom-export-controls label span {
        color: #64748B;
        font-size: 12px;
        font-weight: 900;
      }
      .classroom-export-controls select {
        width: 100%;
        min-height: 36px;
        padding: 0 10px;
        border: 1px solid rgba(148, 163, 184, 0.45);
        border-radius: 10px;
        background: #FFFFFF;
        color: var(--export-ink);
        font-size: 13px;
        font-weight: 800;
        outline: none;
      }
      .classroom-export-controls select:focus {
        border-color: #C4A574;
        box-shadow: 0 0 0 4px rgba(184, 149, 106, 0.16);
      }
      .classroom-export-load-btn {
        color: #6B4F32 !important;
        background: #EFF6FF !important;
        box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.14);
      }
      .classroom-export-month-row {
        display: grid;
        align-items: center;
        gap: 12px;
      }
      .classroom-export-presets {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .classroom-export-presets button {
        border: 1px solid #E8D9C4;
        border-radius: 10px;
        background: #F8FAFC;
        color: #5C4330;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
      }
      .classroom-export-month-tabs {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 7px;
        align-items: center;
        padding: 0;
        border-radius: 0;
        background: transparent;
      }
      .classroom-export-month-tabs button {
        border: 0;
        border-radius: 10px;
        padding: 8px 9px;
        color: #64748B;
        background: rgba(255,255,255,0.72);
        font-size: 11px;
        font-weight: 900;
        cursor: pointer;
      }
      .classroom-export-month-tabs button.is-active {
        color: #FFFFFF;
        background: #6B4F32;
      }
      .classroom-export-month-tabs button.is-summary {
        color: #92400E;
        background: #FEF3C7;
      }
      .classroom-export-status {
        padding: 6px 10px;
        border-radius: 999px;
        color: #64748B;
        background: rgba(255,255,255,0.58);
        font-size: 12px;
        font-weight: 900;
      }
      .classroom-export-actions-main {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-top: 2px;
        padding-top: 14px;
        border-top: 1px solid #E2E8F0;
      }
      .classroom-export-actions-main button {
        justify-content: center;
        min-height: 44px;
      }
      .classroom-export-report-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(140px, 1fr));
        gap: 10px;
        margin-top: 12px;
      }
      .classroom-export-report-grid button {
        display: grid;
        gap: 3px;
        min-height: 68px;
        padding: 12px;
        border: 1px solid #E2E8F0;
        border-radius: 18px;
        background: #FFFFFF;
        text-align: left;
        cursor: pointer;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
      }
      .classroom-export-report-grid button strong {
        color: #0F172A;
        font-size: 14px;
        font-weight: 900;
      }
      .classroom-export-report-grid button span {
        color: #64748B;
        font-size: 12px;
        font-weight: 700;
      }
      .classroom-export-report-grid button.is-selected {
        border-color: #8B6B45;
        background: linear-gradient(135deg, #F5EDE3, #FFFFFF);
        box-shadow: 0 12px 24px rgba(139, 107, 69, 0.12);
      }
      .classroom-export-report-grid button.is-selected strong {
        color: #5C4330;
      }
      .classroom-export-pdf-btn.is-loading {
        opacity: 0.75;
        cursor: wait;
      }
      .classroom-export-pdf-ready {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 14px 16px;
        border: 1px solid #86EFAC;
        border-radius: 14px;
        background: #F0FDF4;
        color: #166534;
      }
      .classroom-export-pdf-ready strong {
        font-weight: 900;
      }
      .classroom-export-pdf-ready span {
        color: #15803D;
        font-size: 13px;
      }
      .classroom-export-pdf-ready a {
        margin-left: auto;
        text-decoration: none;
      }
      .classroom-export-preview-pane {
        min-width: 0;
        display: grid;
        gap: 0;
        align-content: start;
        overflow: visible;
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
        min-height: calc(100vh - 88px);
      }
      .classroom-export-preview-toolbar {
        position: sticky;
        top: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 46px;
        padding: 6px 12px;
        background: #FFFFFF;
        border: 1px solid #D7DEE8;
        border-radius: 10px 10px 0 0;
        border-bottom: 4px solid #E5EBF2;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
      }
      .classroom-export-preview-toolbar label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #64748B;
        font-size: 12px;
        font-weight: 800;
      }
      .classroom-export-preview-toolbar select {
        min-height: 32px;
        padding: 0 8px;
        border: 1px solid #CBD5E1;
        border-radius: 8px;
        background: #FFFFFF;
        color: #0F172A;
        font-weight: 800;
      }
      .classroom-export-preview-toolbar-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }
      .classroom-export-preview-toolbar-actions button {
        min-height: 34px;
        padding: 8px 12px;
        font-size: 12px;
      }
      .classroom-export-preview-card {
        padding: 12px 16px 20px;
        border: 1px solid #D7DEE8;
        border-top: 0;
        border-radius: 0 0 12px 12px;
        background: #E8EEF6;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.65);
        overflow: auto;
        min-height: calc(100vh - 140px);
      }
      .classroom-export-preview-empty {
        min-height: calc(100vh - 140px);
        display: grid;
        place-items: center;
        color: #64748B;
        text-align: center;
        background: #FFFFFF;
        border-radius: 14px;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
      }
      .classroom-export-preview-empty strong {
        display: block;
        color: #334155;
        font-size: 15px;
        font-weight: 900;
      }
      .classroom-export-preview-empty p {
        margin: 6px 0 0;
        font-size: 13px;
      }
      .classroom-export-preview.is-modal {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        grid-template-rows: auto 1fr;
        gap: 0;
        background: #EEF2F7;
      }
      .classroom-export-preview-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        padding: 0 4px;
      }
      .classroom-export-preview.is-modal .classroom-export-preview-head {
        padding: 10px 14px;
        border-bottom: 1px solid #CBD5E1;
        background: #FFFFFF;
      }
      .classroom-export-preview-head strong {
        display: block;
        margin-top: 2px;
        color: var(--export-ink);
        font-size: 18px;
        font-weight: 900;
      }
      .classroom-export-preview-head p {
        margin: 0;
        color: var(--export-muted);
        font-size: 13px;
      }
      .classroom-export-preview-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .classroom-export-preview-actions label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #475569;
        font-size: 12px;
        font-weight: 900;
      }
      .classroom-export-preview-actions select {
        min-height: 34px;
        padding: 0 8px;
        border: 1px solid #CBD5E1;
        border-radius: 9px;
        background: #FFFFFF;
        color: #0F172A;
        font-weight: 800;
      }
      .classroom-export-preview-stage {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        width: 100%;
        margin: 0 auto;
        padding: 8px 0 24px;
        overflow: visible;
      }
      .classroom-export-preview.is-modal .classroom-export-preview-stage {
        overflow: visible;
        justify-self: center;
        margin-top: 24px;
      }
      .classroom-export-preview.is-modal {
        overflow: auto;
      }
      .classroom-export-book {
        display: grid;
        gap: 18px;
        justify-items: center;
        width: ${caPageW};
        max-width: none;
        margin: 0 auto;
        transform-origin: top center;
      }
      .classroom-export-book.is-pdf-export {
        display: block;
        gap: 0;
        transform: none !important;
      }
      .classroom-export-book.is-pdf-export .attendance-print-sheet {
        height: ${caPageH};
        overflow: hidden;
        box-shadow: none;
        break-after: page;
        page-break-after: always;
      }
      .classroom-export-book.is-pdf-export .attendance-print-sheet:last-child {
        break-after: auto;
        page-break-after: auto;
      }
      .attendance-print-sheet {
        display: flex;
        flex-direction: column;
        width: ${caPageW};
        height: ${caPageH};
        overflow: hidden;
        padding: var(--ca-pad-top, 16px) var(--ca-pad-x, 18px) var(--ca-pad-bottom, 12px);
        background: #FFFFFF;
        color: #111827;
        box-shadow: 0 18px 45px rgba(15,23,42,0.16);
        font-family: ${REPORT_FONT_FAMILY} !important;
        break-after: page;
        page-break-after: always;
      }
      .attendance-print-sheet,
      .attendance-print-sheet * {
        font-family: ${REPORT_FONT_FAMILY} !important;
      }
      .attendance-print-sheet:last-child {
        break-after: auto;
        page-break-after: auto;
      }
      .attendance-print-head {
        display: grid;
        justify-items: center;
        gap: 3px;
        margin-bottom: 6px;
        text-align: center;
        flex: 0 0 auto;
      }
      .attendance-print-logo-slot {
        width: var(--ca-logo-size, 42px);
        height: var(--ca-logo-size, 42px);
        display: grid;
        place-items: center;
        border: 1px solid #CBD5E1;
        border-radius: 50%;
        color: #94A3B8;
        font-size: 11px;
        overflow: hidden;
      }
      .attendance-print-logo-slot img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .attendance-print-head h1 {
        margin: 0;
        font-size: var(--ca-font-h1, 16px);
        line-height: 1.05;
        font-weight: 900;
        color: #111827;
      }
      .attendance-print-school {
        margin-top: var(--ca-head-line-gap, 2px);
        font-size: var(--ca-font-school, 16px);
        font-weight: 900;
        color: #111827;
      }
      .attendance-print-head p {
        margin: var(--ca-head-line-gap, 1px) 0 0;
        font-size: var(--ca-font-meta, 11px);
        font-weight: 800;
        color: #334155;
      }
      .attendance-print-table {
        width: 100%;
        flex: 0 0 auto;
        table-layout: fixed;
        border-collapse: collapse;
        border-spacing: 0;
        font-size: var(--ca-font-table, 8px);
        line-height: 1.2;
        letter-spacing: var(--ca-letter-spacing, 0);
      }
      .attendance-print-table.attendance-print-inspection-table {
        width: var(--ca-inspection-table-w, auto);
        max-width: 100%;
      }
      .attendance-print-table.attendance-print-weight-table {
        width: 100%;
        max-width: 100%;
      }
      .classroom-export-book.is-pdf-export .attendance-print-inspection-table {
        width: var(--ca-inspection-table-w) !important;
        max-width: var(--ca-inspection-table-w) !important;
      }
      .classroom-export-book.is-pdf-export .attendance-print-weight-table {
        width: var(--ca-weight-table-w, 100%) !important;
        max-width: var(--ca-weight-table-w, 100%) !important;
      }
      .attendance-print-number-col { width: var(--ca-number-col-w, 42px); }
      .attendance-print-name-col { width: var(--ca-name-col-w, 190px); }
      .attendance-print-summary-col { width: var(--ca-summary-col-w, 40px); }
      .attendance-print-table th,
      .attendance-print-table td {
        border: 1px solid #111827;
        padding: 1px 2px;
        box-sizing: border-box;
        text-align: center;
        vertical-align: middle;
        color: #111827;
        overflow: hidden;
        line-height: 1.2;
      }
      .attendance-print-table tbody tr,
      .attendance-print-table tbody td {
        height: var(--ca-row-h, 20px);
      }
      .attendance-print-table th {
        background: #BFEAF4;
        font-weight: 900;
      }
      .attendance-print-month-title {
        background: #BFEAF4 !important;
        font-size: var(--ca-font-month-title, 10px);
      }
      .attendance-print-summary-title {
        background: #C4B5FD !important;
        font-size: var(--ca-font-summary-title, 10px);
      }
      .attendance-print-student-name {
        text-align: left !important;
        padding: 1px 2px 1px 6px !important;
        font-size: var(--ca-font-name, 11px) !important;
        font-weight: 900;
        line-height: 1.2 !important;
        vertical-align: middle !important;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .attendance-print-status-cell.attendance-print-status-present,
      .attendance-print-status-cell.attendance-print-status-ม,
      .attendance-print-status-cell:not(.is-weekend):not(.is-holiday):not(:empty) {
        background: #CFF8D8;
        font-weight: 900;
        color: #14532D;
      }
      .attendance-print-status-ป,
      .attendance-print-status-ล {
        background: #FEF3C7 !important;
        color: #78350F !important;
        font-weight: 900;
      }
      .attendance-print-status-ข {
        background: #FEE2E2 !important;
        color: #7F1D1D !important;
        font-weight: 900;
      }
      .attendance-print-status-cell.is-weekend,
      .attendance-print-empty-cell.is-weekend,
      .attendance-print-day.is-weekend,
      .attendance-print-weekday.is-weekend {
        background: #D9D9D9 !important;
      }
      .attendance-print-status-cell.is-holiday,
      .attendance-print-day.is-holiday {
        background: #FF5B5F !important;
        color: #111827;
      }
      .attendance-print-holiday-cell {
        background: #FF5B5F !important;
        padding: 0 !important;
        vertical-align: middle !important;
        position: relative;
      }
      .attendance-print-holiday-stack {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2px 0;
        box-sizing: border-box;
        overflow: hidden;
      }
      /* ตรงกับ jsPDF angle 90: ข้อความหมุนทวนเข็ม อ่านจากล่างขึ้นบน */
      .attendance-print-holiday-name {
        display: block;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        transform: rotate(180deg);
        color: #111827 !important;
        font-size: var(--ca-font-holiday, 7px);
        font-weight: 900;
        line-height: 1.1;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        max-height: calc(100% - 2px);
      }
      .attendance-print-summary-good { background: #DCFCE7 !important; font-weight: 900; }
      .attendance-print-summary-sick { background: #FEF3C7 !important; font-weight: 900; }
      .attendance-print-summary-leave,
      .attendance-print-summary-absent { background: #FEE2E2 !important; font-weight: 900; }
      .attendance-print-standard-table {
        margin-top: 8px;
        font-size: var(--ca-font-standard-table, 10px);
      }
      .attendance-print-standard-table th,
      .attendance-print-standard-table td {
        padding: 2px 4px;
        line-height: 1.2;
      }
      .attendance-print-standard-table tbody tr,
      .attendance-print-standard-table tbody th,
      .attendance-print-standard-table tbody td {
        height: var(--ca-standard-row-h, 24px);
      }
      .attendance-print-standard-table .attendance-print-student-name {
        font-size: var(--ca-font-standard-name, 12px) !important;
      }
      .attendance-print-inspection-table .attendance-print-inspection-number-col {
        width: ${CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.numberPx}px;
      }
      .attendance-print-inspection-table .attendance-print-inspection-name-col {
        width: ${CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.namePx}px;
      }
      .attendance-print-inspection-table .attendance-print-inspection-field-col {
        width: ${CLASSROOM_ADMIN_STANDARD_TABLE_COL_WIDTHS.fieldPx}px;
      }
      .attendance-print-weight-table .attendance-print-weight-number-col {
        width: ${CLASSROOM_ADMIN_WEIGHT_HEIGHT_COL_WIDTHS.numberPx}px;
      }
      .attendance-print-weight-table .attendance-print-weight-name-col {
        width: ${CLASSROOM_ADMIN_WEIGHT_HEIGHT_COL_WIDTHS.namePx}px;
      }
      .attendance-print-weight-table .attendance-print-weight-field-col {
        width: auto;
      }
      .attendance-print-weight-table th,
      .attendance-print-weight-table td {
        font-size: var(--ca-font-standard-table, 11px);
      }
      .attendance-print-weight-table .attendance-print-student-name {
        font-size: var(--ca-font-standard-name, 12px) !important;
      }
      .attendance-print-value-done {
        background: #CFF8D8 !important;
        color: #14532D !important;
        font-weight: 900;
      }
      .attendance-print-value-alert {
        background: #FEE2E2 !important;
        color: #7F1D1D !important;
        font-weight: 900;
      }
      .attendance-print-signatures {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--ca-signature-gap, 120px);
        flex: 0 0 auto;
        margin-top: auto;
        padding-top: var(--ca-signature-margin-top, 20px);
      }
      .attendance-print-signatures > div {
        text-align: center;
        font-size: var(--ca-font-signature, 12px);
        color: #111827;
      }
      .attendance-print-sign-line {
        width: 260px;
        margin: 0 auto 4px;
        line-height: 1.15;
        min-height: 42px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        gap: 6px;
      }
      .attendance-print-sign-img {
        display: inline-block;
        height: 42px;
        width: auto;
        max-width: 160px;
        object-fit: contain;
        vertical-align: bottom;
      }
      .attendance-print-signatures strong {
        display: block;
        min-height: 15px;
        font-size: var(--ca-font-signature, 12px);
        font-weight: 900;
        line-height: 1.15;
      }
      .attendance-print-signatures span {
        display: block;
        margin-top: 2px;
        font-size: var(--ca-font-signature-role, 11px);
        line-height: 1.15;
      }
      .classroom-export-sheet {
        position: relative;
        overflow: hidden;
        background: linear-gradient(#FFFFFF, #FFFFFF) padding-box, linear-gradient(135deg, rgba(139, 107, 69, 0.45), rgba(14, 165, 233, 0.25), rgba(15, 23, 42, 0.12)) border-box;
        border: 1px solid transparent;
        border-radius: 28px;
        box-shadow: 0 28px 70px rgba(15, 23, 42, 0.14);
        padding: 28px;
      }
      .classroom-export-sheet.is-pdf-export {
        overflow: visible;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        background: #FFFFFF;
      }
      .classroom-export-cover {
        display: flex;
        gap: 18px;
        align-items: center;
        padding: 0 0 20px;
        border-bottom: 1px solid #D7DEE8;
        margin-bottom: 18px;
      }
      .classroom-export-doc-mark {
        display: grid;
        place-items: center;
        width: 78px;
        height: 78px;
        border-radius: 24px;
        color: white;
        background: linear-gradient(135deg, #6B4F32, #0891B2);
        box-shadow: 0 18px 32px rgba(107, 79, 50, 0.24);
        font-size: 14px;
        font-weight: 900;
        text-align: center;
      }
      .classroom-export-cover h2 {
        margin: 4px 0;
        font-size: 30px;
        font-weight: 900;
        color: var(--export-ink);
        letter-spacing: -0.02em;
      }
      .classroom-export-cover p {
        margin: 0;
        color: var(--export-muted);
        font-size: 14px;
        font-weight: 700;
      }
      .classroom-export-doc-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin-bottom: 22px;
      }
      .classroom-export-doc-stats div {
        padding: 14px;
        border: 1px solid #E2E8F0;
        border-radius: 18px;
        background: linear-gradient(180deg, #F8FAFC, #FFFFFF);
      }
      .classroom-export-doc-stats span,
      .classroom-export-doc-stats small {
        display: block;
        color: #64748B;
        font-size: 11px;
        font-weight: 900;
      }
      .classroom-export-doc-stats strong {
        display: inline-block;
        margin: 3px 5px 0 0;
        color: #1E1B4B;
        font-size: 26px;
        font-weight: 900;
        line-height: 1;
      }
      .classroom-export-section {
        margin-top: 18px;
        padding: 16px;
        border: 1px solid #E2E8F0;
        border-radius: 20px;
        background: #FFFFFF;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .classroom-export-section-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: baseline;
        margin-bottom: 12px;
      }
      .classroom-export-section-head h3 {
        margin: 0;
        color: var(--export-ink);
        font-size: 17px;
        font-weight: 900;
      }
      .classroom-export-section-head span {
        color: var(--export-muted);
        font-size: 12px;
        font-weight: 800;
        text-align: right;
      }
      .classroom-export-table-wrap {
        overflow: auto;
        max-width: 100%;
        max-height: 620px;
        border: 1px solid var(--export-border);
        border-radius: 16px;
        background: white;
      }
      .classroom-export-month-table,
      .classroom-export-simple-table {
        width: 100%;
        min-width: 1120px;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 12px;
      }
      .classroom-export-month-table th,
      .classroom-export-month-table td,
      .classroom-export-simple-table th,
      .classroom-export-simple-table td {
        border: 1px solid var(--export-border);
        padding: 6px 7px;
        text-align: center;
        color: var(--export-ink);
      }
      .classroom-export-month-table th,
      .classroom-export-simple-table th {
        position: sticky;
        top: 0;
        z-index: 3;
        background: #F5EDE3;
        color: #3F2E1F;
        font-weight: 900;
      }
      .classroom-export-month-table thead tr:nth-child(2) th {
        top: 31px;
        background: #F8FAFC;
        color: #64748B;
        font-size: 11px;
      }
      .classroom-export-month-table th:first-child,
      .classroom-export-month-table td:first-child,
      .classroom-export-simple-table th:first-child,
      .classroom-export-simple-table td:first-child {
        position: sticky;
        left: 0;
        z-index: 2;
        width: 54px;
        min-width: 54px;
        background: #FFFFFF;
        font-weight: 900;
      }
      .classroom-export-month-table th:first-child,
      .classroom-export-simple-table th:first-child {
        z-index: 5;
        background: #F5EDE3;
      }
      .classroom-export-month-table th:nth-child(2),
      .classroom-export-month-table td:nth-child(2),
      .classroom-export-simple-table th:nth-child(2),
      .classroom-export-simple-table td:nth-child(2) {
        position: sticky;
        left: 54px;
        z-index: 2;
        background: #FFFFFF;
        text-align: left;
        width: 220px;
        min-width: 220px;
        font-weight: 800;
      }
      .classroom-export-month-table th:nth-child(2),
      .classroom-export-simple-table th:nth-child(2) {
        z-index: 5;
        background: #F5EDE3;
      }
      .classroom-export-month-table tbody tr:nth-child(even) td,
      .classroom-export-simple-table tbody tr:nth-child(even) td {
        background-color: #FBFCFF;
      }
      .classroom-export-month-table tbody tr:hover td,
      .classroom-export-simple-table tbody tr:hover td {
        background-color: #F8FAFC;
      }
      .classroom-export-month-table th.is-closed,
      .classroom-export-month-table td.is-closed {
        background: #F1F5F9;
        color: #94A3B8;
      }
      .classroom-export-month-table td:not(:first-child):not(:nth-child(2)) {
        min-width: 36px;
      }
      .classroom-export-simple-table {
        min-width: 760px;
      }
      @media (max-width: 640px) {
        .classroom-export-workspace {
          grid-template-columns: 1fr;
        }
        .classroom-export-control-card {
          position: static;
        }
      }
      @media (max-width: 980px) {
        .classroom-export-hero,
        .classroom-export-preview-head,
        .classroom-export-control-title {
          align-items: stretch;
          flex-direction: column;
        }
        .classroom-export-actions {
          justify-content: flex-start;
        }
        .classroom-export-controls,
        .classroom-export-report-grid,
        .classroom-export-doc-stats {
          grid-template-columns: 1fr 1fr;
        }
      }
      @media (max-width: 640px) {
        .classroom-export-hero,
        .classroom-export-control-card,
        .classroom-export-sheet {
          border-radius: 22px;
          padding: 18px;
        }
        .classroom-export-controls,
        .classroom-export-report-grid,
        .classroom-export-doc-stats {
          grid-template-columns: 1fr;
        }
        .classroom-export-cover {
          align-items: flex-start;
          flex-direction: column;
        }
        .classroom-export-report-tabs {
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .classroom-export-report-tabs button {
          min-height: 44px;
          font-size: 12px;
          border-radius: 12px;
          white-space: normal;
          line-height: 1.25;
          padding: 8px 10px;
        }
        .classroom-export-month-tabs {
          display: flex;
          flex-wrap: nowrap;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scroll-snap-type: x proximity;
          gap: 6px;
          padding-bottom: 4px;
        }
        .classroom-export-month-tabs button {
          flex: 0 0 auto;
          min-width: 3.25rem;
          min-height: 40px;
          scroll-snap-align: start;
          font-size: 12px;
        }
        .classroom-export-actions-main {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .classroom-export-actions-main button,
        .classroom-export-controls select {
          min-height: 44px;
        }
        .classroom-export-presets {
          grid-template-columns: 1fr;
        }
        .classroom-export-presets button {
          min-height: 44px;
        }
        .classroom-export-load-btn {
          background: #F5EDE3 !important;
          box-shadow: inset 0 0 0 1px rgba(139, 107, 69, 0.22);
        }
      }
      .classroom-export-page--print {
        padding: 0 !important;
        margin: 0 !important;
        min-height: 0 !important;
        background: #fff !important;
      }
      .classroom-export-page--print .classroom-export-workspace {
        display: block !important;
      }
      .classroom-export-page--print .classroom-export-preview-pane,
      .classroom-export-page--print .classroom-export-preview-card {
        width: auto !important;
        max-width: none !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        box-shadow: none !important;
        background: #fff !important;
        min-height: 0 !important;
        overflow: visible !important;
      }
      .classroom-export-page--print .classroom-export-preview-stage {
        transform: none !important;
        width: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
      .classroom-export-page--print .classroom-export-book {
        display: block !important;
        gap: 0 !important;
        transform: none !important;
      }
      .classroom-export-page--print .classroom-export-book .attendance-print-sheet {
        display: flex !important;
        flex-direction: column !important;
        width: ${caPageW} !important;
        height: ${caPageH} !important;
        margin: 0 auto !important;
        padding: var(--ca-pad-top, 16px) var(--ca-pad-x, 18px) var(--ca-pad-bottom, 12px) !important;
        box-shadow: none !important;
        overflow: hidden !important;
        break-after: page;
        page-break-after: always;
      }
      body:has(.classroom-export-page--print) .sidebar,
      body:has(.classroom-export-page--print) .navbar,
      body:has(.classroom-export-page--print) .sidebar-overlay,
      body:has(.classroom-export-page--print) .app-topbar {
        display: none !important;
      }
      body:has(.classroom-export-page--print) .main-content,
      body:has(.classroom-export-page--print) .content-shell,
      body:has(.classroom-export-page--print) .page-stack {
        width: auto !important;
        max-width: none !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      @media print {
        @page {
          size: A4 landscape;
          margin: 0;
        }
        body {
          background: white !important;
        }
        .no-print,
        .sidebar,
        .navbar,
        .app-sidebar,
        .app-topbar {
          display: none !important;
        }
        .main-content,
        .content,
        .page-stack,
        .classroom-export-page,
        .classroom-export-workspace,
        .classroom-export-preview-pane {
          width: 297mm !important;
          min-width: 0 !important;
          max-width: none !important;
          padding: 0 !important;
          margin: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          overflow: visible !important;
          background: #FFFFFF !important;
        }
        .classroom-export-sheet {
          border: none;
          border-radius: 0;
          box-shadow: none;
          padding: 0;
        }
        .classroom-export-preview,
        .classroom-export-preview.is-modal {
          position: static !important;
          display: block !important;
          width: 297mm !important;
          max-width: none !important;
          overflow: visible !important;
          background: #FFFFFF !important;
        }
        .classroom-export-preview-stage {
          transform: none !important;
          width: 297mm !important;
          max-width: none !important;
          margin: 0 !important;
          overflow: visible !important;
          justify-self: start !important;
        }
        .classroom-export-book {
          display: block !important;
          width: 297mm !important;
          max-width: none !important;
          gap: 0 !important;
          overflow: visible !important;
        }
        .attendance-print-sheet {
          width: 297mm !important;
          height: 210mm !important;
          min-height: 0 !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 10mm !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          box-shadow: none !important;
          break-after: page;
          page-break-after: always;
        }
        .attendance-print-sheet:last-child {
          break-after: auto;
          page-break-after: auto;
        }
        .attendance-print-head { margin-bottom: 1.5mm !important; gap: 0.8mm !important; }
        .attendance-print-logo-slot { width: 9mm !important; height: 9mm !important; }
        .attendance-print-table th,
        .attendance-print-table td {
          height: 4.9mm !important;
          padding-top: 0.35mm !important;
          padding-bottom: 0.35mm !important;
          line-height: 1.05 !important;
        }
        .attendance-print-signatures {
          margin-top: 8.5mm !important;
        }
        .classroom-export-table-wrap {
          overflow: visible;
          max-height: none;
          border-radius: 0;
        }
        .classroom-export-section {
          padding: 0;
          border: none;
          border-radius: 0;
          page-break-inside: avoid;
        }
        .classroom-export-month-table,
        .classroom-export-simple-table {
          min-width: 0;
          font-size: 9px;
        }
        .classroom-export-month-table th,
        .classroom-export-month-table td,
        .classroom-export-simple-table th,
        .classroom-export-simple-table td {
          position: static !important;
          padding: 3px 4px;
        }
      }
    `}</style>
  )
}

