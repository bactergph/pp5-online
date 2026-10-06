'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  fetchScoreInit, fetchScoreClassrooms, fetchScoreSubjects,
} from '@/app/scores/actions'
import { fetchHourlyGrid, saveHourlyCell, fillHourlyPresentAll, fillHourlyPresentColumn, clearHourlyPresentColumn, clearHourlyAttendanceAll } from '@/app/attendance/actions'
import { formatThaiDate } from '@/lib/thaiDate'
import {
  chunkWeeks,
  globalSlotNumber,
  hourlyCellKey,
  HOURLY_STATUS_LABELS,
  nextHourlyStatusFromSaved,
  resolveHourlyStatus,
  summarizeHourlyStatuses,
  type HourlyStatus,
  type TeachingWeek,
} from '@/lib/hourly-attendance'

function hourlyColumnPresentLabel(busy: boolean, clearing: boolean) {
  if (busy) return clearing ? 'ลบ...' : 'บันทึก...'
  return (
    <>
      <span>{clearing ? 'ไม่มา' : 'มา'}</span>
      <span>ทุกคน</span>
    </>
  )
}

const WEEKS_PER_TAB = 5

type ToolbarPendingAction = 'fill' | 'delete' | null
type ConfirmPhase = 'idle' | 'countdown' | 'armed'

type Year = { id: string; year_be: number; is_active: boolean }
type Classroom = { id: string; level: string; room: number }
type CS = { id: string; classroom_id: string; subject_id: string }
type Subject = { id: string; code: string; name: string }
type Student = {
  id: string
  student_number: number
  student_code: string | null
  prefix: string | null
  first_name: string
  last_name: string
}

const STATUS_CLASS: Record<HourlyStatus, string> = {
  '/': 'hourly-status-present',
  'ข': 'hourly-status-absent',
  'ล': 'hourly-status-leave',
  'ป': 'hourly-status-sick',
}

function studentName(student: Student) {
  return `${student.prefix || ''}${student.first_name} ${student.last_name}`.trim()
}

export default function HourlyAttendanceEntry() {
  const [loading, setLoading] = useState(true)
  const [gridLoading, setGridLoading] = useState(false)
  const [userRole, setUserRole] = useState('')
  const [gridCanEdit, setCanEdit] = useState(false)
  const [loadedGrid, setLoadedGrid] = useState('')
  const gridRequest = useRef(0)
  const [years, setYears] = useState<Year[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedYear, setSelectedYear] = useState('')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [items, setItems] = useState<CS[]>([])
  const [selectedCS, setSelectedCS] = useState('')
  const [term, setTerm] = useState<1 | 2>(1)

  const [students, setStudents] = useState<Student[]>([])
  const [weeks, setWeeks] = useState<TeachingWeek[]>([])
  const [hoursPerWeekCount, setHoursPerWeekCount] = useState(1)
  const [subjectInfo, setSubjectInfo] = useState({ code: '', name: '', hoursPerYear: 0 })
  const [termRange, setTermRange] = useState({ start: '', end: '' })
  const [records, setRecords] = useState<Record<string, HourlyStatus>>({})
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({})
  const [bulkFilling, setBulkFilling] = useState(false)
  const [fillingColumnKeys, setFillingColumnKeys] = useState<Record<string, true>>({})
  const [pendingAction, setPendingAction] = useState<ToolbarPendingAction>(null)
  const [confirmPhase, setConfirmPhase] = useState<ConfirmPhase>('idle')
  const [confirmCountdown, setConfirmCountdown] = useState(0)
  const [clearingAll, setClearingAll] = useState(false)
  const [error, setError] = useState('')
  const [weekTab, setWeekTab] = useState(0)
  const skipYearFetch = useRef(true)
  const skipClassFetch = useRef(true)
  const gridContext = `${selectedYear}:${selectedClass}:${selectedCS}:${term}`
  const canEdit = gridCanEdit && !gridLoading && loadedGrid === gridContext
  const attendanceBusy = bulkFilling || clearingAll || Object.keys(savingCells).length > 0 || Object.keys(fillingColumnKeys).length > 0

  const subjectMap = useMemo(() => Object.fromEntries(subjects.map(s => [s.id, s])), [subjects])
  const selectedSubject = subjectMap[items.find(i => i.id === selectedCS)?.subject_id || '']
  const weekChunks = useMemo(() => chunkWeeks(weeks, WEEKS_PER_TAB), [weeks])
  const visibleWeeks = weekChunks[weekTab] || []
  const showWeekTabs = weekChunks.length > 1

  useEffect(() => {
    void fetchScoreInit().then(d => {
      setCanEdit(d.canEdit)
      setUserRole(String(d.role || ''))
      setYears(d.years as Year[])
      setSubjects(d.subjects as Subject[])
      const list = (d.classrooms || []) as Classroom[]
      const csList = (d.classSubjects || []) as CS[]
      setClassrooms(list)
      setItems(csList)
      skipYearFetch.current = true
      skipClassFetch.current = true
      setSelectedYear(d.activeYearId || '')
      setSelectedClass(list[0]?.id || '')
      setSelectedCS(csList[0]?.id || '')
      setLoading(false)
    }).catch(() => {
      setError('โหลดรายการไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedYear) return
    if (skipYearFetch.current) {
      skipYearFetch.current = false
      return
    }
    let cancelled = false
    void fetchScoreClassrooms(selectedYear).then(cs => {
      if (cancelled) return
      const list = cs as Classroom[]
      skipClassFetch.current = false
      setClassrooms(list)
      setSelectedClass(list[0]?.id || '')
      setItems([])
      setSelectedCS('')
    }).catch(() => { if (!cancelled) setError('โหลดห้องเรียนไม่สำเร็จ กรุณาลองใหม่') })
    return () => { cancelled = true }
  }, [selectedYear])

  useEffect(() => {
    if (!selectedClass) return
    if (skipClassFetch.current) {
      skipClassFetch.current = false
      return
    }
    let cancelled = false
    void fetchScoreSubjects(selectedClass).then(data => {
      if (cancelled) return
      const list = data as CS[]
      setItems(list)
      setSelectedCS(list[0]?.id || '')
    }).catch(() => { if (!cancelled) setError('โหลดรายวิชาไม่สำเร็จ กรุณาลองใหม่') })
    return () => { cancelled = true }
  }, [selectedClass])

  const loadGrid = useCallback(async () => {
    const request = ++gridRequest.current
    if (!selectedYear || !selectedClass || !selectedCS || !items.some(item => item.id === selectedCS && item.classroom_id === selectedClass)) {
      setGridLoading(false)
      return
    }
    setGridLoading(true)
    setError('')
    try {
      const params = {
        classroomId: selectedClass,
        classSubjectId: selectedCS,
        academicYearId: selectedYear,
        term,
      }
      const data = await fetchHourlyGrid(params)
      if (request !== gridRequest.current) return
      if ('error' in data) throw new Error(data.error)

      setCanEdit(data.canEdit)
      setStudents(data.students as Student[])
      setWeeks(data.weeks)
      setHoursPerWeekCount(data.hoursPerWeek)
      setSubjectInfo({
        code: data.subject.code,
        name: data.subject.name,
        hoursPerYear: data.subject.hoursPerYear,
      })
      setRecords(data.records)
      setTermRange({ start: data.termStart || '', end: data.termEnd || '' })
      setLoadedGrid(`${selectedYear}:${selectedClass}:${selectedCS}:${term}`)
    } catch (err) {
      if (request !== gridRequest.current) return
      setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ')
      setStudents([])
      setWeeks([])
      setRecords({})
      setTermRange({ start: '', end: '' })
    } finally {
      if (request === gridRequest.current) {
        setGridLoading(false)
        setBulkFilling(false)
      }
    }
  }, [selectedYear, selectedClass, selectedCS, term, items])

  useEffect(() => {
    void Promise.resolve().then(loadGrid)
    return () => { gridRequest.current += 1 }
  }, [loadGrid])

  useEffect(() => {
    void Promise.resolve().then(() => {
      setWeekTab(0)
      setPendingAction(null)
      setConfirmPhase('idle')
      setConfirmCountdown(0)
    })
  }, [weeks, term, selectedCS])

  useEffect(() => {
    if (confirmPhase !== 'countdown' || confirmCountdown <= 0) return
    const timer = window.setTimeout(() => {
      if (confirmCountdown <= 1) {
        setConfirmPhase('armed')
        setConfirmCountdown(0)
      } else {
        setConfirmCountdown(confirmCountdown - 1)
      }
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [confirmPhase, confirmCountdown])

  const toolbarConfirmIdle = confirmPhase === 'idle'

  function resetToolbarConfirm() {
    setPendingAction(null)
    setConfirmPhase('idle')
    setConfirmCountdown(0)
  }

  function getSavedStatus(studentId: string, weekNumber: number, slot: number): HourlyStatus | null {
    const key = hourlyCellKey(studentId, weekNumber, slot)
    return key in records ? records[key] : null
  }

  function getDisplayStatus(studentId: string, weekNumber: number, slot: number): HourlyStatus {
    return getSavedStatus(studentId, weekNumber, slot) ?? '/'
  }

  function markColumnFilling(columnKey: string, filling: boolean) {
    setFillingColumnKeys(prev => {
      if (filling) return { ...prev, [columnKey]: true }
      if (!(columnKey in prev)) return prev
      const next = { ...prev }
      delete next[columnKey]
      return next
    })
  }

  function columnHasSavedData(weekNumber: number, slot: number) {
    return students.some(student => getSavedStatus(student.id, weekNumber, slot) !== null)
  }

  async function toggleColumnPresent(week: TeachingWeek, slot: number) {
    if (!canEdit || !selectedYear || !selectedClass || !selectedCS || bulkFilling || clearingAll || !toolbarConfirmIdle) return
    const columnKey = `${week.weekNumber}:${slot}`
    if (fillingColumnKeys[columnKey]) return
    const cellKeys = students.map(student => hourlyCellKey(student.id, week.weekNumber, slot))
    // Sparse: has absences → fill present (delete rows); empty → clear to ข
    const hasAbsences = columnHasSavedData(week.weekNumber, slot)
    markColumnFilling(columnKey, true)
    setSavingCells(prev => ({
      ...prev,
      ...Object.fromEntries(cellKeys.map(key => [key, true])),
    }))
    setError('')
    let saved = false
    try {
      const result = hasAbsences
        ? await fillHourlyPresentColumn({
          classroomId: selectedClass,
          classSubjectId: selectedCS,
          academicYearId: selectedYear,
          term,
          weekNumber: week.weekNumber,
          slot,
        })
        : await clearHourlyPresentColumn({
          classroomId: selectedClass,
          classSubjectId: selectedCS,
          academicYearId: selectedYear,
          term,
          weekNumber: week.weekNumber,
          slot,
        })
      if (result.error) {
        setError(result.error)
        return
      }
      saved = true
      flushSync(() => {
        setRecords(prev => {
          const next = { ...prev }
          for (const student of students) {
            const key = hourlyCellKey(student.id, week.weekNumber, slot)
            if (hasAbsences) delete next[key]
            else next[key] = 'ข'
          }
          return next
        })
        setSavingCells(prev => {
          const next = { ...prev }
          for (const key of cellKeys) delete next[key]
          return next
        })
        markColumnFilling(columnKey, false)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : (hasAbsences ? 'บันทึกมาทุกคนไม่สำเร็จ' : 'บันทึกไม่มาทุกคนไม่สำเร็จ'))
    } finally {
      if (!saved) {
        setSavingCells(prev => {
          const next = { ...prev }
          for (const key of cellKeys) delete next[key]
          return next
        })
        markColumnFilling(columnKey, false)
      }
    }
  }

  function requestFillAll() {
    if (!canEdit || bulkFilling || clearingAll || !toolbarConfirmIdle) return
    const ok = window.confirm('ยืนยันเช็คมาทั้งหมดในภาคเรียนนี้? (ลบรายการขาด/ลา/ป่วยทั้งหมด)')
    if (!ok) return
    setPendingAction('fill')
    setConfirmPhase('countdown')
    setConfirmCountdown(3)
  }

  async function executeFillAll() {
    if (!canEdit || !selectedYear || !selectedClass || !selectedCS || bulkFilling) return
    if (confirmPhase !== 'armed' || pendingAction !== 'fill') return
    setBulkFilling(true)
    setError('')
    try {
      const result = await fillHourlyPresentAll({
        classroomId: selectedClass,
        classSubjectId: selectedCS,
        academicYearId: selectedYear,
        term,
      })
      resetToolbarConfirm()
      await loadGrid()
      if (result.error) {
        setError(result.error)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกมาทั้งหมดไม่สำเร็จ')
    } finally {
      setBulkFilling(false)
    }
  }

  function handleFillAllClick() {
    if (confirmPhase === 'idle') {
      requestFillAll()
      return
    }
    if (confirmPhase === 'armed' && pendingAction === 'fill') {
      void executeFillAll()
    }
  }

  function fillAllButtonLabel() {
    if (bulkFilling && pendingAction === 'fill') return 'กำลังบันทึก...'
    if (pendingAction === 'fill' && confirmPhase === 'countdown' && confirmCountdown > 0) {
      return `บันทึกในอีก ${confirmCountdown}...`
    }
    if (pendingAction === 'fill' && confirmPhase === 'armed') return 'กดอีกครั้งเพื่อบันทึก'
    return 'เช็คมาทั้งหมด'
  }

  function requestDeleteAll() {
    if (!canEdit || bulkFilling || clearingAll || !toolbarConfirmIdle) return
    const ok = window.confirm('ยืนยันลบข้อมูลเวลาเรียนทั้งหมดในภาคเรียนนี้?\n\nการลบไม่สามารถย้อนกลับได้')
    if (!ok) return
    setPendingAction('delete')
    setConfirmPhase('countdown')
    setConfirmCountdown(3)
  }

  async function executeDeleteAll() {
    if (!canEdit || !selectedCS || clearingAll) return
    if (confirmPhase !== 'armed' || pendingAction !== 'delete') return
    setClearingAll(true)
    setError('')
    try {
      const result = await clearHourlyAttendanceAll({
        classSubjectId: selectedCS,
        term,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setRecords({})
      resetToolbarConfirm()
      await loadGrid()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลบข้อมูลไม่สำเร็จ')
    } finally {
      setClearingAll(false)
    }
  }

  function handleDeleteAllClick() {
    if (confirmPhase === 'idle') {
      requestDeleteAll()
      return
    }
    if (confirmPhase === 'armed' && pendingAction === 'delete') {
      void executeDeleteAll()
    }
  }

  function deleteAllButtonLabel() {
    if (clearingAll) return 'กำลังลบ...'
    if (pendingAction === 'delete' && confirmPhase === 'countdown' && confirmCountdown > 0) {
      return `ลบในอีก ${confirmCountdown}...`
    }
    if (pendingAction === 'delete' && confirmPhase === 'armed') return 'กดอีกครั้งเพื่อลบ'
    return 'ลบทั้งหมด'
  }

  async function toggleCell(studentId: string, week: TeachingWeek, slot: number) {
    if (!canEdit || !selectedClass || !selectedCS) return
    const key = hourlyCellKey(studentId, week.weekNumber, slot)
    const previous = getSavedStatus(studentId, week.weekNumber, slot)
    const next = nextHourlyStatusFromSaved(previous)
    setRecords(prev => {
      const copy = { ...prev }
      if (next === '/') delete copy[key]
      else copy[key] = next
      return copy
    })
    setSavingCells(prev => ({ ...prev, [key]: true }))
    const { error: saveError } = await saveHourlyCell({
      classroomId: selectedClass,
      classSubjectId: selectedCS,
      term,
      studentId,
      weekNumber: week.weekNumber,
      slot,
      anchorDate: week.startDate,
      status: next,
    })
    setSavingCells(prev => {
      const copy = { ...prev }
      delete copy[key]
      return copy
    })
    if (saveError) {
      setRecords(prev => {
        const copy = { ...prev }
        if (previous === null) delete copy[key]
        else copy[key] = previous
        return copy
      })
      setError(saveError)
    }
  }

  function studentSummary(studentId: string, scopeWeeks: TeachingWeek[]) {
    const statuses: HourlyStatus[] = []
    for (const week of scopeWeeks) {
      for (let slot = 1; slot <= hoursPerWeekCount; slot += 1) {
        statuses.push(resolveHourlyStatus(getSavedStatus(studentId, week.weekNumber, slot)))
      }
    }
    return summarizeHourlyStatuses(statuses)
  }

  const classroom = classrooms.find(c => c.id === selectedClass)

  if (loading) {
    return <div className="text-center py-10 text-gray-500">กำลังโหลด...</div>
  }

  return (
    <div className="page-stack hourly-attendance-page">
      <style>{HOURLY_STYLES}</style>

      <div className="hourly-head">
        <div>
          <h1 className="hourly-title">เช็คเวลาเรียนรายวิชา</h1>
          <p className="hourly-subtitle">ช่องว่าง = มา · คลิกเพื่อวน / → ข → ล → ป</p>
        </div>
        <div className="hourly-legend">
          {(['/', 'ข', 'ล', 'ป'] as HourlyStatus[]).map(s => (
            <span key={s} className={`hourly-legend-item ${STATUS_CLASS[s]}`}>
              <b>{s}</b> {HOURLY_STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-bar control-card hourly-filter">
        <div className="hourly-filter-field hourly-filter-field--year">
          <label className="form-label">ปีการศึกษา</label>
          <select value={selectedYear} disabled={attendanceBusy} onChange={e => { setSelectedYear(e.target.value); setSelectedClass(''); setSelectedCS(''); setClassrooms([]); setItems([]); setStudents([]); setWeeks([]); setRecords({}); setError(''); }} className="form-input">
            {years.map(y => <option key={y.id} value={y.id}>{y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>)}
          </select>
        </div>
        <div className="hourly-filter-field hourly-filter-field--class">
          <label className="form-label">ห้องเรียน</label>
          <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedCS(''); setItems([]); setStudents([]); setWeeks([]); setRecords({}); setError(''); }} className="form-input" disabled={attendanceBusy || classrooms.length === 0}>
            <option value="">{classrooms.length === 0 ? '— ไม่มีห้อง —' : '— เลือกห้อง —'}</option>
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.level}/{c.room}</option>)}
          </select>
        </div>
        <div className="hourly-filter-field hourly-filter-field--subject">
          <label className="form-label">รายวิชา</label>
          <select value={selectedCS} onChange={e => setSelectedCS(e.target.value)} className="form-input" disabled={attendanceBusy || items.length === 0}>
            <option value="">{items.length === 0 ? '— ไม่มีวิชา —' : '— เลือกรายวิชา —'}</option>
            {items.map(it => {
              const s = subjectMap[it.subject_id]
              return <option key={it.id} value={it.id}>[{s?.code}] {s?.name}</option>
            })}
          </select>
        </div>
        <div className="hourly-filter-field hourly-filter-field--term">
          <label className="form-label">ภาคเรียน</label>
          <div className="hourly-term-toggle">
            {([1, 2] as const).map(t => (
              <button key={t} type="button" disabled={attendanceBusy} onClick={() => setTerm(t)} className={term === t ? 'btn btn-primary' : 'btn btn-secondary'}>
                ภาคเรียนที่ {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {classrooms.length === 0 && userRole === 'teacher' && (
        <div className="alert alert-error">ยังไม่มีห้องที่คุณได้รับมอบหมายสอนในปีนี้</div>
      )}
      {items.length === 0 && selectedClass && (
        <div className="alert alert-error">ไม่มีวิชาที่คุณสอนในห้องนี้</div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {selectedCS && !gridLoading && weeks.length > 0 && (
        <div className="control-card hourly-meta">
          <span>แบบบันทึกเวลาเรียนรายวิชา</span>
          <span>ชั้น <b>{classroom ? `${classroom.level}/${classroom.room}` : '-'}</b></span>
          <span>ภาคเรียนที่ <b>{term}</b></span>
          <span>รหัสวิชา <b>{subjectInfo.code || selectedSubject?.code || '-'}</b></span>
          <span>รายวิชา <b>{subjectInfo.name || selectedSubject?.name || '-'}</b></span>
          <span>ชั่วโมง/ปี <b>{subjectInfo.hoursPerYear || '-'}</b></span>
          <span>ชั่วโมง/สัปดาห์ <b>{hoursPerWeekCount}</b></span>
          <span>สัปดาห์การเรียน <b>{weeks.length}</b> สัปดาห์</span>
          {termRange.start && termRange.end && (
            <span>ช่วงภาคเรียน <b>{formatThaiDate(termRange.start)} – {formatThaiDate(termRange.end)}</b></span>
          )}
        </div>
      )}

      {gridLoading || bulkFilling || clearingAll ? (
        <div className="text-center py-10 text-gray-500">
          {clearingAll ? 'กำลังลบข้อมูล...' : bulkFilling ? 'กำลังเช็คมาทั้งหมด...' : 'กำลังโหลดตาราง...'}
        </div>
      ) : weeks.length === 0 && selectedCS ? (
        <div className="alert alert-error">ยังไม่ได้กำหนดปฏิทินภาคเรียน — ไปตั้งค่าที่เมนู ปีการศึกษา ก่อน</div>
      ) : selectedCS && weeks.length > 0 ? (
        <div className="data-card dense-grid-card hourly-grid-card">
          <div className="hourly-grid-toolbar">
            <span className="hourly-grid-toolbar-note">ช่องว่าง = มา · คลิกช่องเพื่อวน / → ข → ล → ป</span>
            {canEdit ? (
              <div className="hourly-grid-toolbar-actions">
                <button
                  type="button"
                  className={`btn btn-secondary hourly-fill-all-btn ${pendingAction === 'fill' && confirmPhase === 'armed' ? 'is-armed' : ''}`}
                  disabled={
                    bulkFilling || gridLoading || clearingAll
                    || (confirmPhase !== 'idle' && pendingAction !== 'fill')
                    || (pendingAction === 'fill' && confirmPhase === 'countdown')
                  }
                  onClick={handleFillAllClick}
                >
                  {fillAllButtonLabel()}
                </button>
                <button
                  type="button"
                  className={`btn hourly-delete-all-btn ${pendingAction === 'delete' && confirmPhase === 'armed' ? 'is-armed' : ''}`}
                  disabled={
                    bulkFilling || gridLoading || clearingAll
                    || (confirmPhase !== 'idle' && pendingAction !== 'delete')
                    || (pendingAction === 'delete' && confirmPhase === 'countdown')
                  }
                  onClick={handleDeleteAllClick}
                >
                  {deleteAllButtonLabel()}
                </button>
              </div>
            ) : null}
          </div>
          {showWeekTabs && (
            <div className="hourly-week-tabs" role="tablist" aria-label="ช่วงสัปดาห์">
              {weekChunks.map((chunk, index) => {
                const start = chunk[0]?.weekNumber ?? 0
                const end = chunk[chunk.length - 1]?.weekNumber ?? 0
                return (
                  <button
                    key={`week-tab-${start}-${end}`}
                    type="button"
                    role="tab"
                    aria-selected={weekTab === index}
                    className={`hourly-week-tab ${weekTab === index ? 'is-active' : ''}`}
                    onClick={() => setWeekTab(index)}
                  >
                    สัปดาห์ที่ {start}-{end}
                  </button>
                )
              })}
            </div>
          )}
          <div className="hourly-table-wrap">
            <table className="hourly-table">
              <thead>
                <tr className="hourly-week-row">
                  <th rowSpan={2} className="hourly-sticky-no hourly-head-fixed">ที่</th>
                  <th rowSpan={2} className="hourly-sticky-name hourly-head-fixed">ชื่อ - สกุล</th>
                  {visibleWeeks.map(week => (
                    <th key={week.weekNumber} colSpan={hoursPerWeekCount} className="hourly-week-head hourly-week-divider-left hourly-week-divider-right">
                      <span className="hourly-week-head-num">สัปดาห์ {week.weekNumber}</span>
                      <span className="hourly-week-head-date">{week.dateLabel}</span>
                    </th>
                  ))}
                  <th rowSpan={2} className="hourly-summary-head hourly-total-head">รวม</th>
                </tr>
                <tr className="hourly-slot-row">
                  {visibleWeeks.map(week => (
                    Array.from({ length: hoursPerWeekCount }, (_, i) => {
                      const slot = i + 1
                      const slotNo = globalSlotNumber(week.weekNumber, slot, hoursPerWeekCount)
                      const columnKey = `${week.weekNumber}:${slot}`
                      const isFirstSlot = slot === 1
                      const isLastSlot = slot === hoursPerWeekCount
                      const columnBusy = Boolean(fillingColumnKeys[columnKey])
                      const columnClearing = !columnHasSavedData(week.weekNumber, slot)
                      return (
                        <th
                          key={`${week.weekNumber}-${slot}`}
                          className={[
                            'hourly-slot-head',
                            isFirstSlot ? 'hourly-week-divider-left' : '',
                            isLastSlot ? 'hourly-week-divider-right' : '',
                          ].filter(Boolean).join(' ')}
                          title={`คาบที่ ${slotNo}`}
                        >
                          <span className="hourly-slot-line1">คาบ {slotNo}</span>
                          {canEdit ? (
                            <button
                              type="button"
                              className={`hourly-slot-all-btn ${columnClearing ? 'is-clear' : ''}`}
                              disabled={columnBusy || bulkFilling || clearingAll || !toolbarConfirmIdle}
                              onClick={() => void toggleColumnPresent(week, slot)}
                            >
                              {hourlyColumnPresentLabel(columnBusy, columnClearing)}
                            </button>
                          ) : null}
                        </th>
                      )
                    })
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student, index) => {
                  const summary = studentSummary(student.id, visibleWeeks)
                  return (
                    <tr key={student.id}>
                      <td className="hourly-sticky-no">{student.student_number || index + 1}</td>
                      <td className="hourly-sticky-name text-left">{studentName(student)}</td>
                      {visibleWeeks.map(week => (
                        Array.from({ length: hoursPerWeekCount }, (_, i) => {
                          const slot = i + 1
                          const status = getDisplayStatus(student.id, week.weekNumber, slot)
                          const key = hourlyCellKey(student.id, week.weekNumber, slot)
                          const isFirstSlot = slot === 1
                          const isLastSlot = slot === hoursPerWeekCount
                          return (
                            <td key={key} className={[
                              'hourly-cell-td',
                              isFirstSlot ? 'hourly-week-divider-left' : '',
                              isLastSlot ? 'hourly-week-divider-right' : '',
                            ].filter(Boolean).join(' ')}>
                              <button
                                type="button"
                                className={`hourly-cell ${status ? STATUS_CLASS[status] : 'hourly-status-empty'} ${savingCells[key] ? 'is-saving' : ''}`}
                                disabled={!canEdit}
                                onClick={() => void toggleCell(student.id, week, slot)}
                              >
                                {status ?? ''}
                              </button>
                            </td>
                          )
                        })
                      ))}
                      <td className="hourly-summary-cell hourly-total-cell">{summary.present}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const HOURLY_STYLES = `
  .hourly-attendance-page { gap: 14px; }
  .hourly-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
  .hourly-title { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .hourly-subtitle { margin: 4px 0 0; font-size: 13px; color: #64748B; font-weight: 600; }
  .hourly-legend { display: flex; gap: 8px; flex-wrap: wrap; }
  .hourly-legend-item {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px;
    font-size: 12px; font-weight: 800; border: 1px solid #E2E8F0; background: #fff;
  }
  .hourly-filter {
    display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-end;
    margin-bottom: 0;
  }
  .hourly-filter-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .hourly-filter-field .form-label { margin-bottom: 0; font-size: 12px; white-space: nowrap; }
  .hourly-filter-field .form-input {
    width: 100%; padding: 8px 10px; font-size: 13px; border-radius: 9px;
  }
  .hourly-filter-field--year { flex: 0 0 148px; width: 148px; }
  .hourly-filter-field--class { flex: 0 0 96px; width: 96px; }
  .hourly-filter-field--subject { flex: 1 1 220px; min-width: 200px; max-width: 340px; }
  .hourly-filter-field--term { flex: 0 0 auto; }
  .hourly-term-toggle { display: flex; gap: 6px; flex-wrap: nowrap; }
  .hourly-term-toggle .btn {
    padding: 8px 12px; font-size: 13px; border-radius: 9px; white-space: nowrap;
  }
  @media (max-width: 720px) {
    .hourly-filter-field--year,
    .hourly-filter-field--class,
    .hourly-filter-field--subject { flex: 1 1 100%; width: auto; max-width: none; }
  }
  .hourly-meta {
    display: flex; flex-wrap: wrap; gap: 10px 18px; padding: 12px 14px; font-size: 13px; color: #475569; font-weight: 700;
  }
  .hourly-meta b { color: #0F172A; }
  .hourly-grid-card { padding: 0; overflow: hidden; }
  .hourly-grid-toolbar {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
    padding: 10px 12px; border-bottom: 1px solid #E2E8F0; background: #F8FAFC;
  }
  .hourly-grid-toolbar-actions {
    display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap;
  }
  .hourly-grid-toolbar-note { font-size: 12px; font-weight: 700; color: #475569; }
  .hourly-fill-all-btn { font-size: 12px; padding: 7px 12px; }
  .hourly-fill-all-btn.is-armed {
    background: #16A34A; color: #fff; border-color: #16A34A; font-weight: 800;
  }
  .hourly-delete-all-btn {
    font-size: 12px; padding: 7px 12px; background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA;
  }
  .hourly-delete-all-btn:hover:not(:disabled) { background: #FEE2E2; }
  .hourly-delete-all-btn.is-armed {
    background: #DC2626; color: #fff; border-color: #DC2626; font-weight: 800;
  }
  .hourly-delete-all-btn:disabled { opacity: 0.7; cursor: not-allowed; }
  .hourly-week-tabs {
    display: flex; flex-wrap: wrap; gap: 0; border-bottom: 1px solid #E2E8F0; background: #fff;
    padding: 0 8px;
  }
  .hourly-week-tab {
    border: 0; background: transparent; padding: 12px 16px; font-size: 13px; font-weight: 700;
    color: #64748B; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
  }
  .hourly-week-tab:hover { color: #8B6B45; }
  .hourly-week-tab.is-active {
    color: #8B6B45; font-weight: 900; border-bottom-color: #8B6B45;
  }
  .hourly-table-wrap { overflow: auto; max-width: 100%; max-height: calc(100vh - 320px); }
  .hourly-table { border-collapse: separate; border-spacing: 0; white-space: nowrap; min-width: max-content; width: 100%; }
  .hourly-table th, .hourly-table td {
    border-right: 1px solid #CBD5E1; border-bottom: 1px solid #E2E8F0;
    text-align: center; font-size: 12px; background: #fff;
  }
  .hourly-table thead {
    position: sticky; top: 0; z-index: 8;
    box-shadow: 0 2px 0 #CBD5E1;
  }
  .hourly-table thead th {
    background: #F1F5F9; font-weight: 900; color: #0F172A; padding: 8px 6px;
    vertical-align: middle;
  }
  .hourly-head-fixed {
    background: #E2E8F0 !important; color: #0F172A !important;
    font-size: 13px !important; border-bottom: 2px solid #94A3B8 !important;
  }
  .hourly-week-head {
    background: linear-gradient(180deg, #F5EDE3 0%, #BFDBFE 100%) !important;
    color: #1E3A8A !important;
    border-bottom: 2px solid #60A5FA !important;
    padding: 10px 8px !important;
    line-height: 1.3;
  }
  .hourly-week-head-num {
    display: block; font-size: 14px; font-weight: 900; letter-spacing: 0.02em;
  }
  .hourly-week-head-date {
    display: block; margin-top: 3px; font-size: 11px; font-weight: 800; color: #6B4F32;
  }
  .hourly-slot-head {
    width: 52px; min-width: 52px;
    background: #F8FAFC !important;
    padding: 6px 4px 8px !important;
    border-top: 0 !important;
    border-bottom: 2px solid #94A3B8 !important;
    vertical-align: bottom;
    min-height: 72px;
  }
  .hourly-slot-line1 {
    display: block; font-size: 11px; font-weight: 900; color: #1E40AF; line-height: 1.2;
    margin-bottom: 4px;
  }
  .hourly-slot-all-btn {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
    width: 100%; margin: 0; min-height: 38px; padding: 4px 1px;
    border: 1px solid #86EFAC; border-radius: 4px; background: #ECFDF5; color: #166534;
    font-size: 8px; font-weight: 800; line-height: 1.1; cursor: pointer; white-space: normal;
  }
  .hourly-slot-all-btn span { display: block; }
  .hourly-slot-all-btn:hover:not(:disabled) { background: #DCFCE7; }
  .hourly-slot-all-btn.is-clear {
    background: #FEF2F2; border-color: #FECACA; color: #B91C1C;
  }
  .hourly-slot-all-btn.is-clear:hover:not(:disabled) { background: #FEE2E2; }
  .hourly-slot-all-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .hourly-week-divider-left {
    border-left: 3px solid #1E293B !important;
  }
  .hourly-week-divider-right {
    border-right: 3px solid #1E293B !important;
  }
  .hourly-week-head.hourly-week-divider-left {
    border-left-width: 3px !important;
    border-left-color: #1E293B !important;
  }
  .hourly-week-head.hourly-week-divider-right {
    border-right-width: 3px !important;
    border-right-color: #1E293B !important;
  }
  .hourly-sticky-no { position: sticky; left: 0; z-index: 3; width: 46px; background: #fff !important; }
  .hourly-sticky-name { position: sticky; left: 46px; z-index: 3; min-width: 190px; max-width: 230px; background: #fff !important; text-align: left !important; padding: 6px 10px !important; }
  .hourly-table thead .hourly-sticky-no,
  .hourly-table thead .hourly-sticky-name { z-index: 12; }
  .hourly-table thead .hourly-head-fixed { z-index: 13; }
  .hourly-cell-td { padding: 2px !important; }
  .hourly-cell {
    width: 30px; height: 28px; border: 0; border-radius: 4px; cursor: pointer;
    font-size: 12px; font-weight: 900; display: inline-flex; align-items: center; justify-content: center;
  }
  .hourly-cell:disabled { cursor: default; opacity: 0.85; }
  .hourly-cell.is-saving { opacity: 0.55; }
  .hourly-status-empty { background: #F8FAFC; color: #CBD5E1; }
  .hourly-status-present { background: #DCFCE7; color: #14532D; }
  .hourly-status-absent { background: #FEE2E2; color: #7F1D1D; }
  .hourly-status-leave { background: #FEF3C7; color: #92400E; }
  .hourly-status-sick { background: #FFEDD5; color: #9A3412; }
  .hourly-summary-head {
    background: #EDE9FE !important; color: #5B21B6 !important; min-width: 52px;
    font-size: 14px !important; border-bottom: 2px solid #94A3B8 !important;
  }
  .hourly-total-head { min-width: 52px; }
  .hourly-summary-cell { font-weight: 800; background: #FAFAFA; }
  .hourly-total-cell { background: #F5F3FF !important; color: #5B21B6; font-weight: 900; }
`
