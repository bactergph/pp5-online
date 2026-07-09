'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { downloadBlob, revokeBlobUrl } from '@/lib/download-blob'
import { fetchClassroomAdminExportContext, fetchClassroomAdminExportData } from './actions'
import { toDailyDisplay } from '@/lib/daily-attendance'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = { id: string; level: string; room: number; academic_year_id: string }
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

function summaryFor(student: Student, data: ExportData) {
  const out = { 'ม': 0, 'ป': 0, 'ล': 0, 'ข': 0 } as Record<string, number>
  ;(data.schoolDays || []).forEach(day => {
    const value = data.attendance?.[student.id]?.[day]
    if (!value) return
    out[value] = (out[value] || 0) + 1
  })
  return out
}

function attendanceExportDisplay(studentId: string, day: number, data: ExportData) {
  return toDailyDisplay(data.attendance?.[studentId]?.[day] as 'ม' | 'ป' | 'ล' | 'ข' | undefined) || ''
}

export default function ClassroomAdminExportPage() {
  const [isPending] = useTransition()
  const [years, setYears] = useState<Year[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [schoolName, setSchoolName] = useState('')
  const [schoolLogoUrl, setSchoolLogoUrl] = useState('')
  const [yearId, setYearId] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [monthKey, setMonthKey] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)
  const [selectedMonths, setSelectedMonths] = useState<number[]>([])
  const [selectedReports, setSelectedReports] = useState<ReportType[]>([])
  const [dataByMonth, setDataByMonth] = useState<Record<number, ExportData>>({})
  const [error, setError] = useState('')
  const [pdfExporting, setPdfExporting] = useState(false)
  const [pdfDownload, setPdfDownload] = useState<{ url: string; name: string } | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewScale, setPreviewScale] = useState(88)
  const [printMode] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('print') === '1')
  const [embedMode] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1')
  const deepLinkMode = printMode || embedMode
  const printLoadStarted = useRef(false)

  useEffect(() => () => revokeBlobUrl(pdfDownload?.url), [pdfDownload?.url])

  useEffect(() => {
    fetchClassroomAdminExportContext().then(result => {
      setSchoolName(result.school?.name || '')
      setSchoolLogoUrl(result.school?.logo_url || '')
      setYears(result.years as Year[])
      setClassrooms(result.classrooms as Classroom[])

      if (deepLinkMode) {
        const params = new URLSearchParams(window.location.search)
        const monthkeyParam = params.get('monthkey')
        const termParam = params.get('term')
        const yearParam = params.get('year')
        const classroomParam = params.get('classroom')
        const monthsParam = params.get('months')
        const reportsParam = params.get('reports')
        const nextTerm = termParam === '2' ? 2 : 1
        setMonthKey(monthkeyParam || currentMonthKey())
        setTerm(nextTerm)
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
      setMonthKey(nowMonthKey)
      setTerm(nowTerm)
      const active = (result.years as Year[]).find(y => y.is_active) || (result.years as Year[])[0]
      const firstClass = (result.classrooms as Classroom[]).find(c => c.academic_year_id === active?.id) || (result.classrooms as Classroom[])[0]
      setYearId(active?.id || '')
      setClassroomId(firstClass?.id || '')
    })
  }, [deepLinkMode])

  const filteredClassrooms = useMemo(
    () => classrooms.filter(c => !yearId || c.academic_year_id === yearId),
    [classrooms, yearId],
  )

  function handleYearChange(nextYearId: string) {
    setYearId(nextYearId)
    const firstClassroom = classrooms.find(c => c.academic_year_id === nextYearId)
    setClassroomId(firstClassroom?.id || '')
    setDataByMonth({})
    setPreviewOpen(false)
  }

  function toggleReport(type: ReportType) {
    setDataByMonth({})
    setPreviewOpen(false)
    setSelectedReports(prev => (
      prev.includes(type)
        ? prev.length === 1 ? prev : prev.filter(item => item !== type)
        : [...prev, type]
    ))
  }

  function selectReportPreset(preset: 'daily' | 'health' | 'all') {
    setDataByMonth({})
    setPreviewOpen(false)
    if (preset === 'daily') setSelectedReports(['attendance', 'brushing', 'milk', 'lunch', 'cleaning', 'saving'])
    else if (preset === 'health') setSelectedReports(['health', 'inspection'])
    else setSelectedReports(REPORT_TYPES.map(r => r.key))
  }

  async function loadSelectedMonths(): Promise<Record<number, ExportData> | null> {
    if (!yearId || !classroomId || !monthKey || selectedMonths.length === 0 || selectedReports.length === 0) return null
    setError('')
    const results = await Promise.all(selectedMonths.map(async month => {
      const result = await fetchClassroomAdminExportData(classroomId, yearId, setMonthInKey(monthKey, month), term)
      return [month, result] as const
    }))
    const firstError = results.find(([, result]) => result.error)?.[1].error
    if (firstError) {
      setError(firstError)
      return null
    }
    const nextData = Object.fromEntries(results.map(([month, result]) => [month, result as ExportData]))
    setError('')
    setDataByMonth(nextData)
    return nextData
  }

  async function openPrintPreview() {
    const loaded = await loadSelectedMonths()
    if (loaded) setPreviewOpen(true)
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
        const rows = data.students?.map(student => [
          student.student_number,
          studentName(student),
          ...days.map(day => data.schoolDays?.includes(day) ? (data.activities?.[type]?.[student.id]?.[day] || '') : ''),
        ]) || []
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
          [...baseHeaders, ...days.map(String)],
          ...rows,
        ]), `${ACTIVITY_LABELS[type]}-${MONTH_SHORT_LABELS[month]}`.slice(0, 31))
      })
    })

    const firstData = sourceData[loadedMonths[0]]
    XLSX.writeFile(wb, `classroom-admin-${firstData.classroom?.level}-${firstData.classroom?.room}-${loadedMonths.join('-')}.xlsx`)
  }

  async function exportPdf() {
    if (pdfExporting) return
    let sourceData = dataByMonth
    if (Object.keys(dataByMonth).length === 0) {
      const loaded = await loadSelectedMonths()
      if (!loaded) return
      sourceData = loaded
    }

    revokeBlobUrl(pdfDownload?.url)
    setPdfDownload(null)
    setPdfExporting(true)
    setError('')
    try {
      const firstData = sourceData[selectedMonths.find(month => sourceData[month]) || selectedMonths[0]]
      const fileName = `เล่มรายงานธุรการ_${firstData?.classroom?.level || ''}-${firstData?.classroom?.room || ''}_${selectedMonths.join('-')}.pdf`.replace(/[\\/:*?"<>|]/g, '-')

      const params = new URLSearchParams()
      params.set('print', '1')
      if (yearId) params.set('year', yearId)
      if (classroomId) params.set('classroom', classroomId)
      if (monthKey) params.set('monthkey', monthKey)
      params.set('term', String(term))
      params.set('months', selectedMonths.join(','))
      params.set('reports', selectedReports.join(','))

      const res = await fetch('/api/reports/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: window.location.pathname, query: params.toString(), landscape: true }),
      })
      if (!res.ok) {
        let message = 'สร้าง PDF ไม่สำเร็จ'
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {}
        throw new Error(message)
      }
      const blob = await res.blob()
      const { manualUrl } = downloadBlob(blob, fileName)
      setPdfDownload({ url: manualUrl, name: fileName })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ')
    } finally {
      setPdfExporting(false)
    }
  }

  const activeMonths = selectedMonths.filter(month => dataByMonth[month])
  const hasData = activeMonths.length > 0
  const canGenerate = Boolean(yearId && classroomId && selectedMonths.length > 0 && selectedReports.length > 0)

  useEffect(() => {
    if (!deepLinkMode || printLoadStarted.current) return
    if (!yearId || !classroomId || !monthKey || selectedMonths.length === 0 || selectedReports.length === 0) return
    printLoadStarted.current = true
    loadSelectedMonths().then(loaded => { if (loaded) setPreviewOpen(true) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkMode, yearId, classroomId, monthKey, selectedMonths, selectedReports])

  useEffect(() => {
    if (!deepLinkMode || !hasData) return
    if (!printMode && !previewOpen) return
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
      if (printMode) await new Promise(resolve => setTimeout(resolve, 300))
      if (!cancelled) (window as unknown as { __REPORT_READY__?: boolean }).__REPORT_READY__ = true
    }
    void markReady()
    return () => { cancelled = true }
  }, [deepLinkMode, printMode, previewOpen, hasData])
  const reportLabel = (type: ReportType) => type === 'attendance'
    ? 'แบบบันทึกเวลาเรียนรายวัน'
    : type === 'health'
      ? 'น้ำหนัก - ส่วนสูง'
      : type === 'inspection'
        ? 'ตรวจสุขภาพ'
        : ACTIVITY_LABELS[type]

  function renderReportSheet(type: ReportType, data: ExportData, sheetMonthKey: string) {
    const monthly = type === 'attendance' || ['brushing', 'milk', 'lunch', 'cleaning', 'saving'].includes(type)
    const days = Array.from({ length: data.days || 0 }, (_, i) => i + 1)
    const printRows = monthly
      ? [
          ...(data.students || []).map((student, index) => ({ type: 'student' as const, student, number: student.student_number || index + 1 })),
          ...Array.from({ length: Math.max(0, 25 - (data.students?.length || 0)) }, (_, index) => ({ type: 'blank' as const, number: (data.students?.length || 0) + index + 1 })),
        ]
      : []
    const isClosed = (day: number) => !(data.schoolDays || []).includes(day)
    const isHoliday = (day: number) => Boolean(data.holidays?.some(item => item.date === `${sheetMonthKey}-${String(day).padStart(2, '0')}`))
    const isOpenWeekend = (day: number) => Boolean(data.weekendSchoolDays?.some(item => item.date === `${sheetMonthKey}-${String(day).padStart(2, '0')}`))

    return (
      <section className="attendance-print-sheet" key={`${type}-${sheetMonthKey}`}>
        <header className="attendance-print-head">
          <div className="attendance-print-logo-slot">
            {schoolLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={schoolLogoUrl} alt="โลโก้โรงเรียน" />
            ) : (
              <span>ตรา</span>
            )}
          </div>
          <div>
            <h1>{reportLabel(type)}</h1>
            <div className="attendance-print-school">{schoolName || 'ชื่อโรงเรียน'}</div>
            <p>ภาคเรียนที่ {term} · ห้อง {data.classroom?.level}/{data.classroom?.room} · เดือน{monthName(sheetMonthKey)} พ.ศ.{data.academicYear?.year_be}</p>
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
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={3}>เลขที่</th>
                <th rowSpan={3}>ชื่อ-นามสกุล</th>
                <th colSpan={days.length} className="attendance-print-month-title">เดือน{monthName(sheetMonthKey)} พ.ศ.{data.academicYear?.year_be}</th>
                {type === 'attendance' && <th colSpan={4} className="attendance-print-summary-title">สรุปผล</th>}
              </tr>
              <tr>
                {days.map(day => (
                  <th
                    key={day}
                    className={[
                      'attendance-print-day',
                      isClosed(day) ? 'is-weekend' : '',
                      isOpenWeekend(day) ? 'is-open-weekend' : '',
                      isHoliday(day) ? 'is-holiday' : '',
                    ].filter(Boolean).join(' ')}
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
                  <th key={`weekday-${type}-${day}`} className={`attendance-print-weekday ${isClosed(day) ? 'is-weekend' : ''}`}>
                    {dayLabel(sheetMonthKey, day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {printRows.map(row => {
                if (row.type === 'blank') {
                  return (
                    <tr key={`${type}-blank-${row.number}`}>
                      <td>{row.number}</td>
                      <td>&nbsp;</td>
                      {days.map(day => <td key={day} className="attendance-print-empty-cell">&nbsp;</td>)}
                      {type === 'attendance' && (
                        <>
                          <td className="attendance-print-summary-good">&nbsp;</td>
                          <td className="attendance-print-summary-sick">&nbsp;</td>
                          <td className="attendance-print-summary-leave">&nbsp;</td>
                          <td className="attendance-print-summary-absent">&nbsp;</td>
                        </>
                      )}
                    </tr>
                  )
                }

                const summary = type === 'attendance' ? summaryFor(row.student, data) : null
                return (
                  <tr key={`${type}-${row.student.id}`}>
                    <td>{row.number}</td>
                    <td className="attendance-print-student-name"><span className="attendance-print-student-name-text">{studentName(row.student)}</span></td>
                    {days.map(day => {
                      const closed = isClosed(day)
                      const attendanceValue = type === 'attendance' && !closed ? attendanceExportDisplay(row.student.id, day, data) : ''
                      const activityValue = type !== 'attendance' && !closed ? (data.activities?.[type as ActivityType]?.[row.student.id]?.[day] || 0) : 0
                      const displayValue = type === 'attendance'
                        ? attendanceValue
                        : type === 'saving'
                          ? (activityValue ? String(activityValue) : '')
                          : (activityValue ? '✓' : '')
                      return (
                        <td
                          key={day}
                          className={[
                            'attendance-print-status-cell',
                            type === 'attendance' && attendanceValue ? `attendance-print-status-${attendanceValue}` : '',
                            type !== 'attendance' && displayValue ? 'attendance-print-value-done' : '',
                            closed ? 'is-weekend' : '',
                            isHoliday(day) ? 'is-holiday' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          {isHoliday(day) ? '' : displayValue}
                        </td>
                      )
                    })}
                    {summary && (
                      <>
                        <td className="attendance-print-summary-good">{summary['ม']}</td>
                        <td className="attendance-print-summary-sick">{summary['ป']}</td>
                        <td className="attendance-print-summary-leave">{summary['ล']}</td>
                        <td className="attendance-print-summary-absent">{summary['ข']}</td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table className="attendance-print-table attendance-print-standard-table">
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
              {(data.students || []).map((student, index) => {
                const health = data.health?.[student.id]
                const inspection = data.inspection?.[student.id] || {}
                return (
                  <tr key={`${type}-${student.id}`}>
                    <td>{student.student_number || index + 1}</td>
                    <td className="attendance-print-student-name"><span className="attendance-print-student-name-text">{studentName(student)}</span></td>
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
            <div className="attendance-print-sign-line">ลงชื่อ ...........................................</div>
            <strong>( ยังไม่กำหนด )</strong>
            <span>ครูประจำชั้น</span>
          </div>
          <div>
            <div className="attendance-print-sign-line">ลงชื่อ ...........................................</div>
            <strong>( ยังไม่กำหนด )</strong>
            <span>ผู้อำนวยการโรงเรียน{schoolName || 'ยังไม่กำหนด'}</span>
          </div>
        </footer>
      </section>
    )
  }

  return (
    <div className={`page-stack classroom-export-page${embedMode ? ' classroom-export-page--embed' : ''}`}>
      <ExportPageStyles />
      {!embedMode && (
      <div className="classroom-export-page-title no-print">
        <span>รายงาน</span>
        <h1>พิมพ์เล่มเอกสารธุรการชั้นเรียน</h1>
      </div>
      )}

      <div className="classroom-export-workspace">
      {!embedMode && (
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
            <select value={classroomId} onChange={e => { setClassroomId(e.target.value); setDataByMonth({}); setPreviewOpen(false) }}>
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
              setDataByMonth({})
              setPreviewOpen(false)
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
                  setDataByMonth({})
                  setPreviewOpen(false)
                }}
              >
                {MONTH_SHORT_LABELS[month]}
              </button>
            ))}
            <button
              type="button"
              className={selectedMonths.length === TERM_MONTHS[term].length ? 'is-summary is-active' : 'is-summary'}
              onClick={() => { setSelectedMonths(TERM_MONTHS[term]); setDataByMonth({}); setPreviewOpen(false) }}
            >
              สรุป
            </button>
          </div>
          <div className="classroom-export-status">
            {isPending ? 'กำลังโหลดข้อมูล...' : canGenerate ? `พร้อมสร้าง ${selectedMonths.length} เดือน · ${selectedReports.length} หมวด` : 'เลือกเดือนและหมวดรายงานก่อน'}
          </div>
        </div>

        <div className="classroom-export-actions classroom-export-actions-main">
          <button type="button" onClick={openPrintPreview} className="classroom-export-primary-btn" disabled={!canGenerate || isPending}>พิมพ์</button>
          <button type="button" onClick={exportPdf} className="classroom-export-pdf-btn" disabled={!canGenerate || pdfExporting || isPending}>
            {pdfExporting ? 'กำลังสร้าง...' : 'บันทึก PDF'}
          </button>
          <button type="button" onClick={exportExcel} className="classroom-export-secondary-btn" disabled={!canGenerate || isPending}>Excel</button>
        </div>
      </div>
      )}

      {error && <div className="alert alert-error no-print">{error}</div>}
      {pdfDownload && (
        <div className="classroom-export-pdf-ready no-print">
          <strong>PDF พร้อมแล้ว</strong>
          <span>ถ้าไฟล์ไม่ลงอัตโนมัติ ให้กดปุ่มด้านล่าง</span>
          <a href={pdfDownload.url} download={pdfDownload.name} className="classroom-export-pdf-btn">
            ดาวน์โหลด {pdfDownload.name}
          </a>
        </div>
      )}
      {pdfExporting && (
        <div className="classroom-export-pdf-busy no-print" role="status" aria-live="polite">
          <div className="classroom-export-pdf-busy-card">
            <strong>กำลังสร้าง PDF...</strong>
            <p>อาจใช้เวลา 30–60 วินาที กรุณารอสักครู่</p>
          </div>
        </div>
      )}

      <div className="classroom-export-preview-pane">
      {(previewOpen || printMode) && hasData ? (
        <div className="classroom-export-preview">
          {!embedMode && (
          <div className="classroom-export-preview-head no-print">
            <div>
              <span>ตัวอย่างเอกสาร</span>
              <strong>ตัวอย่างเล่มรายงาน ({selectedReports.length} หมวด)</strong>
            </div>
            <div className="classroom-export-preview-actions">
              <label>
                ขนาด
                <select value={previewScale} onChange={e => setPreviewScale(Number(e.target.value))}>
                  {[50, 60, 75, 88, 90, 100, 110, 125].map(value => <option key={value} value={value}>{value}%</option>)}
                </select>
              </label>
              <button type="button" onClick={() => window.print()} className="classroom-export-primary-btn">พิมพ์จริง</button>
              <button type="button" onClick={exportPdf} className="classroom-export-pdf-btn" disabled={pdfExporting}>
                {pdfExporting ? 'กำลังสร้าง...' : 'บันทึก PDF'}
              </button>
              <button type="button" onClick={exportExcel} className="classroom-export-secondary-btn">Excel</button>
              <button type="button" onClick={() => { setPreviewOpen(false); setDataByMonth({}) }} className="classroom-export-close-btn">ล้างตัวอย่าง</button>
            </div>
          </div>
          )}
          <div className="classroom-export-preview-stage" style={{ transform: `scale(${(embedMode ? 72 : previewScale) / 100})` }}>
            <div className="classroom-export-book">
              {activeMonths.flatMap(month => {
                const sheetData = dataByMonth[month]
                const sheetMonthKey = setMonthInKey(monthKey, month)
                return selectedReports.map(report => renderReportSheet(report, sheetData, sheetMonthKey))
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="classroom-export-preview-empty no-print">
          <div>
            <strong>ยังไม่แสดงตัวอย่าง</strong>
            <p>เลือกเดือนและหมวดรายงานทางซ้าย แล้วกดปุ่มพิมพ์เพื่อสร้าง preview</p>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  )
}

function ExportPageStyles() {
  return (
    <style>{`
      .classroom-export-page {
        --export-border: #D7DEE8;
        --export-ink: #0F172A;
        --export-muted: #64748B;
        gap: 14px;
      }
      .classroom-export-page-title {
        display: grid;
        justify-items: center;
        gap: 2px;
        margin-top: -8px;
      }
      .classroom-export-page-title span {
        color: #64748B;
        font-size: 12px;
        font-weight: 800;
      }
      .classroom-export-page-title h1 {
        margin: 0;
        color: #0F172A;
        font-size: clamp(22px, 3vw, 30px);
        font-weight: 900;
      }
      .classroom-export-workspace {
        display: grid;
        grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
      }
      .classroom-export-hero {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: center;
        padding: 26px;
        border: 1px solid rgba(99, 102, 241, 0.16);
        border-radius: 30px;
        background: radial-gradient(circle at top left, rgba(79, 70, 229, 0.18), transparent 34%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFF 52%, #EEF2FF 100%);
        box-shadow: 0 24px 50px rgba(79, 70, 229, 0.12);
      }
      .classroom-export-hero-copy span,
      .classroom-export-preview-head span,
      .classroom-export-cover span {
        display: inline-flex;
        color: #4F46E5;
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
        color: #1D4ED8;
        background: #EFF6FF;
        box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.14);
      }
      .classroom-export-pdf-btn {
        color: #3730A3;
        background: #EEF2FF;
        box-shadow: 0 10px 18px rgba(79, 70, 229, 0.14);
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
        gap: 14px;
        padding: 18px;
        border: 1px solid #E2E8F0;
        border-radius: 18px;
        background: #FFFFFF;
        box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08);
        position: sticky;
        top: 12px;
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
        color: #1D4ED8;
        background: #DBEAFE;
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
        gap: 6px;
        min-height: 38px;
        padding: 8px 12px;
        border: 0;
        border-radius: 999px;
        background: rgba(255,255,255,0.62);
        color: #475569;
        font-size: 12px;
        font-weight: 900;
        white-space: nowrap;
        cursor: pointer;
        box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.22);
      }
      .classroom-export-report-tabs button.is-selected {
        color: #FFFFFF;
        background: linear-gradient(135deg, #1D4ED8, #2563EB);
        box-shadow: 0 10px 18px rgba(37, 99, 235, 0.24);
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
        border-color: #818CF8;
        box-shadow: 0 0 0 4px rgba(129, 140, 248, 0.16);
      }
      .classroom-export-load-btn {
        color: #1D4ED8 !important;
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
        border: 1px solid #C7D2FE;
        border-radius: 10px;
        background: #F8FAFC;
        color: #3730A3;
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
        background: #1D4ED8;
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
        border-color: #4F46E5;
        background: linear-gradient(135deg, #EEF2FF, #FFFFFF);
        box-shadow: 0 12px 24px rgba(79, 70, 229, 0.12);
      }
      .classroom-export-report-grid button.is-selected strong {
        color: #3730A3;
      }
      .classroom-export-pdf-busy {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: grid;
        place-items: center;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(4px);
      }
      .classroom-export-pdf-busy-card {
        min-width: min(92vw, 360px);
        padding: 22px 24px;
        border-radius: 18px;
        background: #FFFFFF;
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.22);
        text-align: center;
      }
      .classroom-export-pdf-busy-card strong {
        display: block;
        color: #0F172A;
        font-size: 18px;
        font-weight: 900;
      }
      .classroom-export-pdf-busy-card p {
        margin: 8px 0 0;
        color: #64748B;
        font-size: 14px;
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
      .classroom-export-preview {
        display: grid;
        gap: 12px;
      }
      .classroom-export-preview-pane {
        min-height: calc(100vh - 150px);
        padding: 16px;
        border: 1px solid #D7DEE8;
        border-radius: 18px;
        background: #E8EEF6;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.65);
        overflow: auto;
      }
      .classroom-export-preview-empty {
        min-height: calc(100vh - 190px);
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
        transform-origin: top center;
        justify-self: start;
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
        justify-items: start;
      }
      .classroom-export-book.is-pdf-export {
        display: block;
        gap: 0;
      }
      .classroom-export-book.is-pdf-export .attendance-print-sheet {
        height: 790px;
        min-height: 0;
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
        width: 1122px;
        min-height: 794px;
        padding: 16px 18px 12px;
        background: #FFFFFF;
        color: #111827;
        box-shadow: 0 18px 45px rgba(15,23,42,0.16);
        font-family: 'Sarabun', sans-serif;
        break-after: page;
        page-break-after: always;
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
      }
      .attendance-print-logo-slot {
        width: 42px;
        height: 42px;
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
        font-size: 16px;
        line-height: 1.05;
        font-weight: 900;
        color: #111827;
      }
      .attendance-print-school {
        margin-top: 2px;
        font-size: 16px;
        font-weight: 900;
        color: #111827;
      }
      .attendance-print-head p {
        margin: 1px 0 0;
        font-size: 11px;
        font-weight: 800;
        color: #334155;
      }
      .attendance-print-table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        font-size: 8px;
        line-height: 1;
      }
      .attendance-print-number-col { width: 42px; }
      .attendance-print-name-col { width: 190px; }
      .attendance-print-summary-col { width: 40px; }
      .attendance-print-table th,
      .attendance-print-table td {
        border: 1px solid #111827;
        padding: 2px;
        height: 19px;
        text-align: center;
        vertical-align: middle;
        color: #111827;
      }
      .attendance-print-table th {
        background: #BFEAF4;
        font-weight: 900;
      }
      .attendance-print-month-title {
        background: #BFEAF4 !important;
        font-size: 10px;
      }
      .attendance-print-summary-title {
        background: #C4B5FD !important;
        font-size: 10px;
      }
      .attendance-print-student-name {
        text-align: left !important;
        padding: 1px 2px 2px 6px !important;
        font-size: 11px !important;
        font-weight: 900;
        line-height: 1.05 !important;
        vertical-align: middle !important;
      }
      .attendance-print-student-name-text {
        display: block;
        line-height: 1.05 !important;
      }
      .classroom-export-book.is-pdf-export .attendance-print-table th,
      .classroom-export-book.is-pdf-export .attendance-print-table td {
        padding-top: 0 !important;
        padding-bottom: 3px !important;
        vertical-align: top !important;
        line-height: 1 !important;
      }
      .classroom-export-book.is-pdf-export .attendance-print-student-name-text {
        transform: translateY(-2px);
        line-height: 1 !important;
      }
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
      .attendance-print-summary-good { background: #DCFCE7 !important; font-weight: 900; }
      .attendance-print-summary-sick { background: #FEF3C7 !important; font-weight: 900; }
      .attendance-print-summary-leave,
      .attendance-print-summary-absent { background: #FEE2E2 !important; font-weight: 900; }
      .attendance-print-standard-table {
        margin-top: 8px;
        font-size: 10px;
      }
      .attendance-print-standard-table th,
      .attendance-print-standard-table td {
        height: 24px;
        padding: 4px 6px;
      }
      .attendance-print-standard-table .attendance-print-student-name {
        font-size: 12px !important;
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
        gap: 120px;
        margin-top: 32px;
      }
      .attendance-print-signatures > div {
        text-align: center;
        font-size: 12px;
        color: #111827;
      }
      .attendance-print-sign-line {
        width: 260px;
        margin: 0 auto 4px;
        line-height: 1.15;
      }
      .attendance-print-signatures strong {
        display: block;
        min-height: 15px;
        font-size: 12px;
        font-weight: 900;
        line-height: 1.15;
      }
      .attendance-print-signatures span {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        line-height: 1.15;
      }
      .classroom-export-sheet {
        position: relative;
        overflow: hidden;
        background: linear-gradient(#FFFFFF, #FFFFFF) padding-box, linear-gradient(135deg, rgba(79, 70, 229, 0.45), rgba(14, 165, 233, 0.25), rgba(15, 23, 42, 0.12)) border-box;
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
        background: linear-gradient(135deg, #4338CA, #0891B2);
        box-shadow: 0 18px 32px rgba(67, 56, 202, 0.24);
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
        background: #EEF2FF;
        color: #312E81;
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
        background: #EEF2FF;
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
        background: #EEF2FF;
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

