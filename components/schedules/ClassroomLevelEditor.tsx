'use client'
import { useScheduleOperations, useScheduleServices } from './ScheduleServices'
import { useMemo, useState } from 'react'
import { SCHOOL_LEVEL_GROUPS } from '@/lib/school-education-type'
import { isTimetableClassroom } from '@/lib/schedules'

type Room = { id: string; level: string; room: number; name: string }

function timetableLevels(rooms: Room[]) {
  const present = new Set(rooms.map(room => room.level))
  const upper = ['ม.4', 'ม.5', 'ม.6'].some(level => present.has(level))
  const primary = [...present].some(level => level.startsWith('ป.') || /^อ\./.test(level))
  const groups = upper || !primary ? SCHOOL_LEVEL_GROUPS.secondary : SCHOOL_LEVEL_GROUPS.primary
  return groups.flatMap(group => group.levels).filter(isTimetableClassroom)
}

function namesByLevel(rooms: Room[], levels: string[]) {
  return Object.fromEntries(levels.map(level => [
    level,
    rooms.filter(room => room.level === level).sort((a, b) => a.room - b.room).map(room => room.name || String(room.room)),
  ]))
}

export default function ClassroomLevelEditor({ classrooms, year, term, locked, busy, onSaved, onBusy }: {
  classrooms: Room[]
  year: string
  term: number
  locked: boolean
  busy: boolean
  onSaved: () => Promise<void>
  onBusy: (value: boolean) => void
}) {
  const { saveTimetableClassrooms } = useScheduleOperations()
  const { local } = useScheduleServices()

  const levels = useMemo(() => local ? [...new Set([...SCHOOL_LEVEL_GROUPS.primary,...SCHOOL_LEVEL_GROUPS.secondary].flatMap(group=>group.levels).filter(isTimetableClassroom))] : timetableLevels(classrooms), [classrooms,local])
  const saved = useMemo(() => namesByLevel(classrooms, levels), [classrooms, levels])
  const signature = JSON.stringify(saved)
  const [edited, setEdited] = useState({source:signature,values:saved})
  const draft = edited.source === signature ? edited.values : saved
  const setDraft = (change:(current:Record<string,string[]>)=>Record<string,string[]>) => setEdited(current=>({source:signature,values:change(current.source===signature?current.values:saved)}))
  const [active, setActive] = useState(levels.find(level => saved[level]?.length) || levels[0] || '')
  const [error, setError] = useState('')
  const names = draft[active] || []
  const dirty = JSON.stringify(draft) !== signature

  function openLevel(level: string, open: boolean) {
    setError('')
    setDraft(current => ({ ...current, [level]: open ? (current[level]?.length ? current[level] : ['1']) : [] }))
  }
  function setCount(level: string, count: number) {
    const nextCount = Math.max(1, Math.min(30, count))
    setError('')
    setDraft(current => {
      const next = (current[level] || []).slice(0, nextCount)
      while (next.length < nextCount) {
        const suggestion = String(next.length + 1)
        next.push(next.some(name => name.trim().toLowerCase() === suggestion.toLowerCase()) ? '' : suggestion)
      }
      return { ...current, [level]: next }
    })
  }
  function rename(level: string, index: number, value: string) {
    setError('')
    setDraft(current => ({ ...current, [level]: (current[level] || []).map((name, item) => item === index ? value : name) }))
  }
  async function save() {
    if (locked || busy) return
    const payload = levels.map(level => ({ level, names: (draft[level] || []).map(name => name.trim()) }))
    if (payload.some(row => row.names.some(name => !name))) { setError('กรอกชื่อห้องให้ครบ'); return }
    onBusy(true)
    try {
      const result = await saveTimetableClassrooms(year, term, payload)
      if (result.error) throw Error(result.error)
      setError('')
      await onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกชั้นเรียนไม่สำเร็จ')
    } finally { onBusy(false) }
  }

  return <section className="prep-classrooms">
    <h2>กำหนดชั้นเรียน</h2>
    <p>เลือกชั้นที่เปิดสอน จำนวนห้อง และชื่อที่แสดง ชื่อเริ่มต้นเป็น 1, 2, 3 และเปลี่ยนได้ เช่น IEP1 หรือ ESMT</p>
    <div className="prep-subject-levels" role="tablist" aria-label="ระดับชั้น">
      {levels.map(level => <button key={level} type="button" aria-pressed={level === active} onClick={() => setActive(level)}>{level}<small>{(draft[level] || []).length ? `${(draft[level] || []).length} ห้อง` : 'ปิด'}</small></button>)}
    </div>
    {active && <div className="prep-room-editor">
      <div className="prep-room-editor-bar">
        <strong>{active}</strong>
        <button type="button" onClick={() => openLevel(active, names.length === 0)}>{names.length ? 'ปิดชั้นนี้' : 'เปิดชั้นนี้'}</button>
        {names.length > 0 && <>
          <button type="button" disabled={names.length <= 1} onClick={() => setCount(active, names.length - 1)}>ลดห้องสุดท้าย</button>
          <span>{names.length} ห้อง</span>
          <button type="button" disabled={names.length >= 30} onClick={() => setCount(active, names.length + 1)}>เพิ่มห้อง</button>
        </>}
      </div>
      {names.length > 0 && <div className="prep-room-names">{names.map((name, index) => <label key={`${active}-${index}`}><span>{active}/</span><input value={name} maxLength={20} aria-label={`ชื่อห้อง ${active} ลำดับ ${index + 1}`} onChange={event => rename(active, index, event.target.value)} /></label>)}</div>}
      {names.length === 0 && <p>ชั้นนี้ปิดอยู่ กดเปิดชั้นนี้เมื่อต้องการใช้จัดตาราง</p>}
    </div>}
    {error && <p className="prep-error" role="alert">{error}</p>}
    {locked && <p className="prep-notice">บันทึกวันและเวลาก่อน แล้วค่อยบันทึกชั้นเรียน</p>}
    <button type="button" className="prep-primary" disabled={busy || locked || !dirty} onClick={() => void save()}>บันทึกชั้นเรียน</button>
  </section>
}
