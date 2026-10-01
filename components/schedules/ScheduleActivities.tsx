'use client'
import { useEffect, useState } from 'react'
import { fetchScheduleActivities, saveScheduleActivity } from '@/app/schedules/actions'
import { LEARNER_DEVELOPMENT_KEY, LEARNER_DEVELOPMENT_NAME } from '@/lib/schedule-activity'

export default function ScheduleActivities({ yearId, classroomId, onSaved, disabled, onBusy }: {
  yearId: string; classroomId: string; onSaved: () => Promise<void>; disabled: boolean; onBusy: (busy: boolean) => void
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchScheduleActivities>> | null>(null)
  const [setting, setSetting] = useState(LEARNER_DEVELOPMENT_KEY)
  const [teacher, setTeacher] = useState('')
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    fetchScheduleActivities(yearId, classroomId).then(d => {
      if (cancelled) return
      const existing = d.offerings.find(a => a.evaluation_setting_id === null)
      setData(d); setSetting(LEARNER_DEVELOPMENT_KEY); setTeacher(existing?.teacher_id || ''); setCount(existing?.weekly_periods ?? 1)
    }).catch(e => { if (!cancelled) setMessage(e.message) })
    return () => { cancelled = true }
  }, [yearId, classroomId])
  function selectActivity(id: string) {
    setSetting(id)
    const existing = data?.offerings.find(a => a.evaluation_setting_id === (id === LEARNER_DEVELOPMENT_KEY ? null : id))
    setTeacher(existing?.teacher_id || '')
    setCount(existing?.weekly_periods ?? 1)
  }
  async function save() {
    setBusy(true); onBusy(true); setMessage('')
    try {
      await saveScheduleActivity(yearId, classroomId, setting, teacher, count)
      setData(await fetchScheduleActivities(yearId, classroomId))
      await onSaved(); setMessage('เพิ่มวิชาในรายการแล้ว เลือกลงช่องตารางเรียนด้านล่างได้ทันที หรือใช้จัดตารางอัตโนมัติ')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false); onBusy(false) }
  }
  const legacy = data?.offerings.filter(a => a.evaluation_setting_id !== null) || []
  const configured = data?.offerings.some(a => a.evaluation_setting_id === null)
  return <section className="control-card" aria-label={LEARNER_DEVELOPMENT_NAME}>
    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{LEARNER_DEVELOPMENT_NAME}</h3>
    <p>เพิ่มเป็นหนึ่งวิชาในตารางเรียน กำหนดครูผู้สอนและจำนวนคาบต่อสัปดาห์ แล้วเลือกวิชานี้ลงคาบได้เหมือนรายวิชาอื่น</p>
    <fieldset disabled={disabled || busy || !data} style={{ border: 0, padding: 0, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {legacy.length > 0 && <label>รายการที่ตั้งค่า<select className="form-input" value={setting} onChange={e => selectActivity(e.target.value)}>
        <option value={LEARNER_DEVELOPMENT_KEY}>{LEARNER_DEVELOPMENT_NAME} (รวมเป็นวิชาเดียว)</option>
        {legacy.map(a => <option key={a.id} value={a.evaluation_setting_id!}>รายการเดิม: {data?.settings.find(s => s.id === a.evaluation_setting_id)?.label || 'กิจกรรม'}</option>)}
      </select></label>}
      <label>ครูผู้สอน<select className="form-input" value={teacher} onChange={e => setTeacher(e.target.value)}>
        <option value="">— เลือกครูผู้สอน —</option>
        {data?.teachers.map(t => <option key={t.id} value={t.id}>{t.prefix} {t.full_name}</option>)}
      </select></label>
      <label>คาบ/สัปดาห์<input className="form-input" type="number" min={0} max={30} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
      <button className="btn btn-primary" type="button" disabled={!teacher} onClick={save}>{busy ? 'กำลังบันทึก...' : configured || setting !== LEARNER_DEVELOPMENT_KEY ? 'บันทึกการตั้งค่า' : 'เพิ่มวิชาในตารางเรียน'}</button>
    </fieldset>
    {!!data?.offerings.length && <ul>{data.offerings.map(a => <li key={a.id}>{a.evaluation_setting_id === null ? LEARNER_DEVELOPMENT_NAME : data.settings.find(s => s.id === a.evaluation_setting_id)?.label || 'กิจกรรมเดิม'} · {data.teachers.find(t => t.id === a.teacher_id)?.full_name || 'ครูเดิม'} · {a.weekly_periods} คาบ/สัปดาห์</li>)}</ul>}
    {legacy.some(a => a.weekly_periods > 0) && <p>หากใช้วิชารวมแทนกิจกรรมเดิม ให้นำคาบเดิมออกแล้วตั้งคาบรายกิจกรรมเป็น 0 เพื่อไม่นับซ้ำในการจัดอัตโนมัติ</p>}
    {message && <p role="status">{message}</p>}
  </section>
}
