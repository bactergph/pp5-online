'use client'
import { useEffect, useState } from 'react'
import { fetchScheduleActivities, saveScheduleActivity } from '@/app/schedules/actions'

export default function ScheduleActivities({ yearId, classroomId, onSaved, disabled, onBusy }: {
  yearId: string; classroomId: string; onSaved: () => Promise<void>; disabled: boolean; onBusy: (busy: boolean) => void
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchScheduleActivities>> | null>(null)
  const [setting, setSetting] = useState('')
  const [teacher, setTeacher] = useState('')
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let cancelled = false
    fetchScheduleActivities(yearId, classroomId).then(d => {
      if (cancelled) return
      const id = d.settings[0]?.id || ''
      const existing = d.offerings.find(a => a.evaluation_setting_id === id)
      setData(d); setSetting(id); setTeacher(existing?.teacher_id || d.teachers[0]?.id || ''); setCount(existing?.weekly_periods ?? 1)
    }).catch(e => { if (!cancelled) setMessage(e.message) })
    return () => { cancelled = true }
  }, [yearId, classroomId])
  function selectActivity(id: string) {
    setSetting(id)
    const existing = data?.offerings.find(a => a.evaluation_setting_id === id)
    setTeacher(existing?.teacher_id || data?.teachers[0]?.id || '')
    setCount(existing?.weekly_periods ?? 1)
  }
  async function save() {
    setBusy(true); onBusy(true); setMessage('')
    try {
      await saveScheduleActivity(yearId, classroomId, setting, teacher, count)
      setData(await fetchScheduleActivities(yearId, classroomId))
      await onSaved(); setMessage('บันทึกกิจกรรมแล้ว เลือกลงคาบหรือจัดตารางอัตโนมัติได้')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false); onBusy(false) }
  }
  return <details className="control-card">
    <summary style={{ cursor: 'pointer', fontWeight: 800 }}>กิจกรรมพัฒนาผู้เรียน — กำหนดครูและคาบต่อสัปดาห์</summary>
    <p>เลือกกิจกรรมของโรงเรียน กำหนดครูผู้รับผิดชอบก่อนลงตาราง ตั้ง 0 คาบสำหรับกิจกรรมที่ไม่ได้จัดทุกสัปดาห์</p>
    <fieldset disabled={disabled || busy || !data} style={{ border: 0, padding: 0, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <label>กิจกรรม<select className="form-input" value={setting} onChange={e => selectActivity(e.target.value)}>
        {data?.settings.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select></label>
      <label>ครูผู้รับผิดชอบ<select className="form-input" value={teacher} onChange={e => setTeacher(e.target.value)}>
        {data?.teachers.map(t => <option key={t.id} value={t.id}>{t.prefix} {t.full_name}</option>)}
      </select></label>
      <label>คาบ/สัปดาห์<input className="form-input" type="number" min={0} max={30} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
      <button className="btn btn-primary" type="button" disabled={!setting || !teacher} onClick={save}>{busy ? 'กำลังบันทึก...' : 'บันทึกกิจกรรมของห้องนี้'}</button>
    </fieldset>
    {data && !data.settings.length && <p>ยังไม่มีกิจกรรมเปิดใช้งานในตั้งค่ากิจกรรมพัฒนาผู้เรียน</p>}
    {!!data?.offerings.length && <ul>{data.offerings.map(a => <li key={a.id}>{data.settings.find(s => s.id === a.evaluation_setting_id)?.label || 'กิจกรรม'} · {data.teachers.find(t => t.id === a.teacher_id)?.full_name || 'ครูเดิม'} · {a.weekly_periods} คาบ/สัปดาห์</li>)}</ul>}
    {message && <p role="status">{message}</p>}
  </details>
}
