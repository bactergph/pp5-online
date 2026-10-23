'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FiDownload, FiRefreshCw, FiSearch, FiAlertCircle } from 'react-icons/fi'
import { fetchScheduleExportContext, fetchScheduleInit, fetchScheduleWorkload } from '@/app/schedules/actions'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { buildWorkloadPdfBlob } from '@/lib/jspdf-schedules'
import { scheduleSchoolName } from '@/lib/schedule-school-name'
import { directorDisplayName } from '@/lib/school-director'
import { scheduleSemesterForYear } from '@/lib/schedule-helpers'
import type { ScheduleWorkloadRow } from '@/lib/schedule-workload'
import './schedule-workload.css'

type Year = { id: string; year_be: number; is_active: boolean; term1_start_date?: string | null; term1_end_date?: string | null; term2_start_date?: string | null; term2_end_date?: string | null }

export default function ScheduleWorkloadEntry() {
  const [initLoading, setInitLoading] = useState(true)
  const [initError, setInitError] = useState('')
  const [initAttempt, setInitAttempt] = useState(0)
  const [years, setYears] = useState<Year[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [semester, setSemester] = useState(1)
  const [query, setQuery] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [report, setReport] = useState<{ key: string; rows: ScheduleWorkloadRow[] } | null>(null)
  const [reportError, setReportError] = useState<{ key: string; message: string } | null>(null)
  const requestId = useRef(0)
  const context = `${selectedYear}:${semester}`

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      setInitLoading(true); setInitError('')
      try {
        const data = await fetchScheduleInit()
        if (cancelled) return
        const list = data.years as Year[], params = new URLSearchParams(window.location.search)
        const active = list.find(year => year.id === params.get('year')) || list.find(year => year.is_active) || list[0]
        setYears(list)
        if (active) {
          const term = Number(params.get('semester'))
          setSemester(term === 1 || term === 2 ? term : scheduleSemesterForYear(active))
          setSelectedYear(active.id)
        }
      } catch (error) {
        if (!cancelled) setInitError(error instanceof Error ? error.message : 'โหลดปีการศึกษาไม่สำเร็จ')
      } finally { if (!cancelled) setInitLoading(false) }
    })
    return () => { cancelled = true }
  }, [initAttempt])

  const loadReport = useCallback(async () => {
    if (!selectedYear) return
    const request = ++requestId.current, key = `${selectedYear}:${semester}`
    setReportLoading(true); setReportError(null)
    try {
      const rows = await fetchScheduleWorkload(selectedYear, semester)
      if (request === requestId.current) setReport({ key, rows })
    } catch (error) {
      if (request === requestId.current) setReportError({ key, message: error instanceof Error ? error.message : 'โหลดภาระงานสอนไม่สำเร็จ' })
    } finally { if (request === requestId.current) setReportLoading(false) }
  }, [selectedYear, semester])

  useEffect(() => {
    const counter = requestId
    if (selectedYear) void Promise.resolve().then(loadReport)
    return () => { ++counter.current }
  }, [selectedYear, loadReport])

  const rows = report?.key === context ? report.rows : []
  const error = initError || (reportError?.key === context ? reportError.message : '')
  const loading = initLoading || reportLoading || !!selectedYear && report?.key !== context && !error
  const normalizedQuery = query.trim().toLocaleLowerCase('th').replace(/\s+/g, '')
  const visible = rows.filter(row => row.name.toLocaleLowerCase('th').replace(/\s+/g, '').includes(normalizedQuery))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'th'))
  const yearLabel = years.find(year => year.id === selectedYear)?.year_be || ''
  const exportReady = !loading && !error && report?.key === context && visible.length > 0

  function exportPdf() {
    if (!exportReady) return
    const snapshot = visible.map(({name, hours, note}) => ({name, hours, note: note || ''})), title = `สรุปภาระงานสอน ภาคเรียนที่ ${semester} ปีการศึกษา ${yearLabel}`
    const fileName = `สรุปภาระงานสอน_ภาค${semester}_${yearLabel}.pdf`
    enqueueFileExport({ fileName, label: 'สรุปภาระงานสอน', run: async () => {
      const ctx = await fetchScheduleExportContext()
      return buildWorkloadPdfBlob({
        schoolName: scheduleSchoolName(ctx.school?.name), schoolLogoUrl: ctx.school?.logo_url, title, fileName,
        academicHeadName: ctx.school?.academic_head_name || '', directorName: directorDisplayName(ctx.school, ''),
        directorPosition: ctx.school?.acting_director ? 'รักษาการในตำแหน่งผู้อำนวยการสถานศึกษา' : 'ผู้อำนวยการสถานศึกษา', rows: snapshot,
      })
    } })
  }

  return <main className="workload-report">
    <header className="workload-report-head">
      <div><span className="workload-report-kicker">พิมพ์เอกสาร</span><h1>ภาระงานสอน</h1><p>สรุปคาบสอนต่อสัปดาห์ของครู เรียงจากมากไปน้อย</p></div>
      <button type="button" className="workload-report-primary" disabled={!exportReady} onClick={exportPdf}><FiDownload aria-hidden="true"/>บันทึก PDF</button>
    </header>

    <section className="workload-report-filters" aria-label="ตัวกรองภาระงานสอน">
      <div><label htmlFor="workload-year">ปีการศึกษา</label><select id="workload-year" disabled={initLoading || !years.length} value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>{!years.length && <option value="">ยังไม่มีปีการศึกษา</option>}{years.map(year => <option key={year.id} value={year.id}>พ.ศ. {year.year_be}{year.is_active ? ' (ปัจจุบัน)' : ''}</option>)}</select></div>
      <div><label htmlFor="workload-semester">ภาคเรียน</label><select id="workload-semester" disabled={initLoading || !years.length} value={semester} onChange={event => setSemester(Number(event.target.value))}><option value={1}>ภาคเรียนที่ 1</option><option value={2}>ภาคเรียนที่ 2</option></select></div>
      <div className="workload-report-search"><label htmlFor="workload-search">ค้นหาครู</label><div><FiSearch aria-hidden="true"/><input id="workload-search" type="search" placeholder="ชื่อหรือนามสกุลครู" value={query} onChange={event => setQuery(event.target.value)}/></div></div>
      <button type="button" className="workload-report-secondary" disabled={loading || !selectedYear} onClick={() => void loadReport()}><FiRefreshCw aria-hidden="true"/>โหลดข้อมูลล่าสุด</button>
    </section>

    {error && <div className="workload-report-error" role="alert"><FiAlertCircle aria-hidden="true"/><div><b>โหลดข้อมูลไม่สำเร็จ</b><p>{error}</p></div><button type="button" onClick={() => initError ? setInitAttempt(attempt => attempt + 1) : void loadReport()}>ลองใหม่</button></div>}

    <section className="workload-report-card" aria-busy={!!loading}>
      <div className="workload-report-table-head"><h2>ภาระสอนรายบุคคล</h2><span>{yearLabel ? `ภาคเรียนที่ ${semester} / ${yearLabel}` : 'เลือกปีการศึกษา'}</span></div>
      <div className="workload-report-scroll" tabIndex={0} role="region" aria-label="ตารางภาระสอนรายบุคคล">
        <table><colgroup><col className="workload-report-order-col"/><col/><col className="workload-report-hours-col"/><col className="workload-report-note-col"/></colgroup><thead><tr><th scope="col">ลำดับ</th><th scope="col">ชื่อ-นามสกุล</th><th scope="col">ภาระงาน<span>คาบ/สัปดาห์</span></th><th scope="col">หมายเหตุ</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={4}><div className="workload-report-empty" role="status"><span className="workload-report-spinner"/>กำลังโหลดภาระงานสอน…</div></td></tr> : error ? <tr><td colSpan={4}><div className="workload-report-empty">กรุณาลองโหลดข้อมูลอีกครั้ง</div></td></tr> : visible.length ? visible.map((row, index) => <tr key={row.id}>
            <td className="workload-report-number">{index + 1}</td>
            <th scope="row">{row.name}</th>
            <td className="workload-report-number"><b>{row.hours}</b></td>
            <td>{row.note || ''}</td>
          </tr>) : <tr><td colSpan={4}><div className="workload-report-empty">{query ? 'ไม่พบครูที่ตรงกับคำค้นหา' : selectedYear ? 'ยังไม่มีภาระสอนในภาคเรียนนี้' : 'ยังไม่มีปีการศึกษาให้แสดงรายงาน'}</div></td></tr>}</tbody>
        </table>
      </div>
      <footer><span>{!loading && !error ? `แสดง ${visible.length} จาก ${rows.length} คน` : 'กำหนดภาระใน Quick Wizard แล้วกลับมาโหลดข้อมูลล่าสุด'}</span><p>รวมคาบรายวิชาและกิจกรรมต่อสัปดาห์ · PDF ใช้รายชื่อที่แสดงตามคำค้นหา</p></footer>
    </section>
  </main>
}
