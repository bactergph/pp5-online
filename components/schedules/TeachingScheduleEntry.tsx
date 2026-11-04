'use client'
import {teacherPeriodTimes,hasTeacherTimeline} from '@/lib/schedule-period-profiles'
import {teacherActivitiesInClock,teacherActivityMinutes} from '@/lib/schedule-teacher-activities'
import { useScheduleOperations } from './ScheduleServices'
import { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import Link from './ScheduleLink'
import { scheduleSemesterForYear, type PeriodTimeRow } from '@/lib/schedule-helpers'
import AppAlertModal from '@/components/AppAlertModal'
import ScheduleGridTable from '@/components/schedules/ScheduleGridTable'
import TeacherAvailabilityPanel from './TeacherAvailabilityPanel'

type Year = { id: string; year_be: number; is_active: boolean; term1_start_date?: string | null; term1_end_date?: string | null; term2_start_date?: string | null; term2_end_date?: string | null }
type Teacher = { id: string; prefix: string; full_name: string }
type Cell = { label: string; subject_line: string; room_line: string }

const STYLES = `
  .schedule-page { display: grid; gap: 14px; }
  .schedule-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .schedule-head h1 { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .schedule-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: #64748B; }
  .schedule-filters {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; align-items: end;
    padding: 14px; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .schedule-field { display: grid; gap: 5px; }
  .schedule-field label { font-size: 11px; font-weight: 900; color: #475569; }
  .schedule-field select {
    min-height: 36px; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0 10px;
    background: #fff; color: #0F172A; font-size: 13px; font-weight: 800;
  }
  .schedule-info {
    padding: 12px 14px; border-radius: 12px; border: 1px solid #e9eef7; background: #edf4ff;
    color: #465b78; font-size: 12.5px; font-weight: 700; line-height: 1.5;
  }
  .schedule-info a { color: #235bc8; font-weight: 800; }
  .schedule-grid-card {
    overflow: auto; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
  }
  .cell-view {
    display: grid; gap: 2px; place-items: center; min-height: 40px; padding: 4px;
    font-size: 11px; font-weight: 700; text-align: center;
  }
  .cell-room { font-weight: 800; color: #1E293B; }
  .cell-subj { font-size: 10px; font-weight: 700; color: #64748B; }
  .teacher-time-agenda{display:none}.teacher-time-agenda section{padding:14px;border-bottom:1px solid #e0e8f4}.teacher-time-agenda h3{font-size:15px;margin:0 0 10px;color:#244d82}.teacher-time-agenda article{display:grid;grid-template-columns:90px minmax(0,1fr);gap:12px;padding:12px 0;border-top:1px solid #eef2f7}.teacher-time-agenda time{font-size:12px;color:#54708c}.teacher-time-agenda strong{display:block;font-size:14px}.teacher-time-agenda small{display:block;color:#60768e;margin-top:4px}
  @media(max-width:640px){.teacher-time-agenda{display:block}.schedule-profile-teacher-grid{display:none}}
  .schedule-empty { padding: 28px; text-align: center; color: #64748B; font-size: 13px; font-weight: 700; }
`

export default function TeachingScheduleEntry() {
  const { fetchScheduleDays, fetchPeriodTimes, fetchScheduleInit, fetchTeachingScheduleGrid } = useScheduleOperations()

  const [scheduleDays,setScheduleDays]=useState<number[]>([1,2,3,4,5])
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<Year[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [periodTimes, setPeriodTimes] = useState<PeriodTimeRow[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [semester, setSemester] = useState(() => scheduleSemesterForYear(null))
  const requestId = useRef(0)
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [role, setRole] = useState('')
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)

  const teacherLabel = useMemo(() => {
    const t = teachers.find(item => item.id === selectedTeacher)
    return t ? `${t.prefix} ${t.full_name}` : ''
  }, [teachers, selectedTeacher])

  const selectedYearObj = years.find(y => y.id === selectedYear)

  const init = useCallback(async () => {
    try {
      const [data, periodData] = await Promise.all([
        fetchScheduleInit(),
        fetchPeriodTimes(),
      ])
      setCanEdit(data.canEdit)
      setRole(data.role)
      setYears(data.years as Year[])
      setTeachers(data.teachers as Teacher[])
      setPeriodTimes(periodData.times as PeriodTimeRow[])
      const active = (data.years as Year[]).find(y => y.is_active) || (data.years as Year[])[0]
      if (active) { setSelectedYear(active.id); setSemester(scheduleSemesterForYear(active)) }
      if (data.defaultTeacherId) setSelectedTeacher(data.defaultTeacherId)
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setLoading(false)
    }
  },[fetchScheduleInit,fetchPeriodTimes])

  const loadGrid = useCallback(async () => {
    const request = ++requestId.current
    try {
    const [grid,times,days] = await Promise.all([fetchTeachingScheduleGrid(selectedTeacher, selectedYear, semester),fetchPeriodTimes(selectedYear,semester),fetchScheduleDays(selectedYear,semester)])
    if (request !== requestId.current) return
    setCells(grid as Record<string, Cell>)
    setPeriodTimes(times.times as PeriodTimeRow[])
    setScheduleDays([...new Set([...days,...teacherActivitiesInClock(times.times).filter(activity=>activity.teacherIds.includes(selectedTeacher)).flatMap(activity=>activity.days)])].sort())
    } catch (e) {
      if (request !== requestId.current) return
      setCells({})
      setAlert({ type: 'error', title: 'โหลดตารางไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    }
  }, [selectedTeacher, selectedYear, semester,fetchTeachingScheduleGrid,fetchPeriodTimes,fetchScheduleDays])


  useEffect(() => { void Promise.resolve().then(init) }, [init])

  useEffect(() => {
    if (!selectedYear || !selectedTeacher) return
    void Promise.resolve().then(loadGrid)
  }, [selectedTeacher, selectedYear, semester, loadGrid])

  function renderCell(cell: Cell | undefined) {
    if (!cell?.label) return <span>—</span>
    if (cell.room_line && cell.subject_line) {
      return (
        <>
          <span className="cell-room">{cell.room_line}</span>
          <span className="cell-subj">{cell.subject_line}</span>
        </>
      )
    }
    return <span className="cell-room">{cell.label}</span>
  }

  if (loading) {
    return <div className="schedule-empty">กำลังโหลด...</div>
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="schedule-page">
        <div className="schedule-head">
          <div>
            <h1>ตารางสอน</h1>
            <p>
              {teacherLabel && selectedYearObj
                ? `${teacherLabel} · ภาคเรียนที่ ${semester} · ปีการศึกษา พ.ศ. ${selectedYearObj.year_be}`
                : 'ดูตารางสอนรายครู'}
            </p>
          </div>
        </div>

        <div className="schedule-info">
          ตารางสอนใช้เวลาจริงของแต่ละช่วงชั้น รวมกิจกรรมครูที่รับผิดชอบ
          {teacherActivityMinutes(teacherActivitiesInClock(periodTimes),selectedTeacher)>0&&<span> · กิจกรรมครู {teacherActivityMinutes(teacherActivitiesInClock(periodTimes),selectedTeacher)} นาที/สัปดาห์ (แยกจากคาบสอน)</span>}
          {canEdit && (
            <>
              {' '}· แก้รายวิชาและล็อกคาบได้ที่{' '}
              <Link href="/schedules/class/manage">จัดการตารางเรียน</Link>
            </>
          )}
        </div>

        <div className="schedule-filters">
          <div className="schedule-field">
            <label>ปีการศึกษา</label>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="schedule-field">
            <label>ภาคเรียน</label>
            <select value={semester} onChange={e => setSemester(e.target.value === '2' ? 2 : 1)}>
              <option value={1}>ภาคเรียนที่ 1</option>
              <option value={2}>ภาคเรียนที่ 2</option>
            </select>
          </div>

          <div className="schedule-field">
            <label>ครูผู้สอน</label>
            <select
              value={selectedTeacher}
              onChange={e => setSelectedTeacher(e.target.value)}
              disabled={role === 'teacher'}
            >
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.prefix} {t.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {!selectedTeacher ? (
          <div className="schedule-empty">ไม่พบครูในโรงเรียน</div>
        ) : (
          <div className="schedule-grid-card">
            {canEdit&&!hasTeacherTimeline(periodTimes)?<TeacherAvailabilityPanel key={`${selectedYear}:${semester}:${selectedTeacher}`} yearId={selectedYear} semester={semester} fixedTeacher={selectedTeacher} periodTimes={periodTimes} disabled={false} refreshToken={''}/>:<div className="schedule-profile-teacher-grid"><ScheduleGridTable days={scheduleDays}
              periodTimes={teacherPeriodTimes(periodTimes)}
              renderCell={(day, period) => {
                const key = `${day}-${period}`
                const cell = cells[key]
                return <div className="cell-view">{renderCell(cell)}</div>
              }}
            /></div>}
            {hasTeacherTimeline(periodTimes)&&<div className="teacher-time-agenda" aria-label="ตารางครูตามเวลาจริง">{scheduleDays.map(day=>{const labels=['','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์'];const events=teacherPeriodTimes(periodTimes).filter(time=>cells[`${day}-${time.period}`]?.label);return <section key={day}><h3>วัน{labels[day]}</h3>{events.length?events.map(time=><article key={time.period}><time>{time.start_time}<br/>–{time.end_time}</time><div><strong>{cells[`${day}-${time.period}`].subject_line}</strong><small>{cells[`${day}-${time.period}`].room_line}</small></div></article>):<p>ไม่มีคาบสอนหรือกิจกรรมครูที่กำหนด</p>}</section>})}</div>}
          </div>
        )}
      </div>

      {alert && (
        <AppAlertModal
          open
          type={alert.type}
          title={alert.title}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}
    </>
  )
}
