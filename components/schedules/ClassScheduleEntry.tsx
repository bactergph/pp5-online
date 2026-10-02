'use client'

import { SCHEDULE_PRESENTATION } from './schedule-presentation'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  fetchClassScheduleBundle,
  fetchScheduleClassrooms,
  fetchScheduleInit,
  saveClassScheduleCell,
  clearClassSchedule,
  copyClassSchedule,
  fetchPeriodTimes,
  fetchScheduleQuotas,
  getTeacherConflictAt,
  runAutoScheduleClass,
  runAutoScheduleSchool,
  toggleScheduleCellLock,
} from '@/app/schedules/actions'
import type { PeriodTimeRow } from '@/lib/schedule-helpers'
import AppAlertModal from '@/components/AppAlertModal'
import ScheduleLessonPicker from './ScheduleLessonPicker'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import ScheduleGridTable from '@/components/schedules/ScheduleGridTable'
import ScheduleQuotaPanel from '@/components/schedules/ScheduleQuotaPanel'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = { id: string; level: string; room: number; label: string }
type SubjectOption = {
  id: string
  teacher_id: string | null
  subject_code: string
  subject_name: string
  teacher_name: string
  label: string
}
type Cell = { class_subject_id: string | null; note: string | null; locked: boolean }
type QuotaData = {
  items: { class_subject_id: string; code: string; name: string; target: number; used: number; remaining: number }[]
  filled: number
  totalTarget: number
}

type Props = {
  mode: 'view' | 'manage'
}

const STYLES = `
.class-schedule-workspace {--ink:#172b3a;--muted:#596b79;--edge:#cbd5df;--accent:#235c78;display:grid;gap:16px;min-width:0;color:var(--ink);}
.class-schedule-workspace * {box-sizing:border-box;}
.class-schedule-workspace .schedule-head {display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:4px 0 8px;}
.class-schedule-workspace .schedule-head h1 {margin:0;font-size:25px;font-weight:700;color:#111827;}
.class-schedule-workspace .schedule-head p {margin:6px 0 0;font-size:13px;line-height:1.6;color:var(--muted);}
.class-schedule-workspace .schedule-head-actions {display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.class-schedule-workspace .schedule-tabs {display:flex;border-bottom:1px solid var(--edge);gap:18px;}
.class-schedule-workspace .schedule-tab {padding:10px 0;color:var(--muted);text-decoration:none;font-size:13px;font-weight:600;border-bottom:2px solid transparent;}
.class-schedule-workspace .schedule-tab.is-active {color:var(--accent);border-color:var(--accent);}
.class-schedule-workspace .schedule-filters {display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:18px;background:#fff;border:1px solid var(--edge);border-radius:10px;padding:18px 20px;}
.class-schedule-workspace .schedule-field {display:grid;gap:7px;min-width:0;}
.class-schedule-workspace .schedule-field label {font-size:12px;font-weight:600;color:#34485a;}
.class-schedule-workspace .schedule-field select {width:100%;height:42px;padding:0 12px;border:1px solid #b9c7d2;border-radius:7px;background:#fff;font:inherit;font-size:14px;color:var(--ink);}
.class-schedule-workspace .schedule-toolbar {display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
.class-schedule-workspace .schedule-main-actions {display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.class-schedule-workspace .schedule-toolbar-btn {display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:9px 14px;background:#fff;border:1px solid #b9c7d2;border-radius:7px;font:inherit;font-size:13px;font-weight:600;color:#243e50;text-decoration:none;cursor:pointer;}
.class-schedule-workspace .schedule-toolbar-btn.primary {background:var(--accent);border-color:var(--accent);color:#fff;}
.class-schedule-workspace .schedule-toolbar-btn:hover:not(:disabled) {background:#edf3f7;}
.class-schedule-workspace .schedule-toolbar-btn.primary:hover:not(:disabled) {background:#17465f;}
.class-schedule-workspace .schedule-toolbar-btn.danger {color:#a32c32;border-color:#e7b8bb;}
.class-schedule-workspace .schedule-save-status {font-size:12px;color:#377056;display:flex;align-items:center;gap:6px;}
.class-schedule-workspace .schedule-save-status::before {content:'';width:6px;height:6px;background:currentColor;border-radius:50%;}
.class-schedule-workspace .schedule-more-actions {position:relative;}
.class-schedule-workspace .schedule-more-actions summary {list-style:none;cursor:pointer;}
.class-schedule-workspace .schedule-more-actions summary::-webkit-details-marker {display:none;}
.class-schedule-workspace .schedule-more-panel {position:absolute;right:0;top:48px;z-index:10;display:grid;gap:14px;width:300px;background:#fff;border:1px solid var(--edge);border-radius:10px;padding:18px;box-shadow:0 10px 30px #172b3a20;}
.class-schedule-workspace .schedule-more-panel label {display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.6;}
.class-schedule-workspace .schedule-more-panel input {margin-top:4px;accent-color:var(--accent);}
.class-schedule-workspace .schedule-more-panel p {margin:0;font-size:12px;line-height:1.7;color:var(--muted);}
.class-schedule-workspace .schedule-grid-card {background:#fff;border:1px solid #b7c5d1;border-radius:10px;overflow:hidden;min-width:0;}
.class-schedule-workspace .schedule-grid-heading {display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 18px;border-bottom:1px solid var(--edge);}
.class-schedule-workspace .schedule-grid-heading h2 {margin:0;font-size:16px;font-weight:600;color:#111827;}
.class-schedule-workspace .schedule-grid-heading p {margin:4px 0 0;font-size:12px;color:var(--muted);}
.class-schedule-workspace .schedule-grid-scroll {overflow:auto;max-width:100%;}
.class-schedule-workspace .schedule-grid-table {width:100%;min-width:880px;table-layout:fixed;border-collapse:collapse;}
.class-schedule-workspace .schedule-grid-table :is(th,td) {border:1px solid #b9c7d2;}
.class-schedule-workspace .schedule-grid-table th {padding:13px 6px;background:#e0e9f0;color:#000;font-size:14px;font-weight:600;}
.class-schedule-workspace .schedule-grid-table th.col-day {width:76px;min-width:76px;background:#dce6ee;}
.class-schedule-workspace .schedule-grid-table th.col-period {min-width:0;}
.class-schedule-workspace .schedule-grid-table .period-time {font-size:11px;color:#334a5b;font-weight:400;margin-top:5px;}
.class-schedule-workspace .schedule-grid-table .day-col {background:#edf2f6;color:#172b3a;font-size:13px;font-weight:600;padding:12px 6px;}
.class-schedule-workspace .schedule-grid-table :is(.col-break,.break-col) {width:32px;min-width:32px;background:#f4eedf;color:#615137;font-size:12px;font-weight:400;}
.class-schedule-workspace .schedule-grid-table td.cell {height:100px;min-width:0;padding:7px;vertical-align:top;background:#fff;}
.class-schedule-workspace .schedule-cell-edit {position:relative;min-height:84px;}
.class-schedule-workspace .schedule-cell-top {position:relative;}
.class-schedule-workspace .schedule-cell-choice {width:100%;min-height:58px;display:flex;flex-direction:column;gap:3px;text-align:left;padding:7px 23px 6px 7px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--ink);font:inherit;line-height:1.5;cursor:pointer;}
.class-schedule-workspace .schedule-cell-choice:hover:not(:disabled) {background:#edf4f9;border-color:#a7c5d8;}
.class-schedule-workspace .schedule-cell-choice.activity {background:#e8f3eb;border-color:#c4ddcc;color:#245b3b;}
.class-schedule-workspace .schedule-cell-choice.locked {background:#f0f2f5;border-color:#d7dfe5;}
.class-schedule-workspace .schedule-subject-code {font-size:10px;font-weight:400;color:#586d7b;}
.class-schedule-workspace .schedule-subject-name {font-size:13px;font-weight:600;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;}
.class-schedule-workspace .schedule-empty-label {font-size:12px;color:#687d8d;font-weight:400;}
.class-schedule-workspace .schedule-lock-btn {position:absolute;top:5px;right:2px;display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:4px;background:transparent;color:#8799a6;cursor:pointer;}
.class-schedule-workspace .schedule-lock-btn:hover {background:#e2eaf0;color:#243e50;}
.class-schedule-workspace .schedule-lock-btn.is-locked {background:#dde6ed;color:#36556c;}
.class-schedule-workspace .schedule-teacher-line {padding:2px 7px;font-size:11px;line-height:1.5;color:#566b7a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.class-schedule-workspace .schedule-teacher-line.is-missing {color:#986325;}
.class-schedule-workspace .schedule-conflict-warn {font-size:11px;color:#a32c32;padding:2px 7px;}
.class-schedule-workspace .schedule-cell-edit.is-conflict .schedule-cell-choice {border-color:#ce7e82;background:#fff0f1;}
.class-schedule-workspace .schedule-grid-footer {display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 18px;border-top:1px solid var(--edge);font-size:12px;color:var(--muted);}
.class-schedule-workspace .schedule-legend {display:flex;gap:16px;flex-wrap:wrap;}
.class-schedule-workspace .schedule-legend span {display:inline-flex;align-items:center;gap:6px;}
.class-schedule-workspace .legend-dot {width:8px;height:8px;border-radius:2px;background:#c4ddcc;}
.class-schedule-workspace .legend-dot.locked {background:#b4c4d0;}
.class-schedule-workspace .schedule-quota-details {background:#fff;border:1px solid var(--edge);border-radius:8px;padding:15px 18px;overflow:auto;}
.class-schedule-workspace .schedule-quota-details summary {cursor:pointer;font-size:13px;font-weight:600;color:#2b4659;}
.class-schedule-workspace .schedule-quota-details summary span {margin-left:12px;font-size:12px;font-weight:400;color:var(--muted);}
.class-schedule-workspace .schedule-quota-details[open] summary {margin-bottom:16px;}
.class-schedule-workspace .quota-table th {color:#000;background:#e0e9f0;font-size:13px;}
.class-schedule-workspace .quota-panel {min-width:560px;border-radius:6px;}
.class-schedule-workspace .schedule-empty {padding:40px 20px;border:1px dashed var(--edge);border-radius:8px;text-align:center;background:#fff;color:var(--muted);font-size:14px;}
.class-schedule-workspace .cell-view {display:flex;flex-direction:column;gap:4px;text-align:left;padding:8px;font-size:13px;min-height:84px;border:1px solid transparent;border-radius:5px;line-height:1.5;}
.class-schedule-workspace .cell-view.activity {background:#e8f3eb;border-color:#c4ddcc;color:#245b3b;}
.class-schedule-workspace .cell-view.locked {background:#f0f2f5;border-color:#d7dfe5;}
.class-schedule-workspace .cell-view.empty {justify-content:center;align-items:center;color:#8293a1;font-size:12px;}
.class-schedule-workspace .cell-view .cell-tchr {margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.class-schedule-workspace .cell-subj {font-weight:600;}.class-schedule-workspace .cell-tchr {font-size:11px;color:var(--muted);}
.class-schedule-workspace :is(button,select,a,summary):focus-visible {outline:3px solid #75a9c7;outline-offset:3px;}
.class-schedule-workspace :is(button,select):disabled {opacity:.55;cursor:not-allowed;}
.copy-modal-backdrop {position:fixed;inset:0;z-index:9000;display:grid;place-items:center;padding:24px;background:#172b3a55;}
.copy-modal {width:min(100%,420px);padding:24px;border-radius:12px;background:#fff;color:#172b3a;box-shadow:0 18px 60px #172b3a30;}
.copy-modal h3 {margin:0 0 18px;font-size:18px;font-weight:600;}
.copy-modal .schedule-field {display:grid;gap:8px;}.copy-modal label {font-size:13px;}
.copy-modal select {width:100%;height:42px;border:1px solid #b9c7d2;border-radius:6px;padding:0 10px;font:inherit;}
.copy-modal-actions {display:flex;justify-content:flex-end;gap:8px;margin-top:20px;}
.copy-modal .schedule-toolbar-btn {padding:9px 14px;border:1px solid #b9c7d2;border-radius:6px;background:#fff;color:#243e50;font:inherit;font-size:13px;cursor:pointer;}
.copy-modal .schedule-toolbar-btn.primary {background:#235c78;color:#fff;border-color:#235c78;}
@media(max-width:700px) {.class-schedule-workspace .schedule-filters {grid-template-columns:1fr 1fr;padding:16px;gap:12px;}.class-schedule-workspace .schedule-field:last-child {grid-column:1/-1;}.class-schedule-workspace .schedule-head h1 {font-size:22px;}.class-schedule-workspace .schedule-head-actions {width:100%;justify-content:space-between;}.class-schedule-workspace .schedule-toolbar {align-items:flex-start;}.class-schedule-workspace .schedule-main-actions {width:100%;}.class-schedule-workspace .schedule-main-actions button {flex:1;}.class-schedule-workspace .schedule-main-actions .schedule-save-status {flex-basis:100%;}.class-schedule-workspace .schedule-more-panel {left:0;right:auto;width:min(300px,calc(100vw - 48px));}}
`

export default function ClassScheduleEntry({ mode }: Props) {
  const pathname = usePathname()
  const isManage = mode === 'manage'
  const [picker, setPicker] = useState<{day:number;period:number} | null>(null)
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<Year[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [quotas, setQuotas] = useState<QuotaData | null>(null)
  const [periodTimes, setPeriodTimes] = useState<PeriodTimeRow[]>([])
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({})
  const [selectedYear, setSelectedYear] = useState('')
  const [semester, setSemester] = useState(1)
  const [selectedClass, setSelectedClass] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [gridLoading, setGridLoading] = useState(false)
  const [loadedContext, setLoadedContext] = useState('')
  const [rebuild, setRebuild] = useState(false)
  const gridRequest = useRef(0)
  const roomRequest = useRef(0)
  const blocked = !!busyAction || !!savingKey || gridLoading || loadedContext !== `${selectedYear}:${semester}:${selectedClass}`
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyFromClass, setCopyFromClass] = useState('')
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message?: string } | null>(null)

  const subjectMap = useMemo(
    () => Object.fromEntries(subjects.map(s => [s.id, s])),
    [subjects],
  )

  const selectedClassroom = classrooms.find(c => c.id === selectedClass)
  const selectedYearObj = years.find(y => y.id === selectedYear)
  const copySourceClassrooms = classrooms.filter(c => c.id !== selectedClass)

  async function init() {
    try {
      const [data, periodData] = await Promise.all([
        fetchScheduleInit(),
        fetchPeriodTimes(),
      ])
      setCanEdit(data.canEdit)
      setYears(data.years as Year[])
      setPeriodTimes(periodData.times as PeriodTimeRow[])
      const active = (data.years as Year[]).find(y => y.is_active) || (data.years as Year[])[0]
      if (active) setSelectedYear(active.id)
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setLoading(false)
    }
  }

  async function loadClassrooms(yearId: string) {
    const request = ++roomRequest.current
    ++gridRequest.current
    setSelectedClass(''); setCells({}); setSubjects([]); setQuotas(null)
    try {
      const list = await fetchScheduleClassrooms(yearId) as Classroom[]
      if (request !== roomRequest.current) return
      setClassrooms(list)
      setSelectedClass(list[0]?.id || '')
    } catch (e) { setAlert({ type: 'error', title: 'โหลดห้องเรียนไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' }) }
  }

  const loadGrid = useCallback(async () => {
    const request = ++gridRequest.current
    setGridLoading(true)
    try {
    const bundle = await fetchClassScheduleBundle(selectedClass, selectedYear, semester)
    if (request !== gridRequest.current) return
    setCells(bundle.grid)
    setSubjects(bundle.subjects)
    setQuotas(bundle.quotas)
    setConflicts(bundle.warnings)
    setLoadedContext(`${selectedYear}:${semester}:${selectedClass}`)
    } catch (e) {
      if (request === gridRequest.current) {
        setLoadedContext('')
        setAlert({ type: 'error', title: 'โหลดตารางไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
      }
    } finally { if (request === gridRequest.current) setGridLoading(false) }
  }, [selectedClass, selectedYear, semester])

  useEffect(() => { void Promise.resolve().then(init) }, [])
  useEffect(() => {
    if (!selectedYear) return
    void Promise.resolve().then(() => loadClassrooms(selectedYear))
  }, [selectedYear])
  useEffect(() => {
    if (!selectedClass || !selectedYear) return
    void Promise.resolve().then(loadGrid)
  }, [loadGrid, selectedClass, selectedYear])

  async function handleCellChange(day: number, period: number, value: string) {
    const key = `${day}-${period}`
    const cell = cells[key]
    if (cell?.locked) return

    const classSubjectId = value || null
    const prev = cells[key]
    setCells(current => ({
      ...current,
      [key]: { ...current[key], class_subject_id: classSubjectId, note: null },
    }))
    setSavingKey(key)
    try {
      const saved = await saveClassScheduleCell(selectedClass, selectedYear, day, period, classSubjectId, null, semester)
      if (saved.error) throw new Error(saved.error)
      if (isManage) {
        const quotaData = await fetchScheduleQuotas(selectedClass, selectedYear, semester)
        setQuotas(quotaData as QuotaData)
      }
      if (classSubjectId) {
        const subj = subjectMap[classSubjectId]
        if (subj?.teacher_id) {
          const result = await getTeacherConflictAt(
            selectedYear, subj.teacher_id, day, period, selectedClass, semester,
          )
          setConflicts(current => {
            const next = { ...current }
            if (result.busy) next[key] = result.rooms
            else delete next[key]
            return next
          })
        } else {
          setConflicts(current => {
            const next = { ...current }
            delete next[key]
            return next
          })
        }
      } else {
        setConflicts(current => {
          const next = { ...current }
          delete next[key]
          return next
        })
      }
    } catch (e) {
      setCells(current => ({ ...current, [key]: prev }))
      setAlert({
        type: 'error',
        title: 'บันทึกไม่สำเร็จ',
        message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด',
      })
    } finally {
      setSavingKey(null)
    }
  }

  async function handleToggleLock(day: number, period: number) {
    const key = `${day}-${period}`
    setSavingKey(key)
    try {
      const response = await toggleScheduleCellLock(selectedClass, selectedYear, day, period, semester)
      if (response.error || !response.data) throw new Error(response.error || 'บันทึกไม่สำเร็จ')
      const result = response.data
      setCells(current => ({
        ...current,
        [key]: {
          class_subject_id: current[key]?.class_subject_id ?? null,
          note: current[key]?.note ?? null,
          locked: result.locked,
        },
      }))
    } catch (e) {
      setAlert({
        type: 'error',
        title: 'ล็อกไม่สำเร็จ',
        message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด',
      })
    } finally {
      setSavingKey(null)
    }
  }

  async function handleAutoSchedule(wholeSchool = false) {
    if (!window.confirm(`${wholeSchool ? 'จัดตารางทั้งโรงเรียน' : 'จัดตารางห้องนี้'}: ${rebuild ? 'จัดรายวิชาที่ไม่ล็อกใหม่ (เก็บกิจกรรม)ทั้งหมด' : 'เติมเฉพาะช่องว่าง'} โดยตรวจครูไม่ชนกัน?`)) return
    setBusyAction('auto')
    try {
      const response = wholeSchool
        ? await runAutoScheduleSchool(selectedYear, rebuild, semester)
        : await runAutoScheduleClass(selectedClass, selectedYear, 'spread', rebuild, semester)
      if (response.error || !response.data) throw new Error(response.error || 'จัดตารางไม่สำเร็จ')
      const result = response.data
      await loadGrid()
      setAlert({ type: 'success', title: 'จัดตารางครบตามโควต้า', message: `${wholeSchool ? `${result.classrooms} ห้องเรียน` : 'ห้องนี้'} · เพิ่ม ${result.assigned} คาบ · ตรวจครูไม่ชนกันแล้ว${result.skipped.length ? `\nข้ามห้องที่ยังไม่กำหนดรายวิชา/กิจกรรม: ${result.skipped.join(', ')}` : ''}` })
    } catch (e) {
      setAlert({ type: 'error', title: 'จัดตารางไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleClear() {
    if (!window.confirm('ล้างตารางห้องนี้? (คาบที่ล็อกจะไม่ถูกลบ)')) return
    setBusyAction('clear')
    try {
      const result = await clearClassSchedule(selectedClass, selectedYear, semester)
      if (result.error) throw new Error(result.error)
      await loadGrid()
      setAlert({ type: 'success', title: 'ล้างตารางสำเร็จ' })
    } catch (e) {
      setAlert({ type: 'error', title: 'ล้างไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleCopy() {
    if (!copyFromClass) return
    setBusyAction('copy')
    try {
      const response = await copyClassSchedule(copyFromClass, selectedClass, selectedYear, semester)
      if (response.error || !response.data) throw new Error(response.error || 'คัดลอกไม่สำเร็จ')
      const result = response.data
      setCopyOpen(false)
      await loadGrid()
      setAlert({ type: 'success', title: 'คัดลอกสำเร็จ', message: `คัดลอก ${result.copied} คาบ` })
    } catch (e) {
      setAlert({ type: 'error', title: 'คัดลอกไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setBusyAction(null)
    }
  }

  function renderCellView(cell: Cell | undefined) {
    if (!cell?.class_subject_id) return <span>{cell?.note || 'คาบว่าง'}</span>
    const subj = subjectMap[cell.class_subject_id]
    if (!subj) return <span>—</span>
    const activity = cell.class_subject_id.startsWith('activity:')
    return (
      <>
        <span className="schedule-subject-code">{activity ? 'กิจกรรมพัฒนาผู้เรียน' : subj.subject_code}</span>
        <span className="schedule-subject-name" title={subj.label}>{subj.subject_name}</span>
        {!activity && <span className="cell-tchr" title={subj.teacher_name}>{subj.teacher_name || 'ยังไม่กำหนดครูผู้สอน'}</span>}
      </>
    )
  }

  function teacherLine(classSubjectId: string | null | undefined) {
    if (!classSubjectId) return null
    const subj = subjectMap[classSubjectId]
    if (!subj) return null
    if (classSubjectId.startsWith('activity:')) return null
    const missing = !subj.teacher_name
    return (
      <div className={`schedule-teacher-line${missing ? ' is-missing' : ''}`}>
        {subj.teacher_name || 'ยังไม่กำหนดครู — ไปที่จัดครูเข้าสอน'}
      </div>
    )
  }

  const viewHref = '/schedules/class'
  const manageHref = '/schedules/class/manage'

  if (loading) {
    return <div className="schedule-empty">กำลังโหลด...</div>
  }

  return (
    <>
      <style>{STYLES + SCHEDULE_PRESENTATION}</style>
      <div className="schedule-page class-schedule-workspace">
        <div className="schedule-head">
          <div>
            <h1>{isManage ? 'จัดการตารางเรียน' : 'ตารางเรียน'}</h1>
            <p>
              {selectedClassroom && selectedYearObj
                ? `ห้อง ${selectedClassroom.label} · ภาคเรียนที่ ${semester} · ปีการศึกษา พ.ศ. ${selectedYearObj.year_be}`
                : isManage
                  ? 'กำหนดวิชาในแต่ละคาบ — ครูผู้สอนดึงจากข้อมูลจัดครูเข้าสอน'
                  : 'ดูตารางเรียนรายห้อง'}
            </p>
          </div>
          <div className="schedule-head-actions">
          {canEdit && (
            <div className="schedule-tabs">
              <Link href={viewHref} className={`schedule-tab ${pathname.endsWith('/manage') ? '' : 'is-active'}`}>
                ดูตารางเรียน
              </Link>
              <Link href={manageHref} className={`schedule-tab ${pathname.endsWith('/manage') ? 'is-active' : ''}`}>
                จัดการตารางเรียน
              </Link>
            </div>
          )}
          {selectedClass && <Link className="schedule-toolbar-btn" aria-disabled={blocked} onClick={e => { if (blocked) e.preventDefault() }} href={`/export/schedules?print=1&type=class&year=${selectedYear}&semester=${semester}&classroom=${selectedClass}`}>พิมพ์ / PDF</Link>}
          </div>
        </div>

        <div className="schedule-filters">
          <div className="schedule-field">
            <label htmlFor="schedule-year">ปีการศึกษา</label>
            <select id="schedule-year" disabled={!!busyAction || !!savingKey} value={selectedYear} onChange={e => { setPicker(null); setSelectedYear(e.target.value) }}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="schedule-field">
            <label htmlFor="schedule-term">ภาคเรียน</label>
            <select id="schedule-term" disabled={!!busyAction || !!savingKey} value={semester} onChange={e => { setPicker(null); setSemester(Number(e.target.value)) }}>
              <option value={1}>ภาคเรียนที่ 1</option>
              <option value={2}>ภาคเรียนที่ 2</option>
            </select>
          </div>

          <div className="schedule-field">
            <label htmlFor="schedule-class">ห้องเรียน</label>
            <select id="schedule-class" disabled={!!busyAction || !!savingKey} value={selectedClass} onChange={e => { setPicker(null); setSelectedClass(e.target.value) }}>
              {classrooms.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {isManage && canEdit && selectedClass && (
          <div className="schedule-toolbar">
            <div className="schedule-main-actions">
              <button type="button" className="schedule-toolbar-btn primary" disabled={blocked} onClick={() => handleAutoSchedule(false)}>{busyAction === 'auto' ? 'กำลังจัดตาราง...' : 'จัดอัตโนมัติห้องนี้'}</button>
              <button type="button" className="schedule-toolbar-btn" disabled={blocked} onClick={() => handleAutoSchedule(true)}>จัดทั้งโรงเรียน</button>
              <span className="schedule-save-status" role="status">{savingKey ? 'กำลังบันทึก...' : busyAction ? 'กำลังดำเนินการ...' : gridLoading ? 'กำลังโหลด...' : blocked ? 'รอข้อมูลตาราง' : 'บันทึกอัตโนมัติ'}</span>
            </div>
            <details className="schedule-more-actions">
              <summary className="schedule-toolbar-btn">เครื่องมือเพิ่มเติม ▾</summary>
              <div className="schedule-more-panel">
                <label><input type="checkbox" checked={rebuild} disabled={blocked} onChange={e => setRebuild(e.target.checked)} /> จัดรายวิชาที่ไม่ล็อกใหม่</label>
                <p>{rebuild ? 'จัดรายวิชาใหม่ โดยเก็บคาบที่ล็อกและกิจกรรมไว้' : 'จัดอัตโนมัติจะเติมเฉพาะช่องว่าง'} · เว้นคาบสุดท้ายไว้เมื่อทำได้</p>
                <button type="button" className="schedule-toolbar-btn" disabled={blocked || copySourceClassrooms.length === 0} onClick={() => { setCopyFromClass(copySourceClassrooms[0]?.id || ''); setCopyOpen(true) }}>คัดลอกจากห้องอื่น</button>
                <button type="button" className="schedule-toolbar-btn danger" disabled={blocked} onClick={handleClear}>{busyAction === 'clear' ? 'กำลังล้าง...' : 'ล้างคาบที่ไม่ล็อกของห้องนี้'}</button>
              </div>
            </details>
          </div>
        )}


        {gridLoading && <div role="status">กำลังโหลดตารางเรียน...</div>}

        {!selectedClass ? (
          <div className="schedule-empty">ไม่พบห้องเรียนในปีการศึกษานี้</div>
        ) : subjects.length === 0 ? (
          <div className="schedule-empty">
            ห้องนี้ยังไม่มีรายวิชาเปิดสอน —{' '}
            <Link href="/settings/class-subjects">ไปกำหนดรายวิชาและครูผู้สอน</Link>
          </div>
        ) : (
          <section className="schedule-grid-card" aria-label="ตารางเรียนรายสัปดาห์">
            <div className="schedule-grid-heading"><div><h2>ห้อง {selectedClassroom?.label}</h2><p>ภาคเรียนที่ {semester} · ปีการศึกษา {selectedYearObj?.year_be}</p></div><span className="schedule-save-status">จัดแล้ว {Object.values(cells).filter(c => c.class_subject_id).length} / 30 คาบ</span></div>
            <div className="schedule-grid-scroll">
            <ScheduleGridTable compactBreak
              periodTimes={periodTimes}
              renderCell={(day, period) => {
                const key = `${day}-${period}`
                const cell = cells[key]
                const conflictRooms = conflicts[key]
                if (isManage && canEdit) {
                  const locked = cell?.locked ?? false
                  return (
                    <div className={`schedule-cell-edit${locked ? ' is-locked' : ''}${conflictRooms?.length ? ' is-conflict' : ''}`}>
                      <div className="schedule-cell-top">
                        <button type="button" className={`schedule-cell-choice${cell?.class_subject_id?.startsWith('activity:')?' activity':''}${locked?' locked':''}`}
                          title={cell?.class_subject_id ? subjectMap[cell.class_subject_id]?.label : 'เพิ่มรายวิชาหรือกิจกรรม'} disabled={blocked || locked} onClick={()=>setPicker({day,period})}
                          aria-label={`แก้ไขวัน${SCHEDULE_DAYS.find(d=>d.value===day)?.label} คาบ ${period}`}>
                          {cell?.class_subject_id ? <><span className="schedule-subject-code">{subjectMap[cell.class_subject_id]?.subject_code || 'กิจกรรม'}</span><span className="schedule-subject-name">{subjectMap[cell.class_subject_id]?.subject_name || 'รายวิชา'}</span></> : <span className="schedule-empty-label">{cell?.note || '+ เพิ่มวิชา'}</span>}

                        </button>
                        <button
                          type="button"
                          className={`schedule-lock-btn${locked ? ' is-locked' : ''}`}
                          title={locked ? 'ปลดล็อก' : 'ล็อกคาบนี้'}
                          aria-label={locked ? 'ปลดล็อกคาบ' : 'ล็อกคาบ'}
                          aria-pressed={locked}
                          onClick={() => handleToggleLock(day, period)}
                          disabled={blocked}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d={locked?'M8 10V6a4 4 0 018 0v4':'M8 10V6a4 4 0 018 0'}/></svg>
                        </button>
                      </div>
                      {teacherLine(cell?.class_subject_id)}
                      {cell?.note && !cell.class_subject_id && <div className="schedule-teacher-line">{cell.note}</div>}
                      {conflictRooms?.length ? (
                        <div className="schedule-conflict-warn">
                          ซ้ำ: {conflictRooms.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  )
                }
                return <div className={`cell-view${cell?.class_subject_id?.startsWith('activity:') ? ' activity' : cell?.locked ? ' locked' : ''}${!cell?.class_subject_id ? ' empty' : ''}`}>{renderCellView(cell)}</div>
              }}
            />
            </div>
            <div className="schedule-grid-footer"><span>{isManage && canEdit ? 'คลิกคาบเพื่อเลือกวิชา · บันทึกทันที' : 'ตารางเรียนรายสัปดาห์'}</span><div className="schedule-legend"><span><i className="legend-dot" />กิจกรรม</span><span><i className="legend-dot locked" />คาบที่ล็อก</span><Link href="/schedules/conflicts">ตรวจคาบชน</Link></div></div>
          </section>
        )}

        {isManage && quotas && <details className="schedule-quota-details"><summary>คาบรายวิชา {quotas.filled} / {quotas.totalTarget} คาบ <span>ดูรายละเอียดโควต้า</span></summary><ScheduleQuotaPanel {...quotas} /></details>}

      </div>

      {picker && <ScheduleLessonPicker title={`วัน${SCHEDULE_DAYS.find(d=>d.value===picker.day)?.label} · คาบ ${picker.period}`} options={subjects} selected={cells[`${picker.day}-${picker.period}`]?.class_subject_id || null} onClose={()=>setPicker(null)} onChoose={id=>{const {day,period}=picker;setPicker(null);void handleCellChange(day,period,id)}} />}
      {copyOpen && (
        <div className="copy-modal-backdrop" onClick={() => setCopyOpen(false)}>
          <div className="copy-modal" onClick={e => e.stopPropagation()}>
            <h3>คัดลอกตารางจากห้องอื่น</h3>
            <div className="schedule-field">
              <label>ห้องต้นทาง</label>
              <select value={copyFromClass} onChange={e => setCopyFromClass(e.target.value)}>
                {copySourceClassrooms.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', fontWeight: 700, margin: '12px 0 0' }}>
              แทนคาบที่ไม่ล็อกของห้องนี้ด้วยคาบต้นทาง โดยจับคู่รายวิชาและกิจกรรม หากครูชนกันหรือไม่มีวิชาตรงกันจะไม่เปลี่ยนตารางเดิม
            </p>
            <div className="copy-modal-actions">
              <button type="button" className="schedule-toolbar-btn" onClick={() => setCopyOpen(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="schedule-toolbar-btn primary"
                onClick={handleCopy}
                disabled={!copyFromClass || busyAction === 'copy'}
              >
                {busyAction === 'copy' ? 'กำลังคัดลอก...' : 'คัดลอก'}
              </button>
            </div>
          </div>
        </div>
      )}

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
