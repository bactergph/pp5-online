'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchScheduleConflicts, fetchScheduleInit } from '@/app/schedules/actions'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import AppAlertModal from '@/components/AppAlertModal'

type Year = { id: string; year_be: number; is_active: boolean }
type Conflict = {
  teacher_id: string
  teacher_name: string
  day: number
  period: number
  day_label: string
  rooms: { room: string; subject: string }[]
}

const STYLES = `
  .schedule-page { display: grid; gap: 14px; }
  .schedule-head h1 { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .schedule-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: #64748B; }
  .schedule-filters {
    display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: end;
    padding: 14px; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .schedule-field { display: grid; gap: 5px; }
  .schedule-field label { font-size: 11px; font-weight: 900; color: #475569; }
  .schedule-field select {
    min-height: 36px; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0 10px;
    background: #fff; color: #0F172A; font-size: 13px; font-weight: 800;
  }
  .conflict-summary {
    padding: 12px 14px; border-radius: 12px; font-size: 12.5px; font-weight: 700;
  }
  .conflict-summary.has-conflicts {
    border: 1px solid #FECACA; background: #FEF2F2; color: #991B1B;
  }
  .conflict-summary.no-conflicts {
    border: 1px solid #BBF7D0; background: #F0FDF4; color: #166534;
  }
  .conflict-table-wrap {
    overflow: auto; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .conflict-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .conflict-table th, .conflict-table td {
    padding: 10px 12px; border-bottom: 1px solid #F1F5F9; text-align: left;
  }
  .conflict-table th {
    background: #F8FAFC; font-size: 10px; font-weight: 900; color: #64748B;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .conflict-rooms { display: grid; gap: 4px; }
  .conflict-room-item {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;
    border-radius: 8px; background: #FEF2F2; color: #991B1B; font-size: 11px; font-weight: 700;
  }
  .schedule-empty { padding: 28px; text-align: center; color: #64748B; font-size: 13px; font-weight: 700; }
  .schedule-info {
    padding: 12px 14px; border-radius: 12px; border: 1px solid #EFE6D8; background: #F5EDE3;
    color: #5C4330; font-size: 12.5px; font-weight: 700;
  }
  .schedule-info a { color: #8B6B45; font-weight: 800; }
`

export default function ScheduleConflictsEntry() {
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<Year[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [semester, setSemester] = useState(1)
  const requestId = useRef(0)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [count, setCount] = useState(0)
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)

  async function init() {
    try {
      const data = await fetchScheduleInit()
      setYears(data.years as Year[])
      const active = (data.years as Year[]).find(y => y.is_active) || (data.years as Year[])[0]
      if (active) setSelectedYear(active.id)
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setLoading(false)
    }
  }

  const loadConflicts = useCallback(async () => {
    const request = ++requestId.current
    try {
      const data = await fetchScheduleConflicts(selectedYear, semester)
      if (request !== requestId.current) return
      setConflicts(data.conflicts as Conflict[])
      setCount(data.count)
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    }
  }, [selectedYear, semester])

  useEffect(() => { void Promise.resolve().then(init) }, [])

  useEffect(() => {
    if (!selectedYear) return
    void Promise.resolve().then(loadConflicts)
  }, [selectedYear, semester, loadConflicts])

  if (loading) return <div className="schedule-empty">กำลังโหลด...</div>

  return (
    <>
      <style>{STYLES}</style>
      <div className="schedule-page">
        <div className="schedule-head">
          <h1>ตรวจสอบความขัดแย้งตารางสอน</h1>
          <p>ครูสอนซ้ำในคาบเดียวกัน (หลายห้อง)</p>
        </div>

        <div className="schedule-info">
          แก้ไขได้ที่ <Link href="/schedules/class/manage">จัดการตารางเรียน</Link>
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
            <select value={semester} onChange={e => setSemester(Number(e.target.value))}>
              <option value={1}>ภาคเรียนที่ 1</option>
              <option value={2}>ภาคเรียนที่ 2</option>
            </select>
          </div>

        </div>

        <div className={`conflict-summary ${count > 0 ? 'has-conflicts' : 'no-conflicts'}`}>
          {count > 0
            ? `พบความขัดแย้ง ${count} รายการ — ครูถูกจัดสอนซ้ำในคาบเดียวกัน`
            : 'ไม่พบความขัดแย้ง — ครูทุกท่านไม่มีการสอนซ้ำในคาบเดียวกัน'}
        </div>

        {count > 0 && (
          <div className="conflict-table-wrap">
            <table className="conflict-table">
              <thead>
                <tr>
                  <th>ครูผู้สอน</th>
                  <th>วัน</th>
                  <th>คาบ</th>
                  <th>ห้องที่ซ้ำ</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((c, i) => (
                  <tr key={`${c.teacher_id}-${c.day}-${c.period}-${i}`}>
                    <td>{c.teacher_name}</td>
                    <td>{c.day_label || SCHEDULE_DAYS.find(d => d.value === c.day)?.label}</td>
                    <td>คาบ {c.period}</td>
                    <td>
                      <div className="conflict-rooms">
                        {c.rooms.map((r, j) => (
                          <span key={j} className="conflict-room-item">
                            {r.room} — {r.subject || '—'}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {alert && (
        <AppAlertModal open type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
    </>
  )
}
