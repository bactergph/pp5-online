'use client'
import { useEffect, useRef, useState } from 'react'
import type { Preparation } from '@/lib/schedule-preparation'
import { SCHEDULE_DAYS } from '@/lib/schedules'
import { normalizeTeacherActivityTime, validateTeacherActivities, teacherActivityMinutes, type TeacherScheduleActivity } from '@/lib/schedule-teacher-activities'
import { teacherActivityConflicts } from '@/lib/schedule-teacher-activity-conflicts'
import { useScheduleOperations } from './ScheduleServices'
import { usePendingScheduleEditor } from './SchedulePendingEdits'
import './schedule-setup.css'

export default function TeacherActivityEditor({
  data,
  year,
  term,
  blocked,
  busy,
  onBusy,
  onSaved,
  onDirty,
  onFix,
  surface = 'wizard',
}: {
  data: Preparation
  year: string
  term: number
  blocked: boolean
  busy: boolean
  onBusy: (value: boolean) => void
  onSaved: () => Promise<void>
  onDirty: (value: boolean) => void
  onFix: () => void
  surface?: 'wizard' | 'settings'
}) {
  const { savePreparation } = useScheduleOperations()
  const [draft, setDraft] = useState<TeacherScheduleActivity | null>(null)
  const [baseline, setBaseline] = useState('null')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const activities = data.plan.teacherActivities || []
  const dirty = !!draft && JSON.stringify(draft) !== baseline
  useEffect(() => { onDirty(dirty); return () => onDirty(false) }, [dirty, onDirty])
  const name = (id: string) => {
    const teacher = data.teachers.find(teacher => teacher.id === id)
    return teacher ? `${teacher.prefix || ''}${teacher.full_name}` : id
  }
  const conflicts = draft ? teacherActivityConflicts(data, draft) : []
  usePendingScheduleEditor('teacher-activity', { step: 4, label: 'กิจกรรมครู', dirty, save: () => save() })
  let validation = ''
  if (draft) {
    try { validateTeacherActivities([...activities.filter(activity => activity.id !== draft.id), draft], data.teachers.map(teacher => teacher.id)) }
    catch (cause) { validation = cause instanceof Error ? cause.message : 'ข้อมูลกิจกรรมครูไม่ถูกต้อง' }
  }

  function open(activity?: TeacherScheduleActivity) {
    setError('')
    setMessage('')
    setBaseline(JSON.stringify(activity || null))
    setDraft(activity
      ? { ...activity, teacherIds: [...activity.teacherIds], days: [...activity.days] }
      : { id: crypto.randomUUID(), name: '', teacherIds: [], days: [3], start_time: '15:30', end_time: '16:30' })
  }

  async function save(remove?: TeacherScheduleActivity) {
    if (lock.current || blocked || busy || !remove && !draft) return false
    if (remove && !window.confirm(`ลบกิจกรรมครู “${remove.name}”? เวลานี้จะไม่ถูกกันไว้สำหรับครูที่เข้าร่วมอีกต่อไป`)) return false
    lock.current = true
    onBusy(true)
    setError('')
    setMessage('')
    try {
      if (!remove && JSON.stringify(activities.find(activity => activity.id === draft!.id) || null) !== baseline) throw Error('กิจกรรมนี้มีการแก้ไขแล้ว กรุณายกเลิกฟอร์มและเปิดข้อมูลล่าสุดก่อนบันทึก')
      const next = remove ? activities.filter(activity => activity.id !== remove.id) : [...activities.filter(activity => activity.id !== draft!.id), draft!]
      validateTeacherActivities(next, data.teachers.map(teacher => teacher.id))
      const result = await savePreparation(year, term, data.hash, { ...data.plan, teacherActivities: next })
      if (result.error) throw Error(result.error)
      setDraft(null)
      await onSaved()
      setMessage(remove ? 'ลบกิจกรรมครูแล้ว' : 'บันทึกกิจกรรมครูแล้ว ตารางครูและ PDF จะใช้ข้อมูลชุดนี้')
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกกิจกรรมครูไม่สำเร็จ')
      return false
    } finally {
      lock.current = false
      onBusy(false)
    }
  }

  function closeDraft() {
    if (busy) return
    setDraft(null)
    setError('')
  }

  function changeTime(field: 'start_time' | 'end_time', value: string) {
    setDraft(current => current ? { ...current, [field]: normalizeTeacherActivityTime(value) ?? value } : current)
  }

  if (surface === 'settings') {
    return (
      <>
        {!draft && error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        {message ? <div className="alert alert-success" role="status">{message}</div> : null}
        <section className="data-card" style={{ padding: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div className="section-title" style={{ marginBottom: 6 }}>รายการกิจกรรม</div>
              <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
                ภาคเรียนที่เลือก · {activities.length} รายการ · แสดงในตารางสอนครูและ PDF
              </p>
            </div>
            <button type="button" className="btn btn-primary" disabled={blocked || busy || !!draft} onClick={() => open()}>
              + เพิ่มกิจกรรมครู
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="thai-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 56, textAlign: 'center' }}>ที่</th>
                  <th>ชื่อกิจกรรม</th>
                  <th style={{ width: 180 }}>วัน</th>
                  <th style={{ width: 120 }}>เวลา</th>
                  <th>ครูที่เข้าร่วม</th>
                  <th style={{ width: 120, textAlign: 'right' }}>นาที/สัปดาห์</th>
                  <th style={{ width: 110, textAlign: 'center' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 36 }}>
                      ยังไม่มีกิจกรรมครู — กด &quot;เพิ่มกิจกรรมครู&quot;
                    </td>
                  </tr>
                ) : activities.map((activity, index) => (
                  <tr key={activity.id}>
                    <td style={{ textAlign: 'center', color: 'var(--text-3)' }}>{index + 1}</td>
                    <td style={{ fontWeight: 700 }}>{activity.name}</td>
                    <td>{activity.days.map(day => SCHEDULE_DAYS.find(item => item.value === day)?.label).filter(Boolean).join(' / ')}</td>
                    <td>{activity.start_time}–{activity.end_time}</td>
                    <td>{activity.teacherIds.length ? activity.teacherIds.map(name).join(', ') : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{activity.teacherIds.length ? teacherActivityMinutes([activity], activity.teacherIds[0]) : '—'}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button type="button" disabled={blocked || busy || !!draft} onClick={() => open(activity)} style={{ color: 'var(--primary)', background: 'none', border: 0, cursor: 'pointer', fontSize: 13, marginRight: 8 }}>แก้ไข</button>
                      <button type="button" disabled={blocked || busy || !!draft} onClick={() => void save(activity)} style={{ color: '#DC2626', background: 'none', border: 0, cursor: 'pointer', fontSize: 13 }}>ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {draft ? (
          <div className="modal-backdrop" onClick={closeDraft}>
            <div className="modal-card" style={{ maxWidth: 760, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={event => event.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                  <div className="section-title" style={{ marginBottom: 4 }}>
                    {activities.some(activity => activity.id === draft.id) ? 'แก้ไขกิจกรรมครู' : 'เพิ่มกิจกรรมครู'}
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>กำหนดวัน เวลา และครูที่เข้าร่วม แล้วตารางสอนครูจะแสดงชื่องานนี้</p>
                </div>
                <button type="button" onClick={closeDraft} disabled={busy} className="btn btn-ghost" style={{ padding: '7px 10px' }}>ปิด</button>
              </div>
              <fieldset disabled={busy || blocked} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <div className="form-grid">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor="teacher-activity-name">ชื่อกิจกรรม</label>
                    <input id="teacher-activity-name" className="form-input" value={draft.name} maxLength={150} placeholder="เช่น ขายของสหกรณ์ / PLC กลุ่มสาระ" onChange={event => setDraft({ ...draft, name: event.target.value })} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="teacher-activity-start">เวลาเริ่ม (24 ชั่วโมง)</label>
                    <input id="teacher-activity-start" className="form-input" value={draft.start_time} placeholder="15:30" inputMode="text" maxLength={5} onChange={event => changeTime('start_time', event.target.value)} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="teacher-activity-end">เวลาสิ้นสุด (24 ชั่วโมง)</label>
                    <input id="teacher-activity-end" className="form-input" value={draft.end_time} placeholder="16:30" inputMode="text" maxLength={5} onChange={event => changeTime('end_time', event.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span className="form-label">ทำซ้ำทุกสัปดาห์</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {SCHEDULE_DAYS.map(day => (
                        <label key={day.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                          <input type="checkbox" checked={draft.days.includes(day.value)} onChange={event => setDraft({ ...draft, days: event.target.checked ? [...draft.days, day.value].sort() : draft.days.filter(value => value !== day.value) })} />
                          {day.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span className="form-label" style={{ margin: 0 }}>ครูที่เข้าร่วม {draft.teacherIds.length} คน</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, teacherIds: data.teachers.map(teacher => teacher.id) })}>เลือกทั้งหมด</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, teacherIds: [] })}>ล้าง</button>
                      </div>
                    </div>
                    <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                      {data.teachers.map(teacher => (
                        <label key={teacher.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, minWidth: 0 }}>
                          <input type="checkbox" checked={draft.teacherIds.includes(teacher.id)} onChange={event => setDraft({ ...draft, teacherIds: event.target.checked ? [...draft.teacherIds, teacher.id] : draft.teacherIds.filter(id => id !== teacher.id) })} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name(teacher.id)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                {conflicts.length > 0 ? (
                  <div className="alert alert-error" role="alert" style={{ marginTop: 14 }}>
                    <strong>ครูติดสอนหรือกิจกรรมในเวลานี้</strong>
                    <ul style={{ margin: '8px 0' }}>{conflicts.slice(0, 12).map((conflict, index) => <li key={index}>{name(conflict.teacherId)} · {SCHEDULE_DAYS.find(day => day.value === conflict.day)?.label} {conflict.start_time}–{conflict.end_time} · {conflict.label}</li>)}</ul>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onFix}>ไปจัดตารางเรียน</button>
                  </div>
                ) : null}
                {error ? <div className="alert alert-error" role="alert" style={{ marginTop: 14 }}>{error}</div> : null}
                {validation ? <p className="alert alert-error" role="status" style={{ marginTop: 14 }}>{validation}</p> : null}
                <p style={{ margin: '14px 0 0', color: 'var(--text-3)', fontSize: 13 }}>
                  แสดงเฉพาะตารางสอนครูและ PDF รวมช่องพักถ้าเวลาตรงคาบพัก · ไม่เพิ่มคาบนักเรียน · ระบบจัดรายวิชาหลบเวลานี้
                </p>
                <div className="form-actions" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <button type="button" className="btn btn-secondary" onClick={closeDraft}>ยกเลิก</button>
                  <button type="button" className="btn btn-primary" disabled={!!validation || conflicts.length > 0} onClick={() => void save()}>บันทึกกิจกรรมครู</button>
                </div>
              </fieldset>
            </div>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <section aria-label="จัดการกิจกรรมครู">
      <div className="prep-review-actions">
        <div>
          <h2>กิจกรรมครู</h2>
          <p>PLC ประชุม เวรดูแล หรือภารกิจช่วงพัก เช่น ขายของสหกรณ์ตอนพักเที่ยง · ใส่เวลาให้ตรงคาบพัก แล้วตารางสอนครูจะแสดงชื่องานในช่องนั้น</p>
        </div>
        {!draft && <button type="button" className="prep-primary" disabled={blocked || busy} onClick={() => open()}>+ เพิ่มกิจกรรมครู</button>}
      </div>
      {blocked && <p className="prep-notice">บันทึกข้อมูลหรือเวลาเรียนที่แก้ไขก่อนเพิ่มกิจกรรมครู</p>}
      {draft && (
        <fieldset disabled={busy || blocked} className="schedule-teacher-activity-form">
          <legend>{activities.some(activity => activity.id === draft.id) ? 'แก้ไขกิจกรรมครู' : 'เพิ่มกิจกรรมครู'}</legend>
          <div className="schedule-teacher-activity-fields">
            <label className="full">ชื่อกิจกรรม<input value={draft.name} maxLength={150} placeholder="เช่น ขายของสหกรณ์ / PLC กลุ่มสาระ" onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>เริ่ม (24 ชั่วโมง)<input value={draft.start_time} placeholder="15:30" inputMode="text" maxLength={5} onChange={event => changeTime('start_time', event.target.value)} /></label>
            <label>สิ้นสุด (24 ชั่วโมง)<input value={draft.end_time} placeholder="16:30" inputMode="text" maxLength={5} onChange={event => changeTime('end_time', event.target.value)} /></label>
          </div>
          <div>
            <strong>ทำซ้ำทุกสัปดาห์</strong>
            <div className="prep-checks">{SCHEDULE_DAYS.map(day => <label key={day.value}><input type="checkbox" checked={draft.days.includes(day.value)} onChange={event => setDraft({ ...draft, days: event.target.checked ? [...draft.days, day.value].sort() : draft.days.filter(value => value !== day.value) })} />{day.label}</label>)}</div>
          </div>
          <div>
            <strong>ครูที่เข้าร่วม {draft.teacherIds.length} คน</strong>
            <div className="prep-checks">
              <button type="button" onClick={() => setDraft({ ...draft, teacherIds: data.teachers.map(teacher => teacher.id) })}>เลือกครูทั้งหมด</button>
              <button type="button" onClick={() => setDraft({ ...draft, teacherIds: [] })}>ล้างการเลือกครู</button>
            </div>
            <div className="schedule-teacher-activity-staff">{data.teachers.map(teacher => <label key={teacher.id}><input type="checkbox" checked={draft.teacherIds.includes(teacher.id)} onChange={event => setDraft({ ...draft, teacherIds: event.target.checked ? [...draft.teacherIds, teacher.id] : draft.teacherIds.filter(id => id !== teacher.id) })} />{name(teacher.id)}</label>)}</div>
          </div>
          {conflicts.length > 0 && (
            <div className="prep-error" role="alert">
              <strong>ครูติดสอนหรือกิจกรรมในเวลานี้</strong>
              <ul>{conflicts.slice(0, 12).map((conflict, index) => <li key={index}>{name(conflict.teacherId)} · {SCHEDULE_DAYS.find(day => day.value === conflict.day)?.label} {conflict.start_time}–{conflict.end_time} · {conflict.label}</li>)}</ul>
              <p>ปรับวัน เวลา หรือครูที่เข้าร่วม หรือย้ายคาบเดิมที่ชนก่อนบันทึก</p>
              <button type="button" onClick={onFix}>ไปภาระสอน / ล็อกคาบ</button>
            </div>
          )}
          {validation && <p className="prep-notice" role="status">{validation}</p>}
          <p className="schedule-teacher-activity-note">แสดงเฉพาะตารางสอนครูและ PDF ครู รวมช่องพักเที่ยงถ้าระบุเวลาตรงกับคาบพัก · ไม่เพิ่มคาบนักเรียน · ระบบจัดรายวิชาหลบเวลานี้ · สรุปเวลากิจกรรมแยกจากคาบสอน</p>
          <div className="prep-review-actions">
            <button type="button" onClick={closeDraft}>ยกเลิก</button>
            <button type="button" className="prep-primary" disabled={!!validation || conflicts.length > 0} onClick={() => void save()}>บันทึกกิจกรรมครู</button>
          </div>
        </fieldset>
      )}
      {error && <p className="prep-error" role="alert">{error}</p>}
      {message && <p className="prep-success" role="status">{message}</p>}
      <div className="schedule-teacher-activity-list">
        {activities.map(activity => (
          <article key={activity.id} className="schedule-teacher-activity-item">
            <div>
              <strong>{activity.name}</strong>
              <p>{activity.days.map(day => SCHEDULE_DAYS.find(item => item.value === day)?.label).join(' / ')} · {activity.start_time}–{activity.end_time}</p>
              <p>{activity.teacherIds.map(name).join(', ')}</p>
              <small className="schedule-teacher-activity-hours">{teacherActivityMinutes([activity], activity.teacherIds[0])} นาที/สัปดาห์ต่อคน · แยกจากคาบสอน</small>
            </div>
            <div className="actions">
              <button type="button" disabled={blocked || busy || !!draft} onClick={() => open(activity)}>แก้ไข</button>
              <button type="button" disabled={blocked || busy || !!draft} onClick={() => void save(activity)}>ลบ</button>
            </div>
          </article>
        ))}
      </div>
      {!activities.length && !draft && <p className="prep-notice">ยังไม่มีกิจกรรมครู กดเพิ่มกิจกรรมเพื่อกำหนดวัน เวลา และรายชื่อครูที่เข้าร่วม</p>}
    </section>
  )
}
