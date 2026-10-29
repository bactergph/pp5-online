'use client'
import {teachingEventAt,teachingQuotaParts} from '@/lib/schedule-joint-teaching'
import JointSessionPicker from './JointSessionPicker'
import type {JointLockRequest} from '@/lib/schedule-joint-lock'
import { useRef, useState } from 'react'
import Swal from 'sweetalert2'
import type { Preparation } from '@/lib/schedule-preparation'
import type { LessonRule } from '@/lib/schedule-planning'
import type { ScheduleLesson, ScheduleSlot } from '@/lib/schedule-store'
import { SUBJECT_GROUPS } from '@/lib/schedule-input'
import type { PeriodTimeRow } from '@/lib/schedule-helpers'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import LessonPatternPicker from './LessonPatternPicker'
import WorkloadPlacePicker from './WorkloadPlacePicker'
import JointTeachingEditor from './JointTeachingEditor'
import type {JointTeachingGroup} from '@/lib/schedule-joint-teaching'
import WorkloadSaveFeedback from './WorkloadSaveFeedback'
import {activityLockCells} from '@/lib/schedule-lock-state'
import type {ActivityTeam} from '@/lib/schedule-activity-teams'

type Classroom = Preparation['classrooms'][number]
type Teacher = Preparation['teachers'][number]
type Place = { id: string; name: string }
export type WorkloadChange = {
  assignments: { lessonId: string; teacherId: string }[]
  rules?: { lessonId: string; value: LessonRule }[]
  places?: Place[]
}
type OnlineActions = typeof import('@/app/schedules/actions') & typeof import('@/app/schedules/planning-actions')
export type WorkloadOperations = {
  [K in 'setJointTeachingScheduleCell' | 'removeScheduleSubjectCell' | 'editTeacherScheduleCell' | 'saveClassScheduleCell' | 'setTeacherAvailabilityBlock' | 'toggleScheduleCellLock']:
    (...args: Parameters<OnlineActions[K]>) => Promise<{error?:string|null}>
}
type Draft = { id: string; teacherId: string; count: number; pattern: number[]; roomId: string | null; spread: boolean; morning: boolean; timePreference?: LessonRule['timePreference'] }
type CodeSetting = { placeId: string; time: 'any' | 'morning' | 'afternoon'; pattern: 'single' | 'double' }

function groupRank(lesson: ScheduleLesson) {
  const index = SUBJECT_GROUPS.indexOf(lesson.subjectGroup || '')
  return index === -1 ? SUBJECT_GROUPS.length : index
}
function patternText(pattern: number[]) {
  const groups = new Map<number, number>()
  pattern.forEach(size => groups.set(size, (groups.get(size) || 0) + 1))
  return [...groups].map(([size, times]) => `${size === 1 ? 'เดี่ยว' : size === 2 ? 'คู่' : `${size} คาบ`}×${times}`).join(' ')
}
function placedCount(slots: ScheduleSlot[], lessonId: string) {
  const cells = new Set<string>()
  for (const slot of slots) if (slot.class_subject_id === lessonId) cells.add(`${slot.day_of_week}:${slot.period}`)
  return cells.size
}
const workloadNumbers = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 })
function numberRange(values: number[]) {
  const min = Math.round(Math.min(...values)), max = Math.round(Math.max(...values))
  const number = (value: number) => workloadNumbers.format(value)
  return min === max ? number(min) : `${number(min)}–${number(max)}`
}

export default function WorkloadEditor({ snapshotHash, teachingGroups, onTeachingGroupsChange, classrooms, lessons, activityLessons=[],activityGroups=[],onEditActivities,teachers, rules, teacherAssignments, slots, places, blocks, days, periods, year, term, busy, ready, onCommit, onRefresh, operations }: {
  activityLessons?:ScheduleLesson[]
  activityGroups?:ActivityTeam[]
  onEditActivities?:()=>void
  snapshotHash?:string
  teachingGroups:JointTeachingGroup[]
  onTeachingGroupsChange:(groups:JointTeachingGroup[])=>Promise<void>
  classrooms: Classroom[]
  lessons: ScheduleLesson[]
  teachers: Teacher[]
  rules: Record<string, LessonRule>
  teacherAssignments: Record<string, string>
  slots: ScheduleSlot[]
  places: Place[]
  blocks: { teacherId: string; day: number; period: number }[]
  days: number[]
  periods: PeriodTimeRow[]
  year: string
  term: number
  busy: boolean
  ready: boolean
  onCommit: (change: WorkloadChange) => Promise<void>
  onRefresh: () => Promise<void>
  operations?: WorkloadOperations
}) {
  const [sessionMode,setSessionMode]=useState(false)
  const [jointLock,setJointLock]=useState<JointLockRequest|null>(null)
  const [jointCollision,setJointCollision]=useState<string[]>([])
  const [lockNotice,setLockNotice]=useState('')
  const [removeCell,setRemoveCell]=useState<ScheduleSlot|null>(null)
  const jointTrigger=useRef<HTMLButtonElement>(null)
  const disconnected = async ():Promise<never> => {throw Error('ไม่พบตัวบันทึกคาบ กรุณาโหลดหน้าใหม่')}
  const {editTeacherScheduleCell,saveClassScheduleCell,setTeacherAvailabilityBlock,toggleScheduleCellLock}=operations||{
    editTeacherScheduleCell:disconnected,saveClassScheduleCell:disconnected,setTeacherAvailabilityBlock:disconnected,toggleScheduleCellLock:disconnected,
  }
  const dialog = useRef<HTMLDialogElement>(null), addDialog = useRef<HTMLDialogElement>(null), codeDialog = useRef<HTMLDialogElement>(null), lockDialog = useRef<HTMLDialogElement>(null)
  const codeOptionsDialog = useRef<HTMLDialogElement>(null), codeSaveButton = useRef<HTMLButtonElement>(null)
  const codePlaceDialog = useRef<HTMLDialogElement>(null), codeAddPlaceButton = useRef<HTMLButtonElement>(null)
  const [view, setView] = useState<'room' | 'teacher' | 'code' | 'lock'>('room')
  const [lockMode, setLockMode] = useState<'room' | 'teacher'>('room')
  const [lockCell, setLockCell] = useState<{ day: number; period: number } | null>(null)
  const [lockPick, setLockPick] = useState('')
  const [lockingKey, setLockingKey] = useState('')
  const [pendingLocks, setPendingLocks] = useState<string[]>([])
  const lockQueue = useRef(Promise.resolve())
  const queuedLocks = useRef(new Set<string>())
  const [level, setLevel] = useState(''), [roomId, setRoomId] = useState(''), [query, setQuery] = useState('')
  const [teacherId, setTeacherId] = useState(''), [teacherQuery, setTeacherQuery] = useState(''), [codeQuery, setCodeQuery] = useState(''), [codeTeacher, setCodeTeacher] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null), [placeName, setPlaceName] = useState('')
  const [draftPlaces, setDraftPlaces] = useState<Place[]>([])
  const saveLock = useRef(false)
  const [saveStatus, setSaveStatus] = useState<{ kind: 'saving' | 'saved' | 'error'; text: string } | null>(null)
  const saving = busy || saveStatus?.kind === 'saving'
  const saveNotice = <span className={`prep-workload-status${saveStatus ? ` is-${saveStatus.kind}` : ''}`} role={saveStatus?.kind === 'error' ? 'alert' : 'status'}>{saveStatus?.kind === 'saving' && <span className="prep-save-spinner" aria-hidden="true" />}{saveStatus?.text || 'ระบบบันทึกให้เมื่อยืนยันข้อมูลเรียบร้อย'}</span>
  async function commit(change: WorkloadChange) {
    if (saveLock.current || busy || queuedLocks.current.size) return false
    saveLock.current = true
    setSaveStatus({ kind: 'saving', text: 'กำลังบันทึกภาระสอน…' })
    try {
      await onCommit(change)
      setSaveStatus({ kind: 'saved', text: 'บันทึกภาระสอนแล้ว' })
      return true
    } catch (error) {
      setSaveStatus({ kind: 'error', text: error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่' })
      return false
    } finally { saveLock.current = false }
  }
  const [picked, setPicked] = useState<string[]>([]), [codeLessonIds, setCodeLessonIds] = useState<string[]>([]), [activeCode, setActiveCode] = useState(''), [codeLevel, setCodeLevel] = useState('')
  const [codeSettings, setCodeSettings] = useState<Record<string, CodeSetting>>({})
  const [codePendingPlaces, setCodePendingPlaces] = useState<Record<string, boolean>>({})
  const [codePlaceNotice, setCodePlaceNotice] = useState('')
  const [codePlaceName, setCodePlaceName] = useState(''), [codePlaces, setCodePlaces] = useState<Place[]>([]), [codePlaceError, setCodePlaceError] = useState('')
  const codeAvailablePlaces = [...places, ...codePlaces.filter(place => !places.some(existing => existing.id === place.id))]
  const levels = [...new Set(classrooms.map(room => room.level))]
  const activeLevel = levels.includes(level) ? level : levels[0] || ''
  const levelRooms = classrooms.filter(room => room.level === activeLevel).slice().sort((a, b) => Number(a.room) - Number(b.room))
  const activeRoom = levelRooms.some(room => room.id === roomId) ? roomId : levelRooms[0]?.id || ''
  const ruleOf = (lesson: ScheduleLesson): LessonRule => rules[lesson.id] || { count: lesson.count, pattern: Array(Math.max(0, Math.min(40, lesson.count))).fill(1), roomId: null, morning: false, spread: true }
  const teacherOf = (lesson: ScheduleLesson) => teacherAssignments[lesson.id] ?? lesson.teacherId ?? ''
  const teacherIds = new Set(teachers.map(teacher => teacher.id))
  const periodMinutes = periods.filter(period => !period.is_break).map(period => {
    const minute = (clock: string) => { const [hour, minute] = clock.split(':').map(Number); return hour * 60 + minute }
    return minute(period.end_time) - minute(period.start_time)
  })
  const uniformMinutes = periodMinutes.length && periodMinutes.every(minutes => minutes > 0 && minutes === periodMinutes[0]) ? periodMinutes[0] : null
  function lessonReady(lesson: ScheduleLesson) {
    const rule = ruleOf(lesson)
    return teacherIds.has(teacherOf(lesson)) && Number.isInteger(rule.count) && rule.count >= 1 && rule.count <= 40
      && Array.isArray(rule.pattern) && rule.pattern.length > 0 && rule.pattern.every(size => Number.isInteger(size) && size >= 1 && size <= 8) && rule.pattern.reduce((sum, size) => sum + size, 0) === rule.count
      && (!rule.roomId || places.some(place => place.id === rule.roomId))
  }
  const teacherName = (id: string) => { const teacher = teachers.find(item => item.id === id); return teacher ? `${teacher.prefix || ''} ${teacher.full_name}`.trim() : '' }
  const venueOf = (lesson: ScheduleLesson) => places.find(place => place.id === ruleOf(lesson).roomId)?.name || lesson.roomName || 'ไม่กำหนดสถานที่'
  const needle = query.trim().toLowerCase()
  const visible = lessons.filter(lesson => lesson.classroomId === activeRoom && (!needle || `${lesson.code} ${lesson.fullName || lesson.name} ${teacherName(teacherOf(lesson))}`.toLowerCase().includes(needle))).slice().sort((a, b) => groupRank(a) - groupRank(b) || a.code.localeCompare(b.code, 'th'))
  const roomCount = (id: string) => lessons.filter(lesson => lesson.classroomId === id).length
  const levelCount = (name: string) => lessons.filter(lesson => classrooms.find(room => room.id === lesson.classroomId)?.level === name).length
  const teacherNeedle = teacherQuery.trim().toLowerCase()
  const teacherMatches = teachers.filter(teacher => !teacherNeedle || `${teacher.prefix || ''} ${teacher.full_name} ${teacher.position || ''}`.toLowerCase().includes(teacherNeedle))
  const selectedTeacher = teachers.find(teacher => teacher.id === teacherId)
  const shownTeachers = selectedTeacher && !teacherMatches.some(teacher => teacher.id === teacherId) ? [selectedTeacher, ...teacherMatches] : teacherMatches
  const teacherLessons = lessons.filter(lesson => teacherOf(lesson) === teacherId).slice().sort((a, b) => a.code.localeCompare(b.code, 'th') || String(classrooms.find(room => room.id === a.classroomId)?.level).localeCompare(String(classrooms.find(room => room.id === b.classroomId)?.level), 'th'))
  const codeNeedle = codeQuery.trim().toLowerCase()
  const subjectCards = [...lessons.reduce((map, lesson) => {
    const key = lesson.code || lesson.subjectId
    const card = map.get(key) || { id: key, code: lesson.code, name: lesson.fullName || lesson.name, group: lesson.subjectGroup || '', lessons: [] as ScheduleLesson[] }
    card.lessons.push(lesson); map.set(key, card); return map
  }, new Map<string, { id: string; code: string; name: string; group: string; lessons: ScheduleLesson[] }>()).values()]
    .sort((a, b) => groupRank({ subjectGroup: a.group } as ScheduleLesson) - groupRank({ subjectGroup: b.group } as ScheduleLesson) || a.code.localeCompare(b.code, 'th'))
  const visibleCards = subjectCards.filter(card => !codeNeedle || `${card.code} ${card.name}`.toLowerCase().includes(codeNeedle))
  const cardSections = [...SUBJECT_GROUPS.map(name => ({ name, cards: visibleCards.filter(card => card.group === name) })), { name: 'อื่น ๆ', cards: visibleCards.filter(card => !SUBJECT_GROUPS.includes(card.group)) }].filter(section => section.cards.length)
  const activeSubject = subjectCards.find(card => card.id === activeCode)
  const codeLessons = (activeSubject?.lessons || []).slice().sort((a, b) => levels.indexOf(roomOf(a.classroomId)?.level || '') - levels.indexOf(roomOf(b.classroomId)?.level || '') || Number(roomOf(a.classroomId)?.room) - Number(roomOf(b.classroomId)?.room))
  const codeLevels = [...new Set(codeLessons.map(lesson => roomOf(lesson.classroomId)?.level).filter((item): item is string => !!item))]
  const shownCodeLevel = codeLevels.includes(codeLevel) ? codeLevel : codeLevels[0] || ''
  const codeLevelLessons = codeLessons.filter(lesson => roomOf(lesson.classroomId)?.level === shownCodeLevel)
  const chosenLessons = codeLessons.filter(lesson => codeLessonIds.includes(lesson.id))
  const codeTeacherRow = teachers.find(teacher => teacher.id === codeTeacher)
  const codeTeachers = codeTeacherRow && !teacherMatches.some(teacher => teacher.id === codeTeacher) ? [codeTeacherRow, ...teacherMatches] : teacherMatches
  function roomOf(id: string) { return classrooms.find(item => item.id === id) }
  function roomLabel(id: string) { const room = roomOf(id); return room ? `${room.level}/${room.name}` : '' }
  function toggleCodeLesson(id: string) { setCodeLessonIds(values => values.includes(id) ? values.filter(item => item !== id) : [...values, id]) }
  function openCode(id: string) {
    setActiveCode(id); setCodeLessonIds([]); setCodeLevel(''); setCodeTeacher(''); setTeacherQuery('')
    const element = codeDialog.current
    if (element && !element.open) element.showModal()
  }
  function closeCode() { if (!saveLock.current) { codePlaceDialog.current?.close(); codeOptionsDialog.current?.close(); codeDialog.current?.close() } }
  function openCodeOptions() {
    if (saving || !codeTeacher || !chosenLessons.length || chosenLessons.length > 500 || codeOptionsDialog.current?.open) return
    setCodeSettings(Object.fromEntries(chosenLessons.map(lesson => { const current = ruleOf(lesson); return [lesson.id, { placeId: current.roomId || '', time: current.timePreference || (current.morning ? 'morning' : 'any'), pattern: current.pattern.some(size => size > 1) ? 'double' : 'single' }] })))
    setSaveStatus(null); setCodePlaceNotice(''); setCodePendingPlaces({})
    setCodePlaceName(''); setCodePlaces([]); setCodePlaceError('')
    codeOptionsDialog.current?.showModal()
  }
  function openCodePlace() {
    if (saving) return
    setCodePlaceName(''); setCodePlaceError('')
    codePlaceDialog.current?.showModal()
  }
  function closeCodePlace() {
    codePlaceDialog.current?.close(); codeAddPlaceButton.current?.focus()
  }
  function updateCodeSetting(id: string, change: Partial<CodeSetting>) {
    setCodeSettings(values => ({ ...values, [id]: { ...values[id], ...change } }))
  }
  function stageCodePlace(rawName: string) {
    if (saving) throw Error('กำลังบันทึก กรุณารอสักครู่')
    const name = rawName.replace(/\s+/g, ' ').trim()
    if (!name) throw Error('กรอกชื่อสถานที่')
    if (name.length > 100) throw Error('ชื่อสถานที่ต้องไม่เกิน 100 ตัวอักษร')
    const known = codeAvailablePlaces.find(place => place.name.replace(/\s+/g, ' ').trim().toLowerCase() === name.toLowerCase())
    if (!known && codeAvailablePlaces.length >= 500) throw Error('เพิ่มสถานที่ได้สูงสุด 500 แห่ง')
    const place = known || { id: crypto.randomUUID(), name }
    if (!known) setCodePlaces(values => [...values, place])
    return { place, known }
  }
  function addCodePlace() {
    try {
      const { place, known } = stageCodePlace(codePlaceName)
      setCodePlaceNotice(`${known ? 'มีสถานที่นี้แล้ว' : 'เพิ่มสถานที่แล้ว'}: ${place.name} · เลือกใช้ให้แต่ละห้องได้ด้านล่าง`)
      setCodePlaceName(''); setCodePlaceError(''); closeCodePlace()
    } catch (error) { setCodePlaceError(error instanceof Error ? error.message : 'เพิ่มสถานที่ไม่สำเร็จ กรุณาลองใหม่') }
  }
  function closeCodeOptions() {
    if (saveLock.current) return
    codePlaceDialog.current?.close(); codeOptionsDialog.current?.close()
    codeSaveButton.current?.focus()
  }
  function openLesson(id: string) {
    const lesson = lessons.find(item => item.id === id)
    if (!lesson) return
    const current = ruleOf(lesson)
    setDraft({ id: lesson.id, teacherId: teacherOf(lesson), count: current.count, pattern: [...current.pattern], roomId: current.roomId, spread: current.spread, morning: current.morning, timePreference: current.timePreference })
    setTeacherQuery(''); setPlaceName(''); setDraftPlaces([])
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }
  function close() { if (!saveLock.current) { dialog.current?.close(); setDraft(null) } }
  async function apply() {
    if (!draft?.teacherId) return
    const lesson = lessons.find(item => item.id === draft.id)
    if (!lesson) return
    const total = draft.pattern.reduce((sum, size) => sum + size, 0)
    if (!draft.pattern.length || draft.pattern.some(size => !Number.isInteger(size) || size < 1 || size > 8) || total !== draft.count) return
    const saved = await commit({ assignments: [{ lessonId: draft.id, teacherId: draft.teacherId }], rules: [{ lessonId: draft.id, value: { count: draft.count, pattern: draft.pattern, roomId: draft.roomId, spread: draft.spread, morning: draft.morning, timePreference: draft.timePreference } }], places: draftPlaces })
    if (saved) close()
  }
  function addPlace() {
    const name = placeName.trim()
    if (!name || !draft) return
    const place = { id: crypto.randomUUID(), name }
    setDraftPlaces(values => [...values, place])
    setDraft({ ...draft, roomId: place.id })
    setPlaceName('')
  }
  const teachingDays = SCHEDULE_DAYS.filter(day => days.includes(day.value))
  const teachingPeriods = periods.filter(period => !period.is_break)
  function roomSlot(day: number, period: number) { return slots.find(item => item.classroom_id === activeRoom && item.day_of_week === day && item.period === period) }
  function teacherSlot(day: number, period: number) {
    return slots.find(item => {
      if (item.day_of_week !== day || item.period !== period || !item.class_subject_id) return false
      const lesson = lessons.find(entry => entry.id === item.class_subject_id)
      return !!lesson && teacherOf(lesson) === teacherId
    })
  }
  function teacherBlocked(day: number, period: number) { return blocks.some(block => block.teacherId === teacherId && block.day === day && block.period === period) }
  const activityCells=activityLockCells(activityGroups,activityLessons,slots)
  function activitySlot(day:number,period:number){return activityCells.find(cell=>cell.day===day&&cell.period===period&&(lockMode==='room'?cell.classroomId===activeRoom:cell.teacherIds.includes(teacherId)))}
  function lockKey(day: number, period: number) { return `${lockMode === 'room' ? activeRoom : teacherId}:${day}:${period}` }
  function openLock(day: number, period: number) {
    setRemoveCell(null)
    setJointLock(null);setSessionMode(false);setJointCollision([]);setLockNotice('')
    if ((lockMode === 'room' && !activeRoom) || (lockMode === 'teacher' && !teacherId) || queuedLocks.current.has(lockKey(day, period))) return
    const slot = lockMode === 'room' ? roomSlot(day, period) : teacherSlot(day, period)
    setLockCell({ day, period })
    setLockPick(slot?.class_subject_id || '')
    const element = lockDialog.current
    if (element && !element.open) element.showModal()
  }
  function closeLock() { lockDialog.current?.close(); setLockCell(null); setRemoveCell(null) }
  function enqueueLock(key: string, work: () => Promise<void>) {
    if (queuedLocks.current.has(key)) return
    queuedLocks.current.add(key)
    setPendingLocks([...queuedLocks.current])
    closeLock()
    lockQueue.current = lockQueue.current.then(async () => {
      setLockingKey(key)
      try { await work(); await onRefresh() }
      catch (error) { await Swal.fire({ icon: 'error', title: 'บันทึกคาบไม่สำเร็จ', text: error instanceof Error ? error.message : 'ลองอีกครั้ง', confirmButtonColor: '#1373d9' }) }
      finally { queuedLocks.current.delete(key); setPendingLocks([...queuedLocks.current]); setLockingKey('') }
    })
  }
  function prepareJointLock(lessonId:string|null,locked:boolean,remove=false){
    if(!lockCell)return false
    setJointCollision([]);setLockNotice('')
    const lesson=lessons.find(lesson=>lesson.id===lessonId),group=teachingGroups.find(group=>group.lessonIds.includes(lessonId||''))
    if(group&&(!group.cells||group.cells.some(cell=>cell.day===lockCell.day&&cell.period===lockCell.period))){setJointLock({lessonId:lessonId!,...lockCell,locked,remove,...(group.cells?{lessonIds:group.lessonIds,periods:[lockCell.period],expectedHash:snapshotHash}:{}),expected:lessons.filter(lesson=>group.lessonIds.includes(lesson.id)).map(lesson=>{const old=slots.find(row=>row.classroom_id===lesson.classroomId&&row.day_of_week===lockCell.day&&row.period===lockCell.period);return {classroomId:lesson.classroomId,lessonId:old?.class_subject_id||null,locked:!!old?.locked}})});return true}
    if(!remove&&lesson){const others=slots.filter(row=>row.day_of_week===lockCell.day&&row.period===lockCell.period&&row.classroom_id!==lesson.classroomId&&lessons.some(other=>other.id===row.class_subject_id&&teacherOf(other)===teacherOf(lesson)));if(others.length){setJointCollision(others.map(row=>roomLabel(row.classroom_id)));return true}}
    return false
  }
  function confirmJointLock(){if(!jointLock||!lockCell)return;const request=jointLock;setJointLock(null);void enqueueLock(lockKey(request.day,request.period),async()=>{const saved=await (operations?.setJointTeachingScheduleCell||disconnected)(year,term,request);if(saved.error)throw Error(saved.error)})}
  function cancelGroupRequest(group:JointTeachingGroup):JointLockRequest {
    return {lessonId:group.lessonIds[0],lessonIds:group.lessonIds,groupId:group.id,cancelGroup:true,expectedHash:snapshotHash,day:lockCell?.day||group.cells?.[0]?.day||days[0]||1,period:lockCell?.period||group.cells?.[0]?.period||1,locked:false,remove:true,expected:[]}
  }
  async function cancelTeachingGroup(id:string){
    if(saveLock.current||busy||queuedLocks.current.size)throw Error('กำลังบันทึกข้อมูล กรุณารอให้เสร็จก่อนยกเลิกกลุ่ม')
    const group=teachingGroups.find(group=>group.id===id);if(!group)throw Error('ไม่พบกลุ่มนี้ กรุณาโหลดข้อมูลล่าสุด')
    saveLock.current=true;setSaveStatus({kind:'saving',text:'กำลังยกเลิกสอนรวมและนำคาบร่วมออก…'})
    try{const result=await (operations?.setJointTeachingScheduleCell||disconnected)(year,term,cancelGroupRequest(group));if(result.error)throw Error(result.error);await onRefresh();setSaveStatus({kind:'saved',text:'ยกเลิกสอนรวมแล้ว จัดคาบของแต่ละห้องใหม่ได้เลย'})}catch(error){setSaveStatus({kind:'error',text:error instanceof Error?error.message:'ยกเลิกไม่สำเร็จ'});throw error}finally{saveLock.current=false}
  }
  function applyRoomLock(lessonId: string | null, shouldLock: boolean) {
    if (!lockCell || !activeRoom) return
    const slot = roomSlot(lockCell.day, lockCell.period)
    const currentId = slot?.class_subject_id || null
    if(lessonId&&lessonId!==currentId&&teachingGroups.some(group=>group.lessonIds.includes(currentId||''))){setLockNotice('คาบเดิมเป็นสอนรวม กรุณาเอาวิชาออกทั้งกลุ่มก่อนเปลี่ยนเป็นวิชาอื่น');return}
    if(prepareJointLock(lessonId||currentId,shouldLock,!lessonId))return
    void enqueueLock(`${activeRoom}:${lockCell.day}:${lockCell.period}`, async () => {
      if (slot?.activity_id && lessonId !== currentId) throw Error('คาบนี้เป็นกิจกรรม แก้ได้ที่ขั้นกิจกรรม')
      if (slot?.locked && lessonId !== currentId) {
        const unlocked = await toggleScheduleCellLock(activeRoom, year, lockCell.day, lockCell.period, term)
        if (unlocked.error) throw Error(unlocked.error)
      }
      if (lessonId !== currentId) {
        const saved = await saveClassScheduleCell(activeRoom, year, lockCell.day, lockCell.period, lessonId, null, term, currentId)
        if (saved.error) throw Error(saved.error)
      }
      const freshLocked = lessonId === currentId ? !!slot?.locked : false
      if (shouldLock !== freshLocked) {
        const toggled = await toggleScheduleCellLock(activeRoom, year, lockCell.day, lockCell.period, term)
        if (toggled.error) throw Error(toggled.error)
      }
    })
  }
  function applyTeacherSubject(lessonId: string | null) {
    if (!lockCell || !teacherId) return
    const lesson = lessonId ? lessons.find(item => item.id === lessonId) : undefined
    const current = teacherSlot(lockCell.day, lockCell.period)
    const targetLesson = lesson || (current?.class_subject_id ? lessons.find(item => item.id === current.class_subject_id) : undefined)
    if (!targetLesson) return
    if(prepareJointLock(targetLesson.id,true,!lessonId))return
    const room = targetLesson.classroomId
    const target = slots.find(item => item.classroom_id === room && item.day_of_week === lockCell.day && item.period === lockCell.period)
    void enqueueLock(`${teacherId}:${lockCell.day}:${lockCell.period}`, async () => {
      if ((teacherAssignments[targetLesson.id] ?? targetLesson.teacherId) !== targetLesson.teacherId) throw Error('บันทึกภาระสอนก่อนลงคาบของครูคนนี้')
      if (target?.locked) throw Error('คาบของห้องนี้ล็อกอยู่ ปลดล็อกจากล็อกคาบเรียนก่อน')
      const saved = await editTeacherScheduleCell(year, term, teacherId, room, lockCell.day, lockCell.period, target?.class_subject_id || null, lessonId)
      if (saved.error) throw Error(saved.error)
    })
  }
  function confirmSubjectRemoval() {
    if(!removeCell?.class_subject_id)return
    const target=removeCell
    enqueueLock(lockKey(target.day_of_week,target.period),async()=>{
      const saved=await (operations?.removeScheduleSubjectCell||disconnected)(target.classroom_id,year,target.day_of_week,target.period,target.class_subject_id!,term)
      if(saved.error)throw Error(saved.error)
    })
  }
  function applyTeacherFree(blocked: boolean) {
    if (!lockCell || !teacherId) return
    void enqueueLock(`${teacherId}:${lockCell.day}:${lockCell.period}`, async () => {
      const saved = await setTeacherAvailabilityBlock(year, term, teacherId, lockCell.day, lockCell.period, blocked)
      if (saved.error) throw Error(saved.error)
    })
  }
  async function assignCodes() {
    if (!codeOptionsDialog.current?.open || codePlaceDialog.current?.open || !codeTeacher || !chosenLessons.length || chosenLessons.length > 500) return
    if (Object.values(codePendingPlaces).some(Boolean)) {
      setSaveStatus({ kind: 'error', text: 'ยังมีชื่อสถานที่ที่ไม่ได้เลือกจากรายการ กรุณาเลือกหรือกดเพิ่มก่อนบันทึก' })
      requestAnimationFrame(() => codeOptionsDialog.current?.querySelector<HTMLInputElement>('[role=combobox][aria-invalid=true]')?.focus())
      return
    }
    const lessonRules = chosenLessons.map(lesson => {
      const current = ruleOf(lesson), setting = codeSettings[lesson.id], count = current.count
      const pattern = setting.pattern === 'double' ? [...Array(Math.floor(count / 2)).fill(2), ...(count % 2 ? [1] : [])] : Array(count).fill(1)
      return { lessonId: lesson.id, value: { ...current, pattern, roomId: setting.placeId || null, morning: setting.time === 'morning', timePreference: setting.time } }
    })
    if (await commit({ assignments: chosenLessons.map(lesson => ({ lessonId: lesson.id, teacherId: codeTeacher })), rules: lessonRules, places: codePlaces })) {
      codeOptionsDialog.current?.close(); setCodeLessonIds([])
      // Wait for the saving fieldset to be enabled before returning focus.
      requestAnimationFrame(() => {
        if (codeDialog.current?.open && !codeOptionsDialog.current?.open && !saveLock.current) codeDialog.current.querySelector<HTMLInputElement>('input[type=search]')?.focus()
      })
    }
  }
  async function assignPicked() {
    if (!teacherId || !picked.length) return
    const targets = lessons.filter(lesson => picked.includes(lesson.id))
    const changed = targets.filter(lesson => teacherOf(lesson))
    // Native dialogs sit above body-level SweetAlerts; keep the confirmation in this dialog.
    if (changed.length) {
      const answer = await Swal.fire({ target: addDialog.current!, icon: 'warning', title: `เปลี่ยนผู้สอนเดิม ${changed.length} วิชา?`, showCancelButton: true, confirmButtonText: 'กำหนด', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#1373d9', hideClass: { popup: '', backdrop: '', icon: '' } })
      if (!answer.isConfirmed) return
    }
    if (await commit({ assignments: targets.map(lesson => ({ lessonId: lesson.id, teacherId })) })) { setPicked([]); addDialog.current?.close() }
  }
  const draftLesson = draft ? lessons.find(lesson => lesson.id === draft.id) : undefined
  const currentLockSlot=lockCell?(lockMode==='room'?roomSlot(lockCell.day,lockCell.period):teacherSlot(lockCell.day,lockCell.period)):undefined
  const currentActivity=lockCell?activitySlot(lockCell.day,lockCell.period):undefined
  const currentJointGroup=lockCell?teachingGroups.find(group=>group.lessonIds.includes(currentLockSlot?.class_subject_id||'')&&(!group.cells||group.cells.some(cell=>cell.day===lockCell.day&&cell.period===lockCell.period))):undefined
  const currentJointMembers=lessons.filter(lesson=>currentJointGroup?.lessonIds.includes(lesson.id))
  const draftTeachers = teachers.filter(teacher => !teacherQuery.trim() || `${teacher.prefix || ''} ${teacher.full_name} ${teacher.position || ''}`.toLowerCase().includes(teacherQuery.trim().toLowerCase()))
  const patternReady = !!draft && draft.pattern.reduce((sum, size) => sum + size, 0) === draft.count
  async function removeFromTeacher(lesson: ScheduleLesson) {
    if (placedCount(slots, lesson.id) > 0) {
      await Swal.fire({ icon: 'warning', title: 'วิชานี้มีคาบในตารางแล้ว', text: 'นำคาบออกจากตารางก่อน แล้วค่อยเอาออกจากภาระครู', confirmButtonColor: '#1373d9' })
      return
    }
    const answer = await Swal.fire({ icon: 'warning', title: `นำ ${lesson.code} ออกจากภาระของ ${teacherName(teacherId)}?`, text: `${lesson.fullName || lesson.name} ${roomLabel(lesson.classroomId)} จะยังอยู่ที่ห้อง แต่ยังไม่กำหนดครู`, showCancelButton: true, confirmButtonText: 'นำออก', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#be3340' })
    if (!answer.isConfirmed) return
    await commit({ assignments: [{ lessonId: lesson.id, teacherId: '' }] })
  }
  const rowProps = { busy, ruleOf, teacherOf, teacherName, roomLabel, venueOf, onEdit: openLesson, hasLessons: lessons.length > 0 }
  return <section className="prep-input-panel prep-teacher-panel prep-workload">
    <WorkloadSaveFeedback status={saveStatus} />
    <div className="prep-load-toolbar"><span>ครูสอนพร้อมกันหลายห้อง</span><JointTeachingEditor buttonRef={jointTrigger} groups={teachingGroups} lessons={lessons.map(lesson=>({...lesson,...rules[lesson.id],teacherId:teacherAssignments[lesson.id]??lesson.teacherId}))} teachers={teachers} classrooms={classrooms} busy={busy||pendingLocks.length>0} onSave={onTeachingGroupsChange} onRemove={cancelTeachingGroup}/></div>
    <div className="prep-teacher-bar">
      <div className="prep-teacher-title"><h2>กำหนดภาระสอน</h2><p>{view === 'room' ? `${activeLevel}/${levelRooms.find(room => room.id === activeRoom)?.room || ''} · ${visible.length} วิชา` : view === 'teacher' ? (teacherId ? `${teacherName(teacherId)} · จากครู ${teachers.length} คน` : `ครูในชุดนี้ ${teachers.length} คน`) : view === 'lock' ? (lockMode === 'room' ? 'เลือกห้อง แล้วแตะคาบเพื่อกำหนดวิชาและล็อกคาบเรียน' : `เลือกจากครู ${teachers.length} คน แล้วแตะคาบเพื่อกำหนดวิชาหรือล็อกคาบว่าง`) : 'แตะการ์ดวิชา แล้วเลือกหลายห้องเพื่อกำหนดครู'}</p></div>
      <div className="prep-teacher-tools prep-subject-tools">
        {view === 'room' && <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหารหัส ชื่อวิชา หรือครูในห้องนี้" aria-label="ค้นหาภาระสอน" />}
        {(view === 'teacher' || (view === 'lock' && lockMode === 'teacher')) && <input type="search" value={teacherQuery} onChange={event => setTeacherQuery(event.target.value)} placeholder="ค้นหาชื่อครู" aria-label="ค้นหาครูสำหรับภาระสอน" />}
        {view === 'code' && <input type="search" value={codeQuery} onChange={event => setCodeQuery(event.target.value)} placeholder="ค้นหารหัสหรือชื่อวิชา" aria-label="ค้นหารหัสวิชา" />}
      </div>
    </div>
    <div className="prep-view-switch" role="group" aria-label="มุมมองภาระสอน">
      <button type="button" disabled={busy || pendingLocks.length > 0} aria-pressed={view === 'room'} onClick={() => setView('room')}>ตามห้อง</button>
      <button type="button" disabled={busy || pendingLocks.length > 0} aria-pressed={view === 'teacher'} onClick={() => { setView('teacher'); setPicked([]) }}>ตามครู</button>
      <button type="button" disabled={busy || pendingLocks.length > 0} aria-pressed={view === 'code'} onClick={() => { setView('code'); setCodeLessonIds([]); setActiveCode(''); setCodeTeacher(''); closeCode() }}>ตามรหัส</button>
      <button type="button" disabled={busy || pendingLocks.length > 0} aria-pressed={view === 'lock'} onClick={() => setView('lock')}>ล็อกคาบ</button>
    </div>
    {view === 'room' && <>
      {levels.length > 0 && <div className="prep-subject-levels" role="tablist" aria-label="ชั้น"><span>ชั้น</span>{levels.map(item => <button key={item} type="button" aria-pressed={item === activeLevel} onClick={() => { setLevel(item); setRoomId('') }}>{item}<small>{levelCount(item)}</small></button>)}</div>}
      {levelRooms.length > 0 && <div className="prep-subject-rooms" role="tablist" aria-label="ห้อง"><span>ห้อง</span>{levelRooms.map(room => <button key={room.id} type="button" aria-pressed={room.id === activeRoom} onClick={() => setRoomId(room.id)}>ห้อง {room.name}<small>{roomCount(room.id)}</small></button>)}</div>}
      {<WorkloadRows items={visible} showRoom={false} {...rowProps}/>}
    </>}
    {view === 'teacher' && <>
      <div className="prep-activity-teachers"><div>{shownTeachers.map(teacher => <button type="button" key={teacher.id} aria-pressed={teacher.id === teacherId} onClick={() => setTeacherId(teacher.id)}><strong>{`${teacher.prefix || ''} ${teacher.full_name}`.trim()}</strong><small>{teacher.position || 'ไม่ระบุตำแหน่ง'}</small></button>)}</div></div>
      {teacherId && <div className="prep-load-toolbar"><span>{teacherLessons.length} วิชา · {[...new Map(teacherLessons.flatMap(lesson=>teachingQuotaParts({...lesson,count:ruleOf(lesson).count}).map(part=>[part.id,part.count]))).values()].reduce((sum,count)=>sum+count,0)} คาบ/สัปดาห์</span><button type="button" disabled={busy} onClick={() => { setPicked([]); setQuery(''); addDialog.current?.showModal() }}>เพิ่มวิชา</button></div>}
      {teacherId ? (teacherLessons.length ? <WorkloadRows items={teacherLessons} showRoom onRemove={removeFromTeacher} {...rowProps}/> : <p className="prep-teacher-empty">ครูคนนี้ยังไม่มีวิชา</p>) : <p className="prep-teacher-empty">ค้นหาแล้วแตะการ์ดครู</p>}
    </>}
    {view === 'lock' && <>
      <div className="prep-view-switch" role="group" aria-label="ชนิดการล็อกคาบ">
        <button type="button" aria-pressed={lockMode === 'room'} onClick={() => setLockMode('room')}>ล็อกคาบเรียน</button>
        <button type="button" aria-pressed={lockMode === 'teacher'} onClick={() => setLockMode('teacher')}>ล็อกคาบสอน</button>
      </div>
      {lockMode === 'room' ? <>
        {levels.length > 0 && <div className="prep-subject-levels" role="tablist" aria-label="ชั้น"><span>ชั้น</span>{levels.map(item => <button key={item} type="button" aria-pressed={item === activeLevel} onClick={() => { setLevel(item); setRoomId('') }}>{item}</button>)}</div>}
        {levelRooms.length > 0 && <div className="prep-subject-rooms" role="tablist" aria-label="ห้อง"><span>ห้อง</span>{levelRooms.map(room => <button key={room.id} type="button" aria-pressed={room.id === activeRoom} onClick={() => setRoomId(room.id)}>ห้อง {room.name}</button>)}</div>}
      </> : <div className="prep-activity-teachers"><div>{shownTeachers.map(teacher => <button type="button" key={teacher.id} aria-pressed={teacher.id === teacherId} onClick={() => setTeacherId(teacher.id)}><strong>{`${teacher.prefix || ''} ${teacher.full_name}`.trim()}</strong><small>{teacher.position || 'ไม่ระบุตำแหน่ง'}</small></button>)}</div></div>}
<p className="prep-lock-legend"><span>สีเขียว · ติดกิจกรรม</span><span>สีฟ้า · คาบที่ล็อกเอง</span></p>
      {(lockMode === 'teacher' && !teacherId) ? <p className="prep-teacher-empty">เลือกครูก่อน แล้วแตะคาบเพื่อกำหนดวิชาหรือล็อกคาบว่าง</p> : <div className="prep-lock-scroll"><table className="prep-lock-grid"><thead><tr><th>วัน</th>{teachingPeriods.map(period => <th key={period.period}>คาบ {period.period}</th>)}</tr></thead><tbody>{teachingDays.map(day => <tr key={day.value}><th>{day.label}</th>{teachingPeriods.map(period => {
        const slot = lockMode === 'room' ? roomSlot(day.value, period.period) : teacherSlot(day.value, period.period)
        const lesson = slot?.class_subject_id ? lessons.find(item => item.id === slot.class_subject_id) : undefined
        const blocked = lockMode === 'teacher' && teacherBlocked(day.value, period.period)
        const activity=activitySlot(day.value,period.period)
        const locked = !!slot?.locked || !!activity?.fixed || !!activity?.locked
        const key = lockKey(day.value, period.period)
        const waiting = pendingLocks.includes(key)
        const combinedRooms=lesson?lessons.filter(other=>teachingEventAt(other,day.value,period.period)===teachingEventAt(lesson,day.value,period.period)).map(other=>roomLabel(other.classroomId)).join(' + '):''
        const label = activity ? 'ติดกิจกรรม' : lesson?.code || (slot?.activity_id ? 'ติดกิจกรรม' : blocked ? 'คาบว่าง' : 'ว่าง')
        return <td key={period.period}><button type="button" className={activity?'is-activity':blocked?'is-free-lock':undefined} aria-label={`${day.label} คาบ ${period.period} ${label}${activity?' '+activity.name:''}`} aria-pressed={locked || blocked} aria-busy={waiting} disabled={waiting} onClick={() => openLock(day.value, period.period)}><b>{label}</b><small>{waiting ? (key === lockingKey ? 'กำลังบันทึก' : 'รอคิว') : activity ? activity.name : lesson ? `${lockMode === 'teacher' ? combinedRooms : ''}${locked ? ' ล็อกแล้ว' : ''}` : blocked ? 'ล็อกคาบว่าง' :'แตะเพื่อกำหนด'}</small>{activity&&<small>{activity.fixed?'ล็อกวัน/คาบกิจกรรม':activity.locked?'ล็อกคาบกิจกรรมไว้':'จัดเวลาอัตโนมัติ'}</small>}</button></td>
      })}</tr>)}</tbody></table></div>}
    </>}
    {view === 'code' && <>
      {cardSections.length === 0 ? <p className="prep-teacher-empty">ไม่พบรหัสวิชานี้</p> : <div className="prep-code-board">{cardSections.map(section => <section key={section.name}><h3 className="prep-code-group">{section.name}</h3><ul className="prep-code-cards">{section.cards.map(card => {
        const assigned = card.lessons.filter(lesson => teacherOf(lesson)).length
        const complete = card.lessons.filter(lessonReady).length, allComplete = complete === card.lessons.length
        const counts = card.lessons.map(lesson => ruleOf(lesson).count), validCounts = counts.every(count => Number.isInteger(count) && count > 0 && count <= 40)
        const weekly = validCounts ? `${numberRange(uniformMinutes ? counts.map(count => count * uniformMinutes / 60) : counts)} ${uniformMinutes ? 'ชม.' : 'คาบ'}/สัปดาห์/ห้อง` : 'ยังต้องกำหนดคาบต่อสัปดาห์'
        return <li key={card.id}><button type="button" className={allComplete ? 'is-complete' : undefined} data-state={allComplete ? 'complete' : complete ? 'partial' : 'empty'} onClick={() => openCode(card.id)}>
          <strong>{card.name}</strong><b>{card.code}</b>
          <span className="prep-code-weekly" title={uniformMinutes ? 'ชั่วโมงต่อสัปดาห์ ปัดเป็นจำนวนเต็มตามเวลาคาบที่ตั้งไว้' : undefined}>{weekly}</span>
          {validCounts && <small className="prep-code-period-count">{uniformMinutes ? `${numberRange(counts)} คาบ · คาบละ ${uniformMinutes} นาที` : 'ชั่วโมงขึ้นอยู่กับระยะเวลาคาบที่จัด'}</small>}
          <small>{card.lessons.length} ห้อง · มีครู {assigned} ห้อง</small>
          <span className={`prep-code-status${allComplete ? ' is-complete' : ''}`}>{allComplete ? '✓ กำหนดครบแล้ว' : complete ? `กำหนดครบ ${complete}/${card.lessons.length} ห้อง` : assigned ? 'ยังต้องตรวจภาระสอน' : 'ยังไม่กำหนดครู'}</span>
        </button></li>
      })}</ul></section>)}</div>}
    </>}
    <div className="prep-load-save"><span>{ready ? 'กำหนดครูและภาระสอนครบแล้ว' : 'ยังมีวิชาที่ยังไม่กำหนดครูหรือคาบให้ครบ'}</span>{saveNotice}</div>
    <dialog ref={lockDialog} className="prep-team-dialog prep-activity-dialog" aria-labelledby="lock-title" onCancel={event => { event.preventDefault(); closeLock() }}>{lockCell && <>
      <header><div><h2 id="lock-title">{lockMode === 'room' ? 'ล็อกคาบเรียน' : 'ล็อกคาบสอน'}</h2><p>{SCHEDULE_DAYS.find(day => day.value === lockCell.day)?.label} · คาบ {lockCell.period} · {lockMode === 'room' ? roomLabel(activeRoom) : teacherName(teacherId)}</p></div><button type="button" aria-label="ปิด" onClick={closeLock}>ปิด</button></header>
      {!removeCell&&<div className="prep-team-dialog-body"><fieldset className="prep-activity-sections" disabled={saving||!!jointLock}>
        {currentActivity&&<section className="prep-activity-block prep-lock-activity-note" role="status"><h3>ติดกิจกรรม · {currentActivity.name}</h3><p>{currentActivity.fixed?'กำหนดวันและคาบกิจกรรมไว้แล้ว คาบนี้จะคงอยู่เมื่อจัดตารางใหม่':currentActivity.locked?'คาบกิจกรรมนี้ถูกล็อกไว้ในตาราง':'กิจกรรมนี้ไม่ได้กำหนดวัน/คาบ ระบบนำไปจัดเวลาให้อัตโนมัติเมื่อสร้างฉบับร่างใหม่'}</p>{onEditActivities&&<button type="button" onClick={()=>{closeLock();onEditActivities()}}>ไปแก้ไขกิจกรรมและเวลา</button>}</section>}
        {!sessionMode&&currentJointGroup&&<section className="prep-activity-block joint-lock-current" aria-label="คาบสอนรวมที่บันทึกแล้ว"><h3>สอนพร้อมกัน {currentJointMembers.length} ห้อง</h3><ul>{currentJointMembers.map(lesson=><li key={lesson.id}><b>{roomLabel(lesson.classroomId)}</b> · {lesson.code} {lesson.fullName||lesson.name}</li>)}</ul><p>เลือกเอาเฉพาะคาบนี้ออก หรือยกเลิกกลุ่มพร้อมนำคาบสอนรวมทั้งหมดของกลุ่มนี้ออก วิชา ครู และภาระต่อสัปดาห์ยังคงเดิม</p><div className="joint-lock-actions"><button type="button" onClick={()=>prepareJointLock(currentLockSlot!.class_subject_id,false,true)}>เอาคาบนี้ออกทุกห้อง</button><button type="button" className="prep-joint-danger" onClick={()=>setJointLock(cancelGroupRequest(currentJointGroup))}>ยกเลิกสอนรวมทั้งกลุ่ม</button></div></section>}
        {!sessionMode&&(!currentJointGroup||teacherBlocked(lockCell.day,lockCell.period))&&lockMode === 'teacher' && <section className="prep-activity-block"><div className="prep-activity-head"><span>1</span><div><h3>คาบว่าง</h3><p>ล็อกไว้เมื่อครูไม่สะดวกสอนคาบนี้</p></div></div>
          <div className="prep-activity-scope">{teacherBlocked(lockCell.day, lockCell.period) ? <button type="button" onClick={() => applyTeacherFree(false)}>ปลดล็อกคาบว่าง</button> : <button type="button" disabled={!!teacherSlot(lockCell.day, lockCell.period)||!!currentActivity} onClick={() => applyTeacherFree(true)}>ล็อกคาบว่าง</button>}</div>
        </section>}
        {!sessionMode&&!currentJointGroup&&!currentActivity&&<section className="prep-activity-block"><div className="prep-activity-head"><span>{lockMode === 'teacher' ? '2' : '1'}</span><div><h3>{lockMode === 'room' ? 'วิชาที่จะลงคาบนี้' : 'วิชาที่ครูคนนี้จะสอน'}</h3><p>{lockMode === 'room' ? 'เลือกวิชาของห้องนี้ แล้วล็อกไม่ให้จัดตารางย้าย' : 'เลือกวิชาและห้องที่จะให้ครูสอนในคาบนี้'}</p></div></div>
          {lockMode === 'room' && roomSlot(lockCell.day, lockCell.period)?.activity_id ? <p className="prep-teacher-empty">คาบนี้เป็นกิจกรรม แก้ได้ที่ขั้นกิจกรรม</p> : <div className="prep-lock-picks">{(lockMode === 'room' ? lessons.filter(lesson => lesson.classroomId === activeRoom) : lessons.filter(lesson => teacherOf(lesson) === teacherId)).slice().sort((a, b) => a.code.localeCompare(b.code, 'th')).map(lesson => <button type="button" key={lesson.id} aria-pressed={lockPick === lesson.id} onClick={() => setLockPick(lesson.id)}><strong>{lesson.fullName || lesson.name}</strong><b>{lesson.code}</b><small>{roomLabel(lesson.classroomId)}</small></button>)}</div>}
        </section>}
        {!sessionMode&&!currentJointGroup&&!currentActivity&&<button type="button" className="prep-primary" onClick={()=>{if(lockMode==='room'&&!lockPick){setLockNotice('เลือกวิชาของห้องนี้ก่อน แล้วเลือกห้องที่จะสอนรวม');return}setSessionMode(true);setJointCollision([]);setLockNotice('')}}>ล็อกสอนพร้อมกันหลายห้อง</button>}
        {sessionMode&&<JointSessionPicker snapshotHash={snapshotHash} lessons={lessons.map(lesson=>({...lesson,...ruleOf(lesson),teacherId:teacherOf(lesson)}))} teacherId={lockMode==='teacher'?teacherId:teacherOf(lessons.find(lesson=>lesson.id===lockPick)!)} initialLessonId={lockPick} day={lockCell.day} period={lockCell.period} periods={periods} slots={slots} groups={teachingGroups} roomLabel={roomLabel} onPrepare={setJointLock}/>}
      </fieldset></div>}
      {removeCell&&<div className="prep-team-dialog-body"><section className="prep-activity-block" role="alert" aria-label="ยืนยันเอาวิชาออก"><h3>เอาวิชาออกจากคาบนี้?</h3><p><strong>{lessons.find(lesson=>lesson.id===removeCell.class_subject_id)?.fullName||lessons.find(lesson=>lesson.id===removeCell.class_subject_id)?.name}</strong> · {roomLabel(removeCell.classroom_id)}</p><p>{SCHEDULE_DAYS.find(day=>day.value===removeCell.day_of_week)?.label} · คาบ {removeCell.period}</p><p>ช่องนี้จะว่างและปลดล็อก รายวิชา ครูผู้สอน และจำนวนคาบต่อสัปดาห์ยังอยู่ สามารถนำไปจัดตารางใหม่ได้</p></section></div>}
      {lockNotice&&<p className="prep-error" role="alert">{lockNotice}</p>}
      {jointLock&&<section className="prep-notice" role="alert"><b>{jointLock.cancelGroup?'ยกเลิกสอนรวมทั้งกลุ่มและนำคาบร่วมออกทุกห้อง?':jointLock.remove?'เอาคาบนี้ออกพร้อมกันทุกห้อง?':jointLock.locked?'ล็อกคาบสอนรวมพร้อมกันทุกห้อง?':'ปลดล็อกคาบสอนรวมพร้อมกันทุกห้อง?'}</b><p>{[...new Set(jointLock.cancelGroup?lessons.filter(lesson=>jointLock.lessonIds?.includes(lesson.id)).map(lesson=>roomLabel(lesson.classroomId)):jointLock.expected.map(row=>roomLabel(row.classroomId)))].join(' + ')}{!jointLock.cancelGroup&&` · คาบ ${(jointLock.periods||[jointLock.period]).join(', ')}`}</p>{jointLock.remove&&<p>{jointLock.cancelGroup?'นำคาบสอนรวมทุกวันของกลุ่มนี้ออก คาบอื่นและภาระสอนยังอยู่ สามารถจัดคาบแต่ละห้องใหม่ได้':'นำเฉพาะคาบที่เลือกออกทั้งกลุ่ม คาบสอนรวมอื่นยังอยู่'}</p>}{jointLock.replaceExisting&&<p>ยืนยันนำคาบเดิมเฉพาะวิชาที่เลือกออก แล้วล็อกตามเวลานี้ คาบที่เหลือรอจัดใหม่</p>}</section>}
      {jointCollision.length>0&&<section className="prep-notice" role="alert"><b>ครูมีคาบสอนห้อง {jointCollision.join(', ')} อยู่แล้ว</b><p>เลือกห้องและวิชาที่จะสอนพร้อมกันในคาบนี้ได้โดยตรง</p><button type="button" onClick={()=>{setSessionMode(true);setJointCollision([])}}>เลือกห้องที่จะสอนรวม</button></section>}
      <footer>
        {removeCell?<><button type="button" onClick={()=>setRemoveCell(null)}>ยกเลิก</button><button type="button" className="prep-primary" onClick={confirmSubjectRemoval}>ยืนยันเอาวิชาออก</button></>:jointLock?<><button type="button" onClick={()=>setJointLock(null)}>ย้อนกลับ</button><button type="button" className="prep-primary" onClick={confirmJointLock}>{jointLock.cancelGroup?'ยืนยันยกเลิกทั้งกลุ่ม':jointLock.remove?'ยืนยันเอาคาบออก':'ยืนยันสอนรวม'}</button></>:sessionMode?<><button type="button" onClick={()=>setSessionMode(false)}>ย้อนกลับ</button><button type="button" onClick={closeLock}>ปิด</button></>:currentJointGroup||currentActivity?<button type="button" onClick={closeLock}>ปิด</button>:<>
        <span>{lockPick ? 'เลือกวิชาแล้ว' : 'เลือกวิชา หรือล็อกคาบว่าง'}</span>
        <button type="button" onClick={closeLock}>ปิด</button>
        {lockMode === 'room' && !!roomSlot(lockCell.day, lockCell.period)?.class_subject_id && <button type="button" className="prep-joint-danger" onClick={() => setRemoveCell(currentLockSlot||null)}>เอาวิชาออก</button>}
        {lockMode === 'room' && !!roomSlot(lockCell.day, lockCell.period)?.locked && <button type="button" onClick={() => applyRoomLock(roomSlot(lockCell.day, lockCell.period)?.class_subject_id || null, false)}>ปลดล็อก</button>}
        {lockMode === 'room' && <button type="button" className="prep-primary" disabled={!lockPick || !!roomSlot(lockCell.day, lockCell.period)?.activity_id} onClick={() => applyRoomLock(lockPick, true)}>กำหนดวิชาและล็อก</button>}
        {lockMode === 'teacher' && !!teacherSlot(lockCell.day, lockCell.period) && <button type="button" className="prep-joint-danger" onClick={() => setRemoveCell(currentLockSlot||null)}>เอาวิชาออก</button>}
        {lockMode === 'teacher' && <button type="button" className="prep-primary" disabled={!lockPick} onClick={() => applyTeacherSubject(lockPick)}>ลงวิชาที่จะสอน</button>}
        </>}
      </footer>
    </>}</dialog>
    <dialog ref={dialog} className="prep-team-dialog prep-activity-dialog" aria-labelledby="load-title" onCancel={event => { event.preventDefault(); close() }}>{draft && draftLesson && <>
      <header><div><h2 id="load-title">แก้ไขภาระสอน</h2><p>{draftLesson.code} · {draftLesson.fullName || draftLesson.name} · {roomLabel(draftLesson.classroomId)}</p></div><button type="button" disabled={saving} aria-label="ปิด" onClick={close}>ปิด</button></header>
      <div className="prep-team-dialog-body"><fieldset className="prep-activity-sections" disabled={saving}>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>1</span><div><h3>ครูผู้สอน</h3><p>ค้นหาแล้วแตะการ์ดครู</p></div></div>
          <div className="prep-activity-teachers"><input type="search" value={teacherQuery} onChange={event => setTeacherQuery(event.target.value)} placeholder="ค้นหาชื่อหรือตำแหน่ง" aria-label="ค้นหาครูผู้สอน" /><div>{draftTeachers.map(teacher => <button type="button" key={teacher.id} aria-pressed={draft.teacherId === teacher.id} onClick={() => setDraft({ ...draft, teacherId: teacher.id })}><strong>{`${teacher.prefix || ''} ${teacher.full_name}`.trim()}</strong><small>{teacher.position || 'ไม่ระบุตำแหน่ง'}</small></button>)}</div><p>เลือกแล้ว {draft.teacherId ? 1 : 0} คน</p></div>
        </section>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>2</span><div><h3>คาบต่อสัปดาห์</h3><p>เป้า {draft.count} · จัดแล้ว {placedCount(slots, draft.id)} · เหลือ {Math.max(0, draft.count - placedCount(slots, draft.id))}</p></div></div>
          <label className="prep-load-count">จำนวนคาบ<input type="number" min={1} max={40} value={draft.count} onChange={event => { const count = Math.max(1, Math.min(40, Number(event.target.value) || 1)); const pattern = draft.pattern.reduce((sum, size) => sum + size, 0) === count ? draft.pattern : Array(count).fill(1); setDraft({ ...draft, count, pattern }) }} /></label>
          <LessonPatternPicker count={draft.count} value={draft.pattern.join('+')} label={draftLesson.label} onChange={value => setDraft({ ...draft, pattern: value.split('+').map(Number) })} />
        </section>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>3</span><div><h3>ห้องสถานที่</h3><p>ใช้สถานที่เดียวกันเมื่อไม่ต้องการให้จองชนกัน</p></div></div>
          <select aria-label="ห้องสถานที่" value={draft.roomId || ''} onChange={event => setDraft({ ...draft, roomId: event.target.value || null })}><option value="">ไม่กำหนด{draftLesson.roomName ? ` (เดิม ${draftLesson.roomName})` : ''}</option>{[...places, ...draftPlaces].map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
          <div className="prep-load-place"><input value={placeName} onChange={event => setPlaceName(event.target.value)} placeholder="เช่น ห้องคอมพิวเตอร์" aria-label="ชื่อสถานที่ใหม่" /><button type="button" disabled={!placeName.trim()} onClick={addPlace}>เพิ่มสถานที่</button></div>
        </section>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>4</span><div><h3>ความต้องการ</h3><p>ใช้ช่วยจัดตาราง ระบบยังคงไม่ให้ครูหรือห้องชนกัน</p></div></div>
          <div className="prep-activity-pills"><span>รายวิชาแยกวันเสมอ · คาบคู่เรียนติดกัน</span><button type="button" aria-pressed={draft.morning} onClick={() => setDraft({ ...draft, morning: !draft.morning, timePreference: draft.morning ? 'any' : 'morning' })}>ช่วงเช้า</button></div>
        </section>
      </fieldset></div>
      <footer>{saveNotice}<button type="button" disabled={saving} onClick={close}>ยกเลิก</button><button type="button" className="prep-primary" disabled={saving || !draft.teacherId || !patternReady} onClick={() => void apply()}>{saving ? 'กำลังบันทึก…' : 'บันทึกวิชานี้'}</button></footer>
    </>}</dialog>
    <dialog ref={codeDialog} className="prep-team-dialog prep-activity-dialog" aria-labelledby="code-load-title" onCancel={event => { event.preventDefault(); closeCode() }}>{activeSubject && <>
      <header><div><h2 id="code-load-title">{activeSubject.name}</h2><p>{activeSubject.code} · {activeSubject.lessons.length} ห้อง</p></div><button type="button" disabled={saving} aria-label="ปิด" onClick={closeCode}>ปิด</button></header>
      <div className="prep-team-dialog-body"><fieldset className="prep-activity-sections" disabled={saving}>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>1</span><div><h3>ห้องที่เรียนวิชานี้</h3><p>เลือกได้หลายห้องในครั้งเดียว</p></div></div>
          <div className="prep-code-rooms">
            <div className="prep-subject-levels" role="tablist" aria-label="ชั้นของรหัสนี้">{codeLevels.map(item => <button key={item} type="button" aria-pressed={item === shownCodeLevel} onClick={() => setCodeLevel(item)}>{item}</button>)}</div>
            <div className="prep-activity-scope"><button type="button" onClick={() => setCodeLessonIds(values => [...new Set([...values, ...codeLevelLessons.map(lesson => lesson.id)])])}>ทั้ง {shownCodeLevel}</button><button type="button" onClick={() => setCodeLessonIds(values => values.filter(id => !codeLevelLessons.some(lesson => lesson.id === id)))}>เอาห้องชั้นนี้ออก</button></div>
            <div className="prep-activity-room-picks">{codeLevelLessons.map(lesson => { const owned = !!codeTeacher && teacherOf(lesson) === codeTeacher; const current = teacherName(teacherOf(lesson)); return <button type="button" key={lesson.id} aria-pressed={codeLessonIds.includes(lesson.id)} title={current || 'ยังไม่มีครู'} onClick={() => toggleCodeLesson(lesson.id)}><span>ห้อง {roomOf(lesson.classroomId)?.name}</span><small>{owned ? 'กำหนดแล้ว' : current || 'ยังไม่มีครู'}</small></button> })}</div>
          </div>
        </section>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>2</span><div><h3>ครูผู้สอน</h3><p>เลือกครูให้ห้องที่เลือก แล้วกดบันทึกเพื่อตั้งสถานที่และรูปแบบคาบ</p></div></div>
          <div className="prep-activity-teachers"><input type="search" value={teacherQuery} onChange={event => setTeacherQuery(event.target.value)} placeholder="ค้นหาชื่อหรือตำแหน่ง" aria-label="ค้นหาครูที่จะกำหนด" /><div>{codeTeachers.map(teacher => <button type="button" key={teacher.id} aria-pressed={codeTeacher === teacher.id} onClick={() => setCodeTeacher(codeTeacher === teacher.id ? '' : teacher.id)}><strong>{`${teacher.prefix || ''} ${teacher.full_name}`.trim()}</strong><small>{teacher.position || 'ไม่ระบุตำแหน่ง'}</small></button>)}</div></div>
        </section>
      </fieldset></div>
      <footer>{saveStatus && saveNotice}<span>{chosenLessons.length ? `เลือก ${chosenLessons.length} ห้อง${codeTeacher && chosenLessons.some(lesson => teacherOf(lesson) && teacherOf(lesson) !== codeTeacher) ? ` · เปลี่ยนครูเดิม ${chosenLessons.filter(lesson => teacherOf(lesson) && teacherOf(lesson) !== codeTeacher).length} ห้อง` : ''}` : 'เลือกห้องและครู'}</span><button type="button" disabled={saving} onClick={closeCode}>ปิด</button><button ref={codeSaveButton} type="button" className="prep-primary" disabled={saving || !codeTeacher || !chosenLessons.length || chosenLessons.length > 500} onClick={openCodeOptions}>บันทึก</button></footer>
    </>}</dialog>
    <dialog ref={codeOptionsDialog} className="prep-team-dialog prep-activity-dialog prep-code-options-dialog" aria-labelledby="code-options-title" onCancel={event => { event.preventDefault(); closeCodeOptions() }}>{activeSubject && <>
      <header><div><h2 id="code-options-title">ตั้งค่าก่อนบันทึก</h2><p>{activeSubject.code} · {teacherName(codeTeacher)} · {chosenLessons.length} ห้อง</p></div><button type="button" disabled={saving} aria-label="ปิดการตั้งค่า" onClick={closeCodeOptions}>ปิด</button></header>
      <div className="prep-team-dialog-body"><fieldset disabled={saving}>
        <div className="prep-code-settings-toolbar"><p>กำหนดแยกแต่ละห้องได้ โดยคงจำนวนคาบต่อสัปดาห์เดิม</p><button ref={codeAddPlaceButton} type="button" onClick={openCodePlace}>+ เพิ่มสถานที่</button></div>
        {codePlaceNotice && <p className="prep-code-place-notice" role="status">{codePlaceNotice}</p>}
        <div className="prep-code-settings-table" role="table" aria-label="ตั้งค่าภาระสอนรายห้อง">
          <div role="row" className="prep-code-settings-head"><span role="columnheader">ชั้น/ห้อง</span><span role="columnheader">ห้องสถานที่</span><span role="columnheader">ช่วงเวลา</span><span role="columnheader">รูปแบบคาบ</span></div>
          {chosenLessons.map(lesson => { const setting = codeSettings[lesson.id]; if (!setting) return null; const label = roomLabel(lesson.classroomId); return <div role="row" key={lesson.id} className="prep-code-settings-row" data-lesson-id={lesson.id}>
            <div role="cell" className="prep-code-room-label"><strong>{label}</strong><small>{ruleOf(lesson).count} คาบ/สัปดาห์</small></div>
            <div role="cell"><span className="prep-code-mobile-label">ห้องสถานที่</span><WorkloadPlacePicker places={codeAvailablePlaces} value={setting.placeId} onChange={placeId => updateCodeSetting(lesson.id, { placeId })} onCreate={name => { const { place } = stageCodePlace(name); setCodePlaceNotice(`เพิ่ม ${place.name} แล้ว · สถานที่ใหม่จะบันทึกพร้อมภาระสอน`); return place.id }} onPendingChange={pending => setCodePendingPlaces(values => ({ ...values, [lesson.id]: pending }))} label={'สถานที่ '+label} /></div>
            <div role="cell"><span className="prep-code-mobile-label">ช่วงเวลา</span><select aria-label={'ช่วงเวลา '+label} value={setting.time} onChange={event => updateCodeSetting(lesson.id, { time: event.target.value as CodeSetting['time'] })}><option value="any">ทั้งเช้าและบ่าย</option><option value="morning">เช้า</option><option value="afternoon">บ่าย</option></select></div>
            <div role="cell"><span className="prep-code-mobile-label">รูปแบบคาบ</span><select aria-label={'รูปแบบคาบ '+label} value={setting.pattern} onChange={event => updateCodeSetting(lesson.id, { pattern: event.target.value as CodeSetting['pattern'] })}><option value="single">เดี่ยวทั้งหมด</option><option value="double">คาบคู่ + เดี่ยวที่เหลือ</option></select></div>
          </div> })}
        </div>
        <p className="prep-code-settings-help">ช่วงเวลาเป็นความต้องการ ตัวจัดอาจเลือกช่วงอื่นเมื่อจำเป็น · คาบคู่ไม่ข้ามพักกลางวัน</p>
      </fieldset></div>
      <footer>{saveStatus && saveNotice}<button type="button" disabled={saving} onClick={closeCodeOptions}>ย้อนกลับ</button><button type="button" className="prep-primary" disabled={saving || !codeTeacher || !chosenLessons.length || chosenLessons.length > 500} onClick={() => void assignCodes()}>{saving ? 'กำลังบันทึก…' : 'บันทึกภาระสอน'}</button></footer>
    </>}</dialog>
    <dialog ref={codePlaceDialog} className="prep-team-dialog prep-code-place-dialog" aria-labelledby="code-place-title" onCancel={event => { event.preventDefault(); closeCodePlace() }}>
      <header><h2 id="code-place-title">เพิ่มสถานที่ใหม่</h2><button type="button" aria-label="ปิดเพิ่มสถานที่" onClick={closeCodePlace}>ปิด</button></header>
      <form onSubmit={event => { event.preventDefault(); addCodePlace() }}>
        <div className="prep-team-dialog-body"><label htmlFor="code-place-name">ชื่อสถานที่</label><input id="code-place-name" autoFocus value={codePlaceName} maxLength={100} onChange={event => { setCodePlaceName(event.target.value); setCodePlaceError('') }} placeholder="เช่น ห้องคอมพิวเตอร์" />{codePlaceError && <p className="prep-code-place-error" role="alert">{codePlaceError}</p>}<p>สถานที่ใหม่จะบันทึกพร้อมภาระสอน</p></div>
        <footer><button type="button" onClick={closeCodePlace}>ยกเลิก</button><button type="submit" className="prep-primary" disabled={!codePlaceName.trim()}>เพิ่มสถานที่</button></footer>
      </form>
    </dialog>
    <dialog ref={addDialog} className="prep-team-dialog prep-catalog-dialog" aria-labelledby="add-load-title" onCancel={event => { event.preventDefault(); if (!saveLock.current) addDialog.current?.close() }}>
      <header><div><h2 id="add-load-title">เพิ่มวิชาให้ครู</h2><p>{teacherName(teacherId)}</p></div><button type="button" aria-label="ปิด" disabled={saving} onClick={() => { if (!saveLock.current) addDialog.current?.close() }}>ปิด</button></header>
      <div className="prep-team-dialog-body"><fieldset disabled={saving}>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหารหัส ชื่อวิชา หรือห้อง" aria-label="ค้นหาวิชาที่จะเพิ่ม" />
        <ul className="prep-load-pick">{lessons.filter(lesson => teacherOf(lesson) !== teacherId && (!query.trim() || `${lesson.code} ${lesson.fullName || lesson.name} ${roomLabel(lesson.classroomId)}`.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 80).map(lesson => <li key={lesson.id}><label><input type="checkbox" checked={picked.includes(lesson.id)} onChange={() => setPicked(values => values.includes(lesson.id) ? values.filter(id => id !== lesson.id) : [...values, lesson.id])} /><span><strong>{lesson.code} · {lesson.fullName || lesson.name}</strong><small>{roomLabel(lesson.classroomId)} · {teacherName(teacherOf(lesson)) || 'ยังไม่มีครู'}</small></span></label></li>)}</ul>
      </fieldset></div>
      <footer>{saveNotice}<span>เลือก {picked.length} วิชา</span><button type="button" disabled={saving} onClick={() => { if (!saveLock.current) addDialog.current?.close() }}>ยกเลิก</button><button type="button" className="prep-primary" disabled={saving || !picked.length} onClick={() => void assignPicked()}>{saving ? 'กำลังบันทึก…' : 'กำหนดให้ครูนี้'}</button></footer>
    </dialog>
  </section>
}

function WorkloadRows({ items, showRoom, busy, ruleOf, teacherOf, teacherName, roomLabel, venueOf, onEdit, onRemove, hasLessons }: {
  items: ScheduleLesson[]; showRoom: boolean; busy: boolean; hasLessons: boolean
  ruleOf: (lesson: ScheduleLesson) => LessonRule; teacherOf: (lesson: ScheduleLesson) => string
  teacherName: (id: string) => string; roomLabel: (id: string) => string; venueOf: (lesson: ScheduleLesson) => string
  onEdit: (id: string) => void; onRemove?: (lesson: ScheduleLesson) => Promise<void>
}) {
  if (!items.length) return <p className="prep-teacher-empty">{hasLessons ? 'ไม่พบรายวิชาที่ค้นหา' : 'ยังไม่มีรายวิชา เพิ่มในขั้นรายวิชาก่อน'}</p>
  return <ul className="prep-load-list">{items.map(lesson => {
    const current = ruleOf(lesson), name = teacherName(teacherOf(lesson))
    return <li key={lesson.id}><b>{lesson.code}</b><span>{lesson.fullName || lesson.name}{showRoom && <small>{roomLabel(lesson.classroomId)}</small>}{lesson.activityGroupId?.startsWith('teaching:')&&<small>สอนรวมหลายห้อง</small>}</span><span className={name ? undefined : 'prep-load-missing'}>{name || 'ยังไม่กำหนดครู'}</span><span>{current.count} คาบ<small>{patternText(current.pattern)}</small></span><small>{venueOf(lesson)}</small><span className="prep-row-actions"><button type="button" className="prep-row-edit" disabled={busy} onClick={() => onEdit(lesson.id)}>แก้ไข</button>{onRemove && <button type="button" className="prep-row-delete" disabled={busy} onClick={() => void onRemove(lesson)}>ลบ</button>}</span></li>
  })}</ul>
}
