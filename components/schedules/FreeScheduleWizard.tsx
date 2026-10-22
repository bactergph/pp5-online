'use client'

import { useEffect, useState } from 'react'
import { FiArrowLeft, FiArrowRight, FiCheck, FiZap } from 'react-icons/fi'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import { DEFAULT_PERIOD_TIMES, moveLunchBreak, validatePeriodTimes, type PeriodTimeRow } from '@/lib/schedule-helpers'
import type { DeviceDraft } from '@/lib/schedule-device-build'
import {
  activityTeacherId,
  addLevelRooms,
  importSubjectTable,
  newId,
  periodColumns,
  roomNeed,
  slotCapacity,
  teachingRows,
  withTeachingPeriods,
  patternFor,
  doublesIn,
  type FreeWizardPlan,
} from '@/lib/schedule-device-free'

export type { FreeActivity, FreePlace, FreeSubject, FreeWizardPlan } from '@/lib/schedule-device-free'
export { activityTeacherId, addLevelRooms, doublesIn, importSubjectTable, newId, normalizePlan, patternFor, periodColumns, roomNeed, slotCapacity, teachingRows } from '@/lib/schedule-device-free'

const titles = ['วันและเวลา', 'กำหนดครู', 'รายวิชา', 'กิจกรรม', 'ภาระสอน', 'ตรวจและจัดตาราง']
const descriptions = [
  'เลือกวันเรียน แล้วเพิ่มคาบหรือย้ายพักเที่ยงได้บนเครื่องนี้',
  'เพิ่มครูที่จะใช้จัดตาราง ทั้งสองภาคใช้รายชื่อเดียวกัน',
  'เพิ่มรายวิชาทีละรายการ หรือวางตารางจาก Excel',
  'ปักกิจกรรม วัน และคาบ แล้วเลือกครูร่วมหรือคนละครูต่อห้อง',
  'กำหนดครู คาบต่อสัปดาห์ คาบคู่ และห้องใช้ร่วม',
  'ตรวจช่องว่างแล้วจัดทั้งโรงหรือเฉพาะห้องนี้',
]

export function cellText(plan: FreeWizardPlan, roomId: string, day: number, period: number, draft: DeviceDraft | null) {
  const row = draft?.rows.find(item => item.classroom_id === roomId && item.day_of_week === day && item.period === period)
  const pinned = plan.activities.find(item => item.id === row?.activity_id) || plan.activities.find(item => item.roomIds.includes(roomId) && item.cells.some(cell => cell.day === day && cell.period === period))
  const saved = plan.timetable.find(cell => cell.classroomId === roomId && cell.day === day && cell.period === period)
  if (pinned && (row?.activity_id || !row?.class_subject_id)) {
    const teacherId = activityTeacherId(pinned, roomId)
    return { name: pinned.name, detail: plan.teachers.find(item => item.id === teacherId)?.name || 'กิจกรรม', kind: 'activity' as const, locked: false }
  }
  const subjectId = row?.class_subject_id || saved?.subjectId
  const subject = plan.subjects.find(item => item.id === subjectId)
  if (!subject) return null
  return { name: subject.name, detail: plan.teachers.find(item => item.id === subject.teacherId)?.name || '', kind: 'subject' as const, locked: !!(row?.locked || saved?.locked) }
}

export function FreePlanBoard({ plan, roomId, draft, selected, onSelect }: { plan: FreeWizardPlan; roomId: string; draft: DeviceDraft | null; selected?: string; onSelect?: (day: number, period: number) => void }) {
  const days = SCHEDULE_DAYS.filter(day => plan.days.includes(day.value))
  const columns = periodColumns(plan.periods)
  const renderCell = (day: number, period: number) => {
    const cell = cellText(plan, roomId, day, period, draft)
    const key = `${day}:${period}`
    const body = cell ? <>{cell.name}<small>{cell.detail}{cell.locked ? ' · ล็อก' : ''}</small></> : 'ว่าง'
    return onSelect
      ? <button type="button" className="cell-btn" aria-pressed={selected === key} onClick={() => onSelect(day, period)}>{body}</button>
      : body
  }
  return (
    <div className="board">
      <table>
        <thead>
          <tr>
            <th>วัน</th>
            {columns.before.map(row => <th key={row.period}>คาบ {row.period}</th>)}
            <th>พัก</th>
            {columns.after.map(row => <th key={row.period}>คาบ {row.period}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map(day => (
            <tr key={day.value}>
              <td>{day.label}</td>
              {columns.before.map(row => {
                const cell = cellText(plan, roomId, day.value, row.period, draft)
                return <td key={row.period} className={`${cell?.kind === 'activity' ? 'is-activity' : ''} ${selected === `${day.value}:${row.period}` ? 'is-selected' : ''}`}>{renderCell(day.value, row.period)}</td>
              })}
              <td className="break">พัก</td>
              {columns.after.map(row => {
                const cell = cellText(plan, roomId, day.value, row.period, draft)
                return <td key={row.period} className={`${cell?.kind === 'activity' ? 'is-activity' : ''} ${selected === `${day.value}:${row.period}` ? 'is-selected' : ''}`}>{renderCell(day.value, row.period)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function FreeScheduleWizard({
  plan,
  step,
  onStep,
  onPlan,
  busy,
  error,
  draft,
  previewRoom,
  onPreviewRoom,
  onArrange,
  canCopyOther,
  onCopyOther,
}: {
  plan: FreeWizardPlan
  step: number
  onStep: (step: number) => void
  onPlan: (next: FreeWizardPlan, clearTimetable?: boolean) => void
  busy: boolean
  error: string
  draft: DeviceDraft | null
  previewRoom: string
  onPreviewRoom: (id: string) => void
  onArrange: (roomIds?: string[]) => void
  canCopyOther?: boolean
  onCopyOther?: () => void
}) {
  const [teacherName, setTeacherName] = useState('')
  const [roomLabel, setRoomLabel] = useState('')
  const [levelText, setLevelText] = useState('ม.1, ม.2, ม.3, ม.4, ม.5, ม.6')
  const [levelCount, setLevelCount] = useState(10)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [subjectCode, setSubjectCode] = useState('')
  const [subjectRoom, setSubjectRoom] = useState(plan.rooms[0]?.id || '')
  const [subjectTeacher, setSubjectTeacher] = useState(plan.teachers[0]?.id || '')
  const [subjectPeriods, setSubjectPeriods] = useState(2)
  const [activityName, setActivityName] = useState('')
  const [activityMode, setActivityMode] = useState<'joint' | 'separate'>('joint')
  const [activityTeacher, setActivityTeacher] = useState(plan.teachers[0]?.id || '')
  const [activityRoomTeachers, setActivityRoomTeachers] = useState<Record<string, string>>({})
  const [activityRooms, setActivityRooms] = useState<string[]>([])
  const [activityCells, setActivityCells] = useState<string[]>([])
  const [placeName, setPlaceName] = useState('')
  const [timeError, setTimeError] = useState('')
  const lessons = teachingRows(plan.periods)
  const capacity = slotCapacity(plan)
  const overloaded = plan.rooms.filter(room => roomNeed(plan, room.id) > capacity)

  useEffect(() => {
    setSubjectRoom(current => current || plan.rooms[0]?.id || '')
    setSubjectTeacher(current => current || plan.teachers[0]?.id || '')
    setActivityTeacher(current => current || plan.teachers[0]?.id || '')
    if (!previewRoom && plan.rooms[0]) onPreviewRoom(plan.rooms[0].id)
  }, [plan.rooms, plan.teachers, previewRoom, onPreviewRoom])

  const ready = [
    plan.days.length > 0 && !validatePeriodTimes(plan.periods),
    plan.teachers.length > 0,
    plan.subjects.length > 0 && plan.rooms.length > 0,
    true,
    plan.subjects.every(subject => subject.teacherId && subject.periods > 0 && subject.pattern.reduce((sum, item) => sum + item, 0) === subject.periods),
    draft?.status === 'complete',
  ]
  const status = [
    ready[0] ? `${plan.days.length} วัน · ${lessons.length} คาบ` : 'ยังต้องตรวจเวลา',
    ready[1] ? `${plan.teachers.length} คน` : 'ยังต้องเพิ่มครู',
    ready[2] ? `${plan.subjects.length} รายการ` : 'ยังต้องเพิ่มรายวิชา',
    plan.activities.length ? `${plan.activities.length} กิจกรรม` : 'ยังไม่กำหนด',
    ready[4] ? 'กำหนดครบแล้ว' : 'ยังต้องกำหนดภาระสอน',
    ready[5] ? 'จัดบนเครื่องแล้ว' : 'ยังไม่ได้จัด',
  ]

  function changePeriods(next: PeriodTimeRow[]) {
    const invalid = validatePeriodTimes(next)
    setTimeError(invalid || '')
    if (invalid) {
      onPlan({ ...plan, periods: next })
      return
    }
    const open = new Set(teachingRows(next).map(row => row.period))
    onPlan({
      ...plan,
      periods: next,
      timetable: plan.timetable.filter(cell => open.has(cell.period)),
      activities: plan.activities.map(activity => ({ ...activity, cells: activity.cells.filter(cell => open.has(cell.period)) })),
      blocks: plan.blocks.filter(block => open.has(block.period)),
    })
  }

  function addPeriod() {
    if (lessons.length >= 8) return
    const last = plan.periods.at(-1) || DEFAULT_PERIOD_TIMES.at(-1)!
    const [hour, minute] = last.end_time.split(':').map(Number)
    const end = Math.min(23 * 60 + 50, hour * 60 + minute + 50)
    changePeriods([...plan.periods, { period: lessons.length + 1, label: `คาบที่ ${lessons.length + 1}`, start_time: last.end_time, end_time: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`, is_break: false, sort_order: plan.periods.length + 1 }])
  }

  function addActivity() {
    const name = activityName.trim()
    const cells = activityCells.map(value => {
      const [day, period] = value.split(':').map(Number)
      return { day, period }
    })
    if (!name || !activityRooms.length || !cells.length) return
    if (activityMode === 'joint' && !activityTeacher) return
    if (activityMode === 'separate' && activityRooms.some(roomId => !activityRoomTeachers[roomId])) return
    onPlan({
      ...plan,
      activities: [...plan.activities, { id: newId(), name, mode: activityMode, roomIds: activityRooms, teacherId: activityMode === 'joint' ? activityTeacher : '', roomTeachers: activityMode === 'separate' ? Object.fromEntries(activityRooms.map(roomId => [roomId, activityRoomTeachers[roomId]])) : {}, cells }],
    })
    setActivityName('')
    setActivityCells([])
  }

  return (
    <section className="free-wizard" aria-label="เตรียมและจัดตารางเรียน">
      <header className="wizard-head">
        <div>
          <span><FiZap aria-hidden="true" /> จัดตารางเรียน</span>
          <h2>เตรียมตารางอย่างเป็นขั้นตอน</h2>
          <p>กำหนดวัน ครู วิชา และกิจกรรม แล้วจัดบนเครื่องนี้</p>
        </div>
        <b>ขั้น {step} จาก 6</b>
      </header>
      <ol className="wizard-steps">
        {titles.map((title, index) => (
          <li key={title}>
            <button type="button" aria-current={step === index + 1 ? 'step' : undefined} onClick={() => onStep(index + 1)}>
              <b>{index + 1}</b>
              <span><strong>{title}</strong><small>{status[index]}</small></span>
            </button>
          </li>
        ))}
      </ol>
      <p className="wizard-context">ขั้น {step} · {titles[step - 1]} — {descriptions[step - 1]}</p>
      {(error || timeError || importError) && <p className="error" role="alert">{error || timeError || importError}</p>}

      {step === 1 && (
        <article>
          <h2>วันและเวลาคาบเรียน</h2>
          <div className="checks">
            {SCHEDULE_DAYS.map(day => (
              <label key={day.value}><input type="checkbox" checked={plan.days.includes(day.value)} onChange={() => onPlan({ ...plan, days: plan.days.includes(day.value) ? plan.days.filter(item => item !== day.value) : [...plan.days, day.value].sort() })} />{day.label}</label>
            ))}
          </div>
          <label className="field">พักกลางวันหลังคาบ<select value={periodColumns(plan.periods).before.length} onChange={event => { try { changePeriods(moveLunchBreak(plan.periods, Number(event.target.value))) } catch (cause) { setTimeError(cause instanceof Error ? cause.message : 'ย้ายพักไม่ได้') } }}>{lessons.map(row => <option key={row.period} value={row.period}>คาบที่ {row.period}</option>)}</select></label>
          <div className="board">
            <table>
              <thead><tr><th>คาบ</th><th>เริ่ม</th><th>สิ้นสุด</th><th></th></tr></thead>
              <tbody>
                {plan.periods.map((row, index) => (
                  <tr key={`${row.period}-${row.is_break}`}>
                    <td>{row.is_break ? 'พักเที่ยง' : row.label}</td>
                    <td><input aria-label={`เริ่ม ${row.label}`} value={row.start_time} onChange={event => changePeriods(plan.periods.map((item, itemIndex) => itemIndex === index ? { ...item, start_time: event.target.value } : item))} /></td>
                    <td><input aria-label={`สิ้นสุด ${row.label}`} value={row.end_time} onChange={event => changePeriods(plan.periods.map((item, itemIndex) => itemIndex === index ? { ...item, end_time: event.target.value } : item))} /></td>
                    <td>{!row.is_break && row.period === lessons.length && lessons.length > 1 && <button type="button" onClick={() => changePeriods(plan.periods.filter(item => item !== row).map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 })))}>ลบคาบสุดท้าย</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button type="button" disabled={lessons.length >= 8} onClick={addPeriod}>เพิ่มคาบเรียน</button>
            <button type="button" disabled={lessons.length >= 7} onClick={() => changePeriods(withTeachingPeriods(plan.periods, 7))}>ใช้ 7 คาบ มัธยม</button>
          </div>
          <p className="note">ตอนนี้มี {lessons.length} คาบ × {plan.days.length} วัน = {capacity} ช่องต่อห้อง สูงสุด 8 คาบ</p>
        </article>
      )}

      {step === 2 && (
        <article>
          <h2>ครูผู้สอน</h2>
          <form onSubmit={event => { event.preventDefault(); const name = teacherName.trim(); if (!name) return; const teacher = { id: newId(), name }; onPlan({ ...plan, teachers: [...plan.teachers, teacher] }, true); setTeacherName(''); setSubjectTeacher(current => current || teacher.id); setActivityTeacher(current => current || teacher.id) }}>
            <label className="field">ชื่อครู<input value={teacherName} onChange={event => setTeacherName(event.target.value)} placeholder="เช่น ครูสมชาย" /></label>
            <button type="submit" className="primary">เพิ่มครู</button>
          </form>
          <ul>{plan.teachers.map(teacher => <li key={teacher.id}><div className="row"><span>{teacher.name}</span><button type="button" onClick={() => onPlan({ ...plan, teachers: plan.teachers.filter(item => item.id !== teacher.id), subjects: plan.subjects.filter(item => item.teacherId !== teacher.id) }, true)}>ลบ</button></div></li>)}{!plan.teachers.length && <li className="note">ยังไม่มีครู</li>}</ul>
        </article>
      )}

      {step === 3 && (
        <article>
          <h2>ห้องและรายวิชา</h2>
          <form onSubmit={event => { event.preventDefault(); const levels = levelText.split(/[,،]/).map(item => item.trim()).filter(Boolean); if (!levels.length) return; onPlan(addLevelRooms(plan, levels, levelCount)) }}>
            <label className="field wide">สร้างห้องทั้งระดับ<input value={levelText} onChange={event => setLevelText(event.target.value)} /></label>
            <label className="field">จำนวนห้องต่อระดับ<input type="number" min={1} max={20} value={levelCount} onChange={event => setLevelCount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} /></label>
            <button type="submit">สร้างห้อง</button>
          </form>
          <form onSubmit={event => { event.preventDefault(); const label = roomLabel.trim(); if (!label || plan.rooms.some(room => room.label === label)) return; const room = { id: newId(), label }; onPlan({ ...plan, rooms: [...plan.rooms, room] }); setRoomLabel(''); setSubjectRoom(room.id) }}>
            <label className="field">เพิ่มห้องเดียว<input value={roomLabel} onChange={event => setRoomLabel(event.target.value)} placeholder="เช่น ม.1/1" /></label>
            <button type="submit">เพิ่มห้อง</button>
          </form>
          <form className="subject-form" onSubmit={event => { event.preventDefault(); const name = subjectName.trim(); if (!name || !subjectRoom || !subjectTeacher) return; onPlan({ ...plan, subjects: [...plan.subjects, { id: newId(), roomId: subjectRoom, code: subjectCode.trim(), name, teacherId: subjectTeacher, periods: subjectPeriods, pattern: patternFor(subjectPeriods, 0), placeId: null }] }, true); setSubjectName(''); setSubjectCode('') }}>
            <label className="field">รหัส<input value={subjectCode} onChange={event => setSubjectCode(event.target.value)} placeholder="ค21102" /></label>
            <label className="field">ชื่อวิชา<input value={subjectName} onChange={event => setSubjectName(event.target.value)} placeholder="คณิตศาสตร์" /></label>
            <label className="field">ห้อง<select value={subjectRoom} onChange={event => setSubjectRoom(event.target.value)}><option value="">เลือกห้อง</option>{plan.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select></label>
            <label className="field">ครู<select value={subjectTeacher} onChange={event => setSubjectTeacher(event.target.value)}><option value="">เลือกครู</option>{plan.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
            <label className="field">คาบต่อสัปดาห์<input type="number" min={1} max={40} value={subjectPeriods} onChange={event => setSubjectPeriods(Math.min(40, Math.max(1, Number(event.target.value) || 1)))} /></label>
            <button type="submit" className="primary">เพิ่มวิชา</button>
          </form>
          <form onSubmit={event => { event.preventDefault(); const result = importSubjectTable(importText, plan); if ('error' in result) { setImportError(result.error); return } setImportError(''); setImportText(''); onPlan(result.plan, true) }}>
            <label className="field wide">วางจาก Excel<textarea value={importText} onChange={event => setImportText(event.target.value)} placeholder={'ห้อง\tรหัส\tรายวิชา\tครู\tคาบ\tคาบคู่\tสถานที่\nม.1/1\tค21102\tคณิตศาสตร์\tครูสมชาย\t4\t1\t'} /></label>
            <button type="submit" className="primary">นำเข้ารายวิชา</button>
          </form>
          {canCopyOther && onCopyOther && <button type="button" onClick={onCopyOther}>คัดลอกรายวิชาจากอีกภาค</button>}
          <ul>{plan.subjects.map(subject => <li key={subject.id}><div className="row"><span>{plan.rooms.find(room => room.id === subject.roomId)?.label} · {subject.code ? `${subject.code} ` : ''}{subject.name}<small>{plan.teachers.find(teacher => teacher.id === subject.teacherId)?.name} · {subject.periods} คาบ</small></span><button type="button" onClick={() => onPlan({ ...plan, subjects: plan.subjects.filter(item => item.id !== subject.id) }, true)}>ลบ</button></div></li>)}</ul>
        </article>
      )}

      {step === 4 && (
        <article>
          <h2>กิจกรรมและครู</h2>
          <p className="note">โฮมรูมใช้คนละครูต่อห้อง ชุมนุมที่ครูคนเดียวดูแลหลายห้องใช้ครูร่วม</p>
          <form onSubmit={event => { event.preventDefault(); addActivity() }}>
            <label className="field wide">ชื่อกิจกรรม<input value={activityName} onChange={event => setActivityName(event.target.value)} placeholder="เช่น โฮมรูม" /></label>
            <div className="checks">
              <label><input type="radio" checked={activityMode === 'joint'} onChange={() => setActivityMode('joint')} />ครูคนเดียวทั้งชุด</label>
              <label><input type="radio" checked={activityMode === 'separate'} onChange={() => setActivityMode('separate')} />คนละครูต่อห้อง</label>
            </div>
            {activityMode === 'joint' && <label className="field">ครู<select value={activityTeacher} onChange={event => setActivityTeacher(event.target.value)}><option value="">เลือกครู</option>{plan.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>}
            <div className="actions">{[...new Set(plan.rooms.map(room => room.label.split('/')[0]))].map(level => (
              <button type="button" key={level} onClick={() => setActivityRooms(plan.rooms.filter(room => room.label === level || room.label.startsWith(`${level}/`)).map(room => room.id))}>เลือกทั้ง {level}</button>
            ))}</div>
            <div className="checks">{plan.rooms.map(room => <label key={room.id}><input type="checkbox" checked={activityRooms.includes(room.id)} onChange={() => setActivityRooms(current => current.includes(room.id) ? current.filter(id => id !== room.id) : [...current, room.id])} />{room.label}</label>)}</div>
            {activityMode === 'separate' && activityRooms.map(roomId => (
              <label key={roomId} className="field">{plan.rooms.find(room => room.id === roomId)?.label}<select value={activityRoomTeachers[roomId] || ''} onChange={event => setActivityRoomTeachers(current => ({ ...current, [roomId]: event.target.value }))}><option value="">เลือกครู</option>{plan.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
            ))}
            <div className="checks">{SCHEDULE_DAYS.filter(day => plan.days.includes(day.value)).map(day => lessons.map(row => {
              const key = `${day.value}:${row.period}`
              return <label key={key}><input type="checkbox" checked={activityCells.includes(key)} onChange={() => setActivityCells(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])} />{day.label} คาบ {row.period}</label>
            }))}</div>
            <button type="submit" className="primary">เพิ่มกิจกรรม</button>
          </form>
          <ul>{plan.activities.map(activity => <li key={activity.id}><div className="row"><span>{activity.name}<small>{activity.mode === 'separate' ? 'คนละครูต่อห้อง' : plan.teachers.find(teacher => teacher.id === activity.teacherId)?.name} · {activity.roomIds.length} ห้อง · {activity.cells.length} คาบ</small></span><button type="button" onClick={() => onPlan({ ...plan, activities: plan.activities.filter(item => item.id !== activity.id) })}>ลบ</button></div></li>)}{!plan.activities.length && <li className="note">ยังไม่มีกิจกรรม ข้ามขั้นนี้ได้</li>}</ul>
        </article>
      )}

      {step === 5 && (
        <article>
          <h2>ครูผู้สอน ภาระสอน และห้องใช้ร่วม</h2>
          <form onSubmit={event => { event.preventDefault(); const name = placeName.trim(); if (!name || plan.places.some(place => place.name === name)) return; onPlan({ ...plan, places: [...plan.places, { id: newId(), name: placeName.trim() }] }, true); setPlaceName('') }}>
            <label className="field">ห้องใช้ร่วม เช่น ห้องวิทย์ ห้องคอม<input value={placeName} onChange={event => setPlaceName(event.target.value)} /></label>
            <button type="submit">เพิ่มสถานที่</button>
          </form>
          <div className="board">
            <table>
              <thead><tr><th>ห้อง / รายวิชา</th><th>ครู</th><th>คาบ</th><th>คาบคู่</th><th>สถานที่</th></tr></thead>
              <tbody>
                {plan.subjects.map(subject => (
                  <tr key={subject.id}>
                    <td>{plan.rooms.find(room => room.id === subject.roomId)?.label} · {subject.name}</td>
                    <td><select aria-label={`ครู ${subject.name}`} value={subject.teacherId} onChange={event => onPlan({ ...plan, subjects: plan.subjects.map(item => item.id === subject.id ? { ...item, teacherId: event.target.value } : item) }, true)}>{plan.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></td>
                    <td><input aria-label={`คาบ ${subject.name}`} type="number" min={1} max={40} value={subject.periods} onChange={event => onPlan({ ...plan, subjects: plan.subjects.map(item => item.id === subject.id ? { ...item, periods: Math.min(40, Math.max(1, Number(event.target.value) || 1)), pattern: patternFor(Math.min(40, Math.max(1, Number(event.target.value) || 1)), doublesIn(item.pattern, item.periods)) } : item) }, true)} /></td>
                    <td><input aria-label={`คาบคู่ ${subject.name}`} type="number" min={0} max={Math.floor(subject.periods / 2)} value={doublesIn(subject.pattern, subject.periods)} onChange={event => onPlan({ ...plan, subjects: plan.subjects.map(item => item.id === subject.id ? { ...item, pattern: patternFor(item.periods, Number(event.target.value) || 0) } : item) }, true)} /></td>
                    <td><select aria-label={`สถานที่ ${subject.name}`} value={subject.placeId || ''} onChange={event => onPlan({ ...plan, subjects: plan.subjects.map(item => item.id === subject.id ? { ...item, placeId: event.target.value || null } : item) }, true)}><option value="">ห้องเรียน</option>{plan.places.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!plan.subjects.length && <p className="note">เพิ่มรายวิชาในขั้นที่ 3 ก่อน</p>}
          {overloaded.length > 0 && <ul className="issues">{overloaded.map(room => <li key={room.id}>{room.label} ต้องการ {roomNeed(plan, room.id)} คาบ แต่มี {capacity} ช่อง</li>)}</ul>}
        </article>
      )}

      {step === 6 && (
        <article>
          <h2>ตรวจและจัดตาราง</h2>
          <p className="note">จัดบนเครื่องนี้ ช่องที่ล็อกไว้จะคงอยู่ คาบคู่ทำให้ค้นหาช้าลง ถ้าทั้งโรงไม่ทันให้จัดทีละห้อง</p>
          {overloaded.length > 0 && <ul className="issues">{overloaded.map(room => <li key={room.id}>{room.label} ต้องการ {roomNeed(plan, room.id)} คาบ แต่มี {capacity} ช่อง เพิ่มคาบในขั้นที่ 1 หรือลดรายวิชา</li>)}</ul>}
          <div className="actions">
            <button type="button" className="primary" disabled={busy || !plan.subjects.length || !plan.days.length || overloaded.length > 0} onClick={() => onArrange()}>{busy ? 'กำลังจัดบนเครื่องนี้...' : 'จัดทุกห้อง'}</button>
            <button type="button" disabled={busy || !previewRoom || overloaded.some(room => room.id === previewRoom)} onClick={() => onArrange(previewRoom ? [previewRoom] : undefined)}>จัดห้องนี้</button>
            {plan.rooms.length > 0 && <select value={previewRoom} onChange={event => onPreviewRoom(event.target.value)} aria-label="ดูตารางห้อง">{plan.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select>}
          </div>
          {draft?.issues.length ? <ul className="issues">{draft.issues.map(issue => <li key={issue.message}>{issue.message} <button type="button" onClick={() => onStep(issue.step)}>ไปแก้ข้อมูล</button></li>)}</ul> : null}
          {draft?.status === 'complete' && <p className="note">จัดได้ {draft.assigned} คาบ</p>}
          {draft?.status === 'timeout' && <p className="error">จัดไม่ทันเวลา ลองจัดทีละห้อง</p>}
          {previewRoom && <FreePlanBoard plan={plan} roomId={previewRoom} draft={draft} />}
        </article>
      )}

      <footer className="wizard-foot">
        <button type="button" disabled={step === 1 || busy} onClick={() => onStep(step - 1)}><FiArrowLeft aria-hidden="true" /> ย้อนกลับ</button>
        <span>{step === 6 ? 'จัดบนเครื่องนี้ ตารางไม่ถูกส่งขึ้นเซิร์ฟเวอร์' : `ถัดไป: ${titles[step] || ''}`}</span>
        {step < 6 && <button type="button" className="primary" disabled={busy} onClick={() => onStep(step + 1)}>ขั้นถัดไป <FiArrowRight aria-hidden="true" /></button>}
        {step === 6 && <span className="ready"><FiCheck aria-hidden="true" /> {ready[5] ? 'จัดแล้ว' : 'กดจัดตารางเมื่อข้อมูลครบ'}</span>}
      </footer>
    </section>
  )
}
