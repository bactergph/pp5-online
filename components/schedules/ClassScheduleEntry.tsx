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
import LoadingButton from '@/components/LoadingButton'
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
  .schedule-toolbar-btn:disabled{opacity:.5;cursor:not-allowed}
  .schedule-toolbar label{font-size:13px;color:#475569}
  @media(max-width:700px){.schedule-toolbar{align-items:stretch}.schedule-toolbar-btn{flex:1 1 45%;min-height:42px}}
  .schedule-page { display: grid; gap: 14px; }
  .schedule-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .schedule-head h1 { margin: 0; font-size: 22px; font-weight: 900; color: #111827; }
  .schedule-head p { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: #64748B; }
  .schedule-tabs { display: flex; gap: 10px; flex-wrap: wrap; }
  .schedule-tab {
    display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px;
    border-radius: 999px; border: 1px solid #E2E8F0; background: #fff; color: #475569;
    font-size: 12px; font-weight: 800; text-decoration: none;
  }
  .schedule-tab.is-active { border-color: #C49212; background: #F3E8FF; color: #6D28D9; }
  .schedule-filters {
    display: grid; grid-template-columns: 140px minmax(200px, 1fr); gap: 12px; align-items: end;
    padding: 14px; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
  }
  .schedule-field { display: grid; gap: 5px; }
  .schedule-field label { font-size: 11px; font-weight: 900; color: #475569; }
  .schedule-field select {
    min-height: 36px; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0 10px;
    background: #fff; color: #0F172A; font-size: 13px; font-weight: 800;
  }
  .schedule-info {
    padding: 12px 14px; border-radius: 12px; border: 1px solid #EFE6D8; background: #F5EDE3;
    color: #5C4330; font-size: 12.5px; font-weight: 700; line-height: 1.5;
  }
  .schedule-info a { color: #8B6B45; font-weight: 800; }
  .schedule-toolbar {
    padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;
    display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
    padding: 12px 14px; border: 1px solid #E5E7EB; border-radius: 14px; background: #FAFBFC;
  }
  .schedule-toolbar-btn {
    min-height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid #CBD5E1;
    background: #fff; color: #334155; font-size: 11.5px; font-weight: 800; cursor: pointer;
  }
  .schedule-toolbar-btn.primary { border-color: #2563eb; background: #2563eb; color: #fff; }
  .schedule-toolbar-btn.danger { border-color: #FECACA; background: #FEF2F2; color: #991B1B; }
  .schedule-grid-card {
    overflow: auto; border: 1px solid #E5E7EB; border-radius: 14px; background: #fff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
  }
  .schedule-cell-edit { display: grid; gap: 4px; position: relative; }
  .schedule-cell-edit.is-locked { opacity: 0.85; }
  .schedule-cell-edit.is-locked select { background: #F1F5F9; pointer-events: none; }
  .schedule-cell-edit select {
    width: 100%; min-height: 34px; border: 1px solid #E2E8F0; border-radius: 8px;
    padding: 5px 8px; font-size: 11px; font-weight: 700; color: #0F172A; background: #fff;
  }
  .schedule-cell-edit.is-conflict select { border-color: #F87171; background: #FEF2F2; }
  .schedule-cell-top { display: flex; align-items: flex-start; gap: 4px; }
  .schedule-cell-top select { flex: 1; }
  .schedule-lock-btn {
    flex-shrink: 0; width: 28px; height: 28px; border-radius: 8px; border: 1px solid #E2E8F0;
    background: #fff; color: #94A3B8; font-size: 12px; cursor: pointer; display: grid; place-items: center;
  }
  .schedule-lock-btn.is-locked { border-color: #F59E0B; background: #FFFBEB; color: #D97706; }
  .schedule-teacher-line {
    font-size: 10px; font-weight: 700; color: #64748B; text-align: left; padding: 0 2px;
    min-height: 14px;
  }
  .schedule-teacher-line.is-missing { color: #B45309; }
  .schedule-conflict-warn {
    font-size: 9.5px; font-weight: 800; color: #DC2626; text-align: left; padding: 0 2px; line-height: 1.3;
  }
  .cell-view {
    display: grid; gap: 2px; place-items: center; min-height: 44px; padding: 4px;
    font-size: 11px; font-weight: 700; color: #0F172A; text-align: center;
  }
  .cell-subj { font-weight: 800; color: #1E293B; }
  .cell-tchr { font-size: 10px; font-weight: 700; color: #64748B; }
  .schedule-empty { padding: 28px; text-align: center; color: #64748B; font-size: 13px; font-weight: 700; }
  .copy-modal-backdrop {
    position: fixed; inset: 0; z-index: 9000; display: grid; place-items: center;
    padding: 24px; background: rgba(8, 12, 24, 0.2);
  }
  .copy-modal {
    width: min(100%, 380px); padding: 20px; border-radius: 16px; border: 1px solid #E5E7EB;
    background: #fff; box-shadow: 0 20px 48px rgba(15, 23, 42, 0.14);
  }
  .copy-modal h3 { margin: 0 0 12px; font-size: 16px; font-weight: 900; }
  .copy-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
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
  const [selectedClass, setSelectedClass] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [gridLoading, setGridLoading] = useState(false)
  const [loadedContext, setLoadedContext] = useState('')
  const [rebuild, setRebuild] = useState(false)
  const gridRequest = useRef(0)
  const roomRequest = useRef(0)
  const blocked = !!busyAction || !!savingKey || gridLoading || loadedContext !== `${selectedYear}:${selectedClass}`
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
    const bundle = await fetchClassScheduleBundle(selectedClass, selectedYear)
    if (request !== gridRequest.current) return
    setCells(bundle.grid)
    setSubjects(bundle.subjects)
    setQuotas(bundle.quotas)
    setConflicts(bundle.warnings)
    setLoadedContext(`${selectedYear}:${selectedClass}`)
    } catch (e) {
      if (request === gridRequest.current) {
        setLoadedContext('')
        setAlert({ type: 'error', title: 'โหลดตารางไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
      }
    } finally { if (request === gridRequest.current) setGridLoading(false) }
  }, [selectedClass, selectedYear])

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
      const saved = await saveClassScheduleCell(selectedClass, selectedYear, day, period, classSubjectId)
      if (saved.error) throw new Error(saved.error)
      if (isManage) {
        const quotaData = await fetchScheduleQuotas(selectedClass, selectedYear)
        setQuotas(quotaData as QuotaData)
      }
      if (classSubjectId) {
        const subj = subjectMap[classSubjectId]
        if (subj?.teacher_id) {
          const result = await getTeacherConflictAt(
            selectedYear, subj.teacher_id, day, period, selectedClass,
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
      const response = await toggleScheduleCellLock(selectedClass, selectedYear, day, period)
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
        ? await runAutoScheduleSchool(selectedYear, rebuild)
        : await runAutoScheduleClass(selectedClass, selectedYear, 'spread', rebuild)
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
      const result = await clearClassSchedule(selectedClass, selectedYear)
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
      const response = await copyClassSchedule(copyFromClass, selectedClass, selectedYear)
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
    if (!cell?.class_subject_id) return <span>{cell?.note || '—'}</span>
    const subj = subjectMap[cell.class_subject_id]
    if (!subj) return <span>—</span>
    return (
      <>
        <span className="cell-subj">{subj.label}</span>
        <span className="cell-tchr">{cell.class_subject_id.startsWith('activity:') ? 'กิจกรรม · ไม่ต้องระบุครู' : subj.teacher_name || 'ยังไม่กำหนดครูผู้สอน'}</span>
      </>
    )
  }

  function teacherLine(classSubjectId: string | null | undefined) {
    if (!classSubjectId) return null
    const subj = subjectMap[classSubjectId]
    if (!subj) return null
    if (classSubjectId.startsWith('activity:')) return <div className="schedule-teacher-line">กิจกรรม · ไม่ต้องระบุครู</div>
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
      <div className="schedule-page schedule-workspace">
        <div className="schedule-head">
          <div>
            <h1>{isManage ? 'จัดการตารางเรียน' : 'ตารางเรียน'}</h1>
            <p>
              {selectedClassroom && selectedYearObj
                ? `ห้อง ${selectedClassroom.label} · ปีการศึกษา พ.ศ. ${selectedYearObj.year_be}`
                : isManage
                  ? 'กำหนดวิชาในแต่ละคาบ — ครูผู้สอนดึงจากข้อมูลจัดครูเข้าสอน'
                  : 'ดูตารางเรียนรายห้อง'}
            </p>
          </div>
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
        </div>

        <div className="schedule-filters">
          <div className="schedule-field">
            <label>ปีการศึกษา</label>
            <select disabled={!!busyAction || !!savingKey} value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="schedule-field">
            <label>ห้องเรียน</label>
            <select disabled={!!busyAction || !!savingKey} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              {classrooms.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {isManage && canEdit && selectedClass && (
          <div className="schedule-toolbar">
            <button
              type="button"
              className="schedule-toolbar-btn"
              onClick={() => { setCopyFromClass(copySourceClassrooms[0]?.id || ''); setCopyOpen(true) }}
              disabled={blocked || copySourceClassrooms.length === 0}
            >
              คัดลอกจากห้องอื่น
            </button>
            <button
              type="button"
              className="schedule-toolbar-btn primary"
              onClick={() => handleAutoSchedule(false)}
              disabled={blocked}
            >
              {busyAction === 'auto' ? 'กำลังจัด...' : 'จัดอัตโนมัติห้องนี้'}
            </button>
            <details className="school-auto-actions"><summary>เครื่องมือทั้งโรงเรียน</summary><p>จัดทุกห้องในปีการศึกษาที่เลือก โดยเก็บคาบกิจกรรมไว้</p><button type="button" className="schedule-toolbar-btn primary" disabled={blocked} onClick={() => handleAutoSchedule(true)}>จัดอัตโนมัติทั้งโรงเรียน</button></details>
            <label><input type="checkbox" checked={rebuild} disabled={blocked} onChange={e => setRebuild(e.target.checked)} /> จัดคาบที่ไม่ล็อกใหม่</label>
            <button
              type="button"
              className="schedule-toolbar-btn danger"
              onClick={handleClear}
              disabled={blocked}
            >
              {busyAction === 'clear' ? 'กำลังล้าง...' : 'ล้างห้องนี้'}
            </button>
          </div>
        )}

        {isManage && quotas && <details className="schedule-quota-details"><summary>คาบรายวิชา {quotas.filled} / {quotas.totalTarget} คาบ <span>ดูรายละเอียดโควต้า</span></summary><ScheduleQuotaPanel {...quotas} /></details>}
        {gridLoading && <div role="status">กำลังโหลดตารางเรียน...</div>}

        {isManage && (
          <div className="schedule-info">
            เลือกรายวิชาที่เปิดสอนในห้องนี้ (จาก{' '}
            <Link href="/settings/class-subjects">จัดครูเข้าสอน</Link>
            ) และกิจกรรมที่เปิดใช้ในเมนูกิจกรรมพัฒนาผู้เรียน เลือกลงคาบเองได้โดยไม่ต้องกำหนดครู ระบบจัดอัตโนมัติจะจัดเฉพาะรายวิชาและเก็บคาบกิจกรรมที่ลงไว้
            {' · '}<Link href="/schedules/conflicts">ตรวจความขัดแย้ง</Link>
          </div>
        )}

        {!selectedClass ? (
          <div className="schedule-empty">ไม่พบห้องเรียนในปีการศึกษานี้</div>
        ) : subjects.length === 0 ? (
          <div className="schedule-empty">
            ห้องนี้ยังไม่มีรายวิชาเปิดสอน —{' '}
            <Link href="/settings/class-subjects">ไปกำหนดรายวิชาและครูผู้สอน</Link>
          </div>
        ) : (
          <div className="schedule-grid-card">
            <ScheduleGridTable
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
                          disabled={blocked || locked} onClick={()=>setPicker({day,period})}
                          aria-label={`แก้ไขวัน${SCHEDULE_DAYS.find(d=>d.value===day)?.label} คาบ ${period}`}>
                          {cell?.class_subject_id ? subjectMap[cell.class_subject_id]?.label || 'รายวิชา' : cell?.note || '+ เลือกวิชา'}
                          <small>{locked?'ล็อกคาบแล้ว':cell?.class_subject_id?'คลิกเพื่อเปลี่ยน':'คาบว่าง'}</small>
                        </button>
                        <button
                          type="button"
                          className={`schedule-lock-btn${locked ? ' is-locked' : ''}`}
                          title={locked ? 'ปลดล็อก' : 'ล็อกคาบนี้'}
                          onClick={() => handleToggleLock(day, period)}
                          disabled={blocked}
                        >
                          {locked ? '🔒' : '🔓'}
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
                return <div className="cell-view">{renderCellView(cell)}</div>
              }}
            />
          </div>
        )}

        {isManage && canEdit && selectedClass && subjects.length > 0 && (
          <div style={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>
            คลิกคาบเพื่อเลือกวิชาและบันทึกทันที · กด 🔒 เพื่อล็อกคาบ
            {savingKey && <LoadingButton loading loadingText="กำลังบันทึก..." />}
          </div>
        )}
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
