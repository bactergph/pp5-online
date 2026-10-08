'use client'

import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  fetchClassScheduleBundle,
  fetchScheduleClassrooms,
  fetchScheduleInit,
  saveClassScheduleCell,
  clearScheduleScope,
  copyClassSchedule,
  fetchPeriodTimes,
  fetchScheduleQuotas,
  getTeacherConflictAt,
  runAutoScheduleClass,
  runAutoScheduleSchool,
  toggleScheduleCellLock,
} from '@/app/schedules/actions'
import type { PeriodTimeRow } from '@/lib/schedule-helpers'
import ScheduleLessonPicker from './ScheduleLessonPicker'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import ScheduleGridTable from '@/components/schedules/ScheduleGridTable'
import ScheduleQuotaPanel from '@/components/schedules/ScheduleQuotaPanel'
import TeacherAvailabilityPanel from './TeacherAvailabilityPanel'

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

const scheduleAlert = Swal.mixin({confirmButtonColor:'#946b25',cancelButtonColor:'#64748b',confirmButtonText:'ตกลง',cancelButtonText:'ยกเลิก',reverseButtons:true})
function setAlert(alert: {type:'success'|'error';title:string;message?:string}) {
  void scheduleAlert.fire({icon:alert.type,title:alert.title,text:alert.message})
}

export default function ClassScheduleEntry({ mode }: Props) {
  const [workspace,setWorkspace]=useState<'class'|'teacher'>('class')
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

  const subjectMap = useMemo(
    () => Object.fromEntries(subjects.map(s => [s.id, s])),
    [subjects],
  )

  const selectedClassroom = classrooms.find(c => c.id === selectedClass)
  const quotaOptions = subjects.map(s=>{
    const quota=quotas?.items.find(q=>q.class_subject_id===s.id)
    const target=s.id.startsWith('activity:')?1:quota?.target
    const used=Object.values(cells).filter(c=>c.class_subject_id===s.id).length
    const selected=picker&&cells[`${picker.day}-${picker.period}`]?.class_subject_id===s.id
    return {...s,disabled:target!==undefined&&used>=target&&!selected,quotaLabel:target===undefined?'':`ลงแล้ว ${used} / ${target} คาบต่อสัปดาห์${used>target?' · เกินจำนวน':used===target?' · ครบแล้ว':` · เหลือ ${target-used}`}`}
  })
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
    if (blocked || quotaOptions.find(s=>s.id===value)?.disabled) {
      setAlert({type:'error',title:'ลงวิชาไม่ได้',message:'รายวิชานี้ลงครบจำนวนคาบต่อสัปดาห์แล้ว กรุณานำคาบเดิมออกก่อน'})
      return
    }
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
    if (!(await scheduleAlert.fire({icon:'question',title:wholeSchool?'จัดตารางทั้งโรงเรียน?':'จัดตารางห้องนี้?',text:rebuild?'จัดรายวิชาที่ไม่ล็อกใหม่ โดยเก็บกิจกรรมและคาบที่ล็อกไว้':'เติมเฉพาะช่องว่าง โดยตรวจครูไม่ชนกัน',showCancelButton:true,confirmButtonText:'เริ่มจัดตาราง'})).isConfirmed) return
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

  async function handleClear(scope:'room'|'level'|'school'='room') {
    if(blocked)return
    const label=scope==='school'?'ทั้งโรงเรียน':scope==='level'?`ระดับชั้น ${selectedClassroom?.level}`:`ห้อง ${selectedClassroom?.label}`
    const roomCount=scope==='school'?classrooms.length:scope==='level'?classrooms.filter(c=>c.level===selectedClassroom?.level).length:1
    if (!(await scheduleAlert.fire({icon:'warning',title:`ล้างตาราง${label}?`,text:`ปีการศึกษา ${selectedYearObj?.year_be} ภาคเรียนที่ ${semester} · ${roomCount} ห้อง นำเฉพาะคาบที่ไม่ล็อกออก คาบที่ล็อกและล็อกคาบว่างของครูจะเก็บไว้`,showCancelButton:true,confirmButtonText:'ยืนยันล้างตาราง',confirmButtonColor:'#be3340'})).isConfirmed) return
    setBusyAction('clear')
    try {
      const result = await clearScheduleScope(selectedYear,semester,scope,selectedClass)
      if (result.error) throw new Error(result.error)
      await loadGrid()
      setAlert({ type: 'success', title: 'ล้างตารางสำเร็จ',message:`${label} · ${result.data?.rooms} ห้อง · นำออก ${result.data?.removed} คาบ` })
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
        <span className="text-xs font-normal text-stone-500">{activity ? 'กิจกรรมพัฒนาผู้เรียน' : subj.subject_code}</span>
        <span className="line-clamp-2 text-[13px] font-semibold leading-5" title={subj.label}>{subj.subject_name}</span>
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
      <div className={`mt-2 truncate px-1 text-xs ${missing?'text-amber-700':'text-stone-500'}`}>
        {subj.teacher_name || 'ยังไม่กำหนดครู — ไปที่จัดครูเข้าสอน'}
      </div>
    )
  }

  const manageHref = '/schedules/class/manage'

  if (loading) {
    return <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">กำลังโหลด...</div>
  }

  return (
    <>
      <div className="grid min-w-0 gap-5 text-stone-800 [&_button]:rounded-md! [&_select]:rounded-md! [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50 [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-amber-600">
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm [&_h1]:text-2xl [&_h1]:font-bold [&_p]:mt-2 [&_p]:text-sm [&_p]:text-stone-500">
          <div>
            <h1>{workspace==='teacher'?'ตารางสอน/ล็อคคาบ':isManage ? 'จัดการตารางเรียน' : 'ตารางเรียน'}</h1>
            <p>
              {workspace==='teacher' ? `ภาคเรียนที่ ${semester} · ปีการศึกษา ${selectedYearObj?.year_be || ''}` : selectedClassroom && selectedYearObj
                ? `ห้อง ${selectedClassroom.label} · ภาคเรียนที่ ${semester} · ปีการศึกษา พ.ศ. ${selectedYearObj.year_be}`
                : isManage
                  ? 'กำหนดวิชาในแต่ละคาบ — ครูผู้สอนดึงจากข้อมูลจัดครูเข้าสอน'
                  : 'ดูตารางเรียนรายห้อง'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
          {isManage && canEdit ? <div role="tablist" aria-label="จัดตาราง" className="flex flex-wrap gap-1 border-b border-stone-300">
            <button role="tab" aria-selected={workspace==='class'} onClick={()=>setWorkspace('class')} className={`border-b-2 px-4 py-3 text-sm font-semibold ${workspace==='class'?'border-amber-700 text-amber-900':'border-transparent text-stone-500'}`}>ตารางเรียน</button>
            <button role="tab" aria-selected={workspace==='teacher'} onClick={()=>setWorkspace('teacher')} className={`border-b-2 px-4 py-3 text-sm font-semibold ${workspace==='teacher'?'border-amber-700 text-amber-900':'border-transparent text-stone-500'}`}>ตารางสอน/ล็อคคาบ</button>
          </div> : canEdit && <Link href={manageHref} className="text-sm font-semibold text-amber-900">จัดการตารางเรียน</Link>}
          {workspace==='class' && selectedClass && <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50" aria-disabled={blocked} onClick={e => { if (blocked) e.preventDefault() }} href={`/export/schedules?print=1&type=class&year=${selectedYear}&semester=${semester}&classroom=${selectedClass}`}>พิมพ์ / PDF</Link>}
          </div>
        </div>

        <div className={`grid gap-4 rounded-lg border border-stone-200 bg-white p-5 shadow-sm ${workspace==='teacher'?'sm:grid-cols-2':'sm:grid-cols-3'}`}>
          <div className="grid min-w-0 gap-2 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-stone-500 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-stone-300 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm">
            <label htmlFor="schedule-year">ปีการศึกษา</label>
            <select id="schedule-year" disabled={!!busyAction || !!savingKey} value={selectedYear} onChange={e => { setPicker(null); setSelectedYear(e.target.value) }}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-2 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-stone-500 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-stone-300 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm">
            <label htmlFor="schedule-term">ภาคเรียน</label>
            <select id="schedule-term" disabled={!!busyAction || !!savingKey} value={semester} onChange={e => { setPicker(null); setSemester(Number(e.target.value)) }}>
              <option value={1}>ภาคเรียนที่ 1</option>
              <option value={2}>ภาคเรียนที่ 2</option>
            </select>
          </div>

          {workspace==='class' && (          <div className="grid min-w-0 gap-2 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-stone-500 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-stone-300 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm">
            <label htmlFor="schedule-class">ห้องเรียน</label>
            <select id="schedule-class" disabled={!!busyAction || !!savingKey} value={selectedClass} onChange={e => { setPicker(null); setSelectedClass(e.target.value) }}>
              {classrooms.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>)}
        </div>

        {workspace==='class' && isManage && canEdit && selectedClass && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 border-amber-700! bg-amber-800! text-white! hover:bg-amber-900!" disabled={blocked} onClick={() => handleAutoSchedule(false)}>{busyAction === 'auto' ? 'กำลังจัดตาราง...' : 'จัดอัตโนมัติห้องนี้'}</button>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={blocked} onClick={() => handleAutoSchedule(true)}>จัดทั้งโรงเรียน</button>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700" role="status">{savingKey ? 'กำลังบันทึก...' : busyAction ? 'กำลังดำเนินการ...' : gridLoading ? 'กำลังโหลด...' : blocked ? 'รอข้อมูลตาราง' : 'บันทึกอัตโนมัติ'}</span>
            </div>
            <details className="relative">
              <summary className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50">เครื่องมือเพิ่มเติม ▾</summary>
              <div className="absolute right-0 top-14 z-20 grid w-80 gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl [&_label]:flex [&_label]:gap-2 [&_label]:text-sm [&_input]:accent-amber-700 [&_p]:text-xs [&_p]:leading-6 [&_p]:text-stone-500">
                <label><input type="checkbox" checked={rebuild} disabled={blocked} onChange={e => setRebuild(e.target.checked)} /> จัดรายวิชาที่ไม่ล็อกใหม่</label>
                <p>{rebuild ? 'จัดรายวิชาใหม่ โดยเก็บคาบที่ล็อกและกิจกรรมไว้' : 'จัดอัตโนมัติจะเติมเฉพาะช่องว่าง'} · เว้นคาบสุดท้ายไว้เมื่อทำได้</p>
                <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={blocked || copySourceClassrooms.length === 0} onClick={() => { setCopyFromClass(copySourceClassrooms[0]?.id || ''); setCopyOpen(true) }}>คัดลอกจากห้องอื่น</button>
                <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 border-rose-200! text-rose-700! hover:bg-rose-50!" disabled={blocked} onClick={()=>handleClear('room')}>{busyAction === 'clear' ? 'กำลังล้าง...' : 'ล้างคาบที่ไม่ล็อกของห้องนี้'}</button>
                <button type="button" className="rounded-md border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={blocked} onClick={()=>handleClear('level')}>ล้างตารางทั้งระดับชั้น {selectedClassroom?.level}</button>
                <button type="button" className="rounded-md border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={blocked} onClick={()=>handleClear('school')}>ล้างตารางทั้งโรงเรียน</button>
              </div>
            </details>
          </div>
        )}


        {workspace==='class' && isManage && quotas && <div className="grid gap-4 sm:grid-cols-3 [&_article]:grid [&_article]:gap-2 [&_article]:rounded-2xl [&_article]:border [&_article]:border-stone-200 [&_article]:bg-white [&_article]:p-5 [&_article]:shadow-sm [&_strong]:text-3xl [&_strong]:font-semibold [&_strong]:text-stone-800 [&_span]:text-xs [&_span]:text-stone-500">
          <article><strong>{quotas.filled} / {quotas.totalTarget}</strong><span>คาบรายวิชาที่จัด / ต้องเรียนต่อสัปดาห์</span></article>
          <article className={quotas.items.some(q=>q.used>q.target)?'border-rose-300! bg-rose-50!':''}><strong>{quotas.items.reduce((sum,q)=>sum+Math.max(0,q.remaining),0)}</strong><span>คาบรายวิชาที่ยังขาด{quotas.items.some(q=>q.used>q.target)?' · พบวิชาเกินคาบ กรุณานำออก':''}</span></article>
          <article><strong>{Object.values(cells).filter(c=>c.locked).length}</strong><span>คาบที่ล็อก · ระบบอัตโนมัติจะเก็บไว้</span></article>
        </div>}
        {gridLoading && <div role="status">กำลังโหลดตารางเรียน...</div>}

        {workspace==='teacher' && isManage && canEdit ? <section className="border border-stone-300 bg-white p-5"><h2 className="mb-4 text-lg font-semibold">ตารางสอน/ล็อคคาบ</h2><TeacherAvailabilityPanel key={`${selectedYear}:${semester}`} onChanged={loadGrid} expanded refreshToken={JSON.stringify(cells)} yearId={selectedYear} semester={semester} periodTimes={periodTimes} disabled={!!busyAction||!!savingKey} /></section> : !selectedClass ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">ไม่พบห้องเรียนในปีการศึกษานี้</div>
        ) : subjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
            ห้องนี้ยังไม่มีรายวิชาเปิดสอน —{' '}
            <Link href="/settings/class-subjects">ไปกำหนดรายวิชาและครูผู้สอน</Link>
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-sm" aria-label="ตารางเรียนรายสัปดาห์">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-5 py-4 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-1 [&_p]:text-xs [&_p]:text-stone-500"><div><h2>ห้อง {selectedClassroom?.label}</h2><p>ภาคเรียนที่ {semester} · ปีการศึกษา {selectedYearObj?.year_be}</p></div><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">จัดแล้ว {Object.values(cells).filter(c => c.class_subject_id).length} / {periodTimes.filter(t=>!t.is_break).length*5} คาบ</span></div>
            <div className="overflow-x-auto [&_table]:w-full [&_table]:table-fixed [&_table]:min-w-[880px]! [&_th]:border-stone-300! [&_td]:border-stone-200! [&_th]:bg-stone-100! [&_th]:py-2! [&_th]:text-sm! [&_th]:font-semibold! [&_th]:text-black! [&_.period-time]:text-xs! [&_.period-time]:font-normal! [&_.period-time]:text-stone-500! [&_.col-day]:w-20 [&_.day-col]:bg-stone-100! [&_.day-col]:text-stone-700! [&_.col-break]:w-9 [&_.col-break]:min-w-9! [&_.break-col]:bg-amber-50! [&_.cell]:p-1.5! [&_.cell]:h-28 [&_.cell]:align-top">
            <ScheduleGridTable compactBreak
              periodTimes={periodTimes}
              renderCell={(day, period) => {
                const key = `${day}-${period}`
                const cell = cells[key]
                const conflictRooms = conflicts[key]
                if (isManage && canEdit) {
                  const locked = cell?.locked ?? false
                  return (
                    <div className={`grid gap-1 ${conflictRooms?.length ? 'rounded-xl bg-rose-50' : ''}`}>
                      <div className="grid gap-2">
                        <button type="button" className={`flex min-h-14 w-full flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left transition ${cell?.class_subject_id?.startsWith('activity:')?'border-emerald-200 bg-emerald-50 text-emerald-900':locked?'border-amber-300 bg-amber-50 text-stone-800':'border-stone-200 bg-white text-stone-800 hover:border-amber-400 hover:bg-amber-50/50'}`} 
                          title={cell?.class_subject_id ? subjectMap[cell.class_subject_id]?.label : 'เพิ่มรายวิชาหรือกิจกรรม'} disabled={blocked || locked} onClick={()=>setPicker({day,period})}
                          aria-label={`แก้ไขวัน${SCHEDULE_DAYS.find(d=>d.value===day)?.label} คาบ ${period}`}>
                          {cell?.class_subject_id ? <><span className="text-xs font-normal text-stone-500">{subjectMap[cell.class_subject_id]?.subject_code || 'กิจกรรม'}</span><span className="line-clamp-2 text-[13px] font-semibold leading-5">{subjectMap[cell.class_subject_id]?.subject_name || 'รายวิชา'}</span></> : <span className="text-sm text-stone-400">{cell?.note || '+ เพิ่มวิชา'}</span>}

                        </button>
                        <button
                          type="button"
                          className={`inline-flex w-fit items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition ${locked?'border-amber-200 bg-amber-100 text-amber-900':'border-stone-200 bg-stone-50 text-stone-500 hover:border-amber-300 hover:text-amber-800'}`}
                          title={locked ? 'ปลดล็อก' : 'ล็อกคาบนี้'}
                          aria-label={locked ? 'ปลดล็อกคาบ' : 'ล็อกคาบ'}
                          aria-pressed={locked}
                          onClick={() => handleToggleLock(day, period)}
                          disabled={blocked}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d={locked?'M8 10V6a4 4 0 018 0v4':'M8 10V6a4 4 0 018 0'}/></svg>
                          <span>{locked?'ปลดล็อก':cell?.class_subject_id?'ล็อกวิชา':'ล็อกคาบว่าง'}</span>
                        </button>
                      </div>
                      {teacherLine(cell?.class_subject_id)}
                      {cell?.note && !cell.class_subject_id && <div className="mt-2 truncate px-1 text-xs text-stone-500">{cell.note}</div>}
                      {conflictRooms?.length ? (
                        <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
                          ซ้ำ: {conflictRooms.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  )
                }
                return <div className={`flex min-h-14 flex-col gap-0.5 rounded-md px-2 py-1.5 ${cell?.class_subject_id?.startsWith('activity:')?'bg-emerald-50':'bg-stone-50'}`}>{renderCellView(cell)}</div>
              }}
            />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-5 py-4 text-xs text-stone-500"><span>{isManage && canEdit ? 'คลิกคาบเพื่อเลือกวิชา · บันทึกทันที' : 'ตารางเรียนรายสัปดาห์'}</span><div className="flex flex-wrap gap-4 [&_span]:inline-flex [&_span]:items-center [&_span]:gap-2 [&_a]:font-semibold [&_a]:text-amber-800"><span><i className="h-2.5 w-2.5 rounded-full bg-emerald-300" />กิจกรรม</span><span><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />คาบที่ล็อก</span><Link href="/schedules/conflicts">ตรวจคาบชน</Link></div></div>
          </section>
        )}

        {workspace==='class' && isManage && quotas && <details open className="overflow-auto rounded-2xl border border-stone-200 bg-white p-5 [&_summary]:cursor-pointer [&_summary]:text-sm [&_summary]:font-semibold [&_summary_span]:mt-1 [&_summary_span]:block [&_summary_span]:text-xs [&_summary_span]:font-normal [&_summary_span]:text-stone-500 [&_.quota-panel]:mt-4 [&_.quota-panel]:min-w-[560px]"><summary>ชั่วโมงเรียนของห้อง · รายวิชา {quotas.filled} / {quotas.totalTarget} คาบต่อสัปดาห์ <span>คำนวณจากชั่วโมงต่อปี ÷ 40 สัปดาห์ · กิจกรรมแยกวิชาละ 1 คาบ</span></summary><ScheduleQuotaPanel {...quotas} capacity={periodTimes.filter(t=>!t.is_break).length*5} /></details>}

      </div>

      {picker && <ScheduleLessonPicker title={`วัน${SCHEDULE_DAYS.find(d=>d.value===picker.day)?.label} · คาบ ${picker.period}`} options={quotaOptions} selected={cells[`${picker.day}-${picker.period}`]?.class_subject_id || null} onClose={()=>setPicker(null)} onChoose={id=>{const {day,period}=picker;setPicker(null);void handleCellChange(day,period,id)}} />}
      {copyOpen && (
        <div className="fixed inset-0 z-[9000] grid place-items-center bg-stone-950/40 p-5 backdrop-blur-sm" onClick={() => setCopyOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl [&_h3]:mb-5 [&_h3]:text-lg [&_h3]:font-semibold" onClick={e => e.stopPropagation()}>
            <h3>คัดลอกตารางจากห้องอื่น</h3>
            <div className="grid min-w-0 gap-2 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-stone-500 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-stone-300 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm">
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
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setCopyOpen(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 border-amber-700! bg-amber-800! text-white! hover:bg-amber-900!"
                onClick={handleCopy}
                disabled={!copyFromClass || busyAction === 'copy'}
              >
                {busyAction === 'copy' ? 'กำลังคัดลอก...' : 'คัดลอก'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
