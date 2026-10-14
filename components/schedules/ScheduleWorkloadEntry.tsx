'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import { fetchScheduleExportContext, fetchScheduleInit, fetchScheduleWorkload } from '@/app/schedules/actions'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { buildWorkloadPdfBlob } from '@/lib/jspdf-schedules'
import { scheduleSchoolName } from '@/lib/schedule-school-name'
import { directorDisplayName } from '@/lib/school-director'
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
  .schedule-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
  .schedule-head h1 { margin: 0; font-size: 22px; font-weight: 700; color: #182b49; }
  .schedule-head button { min-height:40px; padding:0 16px; border:0; border-radius:8px; background:#2563eb; color:#fff; font-weight:700; cursor:pointer; }
  .schedule-head button:disabled { opacity:.5; cursor:not-allowed; }
  .schedule-head p { margin: 4px 0 0; font-size: 13px; font-weight: 600; color: #52647c; }
  .schedule-filters {
    display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: end;
    padding: 14px; border: 1px solid #dce6f2; border-radius: 14px; background: #fff;
  }
  .schedule-field { display: grid; gap: 5px; }
  .schedule-field label { font-size: 13px; font-weight: 600; color: #52647c; }
  .schedule-field select {
    min-height: 40px; border: 1px solid #d8dee8; border-radius: 8px; padding: 0 10px;
    background: #fff; color: #1f2937; font-size: 14px; font-weight: 600;
  }
  .workload-table-wrap {
    overflow: auto; border: 1px solid #dce6f2; border-radius: 14px; background: #fff;
  }
  .workload-table { width: 100%; border-collapse: collapse; font-size: 14px; color: #1f2937; }
  .workload-table th, .workload-table td {
    padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left;
  }
  .workload-table th {
    background: #eef2f6; font-size: 13px; font-weight: 700; color: #182b49;
  }
  .workload-table td.num { text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
  .schedule-empty { padding: 28px; text-align: center; color: #52647c; font-size: 14px; font-weight: 600; }
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
          <div>
            <h1>ภาระงานสอนรายสัปดาห์</h1>
            <p>แสดงเฉพาะครูที่มีภาระสอนในตารางเรียนหรือกิจกรรม</p>
          </div>
          <button type="button" disabled={!rows.length} onClick={() => {
            const year = years.find(item => item.id === selectedYear)?.year_be || ''
            const fileName = `สรุปภาระงานสอน_ภาค${semester}_${year}.pdf`
            enqueueFileExport({ fileName, label: 'สรุปภาระงานสอน', run: async () => {
              const ctx = await fetchScheduleExportContext()
              return buildWorkloadPdfBlob({
                schoolName: scheduleSchoolName(ctx.school?.name),
                schoolLogoUrl: ctx.school?.logo_url,
                title: `สรุปภาระงานสอน ภาคเรียนที่ ${semester} ปีการศึกษา ${year}`,
                fileName,
                academicHeadName: ctx.school?.academic_head_name || '',
                directorName: directorDisplayName(ctx.school, ''),
                directorPosition: ctx.school?.acting_director ? 'รักษาการในตำแหน่งผู้อำนวยการสถานศึกษา' : 'ผู้อำนวยการสถานศึกษา',
                rows,
              })
            }})
          }}>ส่งออก PDF</button>
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

        <div className="workload-table-wrap">
          <table className="workload-table">
            <thead>
              <tr>
                <th>ครูผู้สอน</th>
                <th>ตำแหน่ง</th>
                <th style={{ width: 120 }}>คาบ/สัปดาห์</th>
                <th style={{ width: 160 }}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.position || '—'}</td>
                  <td className="num">{row.hours}</td>
                  <td />
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#52647c', padding: 24 }}>
                    ยังไม่มีครูที่มีภาระสอน
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
