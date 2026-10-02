'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import { fetchScheduleInit, fetchScheduleWorkload } from '@/app/schedules/actions'
import AppAlertModal from '@/components/AppAlertModal'

type Year = { id: string; year_be: number; is_active: boolean }
type WorkloadRow = {
  id: string
  name: string
  position: string | null
  hours: number
  status: 'ok' | 'warn' | 'over'
  status_label: string
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
  .workload-legend {
    display: flex; gap: 16px; flex-wrap: wrap; font-size: 11.5px; font-weight: 700; color: #64748B;
  }
  .workload-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .workload-dot { width: 10px; height: 10px; border-radius: 999px; }
  .workload-dot.ok { background: #10B981; }
  .workload-dot.warn { background: #F59E0B; }
  .workload-dot.over { background: #EF4444; }
  .workload-table-wrap {
    overflow: auto; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .workload-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .workload-table th, .workload-table td {
    padding: 10px 12px; border-bottom: 1px solid #F1F5F9; text-align: left;
  }
  .workload-table th {
    background: #F8FAFC; font-size: 10px; font-weight: 900; color: #64748B;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .workload-table td.num { text-align: center; font-weight: 900; font-variant-numeric: tabular-nums; }
  .workload-badge {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
    border-radius: 999px; font-size: 11px; font-weight: 800;
  }
  .workload-badge.ok { background: #D1FAE5; color: #065F46; }
  .workload-badge.warn { background: #FEF3C7; color: #92400E; }
  .workload-badge.over { background: #FEE2E2; color: #991B1B; }
  .workload-row.ok td { background: rgba(16, 185, 129, 0.04); }
  .workload-row.warn td { background: rgba(245, 158, 11, 0.06); }
  .workload-row.over td { background: rgba(239, 68, 68, 0.06); }
  .schedule-empty { padding: 28px; text-align: center; color: #64748B; font-size: 13px; font-weight: 700; }
`

export default function ScheduleWorkloadEntry() {
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<Year[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [semester, setSemester] = useState(1)
  const requestId = useRef(0)
  const [rows, setRows] = useState<WorkloadRow[]>([])
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

  const loadWorkload = useCallback(async () => {
    const request = ++requestId.current
    try {
      const data = await fetchScheduleWorkload(selectedYear, semester)
      if (request !== requestId.current) return
      setRows(data as WorkloadRow[])
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    }
  }, [selectedYear, semester])

  useEffect(() => { void Promise.resolve().then(init) }, [])

  useEffect(() => {
    if (!selectedYear) return
    void Promise.resolve().then(loadWorkload)
  }, [selectedYear, semester, loadWorkload])

  if (loading) return <div className="schedule-empty">กำลังโหลด...</div>

  return (
    <>
      <style>{STYLES}</style>
      <div className="schedule-page">
        <div className="schedule-head">
          <h1>ภาระงานสอนรายสัปดาห์</h1>
          <p>จำนวนคาบสอนต่อสัปดาห์ของครูแต่ละท่าน</p>
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

        <div className="workload-legend">
          <span><i className="workload-dot ok" /> ปกติ (≤18 คาบ)</span>
          <span><i className="workload-dot warn" /> ค่อนข้างมาก (19–20 คาบ)</span>
          <span><i className="workload-dot over" /> เกินมาตรฐาน (&gt;20 คาบ)</span>
        </div>

        <div className="workload-table-wrap">
          <table className="workload-table">
            <thead>
              <tr>
                <th>ครูผู้สอน</th>
                <th>ตำแหน่ง</th>
                <th style={{ width: 80 }}>คาบ/สัปดาห์</th>
                <th style={{ width: 140 }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={`workload-row ${row.status}`}>
                  <td>{row.name}</td>
                  <td>{row.position || '—'}</td>
                  <td className="num">{row.hours}</td>
                  <td>
                    <span className={`workload-badge ${row.status}`}>{row.status_label}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#64748B', padding: 24 }}>
                    ไม่พบข้อมูลบุคลากร
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {alert && (
        <AppAlertModal open type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
    </>
  )
}
