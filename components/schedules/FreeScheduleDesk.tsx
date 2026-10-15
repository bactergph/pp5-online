'use client'

import { useEffect, useMemo, useState } from 'react'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import { DEFAULT_PERIOD_TIMES } from '@/lib/schedule-helpers'
import { emptyPlan } from '@/lib/schedule-planning'
import { buildDeviceDraft, type DeviceDraft, type DeviceSnapshot } from '@/lib/schedule-device-build'
import { readFreePlan, writeFreePlan } from '@/lib/schedule-device-cache'
import { solveScheduleOnDevice } from '@/lib/schedule-device-run'
import FreeSubstituteDesk, { type FreeSubstituteEntry, type LocalCell } from '@/components/schedules/FreeSubstituteDesk'
import DeviceScheduleUpload from '@/components/schedules/DeviceScheduleUpload'
export type LiveFreeAd = { title: string; href: string; imageUrl: string }

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

export default function FreeScheduleDesk({ tier, ad = null }: { tier: 'free' | 'pro'; ad?: LiveFreeAd | null }) {
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
  const [mode, setMode] = useState<'plan' | 'substitute' | 'review'>('plan')
  const [paperTitle, setPaperTitle] = useState('')

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

  return (
    <section className="free-schedule">
      <style>{STYLES}</style>
      <header>
        <span>{tier === 'pro' ? 'สมาชิกเดี่ยวโปร' : 'สมาชิกเดี่ยวฟรี'}</span>
        <h1>จัดตารางบนเครื่องนี้</h1>
        <p>{tier === 'pro' ? 'ตารางสอนอยู่บนเครื่องนี้ สำรองขึ้นเซิร์ฟเวอร์ได้ และใช้ธุรการกับ ปพ.5/ปพ.6 ได้ไม่เกิน 3 ห้อง' : 'เก็บครู วิชา ห้อง และตารางสอนแทนไว้ในเครื่อง แล้วให้เครื่องนี้จัดตารางเอง'}</p>
        {savedAt && <small>บันทึกในเครื่องล่าสุด {new Date(savedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</small>}
      </header>
      {tier === 'pro' && <DeviceScheduleUpload />}

      {!ready ? <p className="note">กำลังเปิดข้อมูลในเครื่อง...</p> : (
        <>
          {ad && <LiveAd ad={ad} />}
          <div className="modes" role="tablist" aria-label="งานบนเครื่องนี้">
            <button type="button" role="tab" aria-selected={mode === 'plan'} className={mode === 'plan' ? 'is-on' : ''} onClick={() => setMode('plan')}>จัดตาราง</button>
            <button type="button" role="tab" aria-selected={mode === 'substitute'} className={mode === 'substitute' ? 'is-on' : ''} onClick={() => setMode('substitute')}>ตารางสอนแทน</button>
            {tier === 'pro' && <button type="button" role="tab" aria-selected={mode === 'review'} className={mode === 'review' ? 'is-on' : ''} onClick={() => setMode('review')}>ตรวจและพิมพ์</button>}
          </div>
          {mode === 'review' && tier === 'pro' ? (
            <article>
              <h2>คาบชน</h2>
              {report.clashes.length ? <ul className="issues">{report.clashes.map(item => <li key={item}>{item}</li>)}</ul> : <p className="note">ยังไม่พบครูคนเดียวสอนสองห้องในคาบเดียวกัน</p>}
              <h2>ภาระงานจากตารางนี้</h2>
              <ul>{report.load.map(([name, count]) => <li key={name}>{name} · {count} คาบ</li>)}</ul>
              <form onSubmit={event => { event.preventDefault(); printPersonal() }}>
                <input value={paperTitle} onChange={event => setPaperTitle(event.target.value)} placeholder="หัวกระดาษ เช่น ชื่อครูหรือชื่อห้อง" aria-label="หัวกระดาษ" />
                <button type="submit">พิมพ์ตารางหัวกระดาษส่วนตัว</button>
              </form>
            </article>
          ) : mode === 'substitute' ? (
            <FreeSubstituteDesk
              teachers={data.teachers}
              rooms={data.rooms}
              subjects={data.subjects}
              timetable={data.timetable}
              days={data.substitutes}
              onSave={substitutes => persist({ ...data, substitutes })}
            />
          ) : (
          <>
          <div className="grid">
            <article>
              <h2>ครู</h2>
              <form onSubmit={event => { event.preventDefault(); const name = teacherName.trim(); if (!name) return; const teacher = { id: newId(), name }; update({ ...data, teachers: [...data.teachers, teacher] }); setTeacherName(''); setSubjectTeacher(current => current || teacher.id) }}>
                <input value={teacherName} onChange={event => setTeacherName(event.target.value)} placeholder="ชื่อครู" aria-label="ชื่อครู" />
                <button type="submit">เพิ่มครู</button>
              </form>
              <ul>{data.teachers.map(teacher => <li key={teacher.id}>{teacher.name}<button type="button" onClick={() => update({ ...data, teachers: data.teachers.filter(item => item.id !== teacher.id), subjects: data.subjects.filter(item => item.teacherId !== teacher.id) })}>เอาออก</button></li>)}</ul>
            </article>
            <article>
              <h2>ห้อง</h2>
              <form onSubmit={event => { event.preventDefault(); const label = roomLabel.trim(); if (!label) return; const room = { id: newId(), label }; update({ ...data, rooms: [...data.rooms, room] }); setRoomLabel(''); setSubjectRoom(current => current || room.id); setPreviewRoom(current => current || room.id) }}>
                <input value={roomLabel} onChange={event => setRoomLabel(event.target.value)} placeholder="เช่น ม.1/1" aria-label="ชื่อห้อง" />
                <button type="submit">เพิ่มห้อง</button>
              </form>
              <ul>{data.rooms.map(room => <li key={room.id}>{room.label}<button type="button" onClick={() => update({ ...data, rooms: data.rooms.filter(item => item.id !== room.id), subjects: data.subjects.filter(item => item.roomId !== room.id) })}>เอาออก</button></li>)}</ul>
            </article>
            <article>
              <h2>รายวิชา</h2>
              <form onSubmit={event => { event.preventDefault(); const name = subjectName.trim(); if (!name || !subjectRoom || !subjectTeacher) return; update({ ...data, subjects: [...data.subjects, { id: newId(), name, roomId: subjectRoom, teacherId: subjectTeacher, periods: subjectPeriods }] }); setSubjectName('') }}>
                <input value={subjectName} onChange={event => setSubjectName(event.target.value)} placeholder="ชื่อวิชา" aria-label="ชื่อวิชา" />
                <select value={subjectRoom} onChange={event => setSubjectRoom(event.target.value)} aria-label="ห้องของวิชา"><option value="">เลือกห้อง</option>{data.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select>
                <select value={subjectTeacher} onChange={event => setSubjectTeacher(event.target.value)} aria-label="ครูของวิชา"><option value="">เลือกครู</option>{data.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select>
                <input type="number" min={1} max={8} value={subjectPeriods} onChange={event => setSubjectPeriods(Math.min(8, Math.max(1, Number(event.target.value) || 1)))} aria-label="คาบต่อสัปดาห์" />
                <button type="submit">เพิ่มวิชา</button>
              </form>
              <ul>{data.subjects.map(subject => <li key={subject.id}>{data.rooms.find(room => room.id === subject.roomId)?.label} · {subject.name} · {data.teachers.find(teacher => teacher.id === subject.teacherId)?.name} · {subject.periods} คาบ<button type="button" onClick={() => update({ ...data, subjects: data.subjects.filter(item => item.id !== subject.id) })}>เอาออก</button></li>)}</ul>
            </article>
          </div>

          <div className="actions">
            <button type="button" className="primary" disabled={busy || !data.subjects.length} onClick={() => void arrange()}>{busy ? 'กำลังจัดบนเครื่องนี้...' : 'จัดตารางบนเครื่องนี้'}</button>
            {data.rooms.length > 0 && <select value={previewRoom} onChange={event => setPreviewRoom(event.target.value)} aria-label="ดูตารางห้อง">{data.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select>}
          </div>
          {error && <p className="error" role="alert">{error}</p>}
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
.free-schedule form,.actions{display:flex;flex-wrap:wrap;gap:8px}
.free-schedule form{display:grid}
.free-schedule input,.free-schedule select{height:42px;min-width:0;border:1px solid #cad8e8;border-radius:9px;padding:0 10px;background:#fbfcfe}
.free-schedule form input,.free-schedule form select{width:100%}
.actions select{min-width:160px}
.free-schedule button{min-height:42px;padding:0 12px;border:1px solid #d8dee8;border-radius:9px;background:#fff;color:#174f95;font-weight:700;cursor:pointer}
.free-schedule button:disabled{opacity:.5;cursor:not-allowed}
.free-schedule ul{display:grid;gap:6px;margin:10px 0 0;padding:0;list-style:none}
.free-schedule li{display:flex;justify-content:space-between;gap:8px;align-items:center}
.primary{border-color:#1373d9}
.error{color:#be123c;font-weight:700}
.issues{margin:0;color:#9a3412}
.board table{width:100%;border-collapse:collapse;margin-top:8px}
.board th,.board td{border:1px solid #dce6f2;padding:8px;text-align:center;vertical-align:middle}
.board th,.break{background:#eef2f6}
.board small{display:block;color:#52647c;font-size:12px}
.modes{display:flex;gap:6px;padding:4px;border-radius:12px;background:#eef4fb;width:fit-content}
.modes button.is-on{background:#182b49;color:#fff;border-color:#182b49}
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
@media(max-width:720px){.free-schedule header,.free-schedule article{padding:16px}.board{overflow-x:auto}.modes{width:100%}.modes button{flex:1}}
`
