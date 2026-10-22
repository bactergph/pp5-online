'use client'
import { useRef, useState } from 'react'
import Swal from 'sweetalert2'
import type { Preparation } from '@/lib/schedule-preparation'
import type { LessonRule } from '@/lib/schedule-planning'
import type { ScheduleLesson, ScheduleSlot } from '@/lib/schedule-store'
import { editTeacherScheduleCell, saveClassScheduleCell, setTeacherAvailabilityBlock, toggleScheduleCellLock } from '@/app/schedules/actions'
import { SUBJECT_GROUPS } from '@/lib/schedule-input'
import type { PeriodTimeRow } from '@/lib/schedule-helpers'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import LessonPatternPicker from './LessonPatternPicker'

type Classroom = Preparation['classrooms'][number]
type Teacher = Preparation['teachers'][number]
type Place = { id: string; name: string }
type Draft = { id: string; teacherId: string; count: number; pattern: number[]; roomId: string | null; spread: boolean; morning: boolean }

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

export default function WorkloadEditor({ classrooms, lessons, teachers, rules, teacherAssignments, slots, places, blocks, days, periods, year, term, busy, dirty, ready, onRule, onAssign, onAddPlace, onRefresh, onSave }: {
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
  dirty: boolean
  ready: boolean
  onRule: (id: string, count: number, patch: Partial<LessonRule>) => void
  onAssign: (ids: string[], teacherId: string) => void
  onAddPlace: (place: Place) => void
  onRefresh: () => Promise<void>
  onSave: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null), addDialog = useRef<HTMLDialogElement>(null), codeDialog = useRef<HTMLDialogElement>(null), lockDialog = useRef<HTMLDialogElement>(null)
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
  const [picked, setPicked] = useState<string[]>([]), [codeLessonIds, setCodeLessonIds] = useState<string[]>([]), [activeCode, setActiveCode] = useState(''), [codeLevel, setCodeLevel] = useState('')
  const levels = [...new Set(classrooms.map(room => room.level))]
  const activeLevel = levels.includes(level) ? level : levels[0] || ''
  const levelRooms = classrooms.filter(room => room.level === activeLevel).slice().sort((a, b) => Number(a.room) - Number(b.room))
  const activeRoom = levelRooms.some(room => room.id === roomId) ? roomId : levelRooms[0]?.id || ''
  const ruleOf = (lesson: ScheduleLesson): LessonRule => rules[lesson.id] || { count: lesson.count, pattern: Array(Math.max(0, Math.min(40, lesson.count))).fill(1), roomId: null, morning: false, spread: true }
  const teacherOf = (lesson: ScheduleLesson) => teacherAssignments[lesson.id] ?? lesson.teacherId ?? ''
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
  const chosenLessons = lessons.filter(lesson => codeLessonIds.includes(lesson.id) && (!codeTeacher || teacherOf(lesson) !== codeTeacher))
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
  function closeCode() { codeDialog.current?.close() }
  function open(lesson: ScheduleLesson) {
    const current = ruleOf(lesson)
    setDraft({ id: lesson.id, teacherId: teacherOf(lesson), count: current.count, pattern: [...current.pattern], roomId: current.roomId, spread: current.spread, morning: current.morning })
    setTeacherQuery(''); setPlaceName('')
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }
  function close() { dialog.current?.close(); setDraft(null) }
  function apply() {
    if (!draft?.teacherId) return
    const lesson = lessons.find(item => item.id === draft.id)
    if (!lesson) return
    const total = draft.pattern.reduce((sum, size) => sum + size, 0)
    if (!draft.pattern.length || draft.pattern.some(size => !Number.isInteger(size) || size < 1 || size > 8) || total !== draft.count) return
    onRule(draft.id, lesson.count, { count: draft.count, pattern: draft.pattern, roomId: draft.roomId, spread: draft.spread, morning: draft.morning })
    onAssign([draft.id], draft.teacherId)
    close()
  }
  function addPlace() {
    const name = placeName.trim()
    if (!name || !draft) return
    const place = { id: crypto.randomUUID(), name }
    onAddPlace(place)
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
  function lockKey(day: number, period: number) { return `${lockMode === 'room' ? activeRoom : teacherId}:${day}:${period}` }
  function openLock(day: number, period: number) {
    if ((lockMode === 'room' && !activeRoom) || (lockMode === 'teacher' && !teacherId) || queuedLocks.current.has(lockKey(day, period))) return
    const slot = lockMode === 'room' ? roomSlot(day, period) : teacherSlot(day, period)
    setLockCell({ day, period })
    setLockPick(slot?.class_subject_id || '')
    const element = lockDialog.current
    if (element && !element.open) element.showModal()
  }
  function closeLock() { lockDialog.current?.close(); setLockCell(null) }
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
  function applyRoomLock(lessonId: string | null, shouldLock: boolean) {
    if (!lockCell || !activeRoom) return
    const slot = roomSlot(lockCell.day, lockCell.period)
    const currentId = slot?.class_subject_id || null
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
    const room = targetLesson.classroomId
    const target = slots.find(item => item.classroom_id === room && item.day_of_week === lockCell.day && item.period === lockCell.period)
    void enqueueLock(`${teacherId}:${lockCell.day}:${lockCell.period}`, async () => {
      if ((teacherAssignments[targetLesson.id] ?? targetLesson.teacherId) !== targetLesson.teacherId) throw Error('บันทึกภาระสอนก่อนลงคาบของครูคนนี้')
      if (target?.locked) throw Error('คาบของห้องนี้ล็อกอยู่ ปลดล็อกจากล็อกคาบเรียนก่อน')
      const saved = await editTeacherScheduleCell(year, term, teacherId, room, lockCell.day, lockCell.period, target?.class_subject_id || null, lessonId)
      if (saved.error) throw Error(saved.error)
    })
  }
  function applyTeacherFree(blocked: boolean) {
    if (!lockCell || !teacherId) return
    void enqueueLock(`${teacherId}:${lockCell.day}:${lockCell.period}`, async () => {
      const saved = await setTeacherAvailabilityBlock(year, term, teacherId, lockCell.day, lockCell.period, blocked)
      if (saved.error) throw Error(saved.error)
    })
  }
  function assignCodes() {
    if (!codeTeacher || !chosenLessons.length || chosenLessons.length > 500) return
    onAssign(chosenLessons.map(lesson => lesson.id), codeTeacher)
    setCodeLessonIds([])
  }
  async function assignPicked() {
    if (!teacherId || !picked.length) return
    const targets = lessons.filter(lesson => picked.includes(lesson.id))
    const changed = targets.filter(lesson => teacherOf(lesson))
    const answer = await Swal.fire({ icon: changed.length ? 'warning' : 'question', title: `เพิ่ม ${targets.length} วิชาให้ ${teacherName(teacherId)}?`, text: changed.length ? `เปลี่ยนผู้สอนเดิม ${changed.length} วิชา` : 'วิชาเหล่านี้จะใช้ครูคนนี้', showCancelButton: true, confirmButtonText: 'กำหนด', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#1373d9' })
    if (!answer.isConfirmed) return
    onAssign(targets.map(lesson => lesson.id), teacherId)
    setPicked([]); addDialog.current?.close()
  }
  const draftLesson = draft ? lessons.find(lesson => lesson.id === draft.id) : undefined
  const draftTeachers = teachers.filter(teacher => !teacherQuery.trim() || `${teacher.prefix || ''} ${teacher.full_name} ${teacher.position || ''}`.toLowerCase().includes(teacherQuery.trim().toLowerCase()))
  const patternReady = !!draft && draft.pattern.reduce((sum, size) => sum + size, 0) === draft.count
  async function removeFromTeacher(lesson: ScheduleLesson) {
    if (placedCount(slots, lesson.id) > 0) {
      await Swal.fire({ icon: 'warning', title: 'วิชานี้มีคาบในตารางแล้ว', text: 'นำคาบออกจากตารางก่อน แล้วค่อยเอาออกจากภาระครู', confirmButtonColor: '#1373d9' })
      return
    }
    const answer = await Swal.fire({ icon: 'warning', title: `นำ ${lesson.code} ออกจากภาระของ ${teacherName(teacherId)}?`, text: `${lesson.fullName || lesson.name} ${roomLabel(lesson.classroomId)} จะยังอยู่ที่ห้อง แต่ยังไม่กำหนดครู`, showCancelButton: true, confirmButtonText: 'นำออก', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#be3340' })
    if (!answer.isConfirmed) return
    onAssign([lesson.id], '')
  }
  function patternOk(lesson: ScheduleLesson) {
    const current = ruleOf(lesson)
    return current.count > 0 && current.pattern.length > 0 && current.pattern.every(size => Number.isInteger(size) && size >= 1 && size <= 8) && current.pattern.reduce((sum, size) => sum + size, 0) === current.count
  }
  const patternsReady = lessons.length > 0 && lessons.every(patternOk)
  function rows(items: ScheduleLesson[], showRoom: boolean, onRemove?: (lesson: ScheduleLesson) => void) {
    if (!items.length) return <p className="prep-teacher-empty">{lessons.length ? 'ไม่พบรายวิชาที่ค้นหา' : 'ยังไม่มีรายวิชา เพิ่มในขั้นรายวิชาก่อน'}</p>
    return <ul className="prep-load-list">{items.map(lesson => {
      const current = ruleOf(lesson)
      const name = teacherName(teacherOf(lesson))
      return <li key={lesson.id}><b>{lesson.code}</b><span>{lesson.fullName || lesson.name}{showRoom && <small>{roomLabel(lesson.classroomId)}</small>}</span><span className={name ? undefined : 'prep-load-missing'}>{name || 'ยังไม่กำหนดครู'}</span><span>{current.count} คาบ<small>{patternText(current.pattern)}</small></span><small>{venueOf(lesson)}</small><span className="prep-row-actions"><button type="button" className="prep-row-edit" disabled={busy} onClick={() => open(lesson)}>แก้ไข</button>{onRemove && <button type="button" className="prep-row-delete" disabled={busy} onClick={() => void onRemove(lesson)}>ลบ</button>}</span></li>
    })}</ul>
  }
  return <section className="prep-input-panel prep-teacher-panel prep-workload">
    <div className="prep-teacher-bar">
      <div className="prep-teacher-title"><h2>กำหนดภาระสอน</h2><p>{view === 'room' ? `${activeLevel}/${levelRooms.find(room => room.id === activeRoom)?.room || ''} · ${visible.length} วิชา` : view === 'teacher' ? (teacherId ? `${teacherName(teacherId)} · จากครู ${teachers.length} คน` : `ครูในชุดนี้ ${teachers.length} คน`) : view === 'lock' ? (lockMode === 'room' ? 'เลือกห้อง แล้วแตะคาบเพื่อกำหนดวิชาและล็อกคาบเรียน' : `เลือกจากครู ${teachers.length} คน แล้วแตะคาบเพื่อกำหนดวิชาหรือล็อกคาบว่าง`) : 'แตะการ์ดวิชา แล้วเลือกหลายห้องเพื่อกำหนดครู'}</p></div>
      <div className="prep-teacher-tools prep-subject-tools">
        {view === 'room' && <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหารหัส ชื่อวิชา หรือครูในห้องนี้" aria-label="ค้นหาภาระสอน" />}
        {(view === 'teacher' || (view === 'lock' && lockMode === 'teacher')) && <input type="search" value={teacherQuery} onChange={event => setTeacherQuery(event.target.value)} placeholder="ค้นหาชื่อครู" aria-label="ค้นหาครูสำหรับภาระสอน" />}
        {view === 'code' && <input type="search" value={codeQuery} onChange={event => setCodeQuery(event.target.value)} placeholder="ค้นหารหัสหรือชื่อวิชา" aria-label="ค้นหารหัสวิชา" />}
      </div>
    </div>
    <div className="prep-view-switch" role="group" aria-label="มุมมองภาระสอน">
      <button type="button" aria-pressed={view === 'room'} onClick={() => setView('room')}>ตามห้อง</button>
      <button type="button" aria-pressed={view === 'teacher'} onClick={() => { setView('teacher'); setPicked([]) }}>ตามครู</button>
      <button type="button" aria-pressed={view === 'code'} onClick={() => { setView('code'); setCodeLessonIds([]); setActiveCode(''); setCodeTeacher(''); closeCode() }}>ตามรหัส</button>
      <button type="button" aria-pressed={view === 'lock'} onClick={() => setView('lock')}>ล็อกคาบ</button>
    </div>
    {view === 'room' && <>
      {levels.length > 0 && <div className="prep-subject-levels" role="tablist" aria-label="ชั้น"><span>ชั้น</span>{levels.map(item => <button key={item} type="button" aria-pressed={item === activeLevel} onClick={() => { setLevel(item); setRoomId('') }}>{item}<small>{levelCount(item)}</small></button>)}</div>}
      {levelRooms.length > 0 && <div className="prep-subject-rooms" role="tablist" aria-label="ห้อง"><span>ห้อง</span>{levelRooms.map(room => <button key={room.id} type="button" aria-pressed={room.id === activeRoom} onClick={() => setRoomId(room.id)}>ห้อง {room.name}<small>{roomCount(room.id)}</small></button>)}</div>}
      {rows(visible, false)}
    </>}
    {view === 'teacher' && <>
      <div className="prep-activity-teachers"><div>{shownTeachers.map(teacher => <button type="button" key={teacher.id} aria-pressed={teacher.id === teacherId} onClick={() => setTeacherId(teacher.id)}><strong>{`${teacher.prefix || ''} ${teacher.full_name}`.trim()}</strong><small>{teacher.position || 'ไม่ระบุตำแหน่ง'}</small></button>)}</div></div>
      {teacherId && <div className="prep-load-toolbar"><span>{teacherLessons.length} วิชา · {teacherLessons.reduce((sum, lesson) => sum + ruleOf(lesson).count, 0)} คาบ/สัปดาห์</span><button type="button" disabled={busy} onClick={() => { setPicked([]); setQuery(''); addDialog.current?.showModal() }}>เพิ่มวิชา</button></div>}
      {teacherId ? (teacherLessons.length ? rows(teacherLessons, true, removeFromTeacher) : <p className="prep-teacher-empty">ครูคนนี้ยังไม่มีวิชา</p>) : <p className="prep-teacher-empty">ค้นหาแล้วแตะการ์ดครู</p>}
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
      {(lockMode === 'teacher' && !teacherId) ? <p className="prep-teacher-empty">เลือกครูก่อน แล้วแตะคาบเพื่อกำหนดวิชาหรือล็อกคาบว่าง</p> : <div className="prep-lock-scroll"><table className="prep-lock-grid"><thead><tr><th>วัน</th>{teachingPeriods.map(period => <th key={period.period}>คาบ {period.period}</th>)}</tr></thead><tbody>{teachingDays.map(day => <tr key={day.value}><th>{day.label}</th>{teachingPeriods.map(period => {
        const slot = lockMode === 'room' ? roomSlot(day.value, period.period) : teacherSlot(day.value, period.period)
        const lesson = slot?.class_subject_id ? lessons.find(item => item.id === slot.class_subject_id) : undefined
        const blocked = lockMode === 'teacher' && teacherBlocked(day.value, period.period)
        const locked = !!slot?.locked
        const key = lockKey(day.value, period.period)
        const waiting = pendingLocks.includes(key)
        const label = lesson?.code || (slot?.activity_id ? 'กิจกรรม' : blocked ? 'คาบว่าง' : 'ว่าง')
        return <td key={period.period}><button type="button" className={blocked && !lesson ? 'is-free-lock' : undefined} aria-pressed={locked || (blocked && !lesson)} aria-busy={waiting} disabled={waiting} onClick={() => openLock(day.value, period.period)}><b>{label}</b><small>{waiting ? (key === lockingKey ? 'กำลังบันทึก' : 'รอคิว') : lesson ? `${lockMode === 'teacher' ? roomLabel(lesson.classroomId) : ''}${locked ? ' ล็อกแล้ว' : ''}` : blocked ? 'ล็อกคาบว่าง' : 'แตะเพื่อกำหนด'}</small></button></td>
      })}</tr>)}</tbody></table></div>}
    </>}
    {view === 'code' && <>
      {cardSections.length === 0 ? <p className="prep-teacher-empty">ไม่พบรหัสวิชานี้</p> : <div className="prep-code-board">{cardSections.map(section => <section key={section.name}><h3 className="prep-code-group">{section.name}</h3><ul className="prep-code-cards">{section.cards.map(card => {
        const assigned = card.lessons.filter(lesson => teacherOf(lesson)).length
        return <li key={card.id}><button type="button" onClick={() => openCode(card.id)}><strong>{card.name}</strong><b>{card.code}</b><small>{card.lessons.length} ห้อง · มีครู {assigned}</small></button></li>
      })}</ul></section>)}</div>}
    </>}
    <div className="prep-load-save"><span>{ready ? 'กำหนดครูและภาระสอนครบแล้ว' : 'ยังมีวิชาที่ยังไม่กำหนดครูหรือคาบให้ครบ'}</span><button type="button" className="prep-primary" disabled={busy || !dirty || !patternsReady} onClick={onSave}>บันทึกภาระสอน</button></div>
    <dialog ref={lockDialog} className="prep-team-dialog prep-activity-dialog" aria-labelledby="lock-title" onCancel={event => { event.preventDefault(); closeLock() }}>{lockCell && <>
      <header><div><h2 id="lock-title">{lockMode === 'room' ? 'ล็อกคาบเรียน' : 'ล็อกคาบสอน'}</h2><p>{SCHEDULE_DAYS.find(day => day.value === lockCell.day)?.label} · คาบ {lockCell.period} · {lockMode === 'room' ? roomLabel(activeRoom) : teacherName(teacherId)}</p></div><button type="button" aria-label="ปิด" onClick={closeLock}>ปิด</button></header>
      <div className="prep-team-dialog-body"><fieldset className="prep-activity-sections">
        {lockMode === 'teacher' && <section className="prep-activity-block"><div className="prep-activity-head"><span>1</span><div><h3>คาบว่าง</h3><p>ล็อกไว้เมื่อครูไม่สะดวกสอนคาบนี้</p></div></div>
          <div className="prep-activity-scope">{teacherBlocked(lockCell.day, lockCell.period) ? <button type="button" onClick={() => applyTeacherFree(false)}>ปลดล็อกคาบว่าง</button> : <button type="button" disabled={!!teacherSlot(lockCell.day, lockCell.period)} onClick={() => applyTeacherFree(true)}>ล็อกคาบว่าง</button>}</div>
        </section>}
        <section className="prep-activity-block"><div className="prep-activity-head"><span>{lockMode === 'teacher' ? '2' : '1'}</span><div><h3>{lockMode === 'room' ? 'วิชาที่จะลงคาบนี้' : 'วิชาที่ครูคนนี้จะสอน'}</h3><p>{lockMode === 'room' ? 'เลือกวิชาของห้องนี้ แล้วล็อกไม่ให้จัดตารางย้าย' : 'เลือกวิชาและห้องที่จะให้ครูสอนในคาบนี้'}</p></div></div>
          {lockMode === 'room' && roomSlot(lockCell.day, lockCell.period)?.activity_id ? <p className="prep-teacher-empty">คาบนี้เป็นกิจกรรม แก้ได้ที่ขั้นกิจกรรม</p> : <div className="prep-lock-picks">{(lockMode === 'room' ? lessons.filter(lesson => lesson.classroomId === activeRoom) : lessons.filter(lesson => teacherOf(lesson) === teacherId)).slice().sort((a, b) => a.code.localeCompare(b.code, 'th')).map(lesson => <button type="button" key={lesson.id} aria-pressed={lockPick === lesson.id} onClick={() => setLockPick(lesson.id)}><strong>{lesson.fullName || lesson.name}</strong><b>{lesson.code}</b><small>{roomLabel(lesson.classroomId)}</small></button>)}</div>}
        </section>
      </fieldset></div>
      <footer>
        <span>{lockPick ? 'เลือกวิชาแล้ว' : 'เลือกวิชา หรือล็อกคาบว่าง'}</span>
        <button type="button" onClick={closeLock}>ปิด</button>
        {lockMode === 'room' && !!roomSlot(lockCell.day, lockCell.period)?.class_subject_id && <button type="button" onClick={() => applyRoomLock(null, false)}>เอาวิชาออก</button>}
        {lockMode === 'room' && !!roomSlot(lockCell.day, lockCell.period)?.locked && <button type="button" onClick={() => applyRoomLock(roomSlot(lockCell.day, lockCell.period)?.class_subject_id || null, false)}>ปลดล็อก</button>}
        {lockMode === 'room' && <button type="button" className="prep-primary" disabled={!lockPick || !!roomSlot(lockCell.day, lockCell.period)?.activity_id} onClick={() => applyRoomLock(lockPick, true)}>กำหนดวิชาและล็อก</button>}
        {lockMode === 'teacher' && !!teacherSlot(lockCell.day, lockCell.period) && <button type="button" onClick={() => applyTeacherSubject(null)}>เอาวิชาออก</button>}
        {lockMode === 'teacher' && <button type="button" className="prep-primary" disabled={!lockPick} onClick={() => applyTeacherSubject(lockPick)}>ลงวิชาที่จะสอน</button>}
      </footer>
    </>}</dialog>
    <dialog ref={dialog} className="prep-team-dialog prep-activity-dialog" aria-labelledby="load-title" onCancel={event => { event.preventDefault(); close() }}>{draft && draftLesson && <>
      <header><div><h2 id="load-title">แก้ไขภาระสอน</h2><p>{draftLesson.code} · {draftLesson.fullName || draftLesson.name} · {roomLabel(draftLesson.classroomId)}</p></div><button type="button" aria-label="ปิด" onClick={close}>ปิด</button></header>
      <div className="prep-team-dialog-body"><fieldset className="prep-activity-sections">
        <section className="prep-activity-block"><div className="prep-activity-head"><span>1</span><div><h3>ครูผู้สอน</h3><p>ค้นหาแล้วแตะการ์ดครู</p></div></div>
          <div className="prep-activity-teachers"><input type="search" value={teacherQuery} onChange={event => setTeacherQuery(event.target.value)} placeholder="ค้นหาชื่อหรือตำแหน่ง" aria-label="ค้นหาครูผู้สอน" /><div>{draftTeachers.map(teacher => <button type="button" key={teacher.id} aria-pressed={draft.teacherId === teacher.id} onClick={() => setDraft({ ...draft, teacherId: teacher.id })}><strong>{`${teacher.prefix || ''} ${teacher.full_name}`.trim()}</strong><small>{teacher.position || 'ไม่ระบุตำแหน่ง'}</small></button>)}</div><p>เลือกแล้ว {draft.teacherId ? 1 : 0} คน</p></div>
        </section>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>2</span><div><h3>คาบต่อสัปดาห์</h3><p>เป้า {draft.count} · จัดแล้ว {placedCount(slots, draft.id)} · เหลือ {Math.max(0, draft.count - placedCount(slots, draft.id))}</p></div></div>
          <label className="prep-load-count">จำนวนคาบ<input type="number" min={1} max={40} value={draft.count} onChange={event => { const count = Math.max(1, Math.min(40, Number(event.target.value) || 1)); const pattern = draft.pattern.reduce((sum, size) => sum + size, 0) === count ? draft.pattern : Array(count).fill(1); setDraft({ ...draft, count, pattern }) }} /></label>
          <LessonPatternPicker count={draft.count} value={draft.pattern.join('+')} label={draftLesson.label} onChange={value => setDraft({ ...draft, pattern: value.split('+').map(Number) })} />
        </section>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>3</span><div><h3>ห้องสถานที่</h3><p>ใช้สถานที่เดียวกันเมื่อไม่ต้องการให้จองชนกัน</p></div></div>
          <select aria-label="ห้องสถานที่" value={draft.roomId || ''} onChange={event => setDraft({ ...draft, roomId: event.target.value || null })}><option value="">ไม่กำหนด{draftLesson.roomName ? ` (เดิม ${draftLesson.roomName})` : ''}</option>{places.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select>
          <div className="prep-load-place"><input value={placeName} onChange={event => setPlaceName(event.target.value)} placeholder="เช่น ห้องคอมพิวเตอร์" aria-label="ชื่อสถานที่ใหม่" /><button type="button" disabled={!placeName.trim()} onClick={addPlace}>เพิ่มสถานที่</button></div>
        </section>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>4</span><div><h3>ความต้องการ</h3><p>ใช้ช่วยจัดตาราง ระบบยังคงไม่ให้ครูหรือห้องชนกัน</p></div></div>
          <div className="prep-activity-pills"><button type="button" aria-pressed={draft.spread} onClick={() => setDraft({ ...draft, spread: !draft.spread })}>กระจายวัน</button><button type="button" aria-pressed={draft.morning} onClick={() => setDraft({ ...draft, morning: !draft.morning })}>ช่วงเช้า</button></div>
        </section>
      </fieldset></div>
      <footer><span>{draft.teacherId && patternReady ? 'พร้อมใช้กับวิชานี้' : 'เลือกครูและแบ่งคาบให้ครบ'}</span><button type="button" onClick={close}>ยกเลิก</button><button type="button" className="prep-primary" disabled={!draft.teacherId || !patternReady} onClick={apply}>ใช้กับวิชานี้</button></footer>
    </>}</dialog>
    <dialog ref={codeDialog} className="prep-team-dialog prep-activity-dialog" aria-labelledby="code-load-title" onCancel={event => { event.preventDefault(); closeCode() }}>{activeSubject && <>
      <header><div><h2 id="code-load-title">{activeSubject.name}</h2><p>{activeSubject.code} · {activeSubject.lessons.length} ห้อง</p></div><button type="button" aria-label="ปิด" onClick={closeCode}>ปิด</button></header>
      <div className="prep-team-dialog-body"><fieldset className="prep-activity-sections">
        <section className="prep-activity-block"><div className="prep-activity-head"><span>1</span><div><h3>ห้องที่เรียนวิชานี้</h3><p>เลือกได้หลายห้องในครั้งเดียว</p></div></div>
          <div className="prep-code-rooms">
            <div className="prep-subject-levels" role="tablist" aria-label="ชั้นของรหัสนี้">{codeLevels.map(item => <button key={item} type="button" aria-pressed={item === shownCodeLevel} onClick={() => setCodeLevel(item)}>{item}</button>)}</div>
            <div className="prep-activity-scope"><button type="button" onClick={() => setCodeLessonIds(values => [...new Set([...values, ...codeLevelLessons.filter(lesson => !codeTeacher || teacherOf(lesson) !== codeTeacher).map(lesson => lesson.id)])])}>ทั้ง {shownCodeLevel}</button><button type="button" onClick={() => setCodeLessonIds(values => values.filter(id => !codeLevelLessons.some(lesson => lesson.id === id)))}>เอาห้องชั้นนี้ออก</button></div>
            <div className="prep-activity-room-picks">{codeLevelLessons.map(lesson => { const owned = !!codeTeacher && teacherOf(lesson) === codeTeacher; const current = teacherName(teacherOf(lesson)); return <button type="button" key={lesson.id} aria-pressed={owned || codeLessonIds.includes(lesson.id)} disabled={owned} title={owned ? 'กำหนดให้ครูนี้แล้ว' : current || 'ยังไม่มีครู'} onClick={() => toggleCodeLesson(lesson.id)}><span>ห้อง {roomOf(lesson.classroomId)?.name}</span><small>{owned ? 'กำหนดแล้ว' : current || 'ยังไม่มีครู'}</small></button> })}</div>
          </div>
        </section>
        <section className="prep-activity-block"><div className="prep-activity-head"><span>2</span><div><h3>ครูผู้สอน</h3><p>ครูคนนี้จะได้สอนห้องที่เลือกในรหัส {activeSubject.code}</p></div></div>
          <div className="prep-activity-teachers"><input type="search" value={teacherQuery} onChange={event => setTeacherQuery(event.target.value)} placeholder="ค้นหาชื่อหรือตำแหน่ง" aria-label="ค้นหาครูที่จะกำหนด" /><div>{codeTeachers.map(teacher => <button type="button" key={teacher.id} aria-pressed={codeTeacher === teacher.id} onClick={() => setCodeTeacher(teacher.id)}><strong>{`${teacher.prefix || ''} ${teacher.full_name}`.trim()}</strong><small>{teacher.position || 'ไม่ระบุตำแหน่ง'}</small></button>)}</div></div>
        </section>
      </fieldset></div>
      <footer><span>{chosenLessons.length ? `เลือก ${chosenLessons.length} ห้อง${chosenLessons.some(lesson => teacherOf(lesson)) ? ` · เปลี่ยนครูเดิม ${chosenLessons.filter(lesson => teacherOf(lesson)).length} ห้อง` : ''}` : 'เลือกห้องและครู'}</span><button type="button" onClick={closeCode}>ปิด</button><button type="button" className="prep-primary" disabled={!codeTeacher || !chosenLessons.length || chosenLessons.length > 500} onClick={assignCodes}>กำหนดครู</button></footer>
    </>}</dialog>
    <dialog ref={addDialog} className="prep-team-dialog prep-catalog-dialog" aria-labelledby="add-load-title" onCancel={event => { event.preventDefault(); addDialog.current?.close() }}>
      <header><div><h2 id="add-load-title">เพิ่มวิชาให้ครู</h2><p>{teacherName(teacherId)}</p></div><button type="button" aria-label="ปิด" onClick={() => addDialog.current?.close()}>ปิด</button></header>
      <div className="prep-team-dialog-body">
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหารหัส ชื่อวิชา หรือห้อง" aria-label="ค้นหาวิชาที่จะเพิ่ม" />
        <ul className="prep-load-pick">{lessons.filter(lesson => teacherOf(lesson) !== teacherId && (!query.trim() || `${lesson.code} ${lesson.fullName || lesson.name} ${roomLabel(lesson.classroomId)}`.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 80).map(lesson => <li key={lesson.id}><label><input type="checkbox" checked={picked.includes(lesson.id)} onChange={() => setPicked(values => values.includes(lesson.id) ? values.filter(id => id !== lesson.id) : [...values, lesson.id])} /><span><strong>{lesson.code} · {lesson.fullName || lesson.name}</strong><small>{roomLabel(lesson.classroomId)} · {teacherName(teacherOf(lesson)) || 'ยังไม่มีครู'}</small></span></label></li>)}</ul>
      </div>
      <footer><span>เลือก {picked.length} วิชา</span><button type="button" onClick={() => addDialog.current?.close()}>ยกเลิก</button><button type="button" className="prep-primary" disabled={!picked.length} onClick={() => void assignPicked()}>กำหนดให้ครูนี้</button></footer>
    </dialog>
  </section>
}
