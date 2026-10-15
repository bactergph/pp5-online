'use client'

import { useEffect, useMemo, useState } from 'react'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import { DEFAULT_PERIOD_TIMES } from '@/lib/schedule-helpers'
import { emptyPlan } from '@/lib/schedule-planning'
import { buildDeviceDraft, type DeviceDraft, type DeviceSnapshot } from '@/lib/schedule-device-build'
import { readFreePlan, writeFreePlan } from '@/lib/schedule-device-cache'
import { solveScheduleOnDevice } from '@/lib/schedule-device-run'
import FreeSubstituteDesk, { type FreeSubstituteEntry, type LocalCell } from '@/components/schedules/FreeSubstituteDesk'
export type LiveFreeAd = { title: string; href: string; imageUrl: string }

type DeskTier = 'school' | 'free' | 'pro'
type EditDraft =
  | { kind: 'teacher'; id: string; name: string }
  | { kind: 'room'; id: string; label: string }
  | { kind: 'subject'; id: string; name: string; roomId: string; teacherId: string; periods: number }

type Teacher = { id: string; name: string }
type Room = { id: string; label: string }
type Subject = { id: string; roomId: string; name: string; teacherId: string; periods: number }
type FreePlan = {
  teachers: Teacher[]
  rooms: Room[]
  subjects: Subject[]
  timetable: LocalCell[]
  substitutes: Record<string, FreeSubstituteEntry[]>
}

const empty: FreePlan = { teachers: [], rooms: [], subjects: [], timetable: [], substitutes: {} }

function asPlan(raw?: Partial<FreePlan>): FreePlan {
  return {
    teachers: raw?.teachers || [],
    rooms: raw?.rooms || [],
    subjects: raw?.subjects || [],
    timetable: raw?.timetable || [],
    substitutes: raw?.substitutes || {},
  }
}

function draftFrom(cells: LocalCell[]): DeviceDraft {
  return {
    status: 'complete',
    issues: [],
    rows: cells.map(cell => ({ classroom_id: cell.classroomId, academic_year_id: 'local', day_of_week: cell.day, period: cell.period, class_subject_id: cell.subjectId, activity_id: null, note: null, locked: false })),
    offerings: [],
    unlock: [],
    assigned: cells.length,
    locked: 0,
  }
}

function newId() {
  return globalThis.crypto.randomUUID()
}

function toSnapshot(plan: FreePlan): DeviceSnapshot {
  const lessons = plan.subjects.map(subject => {
    const room = plan.rooms.find(item => item.id === subject.roomId)
    const teacher = plan.teachers.find(item => item.id === subject.teacherId)
    return {
      id: subject.id,
      classroomId: subject.roomId,
      teacherId: subject.teacherId,
      count: subject.periods,
      label: `${room?.label || 'ห้อง'} · ${subject.name}`,
      name: subject.name,
      fullName: subject.name,
      teacherName: teacher?.name || '',
      pattern: Array.from({ length: subject.periods }, () => 1),
      spread: true,
    }
  })
  return {
    hash: 'local',
    plan: {
      ...emptyPlan(),
      rules: Object.fromEntries(lessons.map(lesson => [lesson.id, { count: lesson.count, pattern: lesson.pattern, roomId: null, morning: false, spread: true }])),
    },
    periods: DEFAULT_PERIOD_TIMES,
    timesConfigured: true,
    classrooms: plan.rooms.map((room, index) => ({ id: room.id, level: room.label, room: index + 1 })),
    lessons,
    slots: [],
    blocks: [],
    activities: [],
    teachers: plan.teachers.map(teacher => ({ id: teacher.id, full_name: teacher.name })),
  }
}

function localReport(plan: FreePlan) {
  const teacherName = Object.fromEntries(plan.teachers.map(teacher => [teacher.id, teacher.name]))
  const roomName = Object.fromEntries(plan.rooms.map(room => [room.id, room.label]))
  const clashes: string[] = []
  const seen = new Map<string, string>()
  const load = new Map<string, number>()
  for (const cell of plan.timetable) {
    const subject = plan.subjects.find(item => item.id === cell.subjectId)
    if (!subject) continue
    const who = teacherName[subject.teacherId] || 'ครู'
    load.set(who, (load.get(who) || 0) + 1)
    const where = `${roomName[cell.classroomId] || ''} ${subject.name}`.trim()
    const key = `${subject.teacherId}|${cell.day}|${cell.period}`
    const previous = seen.get(key)
    if (previous) clashes.push(`${who} วัน${SCHEDULE_DAYS.find(day => day.value === cell.day)?.label || cell.day} คาบ ${cell.period}: ${previous} กับ ${where}`)
    else seen.set(key, where)
  }
  return { clashes, load: [...load.entries()] }
}

export default function FreeScheduleDesk({ tier, ad = null }: { tier: DeskTier; ad?: LiveFreeAd | null }) {
  const [data, setData] = useState<FreePlan>(empty)
  const [ready, setReady] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [roomLabel, setRoomLabel] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [subjectRoom, setSubjectRoom] = useState('')
  const [subjectTeacher, setSubjectTeacher] = useState('')
  const [subjectPeriods, setSubjectPeriods] = useState(2)
  const [previewRoom, setPreviewRoom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<DeviceDraft | null>(null)
  const [mode, setMode] = useState<'setup' | 'plan' | 'substitute' | 'review'>('setup')
  const [paperTitle, setPaperTitle] = useState('')
  const [editing, setEditing] = useState<EditDraft | null>(null)

  useEffect(() => {
    let active = true
    readFreePlan<FreePlan>().then(row => {
      if (!active) return
      const plan = asPlan(row?.data)
      setData(plan)
      if (row?.savedAt) setSavedAt(row.savedAt)
      if (plan.timetable.length) setDraft(draftFrom(plan.timetable))
      setPreviewRoom(plan.rooms[0]?.id || '')
      setSubjectRoom(plan.rooms[0]?.id || '')
      setSubjectTeacher(plan.teachers[0]?.id || '')
      setReady(true)
    })
    return () => { active = false }
  }, [])

  function persist(next: FreePlan) {
    setData(next)
    const saved = new Date().toISOString()
    setSavedAt(saved)
    void writeFreePlan(next, saved)
  }

  function update(next: FreePlan) {
    setDraft(null)
    persist({ ...next, timetable: [] })
  }

  const subjectMap = useMemo(() => Object.fromEntries(data.subjects.map(subject => [subject.id, subject])), [data.subjects])
  const periods = [1, 2, 3, 4, 5, 6]
  const morning = 3

  async function arrange() {
    if (!data.rooms.length || !data.subjects.length) {
      setError('เพิ่มห้องและรายวิชาก่อนจัดตาราง')
      return
    }
    setBusy(true)
    setError('')
    try {
      const snapshot = toSnapshot(data)
      const result = await solveScheduleOnDevice(snapshot, 'local', data.rooms.map(room => room.id), true)
      const shown = result.status === 'invalid' && !result.issues.length ? buildDeviceDraft(snapshot, 'local', data.rooms.map(room => room.id), true) : result
      setDraft(shown)
      if (shown.status === 'complete') {
        persist({
          ...data,
          timetable: shown.rows.filter(row => row.class_subject_id).map(row => ({ classroomId: row.classroom_id, day: row.day_of_week, period: row.period, subjectId: row.class_subject_id || '' })),
        })
      }
      setPreviewRoom(current => current || data.rooms[0]?.id || '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'จัดตารางบนเครื่องนี้ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const report = useMemo(() => localReport(data), [data])
  const showReview = tier !== 'free'

  function saveEdit() {
    if (!editing) return
    if (editing.kind === 'teacher') {
      const name = editing.name.trim()
      if (!name) return
      persist({ ...data, teachers: data.teachers.map(teacher => teacher.id === editing.id ? { ...teacher, name } : teacher) })
    } else if (editing.kind === 'room') {
      const label = editing.label.trim()
      if (!label) return
      persist({ ...data, rooms: data.rooms.map(room => room.id === editing.id ? { ...room, label } : room) })
    } else {
      const name = editing.name.trim()
      if (!name || !editing.roomId || !editing.teacherId) return
      const current = data.subjects.find(subject => subject.id === editing.id)
      const subjects = data.subjects.map(subject => subject.id === editing.id ? { ...subject, name, roomId: editing.roomId, teacherId: editing.teacherId, periods: editing.periods } : subject)
      const changed = !current || current.roomId !== editing.roomId || current.teacherId !== editing.teacherId || current.periods !== editing.periods || current.name !== name
      if (changed && current && (current.roomId !== editing.roomId || current.teacherId !== editing.teacherId || current.periods !== editing.periods)) update({ ...data, subjects })
      else persist({ ...data, subjects })
    }
    setEditing(null)
  }

  function printPersonal() {
    const title = paperTitle.trim() || 'ตารางเรียน'
    const rooms = data.rooms.filter(room => data.timetable.some(cell => cell.classroomId === room.id))
    const body = rooms.map(room => {
      const rows = SCHEDULE_DAYS.map(day => {
        const cells = [1, 2, 3, 4, 5, 6].map(period => {
          const cell = data.timetable.find(item => item.classroomId === room.id && item.day === day.value && item.period === period)
          const subject = cell ? data.subjects.find(item => item.id === cell.subjectId) : undefined
          const teacher = subject ? data.teachers.find(item => item.id === subject.teacherId)?.name : ''
          return `<td>${subject ? `${subject.name}<br><small>${teacher || ''}</small>` : ''}</td>`
        }).join('')
        return `<tr><th>${day.label}</th>${cells}</tr>`
      }).join('')
      return `<h2>${room.label}</h2><table><thead><tr><th>วัน</th><th>คาบ 1</th><th>คาบ 2</th><th>คาบ 3</th><th>คาบ 4</th><th>คาบ 5</th><th>คาบ 6</th></tr></thead><tbody>${rows}</tbody></table>`
    }).join('')
    const popup = window.open('', '_blank', 'noopener,noreferrer')
    if (!popup) return
    popup.document.write(`<!doctype html><html><head><title>${title}</title><style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%;margin-bottom:24px}td,th{border:1px solid #182b49;padding:8px;text-align:center}h1{color:#182b49}</style></head><body><h1>${title}</h1>${body || '<p>ยังไม่มีตาราง</p>'}</body></html>`)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  const tabs = [
    ['setup', 'ข้อมูล'],
    ['plan', 'ตาราง'],
    ['substitute', 'สอนแทน'],
    ...(showReview ? [['review', 'ตรวจและพิมพ์'] as const] : []),
  ] as const

  return (
    <section className="free-schedule">
      <style>{STYLES}</style>
      <header>
        <span>จัดตารางบนเครื่อง</span>
        <h1>ครู ห้อง และวิชาอยู่ในเครื่องนี้</h1>
        <p>เพิ่มและแก้ไขได้จากเมนูข้อมูล ตารางที่จัดแล้วไม่ถูกส่งขึ้นเซิร์ฟเวอร์</p>
        {savedAt && <small>บันทึกในเครื่องล่าสุด {new Date(savedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</small>}
      </header>

      {!ready ? <p className="note">กำลังเปิดข้อมูลในเครื่อง...</p> : (
        <>
          {ad && <LiveAd ad={ad} />}
          <div className="modes" role="tablist" aria-label="เมนูจัดตารางบนเครื่อง">
            {tabs.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'is-on' : ''} onClick={() => setMode(key)}>
                <strong>{label}</strong>
                <small>{key === 'setup' ? `${data.teachers.length} ครู · ${data.rooms.length} ห้อง · ${data.subjects.length} วิชา` : key === 'plan' ? `${data.timetable.length} คาบ` : key === 'substitute' ? `${Object.keys(data.substitutes).length} วัน` : report.clashes.length ? `${report.clashes.length} คาบชน` : 'พร้อมตรวจ'}</small>
              </button>
            ))}
          </div>
          {mode === 'review' && showReview ? (
            <div className="grid">
              <article>
                <h2>คาบชน</h2>
                {report.clashes.length ? <ul className="issues">{report.clashes.map(item => <li key={item}>{item}</li>)}</ul> : <p className="note">ยังไม่พบครูคนเดียวสอนสองห้องในคาบเดียวกัน</p>}
              </article>
              <article>
                <h2>ภาระงานจากตารางนี้</h2>
                {report.load.length ? <ul>{report.load.map(([name, count]) => <li key={name}><span>{name}</span><b>{count} คาบ</b></li>)}</ul> : <p className="note">ยังไม่มีตารางให้คิดภาระงาน</p>}
              </article>
              <article>
                <h2>พิมพ์หัวกระดาษส่วนตัว</h2>
                <form onSubmit={event => { event.preventDefault(); printPersonal() }}>
                  <label className="field">หัวกระดาษ<input value={paperTitle} onChange={event => setPaperTitle(event.target.value)} placeholder="เช่น ชื่อครูหรือชื่อห้อง" /></label>
                  <button type="submit" className="primary">พิมพ์ตาราง</button>
                </form>
              </article>
            </div>
          ) : mode === 'substitute' ? (
            <FreeSubstituteDesk
              teachers={data.teachers}
              rooms={data.rooms}
              subjects={data.subjects}
              timetable={data.timetable}
              days={data.substitutes}
              onSave={substitutes => persist({ ...data, substitutes })}
            />
          ) : mode === 'plan' ? (
          <>
          <div className="actions">
            <button type="button" className="primary" disabled={busy || !data.subjects.length} onClick={() => void arrange()}>{busy ? 'กำลังจัดบนเครื่องนี้...' : 'จัดตารางบนเครื่องนี้'}</button>
            {data.rooms.length > 0 && <select value={previewRoom} onChange={event => setPreviewRoom(event.target.value)} aria-label="ดูตารางห้อง">{data.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select>}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          {!draft && <p className="note">เพิ่มครู ห้อง และวิชาในเมนูข้อมูล แล้วกลับมาจัดตารางที่นี่</p>}
          {draft?.issues.length ? <ul className="issues">{draft.issues.map(issue => <li key={issue.message}>{issue.message}</li>)}</ul> : null}
          {draft?.status === 'complete' && previewRoom && (
            <div className="board">
              <p>จัดได้ {draft.assigned} คาบ ตารางนี้ยังอยู่บนเครื่องนี้</p>
              <table>
                <thead>
                  <tr>
                    <th>วัน</th>
                    {periods.slice(0, morning).map(period => <th key={period}>คาบ {period}</th>)}
                    <th>พัก</th>
                    {periods.slice(morning).map(period => <th key={period}>คาบ {period}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {SCHEDULE_DAYS.map(day => (
                    <tr key={day.value}>
                      <td>{day.label}</td>
                      {periods.slice(0, morning).map(period => {
                        const slot = draft.rows.find(row => row.classroom_id === previewRoom && row.day_of_week === day.value && row.period === period)
                        const subject = slot?.class_subject_id ? subjectMap[slot.class_subject_id] : undefined
                        return <td key={period}>{subject ? <>{subject.name}<small>{data.teachers.find(teacher => teacher.id === subject.teacherId)?.name}</small></> : '—'}</td>
                      })}
                      <td className="break">พัก</td>
                      {periods.slice(morning).map(period => {
                        const slot = draft.rows.find(row => row.classroom_id === previewRoom && row.day_of_week === day.value && row.period === period)
                        const subject = slot?.class_subject_id ? subjectMap[slot.class_subject_id] : undefined
                        return <td key={period}>{subject ? <>{subject.name}<small>{data.teachers.find(teacher => teacher.id === subject.teacherId)?.name}</small></> : '—'}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </>
          ) : (
          <div className="grid">
            <article>
              <h2>ครู</h2>
              <form onSubmit={event => { event.preventDefault(); const name = teacherName.trim(); if (!name) return; const teacher = { id: newId(), name }; update({ ...data, teachers: [...data.teachers, teacher] }); setTeacherName(''); setSubjectTeacher(current => current || teacher.id) }}>
                <label className="field">ชื่อครู<input value={teacherName} onChange={event => setTeacherName(event.target.value)} placeholder="เช่น ครูสมชาย" /></label>
                <button type="submit" className="primary">เพิ่มครู</button>
              </form>
              <ul>
                {data.teachers.map(teacher => <li key={teacher.id}>{editing?.kind === 'teacher' && editing.id === teacher.id ? <form className="inline-edit" onSubmit={event => { event.preventDefault(); saveEdit() }}><input value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} aria-label="แก้ชื่อครู" /><button type="submit" className="primary">บันทึก</button><button type="button" onClick={() => setEditing(null)}>ยกเลิก</button></form> : <div className="row"><span>{teacher.name}</span><span className="row-actions"><button type="button" onClick={() => setEditing({ kind: 'teacher', id: teacher.id, name: teacher.name })}>แก้</button><button type="button" onClick={() => { setEditing(null); update({ ...data, teachers: data.teachers.filter(item => item.id !== teacher.id), subjects: data.subjects.filter(item => item.teacherId !== teacher.id) }) }}>ลบ</button></span></div>}</li>)}
                {!data.teachers.length && <li className="note">ยังไม่มีครู</li>}
              </ul>
            </article>
            <article>
              <h2>ห้อง</h2>
              <form onSubmit={event => { event.preventDefault(); const label = roomLabel.trim(); if (!label) return; const room = { id: newId(), label }; update({ ...data, rooms: [...data.rooms, room] }); setRoomLabel(''); setSubjectRoom(current => current || room.id); setPreviewRoom(current => current || room.id) }}>
                <label className="field">ชื่อห้อง<input value={roomLabel} onChange={event => setRoomLabel(event.target.value)} placeholder="เช่น ม.1/1" /></label>
                <button type="submit" className="primary">เพิ่มห้อง</button>
              </form>
              <ul>
                {data.rooms.map(room => <li key={room.id}>{editing?.kind === 'room' && editing.id === room.id ? <form className="inline-edit" onSubmit={event => { event.preventDefault(); saveEdit() }}><input value={editing.label} onChange={event => setEditing({ ...editing, label: event.target.value })} aria-label="แก้ชื่อห้อง" /><button type="submit" className="primary">บันทึก</button><button type="button" onClick={() => setEditing(null)}>ยกเลิก</button></form> : <div className="row"><span>{room.label}</span><span className="row-actions"><button type="button" onClick={() => setEditing({ kind: 'room', id: room.id, label: room.label })}>แก้</button><button type="button" onClick={() => { setEditing(null); update({ ...data, rooms: data.rooms.filter(item => item.id !== room.id), subjects: data.subjects.filter(item => item.roomId !== room.id) }) }}>ลบ</button></span></div>}</li>)}
                {!data.rooms.length && <li className="note">ยังไม่มีห้อง</li>}
              </ul>
            </article>
            <article>
              <h2>รายวิชา</h2>
              <form className="subject-form" onSubmit={event => { event.preventDefault(); const name = subjectName.trim(); if (!name || !subjectRoom || !subjectTeacher) return; update({ ...data, subjects: [...data.subjects, { id: newId(), name, roomId: subjectRoom, teacherId: subjectTeacher, periods: subjectPeriods }] }); setSubjectName('') }}>
                <label className="field wide">ชื่อวิชา<input value={subjectName} onChange={event => setSubjectName(event.target.value)} placeholder="เช่น คณิตศาสตร์" /></label>
                <label className="field">ห้อง<select value={subjectRoom} onChange={event => setSubjectRoom(event.target.value)}><option value="">เลือกห้อง</option>{data.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select></label>
                <label className="field">ครู<select value={subjectTeacher} onChange={event => setSubjectTeacher(event.target.value)}><option value="">เลือกครู</option>{data.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
                <label className="field">คาบต่อสัปดาห์<input type="number" min={1} max={8} value={subjectPeriods} onChange={event => setSubjectPeriods(Math.min(8, Math.max(1, Number(event.target.value) || 1)))} /></label>
                <button type="submit" className="primary">เพิ่มวิชา</button>
              </form>
              <ul>
                {data.subjects.map(subject => <li key={subject.id}>{editing?.kind === 'subject' && editing.id === subject.id ? <form className="subject-form" onSubmit={event => { event.preventDefault(); saveEdit() }}><label className="field wide">ชื่อวิชา<input value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label><label className="field">ห้อง<select value={editing.roomId} onChange={event => setEditing({ ...editing, roomId: event.target.value })}>{data.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select></label><label className="field">ครู<select value={editing.teacherId} onChange={event => setEditing({ ...editing, teacherId: event.target.value })}>{data.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label><label className="field">คาบ<input type="number" min={1} max={8} value={editing.periods} onChange={event => setEditing({ ...editing, periods: Math.min(8, Math.max(1, Number(event.target.value) || 1)) })} /></label><button type="submit" className="primary">บันทึก</button><button type="button" onClick={() => setEditing(null)}>ยกเลิก</button></form> : <div className="row"><span>{data.rooms.find(room => room.id === subject.roomId)?.label} · {subject.name}<small>{data.teachers.find(teacher => teacher.id === subject.teacherId)?.name} · {subject.periods} คาบ</small></span><span className="row-actions"><button type="button" onClick={() => setEditing({ kind: 'subject', id: subject.id, name: subject.name, roomId: subject.roomId, teacherId: subject.teacherId, periods: subject.periods })}>แก้</button><button type="button" onClick={() => { setEditing(null); update({ ...data, subjects: data.subjects.filter(item => item.id !== subject.id) }) }}>ลบ</button></span></div>}</li>)}
                {!data.subjects.length && <li className="note">ยังไม่มีวิชา</li>}
              </ul>
            </article>
          </div>
          )}
        </>
      )}
    </section>
  )
}

function LiveAd({ ad }: { ad: LiveFreeAd }) {
  const body = (
    <>
      {ad.imageUrl && <img src={ad.imageUrl} alt={ad.title || 'โฆษณา'} />}
      <span><small>โฆษณา</small><strong>{ad.title || ad.href}</strong></span>
    </>
  )
  return ad.href
    ? <a className="ad-live" href={ad.href} target="_blank" rel="noopener noreferrer">{body}</a>
    : <div className="ad-live">{body}</div>
}

const STYLES = `
.free-schedule{display:grid;gap:16px;color:#182b49}
.free-schedule header{padding:22px 24px;border:1px solid #dce6f2;border-radius:16px;background:#fff}
.free-schedule header span{color:#52647c;font-size:13px;font-weight:600}
.free-schedule h1{margin:4px 0;font-size:clamp(23px,2.5vw,30px);font-weight:700}
.free-schedule header p,.free-schedule header small,.note{color:#52647c}
.free-schedule a,.primary{display:inline-flex;align-items:center;min-height:44px;padding:8px 16px;border-radius:10px;background:#1373d9;color:#fff;font-weight:700}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.free-schedule article,.board{padding:16px;border:1px solid #dce6f2;border-radius:14px;background:#fff}
.board{overflow-x:auto}
.free-schedule h2{margin:0 0 10px;font-size:16px}
.free-schedule form,.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:end}
.free-schedule form{display:grid}
.free-schedule input,.free-schedule select{height:42px;min-width:0;border:1px solid #cad8e8;border-radius:9px;padding:0 10px;background:#fbfcfe;color:#182b49}
.free-schedule form input,.free-schedule form select{width:100%}
.field{display:grid;gap:6px;font-size:12px;font-weight:700;color:#52647c}
.subject-form{grid-template-columns:1fr 1fr}
.subject-form .wide{grid-column:1 / -1}
.actions select{min-width:160px;height:44px}
.free-schedule button{min-height:42px;padding:0 12px;border:1px solid #d8dee8;border-radius:9px;background:#fff;color:#174f95;font-weight:700;cursor:pointer}
.free-schedule button.primary{background:#1373d9;border-color:#1373d9;color:#fff}
.free-schedule button:disabled{opacity:.5;cursor:not-allowed}
.free-schedule ul{display:grid;gap:8px;margin:12px 0 0;padding:0;list-style:none}
.free-schedule li{display:block}
.row{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 10px;border:1px solid #e4ebf4;border-radius:10px;background:#fbfcfe}
.row small{display:block;color:#52647c;font-size:12px;font-weight:600}
.row-actions{display:flex;gap:6px;flex:none}
.inline-edit{display:flex;flex-wrap:wrap;gap:8px}
.inline-edit input{flex:1;min-width:140px}
.error{color:#be123c;font-weight:700}
.issues{margin:0;color:#9a3412}
.board table{width:100%;border-collapse:collapse;margin-top:8px}
.board th,.board td{border:1px solid #dce6f2;padding:8px;text-align:center;vertical-align:middle}
.board th,.break{background:#eef2f6}
.board small{display:block;color:#52647c;font-size:12px}
.modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:8px;width:100%}
.modes button{display:grid;gap:2px;align-content:center;justify-items:start;min-height:64px;padding:10px 12px;border:1px solid #dce6f2;border-radius:14px;background:#fff;text-align:left}
.modes button strong{font-size:15px}
.modes button small{color:#52647c;font-size:12px;font-weight:600}
.modes button.is-on{background:#182b49;color:#fff;border-color:#182b49}
.modes button.is-on small{color:#d6e4f5}
.free-schedule a.ad-live,.ad-live{display:flex;gap:12px;align-items:center;min-height:0;padding:12px;border:1px solid #dce6f2;border-radius:12px;background:#fff;color:#182b49;text-decoration:none;font-weight:700}
.ad-live small{display:block;color:#52647c;font-size:12px;font-weight:600}
.ad-live img{width:120px;height:68px;object-fit:cover;border-radius:8px;background:#eef2f6}
.free-sub{display:grid;gap:12px}
.free-sub .schedule-head,.free-sub .schedule-filters,.free-sub .sub-table-wrap,.free-sub .sub-footer,.free-sub .schedule-empty{padding:16px;border:1px solid #dce6f2;border-radius:14px;background:#fff}
.free-sub .schedule-head h2{margin:0;font-size:22px}
.free-sub .schedule-head p,.free-sub .sub-note,.free-sub .schedule-empty{margin:6px 0 0;color:#52647c;white-space:pre-line}
.free-sub .schedule-filters,.free-sub .sub-actions,.free-sub .sub-footer{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
.free-sub .schedule-field{display:grid;gap:6px;min-width:180px}
.free-sub .schedule-field label{font-size:12px;font-weight:700;color:#52647c}
.free-sub .sub-day-label{padding:10px 14px;border-radius:12px;background:#eff6ff;color:#174f95;font-weight:700}
.free-sub .sub-table-wrap{overflow:auto}
.free-sub table{width:100%;min-width:760px;border-collapse:collapse}
.free-sub th,.free-sub td{padding:10px 12px;border-bottom:1px solid #e8eef6;text-align:left;vertical-align:middle}
.free-sub th{background:#f8fafc;color:#52647c;font-size:12px}
.free-sub .sub-group-head td{background:#eaf1f6;color:#26465e;font-weight:700}
.free-sub .sub-group-summary{display:flex;justify-content:space-between;gap:12px;align-items:center}
.free-sub .sub-status{display:inline-block;border-radius:20px;padding:3px 10px;background:#e8f5ed;color:#246344;font-size:12px;white-space:nowrap}
.free-sub .sub-status.pending{background:#fff3db;color:#805e17}
.free-sub .sub-period-time{display:block;color:#6b7d8c;font-size:11px}
.free-sub .sub-footer span{flex:1;color:#52647c}
@media(max-width:720px){.free-schedule header,.free-schedule article{padding:16px}.board{overflow-x:auto}.subject-form{grid-template-columns:1fr}.modes{grid-template-columns:1fr 1fr}}
`
