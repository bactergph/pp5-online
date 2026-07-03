'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  fetchClassScheduleGrid,
  fetchClassScheduleSubjects,
  fetchScheduleClassrooms,
  fetchScheduleInit,
  saveClassScheduleCell,
  clearClassSchedule,
  copyClassSchedule,
  fetchPeriodTimes,
  fetchScheduleQuotas,
  getTeacherConflictAt,
  runAutoScheduleClass,
  toggleScheduleCellLock,
} from '@/app/schedules/actions'
import type { PeriodTimeRow } from '@/lib/schedule-helpers'
import LoadingButton from '@/components/LoadingButton'
import AppAlertModal from '@/components/AppAlertModal'
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
  .schedule-tab.is-active { border-color: #7C3AED; background: #F3E8FF; color: #6D28D9; }
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
    padding: 12px 14px; border-radius: 12px; border: 1px solid #E0E7FF; background: #EEF2FF;
    color: #3730A3; font-size: 12.5px; font-weight: 700; line-height: 1.5;
  }
  .schedule-info a { color: #4F46E5; font-weight: 800; }
  .schedule-toolbar {
    display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
    padding: 12px 14px; border: 1px solid #E5E7EB; border-radius: 14px; background: #FAFBFC;
  }
  .schedule-toolbar-btn {
    min-height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid #CBD5E1;
    background: #fff; color: #334155; font-size: 11.5px; font-weight: 800; cursor: pointer;
  }
  .schedule-toolbar-btn.primary { border-color: #7C3AED; background: #7C3AED; color: #fff; }
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

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (!selectedYear) return
    loadClassrooms(selectedYear)
  }, [selectedYear])

  useEffect(() => {
    if (!selectedClass || !selectedYear) return
    loadGrid()
  }, [selectedClass, selectedYear])

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
    const list = await fetchScheduleClassrooms(yearId) as Classroom[]
    setClassrooms(list)
    setSelectedClass(list[0]?.id || '')
  }

  async function loadGrid() {
    const [grid, subs, quotaData] = await Promise.all([
      fetchClassScheduleGrid(selectedClass, selectedYear),
      fetchClassScheduleSubjects(selectedClass),
      isManage ? fetchScheduleQuotas(selectedClass, selectedYear) : Promise.resolve(null),
    ])
    const gridCells = grid as Record<string, Cell>
    setCells(gridCells)
    setSubjects(subs as SubjectOption[])
    if (quotaData) setQuotas(quotaData as QuotaData)
    if (isManage) {
      const subjMap = Object.fromEntries((subs as SubjectOption[]).map(s => [s.id, s]))
      const warnings: Record<string, string[]> = {}
      const checks: Promise<void>[] = []
      for (const [key, cell] of Object.entries(gridCells)) {
        if (!cell.class_subject_id) continue
        const subj = subjMap[cell.class_subject_id]
        if (!subj?.teacher_id) continue
        const [day, period] = key.split('-').map(Number)
        checks.push(
          getTeacherConflictAt(selectedYear, subj.teacher_id, day, period, selectedClass)
            .then(result => { if (result.busy) warnings[key] = result.rooms }),
        )
      }
      await Promise.all(checks)
      setConflicts(warnings)
    }
  }

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
      await saveClassScheduleCell(selectedClass, selectedYear, day, period, classSubjectId)
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
      const result = await toggleScheduleCellLock(selectedClass, selectedYear, day, period)
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

  async function handleAutoSchedule() {
    if (!window.confirm('จัดตารางอัตโนมัติตามโควต้าที่เหลือ? (ไม่แตะคาบที่ล็อก)')) return
    setBusyAction('auto')
    try {
      const result = await runAutoScheduleClass(selectedClass, selectedYear, 'spread', false)
      await loadGrid()
      setAlert({ type: 'success', title: 'จัดตารางสำเร็จ', message: `จัด ${result.assigned} คาบ` })
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
      await clearClassSchedule(selectedClass, selectedYear)
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
      const result = await copyClassSchedule(copyFromClass, selectedClass, selectedYear)
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
    if (!cell?.class_subject_id) return <span>—</span>
    const subj = subjectMap[cell.class_subject_id]
    if (!subj) return <span>—</span>
    return (
      <>
        <span className="cell-subj">{subj.label}</span>
        <span className="cell-tchr">{subj.teacher_name || 'ยังไม่กำหนดครูผู้สอน'}</span>
      </>
    )
  }

  function teacherLine(classSubjectId: string | null | undefined) {
    if (!classSubjectId) return null
    const subj = subjectMap[classSubjectId]
    if (!subj) return null
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
      <style>{STYLES}</style>
      <div className="schedule-page">
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
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="schedule-field">
            <label>ห้องเรียน</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
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
              disabled={!!busyAction || copySourceClassrooms.length === 0}
            >
              คัดลอกจากห้องอื่น
            </button>
            <button
              type="button"
              className="schedule-toolbar-btn primary"
              onClick={handleAutoSchedule}
              disabled={!!busyAction}
            >
              {busyAction === 'auto' ? 'กำลังจัด...' : 'จัดตารางอัตโนมัติ'}
            </button>
            <button
              type="button"
              className="schedule-toolbar-btn danger"
              onClick={handleClear}
              disabled={!!busyAction}
            >
              {busyAction === 'clear' ? 'กำลังล้าง...' : 'ล้างห้องนี้'}
            </button>
          </div>
        )}

        {isManage && quotas && <ScheduleQuotaPanel {...quotas} />}

        {isManage && (
          <div className="schedule-info">
            เลือกได้เฉพาะรายวิชาที่เปิดสอนในห้องนี้ (จาก{' '}
            <Link href="/settings/class-subjects">จัดครูเข้าสอน</Link>
            ) ครูผู้สอนแสดงอัตโนมัติจากข้อมูลเดิม — ตารางสอนจะอัปเดตตามตารางเรียนนี้
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
                        <select
                          value={cell?.class_subject_id || ''}
                          disabled={savingKey === key || locked}
                          onChange={e => handleCellChange(day, period, e.target.value)}
                        >
                          <option value="">— ว่าง —</option>
                          {subjects.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className={`schedule-lock-btn${locked ? ' is-locked' : ''}`}
                          title={locked ? 'ปลดล็อก' : 'ล็อกคาบนี้'}
                          onClick={() => handleToggleLock(day, period)}
                          disabled={savingKey === key}
                        >
                          {locked ? '🔒' : '🔓'}
                        </button>
                      </div>
                      {teacherLine(cell?.class_subject_id)}
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
            เปลี่ยนรายวิชาในแต่ละช่องแล้วบันทึกอัตโนมัติ · กด 🔒 เพื่อล็อกคาบ
            {savingKey && <LoadingButton loading loadingText="กำลังบันทึก..." />}
          </div>
        )}
      </div>

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
              จะลบตารางปัจจุบันของห้องนี้แล้วคัดลอกจากห้องต้นทาง (จับคู่รายวิชาตาม subject_id)
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
