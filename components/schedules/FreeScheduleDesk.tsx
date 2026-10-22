'use client'

import { useEffect, useMemo, useState } from 'react'
import { FiCalendar, FiGrid, FiRepeat, FiUsers, FiZap } from 'react-icons/fi'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import { validatePeriodTimes } from '@/lib/schedule-helpers'
import { buildDeviceDraft, type DeviceDraft } from '@/lib/schedule-device-build'
import { readFreePlan, writeFreePlan } from '@/lib/schedule-device-cache'
import { solveScheduleOnDevice } from '@/lib/schedule-device-run'
import { activityTeacherId, copyTermSubjects, normalizePlan, roomNeed, slotCapacity, teachingRows, toDeviceSnapshot, type FreeWizardPlan } from '@/lib/schedule-device-free'
import FreeSubstituteDesk, { type FreeSubstituteEntry, type LocalCell } from '@/components/schedules/FreeSubstituteDesk'
import FreeScheduleWizard, { FreePlanBoard } from '@/components/schedules/FreeScheduleWizard'
export type LiveFreeAd = { title: string; href: string; imageUrl: string }

type DeskTier = 'school' | 'free' | 'pro'
type FreePlan = FreeWizardPlan & { substitutes: Record<string, FreeSubstituteEntry[]> }
type FreeBundle = { semester: 1 | 2; terms: { 1: FreePlan; 2: FreePlan } }

function blankPlan(shared?: Partial<FreePlan>): FreePlan {
  const base = normalizePlan(shared)
  return { ...base, subjects: shared?.subjects ? base.subjects : [], timetable: shared?.timetable || [], substitutes: shared?.substitutes || {}, blocks: shared?.blocks || [], activities: shared?.activities ? base.activities : [] }
}

function shareFields(source: FreePlan, target: FreePlan): FreePlan {
  return { ...target, teachers: source.teachers, rooms: source.rooms, places: source.places, days: source.days, periods: source.periods }
}

function asBundle(raw?: Partial<FreeBundle> & Partial<FreePlan>): FreeBundle {
  const stored = raw?.terms
  if (stored) {
    const first = blankPlan(stored[1])
    return { semester: raw?.semester === 2 ? 2 : 1, terms: { 1: first, 2: shareFields(first, blankPlan(stored[2])) } }
  }
  const term = blankPlan(raw)
  return { semester: 1, terms: { 1: term, 2: shareFields(term, blankPlan()) } }
}

function draftFrom(cells: LocalCell[]): DeviceDraft {
  return {
    status: 'complete',
    issues: [],
    rows: cells.map(cell => ({ classroom_id: cell.classroomId, academic_year_id: 'local', day_of_week: cell.day, period: cell.period, class_subject_id: cell.subjectId, activity_id: null, note: null, locked: !!cell.locked })),
    offerings: [],
    unlock: [],
    assigned: cells.length,
    locked: 0,
  }
}


function localReport(plan: FreePlan) {
  const teacherName = Object.fromEntries(plan.teachers.map(teacher => [teacher.id, teacher.name]))
  const roomName = Object.fromEntries(plan.rooms.map(room => [room.id, room.label]))
  const clashes: string[] = []
  const seen = new Map<string, string>()
  const places = new Map<string, string>()
  const load = new Map<string, number>()
  const mark = (teacherId: string, day: number, period: number, where: string) => {
    const who = teacherName[teacherId] || 'ครู'
    load.set(who, (load.get(who) || 0) + 1)
    const key = `${teacherId}|${day}|${period}`
    const previous = seen.get(key)
    const when = `วัน${SCHEDULE_DAYS.find(item => item.value === day)?.label || day} คาบ ${period}`
    if (previous && previous !== where) clashes.push(`${who} ${when}: ${previous} กับ ${where}`)
    else seen.set(key, where)
  }
  for (const cell of plan.timetable) {
    const subject = plan.subjects.find(item => item.id === cell.subjectId)
    if (!subject) continue
    const where = `${roomName[cell.classroomId] || ''} ${subject.name}`.trim()
    mark(subject.teacherId, cell.day, cell.period, where)
    if (subject.placeId) {
      const placeKey = `${subject.placeId}|${cell.day}|${cell.period}`
      const previous = places.get(placeKey)
      if (previous && previous !== where) clashes.push(`${plan.places.find(place => place.id === subject.placeId)?.name || 'สถานที่'} วัน${SCHEDULE_DAYS.find(item => item.value === cell.day)?.label || cell.day} คาบ ${cell.period}: ${previous} กับ ${where}`)
      else places.set(placeKey, where)
    }
  }
  for (const activity of plan.activities) {
    for (const cell of activity.cells) {
      if (activity.mode === 'separate') {
        for (const roomId of activity.roomIds) {
          const teacherId = activity.roomTeachers[roomId]
          if (teacherId) mark(teacherId, cell.day, cell.period, `${roomName[roomId] || ''} ${activity.name}`.trim())
        }
      } else if (activity.teacherId) mark(activity.teacherId, cell.day, cell.period, activity.name)
    }
  }
  return { clashes, load: [...load.entries()] }
}

function cellLabel(plan: FreePlan, roomId: string, day: number, period: number) {
  const activity = plan.activities.find(item => item.roomIds.includes(roomId) && item.cells.some(cell => cell.day === day && cell.period === period))
  if (activity) return `${activity.name}<br><small>${plan.teachers.find(teacher => teacher.id === activityTeacherId(activity, roomId))?.name || ''}</small>`
  const cell = plan.timetable.find(item => item.classroomId === roomId && item.day === day && item.period === period)
  const subject = cell ? plan.subjects.find(item => item.id === cell.subjectId) : undefined
  return subject ? `${subject.name}<br><small>${plan.teachers.find(teacher => teacher.id === subject.teacherId)?.name || ''}</small>` : ''
}

export default function FreeScheduleDesk({ tier, ad = null }: { tier: DeskTier; ad?: LiveFreeAd | null }) {
  const [bundle, setBundle] = useState<FreeBundle>(() => asBundle())
  const data = bundle.terms[bundle.semester]
  const [ready, setReady] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [previewRoom, setPreviewRoom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<DeviceDraft | null>(null)
  const [mode, setMode] = useState<'class' | 'teacher' | 'wizard' | 'substitute'>('class')
  const [wizardStep, setWizardStep] = useState(1)
  const [lockTeacher, setLockTeacher] = useState('')
  const [paperTitle, setPaperTitle] = useState('')
  const [picked, setPicked] = useState('')

  useEffect(() => {
    if (!lockTeacher && data.teachers[0]) setLockTeacher(data.teachers[0].id)
  }, [lockTeacher, data.teachers])

  useEffect(() => {
    let active = true
    readFreePlan<FreeBundle & FreePlan>().then(row => {
      if (!active) return
      const next = asBundle(row?.data)
      setBundle(next)
      const plan = next.terms[next.semester]
      if (row?.savedAt) setSavedAt(row.savedAt)
      if (plan.timetable.length) setDraft(draftFrom(plan.timetable))
      setPreviewRoom(plan.rooms[0]?.id || '')
      setLockTeacher(plan.teachers[0]?.id || '')
      setReady(true)
    })
    return () => { active = false }
  }, [])

  function commit(next: FreeBundle) {
    setBundle(next)
    const saved = new Date().toISOString()
    setSavedAt(saved)
    void writeFreePlan(next, saved)
  }

  function persist(next: FreePlan, syncShared = false) {
    const other = bundle.semester === 1 ? 2 : 1
    commit({
      ...bundle,
      terms: {
        ...bundle.terms,
        [bundle.semester]: next,
        [other]: syncShared ? shareFields(next, bundle.terms[other]) : bundle.terms[other],
      },
    })
  }

  function saveWizard(next: FreeWizardPlan, clearTimetable = false) {
    setDraft(null)
    persist({ ...data, ...next, substitutes: data.substitutes, timetable: clearTimetable ? [] : next.timetable }, true)
  }

  async function arrange(roomIds?: string[]) {
    const scope = roomIds?.length ? roomIds : data.rooms.map(room => room.id)
    if (!scope.length || !data.subjects.some(subject => scope.includes(subject.roomId))) {
      setError('เพิ่มห้องและรายวิชาก่อนจัดตาราง')
      return
    }
    if (validatePeriodTimes(data.periods)) {
      setError('ตรวจเวลาคาบในขั้นวันและเวลาก่อนจัด')
      return
    }
    setBusy(true)
    setError('')
    try {
      const snapshot = toDeviceSnapshot(data, scope)
      const result = await solveScheduleOnDevice(snapshot, 'local', scope, true)
      const shown = result.status === 'invalid' && !result.issues.length ? buildDeviceDraft(snapshot, 'local', scope, true) : result
      setDraft(shown)
      if (shown.status !== 'complete') setError(shown.issues[0]?.message || shown.message || 'จัดตารางไม่สำเร็จ')
      if (shown.status === 'complete') {
        const placed = shown.rows.filter(row => row.class_subject_id && scope.includes(row.classroom_id)).map(row => ({ classroomId: row.classroom_id, day: row.day_of_week, period: row.period, subjectId: row.class_subject_id || '', locked: row.locked }))
        persist({ ...data, timetable: [...data.timetable.filter(cell => !scope.includes(cell.classroomId)), ...placed] })
      }
      setPreviewRoom(current => current || scope[0] || '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'จัดตารางบนเครื่องนี้ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const report = useMemo(() => localReport(data), [data])
  const showReview = tier !== 'free'

  function switchTerm(semester: 1 | 2) {
    const next = { ...bundle, semester }
    commit(next)
    const plan = next.terms[semester]
    setDraft(plan.timetable.length ? draftFrom(plan.timetable) : null)
    setPreviewRoom(plan.rooms[0]?.id || '')
    setPicked('')
    setError('')
  }

  function placeCell(subjectId: string) {
    const [dayText, periodText] = picked.split(':')
    const day = Number(dayText)
    const period = Number(periodText)
    if (!previewRoom || !day || !period) return
    const rest = data.timetable.filter(cell => !(cell.classroomId === previewRoom && cell.day === day && cell.period === period))
    const timetable = subjectId ? [...rest, { classroomId: previewRoom, day, period, subjectId, locked: false }] : rest
    setDraft(null)
    persist({ ...data, timetable })
  }

  function toggleCellLock() {
    const [dayText, periodText] = picked.split(':')
    const day = Number(dayText)
    const period = Number(periodText)
    setDraft(null)
    persist({ ...data, timetable: data.timetable.map(cell => cell.classroomId === previewRoom && cell.day === day && cell.period === period ? { ...cell, locked: !cell.locked } : cell) })
  }

  function toggleBlock(teacherId: string, day: number, period: number) {
    const exists = data.blocks.some(block => block.teacherId === teacherId && block.day === day && block.period === period)
    persist({
      ...data,
      blocks: exists
        ? data.blocks.filter(block => !(block.teacherId === teacherId && block.day === day && block.period === period))
        : [...data.blocks, { teacherId, day, period }],
    })
  }

  function printPersonal() {
    const title = paperTitle.trim() || 'ตารางเรียน'
    const rooms = data.rooms.filter(room => data.timetable.some(cell => cell.classroomId === room.id))
    const periods = teachingRows(data.periods)
    const body = rooms.map(room => {
      const rows = SCHEDULE_DAYS.filter(day => data.days.includes(day.value)).map(day => {
        const cells = periods.map(period => {
          const text = cellLabel(data, room.id, day.value, period.period)
          return `<td>${text}</td>`
        }).join('')
        return `<tr><th>${day.label}</th>${cells}</tr>`
      }).join('')
      const heads = periods.map(period => `<th>คาบ ${period.period}</th>`).join('')
      return `<h2>${room.label}</h2><table><thead><tr><th>วัน</th>${heads}</tr></thead><tbody>${rows}</tbody></table>`
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
      <header className="desk-head">
        <div>
          <span>ตารางเรียนและตารางสอน</span>
          <h1>{mode === 'wizard' && wizardStep === 4 ? 'กิจกรรมและครู' : mode === 'wizard' ? 'เตรียมและจัดตาราง' : mode === 'teacher' ? 'ตารางสอนและคาบที่ล็อก' : mode === 'substitute' ? 'จัดครูสอนแทน' : `ตารางเรียน ภาคเรียนที่ ${bundle.semester}`}</h1>
          <p>ข้อมูลอยู่บนเครื่องนี้ ใช้ปุ่มจัดตารางเพื่อเดินขั้นเดียวกับตัวโปร</p>
          {savedAt && <small>บันทึกในเครื่องล่าสุด {new Date(savedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</small>}
        </div>
        <label className="field term">ภาคเรียน<select value={bundle.semester} onChange={event => switchTerm(Number(event.target.value) === 2 ? 2 : 1)}><option value={1}>ภาคเรียนที่ 1</option><option value={2}>ภาคเรียนที่ 2</option></select></label>
        <button type="button" className="quick" aria-pressed={mode === 'wizard' && wizardStep !== 4} onClick={() => { setWizardStep(1); setMode('wizard') }}>
          <FiZap aria-hidden="true" />
          <span>จัดตาราง<small>เตรียมข้อมูลและสร้างฉบับร่าง</small></span>
        </button>
      </header>

      {!ready ? <p className="note">กำลังเปิดข้อมูลในเครื่อง...</p> : (
        <>
          {ad && <LiveAd ad={ad} />}
          <nav className="workspace-nav" aria-label="พื้นที่จัดตาราง">
            <button type="button" aria-pressed={mode === 'class'} onClick={() => setMode('class')}><FiGrid aria-hidden="true" />ตารางเรียน</button>
            <button type="button" aria-pressed={mode === 'teacher'} onClick={() => setMode('teacher')}><FiUsers aria-hidden="true" />ตารางสอน / ล็อกคาบ</button>
            <button type="button" aria-pressed={mode === 'wizard' && wizardStep === 4} onClick={() => { setWizardStep(4); setMode('wizard') }}><FiCalendar aria-hidden="true" />กิจกรรมและครู</button>
            <button type="button" aria-pressed={mode === 'substitute'} onClick={() => setMode('substitute')}><FiRepeat aria-hidden="true" />สอนแทน</button>
          </nav>
          {mode === 'wizard' ? (
            <FreeScheduleWizard plan={data} step={wizardStep} onStep={setWizardStep} onPlan={saveWizard} busy={busy} error={error} draft={draft} previewRoom={previewRoom} onPreviewRoom={setPreviewRoom} onArrange={roomIds => void arrange(roomIds)} canCopyOther={bundle.terms[bundle.semester === 1 ? 2 : 1].subjects.length > 0} onCopyOther={() => { setDraft(null); persist({ ...data, ...copyTermSubjects(bundle.terms[bundle.semester === 1 ? 2 : 1], data) }, true) }} />
          ) : mode === 'teacher' ? (
            <article>
              <h2>ตารางสอนและคาบที่ล็อก</h2>
              <label className="field">ครู<select value={lockTeacher} onChange={event => setLockTeacher(event.target.value)}><option value="">เลือกครู</option>{data.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
              {lockTeacher && (
                <div className="board">
                  <table>
                    <thead><tr><th>วัน</th>{teachingRows(data.periods).map(period => <th key={period.period}>คาบ {period.period}</th>)}</tr></thead>
                    <tbody>
                      {SCHEDULE_DAYS.filter(day => data.days.includes(day.value)).map(day => (
                        <tr key={day.value}>
                          <td>{day.label}</td>
                          {teachingRows(data.periods).map(row => {
                            const period = row.period
                            const subject = data.subjects.find(item => item.teacherId === lockTeacher && data.timetable.some(cell => cell.subjectId === item.id && cell.day === day.value && cell.period === period))
                            const activity = data.activities.find(item => item.cells.some(cell => cell.day === day.value && cell.period === period) && item.roomIds.some(roomId => activityTeacherId(item, roomId) === lockTeacher))
                            const blocked = data.blocks.some(block => block.teacherId === lockTeacher && block.day === day.value && block.period === period)
                            return <td key={period}>{subject ? <>{subject.name}<small>มีคาบสอน</small></> : activity ? <>{activity.name}<small>กิจกรรม</small></> : <button type="button" aria-pressed={blocked} onClick={() => toggleBlock(lockTeacher, day.value, period)}>{blocked ? 'ล็อก' : 'ว่าง'}</button>}</td>
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          ) : mode === 'substitute' ? (
            <FreeSubstituteDesk teachers={data.teachers} rooms={data.rooms} subjects={data.subjects} timetable={data.timetable} days={data.substitutes} periods={data.periods} onSave={substitutes => persist({ ...data, substitutes })} />
          ) : (
            <>
              <div className="actions">
                {data.rooms.length > 0 && <select value={previewRoom} onChange={event => { setPreviewRoom(event.target.value); setPicked('') }} aria-label="ดูตารางห้อง">{data.rooms.map(room => <option key={room.id} value={room.id}>{room.label}</option>)}</select>}
                <button type="button" className="primary" disabled={busy || !previewRoom} onClick={() => void arrange(previewRoom ? [previewRoom] : undefined)}>{busy ? 'กำลังจัด...' : 'จัดห้องนี้'}</button>
                <button type="button" disabled={busy || !data.subjects.length} onClick={() => void arrange()}>จัดทุกห้อง</button>
                <button type="button" onClick={() => { setWizardStep(1); setMode('wizard') }}>เปิดตัวช่วยจัดตาราง</button>
              </div>
              {error && <p className="error" role="alert">{error}</p>}
              {!data.timetable.length && !draft && <p className="note">กดปุ่มจัดตารางด้านบน แล้วเดิน 6 ขั้น จัดเสร็จแล้วกดช่องเพื่อย้ายวิชาหรือล็อก</p>}
              {previewRoom && <div className="quota">{data.subjects.filter(subject => subject.roomId === previewRoom).map(subject => {
                const placed = data.timetable.filter(cell => cell.subjectId === subject.id).length
                return <span key={subject.id}>{subject.name} <b className={placed > subject.periods ? 'over' : placed < subject.periods ? 'short' : ''}>{placed}/{subject.periods}</b></span>
              })}<span>ใช้ {roomNeed(data, previewRoom)} / {slotCapacity(data)} ช่อง</span></div>}
              {previewRoom && (data.timetable.length || data.activities.length || draft?.status === 'complete') && <FreePlanBoard plan={data} roomId={previewRoom} draft={draft?.status === 'complete' ? draft : null} selected={picked} onSelect={(day, period) => setPicked(`${day}:${period}`)} />}
              {picked && previewRoom && (() => {
                const [dayText, periodText] = picked.split(':')
                const day = Number(dayText)
                const period = Number(periodText)
                const activity = data.activities.find(item => item.roomIds.includes(previewRoom) && item.cells.some(cell => cell.day === day && cell.period === period))
                const current = data.timetable.find(cell => cell.classroomId === previewRoom && cell.day === day && cell.period === period)
                return <article>
                  <h2>{SCHEDULE_DAYS.find(item => item.value === day)?.label} คาบ {period}</h2>
                  {activity ? <p className="note">คาบนี้ปักกิจกรรม {activity.name} ไว้ แก้ทีมครูได้ในขั้นกิจกรรม</p> : <>
                    <label className="field">รายวิชา<select value={current?.subjectId || ''} onChange={event => placeCell(event.target.value)}><option value="">ว่าง</option>{data.subjects.filter(subject => subject.roomId === previewRoom).map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
                    <button type="button" disabled={!current} onClick={toggleCellLock}>{current?.locked ? 'ปลดล็อก' : 'ล็อกคาบนี้'}</button>
                  </>}
                </article>
              })()}
              <div className="grid">
                <article>
                  <h2>คาบชน</h2>
                  {report.clashes.length ? <ul className="issues">{report.clashes.map(item => <li key={item}>{item}</li>)}</ul> : <p className="note">ยังไม่พบครูคนเดียวสอนสองห้องในคาบเดียวกัน หรือแย่งห้องใช้ร่วม</p>}
                </article>
                <article>
                  <h2>ภาระงานจากตารางนี้</h2>
                  {report.load.length ? <ul>{report.load.map(([name, count]) => <li key={name}><span>{name}</span><b>{count} คาบ</b></li>)}</ul> : <p className="note">ยังไม่มีตารางให้คิดภาระงาน</p>}
                </article>
                {showReview && <article>
                  <h2>พิมพ์หัวกระดาษส่วนตัว</h2>
                  <form onSubmit={event => { event.preventDefault(); printPersonal() }}>
                    <label className="field">หัวกระดาษ<input value={paperTitle} onChange={event => setPaperTitle(event.target.value)} placeholder="เช่น ชื่อครูหรือชื่อห้อง" /></label>
                    <button type="submit" className="primary">พิมพ์ตาราง</button>
                  </form>
                </article>}
              </div>
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
.desk-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px}
.free-schedule button.quick{display:flex;align-items:center;gap:12px;min-height:60px;padding:12px 20px;background:#1373d9;border-color:#1373d9;color:#fff;border-radius:12px;text-align:left;font-size:17px;box-shadow:0 4px 12px #1373d924}
.free-schedule button.quick:hover{background:#0c5bb3}
.free-schedule button.quick svg{width:24px;height:24px;flex:none}
.free-schedule button.quick small{display:block;font-size:12px;line-height:1.6;font-weight:400;color:#fff}
.free-schedule button.quick[aria-pressed=true]{background:#0c5bb3}
.workspace-nav{display:flex;flex-wrap:wrap;gap:8px;padding:8px;background:#edf2f8;border:1px solid #dce6f2;border-radius:14px}
.free-schedule .workspace-nav button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 18px;border-radius:9px;color:#52647c;font-weight:600;border:1px solid transparent;background:transparent}
.free-schedule .workspace-nav button:hover{background:#fff;color:#174f95}
.free-schedule .workspace-nav button[aria-pressed=true]{background:#fff;border-color:#c4d7ef;color:#174f95}
.workspace-nav svg{width:18px;height:18px;flex:none}
.free-wizard{display:grid;gap:14px}
.wizard-head,.wizard-steps button,.wizard-foot{display:flex;gap:12px;align-items:center}
.wizard-head{justify-content:space-between}
.wizard-head span,.wizard-context{color:#52647c;font-weight:600}
.wizard-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0;padding:0;list-style:none}
.wizard-steps button{width:100%;min-height:64px;padding:8px;text-align:left;background:#fff}
.wizard-steps button[aria-current=step]{border-color:#1373d9;background:#eff6ff}
.wizard-steps b{display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:#dbeafe;color:#174f95;flex:none}
.wizard-steps small,.wizard-foot span{display:block;color:#52647c;font-size:12px;font-weight:600}
.checks{display:flex;flex-wrap:wrap;gap:8px}
.checks label{display:flex;gap:6px;align-items:center;min-height:36px;padding:4px 8px;border:1px solid #dce6f2;border-radius:8px;background:#fff}
.times{display:grid;gap:4px}
.board td.is-activity{background:#ecfdf3}
.board td.is-selected{outline:2px solid #1373d9}
.free-schedule .cell-btn{width:100%;min-height:48px;padding:4px;border:0;background:transparent;color:inherit}
.quota{display:flex;flex-wrap:wrap;gap:8px}
.quota span{padding:6px 10px;border:1px solid #dce6f2;border-radius:999px;background:#fff}
.quota b.over{color:#be123c}
.quota b.short{color:#9a3412}
.free-schedule textarea{min-height:120px;width:100%;border:1px solid #cad8e8;border-radius:9px;padding:8px;background:#fbfcfe;color:#182b49}
.term{min-width:160px}
.wizard-foot{justify-content:space-between;flex-wrap:wrap}
.ready{display:inline-flex;align-items:center;gap:6px;color:#166534;font-weight:700}
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
@media(max-width:720px){.free-schedule header,.free-schedule article{padding:16px}.board{overflow-x:auto}.subject-form{grid-template-columns:1fr}.modes{grid-template-columns:1fr 1fr}.free-schedule button.quick{width:100%}.workspace-nav{display:grid;grid-template-columns:1fr 1fr}.workspace-nav button:last-child{grid-column:1/-1}}
`
