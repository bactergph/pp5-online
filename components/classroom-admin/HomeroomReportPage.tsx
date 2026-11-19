'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  fetchClassroomAdminContext,
  fetchHomeroomActivityNotes,
  fetchMonthlyAttendance,
} from '@/app/classroom-admin/actions'
import { setAcademicMonth } from '@/lib/academic-month'
import { dailyAttendanceToday } from '@/lib/daily-attendance'
import {
  groupHomeroomWeeks,
  homeroomClassTitle,
  homeroomCountText,
  homeroomDayAttendance,
  thaiHomeroomDate,
} from '@/lib/homeroom-activity'
import { buildHomeroomActivityPdf } from '@/lib/jspdf-homeroom-activity'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { classLevelRank } from '@/lib/teacher-order'
import './homeroom-activity.css'

const MONTHS = [
  { value: 1, label: 'มกราคม' }, { value: 2, label: 'กุมภาพันธ์' }, { value: 3, label: 'มีนาคม' },
  { value: 4, label: 'เมษายน' }, { value: 5, label: 'พฤษภาคม' }, { value: 6, label: 'มิถุนายน' },
  { value: 7, label: 'กรกฎาคม' }, { value: 8, label: 'สิงหาคม' }, { value: 9, label: 'กันยายน' },
  { value: 10, label: 'ตุลาคม' }, { value: 11, label: 'พฤศจิกายน' }, { value: 12, label: 'ธันวาคม' },
]
const TERMS = [
  { value: 1 as const, label: 'เทอม 1', startMonth: 5, months: [5, 6, 7, 8, 9, 10] },
  { value: 2 as const, label: 'เทอม 2', startMonth: 11, months: [11, 12, 1, 2, 3] },
]

type Year = { id: string; year_be: number; is_active: boolean }
type Room = {
  id: string
  level: string
  room: number
  academic_year_id: string
  student_count: number
  homeroom_teacher_name?: string
  homeroom_teacher2_name?: string
}
type ReportRow = { date: string; topics: string[]; counts: { total: number; present: number; leave: number; absent: number; sick: number } }

function currentMonthKey() {
  return dailyAttendanceToday().slice(0, 7)
}

function termForMonth(month: number) {
  return TERMS.find(item => item.months.includes(month)) || (month >= 5 && month <= 10 ? TERMS[0] : TERMS[1])
}

function initialMonths() {
  const month = Number(currentMonthKey().slice(5))
  const term = termForMonth(month)
  return [term.months.includes(month) ? month : term.startMonth]
}

function teachingDates(monthKey: string, dayCount: number, openWeekends: { date: string }[]) {
  const open = new Set(openWeekends.map(item => item.date))
  const [year, month] = monthKey.split('-').map(Number)
  const dates: string[] = []
  for (let day = 1; day <= dayCount; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`
    const weekday = new Date(year, month - 1, day).getDay()
    if ((weekday === 0 || weekday === 6) && !open.has(date)) continue
    dates.push(date)
  }
  return dates
}

export default function HomeroomReportPage() {
  const [schoolName, setSchoolName] = useState('')
  const [schoolLogoUrl, setSchoolLogoUrl] = useState('')
  const [years, setYears] = useState<Year[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [yearId, setYearId] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [anchorKey] = useState(currentMonthKey)
  const [selectedMonths, setSelectedMonths] = useState<number[]>(initialMonths)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchClassroomAdminContext().then(data => {
      if (cancelled) return
      const nextYears = (data.years || []) as Year[]
      const nextRooms = ((data.classrooms || []) as Room[]).slice().sort((a, b) => classLevelRank(a.level) - classLevelRank(b.level) || a.room - b.room)
      const active = nextYears.find(year => year.is_active) || nextYears[0]
      setSchoolName(data.schoolName || '')
      setSchoolLogoUrl(data.schoolLogoUrl || '')
      setYears(nextYears)
      setRooms(nextRooms)
      setYearId(active?.id || '')
      setLoading(false)
    }).catch(() => {
      if (!cancelled) {
        setError('โหลดห้องเรียนไม่สำเร็จ')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  const yearRooms = useMemo(
    () => rooms.filter(room => room.academic_year_id === yearId),
    [rooms, yearId],
  )
  const classroom = yearRooms.find(room => room.id === classroomId) || null
  const activeTerm = TERMS.find(item => selectedMonths.every(month => item.months.includes(month))) || termForMonth(selectedMonths[0] || 11)
  const term = activeTerm.value
  const termMonths = activeTerm.months
  const monthKeys = useMemo(
    () => termMonths.filter(month => selectedMonths.includes(month)).map(month => setAcademicMonth(anchorKey, month)),
    [termMonths, selectedMonths, anchorKey],
  )

  useEffect(() => {
    if (!yearId || yearRooms.some(room => room.id === classroomId)) return
    setClassroomId(yearRooms[0]?.id || '')
  }, [yearId, yearRooms, classroomId])

  useEffect(() => {
    if (!classroomId || !yearId) {
      setRows([])
      return
    }
    if (!monthKeys.length) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all(monthKeys.map(async monthKey => {
      const [attendance, notes] = await Promise.all([
        fetchMonthlyAttendance(classroomId, yearId, monthKey),
        fetchHomeroomActivityNotes(classroomId, monthKey),
      ])
      if (attendance.error || notes.error) throw new Error(attendance.error || notes.error || 'โหลดรายงานไม่สำเร็จ')
      const noteMap = Object.fromEntries((notes.notes || []).map(note => [note.activity_date, note.topics || []]))
      const asOf = dailyAttendanceToday()
      const openWeekends = 'weekendSchoolDays' in attendance && Array.isArray(attendance.weekendSchoolDays) ? attendance.weekendSchoolDays : []
      const records = attendance.records as Record<string, Record<number, string | null | undefined>>
      return teachingDates(monthKey, attendance.days, openWeekends).map(date => {
        const day = Number(date.slice(8, 10))
        return {
          date,
          topics: noteMap[date] || [],
          counts: homeroomDayAttendance((attendance.students || []).map(student => records[student.id]?.[day]), date, asOf),
        }
      })
    })).then(groups => {
      if (cancelled) return
      setRows(groups.flat().sort((a, b) => a.date.localeCompare(b.date)))
      setLoading(false)
    }).catch(cause => {
      if (!cancelled) {
        setRows([])
        setError(cause instanceof Error ? cause.message : 'โหลดรายงานไม่สำเร็จ')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [classroomId, yearId, monthKeys])

  const weeks = groupHomeroomWeeks(rows.map(row => row.date))
  const recorded = rows.filter(row => row.topics.length).length
  const yearBe = years.find(year => year.id === yearId)?.year_be || 0

  function createReport() {
    if (!classroom || !rows.length) return
    enqueueFileExport({
      fileName: `แบบบันทึกกิจกรรม-Homeroom-${classroom.level}-${classroom.room}.pdf`,
      label: `รายงานโฮมรูม ${classroom.level}/${classroom.room}`,
      run: () => buildHomeroomActivityPdf({
        schoolName,
        schoolLogoUrl,
        level: classroom.level,
        room: classroom.room,
        yearBe,
        term,
        advisors: [classroom.homeroom_teacher_name || '', classroom.homeroom_teacher2_name || ''],
        days: rows,
      }),
    })
  }

  return (
    <div className="page-stack homeroom-report-page">
      <header className="homeroom-report-intro">
        <p>โฮมรูม</p>
        <h1>รายงานโฮมรูม</h1>
        <small>แบบบันทึกกิจกรรม Homeroom ใช้เรื่องที่บันทึกจากปุ่มแต่ละวันในเช็กชื่อโฮมรูม และจำนวนมา ลา ขาด ป่วยของห้อง</small>
      </header>
      <div className="homeroom-report-filters">
        <div className="homeroom-report-terms" aria-label="ปีการศึกษา">
          {years.map(year => (
            <button key={year.id} type="button" className={year.id === yearId ? 'is-active' : ''} onClick={() => setYearId(year.id)}>
              {year.year_be}{year.is_active ? ' ปัจจุบัน' : ''}
            </button>
          ))}
        </div>
        <select className="form-input" value={classroomId} onChange={event => setClassroomId(event.target.value)}>
          <option value="">เลือกห้องเรียน</option>
          {yearRooms.map(room => <option key={room.id} value={room.id}>{room.level}/{room.room} · {room.student_count} คน</option>)}
        </select>
      </div>
      <div className="homeroom-report-filters">
        <div className="homeroom-report-terms" aria-label="ภาคเรียน">
          {TERMS.map(item => (
            <button key={item.value} type="button" className={term === item.value ? 'is-active' : ''} onClick={() => setSelectedMonths([item.startMonth])}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="homeroom-report-months" aria-label="เดือน">
          {termMonths.map(value => {
            const selected = selectedMonths.includes(value)
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                className={selected ? 'is-active' : ''}
                onClick={() => setSelectedMonths(current => {
                  if (!current.includes(value)) return [...current, value]
                  return current.length === 1 ? current : current.filter(month => month !== value)
                })}
              >
                {MONTHS.find(item => item.value === value)?.label}
              </button>
            )
          })}
          <button
            type="button"
            className={`homeroom-report-all${selectedMonths.length === termMonths.length ? ' is-active' : ''}`}
            onClick={() => setSelectedMonths(termMonths)}
          >
            เลือกทั้งหมด (ทั้งเทอม)
          </button>
        </div>
      </div>
      {error && <p className="homeroom-report-error" role="alert">{error}</p>}
      <div className="homeroom-report-actions">
        <p>
          {classroom ? `${homeroomClassTitle(classroom.level, classroom.room)} · ${monthKeys.length} เดือน · บันทึกเรื่องแล้ว ${recorded}/${rows.length} วัน` : 'เลือกห้องเรียนเพื่อดูรายงาน'}
          {loading ? ' · กำลังโหลด' : ''}
        </p>
        <button type="button" className="btn classroom-admin-print-green" disabled={!classroom || loading || rows.length === 0} onClick={createReport}>
          สร้างรายงาน
        </button>
      </div>
      {weeks.map(dates => (
        <section key={dates[0]} className="homeroom-week">
          <h2>สัปดาห์ของ{thaiHomeroomDate(dates[0])}</h2>
          <table>
            <tbody>
              {dates.map(date => {
                const row = rows.find(item => item.date === date)
                return (
                  <tr key={date}>
                    <th>{thaiHomeroomDate(date)}</th>
                    <td>
                      {row?.topics.length ? row.topics.join(' · ') : 'ยังไม่ได้บันทึกเรื่อง'}
                      {row && <small>ทั้งหมด {row.counts.total} · มา {row.counts.present} · ลา {homeroomCountText(row.counts.leave)} · ขาด {homeroomCountText(row.counts.absent)} · ป่วย {homeroomCountText(row.counts.sick)}</small>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
