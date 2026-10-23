'use client'
import { fetchScheduleDays } from '@/app/schedules/actions'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchClassScheduleGrid,
  fetchClassScheduleSubjects,
  fetchScheduleClassrooms,
  fetchScheduleInit,
  fetchSchedulePdfGrids,
  fetchTeachingScheduleGrid,
  fetchScheduleExportContext,
} from '@/app/schedules/actions'
import { SCHEDULE_DAYS, SCHEDULE_MORNING_PERIODS, SCHEDULE_PERIODS } from '@/lib/schedules'
import { activityTeacherLabel, isActivityLessonId, periodTimeLabel, scheduleSemesterForYear, teacherGivenName, type PeriodTimeRow } from '@/lib/schedule-helpers'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { scheduleSchoolName } from '@/lib/schedule-school-name'
import { directorDisplayName } from '@/lib/school-director'
import { buildSchedulePdfBlob } from '@/lib/jspdf-schedules'
import { formatThaiDate } from '@/lib/thaiDate'

type Year = { id: string; year_be: number; is_active: boolean; term1_start_date?: string | null; term1_end_date?: string | null; term2_start_date?: string | null; term2_end_date?: string | null }
type Classroom = { id: string; level: string; room: number; label: string }
type Teacher = { id: string; prefix: string; full_name: string }
type ExportType = 'class' | 'teaching'

function teachingLines(roomLine: string, subjectLine: string) {
  const [subjectPart, place = ''] = (subjectLine || '').split(/\s*·\s*/)
  const match = subjectPart.trim().match(/^(\S+)\s+(.+)$/)
  return {
    line1: roomLine || '—',
    line2: match?.[2] || subjectPart,
    line3: match ? `(${match[1]})` : '',
    line4: place,
  }
}

const STYLES = `
  .sched-export-page { display: grid; gap: 16px; color: #182b49; }
  .sched-export-head {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px;
    padding: 22px 24px; border: 1px solid #dce6f2; border-radius: 16px; background: #fff;
  }
  .sched-export-kicker { display: block; margin-bottom: 4px; color: #52647c; font-size: 13px; font-weight: 600; }
  .sched-export-head h1 { margin: 0; font-size: clamp(23px, 2.5vw, 30px); line-height: 1.4; font-weight: 700; color: #182b49; }
  .sched-export-head p { margin: 4px 0 0; max-width: 560px; font-size: 14px; font-weight: 500; line-height: 1.7; color: #52647c; }
  .sched-export-type {
    display: flex; flex-wrap: wrap; gap: 8px; padding: 8px;
    background: #edf2f8; border: 1px solid #dce6f2; border-radius: 14px;
  }
  .sched-export-type button {
    min-height: 44px; padding: 10px 18px; border-radius: 9px; border: 1px solid transparent;
    background: transparent; color: #52647c; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .sched-export-type button[aria-pressed=true] { background: #fff; border-color: #c4d7ef; color: #174f95; }
  .sched-export-filters {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;
    padding: 18px 20px; border: 1px solid #dce6f2; border-radius: 14px; background: #fff;
  }
  .sched-export-field { display: grid; gap: 6px; min-width: 0; }
  .sched-export-field label { font-size: 13px; font-weight: 600; color: #52647c; }
  .sched-export-field select, .sched-export-field input[type=date], .sched-export-search {
    height: 46px; width: 100%; border: 1px solid #cad8e8; border-radius: 9px; padding: 0 12px;
    background: #fbfcfe; color: #182b49; font-size: 15px;
  }
  .sched-export-btn, .sched-export-btn-quiet {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 44px; padding: 8px 16px; border-radius: 10px; cursor: pointer;
    font-size: 14px; font-weight: 700;
  }
  .sched-export-btn { border: 1px solid #1373d9; background: #1373d9; color: #fff; }
  .sched-export-btn:hover { background: #0c5bb3; }
  .sched-export-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .sched-export-btn-quiet { border: 1px solid #d8dee8; background: #fff; color: #1f2937; font-weight: 600; }
  .sched-export-btn-quiet:hover { background: #f8fafc; }
  .sched-export-picks-card {
    display: grid; gap: 14px; padding: 16px 20px;
    border: 1px solid #dce6f2; border-radius: 14px; background: #fff;
  }
  .sched-export-picks-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .sched-export-picks-head h2 { margin: 0; font-size: 16px; font-weight: 700; }
  .sched-export-count {
    display: inline-flex; align-items: center; min-height: 28px; padding: 2px 12px;
    border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 700;
  }
  .sched-export-search { max-width: 280px; }
  .sched-export-group { display: grid; gap: 8px; }
  .sched-export-group-head { display: flex; align-items: center; gap: 8px; }
  .sched-export-group-head h3 { margin: 0; font-size: 13px; font-weight: 700; color: #52647c; }
  .sched-export-group-head button {
    min-height: 32px; padding: 0 10px; border: 1px solid #d5e0ec; border-radius: 8px;
    background: #fff; color: #174f95; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .sched-export-picks { display: flex; flex-wrap: wrap; gap: 8px; }
  .sched-export-picks.is-teachers { max-height: 280px; overflow: auto; align-content: flex-start; }
  .sched-export-picks label {
    display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 4px 12px;
    border: 1px solid #d5e0ec; border-radius: 999px; background: #fff;
    color: #334155; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .sched-export-picks label.is-on { border-color: #bfdbfe; background: #eff6ff; color: #1d4ed8; }
  .sched-export-picks input { accent-color: #1373d9; }
  .sched-export-note { margin: 0; color: #52647c; font-size: 13px; }
  .sched-export-error {
    padding: 12px 14px; border: 1px solid #fecaca; border-radius: 12px;
    background: #fef2f2; color: #be123c; font-size: 13px; font-weight: 700;
  }
  .sched-export-preview { border: 1px solid #dce6f2; border-radius: 14px; background: #fff; overflow: auto; }
  .sched-print-head {
    display: flex; align-items: center; justify-content: center; gap: 16px; text-align: left;
    padding: 16px 20px; border-bottom: 1px solid #dce6f2; background: #f8fafc;
  }
  .sched-print-logo {
    width: 56px; height: 56px; border-radius: 12px; border: 1px solid #dce6f2;
    display: grid; place-items: center; overflow: hidden; flex-shrink: 0;
    background: #fff; font-size: 12px; font-weight: 700; color: #94a3b8;
  }
  .sched-print-logo img { width: 100%; height: 100%; object-fit: contain; }
  .sched-print-head h2 { margin: 0; font-size: 18px; font-weight: 700; color: #182b49; }
  .sched-print-head p { margin: 4px 0 0; font-size: 13px; font-weight: 600; color: #52647c; }
  .sched-print-scroll { overflow-x: auto; padding: 12px; }
  .sched-print-table { width: 100%; min-width: 880px; border-collapse: collapse; table-layout: fixed; font-size: 12px; color: #182b49; }
  .sched-print-table th, .sched-print-table td { border: 1px solid #dce6f2; padding: 6px 4px; text-align: center; vertical-align: middle; }
  .sched-print-table th { background: #eef2f6; color: #182b49; font-weight: 600; font-size: 13px; }
  .sched-print-table th .time { display: block; margin-top: 2px; font-size: 11px; font-weight: 500; color: #52647c; }
  .sched-print-table td.day-col { background: #f8fafc; color: #182b49; font-weight: 700; }
  .sched-print-table th.break-col, .sched-print-table td.break-col { background: #f3f6fb; color: #52647c; font-size: 12px; }
  .sched-print-table td.is-activity { background: #eff6ff; }
  .sched-print-table td.is-empty { color: #94a3b8; }
  .sched-print-cell { min-height: 36px; font-weight: 700; line-height: 1.35; }
  .sched-print-cell .sub { font-size: 11px; font-weight: 600; color: #64748b; }
  .sched-print-cell .meta { font-size: 12px; font-weight: 600; color: #334155; }
  .sched-print-sign {
    display: flex; justify-content: space-around; gap: 16px; text-align: center;
    margin: 8px 12px 16px; padding-top: 16px; border-top: 1px solid #dce6f2;
    font-size: 13px; color: #334155;
  }
  .sched-export-page :focus-visible { outline: 3px solid #1373d9; outline-offset: 2px; }
  @media (max-width: 720px) {
    .sched-export-head, .sched-export-filters, .sched-export-picks-card { padding: 16px; }
    .sched-export-head .sched-export-btn, .sched-export-search { width: 100%; max-width: none; }
    .sched-export-type { display: grid; grid-template-columns: 1fr 1fr; }
  }
  @media print {
    .sched-export-filters, .sched-export-actions, .sched-export-head, .sched-export-type, .sched-export-picks-card, .sched-export-error { display: none !important; }
    .sched-export-preview { border: none; }
  }
`

export default function ScheduleExportPage() {
  const [loading, setLoading] = useState(true)
  const [scheduleDays,setScheduleDays]=useState<number[]>([1,2,3,4,5])
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
  const [classIds, setClassIds] = useState<string[]>([])
  const [teacherIds, setTeacherIds] = useState<string[]>([])
  const [pickQuery, setPickQuery] = useState('')
  const [gridData, setGridData] = useState<Record<string, { line1: string; line2: string; line3?: string; line4?: string }>>({})
  const [semester, setSemester] = useState(() => String(scheduleSemesterForYear(null)))
  const [printDate, setPrintDate] = useState('')
  const selectedClass = classrooms.find(c => c.id === classroomId)
  const classLabel = (selectedClass?.label || '').replace(/^ป\.\s*/, 'ชั้นประถมศึกษาปีที่ ').replace(/^ม\.\s*/, 'ชั้นมัธยมศึกษาปีที่ ').replace(/^อ\.\s*/, 'ชั้นอนุบาลปีที่ ')
  const selectedTeacher = teachers.find(t => t.id === teacherId)
  const yearLabel = years.find(y => y.id === yearId)?.year_be || ''
  const title = exportType === 'class'
    ? `ตารางเรียน ภาคเรียนที่ ${semester} ปีการศึกษา ${yearLabel} ${classLabel}`
    : `ตารางสอน ภาคเรียนที่ ${semester} ปีการศึกษา ${yearLabel} ${selectedTeacher ? `${selectedTeacher.prefix} ${selectedTeacher.full_name}` : ''}`
  const [error, setError] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  const gridRequest = useRef(0)
  const [loadedContext, setLoadedContext] = useState('')
  const currentContext = `${exportType}:${yearId}:${semester}:${exportType === 'class' ? classroomId : teacherId}`
  const printMode = useRef(false)
  const [isPrintMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('print') === '1'
  })

  useEffect(()=>{if(!yearId)return;let active=true;fetchScheduleDays(yearId,Number(semester)).then(d=>{if(active)setScheduleDays(d)}).catch(()=>{});return()=>{active=false}},[yearId,semester])
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
      setSchoolName(scheduleSchoolName(ctx.school?.name))
      setSchoolLogoUrl(ctx.school?.logo_url || '')
      setPeriodTimes(ctx.periodTimes as PeriodTimeRow[])

      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
      setPrintDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))
      const isPrint = params?.get('print') === '1'
      const requestedTerm = params?.get('semester')
      const active = (initData.years as Year[]).find(y => y.is_active) || (initData.years as Year[])[0]
      const linkedYear = (initData.years as Year[]).find(y => y.id === params?.get('year')) || active
      if (requestedTerm === '1' || requestedTerm === '2') setSemester(requestedTerm)
      else if (linkedYear) setSemester(String(scheduleSemesterForYear(linkedYear)))

      if (isPrint && params) {
        const type = params.get('type') as ExportType | null
        if (type === 'class' || type === 'teaching') setExportType(type)
        if (params.get('year')) setYearId(params.get('year')!)
        else if (active) setYearId(active.id)
        if (params.get('classroom')) { setClassroomId(params.get('classroom')!); setClassIds([params.get('classroom')!]) }
        if (params.get('teacher')) { setTeacherId(params.get('teacher')!); setTeacherIds([params.get('teacher')!]) }
      } else {
        if (active) setYearId(active.id)
        if (initData.defaultTeacherId) { setTeacherId(initData.defaultTeacherId); setTeacherIds([initData.defaultTeacherId]) }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadClassGrid = useCallback(async () => {
    const request = ++gridRequest.current
    const [grid, subs] = await Promise.all([
      fetchClassScheduleGrid(classroomId, yearId, Number(semester)),
      fetchClassScheduleSubjects(classroomId, Number(semester)),
    ])
    const subjMap = Object.fromEntries(
      (subs as { id: string; label: string; subject_name?: string; subject_code?: string; teacher_name: string; room_name?: string }[]).map(s => [s.id, s]),
    )

    const data: Record<string, { line1: string; line2: string; line3?: string; line4?: string }> = {}
    for (const [key, cell] of Object.entries(grid as Record<string, { class_subject_id: string | null; note: string | null }>)) {
      const subj = cell.class_subject_id ? subjMap[cell.class_subject_id] : undefined
      const activity = isActivityLessonId(cell.class_subject_id)
      data[key] = subj ? {
        line1: subj.subject_name || subj.label || (activity ? 'กิจกรรม' : '—'),
        line2: subj.subject_code ? `(${subj.subject_code})` : activity ? '(กิจกรรม)' : '',
        line3: activity ? activityTeacherLabel(subj.teacher_name) : teacherGivenName(subj.teacher_name),
        line4: subj.room_name || '',
      } : { line1: cell.note || '—', line2: '' }
    }
    if (request !== gridRequest.current) return
    setError('')
    setGridData(data)
    setLoadedContext(`class:${yearId}:${semester}:${classroomId}`)
    setPreviewReady(true)
  }, [classroomId, yearId, semester])

  const loadTeachingGrid = useCallback(async () => {
    const request = ++gridRequest.current
    const grid = await fetchTeachingScheduleGrid(teacherId, yearId, Number(semester))

    const data: Record<string, { line1: string; line2: string; line3?: string; line4?: string }> = {}
    for (const [key, cell] of Object.entries(grid as Record<string, { room_line: string; subject_line: string }>)) {
      data[key] = teachingLines(cell.room_line, cell.subject_line)
    }
    if (request !== gridRequest.current) return
    setError('')
    setGridData(data)
    setLoadedContext(`teaching:${yearId}:${semester}:${teacherId}`)
    setPreviewReady(true)
  }, [teacherId, yearId, semester])

  const invalidateGridRequest = useCallback(() => { ++gridRequest.current }, [])
  useEffect(() => { void Promise.resolve().then(init) }, [init])

  useEffect(() => {
    if (!yearId) return
    let cancelled = false
    fetchScheduleClassrooms(yearId).then(list => {
      if (cancelled) return
      setClassrooms(list as Classroom[])
      setClassroomId(current => list.some(c => c.id === current) ? current : list[0]?.id || '')
      setClassIds(current => {
        const kept = current.filter(id => list.some(c => c.id === id))
        if (kept.length) return kept
        const preset = new URLSearchParams(window.location.search).get('classroom')
        const first = list.find(c => c.id === preset)?.id || list[0]?.id
        return first ? [first] : []
      })
    }).catch(() => { if (!cancelled) setError('โหลดห้องเรียนไม่สำเร็จ') })
    return () => { cancelled = true }
  }, [yearId])

  useEffect(() => {
    if (!yearId) return
    if (exportType === 'class' && classroomId) void Promise.resolve().then(loadClassGrid).catch(() => setError('โหลดตารางไม่สำเร็จ'))
    else if (exportType === 'teaching' && teacherId) void Promise.resolve().then(loadTeachingGrid).catch(() => setError('โหลดตารางไม่สำเร็จ'))
    return invalidateGridRequest
  }, [yearId, exportType, classroomId, teacherId, loadClassGrid, loadTeachingGrid, invalidateGridRequest])

  useEffect(() => {
    if (!printMode.current || !previewReady || loadedContext !== currentContext) return
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
  }, [previewReady, loadedContext, currentContext])

  function exportPdf() {
    const ids = exportType === 'class' ? classIds : teacherIds
    if (!ids.length || !yearId || !printDate) return
    setError('')
    const fileName = (exportType === 'class'
      ? ids.length === 1 ? `ตารางเรียน_${classrooms.find(c => c.id === ids[0])?.label || 'ห้อง'}` : `ตารางเรียน_${ids.length}_ห้อง`
      : ids.length === 1 ? `ตารางสอน_${teachers.find(t => t.id === ids[0])?.full_name || 'ครู'}` : `ตารางสอน_${ids.length}_คน`).replace(/[\\/:*?"<>|]/g, '-') + '.pdf'
    enqueueFileExport({
      fileName,
      label: exportType === 'class' ? `ตารางเรียน · ${ids.length} ห้อง` : `ตารางสอน · ${ids.length} คน`,
      run: async () => {
        const grids = await fetchSchedulePdfGrids(yearId, Number(semester), exportType, ids)
        const pages = ids.map(id => {
          if (exportType === 'class') {
            const room = classrooms.find(c => c.id === id)
            const label = (room?.label || '').replace(/^ป\.\s*/, 'ชั้นประถมศึกษาปีที่ ').replace(/^ม\.\s*/, 'ชั้นมัธยมศึกษาปีที่ ').replace(/^อ\.\s*/, 'ชั้นอนุบาลปีที่ ')
            return { title: `ตารางเรียน ภาคเรียนที่ ${semester} ปีการศึกษา ${yearLabel} ${label}`, gridData: grids[id] }
          }
          const teacher = teachers.find(t => t.id === id)
          return { title: `ตารางสอน ภาคเรียนที่ ${semester} ปีการศึกษา ${yearLabel} ${teacher ? `${teacher.prefix} ${teacher.full_name}` : ''}`, gridData: grids[id] }
        })
        return buildSchedulePdfBlob({ days: scheduleDays, pages, title: pages[0]?.title || title, gridData: pages[0]?.gridData || {}, periodTimes, schoolName, schoolLogoUrl, academicHeadName, directorName, directorPosition, printDate, fileName })
      },
    })
  }

  const periods = periodTimes.length ? periodTimes.filter(t=>!t.is_break).map(t=>t.period) : SCHEDULE_PERIODS
  const morning = periodTimes.length ? periodTimes.findIndex(t=>t.is_break) : SCHEDULE_MORNING_PERIODS
  const classGroups = useMemo(() => {
    const map = new Map<string, Classroom[]>()
    for (const room of classrooms) {
      const list = map.get(room.level) || []
      list.push(room)
      map.set(room.level, list)
    }
    const rank = (level: string) => {
      const n = Number(level.match(/\d+/)?.[0] || 99)
      if (level.startsWith('อ')) return n
      if (level.startsWith('ป')) return 10 + n
      if (level.startsWith('ม')) return 20 + n
      return 100 + n
    }
    return [...map.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([level, rooms]) => [level, [...rooms].sort((a, b) => a.room - b.room)] as const)
  }, [classrooms])
  const visibleTeachers = useMemo(() => {
    const query = pickQuery.trim().toLowerCase()
    if (!query) return teachers
    return teachers.filter(teacher => `${teacher.prefix} ${teacher.full_name}`.toLowerCase().includes(query))
  }, [teachers, pickQuery])
  const selectedCount = exportType === 'class' ? classIds.length : teacherIds.length
  const pdfReady = !loading && previewReady && loadedContext === currentContext && !error && selectedCount > 0 && !!printDate

  function applyClassIds(next: string[]) {
    setClassIds(next)
    if (!next.includes(classroomId)) setClassroomId(next[0] || '')
  }
  function applyTeacherIds(next: string[]) {
    setTeacherIds(next)
    if (!next.includes(teacherId)) setTeacherId(next[0] || '')
  }
  function toggleLevel(rooms: Classroom[]) {
    const ids = rooms.map(room => room.id)
    const allOn = ids.every(id => classIds.includes(id))
    applyClassIds(allOn ? classIds.filter(id => !ids.includes(id)) : [...new Set([...classIds, ...ids])])
  }

  function renderPrintCell(day: number, period: number) {
    const cell = gridData[`${day}-${period}`]
    const activity = cell?.line2 === '(กิจกรรม)' || cell?.line1 === 'กิจกรรม'
    const empty = !cell?.line1 || cell.line1 === '—'
    return (
      <td key={period} className={activity ? 'is-activity' : empty ? 'is-empty' : undefined}>
        <div className="sched-print-cell">
          {cell?.line1 || '—'}
          {cell?.line2 ? <div className="sub">{cell.line2}</div> : null}
          {cell?.line3 ? <div className="meta">{cell.line3}</div> : null}
          {cell?.line4 ? <div className="meta">{cell.line4}</div> : null}
        </div>
      </td>
    )
  }

  if (loading) return <div className="sched-export-note" style={{ padding: 28, textAlign: 'center' }}>กำลังโหลด...</div>

  return (
    <>
      <style>{STYLES}</style>
      <div className="sched-export-page">
        <div className="sched-export-head">
          <div>
            <span className="sched-export-kicker">ตารางเรียนและตารางสอน</span>
            <h1>พิมพ์ตาราง</h1>
            <p>เลือกห้องหรือครู แล้วส่งออก PDF พร้อมหัวกระดาษโรงเรียน</p>
          </div>
          <button type="button" className="sched-export-btn" disabled={!pdfReady} onClick={exportPdf}>
            บันทึก PDF {exportType === 'class' ? `${classIds.length} ห้อง` : `${teacherIds.length} คน`}
          </button>
        </div>

        <div className="sched-export-type" role="group" aria-label="ประเภทตาราง">
          <button type="button" aria-pressed={exportType === 'class'} onClick={() => { setExportType('class'); setPickQuery('') }}>ตารางเรียน</button>
          <button type="button" aria-pressed={exportType === 'teaching'} onClick={() => { setExportType('teaching'); setPickQuery('') }}>ตารางสอน</button>
        </div>

        <div className="sched-export-filters">
          <div className="sched-export-field">
            <label htmlFor="schedule-year">ปีการศึกษา</label>
            <select id="schedule-year" value={yearId} onChange={e => setYearId(e.target.value)}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}</option>
              ))}
            </select>
          </div>
          <div className="sched-export-field">
            <label htmlFor="schedule-semester">ภาคเรียน</label>
            <select id="schedule-semester" value={semester} onChange={e => setSemester(e.target.value)}>
              <option value="1">ภาคเรียนที่ 1</option>
              <option value="2">ภาคเรียนที่ 2</option>
            </select>
          </div>
          <div className="sched-export-field">
            <label htmlFor="schedule-print-date">วันที่พิมพ์บนเอกสาร</label>
            <input id="schedule-print-date" type="date" required min="0001-01-01" max="9999-12-31" value={printDate} onChange={e => setPrintDate(e.target.validity.valid ? e.target.value : '')} aria-describedby="schedule-print-date-note" />
            <p id="schedule-print-date-note" className="sched-export-note">{printDate ? `${formatThaiDate(printDate)} · ใช้กับทุกหน้าที่เลือก` : 'เลือกวันที่ก่อนบันทึก PDF'}</p>
          </div>
          {exportType === 'class' ? (
            <div className="sched-export-field">
              <label htmlFor="schedule-preview-room">ดูตัวอย่างห้อง</label>
              <select id="schedule-preview-room" value={classroomId} onChange={e => setClassroomId(e.target.value)}>
                {classrooms.filter(c => classIds.includes(c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sched-export-field">
              <label htmlFor="schedule-preview-teacher">ดูตัวอย่างครู</label>
              <select id="schedule-preview-teacher" value={teacherId} onChange={e => setTeacherId(e.target.value)}>
                {teachers.filter(t => teacherIds.includes(t.id)).map(t => (
                  <option key={t.id} value={t.id}>{t.prefix} {t.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <section className="sched-export-picks-card">
          <div className="sched-export-picks-head">
            <h2>{exportType === 'class' ? 'ห้องที่จะพิมพ์' : 'ครูที่จะพิมพ์'}</h2>
            <span className="sched-export-count">{selectedCount} รายการ</span>
            <button type="button" className="sched-export-btn-quiet" onClick={() => exportType === 'class' ? applyClassIds(classrooms.map(c => c.id)) : applyTeacherIds(teachers.map(t => t.id))}>เลือกทั้งหมด</button>
            <button type="button" className="sched-export-btn-quiet" onClick={() => exportType === 'class' ? applyClassIds(classroomId ? [classroomId] : []) : applyTeacherIds(teacherId ? [teacherId] : [])}>เหลือรายการที่ดูอยู่</button>
            {exportType === 'teaching' && (
              <input className="sched-export-search" value={pickQuery} onChange={e => setPickQuery(e.target.value)} placeholder="ค้นหาชื่อครู" aria-label="ค้นหาชื่อครู" />
            )}
          </div>
          {exportType === 'class' ? classGroups.map(([level, rooms]) => (
            <div className="sched-export-group" key={level}>
              <div className="sched-export-group-head">
                <h3>{level}</h3>
                <button type="button" onClick={() => toggleLevel(rooms)}>{rooms.every(room => classIds.includes(room.id)) ? 'เอาทั้งชั้นออก' : 'เลือกทั้งชั้น'}</button>
              </div>
              <div className="sched-export-picks">
                {rooms.map(room => (
                  <label key={room.id} className={classIds.includes(room.id) ? 'is-on' : undefined}>
                    <input type="checkbox" checked={classIds.includes(room.id)} onChange={() => applyClassIds(classIds.includes(room.id) ? classIds.filter(id => id !== room.id) : [...classIds, room.id])} />
                    {room.label}
                  </label>
                ))}
              </div>
            </div>
          )) : (
            <div className="sched-export-picks is-teachers">
              {visibleTeachers.map(teacher => (
                <label key={teacher.id} className={teacherIds.includes(teacher.id) ? 'is-on' : undefined}>
                  <input type="checkbox" checked={teacherIds.includes(teacher.id)} onChange={() => applyTeacherIds(teacherIds.includes(teacher.id) ? teacherIds.filter(id => id !== teacher.id) : [...teacherIds, teacher.id])} />
                  {teacher.prefix} {teacher.full_name}
                </label>
              ))}
              {!visibleTeachers.length && <p className="sched-export-note">ไม่พบครูที่ค้นหา</p>}
            </div>
          )}
        </section>

        {error && <div className="sched-export-error" role="alert">{error}</div>}

        {loadedContext !== currentContext ? <p className="sched-export-note">กำลังโหลดตาราง...</p> : <div className="sched-export-preview">
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
              {printDate && <p>พิมพ์วันที่ {formatThaiDate(printDate)}</p>}
            </div>
          </header>

          <div className="sched-print-scroll">
          <table className="sched-print-table">
            <thead>
              <tr>
                <th>วัน</th>
                {periods.slice(0, morning).map(p => (
                  <th key={p}>
                    คาบ {p}
                    {periodTimes.length ? <span className="time">{periodTimeLabel(periodTimes, p)}</span> : null}
                  </th>
                ))}
                <th className="break-col">พักเที่ยง</th>
                {periods.slice(morning).map(p => (
                  <th key={p}>
                    คาบ {p}
                    {periodTimes.length ? <span className="time">{periodTimeLabel(periodTimes, p)}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCHEDULE_DAYS.filter(d=>scheduleDays.includes(d.value)).map(day => (
                <tr key={day.value}>
                  <td className="day-col">{day.label}</td>
                  {periods.slice(0, morning).map(p => renderPrintCell(day.value, p))}
                  <td className="break-col">พัก</td>
                  {periods.slice(morning).map(p => renderPrintCell(day.value, p))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="sched-print-sign">
            {[{name:academicHeadName,role:'หัวหน้าวิชาการ'},{name:directorName,role:directorPosition}].map(s=><div key={s.role}>
              <p>ลงชื่อ ........................................................</p><p>({s.name || '........................................................'})</p><p>{s.role}</p><p>วันที่ ........../........../..........</p>
            </div>)}
          </div>
        </div>}
      </div>
    </>
  )
}
