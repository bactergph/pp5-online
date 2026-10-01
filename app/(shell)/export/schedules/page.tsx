'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchClassScheduleGrid,
  fetchClassScheduleSubjects,
  fetchScheduleClassrooms,
  fetchScheduleInit,
  fetchTeachingScheduleGrid,
  fetchScheduleExportContext,
} from '@/app/schedules/actions'
import { SCHEDULE_DAYS, SCHEDULE_MORNING_PERIODS, SCHEDULE_PERIODS } from '@/lib/schedules'
import { periodTimeLabel, type PeriodTimeRow } from '@/lib/schedule-helpers'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { directorDisplayName } from '@/lib/school-director'
import { buildSchedulePdfBlob } from '@/lib/jspdf-schedules'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = { id: string; level: string; room: number; label: string }
type Teacher = { id: string; prefix: string; full_name: string }
type ExportType = 'class' | 'teaching'

const STYLES = `
  .sched-export-page { display: grid; gap: 14px; }
  .sched-export-head h1 { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .sched-export-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: #64748B; }
  .sched-export-filters {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px;
    padding: 14px; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .sched-export-field { display: grid; gap: 5px; }
  .sched-export-field label { font-size: 11px; font-weight: 900; color: #475569; }
  .sched-export-field select {
    min-height: 36px; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0 10px;
    background: #fff; font-size: 13px; font-weight: 800;
  }
  .sched-export-actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .sched-export-btn {
    min-height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid #C49212;
    background: #C49212; color: #fff; font-size: 12px; font-weight: 800; cursor: pointer;
  }
  .sched-export-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .sched-export-preview {
    border: 1px solid #E5E7EB; border-radius: 14px; background: #fff; padding: 20px;
    overflow: auto;
  }
  .sched-print-head { flex-direction: column; text-align: center; justify-content: center;
    display: flex; align-items: center; gap: 16px; margin-bottom: 16px;
    padding-bottom: 12px; border-bottom: 2px solid #1E293B;
  }
  .sched-print-logo {
    width: 64px; height: 64px; border-radius: 12px; border: 1px solid #E5E7EB;
    display: grid; place-items: center; overflow: hidden; flex-shrink: 0;
    background: #F8FAFC; font-size: 11px; font-weight: 800; color: #94A3B8;
  }
  .sched-print-logo img { width: 100%; height: 100%; object-fit: contain; }
  .sched-print-head h2 { margin: 0; font-size: 18px; font-weight: 900; }
  .sched-print-head p { margin: 4px 0 0; font-size: 12px; font-weight: 700; color: #64748B; }
  .sched-print-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .sched-print-table th, .sched-print-table td {
    border: 1px solid #CBD5E1; padding: 6px 4px; text-align: center; vertical-align: middle;
  }
  .sched-print-table th { background: #F1F5F9; font-weight: 900; font-size: 9px; }
  .sched-print-table td.day-col { background: #F5EDE3; font-weight: 900; }
  .sched-print-table td.break-col { background: #FFFBEB; color: #B45309; font-size: 8px; }
  .sched-print-cell { min-height: 32px; font-weight: 700; line-height: 1.3; }
  .sched-print-cell .sub { font-size: 8px; color: #64748B; font-weight: 600; }
  @media print {
    .sched-export-filters, .sched-export-actions, .sched-export-head { display: none !important; }
    .sched-export-preview { border: none; padding: 0; }
  }
`

export default function ScheduleExportPage() {
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<Year[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [academicHeadName, setAcademicHeadName] = useState('')
  const [directorName, setDirectorName] = useState('')
  const [directorPosition, setDirectorPosition] = useState('ผู้อำนวยการสถานศึกษา')
  const [schoolName, setSchoolName] = useState('')
  const [schoolLogoUrl, setSchoolLogoUrl] = useState('')
  const [periodTimes, setPeriodTimes] = useState<PeriodTimeRow[]>([])
  const [yearId, setYearId] = useState('')
  const [exportType, setExportType] = useState<ExportType>('class')
  const [classroomId, setClassroomId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [gridData, setGridData] = useState<Record<string, { line1: string; line2: string }>>({})
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  const printMode = useRef(false)
  const [isPrintMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('print') === '1'
  })

  useEffect(() => {
    printMode.current = isPrintMode
  }, [isPrintMode])

  const init = useCallback(async () => {
    try {
      const [initData, ctx] = await Promise.all([
        fetchScheduleInit(),
        fetchScheduleExportContext(),
      ])
      setYears(initData.years as Year[])
      setTeachers(initData.teachers as Teacher[])
      setAcademicHeadName(ctx.school?.academic_head_name || '')
      setDirectorName(directorDisplayName(ctx.school, ''))
      setDirectorPosition(ctx.school?.acting_director ? 'รักษาการในตำแหน่งผู้อำนวยการสถานศึกษา' : ctx.school?.director_position || 'ผู้อำนวยการสถานศึกษา')
      setSchoolName(ctx.school?.name || '')
      setSchoolLogoUrl(ctx.school?.logo_url || '')
      setPeriodTimes(ctx.periodTimes as PeriodTimeRow[])

      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      const isPrint = params?.get('print') === '1'
      const active = (initData.years as Year[]).find(y => y.is_active) || (initData.years as Year[])[0]

      if (isPrint && params) {
        const type = params.get('type') as ExportType | null
        if (type === 'class' || type === 'teaching') setExportType(type)
        if (params.get('year')) setYearId(params.get('year')!)
        else if (active) setYearId(active.id)
        if (params.get('classroom')) setClassroomId(params.get('classroom')!)
        if (params.get('teacher')) setTeacherId(params.get('teacher')!)
      } else {
        if (active) setYearId(active.id)
        if (initData.defaultTeacherId) setTeacherId(initData.defaultTeacherId)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadClassGrid = useCallback(async () => {
    const [grid, subs] = await Promise.all([
      fetchClassScheduleGrid(classroomId, yearId),
      fetchClassScheduleSubjects(classroomId),
    ])
    const subjMap = Object.fromEntries(
      (subs as { id: string; label: string; teacher_name: string }[]).map(s => [s.id, s]),
    )
    const classroom = classrooms.find(c => c.id === classroomId)
    const year = years.find(y => y.id === yearId)
    setTitle(`ตารางเรียน ห้อง ${classroom?.label || ''} ปีการศึกษา พ.ศ. ${year?.year_be || ''}`)

    const data: Record<string, { line1: string; line2: string }> = {}
    for (const [key, cell] of Object.entries(grid as Record<string, { class_subject_id: string | null; note: string | null }>)) {
      if (!cell.class_subject_id) {
        data[key] = { line1: cell.note || '—', line2: '' }
        continue
      }
      const subj = subjMap[cell.class_subject_id]
      data[key] = {
        line1: subj?.label || '—',
        line2: subj?.teacher_name || '',
      }
    }
    setGridData(data)
    setPreviewReady(true)
  }, [classroomId, yearId, classrooms, years])

  const loadTeachingGrid = useCallback(async () => {
    const grid = await fetchTeachingScheduleGrid(teacherId, yearId)
    const teacher = teachers.find(t => t.id === teacherId)
    const year = years.find(y => y.id === yearId)
    setTitle(`ตารางสอน ${teacher ? `${teacher.prefix} ${teacher.full_name}` : ''} ปีการศึกษา พ.ศ. ${year?.year_be || ''}`)

    const data: Record<string, { line1: string; line2: string }> = {}
    for (const [key, cell] of Object.entries(grid as Record<string, { room_line: string; subject_line: string }>)) {
      data[key] = {
        line1: cell.room_line || '—',
        line2: cell.subject_line || '',
      }
    }
    setGridData(data)
    setPreviewReady(true)
  }, [teacherId, yearId, teachers, years])

  useEffect(() => { void Promise.resolve().then(init) }, [init])

  useEffect(() => {
    if (!yearId) return
    fetchScheduleClassrooms(yearId).then(list => {
      setClassrooms(list as Classroom[])
      setClassroomId(current => list.some(c => c.id === current) ? current : list[0]?.id || '')
    })
  }, [yearId])

  useEffect(() => {
    if (!yearId) return
    if (exportType === 'class' && classroomId) void Promise.resolve().then(loadClassGrid).catch(() => setError('โหลดตารางไม่สำเร็จ'))
    else if (exportType === 'teaching' && teacherId) void Promise.resolve().then(loadTeachingGrid).catch(() => setError('โหลดตารางไม่สำเร็จ'))
  }, [yearId, exportType, classroomId, teacherId, loadClassGrid, loadTeachingGrid])

  useEffect(() => {
    if (!printMode.current || !previewReady) return
    let cancelled = false
    const markReady = async () => {
      try {
        if ('fonts' in document) await (document as { fonts: { ready: Promise<unknown> } }).fonts.ready
      } catch {}
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('.sched-print-logo img'))
      await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })))
      await new Promise(requestAnimationFrame)
      if (!cancelled) (window as unknown as { __REPORT_READY__?: boolean }).__REPORT_READY__ = true
    }
    void markReady()
    return () => { cancelled = true }
  }, [previewReady])

  function exportPdf() {
    setError('')
    const label = exportType === 'class'
      ? classrooms.find(c => c.id === classroomId)?.label || 'class'
      : teachers.find(t => t.id === teacherId)?.full_name || 'teacher'
    const fileName = `ตารางเรียน_${label}.pdf`.replace(/[\\/:*?"<>|]/g, '-')

    // สร้างด้วย jsPDF บนเครื่องผู้ใช้ แล้วใส่คิวมุมขวาล่าง (ไม่ผ่าน Puppeteer)
    enqueueFileExport({
      fileName,
      label: `ตารางเรียน · ${label}`,
      run: () => buildSchedulePdfBlob({
        academicHeadName, directorName, directorPosition,
        schoolName,
        schoolLogoUrl,
        title,
        periodTimes,
        gridData,
        fileName,
      }),
    })
  }

  const periods = SCHEDULE_PERIODS
  const morning = SCHEDULE_MORNING_PERIODS

  if (loading) return <div style={{ padding: 28, textAlign: 'center', fontWeight: 700, color: '#64748B' }}>กำลังโหลด...</div>

  return (
    <>
      <style>{STYLES}</style>
      <div className="sched-export-page">
        <div className="sched-export-head">
          <h1>พิมพ์ตารางเรียน / ตารางสอน</h1>
          <p>ส่งออก PDF พร้อมหัวกระดาษโรงเรียน</p>
        </div>

        <div className="sched-export-filters">
          <div className="sched-export-field">
            <label>ประเภท</label>
            <select value={exportType} onChange={e => setExportType(e.target.value as ExportType)}>
              <option value="class">ตารางเรียน (รายห้อง)</option>
              <option value="teaching">ตารางสอน (รายครู)</option>
            </select>
          </div>
          <div className="sched-export-field">
            <label>ปีการศึกษา</label>
            <select value={yearId} onChange={e => setYearId(e.target.value)}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}</option>
              ))}
            </select>
          </div>
          {exportType === 'class' ? (
            <div className="sched-export-field">
              <label>ห้องเรียน</label>
              <select value={classroomId} onChange={e => setClassroomId(e.target.value)}>
                {classrooms.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sched-export-field">
              <label>ครูผู้สอน</label>
              <select value={teacherId} onChange={e => setTeacherId(e.target.value)}>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.prefix} {t.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="sched-export-actions">
          <button type="button" className="sched-export-btn" onClick={exportPdf}>
            บันทึก PDF
          </button>
        </div>

        {error && <div style={{ color: '#DC2626', fontSize: 12, fontWeight: 700 }}>{error}</div>}

        <div className="sched-export-preview">
          <header className="sched-print-head">
            <div className="sched-print-logo">
              {schoolLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={schoolLogoUrl} alt="โลโก้โรงเรียน" />
              ) : (
                <span>ตรา</span>
              )}
            </div>
            <div>
              <h2>{schoolName || 'ชื่อโรงเรียน'}</h2>
              <p>{title}</p>
            </div>
          </header>

          <table className="sched-print-table">
            <thead>
              <tr>
                <th>วัน</th>
                {periods.slice(0, morning).map(p => (
                  <th key={p}>
                    คาบ {p}
                    {periodTimes.length ? (
                      <div style={{ fontSize: 8, fontWeight: 600, color: '#94A3B8' }}>
                        {periodTimeLabel(periodTimes, p)}
                      </div>
                    ) : null}
                  </th>
                ))}
                <th className="break-col">พักเที่ยง</th>
                {periods.slice(morning).map(p => (
                  <th key={p}>
                    คาบ {p}
                    {periodTimes.length ? (
                      <div style={{ fontSize: 8, fontWeight: 600, color: '#94A3B8' }}>
                        {periodTimeLabel(periodTimes, p)}
                      </div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCHEDULE_DAYS.map(day => (
                <tr key={day.value}>
                  <td className="day-col">{day.label}</td>
                  {periods.slice(0, morning).map(p => {
                    const cell = gridData[`${day.value}-${p}`]
                    return (
                      <td key={p}>
                        <div className="sched-print-cell">
                          {cell?.line1 || '—'}
                          {cell?.line2 ? <div className="sub">{cell.line2}</div> : null}
                        </div>
                      </td>
                    )
                  })}
                  <td className="break-col">พัก</td>
                  {periods.slice(morning).map(p => {
                    const cell = gridData[`${day.value}-${p}`]
                    return (
                      <td key={p}>
                        <div className="sched-print-cell">
                          {cell?.line1 || '—'}
                          {cell?.line2 ? <div className="sub">{cell.line2}</div> : null}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{display:'flex',justifyContent:'space-around',textAlign:'center',marginTop:28,fontSize:14,breakInside:'avoid'}}>
            {[{name:academicHeadName,role:'หัวหน้าวิชาการ'},{name:directorName,role:directorPosition}].map(s=><div key={s.role}>
              <p>ลงชื่อ ........................................................</p><p>({s.name || '........................................................'})</p><p>{s.role}</p><p>วันที่ ........../........../..........</p>
            </div>)}
          </div>
        </div>
      </div>
    </>
  )
}
