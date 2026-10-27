'use client'
import { useScheduleOperations } from './ScheduleServices'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import Link from './ScheduleLink'
import { enqueueFileExport } from '@/lib/pdf/pdf-export-queue'
import { buildSchedulePdfBlob } from '@/lib/jspdf-schedules'
import { scheduleSchoolName } from '@/lib/schedule-school-name'
import { directorDisplayName } from '@/lib/school-director'
import { activityTimetableTeacherLabel, isActivityLessonId, periodTimeLabel, scheduleSemesterForYear, teacherTimetableName, type PeriodTimeRow } from '@/lib/schedule-helpers'
import ScheduleLessonPicker from './ScheduleLessonPicker'
import ScheduleLessonPalette from './ScheduleLessonPalette'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import ScheduleGridTable from '@/components/schedules/ScheduleGridTable'
import ScheduleQuotaPanel from '@/components/schedules/ScheduleQuotaPanel'
import TeacherAvailabilityPanel from './TeacherAvailabilityPanel'
import SchedulePreparation from './SchedulePreparation'
import SchedulePlacesEntry from './SchedulePlacesEntry'
import { FiZap, FiGrid, FiUsers, FiCalendar, FiDownload, FiMapPin, FiSettings } from 'react-icons/fi'
import './schedule-workspace.css'

type Year = { id: string; year_be: number; is_active: boolean; term1_start_date?: string | null; term1_end_date?: string | null; term2_start_date?: string | null; term2_end_date?: string | null }
type Classroom = { id: string; level: string; room: number; label: string }
type SubjectOption = {
  id: string
  teacher_id: string | null
  subject_code: string
  subject_name: string
  room_name?: string
  teacher_name: string
  label: string
}
type Cell = { class_subject_id: string | null; note: string | null; locked: boolean; expected_lesson_id?: string | null }
type QuotaData = {
  items: { class_subject_id: string; code: string; name: string; target: number; used: number; remaining: number }[]
  filled: number
  totalTarget: number
}

type Props = {
  mode: 'view' | 'manage'
  initialWorkspace?: 'class' | 'prepare'
  initialStep?: number
  onSchoolSettings?: () => void
  schoolSettingsDisabled?: boolean
}

const scheduleAlert = Swal.mixin({confirmButtonColor:'#245bdb',cancelButtonColor:'#64748b',confirmButtonText:'ตกลง',cancelButtonText:'ยกเลิก',reverseButtons:true})
function setAlert(alert: {type:'success'|'error';title:string;message?:string}) {
  void scheduleAlert.fire({icon:alert.type,title:alert.title,text:alert.message})
}

export default function ClassScheduleEntry({ mode, initialWorkspace='class', initialStep=1, onSchoolSettings, schoolSettingsDisabled }: Props) {
  const { fetchScheduleDays, fetchClassScheduleBundle, fetchSchedulePdfGrids, fetchScheduleExportContext, fetchScheduleClassrooms, fetchScheduleInit, saveClassScheduleCell, moveClassScheduleCell, clearScheduleScope, copyClassSchedule, fetchPeriodTimes, fetchScheduleQuotas, getTeacherConflictAt, toggleScheduleCellLock } = useScheduleOperations()

  const [dragLesson,setDragLesson] = useState<{id:string;from?:{day:number;period:number};context:string}|null>(null)
  const [dropKey,setDropKey] = useState<string|null>(null)
  const [paletteFilter,setPaletteFilter] = useState('')
  const [paletteSelection,setPaletteSelection] = useState<string|null>(null)
  const [showCompleted,setShowCompleted] = useState(false)
  const [preparationBusy,setPreparationBusy]=useState(false)
  const [preparationDirty,setPreparationDirty]=useState(false)
  async function leavePreparation(change:()=>void){if(preparationBusy)return;if(preparationDirty&&!(await scheduleAlert.fire({icon:'warning',title:'ออกจากหน้าที่กำลังแก้ไข?',text:'ข้อมูลที่ยังไม่บันทึกจะหาย และฉบับร่างจะยังไม่ถูกนำไปใช้',showCancelButton:true})).isConfirmed)return;change()}
  const [preparationRooms,setPreparationRooms]=useState<string[]|undefined>(undefined)
  const [preparationStep,setPreparationStep]=useState(initialStep)
  const [workspace,setWorkspace]=useState<'class'|'teacher'|'activity'|'places'|'prepare'>(initialWorkspace)
  const isManage = mode === 'manage'
  const [picker, setPicker] = useState<{day:number;period:number} | null>(null)
  const [scheduleDays,setScheduleDays]=useState<number[]>([1,2,3,4,5])
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<Year[]>([])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const [quotas, setQuotas] = useState<QuotaData | null>(null)
  const [periodTimes, setPeriodTimes] = useState<PeriodTimeRow[]>([])
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({})
  const [selectedYear, setSelectedYear] = useState('')
  const [semester, setSemester] = useState<number>(() => scheduleSemesterForYear(null))
  const [selectedClass, setSelectedClass] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set())
  const pendingRef = useRef(new Set<string>())
  const editQueue = useRef<Promise<void>>(Promise.resolve())
  const savingKey = pendingCells.size > 0
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [gridLoading, setGridLoading] = useState(false)
  const [loadedContext, setLoadedContext] = useState('')
  const gridRequest = useRef(0)
  const roomRequest = useRef(0)
  const blocked = !!busyAction || !!savingKey || gridLoading || loadedContext !== `${selectedYear}:${semester}:${selectedClass}`
  const cellBlocked = !!busyAction || gridLoading || loadedContext !== `${selectedYear}:${semester}:${selectedClass}`
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyFromClass, setCopyFromClass] = useState('')
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfRooms, setPdfRooms] = useState<string[]>([])
  const [mobileDay, setMobileDay] = useState(1)

  const subjectMap = useMemo(
    () => Object.fromEntries(subjects.map(s => [s.id, s])),
    [subjects],
  )

  const selectedClassroom = classrooms.find(c => c.id === selectedClass)
  function classLines(id: string | null | undefined) {
    const subject = id ? subjectMap[id] : undefined
    if (!subject) return null
    const activity = isActivityLessonId(id)
    return {
      activity,
      name: subject.subject_name || (activity ? 'กิจกรรม' : 'รายวิชา'),
      code: subject.subject_code ? `(${subject.subject_code})` : activity ? '(กิจกรรม)' : '',
      teacher: (activity ? activityTimetableTeacherLabel(subject.teacher_name) : teacherTimetableName(subject.teacher_name)) || (activity ? 'ยังไม่กำหนดทีมครู' : 'ยังไม่กำหนดครู'),
      room: subject.room_name || '',
    }
  }
  function subjectBlock(id: string | null | undefined, note?: string | null) {
    const lines = classLines(id)
    if (!lines) return <span className="text-sm text-stone-400">{note || '+ เพิ่มวิชา'}</span>
    return <span className="sched-lines"><b>{lines.name}</b>{lines.code && <span className="code">{lines.code}</span>}<span className="teacher">{lines.teacher}</span>{lines.room && <span className="room">{lines.room}</span>}</span>
  }
  function classTitle(room: Classroom) {
    const classLabel = room.label.replace(/^ป\.\s*/, 'ชั้นประถมศึกษาปีที่ ').replace(/^ม\.\s*/, 'ชั้นมัธยมศึกษาปีที่ ').replace(/^อ\.\s*/, 'ชั้นอนุบาลปีที่ ')
    const year = years.find(y => y.id === selectedYear)?.year_be || ''
    return `ตารางเรียน ภาคเรียนที่ ${semester} ปีการศึกษา ${year} ${classLabel}`
  }
  function openClassPdf() {
    if (blocked || !selectedClass) return
    setPdfRooms([selectedClass])
    setPdfOpen(true)
  }
  function downloadClassPdf() {
    const rooms = classrooms.filter(room => pdfRooms.includes(room.id))
    if (!rooms.length) return
    setPdfOpen(false)
    const fileName = (rooms.length === 1 ? classTitle(rooms[0]) : `ตารางเรียน ${rooms.length} ห้อง`).replace(/[\\/:*?"<>|]/g, '-') + '.pdf'
    const times = [...periodTimes]
    const days = [...scheduleDays]
    enqueueFileExport({ fileName, label: rooms.length === 1 ? `ตารางเรียน · ${rooms[0].label}` : `ตารางเรียน · ${rooms.length} ห้อง`, run: async () => {
      const [ctx, grids] = await Promise.all([
        fetchScheduleExportContext(),
        fetchSchedulePdfGrids(selectedYear, semester, 'class', rooms.map(room => room.id)),
      ])
      const pages = rooms.map(room => ({ title: classTitle(room), gridData: grids[room.id] }))
      return buildSchedulePdfBlob({ days, pages, title: pages[0].title, fileName, gridData: pages[0].gridData, periodTimes: times, schoolName: scheduleSchoolName(ctx.school?.name), schoolLogoUrl: ctx.school?.logo_url, academicHeadName: ctx.school?.academic_head_name || '', directorName: directorDisplayName(ctx.school, ''), directorPosition: ctx.school?.acting_director ? 'รักษาการในตำแหน่งผู้อำนวยการสถานศึกษา' : ctx.school?.director_position || 'ผู้อำนวยการสถานศึกษา' })
    }})
  }
  const quotaOptions = subjects.map(s=>{
    const quota=quotas?.items.find(q=>q.class_subject_id===s.id)
    const target=isActivityLessonId(s.id)?Math.max(1,Object.values(cells).filter(c=>c.class_subject_id===s.id).length):quota?.target
    const used=Object.values(cells).filter(c=>c.class_subject_id===s.id).length
    const selected=picker&&cells[`${picker.day}-${picker.period}`]?.class_subject_id===s.id
    return {...s,disabled:target!==undefined&&used>=target&&!selected,quotaLabel:target===undefined?'':`ลงแล้ว ${used} / ${target} คาบต่อสัปดาห์${used>target?' · เกินจำนวน':used===target?' · ครบแล้ว':` · เหลือ ${target-used}`}`}
  })
  const remainingLessons = subjects.map(s=>{
    const target=isActivityLessonId(s.id)?Math.max(1,Object.values(cells).filter(c=>c.class_subject_id===s.id).length):quotas?.items.find(q=>q.class_subject_id===s.id)?.target
    const used=Object.values(cells).filter(c=>c.class_subject_id===s.id).length
    return {...s,target,used,remaining:target===undefined?undefined:Math.max(0,target-used)}
  }).filter(s=>(showCompleted||s.remaining!==0)&&[s.subject_name,s.subject_code,s.teacher_name,s.room_name].join(' ').toLowerCase().includes(paletteFilter.toLowerCase()))
  const selectedYearObj = years.find(y => y.id === selectedYear)
  const copySourceClassrooms = classrooms.filter(c => c.id !== selectedClass)

  const init = useCallback(async () => {
    try {
      const [data, periodData] = await Promise.all([
        fetchScheduleInit(),
        fetchPeriodTimes(),
      ])
      setCanEdit(data.canEdit)
      setYears(data.years as Year[])
      setPeriodTimes(periodData.times as PeriodTimeRow[])
      const active = (data.years as Year[]).find(y => y.is_active) || (data.years as Year[])[0]
      if (active) { setSelectedYear(active.id); setSemester(scheduleSemesterForYear(active)) }
    } catch (e) {
      setAlert({ type: 'error', title: 'โหลดไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setLoading(false)
    }
  },[fetchScheduleInit,fetchPeriodTimes])

  const loadClassrooms = useCallback(async (yearId: string) => {
    const request = ++roomRequest.current
    ++gridRequest.current
    setSelectedClass(''); setCells({}); setSubjects([]); setQuotas(null)
    try {
      const list = await fetchScheduleClassrooms(yearId) as Classroom[]
      if (request !== roomRequest.current) return
      setClassrooms(list)
      setSelectedClass(list[0]?.id || '')
    } catch (e) { setAlert({ type: 'error', title: 'โหลดห้องเรียนไม่สำเร็จ', message: e instanceof Error ? e.message : 'เกิดข้อผิดพลาด' }) }
  },[fetchScheduleClassrooms])

  const loadGrid = useCallback(async () => {
    const request = ++gridRequest.current
    setGridLoading(true)
    try {
    const [bundle,days] = await Promise.all([fetchClassScheduleBundle(selectedClass, selectedYear, semester),fetchScheduleDays(selectedYear,semester)])
    if (request !== gridRequest.current) return
    setScheduleDays(days)
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
  }, [selectedClass, selectedYear, semester,fetchClassScheduleBundle,fetchScheduleDays])

  async function refreshPreparation() {
    try {
      const [list, times] = await Promise.all([fetchScheduleClassrooms(selectedYear), fetchPeriodTimes()])
      setClassrooms(list); setPeriodTimes(times.times)
      if (list.some(room => room.id === selectedClass)) await loadGrid()
      else setSelectedClass(list[0]?.id || '')
    } catch (error) { setAlert({type:'error',title:'โหลดข้อมูลล่าสุดไม่สำเร็จ',message:error instanceof Error ? error.message : 'กรุณาลองใหม่'}) }
  }

  useEffect(()=>{if(!selectedYear)return;let active=true;fetchScheduleDays(selectedYear,semester).then(days=>{if(active)setScheduleDays(days)}).catch(()=>{});return()=>{active=false}},[selectedYear,semester,fetchScheduleDays])
  useEffect(() => { void Promise.resolve().then(init) }, [init])
  useEffect(() => {
    if (!selectedYear) return
    void Promise.resolve().then(() => loadClassrooms(selectedYear))
  }, [selectedYear,loadClassrooms])
  useEffect(() => {
    if (!selectedClass || !selectedYear) return
    void Promise.resolve().then(loadGrid)
  }, [loadGrid, selectedClass, selectedYear])

  function queueCellEdit(day: number, period: number, action: () => Promise<void>) {
    const key = `${day}-${period}`
    if (cellBlocked || pendingRef.current.has(key)) return
    pendingRef.current.add(key)
    setPendingCells(new Set(pendingRef.current))
    const run = editQueue.current.then(action).finally(() => {
      pendingRef.current.delete(key)
      setPendingCells(new Set(pendingRef.current))
    })
    editQueue.current = run.catch(() => {})
    return run
  }

  function handleCellChange(day: number, period: number, value: string) {
    return queueCellEdit(day, period, () => saveCellChange(day, period, value))
  }
  function placePaletteLesson(day:number,period:number) {
    const payload=dragLesson || (paletteSelection?{id:paletteSelection,context:`${selectedYear}:${semester}:${selectedClass}`}:null)
    setDragLesson(null);setDropKey(null)
    if(!payload || payload.context!==`${selectedYear}:${semester}:${selectedClass}` || cellBlocked) return
    const key=`${day}-${period}`
    if(cells[key]?.locked || pendingRef.current.has(key)) return
    if(cells[key]?.class_subject_id || cells[key]?.note) {setAlert({type:'error',title:'กรุณาเลือกคาบว่าง',message:'นำวิชาเดิมออกก่อนวางวิชาใหม่'});return}
    if(!payload.from) {setPaletteSelection(null);void handleCellChange(day,period,payload.id);return}
    const fromKey=`${payload.from.day}-${payload.from.period}`
    if(pendingRef.current.has(fromKey)||cells[fromKey]?.locked) return
    pendingRef.current.add(fromKey);setPendingCells(new Set(pendingRef.current))
    void queueCellEdit(day,period,async()=>{
      try {
        const result=await moveClassScheduleCell(selectedClass,selectedYear,payload.from!.day,payload.from!.period,day,period,payload.id,semester)
        if(result.error) throw Error(result.error)
        setCells(current=>{
          const next={...current,[key]:{class_subject_id:payload.id,note:null,locked:false}}
          delete next[fromKey]
          return next
        })
        setConflicts(current=>{const next={...current};delete next[fromKey];delete next[key];return next})
      } catch(e) {setAlert({type:'error',title:'ย้ายคาบไม่สำเร็จ',message:e instanceof Error?e.message:'เกิดข้อผิดพลาด'})}
      finally {pendingRef.current.delete(fromKey);setPendingCells(new Set(pendingRef.current))}
    })
  }

  async function saveCellChange(day: number, period: number, value: string) {
    const key = `${day}-${period}`
    const cell = cells[key]
    if (cell?.locked) return

    const classSubjectId = value || null
    if (cellBlocked || quotaOptions.find(s=>s.id===value)?.disabled) {
      setAlert({type:'error',title:'ลงวิชาไม่ได้',message:'รายวิชานี้ลงครบจำนวนคาบต่อสัปดาห์แล้ว กรุณานำคาบเดิมออกก่อน'})
      return
    }
    const prev = cells[key]
    const expected = cell && 'expected_lesson_id' in cell ? cell.expected_lesson_id ?? null : cell?.class_subject_id || null
    setCells(current => ({
      ...current,
      [key]: { ...current[key], class_subject_id: classSubjectId, note: null, expected_lesson_id: classSubjectId },
    }))
    try {
      const saved = await saveClassScheduleCell(selectedClass, selectedYear, day, period, classSubjectId, null, semester, expected)
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
    }
  }

  function handleToggleLock(day: number, period: number) {
    return queueCellEdit(day, period, () => saveToggleLock(day, period))
  }

  async function saveToggleLock(day: number, period: number) {
    const key = `${day}-${period}`
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
    }
  }

  function handleAutoSchedule(whole=false) { setPreparationRooms(whole?undefined:[selectedClass]);setPreparationStep(7);setWorkspace('prepare') }

  async function handleClear(scope:'room'|'level'|'school'='room') {
    if(blocked)return
    const label=scope==='school'?'ทั้งโรงเรียน':scope==='level'?`ระดับชั้น ${selectedClassroom?.level}`:`ห้อง ${selectedClassroom?.label}`
    const roomCount=scope==='school'?classrooms.length:scope==='level'?classrooms.filter(c=>c.level===selectedClassroom?.level).length:1
    if (!(await scheduleAlert.fire({icon:'warning',title:`ล้างตาราง${label}?`,text:`ปีการศึกษา ${selectedYearObj?.year_be} ภาคเรียนที่ ${semester} · ${roomCount} ห้อง นำเฉพาะคาบรายวิชาที่ไม่ล็อกออก เก็บกิจกรรม คาบล็อก และคาบว่างครูทั้งหมด`,showCancelButton:true,confirmButtonText:'ยืนยันล้างตาราง',confirmButtonColor:'#be3340'})).isConfirmed) return
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
    return subjectBlock(cell.class_subject_id, cell.note)
  }

  const manageHref = '/schedules/class/manage'

  if (loading) {
    return <div className="rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">กำลังโหลด...</div>
  }

  return (
    <>
      <div className="schedule-workspace grid min-w-0 gap-5 [&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-50">
        <div className="schedule-workspace-heading flex flex-wrap items-center justify-between gap-5 rounded-2xl border bg-white">
          <div>
            <span className="schedule-workspace-kicker">ตารางเรียนและตารางสอน</span>
            <h1>{workspace==='places'?'สถานที่สอน':workspace==='prepare'?'เตรียมและจัดตาราง':workspace==='teacher'?'ตารางสอนและคาบที่ล็อก':workspace==='activity'?'กิจกรรมและครูประจำชั้น':isManage ? 'จัดการตารางเรียน' : 'ตารางเรียน'}</h1>
            <p>
              {workspace==='places' ? 'เพิ่ม แก้ไข ลบสถานที่ และกำหนดสถานที่ให้รายวิชาแต่ละห้อง'
                : workspace==='activity' ? 'กำหนดกิจกรรม วัน คาบ และทีมครู แล้วสร้างฉบับร่างเพื่อให้ลงในตาราง'
                : workspace==='prepare' ? 'ตรวจข้อมูลทั้ง 6 ขั้น กิจกรรมที่กำหนดไว้จะอยู่ในช่องสีเขียวของฉบับร่าง'
                : workspace==='teacher' ? `ภาคเรียนที่ ${semester} · ปีการศึกษา ${selectedYearObj?.year_be || ''}`
                : selectedClassroom && selectedYearObj
                ? `ห้อง ${selectedClassroom.label} · ภาคเรียนที่ ${semester} · ปีการศึกษา พ.ศ. ${selectedYearObj.year_be}`
                : isManage
                  ? 'คลิกคาบเพื่อใส่รายวิชา กิจกรรมแสดงชื่อและครูที่กำหนดไว้'
                  : 'ดูตารางเรียนรายห้อง'}
            </p>
          </div>
          {((!isManage && canEdit) || (workspace==='class' && selectedClass)) && <div className="flex flex-wrap items-center gap-3">
          {!isManage && canEdit && <Link href={manageHref} className="text-sm font-semibold text-blue-900">จัดการตารางเรียน</Link>}
          {workspace==='class' && selectedClass && <button type="button" className="schedule-secondary-button" disabled={blocked} onClick={openClassPdf}><FiDownload aria-hidden="true"/>ดาวน์โหลด PDF</button>}
          </div>}
        </div>

        {isManage && canEdit && <nav className="schedule-workspace-nav" aria-label="พื้นที่จัดตาราง">
          <button type="button" aria-pressed={workspace==='class'} disabled={savingKey||!!busyAction||preparationBusy} onClick={()=>void leavePreparation(()=>setWorkspace('class'))}><FiGrid aria-hidden="true"/>ตารางเรียน</button>
          <button type="button" aria-pressed={workspace==='teacher'} disabled={savingKey||!!busyAction||preparationBusy} onClick={()=>void leavePreparation(()=>setWorkspace('teacher'))}><FiUsers aria-hidden="true"/>ตารางสอน / ล็อกคาบ</button>
          <button type="button" aria-pressed={workspace==='activity'} disabled={savingKey||!!busyAction||preparationBusy} onClick={()=>void leavePreparation(()=>{setPreparationStep(4);setWorkspace('activity')})}><FiCalendar aria-hidden="true"/>กิจกรรมและครู</button>
          <button type="button" aria-pressed={workspace==='places'} disabled={savingKey||!!busyAction||preparationBusy} onClick={()=>void leavePreparation(()=>setWorkspace('places'))}><FiMapPin aria-hidden="true"/>สถานที่</button>
          <button type="button" className="schedule-wizard-entry" aria-pressed={workspace==='prepare'} disabled={savingKey||!!busyAction||preparationBusy} onClick={()=>void leavePreparation(()=>{setPreparationRooms(undefined);setPreparationStep(1);setWorkspace('prepare')})}><FiZap aria-hidden="true"/>จัดตาราง</button>
          {onSchoolSettings && <button type="button" className="device-school-settings-button" disabled={schoolSettingsDisabled||!!savingKey||!!busyAction||preparationBusy||preparationDirty} onClick={onSchoolSettings}><FiSettings aria-hidden="true" />ตั้งค่าเบื้องต้น</button>}
        </nav>}
        <div className={`schedule-workspace-filters grid gap-4 border bg-white ${workspace!=='class'?'sm:grid-cols-2':'sm:grid-cols-3'}`}>
          <div className="grid min-w-0 gap-2 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-stone-500 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-stone-300 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm">
            <label htmlFor="schedule-year">ปีการศึกษา</label>
            <select id="schedule-year" disabled={!!busyAction || !!savingKey || preparationBusy} value={selectedYear} onChange={e => { const value=e.target.value;void leavePreparation(()=>{setPicker(null);setSelectedYear(value)}) }}>
              {years.map(y => (
                <option key={y.id} value={y.id}>พ.ศ. {y.year_be}{y.is_active ? ' (ปัจจุบัน)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-2 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-stone-500 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-stone-300 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm">
            <label htmlFor="schedule-term">ภาคเรียน</label>
            <select id="schedule-term" disabled={!!busyAction || !!savingKey || preparationBusy} value={semester} onChange={e => { const value=Number(e.target.value);void leavePreparation(()=>{setPicker(null);setSemester(value)}) }}>
              <option value={1}>ภาคเรียนที่ 1</option>
              <option value={2}>ภาคเรียนที่ 2</option>
            </select>
          </div>

          {workspace==='class' && (          <div className="grid min-w-0 gap-2 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-stone-500 [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-stone-300 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm">
            <label htmlFor="schedule-class">ห้องเรียน</label>
            <select id="schedule-class" disabled={!!busyAction || !!savingKey || preparationBusy} value={selectedClass} onChange={e => { setPicker(null); setSelectedClass(e.target.value) }}>
              {classrooms.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>)}
        </div>

        {workspace==='class' && isManage && canEdit && selectedClass && (
          <div className="schedule-workspace-actions flex flex-wrap items-center justify-between gap-4 border bg-white">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="schedule-arrange-button" disabled={blocked} onClick={() => handleAutoSchedule()}>จัดห้องนี้</button>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={blocked} onClick={() => handleAutoSchedule(true)}>จัดทุกห้อง</button>
              <p className="schedule-live-status" role="status">
                {quotas && <><b>{quotas.filled}/{quotas.totalTarget}</b> คาบวิชา<span>ขาด {quotas.items.reduce((sum,q)=>sum+Math.max(0,q.remaining),0)}</span>{quotas.items.some(q=>q.used>q.target) && <span className="is-over">มีวิชาเกินคาบ</span>}<span>ล็อก {Object.values(cells).filter(c=>c.locked).length}</span></>}
                <span>{savingKey ? 'กำลังบันทึก...' : busyAction ? 'กำลังดำเนินการ...' : gridLoading ? 'กำลังโหลด...' : blocked ? 'รอข้อมูลตาราง' : 'บันทึกอัตโนมัติ'}</span>
              </p>
            </div>
            <details className="relative">
              <summary className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50">เครื่องมือเพิ่มเติม ▾</summary>
              <div className="schedule-tools-menu absolute right-0 top-14 z-20 grid w-80 gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-xl [&_label]:flex [&_label]:gap-2 [&_label]:text-sm [&_input]:accent-blue-700 [&_p]:text-xs [&_p]:leading-6 [&_p]:text-stone-500">
                <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={blocked || copySourceClassrooms.length === 0} onClick={() => { setCopyFromClass(copySourceClassrooms[0]?.id || ''); setCopyOpen(true) }}>คัดลอกจากห้องอื่น</button>
                <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 border-rose-200! text-rose-700! hover:bg-rose-50!" disabled={blocked} onClick={()=>handleClear('room')}>{busyAction === 'clear' ? 'กำลังล้าง...' : 'ล้างเฉพาะรายวิชาของห้องนี้'}</button>
                <button type="button" className="rounded-md border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={blocked} onClick={()=>handleClear('level')}>ล้างเฉพาะรายวิชาทั้งระดับชั้น {selectedClassroom?.level}</button>
                <button type="button" className="rounded-md border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={blocked} onClick={()=>handleClear('school')}>ล้างเฉพาะรายวิชาทั้งโรงเรียน</button>
              </div>
            </details>
          </div>
        )}


        {(workspace==='activity'||workspace==='prepare')&&selectedYear&&<SchedulePreparation key={`${selectedYear}:${semester}:${workspace}`} yearId={selectedYear} semester={semester} onUnsavedChange={setPreparationDirty} onBusyChange={setPreparationBusy} initialRooms={preparationRooms} initialStep={workspace==='activity'?4:preparationStep} onChanged={refreshPreparation} />}
        {workspace==='places'&&selectedYear&&isManage&&canEdit&&<SchedulePlacesEntry key={`${selectedYear}:${semester}:places`} yearId={selectedYear} semester={semester} onUnsavedChange={setPreparationDirty} onBusyChange={setPreparationBusy} onChanged={()=>void loadGrid()} />}
        {gridLoading && <div role="status">กำลังโหลดตารางเรียน...</div>}

        {(workspace==='activity'||workspace==='prepare'||workspace==='places')?null:workspace==='teacher' && isManage && canEdit ? <section className="border border-stone-300 bg-white p-5"><h2 className="mb-4 text-lg font-semibold">ตารางสอน/ล็อคคาบ</h2><TeacherAvailabilityPanel key={`${selectedYear}:${semester}`} onChanged={loadGrid} expanded refreshToken={JSON.stringify(cells)} yearId={selectedYear} semester={semester} periodTimes={periodTimes} disabled={!!busyAction||!!savingKey} /></section> : !selectedClass ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">ไม่พบห้องเรียนในปีการศึกษานี้</div>
        ) : subjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
            ห้องนี้ยังไม่มีรายวิชาเปิดสอน —{' '}
            <Link href="/settings/class-subjects">ไปกำหนดรายวิชาและครูผู้สอน</Link>
          </div>
        ) : (
          <div className={isManage&&canEdit?'grid items-start gap-4 xl:grid-cols-[240px_minmax(0,1fr)]':''}>
          {isManage&&canEdit&&<ScheduleLessonPalette lessons={remainingLessons} filter={paletteFilter} onFilter={setPaletteFilter} showCompleted={showCompleted} onShowCompleted={setShowCompleted} selected={paletteSelection} onSelect={setPaletteSelection} disabled={cellBlocked} onDrag={id=>{setPaletteSelection(null);setDragLesson({id,context:`${selectedYear}:${semester}:${selectedClass}`})}} onDragEnd={()=>{setDragLesson(null);setDropKey(null)}}/>}
          <section className="schedule-board min-w-0" aria-label="ตารางเรียนรายสัปดาห์">
            <div className="schedule-board-head"><div><h2>ห้อง {selectedClassroom?.label}</h2><p>ภาคเรียนที่ {semester} · ปีการศึกษา {selectedYearObj?.year_be}</p></div><span className="schedule-count-pill">ช่องตาราง {Object.values(cells).filter(c => c.class_subject_id).length} / {periodTimes.filter(t=>!t.is_break).length*scheduleDays.length}</span></div>
            <div className="schedule-day-switch" role="tablist" aria-label="เลือกวันบนมือถือ">{SCHEDULE_DAYS.filter(day => scheduleDays.includes(day.value)).map(day => <button key={day.value} type="button" aria-pressed={(scheduleDays.includes(mobileDay) ? mobileDay : scheduleDays[0]) === day.value} onClick={() => setMobileDay(day.value)}>{day.label}</button>)}</div>
            <div className="schedule-mobile-board">{periodTimes.map((slot, index) => {
              const day = scheduleDays.includes(mobileDay) ? mobileDay : scheduleDays[0]
              if (slot.is_break) return <p key={`break-${index}`} className="schedule-mobile-break">{slot.label}</p>
              return <article key={slot.period}><header>คาบ {slot.period}<small>{periodTimeLabel(periodTimes, slot.period)}</small></header>{(() => {
                const key = `${day}-${slot.period}`
                const cell = cells[key]
                return <div className={isActivityLessonId(cell?.class_subject_id) ? 'sched-cell is-activity' : 'sched-cell'}>{subjectBlock(cell?.class_subject_id, cell?.note)}{isManage && canEdit && <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="sched-mini" onClick={() => setPicker({ day, period: slot.period })}>แก้คาบ</button>{cell?.class_subject_id && !cell.locked && <button type="button" className="sched-mini is-danger" onClick={() => { void handleCellChange(day, slot.period, '') }}>เอาออก</button>}<button type="button" className="sched-mini" onClick={() => handleToggleLock(day, slot.period)}>{cell?.locked ? 'ปลดล็อก' : 'ล็อก'}</button></div>}</div>
              })()}</article>
            })}</div>
            <div className="schedule-desktop-board overflow-x-auto">
            <ScheduleGridTable days={scheduleDays} compactBreak
              periodTimes={periodTimes}
              renderCell={(day, period) => {
                const key = `${day}-${period}`
                const cell = cells[key]
                const conflictRooms = conflicts[key]
                const pending = pendingCells.has(key)
                if (isManage && canEdit) {
                  const locked = cell?.locked ?? false
                  return (
                    <div onDragOver={e=>{if(dragLesson&&!locked&&!pending&&!cellBlocked){e.preventDefault();setDropKey(key)}}} onDragLeave={()=>setDropKey(current=>current===key?null:current)} onDrop={e=>{e.preventDefault();placePaletteLesson(day,period)}} className={`sched-slot${dropKey===key?' is-drop':''}${conflictRooms?.length?' is-conflict':''}`}>
                      <div className="grid gap-1">
                        <button type="button" className={`sched-cell${isActivityLessonId(cell?.class_subject_id)?' is-activity':''}${locked?' is-locked':''}`}
                          title={cell?.class_subject_id ? subjectMap[cell.class_subject_id]?.label : 'เพิ่มรายวิชาหรือกิจกรรม'} disabled={cellBlocked || pending || locked} aria-busy={pending}
                          draggable={!!cell?.class_subject_id&&!locked&&!pending&&!cellBlocked} onDragStart={e=>{if(!cell?.class_subject_id)return;e.dataTransfer.setData('application/x-jarnsek-lesson',cell.class_subject_id);e.dataTransfer.effectAllowed='move';setPaletteSelection(null);setDragLesson({id:cell.class_subject_id,from:{day,period},context:`${selectedYear}:${semester}:${selectedClass}`})}} onDragEnd={()=>{setDragLesson(null);setDropKey(null)}} onClick={()=>paletteSelection?placePaletteLesson(day,period):setPicker({day,period})}
                          aria-label={`แก้ไขวัน${SCHEDULE_DAYS.find(d=>d.value===day)?.label} คาบ ${period}`}>
                          {cell?.class_subject_id ? subjectBlock(cell.class_subject_id) : <span className="text-sm text-stone-400">{cell?.note || '+ เพิ่มวิชา'}</span>}
                        </button>
                        <button
                          type="button"
                          className={`sched-lock${locked?' is-locked':''}`}
                          title={locked ? 'ปลดล็อก' : 'ล็อกคาบนี้'}
                          aria-label={locked ? 'ปลดล็อกคาบ' : 'ล็อกคาบ'}
                          aria-pressed={locked}
                          onClick={() => handleToggleLock(day, period)}
                          disabled={cellBlocked || pending}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d={locked?'M8 10V6a4 4 0 018 0v4':'M8 10V6a4 4 0 018 0'}/></svg>
                          <span className="sched-lock-label">{locked?'ปลดล็อก':'ล็อก'}</span>
                        </button>
                        {pending && <span role="status" className="flex items-center gap-1.5 text-xs text-blue-800"><span className="size-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" aria-hidden="true" />กำลังบันทึก…</span>}
                      </div>
                      {cell?.note && !cell.class_subject_id && <div className="mt-2 truncate px-1 text-xs text-stone-500">{cell.note}</div>}
                      {conflictRooms?.length ? (
                        <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
                          ซ้ำ: {conflictRooms.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  )
                }
                return <div className={`sched-cell${isActivityLessonId(cell?.class_subject_id)?' is-activity':''}`}>{renderCellView(cell)}</div>
              }}
            />
            </div>
            <div className="schedule-board-foot"><span>{isManage && canEdit ? 'คลิกช่องเพื่อใส่หรือเอาวิชาออก · ล็อกมุมขวาบนจะเก็บช่องไว้ตอนจัดใหม่' : 'ตารางเรียนรายสัปดาห์'}</span><div className="schedule-legend"><span><i className="schedule-legend-dot activity" />กิจกรรม</span><span><i className="schedule-legend-dot locked" />คาบที่ล็อก</span><Link href="/schedules/conflicts">ตรวจคาบชน</Link></div></div>
          </section></div>
        )}

        {workspace==='class' && isManage && quotas && <details className="overflow-auto rounded-2xl border border-stone-200 bg-white p-5 [&_summary]:cursor-pointer [&_summary]:text-sm [&_summary]:font-semibold [&_summary_span]:mt-1 [&_summary_span]:block [&_summary_span]:text-xs [&_summary_span]:font-normal [&_summary_span]:text-stone-500 [&_.quota-panel]:mt-4 [&_.quota-panel]:min-w-[560px]"><summary>ชั่วโมงเรียนของห้อง · รายวิชา {quotas.filled} / {quotas.totalTarget} คาบต่อสัปดาห์ <span>ค่าเริ่มต้นจากชั่วโมงเทียบรายปี ÷ 40 · ใช้ค่าภาระสอนจากขั้นเตรียมเมื่อกำหนดไว้</span></summary><ScheduleQuotaPanel {...quotas} capacity={periodTimes.filter(t=>!t.is_break).length*scheduleDays.length} /></details>}

      </div>

      {picker && <ScheduleLessonPicker title={`วัน${SCHEDULE_DAYS.find(d=>d.value===picker.day)?.label} · คาบ ${picker.period}`} options={workspace==='activity'?quotaOptions.filter(s=>isActivityLessonId(s.id)):quotaOptions} selected={cells[`${picker.day}-${picker.period}`]?.class_subject_id || null} onClose={()=>setPicker(null)} onChoose={id=>{const {day,period}=picker;setPicker(null);void handleCellChange(day,period,id)}} />}
      {pdfOpen && (
        <div className="fixed inset-0 z-[9000] grid place-items-center bg-stone-950/40 p-5 backdrop-blur-sm" onClick={() => setPdfOpen(false)}>
          <div className="grid max-h-[80vh] w-full max-w-lg gap-4 overflow-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">เลือกห้องสำหรับ PDF ตารางเรียน</h3>
            <p className="text-sm text-stone-500">เลือกได้มากกว่าหนึ่งห้อง ระบบรวมทุกห้องในไฟล์เดียว ห้องละหนึ่งหน้า</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-sm" onClick={() => setPdfRooms(classrooms.map(room => room.id))}>ทุกห้อง</button>
              <button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-sm" onClick={() => setPdfRooms(selectedClass ? [selectedClass] : [])}>เฉพาะห้องนี้</button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {classrooms.map(room => <label key={room.id} className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm"><input type="checkbox" checked={pdfRooms.includes(room.id)} onChange={() => setPdfRooms(current => current.includes(room.id) ? current.filter(id => id !== room.id) : [...current, room.id])} />{room.label}</label>)}
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" className="rounded-xl border border-stone-300 px-4 py-2 text-sm" onClick={() => setPdfOpen(false)}>ยกเลิก</button>
              <button type="button" className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!pdfRooms.length} onClick={downloadClassPdf}>สร้าง PDF {pdfRooms.length} ห้อง</button>
            </div>
          </div>
        </div>
      )}
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
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 border-blue-700! bg-blue-800! text-white! hover:bg-blue-900!"
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
