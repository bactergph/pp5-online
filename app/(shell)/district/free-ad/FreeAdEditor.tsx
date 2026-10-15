'use client'

import { useState } from 'react'
import { saveFreeScheduleAd } from './actions'
import { bangkokToday, freeAdIsLive, safeHttpUrl, type FreeScheduleAd } from '@/lib/free-schedule-ad-window'

export default function FreeAdEditor({ initial, loadError }: { initial: FreeScheduleAd; loadError?: string }) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(loadError || '')
  const [error, setError] = useState(Boolean(loadError))
  const href = safeHttpUrl(draft.href)
  const image = safeHttpUrl(draft.imageUrl)
  const live = freeAdIsLive(draft)

  async function save(next: FreeScheduleAd) {
    setSaving(true)
    setMessage('')
    const result = await saveFreeScheduleAd(next)
    setSaving(false)
    if (result.error) {
      setError(true)
      setMessage(result.error)
      return
    }
    setDraft(next)
    setError(false)
    setMessage('บันทึกโฆษณาแล้ว สมาชิกจะเห็นบนหน้าจัดตารางฟรีเมื่อวันนี้ตรงกับช่วงที่กำหนด')
  }

  return (
    <section className="data-card" style={{ display: 'grid', gap: 16, padding: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>โฆษณาตารางฟรี</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-3)' }}>ตั้งชื่อ ลิงก์ รูป และช่วงวันที่ สมาชิกเห็นโฆษณานี้บนหน้าจัดตารางฟรีเฉพาะวันที่อยู่ในช่วง</p>
      </div>
      {live ? (
        href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, border: '1px solid var(--border)', borderRadius: 12, color: 'inherit', textDecoration: 'none' }}>
            {image && <img src={image} alt={draft.title || 'โฆษณา'} style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 8 }} />}
            <span><small style={{ display: 'block', color: 'var(--text-3)' }}>กำลังแสดงวันนี้</small><strong>{draft.title || href}</strong></span>
          </a>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, border: '1px solid var(--border)', borderRadius: 12 }}>
            {image && <img src={image} alt={draft.title || 'โฆษณา'} style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 8 }} />}
            <span><small style={{ display: 'block', color: 'var(--text-3)' }}>กำลังแสดงวันนี้</small><strong>{draft.title || 'โฆษณา'}</strong></span>
          </div>
        )
      ) : <p style={{ margin: 0, color: 'var(--text-3)' }}>วันนี้ {bangkokToday()} ยังไม่อยู่ในช่วงแสดง ช่องบนหน้าจัดตารางฟรีจึงว่าง</p>}
      <form
        onSubmit={event => { event.preventDefault(); void save(draft) }}
        style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        <input className="form-input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="ชื่อโฆษณา" aria-label="ชื่อโฆษณา" />
        <input className="form-input" value={draft.href} onChange={event => setDraft({ ...draft, href: event.target.value })} placeholder="https://ลิงก์โฆษณา" aria-label="ลิงก์โฆษณา" />
        <input className="form-input" value={draft.imageUrl} onChange={event => setDraft({ ...draft, imageUrl: event.target.value })} placeholder="https://ลิงก์รูป" aria-label="ลิงก์รูปโฆษณา" />
        <input className="form-input" type="date" value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} aria-label="วันเริ่มแสดงโฆษณา" />
        <input className="form-input" type="date" value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} aria-label="วันสิ้นสุดโฆษณา" />
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึกโฆษณา'}</button>
        <button className="btn" type="button" disabled={saving} onClick={() => void save({ title: '', href: '', imageUrl: '', start: '', end: '' })}>ล้างโฆษณา</button>
      </form>
      {message && <p role="status" style={{ margin: 0, fontWeight: 700, color: error ? '#be123c' : '#246344' }}>{message}</p>}
    </section>
  )
}
