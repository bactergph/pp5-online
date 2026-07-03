'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'
import {
  clearActivityDoneColumn,
  clearActivityMonth,
  clearDailyAttendanceMonth,
  clearDailyPresentColumn,
  fetchClassroomAdminContext,
  fetchHealthInspection,
  fillActivityDoneAll,
  fillActivityDoneColumn,
  fillDailyPresentAll,
  fillDailyPresentColumn,
  fetchMonthlyActivity,
  fetchMonthlyAttendance,
  fetchWeightHeight,
  saveHealthInspection,
  saveMonthlyActivity,
  saveMonthlyAttendance,
  saveWeightHeight,
} from '@/app/classroom-admin/actions'
import LoadingButton from '@/components/LoadingButton'
import { CLASSROOM_ADMIN_PRINT_STYLES } from '@/components/classroom-admin/classroom-admin-print-styles'
import {
  directorActingPositionLine,
  directorDisplayName,
  directorSchoolLine,
} from '@/lib/school-director'
import { DAILY_STATUS_LABELS, nextDailyDisplay, toDailyDb, toDailyDisplay } from '@/lib/daily-attendance'
import { useAppAlert } from '@/lib/use-app-alert'
import DocumentSignaturePanel from '@/components/sign/DocumentSignaturePanel'

function attendanceDayAllLabel(busy: boolean, clearing: boolean) {
  if (busy) return clearing ? 'ลบ...' : 'บันทึก...'
  return (
    <>
      <span>{clearing ? 'ไม่มา' : 'มา'}</span>
      <span>ทุกคน</span>
    </>
  )
}

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = {
  id: string
  level: string
  room: number
  academic_year_id: string
  student_count: number
  homeroom_teacher_name?: string
  homeroom_teacher2_name?: string
}
type Student = {
  id: string
  student_number: number
  prefix: string | null
  first_name: string
  last_name: string
  gender: string
  birth_date: string | null
  status: string
}
type Mode = 'attendance' | 'activity' | 'weightHeight' | 'healthInspection'
type AttendanceStatus = 'ม' | 'ป' | 'ล' | 'ข'
type ActivityType = 'saving' | 'milk' | 'cleaning' | 'brushing' | 'lunch'
type InspectionField = 'nails' | 'hair' | 'ears' | 'nose' | 'teeth' | 'skin' | 'clothes'
type Holiday = { date: string; name: string }
type WeekendSchoolDay = { date: string; name: string }

type Props = {
  mode: Mode
  title: string
  description: string
  activityType?: ActivityType
  activityLabel?: string
}

type AttendanceToolbarPendingAction = 'fill' | 'delete' | null
type AttendanceConfirmPhase = 'idle' | 'countdown' | 'armed'

const ATTENDANCE_OPTIONS = [
  { value: 'ม', label: 'มา (/)' },
  { value: 'ป', label: 'ลาป่วย' },
  { value: 'ล', label: 'ลากิจ' },
  { value: 'ข', label: 'ขาด' },
]
const MONTHS = [
  { value: 1, label: 'มกราคม' }, { value: 2, label: 'กุมภาพันธ์' }, { value: 3, label: 'มีนาคม' },
  { value: 4, label: 'เมษายน' }, { value: 5, label: 'พฤษภาคม' }, { value: 6, label: 'มิถุนายน' },
  { value: 7, label: 'กรกฎาคม' }, { value: 8, label: 'สิงหาคม' }, { value: 9, label: 'กันยายน' },
  { value: 10, label: 'ตุลาคม' }, { value: 11, label: 'พฤศจิกายน' }, { value: 12, label: 'ธันวาคม' },
]
const ATTENDANCE_TERMS = [
  { value: 1 as const, label: 'เทอม 1', startMonth: 5, months: [5, 6, 7, 8, 9, 10] },
  { value: 2 as const, label: 'เทอม 2', startMonth: 11, months: [11, 12, 1, 2, 3] },
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
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const INSPECTION_FIELDS: { key: InspectionField; label: string }[] = [
  { key: 'nails', label: 'เล็บ' },
  { key: 'hair', label: 'ผม' },
  { key: 'ears', label: 'หู' },
  { key: 'nose', label: 'จมูก' },
  { key: 'teeth', label: 'ฟัน' },
  { key: 'skin', label: 'ผิวหนัง' },
  { key: 'clothes', label: 'เสื้อผ้า' },
]
const ATTENDANCE_SYNCED_ACTIVITY_TYPES: ActivityType[] = ['brushing', 'milk', 'lunch', 'cleaning']

function today() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthKey() {
  return today().slice(0, 7)
}

function currentMonth() {
  return new Date().getMonth() + 1
}

function studentName(student: Student) {
  return `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim()
}

function currentClassLabel(classrooms: Classroom[], classroomId: string) {
  const classroom = classrooms.find(c => c.id === classroomId)
  return classroom ? `${classroom.level}/${classroom.room}` : 'ยังไม่เลือกห้อง'
}

function thaiMonthTitle(monthKey: string, years: Year[], yearId: string) {
  const [, monthText] = monthKey.split('-')
  const monthName = MONTHS.find(m => m.value === Number(monthText))?.label || ''
  const year = years.find(y => y.id === yearId)?.year_be
  return `${monthName}${year ? ` พ.ศ.${year}` : ''}`
}

function dayDate(monthKey: string, day: number) {
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

function holidayColumnLabel(day: number, name: string) {
  return `วันที่ ${day}: ${name}`
}

function selectedMonthNumber(monthKey: string) {
  return Number(monthKey.split('-')[1])
}

function setMonthInKey(monthKey: string, month: number) {
  const [year] = monthKey.split('-')
  return `${year}-${String(month).padStart(2, '0')}`
}

function weekdayLabel(monthKey: string, day: number) {
  const [year, month] = monthKey.split('-').map(Number)
  return WEEKDAYS[new Date(year, month - 1, day).getDay()]
}

function isWeekend(monthKey: string, day: number) {
  const [year, month] = monthKey.split('-').map(Number)
  const d = new Date(year, month - 1, day).getDay()
  return d === 0 || d === 6
}

function usesAttendanceDefault(mode: Mode, activityType?: ActivityType) {
  return mode === 'activity' && Boolean(activityType && ATTENDANCE_SYNCED_ACTIVITY_TYPES.includes(activityType))
}

function modeKicker(mode: Mode, activityType?: ActivityType) {
  if (mode === 'attendance') return 'ATTENDANCE BOOK'
  if (mode === 'weightHeight') return 'GROWTH RECORD'
  if (mode === 'healthInspection') return 'HEALTH CHECK'
  if (activityType === 'saving') return 'SAVING RECORD'
  return 'DAILY ROUTINE'
}

export default function ClassroomAdminEntry({ mode, title, description, activityType, activityLabel }: Props) {
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [role, setRole] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [currentUserName, setCurrentUserName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolLogoUrl, setSchoolLogoUrl] = useState('')
  const [directorNameField, setDirectorNameField] = useState('')
  const [actingDirector, setActingDirector] = useState('')
  const [actingDirectorPosition, setActingDirectorPosition] = useState('')
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  const [printScale, setPrintScale] = useState(50)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [years, setYears] = useState<Year[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [yearId, setYearId] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [date, setDate] = useState(today())
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [term, setTerm] = useState<1 | 2>(1)
  const [month, setMonth] = useState(currentMonth())
  const [students, setStudents] = useState<Student[]>([])
  const [attendanceValues, setAttendanceValues] = useState<Record<string, AttendanceStatus>>({})
  const [activityValues, setActivityValues] = useState<Record<string, number>>({})
  const [monthlyAttendanceValues, setMonthlyAttendanceValues] = useState<Record<string, Record<number, AttendanceStatus>>>({})
  const [monthlyActivityValues, setMonthlyActivityValues] = useState<Record<string, Record<number, number>>>({})
  const [monthDays, setMonthDays] = useState(31)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [weekendSchoolDays, setWeekendSchoolDays] = useState<WeekendSchoolDay[]>([])
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({})
  const [savingTeacherPercent, setSavingTeacherPercent] = useState(0)
  const [attendanceBulkFilling, setAttendanceBulkFilling] = useState(false)
  const [attendanceClearingAll, setAttendanceClearingAll] = useState(false)
  const [attendanceFillingDays, setAttendanceFillingDays] = useState<Record<number, true>>({})
  const [attendancePendingAction, setAttendancePendingAction] = useState<AttendanceToolbarPendingAction>(null)
  const [attendanceConfirmPhase, setAttendanceConfirmPhase] = useState<AttendanceConfirmPhase>('idle')
  const [attendanceConfirmCountdown, setAttendanceConfirmCountdown] = useState(0)
  const [weightRows, setWeightRows] = useState<Record<string, { weight: string; height: string; bmi?: number | null; bmi_result?: string | null }>>({})
  const [inspectionRows, setInspectionRows] = useState<Record<string, Record<InspectionField, string>>>({})
  const { notify, clearAlert, AlertModal } = useAppAlert()

  const hasMonthlyBulkTools = mode === 'attendance'
    || (mode === 'activity' && Boolean(activityType && ATTENDANCE_SYNCED_ACTIVITY_TYPES.includes(activityType)))
  const monthlyHeaderRowSpan = hasMonthlyBulkTools ? 4 : 3

  const filteredClassrooms = useMemo(
    () => classrooms.filter(c => !yearId || c.academic_year_id === yearId),
    [classrooms, yearId],
  )
  const schoolDirector = useMemo(() => ({
    name: schoolName,
    director_name: directorNameField,
    acting_director: actingDirector,
    acting_director_position: actingDirectorPosition,
  }), [schoolName, directorNameField, actingDirector, actingDirectorPosition])
  const directorSignName = directorDisplayName(schoolDirector, 'ยังไม่กำหนด')
  const directorSignPosition = directorActingPositionLine(schoolDirector)
  const directorSignSchool = directorSchoolLine(schoolDirector, 'ยังไม่กำหนด')

  useEffect(() => {
    fetchClassroomAdminContext().then(data => {
      setRole(data.role)
      setCanEdit(data.canEdit)
      setCurrentUserName(data.currentUserName || '')
      setSchoolName(data.schoolName || '')
      setSchoolLogoUrl(data.schoolLogoUrl || '')
      setDirectorNameField(data.directorName || '')
      setActingDirector(data.actingDirector || '')
      setActingDirectorPosition(data.actingDirectorPosition || '')
      setYears(data.years)
      setClassrooms(data.classrooms)
      const activeYear = data.years.find((y: Year) => y.is_active) || data.years[0]
      const firstClassroom = data.classrooms.find((c: Classroom) => !activeYear || c.academic_year_id === activeYear.id) || data.classrooms[0]
      setYearId(activeYear?.id || '')
      setClassroomId(firstClassroom?.id || '')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!classroomId) return
    loadRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId, date, month, monthKey, term, yearId, mode, activityType])

  useEffect(() => {
    if (!hasMonthlyBulkTools) return
    setAttendancePendingAction(null)
    setAttendanceConfirmPhase('idle')
    setAttendanceConfirmCountdown(0)
    setAttendanceFillingDays({})
  }, [classroomId, monthKey, hasMonthlyBulkTools])

  useEffect(() => {
    if (!hasMonthlyBulkTools) return
    if (attendanceConfirmPhase !== 'countdown' || attendanceConfirmCountdown <= 0) return
    const timer = window.setTimeout(() => {
      if (attendanceConfirmCountdown <= 1) {
        setAttendanceConfirmPhase('armed')
        setAttendanceConfirmCountdown(0)
      } else {
        setAttendanceConfirmCountdown(attendanceConfirmCountdown - 1)
      }
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [hasMonthlyBulkTools, attendanceConfirmPhase, attendanceConfirmCountdown])

  const attendanceToolbarConfirmIdle = attendanceConfirmPhase === 'idle'

  function resetAttendanceToolbarConfirm() {
    setAttendancePendingAction(null)
    setAttendanceConfirmPhase('idle')
    setAttendanceConfirmCountdown(0)
  }

  function loadRecords() {
    clearAlert()
    startTransition(async () => {
      if (mode === 'attendance') {
        const result = await fetchMonthlyAttendance(classroomId, yearId, monthKey)
        if (result.error) { notify('error', result.error); return }
        setStudents(result.students)
        setMonthDays(result.days || 31)
        setHolidays(result.holidays)
        setWeekendSchoolDays(result.weekendSchoolDays || [])
        setMonthlyAttendanceValues(Object.fromEntries(result.students.map(s => [s.id, result.records[s.id] || {}])))
      } else if (mode === 'activity' && activityType) {
        setMonthlyActivityValues({})
        const result = await fetchMonthlyActivity(classroomId, yearId, monthKey, activityType)
        if (result.error) { notify('error', result.error); return }
        setStudents(result.students)
        setMonthDays(result.days || 31)
        setHolidays(result.holidays)
        setWeekendSchoolDays(result.weekendSchoolDays || [])
        setMonthlyActivityValues(Object.fromEntries(result.students.map(s => [s.id, result.records[s.id] || {}])))
      } else if (mode === 'weightHeight') {
        const result = await fetchWeightHeight(classroomId, yearId, month)
        if (result.error) { notify('error', result.error); return }
        setStudents(result.students)
        setWeightRows(Object.fromEntries(result.students.map(s => {
          const r = result.records[s.id]
          return [s.id, {
            weight: r?.weight != null ? String(r.weight) : '',
            height: r?.height != null ? String(r.height) : '',
            bmi: r?.bmi ?? null,
            bmi_result: r?.bmi_result ?? null,
          }]
        })))
      } else if (mode === 'healthInspection') {
        const result = await fetchHealthInspection(classroomId, yearId, term, month)
        if (result.error) { notify('error', result.error); return }
        setStudents(result.students)
        setInspectionRows(Object.fromEntries(result.students.map(s => {
          const r = result.records[s.id]
          return [s.id, Object.fromEntries(INSPECTION_FIELDS.map(f => [f.key, r?.[f.key] || 'ผ่าน'])) as Record<InspectionField, string>]
        })))
      }
    })
  }

  async function handleSave() {
    if (!canEdit) return
    clearAlert()
    startTransition(async () => {
      if (mode === 'attendance') {
        const rows = students.flatMap(student => activeDays.flatMap(day => {
          const status = monthlyAttendanceValues[student.id]?.[day]
          if (!status) return []
          return [{ student_id: student.id, day, status }]
        }))
        const result = await saveMonthlyAttendance(classroomId, monthKey, rows)
        if (result.error) notify('error', result.error)
        else notify('success', `บันทึกแล้ว ${result.count} ช่อง`)
      } else if (mode === 'activity' && activityType) {
        const rows = students.flatMap(student => activeDays.map(day => ({
          student_id: student.id,
          day,
          value: Number(monthlyActivityValues[student.id]?.[day] ?? 0),
        })))
        const result = await saveMonthlyActivity(classroomId, monthKey, term, activityType, rows)
        if (result.error) notify('error', result.error)
        else notify('success', `บันทึก${activityLabel || ''}แล้ว ${result.count} ช่อง`)
      } else if (mode === 'weightHeight') {
        const result = await saveWeightHeight(classroomId, yearId, month, date, students.map(s => ({
          student_id: s.id,
          weight: weightRows[s.id]?.weight ? Number(weightRows[s.id].weight) : null,
          height: weightRows[s.id]?.height ? Number(weightRows[s.id].height) : null,
        })))
        if (result.error) notify('error', result.error)
        else notify('success', `บันทึกน้ำหนัก/ส่วนสูงแล้ว ${result.count} คน`)
        if (!result.error) loadRecords()
      } else if (mode === 'healthInspection') {
        const result = await saveHealthInspection(classroomId, yearId, term, month, date, students.map(s => ({
          student_id: s.id,
          nails: inspectionRows[s.id]?.nails || 'ผ่าน',
          hair: inspectionRows[s.id]?.hair || 'ผ่าน',
          ears: inspectionRows[s.id]?.ears || 'ผ่าน',
          nose: inspectionRows[s.id]?.nose || 'ผ่าน',
          teeth: inspectionRows[s.id]?.teeth || 'ผ่าน',
          skin: inspectionRows[s.id]?.skin || 'ผ่าน',
          clothes: inspectionRows[s.id]?.clothes || 'ผ่าน',
        })))
        if (result.error) notify('error', result.error)
        else notify('success', `บันทึกตรวจสุขภาพแล้ว ${result.count} คน`)
      }
    })
  }

  const days = useMemo(() => Array.from({ length: monthDays }, (_, i) => i + 1), [monthDays])
  const holidayMap = useMemo(() => Object.fromEntries(holidays.map(h => [h.date, h.name])), [holidays])
  const weekendSchoolDayMap = useMemo(() => Object.fromEntries(weekendSchoolDays.map(d => [d.date, d.name])), [weekendSchoolDays])
  const isOpenWeekend = (day: number) => Boolean(weekendSchoolDayMap[dayDate(monthKey, day)])
  const isClosedWeekend = (day: number) => isWeekend(monthKey, day) && !isOpenWeekend(day)
  const isSchoolDay = (day: number) => !holidayMap[dayDate(monthKey, day)] && !isClosedWeekend(day)
  const activeDays = days.filter(day => isSchoolDay(day))
  const isMonthlyMode = mode === 'attendance' || mode === 'activity'
  const isAttendanceDefaultMode = usesAttendanceDefault(mode, activityType)
  const selectedMonth = selectedMonthNumber(monthKey)
  const attendanceTerm = selectedMonth >= 5 && selectedMonth <= 10 ? 1 : 2
  const boardTerm = mode === 'attendance' ? attendanceTerm : term
  const boardMonth = isMonthlyMode ? selectedMonth : month
  const boardMonthTabs = mode === 'weightHeight'
    ? MONTHS.map(item => item.value)
    : ATTENDANCE_TERMS.find(item => item.value === boardTerm)?.months || ATTENDANCE_TERMS[0].months
  const selectedClassroom = classrooms.find(c => c.id === classroomId)
  const homeroomTeacherName = [
    selectedClassroom?.homeroom_teacher_name,
    selectedClassroom?.homeroom_teacher2_name,
  ].filter(Boolean).join(' / ') || (role === 'teacher' ? currentUserName : '')
  const printBlankRowCount = isMonthlyMode ? Math.max(0, 25 - students.length) : 0
  const printRows = isMonthlyMode
    ? [
        ...students.map((student, index) => ({ type: 'student' as const, student, number: student.student_number || index + 1 })),
        ...Array.from({ length: printBlankRowCount }, (_, index) => ({ type: 'blank' as const, number: students.length + index + 1 })),
      ]
    : []
  const interactiveBodyRows = mode === 'attendance'
    ? printRows
    : students.map((student, index) => ({ type: 'student' as const, student, number: student.student_number || index + 1 }))
  const holidayRowSpan = students.length

  function renderMonthlyDayCells(bodyRowIndex: number, student: Student | null) {
    return days.map(day => {
      const dateKey = dayDate(monthKey, day)
      const holiday = holidayMap[dateKey]
      if (holiday) {
        if (bodyRowIndex < holidayRowSpan) {
          if (bodyRowIndex > 0) return null
          return (
            <td
              key={day}
              rowSpan={holidayRowSpan}
              className="classroom-admin-month-td classroom-admin-holiday-td is-holiday"
              title={holidayColumnLabel(day, holiday)}
            >
              <div className="classroom-admin-holiday-stack">
                <span className="classroom-admin-holiday-name">{holiday}</span>
              </div>
            </td>
          )
        }
        return (
          <td key={day} className="classroom-admin-month-td">
            {'\u00a0'}
          </td>
        )
      }
      return (
        <td key={day} className="classroom-admin-month-td">
          {student ? renderMonthCell(student, day) : '\u00a0'}
        </td>
      )
    })
  }

  function renderPrintDayCells(bodyRowIndex: number, row: (typeof printRows)[number] | null) {
    return days.map(day => {
      const dateKey = dayDate(monthKey, day)
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
      const attendanceValue = mode === 'attendance' && schoolDay ? (attendanceDisplayValue(row.student.id, day) || '') : ''
      const activityValue = mode === 'activity' && schoolDay ? (monthlyActivityValues[row.student.id]?.[day] ?? 0) : 0
      const displayValue = mode === 'attendance'
        ? attendanceValue
        : activityType === 'saving'
          ? (activityValue ? String(activityValue) : '')
          : (activityValue ? '✓' : '')
      const attendanceClass = mode === 'attendance' && attendanceValue
        ? (attendanceValue === '/' ? 'attendance-print-status-present' : `attendance-print-status-${attendanceValue}`)
        : ''
      return (
        <td
          key={day}
          className={[
            'attendance-print-status-cell',
            attendanceClass,
            mode === 'activity' && displayValue ? 'attendance-print-value-done' : '',
            closedWeekend ? 'is-weekend' : '',
            openWeekend ? 'is-open-weekend' : '',
          ].filter(Boolean).join(' ')}
        >
          {displayValue}
        </td>
      )
    })
  }
  const termLabel = `ภาคเรียนที่ ${attendanceTerm}`
  const isSavingMode = mode === 'activity' && activityType === 'saving'
  const savingStats = isSavingMode
    ? (() => {
        const rows = students.map(student => {
          const total = activeDays.reduce((sum, day) => sum + Number(monthlyActivityValues[student.id]?.[day] || 0), 0)
          const teacherSupport = Math.round(total * savingTeacherPercent) / 100
          return {
            studentId: student.id,
            total,
            teacherSupport,
            netTotal: total + teacherSupport,
            rank: 0,
          }
        })
        const sorted = [...rows].sort((a, b) => b.total - a.total)
        let lastTotal: number | null = null
        let lastRank = 0
        sorted.forEach((row, index) => {
          if (lastTotal === null || row.total !== lastTotal) {
            lastRank = index + 1
            lastTotal = row.total
          }
          row.rank = row.total > 0 ? lastRank : 0
        })
        const ranked = new Map(sorted.map(row => [row.studentId, row]))
        const roomTotal = rows.reduce((sum, row) => sum + row.total, 0)
        const teacherTotal = rows.reduce((sum, row) => sum + row.teacherSupport, 0)
        return {
          rows: ranked,
          roomTotal,
          teacherTotal,
          netTotal: roomTotal + teacherTotal,
          saverCount: rows.filter(row => row.total > 0).length,
        }
      })()
    : null

  function setMonthlyAttendance(studentId: string, day: number, status: AttendanceStatus) {
    setMonthlyAttendanceValues(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [day]: status },
    }))
  }

  function setMonthlyActivity(studentId: string, day: number, value: number) {
    setMonthlyActivityValues(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [day]: value },
    }))
  }

  function markSaving(cellKey: string, saving: boolean) {
    setSavingCells(prev => {
      const next = { ...prev }
      if (saving) next[cellKey] = true
      else delete next[cellKey]
      return next
    })
  }

  async function autoSaveAttendance(studentId: string, day: number, status: AttendanceStatus) {
    const cellKey = `${studentId}-${day}`
    setMonthlyAttendance(studentId, day, status)
    markSaving(cellKey, true)
    const result = await saveMonthlyAttendance(classroomId, monthKey, [{ student_id: studentId, day, status }])
    markSaving(cellKey, false)
    if (result.error) notify('error', result.error)
  }

  function markDayFilling(day: number, filling: boolean) {
    setAttendanceFillingDays(prev => {
      if (filling) return { ...prev, [day]: true }
      if (!(day in prev)) return prev
      const next = { ...prev }
      delete next[day]
      return next
    })
  }

  function dayHasSavedData(day: number) {
    if (mode === 'attendance') {
      return students.some(student => monthlyAttendanceValues[student.id]?.[day] !== undefined)
    }
    return students.some(student => (monthlyActivityValues[student.id]?.[day] ?? 0) === 1)
  }

  async function toggleMonthlyDayPresent(day: number) {
    if (!canEdit || !classroomId || !hasMonthlyBulkTools || attendanceBulkFilling || attendanceClearingAll || !attendanceToolbarConfirmIdle) return
    if (!isSchoolDay(day)) return
    if (attendanceFillingDays[day]) return
    const cellKeys = students.map(student => `${student.id}-${day}`)
    const clearing = dayHasSavedData(day)
    markDayFilling(day, true)
    setSavingCells(prev => ({
      ...prev,
      ...Object.fromEntries(cellKeys.map(key => [key, true])),
    }))
    clearAlert()
    let saved = false
    try {
      const result = mode === 'attendance'
        ? (clearing
          ? await clearDailyPresentColumn(classroomId, monthKey, day)
          : await fillDailyPresentColumn(classroomId, monthKey, day))
        : (clearing
          ? await clearActivityDoneColumn(classroomId, monthKey, term, activityType!, day)
          : await fillActivityDoneColumn(classroomId, monthKey, term, activityType!, day))
      if (result.error) {
        notify('error', result.error)
        return
      }
      saved = true
      flushSync(() => {
        if (mode === 'attendance') {
          setMonthlyAttendanceValues(prev => {
            const next = { ...prev }
            for (const student of students) {
              if (clearing) {
                if (next[student.id]) {
                  const row = { ...next[student.id] }
                  delete row[day]
                  if (Object.keys(row).length === 0) delete next[student.id]
                  else next[student.id] = row
                }
              } else {
                next[student.id] = { ...(next[student.id] || {}), [day]: 'ม' }
              }
            }
            return next
          })
        } else {
          setMonthlyActivityValues(prev => {
            const next = { ...prev }
            for (const student of students) {
              next[student.id] = { ...(next[student.id] || {}), [day]: clearing ? 0 : 1 }
            }
            return next
          })
        }
        setSavingCells(prev => {
          const next = { ...prev }
          for (const key of cellKeys) delete next[key]
          return next
        })
        markDayFilling(day, false)
      })
    } catch (err) {
      notify('error', err instanceof Error ? err.message : (clearing ? 'ลบข้อมูลไม่สำเร็จ' : 'บันทึกมาทุกคนไม่สำเร็จ'))
    } finally {
      if (!saved) {
        setSavingCells(prev => {
          const next = { ...prev }
          for (const key of cellKeys) delete next[key]
          return next
        })
        markDayFilling(day, false)
      }
    }
  }

  function requestMonthlyFillAll() {
    if (!canEdit || !hasMonthlyBulkTools || attendanceBulkFilling || attendanceClearingAll || !attendanceToolbarConfirmIdle) return
    const ok = window.confirm(
      mode === 'attendance'
        ? 'ยืนยันบันทึกมา (/) ให้ทุกช่องที่ยังว่างในเดือนนี้?'
        : `ยืนยันบันทึก ✓ ให้ทุกช่องที่ยังว่างในเดือนนี้?`,
    )
    if (!ok) return
    setAttendancePendingAction('fill')
    setAttendanceConfirmPhase('countdown')
    setAttendanceConfirmCountdown(3)
  }

  async function executeMonthlyFillAll() {
    if (!canEdit || !classroomId || !hasMonthlyBulkTools || attendanceBulkFilling) return
    if (attendanceConfirmPhase !== 'armed' || attendancePendingAction !== 'fill') return
    setAttendanceBulkFilling(true)
    clearAlert()
    try {
      const result = mode === 'attendance'
        ? await fillDailyPresentAll(classroomId, monthKey)
        : await fillActivityDoneAll(classroomId, monthKey, term, activityType!)
      if (result.error) {
        notify('error', result.error)
        return
      }
      resetAttendanceToolbarConfirm()
      loadRecords()
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'บันทึกทั้งหมดไม่สำเร็จ')
    } finally {
      setAttendanceBulkFilling(false)
    }
  }

  function handleMonthlyFillAllClick() {
    if (attendanceConfirmPhase === 'idle') {
      requestMonthlyFillAll()
      return
    }
    if (attendanceConfirmPhase === 'armed' && attendancePendingAction === 'fill') {
      void executeMonthlyFillAll()
    }
  }

  function monthlyFillAllButtonLabel() {
    if (attendanceBulkFilling && attendancePendingAction === 'fill') return 'กำลังบันทึก...'
    if (attendancePendingAction === 'fill' && attendanceConfirmPhase === 'countdown' && attendanceConfirmCountdown > 0) {
      return `บันทึกในอีก ${attendanceConfirmCountdown}...`
    }
    if (attendancePendingAction === 'fill' && attendanceConfirmPhase === 'armed') return 'กดอีกครั้งเพื่อบันทึก'
    return 'เช็คมาทั้งหมด (ช่องที่ยังว่าง)'
  }

  function requestMonthlyDeleteAll() {
    if (!canEdit || !hasMonthlyBulkTools || attendanceBulkFilling || attendanceClearingAll || !attendanceToolbarConfirmIdle) return
    const ok = window.confirm(
      mode === 'attendance'
        ? 'ยืนยันลบข้อมูลเวลาเรียนทั้งหมดในเดือนนี้?\n\nการลบไม่สามารถย้อนกลับได้'
        : `ยืนยันลบข้อมูล${activityLabel || title}ทั้งหมดในเดือนนี้?\n\nการลบไม่สามารถย้อนกลับได้`,
    )
    if (!ok) return
    setAttendancePendingAction('delete')
    setAttendanceConfirmPhase('countdown')
    setAttendanceConfirmCountdown(3)
  }

  async function executeMonthlyDeleteAll() {
    if (!canEdit || !classroomId || !hasMonthlyBulkTools || attendanceClearingAll) return
    if (attendanceConfirmPhase !== 'armed' || attendancePendingAction !== 'delete') return
    setAttendanceClearingAll(true)
    clearAlert()
    try {
      const result = mode === 'attendance'
        ? await clearDailyAttendanceMonth(classroomId, monthKey)
        : await clearActivityMonth(classroomId, monthKey, term, activityType!)
      if (result.error) {
        notify('error', result.error)
        return
      }
      if (mode === 'attendance') {
        setMonthlyAttendanceValues(Object.fromEntries(students.map(student => [student.id, {}])))
      } else {
        setMonthlyActivityValues(Object.fromEntries(
          students.map(student => [student.id, Object.fromEntries(activeDays.map(day => [day, 0]))]),
        ))
      }
      resetAttendanceToolbarConfirm()
      loadRecords()
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'ลบข้อมูลไม่สำเร็จ')
    } finally {
      setAttendanceClearingAll(false)
    }
  }

  function handleMonthlyDeleteAllClick() {
    if (attendanceConfirmPhase === 'idle') {
      requestMonthlyDeleteAll()
      return
    }
    if (attendanceConfirmPhase === 'armed' && attendancePendingAction === 'delete') {
      void executeMonthlyDeleteAll()
    }
  }

  function monthlyDeleteAllButtonLabel() {
    if (attendanceClearingAll) return 'กำลังลบ...'
    if (attendancePendingAction === 'delete' && attendanceConfirmPhase === 'countdown' && attendanceConfirmCountdown > 0) {
      return `ลบในอีก ${attendanceConfirmCountdown}...`
    }
    if (attendancePendingAction === 'delete' && attendanceConfirmPhase === 'armed') return 'กดอีกครั้งเพื่อลบ'
    return 'ลบทั้งหมด'
  }

  async function autoSaveActivity(studentId: string, day: number, value: number) {
    if (!activityType) return
    const cellKey = `${studentId}-${day}`
    setMonthlyActivity(studentId, day, value)
    markSaving(cellKey, true)
    const result = await saveMonthlyActivity(classroomId, monthKey, term, activityType, [{ student_id: studentId, day, value }])
    markSaving(cellKey, false)
    if (result.error) notify('error', result.error)
  }

  function printAttendanceDocument() {
    const source = document.querySelector('.attendance-print-only .attendance-print-sheet') as HTMLElement | null
    if (!source) {
      window.print()
      return
    }

    const printTitle = `${title} ${currentClassLabel(classrooms, classroomId)} ${thaiMonthTitle(monthKey, years, yearId)}`.trim()
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
  <style>${CLASSROOM_ADMIN_PRINT_STYLES}</style>
  <style>
    body { margin: 0; background: #ffffff; }
    .attendance-print-window { display: grid; place-items: start center; padding: 0; }
  </style>
</head>
<body>
  <main class="attendance-print-window">${source.outerHTML}</main>
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

  function printCurrentPage() {
    printAttendanceDocument()
  }

  function renderPrintableAttendanceDocument({ preview = false }: { preview?: boolean } = {}) {
    const documentTitle = mode === 'attendance' ? 'แบบบันทึกเวลาเรียนรายวัน' : title
    const documentMeta = isMonthlyMode
      ? `${termLabel} · ห้อง ${currentClassLabel(classrooms, classroomId)} · เดือน${thaiMonthTitle(monthKey, years, yearId)}`
      : `ห้อง ${currentClassLabel(classrooms, classroomId)} · เดือน${MONTHS.find(m => m.value === month)?.label || ''}${years.find(y => y.id === yearId)?.year_be ? ` พ.ศ.${years.find(y => y.id === yearId)?.year_be}` : ''}`

    return (
      <section className={`attendance-print-sheet ${preview ? 'is-preview' : ''}`}>
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
            <h1>{documentTitle}</h1>
            <div className="attendance-print-school">{schoolName || 'ชื่อโรงเรียน'}</div>
            <p>{documentMeta}</p>
          </div>
        </header>

        {isMonthlyMode ? (
          <table className="attendance-print-table">
            <colgroup>
              <col className="attendance-print-number-col" />
              <col className="attendance-print-name-col" />
              {days.map(day => <col key={day} />)}
              {mode === 'attendance' && (
                <>
                  <col className="attendance-print-summary-col" />
                  <col className="attendance-print-summary-col" />
                  <col className="attendance-print-summary-col" />
                  <col className="attendance-print-summary-col" />
                </>
              )}
              {isSavingMode && (
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
                <th colSpan={days.length} className="attendance-print-month-title">เดือน{thaiMonthTitle(monthKey, years, yearId)}</th>
                {mode === 'attendance' && <th colSpan={4} className="attendance-print-summary-title">สรุปผล</th>}
                {isSavingMode && <th colSpan={4} className="attendance-print-summary-title">สรุปเงินออม</th>}
              </tr>
              <tr>
                {days.map(day => {
                  const dateKey = dayDate(monthKey, day)
                  const holiday = holidayMap[dateKey]
                  const closedWeekend = isClosedWeekend(day)
                  const openWeekend = isOpenWeekend(day)
                  return (
                    <th
                      key={day}
                      className={[
                        'attendance-print-day',
                        closedWeekend ? 'is-weekend' : '',
                        openWeekend ? 'is-open-weekend' : '',
                        holiday ? 'is-holiday' : '',
                      ].filter(Boolean).join(' ')}
                      title={holiday ? holidayColumnLabel(day, holiday) : undefined}
                    >
                      {day}
                    </th>
                  )
                })}
                {mode === 'attendance' && (
                  <>
                    <th rowSpan={2} className="attendance-print-summary-good">มา</th>
                    <th rowSpan={2} className="attendance-print-summary-sick">ป่วย</th>
                    <th rowSpan={2} className="attendance-print-summary-leave">ลา</th>
                    <th rowSpan={2} className="attendance-print-summary-absent">ขาด</th>
                  </>
                )}
                {isSavingMode && (
                  <>
                    <th rowSpan={2} className="attendance-print-summary-good">รวม</th>
                    <th rowSpan={2} className="attendance-print-summary-sick">ครูช่วย</th>
                    <th rowSpan={2} className="attendance-print-summary-good">สุทธิ</th>
                    <th rowSpan={2} className="attendance-print-summary-title">อันดับ</th>
                  </>
                )}
              </tr>
              <tr>
                {days.map(day => {
                  const dateKey = dayDate(monthKey, day)
                  const holiday = holidayMap[dateKey]
                  const closedWeekend = isClosedWeekend(day)
                  const openWeekend = isOpenWeekend(day)
                  return (
                    <th
                      key={`weekday-${day}`}
                      className={[
                        'attendance-print-weekday',
                        closedWeekend ? 'is-weekend' : '',
                        openWeekend ? 'is-open-weekend' : '',
                        holiday ? 'is-holiday' : '',
                      ].filter(Boolean).join(' ')}
                      title={holiday ? holidayColumnLabel(day, holiday) : undefined}
                    >
                      {weekdayLabel(monthKey, day)}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {printRows.map((row, bodyRowIndex) => {
                if (row.type === 'blank') {
                  return (
                    <tr key={`print-blank-${row.number}`}>
                      <td>{row.number}</td>
                      <td>&nbsp;</td>
                      {renderPrintDayCells(bodyRowIndex, row)}
                      {mode === 'attendance' && (
                        <>
                          <td className="attendance-print-summary-good">&nbsp;</td>
                          <td className="attendance-print-summary-sick">&nbsp;</td>
                          <td className="attendance-print-summary-leave">&nbsp;</td>
                          <td className="attendance-print-summary-absent">&nbsp;</td>
                        </>
                      )}
                      {isSavingMode && (
                        <>
                          <td className="attendance-print-summary-good">&nbsp;</td>
                          <td className="attendance-print-summary-sick">&nbsp;</td>
                          <td className="attendance-print-summary-good">&nbsp;</td>
                          <td className="attendance-print-summary-title">&nbsp;</td>
                        </>
                      )}
                    </tr>
                  )
                }

                const summary = mode === 'attendance' ? attendanceSummary(row.student) : null
                const savingRow = savingStats?.rows.get(row.student.id)
                return (
                  <tr key={row.student.id}>
                    <td>{row.number}</td>
                    <td className="attendance-print-student-name">
                      <span className="attendance-print-student-name-text">{studentName(row.student)}</span>
                    </td>
                    {renderPrintDayCells(bodyRowIndex, row)}
                    {summary && (
                      <>
                        <td className="attendance-print-summary-good">{summary['ม']}</td>
                        <td className="attendance-print-summary-sick">{summary['ป']}</td>
                        <td className="attendance-print-summary-leave">{summary['ล']}</td>
                        <td className="attendance-print-summary-absent">{summary['ข']}</td>
                      </>
                    )}
                    {isSavingMode && (
                      <>
                        <td className="attendance-print-summary-good">{savingRow?.total ? savingRow.total.toLocaleString('th-TH') : ''}</td>
                        <td className="attendance-print-summary-sick">{savingRow?.teacherSupport ? savingRow.teacherSupport.toLocaleString('th-TH') : ''}</td>
                        <td className="attendance-print-summary-good">{savingRow?.netTotal ? savingRow.netTotal.toLocaleString('th-TH') : ''}</td>
                        <td className="attendance-print-summary-title">{savingRow?.rank ? savingRow.rank : ''}</td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table className="attendance-print-table attendance-print-standard-table">
            <colgroup>
              <col className="attendance-print-number-col" />
              <col className="attendance-print-name-col" />
              {mode === 'weightHeight' ? (
                <>
                  <col />
                  <col />
                  <col />
                </>
              ) : INSPECTION_FIELDS.map(field => <col key={field.key} />)}
            </colgroup>
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>ชื่อ-นามสกุล</th>
                {mode === 'weightHeight' ? (
                  <>
                    <th>น้ำหนัก (กก.)</th>
                    <th>ส่วนสูง (ซม.)</th>
                    <th>BMI</th>
                  </>
                ) : INSPECTION_FIELDS.map(field => <th key={field.key}>{field.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {students.map((student, index) => {
                const weightRow = weightRows[student.id] || { weight: '', height: '' }
                const inspectionRow = inspectionRows[student.id] || {}
                return (
                  <tr key={student.id}>
                    <td>{student.student_number || index + 1}</td>
                    <td className="attendance-print-student-name">
                      <span className="attendance-print-student-name-text">{studentName(student)}</span>
                    </td>
                    {mode === 'weightHeight' ? (
                      <>
                        <td>{weightRow.weight || ''}</td>
                        <td>{weightRow.height || ''}</td>
                        <td>{weightRow.bmi ? `${weightRow.bmi} · ${weightRow.bmi_result || '-'}` : ''}</td>
                      </>
                    ) : INSPECTION_FIELDS.map(field => {
                      const value = inspectionRow[field.key] || 'ผ่าน'
                      return (
                        <td key={field.key} className={value === 'ผ่าน' ? 'attendance-print-value-done' : 'attendance-print-value-alert'}>
                          {value}
                        </td>
                      )
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
            <strong>( {homeroomTeacherName || 'ยังไม่กำหนด'} )</strong>
            <span>ครูประจำชั้น</span>
          </div>
          <div>
            <div className="attendance-print-sign-line">ลงชื่อ ...........................................</div>
            <strong>( {directorSignName} )</strong>
            {directorSignPosition && <span>{directorSignPosition}</span>}
            <span>{directorSignSchool}</span>
          </div>
        </footer>
      </section>
    )
  }

  async function exportAttendanceExcel() {
    const XLSX = await import('xlsx')
    const documentTitle = mode === 'attendance' ? 'แบบบันทึกเวลาเรียนรายวัน' : title
    const headerRows: (string | number)[][] = [
      [documentTitle],
      [schoolName || 'ชื่อโรงเรียน', isMonthlyMode ? termLabel : '', currentClassLabel(classrooms, classroomId), isMonthlyMode ? `เดือน${thaiMonthTitle(monthKey, years, yearId)}` : `เดือน${MONTHS.find(m => m.value === month)?.label || ''}`],
      [],
    ]
    const bodyRows: (string | number)[][] = isMonthlyMode
      ? [
          [
            'เลขที่',
            'ชื่อ-นามสกุล',
            ...days.map(day => String(day)),
            ...(mode === 'attendance' ? ['มา', 'ป่วย', 'ลา', 'ขาด'] : []),
            ...(isSavingMode ? ['รวม', 'ครูช่วย', 'สุทธิ', 'อันดับ'] : []),
          ],
          [
            '',
            '',
            ...days.map(day => weekdayLabel(monthKey, day)),
            ...(mode === 'attendance' ? ['', '', '', ''] : []),
            ...(isSavingMode ? ['', '', '', ''] : []),
          ],
          ...printRows.map(row => {
            if (row.type === 'blank') {
              return [
                row.number,
                '',
                ...days.map(() => ''),
                ...(mode === 'attendance' ? ['', '', '', ''] : []),
                ...(isSavingMode ? ['', '', '', ''] : []),
              ]
            }
            const summary = mode === 'attendance' ? attendanceSummary(row.student) : null
            const savingRow = savingStats?.rows.get(row.student.id)
            return [
              row.number,
              studentName(row.student),
              ...days.map(day => {
                const holiday = holidayMap[dayDate(monthKey, day)]
                const schoolDay = isSchoolDay(day)
                if (holiday || !schoolDay) return ''
                if (mode === 'attendance') return attendanceDisplayValue(row.student.id, day) || ''
                const value = monthlyActivityValues[row.student.id]?.[day] ?? 0
                return activityType === 'saving' ? (value || '') : (value ? '✓' : '')
              }),
              ...(summary ? [summary['ม'], summary['ป'], summary['ล'], summary['ข']] : []),
              ...(isSavingMode ? [
                savingRow?.total || '',
                savingRow?.teacherSupport || '',
                savingRow?.netTotal || '',
                savingRow?.rank || '',
              ] : []),
            ]
          }),
        ]
      : mode === 'weightHeight'
        ? [
            ['เลขที่', 'ชื่อ-นามสกุล', 'น้ำหนัก (กก.)', 'ส่วนสูง (ซม.)', 'BMI'],
            ...students.map((student, index) => {
              const row = weightRows[student.id] || { weight: '', height: '' }
              return [student.student_number || index + 1, studentName(student), row.weight || '', row.height || '', row.bmi ? `${row.bmi} · ${row.bmi_result || '-'}` : '']
            }),
          ]
        : [
            ['เลขที่', 'ชื่อ-นามสกุล', ...INSPECTION_FIELDS.map(field => field.label)],
            ...students.map((student, index) => {
              const row = inspectionRows[student.id] || {}
              return [student.student_number || index + 1, studentName(student), ...INSPECTION_FIELDS.map(field => row[field.key] || 'ผ่าน')]
            }),
          ]
    const signatureRows = [
      [],
      ['ลงชื่อ', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'ลงชื่อ'],
      [homeroomTeacherName || '........................................', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', directorSignName],
      ['ครูประจำชั้น', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', directorSignPosition || directorSignSchool],
      ...(directorSignPosition ? [['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', directorSignSchool]] : []),
    ]
    const worksheet = XLSX.utils.aoa_to_sheet([...headerRows, ...bodyRows, ...signatureRows])
    worksheet['!cols'] = [
      { wch: 8 },
      { wch: 28 },
      ...(isMonthlyMode ? days.map(() => ({ wch: activityType === 'saving' ? 6 : 4 })) : []),
      ...(mode === 'attendance' ? [{ wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }] : []),
      ...(isSavingMode ? [{ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }] : []),
      ...(mode === 'weightHeight' ? [{ wch: 14 }, { wch: 14 }, { wch: 22 }] : []),
      ...(mode === 'healthInspection' ? INSPECTION_FIELDS.map(() => ({ wch: 12 })) : []),
    ]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, documentTitle.slice(0, 31))
    const fileName = `${documentTitle}_${currentClassLabel(classrooms, classroomId)}_${isMonthlyMode ? thaiMonthTitle(monthKey, years, yearId) : MONTHS.find(m => m.value === month)?.label || ''}.xlsx`.replace(/[\\/:*?"<>|]/g, '-')
    XLSX.writeFile(workbook, fileName)
  }

  async function exportAttendancePdf() {
    if (pdfExporting) return
    const source = document.querySelector('.attendance-print-only .attendance-print-sheet') as HTMLElement | null
    if (!source) {
      notify('error', 'ไม่พบเอกสารสำหรับสร้าง PDF')
      return
    }

    setPdfExporting(true)
    const host = document.createElement('div')
    host.style.position = 'fixed'
    host.style.left = '-10000px'
    host.style.top = '0'
    host.style.width = '1122px'
    host.style.background = '#ffffff'
    host.style.zIndex = '-1'

    const clone = source.cloneNode(true) as HTMLElement
    clone.classList.add('is-pdf-export')
    clone.style.width = '1122px'
    clone.style.height = '790px'
    clone.style.minHeight = '0'
    clone.style.overflow = 'hidden'
    clone.style.boxShadow = 'none'
    clone.style.transform = 'none'
    host.appendChild(clone)
    document.body.appendChild(host)

    try {
      const html2pdf = (await import('html2pdf.js')).default
      const documentTitle = mode === 'attendance' ? 'แบบบันทึกเวลาเรียนรายวัน' : title
      const fileName = `${documentTitle}_${currentClassLabel(classrooms, classroomId)}_${isMonthlyMode ? thaiMonthTitle(monthKey, years, yearId) : MONTHS.find(m => m.value === month)?.label || ''}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
      await html2pdf()
        .set({
          filename: fileName,
          margin: 0,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2.4,
            useCORS: true,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            windowWidth: 1122,
            windowHeight: 790,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(clone)
        .save()
    } catch (error) {
      console.error(error)
      notify('error', 'สร้าง PDF ไม่สำเร็จ')
    } finally {
      host.remove()
      setPdfExporting(false)
    }
  }

  function attendanceSummary(student: Student) {
    return activeDays.reduce((acc, day) => {
      const value = monthlyAttendanceValues[student.id]?.[day]
      if (!value) return acc
      acc[value] += 1
      return acc
    }, { 'ม': 0, 'ป': 0, 'ล': 0, 'ข': 0 } as Record<AttendanceStatus, number>)
  }

  function attendanceDisplayValue(studentId: string, day: number) {
    return toDailyDisplay(monthlyAttendanceValues[studentId]?.[day])
  }

  function attendanceCellClass(studentId: string, day: number) {
    const saved = monthlyAttendanceValues[studentId]?.[day]
    const display = toDailyDisplay(saved)
    if (display === '/') return 'is-present'
    if (saved) return `attendance-${saved}`
    return 'is-empty'
  }

  function renderMonthCell(student: Student, day: number) {
    const dateKey = dayDate(monthKey, day)
    const holiday = holidayMap[dateKey]
    const closedWeekend = isClosedWeekend(day)
    const openWeekend = isOpenWeekend(day)
    const schoolDay = isSchoolDay(day)
    const disabled = !canEdit || !schoolDay || (hasMonthlyBulkTools && !attendanceToolbarConfirmIdle)
    const cellKey = `${student.id}-${day}`
    const cellClass = [
      'classroom-admin-month-cell',
      closedWeekend ? 'is-weekend' : '',
      openWeekend ? 'is-open-weekend' : '',
      holiday ? 'is-holiday' : '',
      savingCells[cellKey] ? 'is-saving' : '',
    ].filter(Boolean).join(' ')

    if (mode === 'attendance') {
      const saved = schoolDay ? monthlyAttendanceValues[student.id]?.[day] : undefined
      const display = toDailyDisplay(saved)
      return (
        <button
          type="button"
          className={`${cellClass} ${attendanceCellClass(student.id, day)}`}
          disabled={disabled}
          title={holiday || (display ? DAILY_STATUS_LABELS[display] : 'คลิกเพื่อบันทึก')}
          onClick={() => {
            if (!schoolDay) return
            const next = toDailyDb(nextDailyDisplay(display))
            void autoSaveAttendance(student.id, day, next)
          }}
        >
          {display || ''}
        </button>
      )
    }

    const value = monthlyActivityValues[student.id]?.[day] ?? 0
    if (activityType === 'saving') {
      return (
        <input
          className={`${cellClass} classroom-admin-month-input`}
          type="number"
          min={0}
          step="1"
          disabled={disabled}
          value={schoolDay && value ? value : ''}
          title={holiday || 'จำนวนเงินออม'}
          onChange={e => setMonthlyActivity(student.id, day, Number(e.target.value || 0))}
          onBlur={e => autoSaveActivity(student.id, day, Number(e.target.value || 0))}
        />
      )
    }
    return (
      <button
        type="button"
        className={`${cellClass} ${value ? 'is-done' : ''}`}
        disabled={disabled}
        title={holiday || (value ? 'ทำแล้ว' : 'ยังไม่ทำ')}
      onClick={() => autoSaveActivity(student.id, day, value ? 0 : 1)}
      >
      {schoolDay && value ? '✓' : ''}
      </button>
    )
  }

  function renderAttendanceCell(student: Student) {
    return (
      <select className="form-input classroom-admin-compact-input" value={attendanceValues[student.id] || 'ม'} disabled={!canEdit}
        onChange={e => setAttendanceValues(v => ({ ...v, [student.id]: e.target.value as AttendanceStatus }))}>
        {ATTENDANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

  function renderActivityCell(student: Student) {
    if (activityType === 'saving') {
      return (
        <input
          className="form-input classroom-admin-compact-input"
          type="number"
          min={0}
          step="0.25"
          value={activityValues[student.id] ?? 0}
          disabled={!canEdit}
          onChange={e => setActivityValues(v => ({ ...v, [student.id]: Number(e.target.value) }))}
        />
      )
    }
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => setActivityValues(v => ({ ...v, [student.id]: v[student.id] ? 0 : 1 }))}
        className={activityValues[student.id] ? 'btn btn-primary classroom-admin-toggle' : 'btn btn-secondary classroom-admin-toggle'}
      >
        {activityValues[student.id] ? 'ทำแล้ว' : 'ไม่ทำ'}
      </button>
    )
  }

  function renderInput(student: Student) {
    if (mode === 'attendance') {
      return renderAttendanceCell(student)
    }
    if (mode === 'activity') {
      return renderActivityCell(student)
    }
    if (mode === 'weightHeight') {
      const row = weightRows[student.id] || { weight: '', height: '' }
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px', gap: 8, alignItems: 'center' }}>
          <input className="form-input" type="number" step="0.01" placeholder="กก." disabled={!canEdit} value={row.weight}
            onChange={e => setWeightRows(v => ({ ...v, [student.id]: { ...row, weight: e.target.value } }))} />
          <input className="form-input" type="number" step="0.01" placeholder="ซม." disabled={!canEdit} value={row.height}
            onChange={e => setWeightRows(v => ({ ...v, [student.id]: { ...row, height: e.target.value } }))} />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.bmi ? `${row.bmi} · ${row.bmi_result || ''}` : '-'}</span>
        </div>
      )
    }
    const row = inspectionRows[student.id] || {}
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(70px, 1fr))', gap: 6 }}>
        {INSPECTION_FIELDS.map(field => (
          <select key={field.key} className="form-input" disabled={!canEdit}
            value={row[field.key] || 'ผ่าน'}
            title={field.label}
            onChange={e => setInspectionRows(v => ({ ...v, [student.id]: { ...(v[student.id] || {}), [field.key]: e.target.value } as Record<InspectionField, string> }))}>
            <option value="ผ่าน">{field.label}: ผ่าน</option>
            <option value="ไม่ผ่าน">{field.label}: ไม่ผ่าน</option>
          </select>
        ))}
      </div>
    )
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>กำลังโหลด...</div>

  return (
    <div className="page-stack classroom-admin-page">
      <AlertModal />
      <style>{CLASSROOM_ADMIN_PRINT_STYLES}</style>
      <div className="attendance-print-only">
        {renderPrintableAttendanceDocument()}
      </div>

      {printPreviewOpen && (
        <div className="print-preview-backdrop">
          <div className="print-preview-shell">
            <div className="print-preview-toolbar">
              <div>
                <strong>ตัวอย่างก่อนพิมพ์</strong>
                <span>A4 แนวนอน · ปรับขนาดก่อนพิมพ์/บันทึก PDF ได้</span>
              </div>
              <div className="print-preview-actions">
                <label>
                  ขนาด
                  <select value={printScale} onChange={e => setPrintScale(Number(e.target.value))}>
                    {[50, 60, 75, 90, 100, 110, 125].map(value => (
                      <option key={value} value={value}>{value}%</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn btn-secondary" onClick={exportAttendanceExcel}>Excel</button>
                <button type="button" className="btn btn-secondary" onClick={exportAttendancePdf} disabled={pdfExporting}>
                  {pdfExporting ? 'กำลังสร้าง...' : 'บันทึก PDF'}
                </button>
                <button type="button" className="btn btn-primary" onClick={printCurrentPage}>พิมพ์</button>
                <button type="button" className="btn btn-secondary" onClick={() => setPrintPreviewOpen(false)}>ปิด</button>
              </div>
            </div>
            <div className="print-preview-stage">
              <div className="print-preview-scale" style={{ transform: `scale(${printScale / 100})` }}>
                {renderPrintableAttendanceDocument({ preview: true })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="classroom-admin-top-card classroom-admin-attendance-board">
        <div className="classroom-admin-attendance-board-row" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <div className="classroom-admin-segment-group" aria-label="เลือกภาคเรียนหรือปีการศึกษา">
            {mode === 'weightHeight' ? (
              years.map(y => (
                <button
                  key={y.id}
                  type="button"
                  className={`classroom-admin-segment ${yearId === y.id ? 'is-active' : ''}`}
                  style={{ flex: '0 0 auto', minWidth: 86, width: 'auto' }}
                  onClick={() => { setYearId(y.id); setClassroomId('') }}
                >
                  {y.year_be}{y.is_active ? ' ปัจจุบัน' : ''}
                </button>
              ))
            ) : (
              ATTENDANCE_TERMS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  className={`classroom-admin-segment ${boardTerm === item.value ? 'is-active' : ''}`}
                  style={{ flex: '0 0 auto', minWidth: 76, width: 'auto' }}
                  onClick={() => {
                    setTerm(item.value)
                    if (isMonthlyMode) setMonthKey(setMonthInKey(monthKey, item.startMonth))
                    else setMonth(item.startMonth)
                  }}
                >
                  {item.label}
                </button>
              ))
            )}
            <span className="classroom-admin-segment is-muted" style={{ flex: '0 0 auto', minWidth: 76, width: 'auto' }}>
              {isMonthlyMode ? 'รายเดือน' : 'รายครั้ง'}
            </span>
          </div>

          <div className="classroom-admin-attendance-controls" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
            <select className="form-input classroom-admin-class-select" style={{ width: 150, minWidth: 150 }} value={classroomId} onChange={e => setClassroomId(e.target.value)}>
              <option value="">เลือกห้องเรียน</option>
              {filteredClassrooms.map(c => <option key={c.id} value={c.id}>{c.level}/{c.room} · {c.student_count} คน</option>)}
            </select>
            {(mode === 'weightHeight' || mode === 'healthInspection') && (
              <input className="form-input classroom-admin-class-select" style={{ width: 150, minWidth: 150 }} type="date" value={date} onChange={e => setDate(e.target.value)} />
            )}
            <LoadingButton
              className="btn btn-primary classroom-admin-board-button"
              style={{ width: 'auto', minWidth: 92, flex: '0 0 auto' }}
              loading={isPending}
              disabled={!canEdit || !classroomId}
              onClick={handleSave}
            >
              บันทึก
            </LoadingButton>
            <button type="button" className="btn classroom-admin-print-green classroom-admin-board-button" style={{ width: 'auto', minWidth: 112, flex: '0 0 auto' }} onClick={() => setPrintPreviewOpen(true)} disabled={!classroomId || students.length === 0}>
              พิมพ์หน้านี้
            </button>
          </div>
        </div>

        <div className="classroom-admin-month-tabs" aria-label="เลือกเดือน">
          {boardMonthTabs.map(monthValue => (
            <button
              key={monthValue}
              type="button"
              className={`classroom-admin-month-tab ${boardMonth === monthValue ? 'is-active' : ''}`}
              onClick={() => {
                if (isMonthlyMode) setMonthKey(setMonthInKey(monthKey, monthValue))
                else setMonth(monthValue)
              }}
            >
              {MONTH_SHORT_LABELS[monthValue]}
            </button>
          ))}
          {isMonthlyMode && <button type="button" className="classroom-admin-month-tab is-summary">สรุป</button>}
        </div>

        <div className="classroom-admin-attendance-meta">
          <span className="badge badge-gray">{modeKicker(mode, activityType)}</span>
          <span className="badge badge-success">{title}</span>
          <span className="badge badge-gray">{description}</span>
          {!canEdit && <span className="badge badge-gray">ดูอย่างเดียว</span>}
          {isAttendanceDefaultMode && <span className="badge badge-warning">อ้างอิงจากการมาเรียน แต่แก้รายช่องได้</span>}
        </div>

        <DocumentSignaturePanel
          variant="classroom_admin"
          classroomId={classroomId}
          reportTerm={boardTerm}
          disabled={!classroomId}
          compact
        />
      </div>

      {isSavingMode && savingStats && (
        <div className="control-card saving-summary-grid">
          <div>
            <label className="form-label">ครูออมช่วย</label>
            <select
              className="form-input"
              value={savingTeacherPercent}
              onChange={e => setSavingTeacherPercent(Number(e.target.value))}
              disabled={!classroomId || students.length === 0}
            >
              {[0, 5, 10, 15, 20, 25, 30, 50, 100].map(percent => (
                <option key={percent} value={percent}>{percent}% ของยอดที่นักเรียนออม</option>
              ))}
            </select>
          </div>
          <div className="saving-summary-card">
            <span>นักเรียนที่ออม</span>
            <strong>{savingStats.saverCount}/{students.length} คน</strong>
          </div>
          <div className="saving-summary-card">
            <span>นักเรียนออมรวม</span>
            <strong>{savingStats.roomTotal.toLocaleString('th-TH')} บาท</strong>
          </div>
          <div className="saving-summary-card">
            <span>ครูต้องออก</span>
            <strong>{savingStats.teacherTotal.toLocaleString('th-TH')} บาท</strong>
          </div>
          <div className="saving-summary-card is-strong">
            <span>รวมสุทธิทั้งห้อง</span>
            <strong>{savingStats.netTotal.toLocaleString('th-TH')} บาท</strong>
          </div>
        </div>
      )}

      <div className="classroom-admin-print-header">
        <div>
          <div className="classroom-admin-print-kicker">ระบบ ปพ.5 ออนไลน์</div>
          <h1>{mode === 'attendance' ? 'แบบบันทึกเวลาเรียนรายวัน' : title}</h1>
          <p>
            ห้อง {currentClassLabel(classrooms, classroomId)}
            {isMonthlyMode ? ` · เดือน${thaiMonthTitle(monthKey, years, yearId)}` : ''}
            {students.length > 0 ? ` · นักเรียน ${students.length} คน` : ''}
          </p>
        </div>
        <div className="classroom-admin-print-meta">
          {mode === 'attendance' ? 'มา / ป่วย / ลา / ขาด' : activityLabel || title}
        </div>
      </div>

      <div className="data-card class-subjects-table-card classroom-admin-table-card">
        {!classroomId ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>เลือกห้องเรียนเพื่อเริ่มบันทึก</div>
        ) : students.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>ยังไม่มีนักเรียนในห้องนี้</div>
        ) : mode === 'weightHeight' ? (
          <table className="thai-table class-subjects-table classroom-admin-table">
            <colgroup>
              <col style={{ width: 54 }} />
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>#</th>
                <th>นักเรียน</th>
                <th>น้ำหนัก (กก.)</th>
                <th>ส่วนสูง (ซม.)</th>
                <th>BMI</th>
              </tr>
            </thead>
            <tbody>
              {students.map(student => {
                const row = weightRows[student.id] || { weight: '', height: '' }
                return (
                  <tr key={student.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{student.student_number}</td>
                    <td className="classroom-admin-student-cell">{studentName(student)}</td>
                    <td>
                      <input className="form-input classroom-admin-compact-input" type="number" step="0.01" placeholder="0.00" disabled={!canEdit} value={row.weight}
                        onChange={e => setWeightRows(v => ({ ...v, [student.id]: { ...row, weight: e.target.value } }))} />
                    </td>
                    <td>
                      <input className="form-input classroom-admin-compact-input" type="number" step="0.01" placeholder="0.00" disabled={!canEdit} value={row.height}
                        onChange={e => setWeightRows(v => ({ ...v, [student.id]: { ...row, height: e.target.value } }))} />
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{row.bmi ? `${row.bmi} · ${row.bmi_result || '-'}` : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : mode === 'healthInspection' ? (
          <table className="thai-table class-subjects-table classroom-admin-table classroom-admin-health-table">
            <colgroup>
              <col style={{ width: 54 }} />
              <col style={{ width: 220 }} />
              {INSPECTION_FIELDS.map(field => <col key={field.key} style={{ width: 118 }} />)}
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>#</th>
                <th>นักเรียน</th>
                {INSPECTION_FIELDS.map(field => <th key={field.key}>{field.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {students.map(student => {
                const row = inspectionRows[student.id] || {}
                return (
                  <tr key={student.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{student.student_number}</td>
                    <td className="classroom-admin-student-cell">{studentName(student)}</td>
                    {INSPECTION_FIELDS.map(field => (
                      <td key={field.key}>
                        <select className="form-input classroom-admin-compact-input" disabled={!canEdit}
                          value={row[field.key] || 'ผ่าน'}
                          onChange={e => setInspectionRows(v => ({ ...v, [student.id]: { ...(v[student.id] || {}), [field.key]: e.target.value } as Record<InspectionField, string> }))}>
                          <option value="ผ่าน">ผ่าน</option>
                          <option value="ไม่ผ่าน">ไม่ผ่าน</option>
                        </select>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : mode === 'attendance' || mode === 'activity' ? (
          <>
          {hasMonthlyBulkTools && (
            <div className="classroom-admin-attendance-toolbar">
              <span className="classroom-admin-attendance-toolbar-note">
                {mode === 'attendance'
                  ? 'ช่องว่าง = ยังไม่บันทึก · คลิกเพื่อวน / → ข → ล → ป'
                  : 'ช่องว่าง = ยังไม่ทำ · คลิกเพื่อสลับ ✓'}
              </span>
              {canEdit ? (
              <div className="classroom-admin-attendance-toolbar-actions">
                <button
                  type="button"
                  className={`btn btn-secondary classroom-admin-fill-all-btn ${attendancePendingAction === 'fill' && attendanceConfirmPhase === 'armed' ? 'is-armed' : ''}`}
                  disabled={
                    attendanceBulkFilling || attendanceClearingAll || isPending
                    || (attendanceConfirmPhase !== 'idle' && attendancePendingAction !== 'fill')
                    || (attendancePendingAction === 'fill' && attendanceConfirmPhase === 'countdown')
                  }
                  onClick={handleMonthlyFillAllClick}
                >
                  {monthlyFillAllButtonLabel()}
                </button>
                <button
                  type="button"
                  className={`btn classroom-admin-delete-all-btn ${attendancePendingAction === 'delete' && attendanceConfirmPhase === 'armed' ? 'is-armed' : ''}`}
                  disabled={
                    attendanceBulkFilling || attendanceClearingAll || isPending
                    || (attendanceConfirmPhase !== 'idle' && attendancePendingAction !== 'delete')
                    || (attendancePendingAction === 'delete' && attendanceConfirmPhase === 'countdown')
                  }
                  onClick={handleMonthlyDeleteAllClick}
                >
                  {monthlyDeleteAllButtonLabel()}
                </button>
              </div>
              ) : null}
            </div>
          )}
          <div className="classroom-admin-month-table-wrap">
          <table className="thai-table classroom-admin-month-table">
            <colgroup>
              <col style={{ width: 58 }} />
              <col style={{ width: 248 }} />
              {days.map(day => <col key={day} style={{ width: activityType === 'saving' ? 50 : 38 }} />)}
              {isSavingMode && (
                <>
                  <col style={{ width: 92 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 74 }} />
                </>
              )}
              {mode === 'attendance' && (
                <>
                  <col style={{ width: 46 }} />
                  <col style={{ width: 46 }} />
                  <col style={{ width: 46 }} />
                  <col style={{ width: 46 }} />
                </>
              )}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={monthlyHeaderRowSpan} style={{ textAlign: 'center' }}>เลขที่</th>
                <th rowSpan={monthlyHeaderRowSpan}>ชื่อ-นามสกุล</th>
                <th colSpan={days.length} className="classroom-admin-month-title">
                  เดือน{thaiMonthTitle(monthKey, years, yearId)}
                </th>
                {mode === 'attendance' && (
                  <th colSpan={4} className="classroom-admin-month-title classroom-admin-summary-head">
                    สรุป
                  </th>
                )}
                {isSavingMode && (
                  <th colSpan={4} className="classroom-admin-month-title classroom-admin-summary-head">
                    สรุปเงินออม
                  </th>
                )}
              </tr>
              <tr>
                {days.map(day => {
                  const dateKey = dayDate(monthKey, day)
                  const holiday = holidayMap[dateKey]
                  const closedWeekend = isClosedWeekend(day)
                  const openWeekend = isOpenWeekend(day)
                  return (
                    <th
                      key={day}
                      className={[
                        'classroom-admin-day-head',
                        closedWeekend ? 'is-weekend' : '',
                        openWeekend ? 'is-open-weekend' : '',
                        holiday ? 'is-holiday' : '',
                      ].filter(Boolean).join(' ')}
                      title={holiday ? holidayColumnLabel(day, holiday) : undefined}
                    >
                      {day}
                    </th>
                  )
                })}
                {mode === 'attendance' && (
                  <>
                    <th rowSpan={3} className="classroom-admin-summary-head">มา</th>
                    <th rowSpan={3} className="classroom-admin-summary-head">ป่วย</th>
                    <th rowSpan={3} className="classroom-admin-summary-head">ลา</th>
                    <th rowSpan={3} className="classroom-admin-summary-head">ขาด</th>
                  </>
                )}
                {isSavingMode && (
                  <>
                    <th rowSpan={2} className="classroom-admin-summary-head">รวม</th>
                    <th rowSpan={2} className="classroom-admin-summary-head">ครูช่วย</th>
                    <th rowSpan={2} className="classroom-admin-summary-head">สุทธิ</th>
                    <th rowSpan={2} className="classroom-admin-summary-head">อันดับ</th>
                  </>
                )}
              </tr>
              <tr>
                {days.map(day => {
                  const dateKey = dayDate(monthKey, day)
                  const holiday = holidayMap[dateKey]
                  const closedWeekend = isClosedWeekend(day)
                  const openWeekend = isOpenWeekend(day)
                  return (
                    <th
                      key={`weekday-${day}`}
                      className={[
                        'classroom-admin-weekday-head',
                        closedWeekend ? 'is-weekend' : '',
                        openWeekend ? 'is-open-weekend' : '',
                        holiday ? 'is-holiday' : '',
                      ].filter(Boolean).join(' ')}
                      title={holiday ? holidayColumnLabel(day, holiday) : undefined}
                    >
                      {weekdayLabel(monthKey, day)}
                    </th>
                  )
                })}
              </tr>
              {hasMonthlyBulkTools && (
                <tr>
                  {days.map(day => {
                    const dateKey = dayDate(monthKey, day)
                    const holiday = holidayMap[dateKey]
                    const closedWeekend = isClosedWeekend(day)
                    const openWeekend = isOpenWeekend(day)
                    const schoolDay = isSchoolDay(day)
                    const dayBusy = Boolean(attendanceFillingDays[day])
                    const dayClearing = dayHasSavedData(day)
                    return (
                      <th
                        key={`all-${day}`}
                        className={[
                          'classroom-admin-day-all-head',
                          closedWeekend ? 'is-weekend' : '',
                          openWeekend ? 'is-open-weekend' : '',
                          holiday ? 'is-holiday' : '',
                        ].filter(Boolean).join(' ')}
                        title={holiday ? holidayColumnLabel(day, holiday) : undefined}
                      >
                        {canEdit && schoolDay ? (
                          <button
                            type="button"
                            className={`classroom-admin-day-all-btn ${dayClearing ? 'is-clear' : ''}`}
                            disabled={
                              dayBusy
                              || attendanceBulkFilling
                              || attendanceClearingAll
                              || !attendanceToolbarConfirmIdle
                            }
                            onClick={() => void toggleMonthlyDayPresent(day)}
                          >
                            {attendanceDayAllLabel(dayBusy, dayClearing)}
                          </button>
                        ) : null}
                      </th>
                    )
                  })}
                </tr>
              )}
            </thead>
            <tbody>
              {hasMonthlyBulkTools && isPending ? (
                <tr>
                  <td
                    colSpan={2 + days.length + (mode === 'attendance' ? 4 : 0) + (isSavingMode ? 4 : 0)}
                    style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}
                  >
                    กำลังโหลดตาราง...
                  </td>
                </tr>
              ) : interactiveBodyRows.map((row, bodyRowIndex) => {
                if (row.type === 'blank') {
                  return (
                    <tr key={`blank-print-${row.number}`} className="classroom-admin-print-row">
                      <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{row.number}</td>
                      <td className="classroom-admin-student-cell">&nbsp;</td>
                      {renderMonthlyDayCells(bodyRowIndex, null)}
                      <td className="classroom-admin-summary-cell">&nbsp;</td>
                      <td className="classroom-admin-summary-cell">&nbsp;</td>
                      <td className="classroom-admin-summary-cell">&nbsp;</td>
                      <td className="classroom-admin-summary-cell">&nbsp;</td>
                    </tr>
                  )
                }

                const summary = mode === 'attendance' ? attendanceSummary(row.student) : null
                const savingRow = savingStats?.rows.get(row.student.id)
                return (
                  <tr key={row.student.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{row.student.student_number}</td>
                    <td className="classroom-admin-student-cell">{studentName(row.student)}</td>
                    {renderMonthlyDayCells(bodyRowIndex, row.student)}
                    {summary && (
                      <>
                        <td className="classroom-admin-summary-cell">{summary['ม']}</td>
                        <td className="classroom-admin-summary-cell">{summary['ป']}</td>
                        <td className="classroom-admin-summary-cell">{summary['ล']}</td>
                        <td className="classroom-admin-summary-cell">{summary['ข']}</td>
                      </>
                    )}
                    {isSavingMode && (
                      <>
                        <td className="classroom-admin-summary-cell saving-money-cell">{savingRow?.total ? savingRow.total.toLocaleString('th-TH') : ''}</td>
                        <td className="classroom-admin-summary-cell saving-money-cell">{savingRow?.teacherSupport ? savingRow.teacherSupport.toLocaleString('th-TH') : ''}</td>
                        <td className="classroom-admin-summary-cell saving-money-cell is-net">{savingRow?.netTotal ? savingRow.netTotal.toLocaleString('th-TH') : ''}</td>
                        <td className="classroom-admin-summary-cell saving-rank-cell">{savingRow?.rank ? `#${savingRow.rank}` : '-'}</td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          </>
        ) : (
          <table className="thai-table class-subjects-table classroom-admin-table">
            <colgroup>
              <col style={{ width: 54 }} />
              <col />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>#</th>
                <th>นักเรียน</th>
                <th>{activityLabel || title}</th>
              </tr>
            </thead>
            <tbody>
              {students.map(student => (
                <tr key={student.id}>
                  <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{student.student_number}</td>
                  <td className="classroom-admin-student-cell">{studentName(student)}</td>
                  <td>{renderInput(student)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mode === 'attendance' && (
        <div className="classroom-admin-print-signatures">
          <div className="classroom-admin-signature-box">
            <div className="classroom-admin-signature-line">ลงชื่อ ...........................................</div>
            <div className="classroom-admin-signature-name">( {homeroomTeacherName || 'ยังไม่กำหนด'} )</div>
            <div className="classroom-admin-signature-role">ครูประจำชั้น</div>
          </div>
          <div className="classroom-admin-signature-box">
            <div className="classroom-admin-signature-line">ลงชื่อ ...........................................</div>
            <div className="classroom-admin-signature-name">( {directorSignName} )</div>
            {directorSignPosition && <div className="classroom-admin-signature-role">{directorSignPosition}</div>}
            <div className="classroom-admin-signature-role">{directorSignSchool}</div>
          </div>
        </div>
      )}

      {students.length > 0 && (
        <div className="classroom-admin-page-legend">
          {mode === 'attendance' && (
            <>
              <span className="legend-pill legend-green">ม มาเรียน</span>
              <span className="legend-pill legend-amber">ป ป่วย</span>
              <span className="legend-pill legend-blue">ล ลา</span>
              <span className="legend-pill legend-red">ข ขาด</span>
              <span className="legend-pill legend-gray">เทา = เสาร์/อาทิตย์</span>
              <span className="legend-pill legend-sky">ฟ้า = เปิดสอนพิเศษ</span>
            </>
          )}
          {mode === 'activity' && activityType !== 'saving' && (
            <>
              <span className="legend-pill legend-green">✓ ทำแล้ว</span>
              <span className="legend-pill legend-red">ว่าง = ยังไม่ทำ</span>
              {isAttendanceDefaultMode && <span className="legend-pill legend-amber">อ้างอิงจากมาเรียน แต่แก้รายช่องได้</span>}
              <span className="legend-pill legend-gray">วันหยุดจะไม่รับบันทึก</span>
            </>
          )}
          {mode === 'activity' && activityType === 'saving' && (
            <>
              <span className="legend-pill legend-green">กรอกจำนวนเงินในช่องวันที่</span>
              <span className="legend-pill legend-amber">ออกจากช่องแล้วบันทึกอัตโนมัติ</span>
            </>
          )}
          {mode === 'weightHeight' && (
            <>
              <span className="legend-pill legend-green">BMI คำนวณหลังบันทึก</span>
              <span className="legend-pill legend-blue">ใช้ปุ่มพิมพ์หน้านี้เพื่อพิมพ์รายเดือน</span>
            </>
          )}
          {mode === 'healthInspection' && (
            <>
              <span className="legend-pill legend-green">ผ่าน</span>
              <span className="legend-pill legend-red">ไม่ผ่าน</span>
              <span className="legend-pill legend-blue">พิมพ์รายเดือนพร้อมรายการตรวจ</span>
            </>
          )}
        </div>
      )}

      {students.length > 0 && (
        <div className="teacher-assignment-actions classroom-admin-table-actions">
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {isMonthlyMode
              ? canEdit ? 'กดในช่องแล้วระบบบันทึกให้อัตโนมัติ' : 'บัญชีนี้ดูข้อมูลได้อย่างเดียว'
              : canEdit ? `พร้อมบันทึก ${students.length} คนในตารางนี้` : 'บัญชีนี้ดูข้อมูลได้อย่างเดียว'}
          </div>
          {!isMonthlyMode && (
            <LoadingButton loading={isPending} disabled={!canEdit} onClick={handleSave}>
              บันทึก
            </LoadingButton>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => setPrintPreviewOpen(true)}>
            พิมพ์หน้านี้
          </button>
        </div>
      )}
    </div>
  )
}
