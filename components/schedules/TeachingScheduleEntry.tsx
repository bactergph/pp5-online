'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchPeriodTimes, fetchScheduleInit, fetchTeachingScheduleGrid } from '@/app/schedules/actions'
import type { PeriodTimeRow } from '@/lib/schedule-helpers'
import AppAlertModal from '@/components/AppAlertModal'
import ScheduleGridTable from '@/components/schedules/ScheduleGridTable'

type Year = { id: string; year_be: number; is_active: boolean }
type Teacher = { id: string; prefix: string; full_name: string }
type Cell = { label: string; subject_line: string; room_line: string }

const STYLES = `
  .schedule-page { display: grid; gap: 14px; }
  .schedule-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .schedule-head h1 { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .schedule-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: #64748B; }
  .schedule-filters {
    display: grid; grid-template-columns: 140px minmax(220px, 1fr); gap: 12px; align-items: end;
    padding: 14px; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .schedule-field { display: grid; gap: 5px; }
  .schedule-field label { font-size: 11px; font-weight: 900; color: #475569; }
  .schedule-field select {
    min-height: 36px; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0 10px;
    background: #fff; color: #0F172A; font-size: 13px; font-weight: 800;
  }
  .schedule-info {
    padding: 12px 14px; border-radius: 12px; border: 1px solid #E0E7FF; background: #EEF2FF;
    color: #3730A3; font-size: 12.5px; font-weight: 700; line-height: 1.5;
  }
  .schedule-info a { color: #4F46E5; font-weight: 800; }
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
  .schedule-empty { padding: 28px; text-align: center; color: #64748B; font-size: 13px; font-weight: 700; }
`

export default function TeachingScheduleEntry() {
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<Year[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [periodTimes, setPeriodTimes] = useState<PeriodTimeRow[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [role, setRole] = useState('')
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)

  const teacherLabel = useMemo(() => {
    const t = teachers.find(item => item.id === selectedTeacher)
    return t ? `${t.prefix} ${t.full_name}` : ''
  }, [teachers, selectedTeacher])

  const selectedYearObj = years.find(y => y.id === selectedYear)

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (!selectedYear || !selectedTeacher) return
    loadGrid()
  }, [selectedYear, selectedTeacher])

  async function init() {
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
      if (active) setSelectedYear(active.id)
      if (data.defaultTeacherId) setSelectedTeacher(data.defaultTeacherId)
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setLoading(false)
    }
  }

  async function loadGrid() {
    const grid = await fetchTeachingScheduleGrid(selectedTeacher, selectedYear)
    setCells(grid as Record<string, Cell>)
  }

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
                ? `${teacherLabel} · ปีการศึกษา พ.ศ. ${selectedYearObj.year_be}`
                : 'ดูตารางสอนรายครู'}
            </p>
          </div>
        </div>

        <div className="schedule-info">
          ตารางสอนสร้างจากตารางเรียนอัตโนมัติ (ตามครูผู้สอนในแต่ละรายวิชา)
          {canEdit && (
            <>
              {' '}— แก้ไขได้ที่{' '}
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
            <ScheduleGridTable
              periodTimes={periodTimes}
              renderCell={(day, period) => {
                const key = `${day}-${period}`
                const cell = cells[key]
                return <div className="cell-view">{renderCell(cell)}</div>
              }}
            />
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
